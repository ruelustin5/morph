// Project model: slides (editor page JSON), the object-name registry and per-object animation settings.
//
// Animation model (robust to slide reordering):
//   slide.anim[objectId].enter = { type, duration, easing }  -> how the object ARRIVES on this slide.
//       If the object is on the previous slide this is a morph (type ignored, duration/easing used);
//       otherwise it is an intro (type none|fade) using the very same duration/easing.
//   slide.anim[objectId].exit  = { type, duration, easing }  -> used only when the object is NOT on the next slide.
//   The "transition to next slide" shown on slide i is literally slide i+1's enter settings (connected).
// Because settings are stored on the slide where the object arrives, moving slides around and back
// never loses anything.
import { nanoid } from 'nanoid';
import { flattenPage } from './render';
import { DEFAULT_ANIM, animOf } from './player';

export { DEFAULT_ANIM, animOf };

export const newId = () => nanoid(10);

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function makeName(taken) {
  for (let i = 0; i < 5000; i++) {
    const digits = 1 + Math.floor(Math.random() * 3);
    const num = Math.floor(Math.random() * Math.pow(10, digits));
    const name = LETTERS[Math.floor(Math.random() * LETTERS.length)] + (digits > 1 ? Math.max(num, Math.pow(10, digits - 1)) : num);
    if (!taken.has(name)) return name;
  }
  return ('X' + Date.now().toString(36)).toUpperCase();
}

export function blankPage() {
  return { id: newId(), children: [], width: 'auto', height: 'auto', background: 'white', bleed: 0, duration: 5000 };
}

export function leafMap(page) {
  const m = new Map();
  for (const el of flattenPage(page)) m.set(el.id, el);
  return m;
}

/** All leaf ids (including hidden ones) — used for naming. */
export function allLeafIds(page, out = new Set()) {
  const walk = (ch) => { for (const el of ch || []) { if (el.type === 'group') walk(el.children); else out.add(el.id); } };
  walk(page && page.children);
  return out;
}

export function findRaw(page, id) {
  let found = null;
  const walk = (ch) => { for (const el of ch || []) { if (el.id === id) { found = el; return true; } if (el.children && walk(el.children)) return true; } return false; };
  walk(page && page.children);
  return found;
}

/** IDs are case-insensitive: stored in capitals, letters, digits, - and _ only. */
export function normalizeId(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
}

export function nameTaken(project) {
  return new Set(Object.values(project.objects || {}).map((o) => String(o.name || '').toUpperCase()));
}

/** Upper-case every ID and make sure no two objects share one (deterministic). */
export function normalizeRegistry(project) {
  const objs = project.objects || {};
  let changed = false;
  for (const id of Object.keys(objs)) {
    const n = normalizeId(objs[id] && objs[id].name) || null;
    if (n && n !== objs[id].name) { objs[id] = { ...objs[id], name: n }; changed = true; }
  }
  const seen = new Map();
  for (const id of Object.keys(objs).sort()) {
    const n = objs[id].name;
    if (!n) continue;
    if (!seen.has(n)) { seen.set(n, id); continue; }
    objs[id] = { ...objs[id], name: (n + '-' + id.slice(0, 3).toUpperCase()).replace(/[^A-Z0-9_-]/g, '') };
    changed = true;
  }
  return changed;
}

/** Give fresh ids (and IDs) to objects of a page, in place. Returns map oldId -> newId. */
export function freshIds(page, project, only = null) {
  const map = new Map();
  const taken = nameTaken(project);
  const walk = (ch) => {
    for (const el of ch || []) {
      if (el.type === 'group') { el.id = newId(); walk(el.children); continue; }
      if (only && !only(el.id)) continue;
      const nid = newId();
      const was = project.objects[el.id];
      map.set(el.id, nid);
      el.id = nid;
      const name = makeName(taken); taken.add(name);
      el.name = name;
      // An object that never links in duplicates keeps that setting in its copies.
      project.objects[nid] = was && was.fresh ? { name, fresh: true } : { name };
    }
  };
  walk(page.children);
  return map;
}

export function remapAnim(anim, map) {
  const out = {};
  for (const [id, v] of Object.entries(anim || {})) out[map.has(id) ? map.get(id) : id] = deepClone(v);
  return out;
}

/** Give every leaf object a name; returns ids that were newly named. */
export function ensureNames(project) {
  project.objects = project.objects || {};
  const taken = nameTaken(project);
  const fresh = [];
  for (const s of project.slides) {
    for (const id of allLeafIds(s.page)) {
      if (!project.objects[id]) {
        const name = makeName(taken);
        taken.add(name);
        project.objects[id] = { name };
        fresh.push(id);
      }
    }
  }
  return fresh;
}

export function nameOf(project, id) {
  return (project.objects && project.objects[id] && project.objects[id].name) || id;
}

export function idByName(project, name) {
  const n = normalizeId(name);
  if (!n) return null;
  for (const [id, o] of Object.entries(project.objects || {})) if (String(o.name || '').toUpperCase() === n) return id;
  return null;
}

/** Remove registry entries for ids that no longer exist anywhere. */
export function pruneRegistry(project) {
  const used = new Set();
  for (const s of project.slides) allLeafIds(s.page, used);
  for (const id of Object.keys(project.objects || {})) if (!used.has(id)) delete project.objects[id];
  for (const s of project.slides) if (s.anim) for (const id of Object.keys(s.anim)) if (!used.has(id)) delete s.anim[id];
}

export function setAnim(slide, id, kind, patch) {
  slide.anim = slide.anim || {};
  const cur = slide.anim[id] || {};
  cur[kind] = { ...DEFAULT_ANIM, ...(cur[kind] || {}), ...patch };
  slide.anim[id] = { ...cur };
}

export function slideHas(project, index, id) {
  const s = project.slides[index];
  return !!s && leafMap(s.page).has(id);
}

/** Nearest earlier slide that contains this object (or -1). */
export function nearestPrevWith(project, index, id) {
  for (let i = index - 1; i >= 0; i--) if (findRaw(project.slides[i].page, id)) return i;
  return -1;
}

export function deepClone(o) {
  return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o));
}

/**
 * Duplicate slide: same object ids (so they stay linked), new page id.
 * Objects whose "link copies" switch is off, or every object with { unlinked: true }, get new ids.
 */
export function duplicateSlideData(slide, project, { unlinked = false } = {}) {
  const copy = deepClone(slide);
  copy.page.id = newId();
  copy.id = copy.page.id;
  if (project) {
    const map = freshIds(copy.page, project, unlinked ? null : (id) => !!(project.objects[id] && project.objects[id].fresh));
    copy.anim = remapAnim(copy.anim, map);
  } else {
    const walk = (ch) => { for (const el of ch || []) if (el.type === 'group') { el.id = newId(); walk(el.children); } };
    walk(copy.page.children);
  }
  return copy;
}

/** Replace an element id inside a page JSON (in place). */
export function replaceIdInPage(page, oldId, nid) {
  const el = findRaw(page, oldId);
  if (el) el.id = nid;
  return !!el;
}

/** Element props copied by "reset to its look in slide N". */
export function stateProps(el) {
  const out = {};
  for (const [k, v] of Object.entries(el)) {
    if (['id', 'type', 'name', 'children', 'animations', 'custom', '_editModeEnabled', 'locked'].includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export function demoProject() {
  const W = 1920, H = 1080;
  const ids = { title: newId(), dot: newId(), sub: newId(), card: newId(), line: newId() };
  const font = 'Roboto';
  const s1 = {
    id: newId(), anim: { [ids.sub]: { exit: { type: 'fade', duration: 0.4, easing: 'ease-out' } } },
    page: { ...blankPage(), background: '#0f1729', children: [
      { id: ids.dot, type: 'figure', subType: 'circle', x: 1380, y: 300, width: 220, height: 220, fill: '#4c90f0', strokeWidth: 0, stroke: '#ffffff', cornerRadius: 0 },
      { id: ids.title, type: 'text', text: 'Morph slides', x: 200, y: 380, width: 1000, height: 154, fontSize: 128, fontFamily: font, fontWeight: 'bold', fill: '#ffffff', align: 'left', lineHeight: 1.2 },
      { id: ids.sub, type: 'text', text: 'Same object on two slides = it moves between them.', x: 204, y: 560, width: 1000, height: 58, fontSize: 40, fontFamily: font, fill: '#9fb3d1', align: 'left', lineHeight: 1.2 },
    ] },
  };
  s1.id = s1.page.id;
  const s2 = {
    id: newId(), anim: {
      [ids.dot]: { enter: { type: 'none', duration: 0.9, easing: 'ease-in-out' } },
      [ids.title]: { enter: { type: 'none', duration: 0.7, easing: 'ease-out' } },
      [ids.card]: { enter: { type: 'fade', duration: 0.6, easing: 'ease-out' } },
      [ids.line]: { enter: { type: 'fade', duration: 0.6, easing: 'ease-out' } },
    },
    page: { ...blankPage(), background: '#0f1729', children: [
      { id: ids.dot, type: 'figure', subType: 'circle', x: -260, y: 140, width: 900, height: 900, fill: '#2d72d2', strokeWidth: 0, stroke: '#ffffff', cornerRadius: 0 },
      { id: ids.title, type: 'text', text: 'Morph slides', x: 820, y: 220, width: 900, height: 115, fontSize: 96, fontFamily: font, fontWeight: 'bold', fill: '#ffffff', align: 'left', lineHeight: 1.2 },
      { id: ids.line, type: 'figure', subType: 'rect', x: 824, y: 370, width: 160, height: 10, fill: '#f0b726', strokeWidth: 0, stroke: '#ffffff', cornerRadius: 5 },
      { id: ids.card, type: 'text', text: 'Select an object and open its animation settings on the right: transition speed curve, duration, intro and exit.', x: 824, y: 430, width: 860, height: 202, fontSize: 42, fontFamily: font, fill: '#c5d3e8', align: 'left', lineHeight: 1.2 },
    ] },
  };
  s2.id = s2.page.id;
  const project = { version: 1, width: W, height: H, fonts: [], slides: [s1, s2], objects: {} };
  ensureNames(project);
  return project;
}
