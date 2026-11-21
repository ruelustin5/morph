// Pure merge functions for live collaboration.
//
// A slide is { page, anim }. Changes are described as "ops" between two versions:
//   page ops: { page: {attr: v}, set: {id: {attr: v}}, add: [{el, parent, after}], del: [id], order: {parent: [ids]} }
//   anim ops: { set: {"id|kind": v}, del: ["id|kind"] }
// Merging = applying my pending ops on top of the latest remote version, attribute by attribute
// (last writer wins per attribute, so two people editing different things never overwrite each other).

export const ROOT = '$root';
export const DEL = { __del: 1 };
const isDel = (v) => v && typeof v === 'object' && v.__del === 1;

/** Attributes that only matter on one screen (edit mode, names shown in the layer list, ...). */
export const localOnly = (k) => k[0] === '_' || k === 'name';

// Deep copy that shares strings (images are long data URLs; copying them would be slow).
export function clone(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(clone);
  const o = {};
  for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = clone(v[k]);
  return o;
}

function numEq(a, b, tol) { return Math.abs(a - b) <= tol; }

/** Value equality with tolerances that stop measurement noise from bouncing between screens. */
export function same(a, b, key, type) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    if (key === 'height' && type === 'text') return numEq(a, b, 1.5);
    return numEq(a, b, 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)));
  }
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function index(page) {
  const map = new Map(); // id -> { el, parent }
  const kids = new Map(); // parentKey -> [ids]
  const walk = (children, parentKey) => {
    const ids = [];
    for (const el of children || []) {
      if (!el || !el.id) continue;
      map.set(el.id, { el, parent: parentKey });
      ids.push(el.id);
      if (el.type === 'group') walk(el.children, el.id);
    }
    kids.set(parentKey, ids);
  };
  walk(page && page.children, ROOT);
  return { map, kids };
}

function subtreeIds(el, out = new Set()) {
  out.add(el.id);
  if (el.children) for (const c of el.children) subtreeIds(c, out);
  return out;
}

export function diffPage(a, b) {
  const ops = { page: {}, set: {}, add: [], del: [], order: {} };
  const A = a || { children: [] }, B = b || { children: [] };
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (k === 'children' || k === 'id' || localOnly(k)) continue;
    if (!same(A[k], B[k], k, 'page')) ops.page[k] = k in B ? clone(B[k]) : DEL;
  }
  const ia = index(A), ib = index(B);
  for (const id of ia.map.keys()) if (!ib.map.has(id)) ops.del.push(id);
  for (const [id, { el, parent }] of ib.map) {
    const prev = ia.map.get(id);
    if (!prev || prev.el.type !== el.type) {
      if (prev) ops.del.push(id);
      // Only top-most new nodes (a new group carries its whole subtree).
      if (parent === ROOT || ia.map.has(parent)) {
        const siblings = ib.kids.get(parent) || [];
        const pos = siblings.indexOf(id);
        ops.add.push({ el: clone(el), parent, after: pos > 0 ? siblings[pos - 1] : null });
      }
      continue;
    }
    const attrs = {};
    let any = false;
    for (const k of new Set([...Object.keys(prev.el), ...Object.keys(el)])) {
      if (k === 'children' || k === 'id' || localOnly(k)) continue;
      if (!same(prev.el[k], el[k], k, el.type)) { attrs[k] = k in el ? clone(el[k]) : DEL; any = true; }
    }
    if (any) ops.set[id] = attrs;
  }
  for (const [parent, ids] of ib.kids) {
    if (parent !== ROOT && !ia.map.has(parent)) continue;
    const before = ia.kids.get(parent) || [];
    if (before.length !== ids.length || before.some((x, i) => x !== ids[i])) ops.order[parent] = ids.slice();
  }
  return ops;
}

export function pageOpsEmpty(o) {
  return !o || (!Object.keys(o.page).length && !Object.keys(o.set).length && !o.add.length && !o.del.length && !Object.keys(o.order).length);
}

// --- mutable helpers on a cloned page ---------------------------------------
function findWithParent(container, id) {
  const list = container.children || [];
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.id === id) return { el, parent: container, i };
    if (el.type === 'group') { const r = findWithParent(el, id); if (r) return r; }
  }
  return null;
}
function detach(page, id) {
  const r = findWithParent(page, id);
  if (!r) return null;
  r.parent.children.splice(r.i, 1);
  return r.el;
}
function containerOf(page, key) {
  if (key === ROOT) return page;
  const r = findWithParent(page, key);
  return r && r.el.type === 'group' ? r.el : null;
}

export function applyPageOps(page, ops) {
  const p = clone(page || { children: [] });
  p.children = p.children || [];
  if (!ops) return p;
  for (const [k, v] of Object.entries(ops.page || {})) { if (isDel(v)) delete p[k]; else p[k] = clone(v); }
  for (const add of ops.add || []) {
    const ids = subtreeIds(add.el);
    for (const id of ids) detach(p, id);
    const parent = containerOf(p, add.parent) || p;
    parent.children = parent.children || [];
    let at = parent.children.length;
    if (add.after === null) at = 0;
    else { const i = parent.children.findIndex((c) => c.id === add.after); if (i >= 0) at = i + 1; }
    parent.children.splice(at, 0, clone(add.el));
  }
  for (const [key, ids] of Object.entries(ops.order || {})) {
    const parent = containerOf(p, key);
    if (!parent) continue;
    const current = (parent.children || []).map((c) => c.id);
    const listed = [];
    for (const id of ids) { const el = detach(p, id); if (el) listed.push(el); }
    const result = listed.slice();
    // Keep children that the op did not mention near their previous neighbour.
    const remaining = (parent.children || []).slice();
    const listedIds = new Set(ids);
    for (const el of remaining) {
      const pos = current.indexOf(el.id);
      const hasNextListed = current.slice(pos + 1).some((x) => listedIds.has(x));
      let at = result.length; // nothing listed after it: it stays on top
      if (hasNextListed) {
        at = 0;
        for (let j = pos - 1; j >= 0; j--) { const k = result.findIndex((r) => r.id === current[j]); if (k >= 0) { at = k + 1; break; } }
      }
      result.splice(at, 0, el);
    }
    parent.children = result;
  }
  for (const [id, attrs] of Object.entries(ops.set || {})) {
    const r = findWithParent(p, id);
    if (!r) continue;
    for (const [k, v] of Object.entries(attrs)) { if (isDel(v)) delete r.el[k]; else r.el[k] = clone(v); }
  }
  for (const id of ops.del || []) detach(p, id);
  return p;
}

// --- flat maps (animation settings, object names) ----------------------------
export function flattenAnim(anim) {
  const out = {};
  for (const [id, kinds] of Object.entries(anim || {})) for (const [kind, v] of Object.entries(kinds || {})) out[id + '|' + kind] = v;
  return out;
}
export function unflattenAnim(flat) {
  const out = {};
  for (const [key, v] of Object.entries(flat)) { const i = key.lastIndexOf('|'); const id = key.slice(0, i), kind = key.slice(i + 1); (out[id] = out[id] || {})[kind] = v; }
  return out;
}
export function diffMap(a, b) {
  const ops = { set: {}, del: [] };
  for (const k of Object.keys(a || {})) if (!(k in (b || {}))) ops.del.push(k);
  for (const [k, v] of Object.entries(b || {})) if (!same((a || {})[k], v, k)) ops.set[k] = clone(v);
  return ops;
}
export function applyMap(m, ops) {
  const out = { ...(m || {}) };
  if (!ops) return out;
  for (const k of ops.del || []) delete out[k];
  for (const [k, v] of Object.entries(ops.set || {})) out[k] = clone(v);
  return out;
}
export const mapOpsEmpty = (o) => !o || (!Object.keys(o.set).length && !o.del.length);

// --- slide state --------------------------------------------------------------
export function diffSlide(a, b) {
  return { page: diffPage(a.page, b.page), anim: diffMap(flattenAnim(a.anim), flattenAnim(b.anim)) };
}
export function applySlide(s, ops) {
  return { page: applyPageOps(s.page, ops.page), anim: unflattenAnim(applyMap(flattenAnim(s.anim), ops.anim)) };
}
export const slideOpsEmpty = (o) => pageOpsEmpty(o.page) && mapOpsEmpty(o.anim);

// --- ordered list of slide ids --------------------------------------------------
export function diffList(base, local) {
  const ins = [], del = [];
  const inLocal = new Set(local);
  const pred = new Map();
  base.forEach((id, i) => pred.set(id, i ? base[i - 1] : null));
  for (const id of base) if (!inLocal.has(id)) del.push(id);
  local.forEach((id, i) => {
    const p = i ? local[i - 1] : null;
    if (!pred.has(id)) ins.push({ id, after: p });
    else if (pred.get(id) !== p) { del.push(id); ins.push({ id, after: p }); }
  });
  return { ins, del };
}
export function applyList(list, ops) {
  if (!ops) return list.slice();
  const insIds = new Set(ops.ins.map((x) => x.id));
  const dels = new Set(ops.del);
  const out = list.filter((id) => !dels.has(id) && !insIds.has(id));
  for (const { id, after } of ops.ins) {
    let at = out.length;
    if (after === null) at = 0;
    else { const i = out.indexOf(after); if (i >= 0) at = i + 1; }
    out.splice(at, 0, id);
  }
  return out;
}
export const listOpsEmpty = (o) => !o || (!o.ins.length && !o.del.length);

// --- project-level data (slide order, title, size, fonts, object names) ---------
const META_FIELDS = ['title', 'width', 'height', 'fonts'];
export function diffMeta(a, b) {
  const fields = {};
  for (const k of META_FIELDS) if (!same(a[k], b[k], k)) fields[k] = clone(b[k]);
  return { order: diffList(a.order || [], b.order || []), fields, objects: diffMap(a.objects || {}, b.objects || {}) };
}
export function applyMeta(m, ops) {
  const out = { ...m };
  out.order = applyList(m.order || [], ops.order);
  for (const [k, v] of Object.entries(ops.fields || {})) out[k] = clone(v);
  out.objects = applyMap(m.objects || {}, ops.objects);
  return out;
}
export const metaOpsEmpty = (o) => listOpsEmpty(o.order) && !Object.keys(o.fields).length && mapOpsEmpty(o.objects);

/** Two objects must never share a name: deterministic fix every screen computes identically. */
export function dedupeNames(objects) {
  const byName = new Map();
  for (const id of Object.keys(objects).sort()) {
    const n = objects[id] && objects[id].name;
    if (!n) continue;
    if (!byName.has(n.toUpperCase())) { byName.set(n.toUpperCase(), id); continue; }
    objects[id] = { ...objects[id], name: (n + '-' + id.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9_-]/g, '') };
  }
  return objects;
}
