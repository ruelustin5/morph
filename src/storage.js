// Saving with rotating backups.
//
// Layout (same for the artifact database and the browser-only fallback):
//   meta/head            { v, saves: [ {slot, savedAt, hash, len, n, slides, assets:[keys]} ] }  newest first, max 3
//   saves/<slot>         same entry (lets us recover if meta/head is ever lost)
//   saves/<slot>/c/<i>   { d: "<chunk of project JSON>" }
//   assets/<key>         { n, len }      images are stored once (content addressed) and shared by saves
//   assets/<key>/c/<i>   { d: "<chunk of data URL>" }
//   meta/assets          { list: { key: {n, len} } }
// A new save is always written into a slot not used by the kept saves, and meta/head is only switched
// once every chunk is written, so a failed save can never damage the previous ones.
// Loading verifies length + hash of everything and falls back to the next newest save.

const SLOTS = ['a', 'b', 'c', 'd'];
const KEEP = 3;
const MAX_DOC_BYTES = 230000;
const enc = new TextEncoder();

export function hashStr(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function chunk(str, maxBytes = MAX_DOC_BYTES) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    let len = Math.min(180000, str.length - i);
    for (;;) {
      const piece = str.slice(i, i + len);
      if (enc.encode(JSON.stringify({ d: piece })).length <= maxBytes || len < 1000) { out.push(piece); i += len; break; }
      len = Math.floor(len / 2);
    }
  }
  if (!out.length) out.push('');
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 4) {
  let last;
  for (let k = 0; k < tries; k++) {
    try { return await fn(); } catch (e) {
      last = e;
      const code = e && e.code;
      if (code === 'invalid_argument' || code === 'quota_exceeded' || code === 'revoked' || code === 'not_granted') throw e;
      await sleep(300 * Math.pow(2, k) + Math.random() * 300);
    }
  }
  throw last;
}

async function pool(items, n, fn) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) { const k = idx++; await fn(items[k], k); }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------
// Snapshots from the artifact database are frozen: always hand out a mutable copy.
const thaw = (d) => (d == null ? null : typeof structuredClone === 'function' ? structuredClone(d) : JSON.parse(JSON.stringify(d)));

export class DbBackend {
  constructor(db) { this.db = db; this.kind = 'cloud'; }
  async get(path) { const s = await withRetry(() => this.db.doc(path).get()); return s.exists ? thaw(s.data()) : null; }
  async list(collPath) {
    const qs = await withRetry(() => this.db.collection(collPath).get());
    return qs.docs.filter((d) => d.exists).map((d) => ({ id: d.id, data: thaw(d.data()) }));
  }
  /** Cooperative short lock on a document (all writers of live documents use it). */
  async lease(path, holder) {
    const ref = this.db.doc(path);
    if (typeof ref.acquire !== 'function') return true;
    for (let k = 0; k < 40; k++) {
      let r = null;
      try { r = await ref.acquire({ holder, ttlMs: 1000 }); } catch (e) { if (e && (e.code === 'invalid_argument' || e.code === 'revoked')) throw e; }
      if (r && r.acquired) return true;
      const wait = r && r.expiresAt ? Math.min(1100, Math.max(60, Date.parse(r.expiresAt) - Date.now() + 20)) : 150;
      await sleep(wait + Math.random() * 60);
    }
    return false;
  }
  /** Live editing needs collection queries and live snapshots. */
  get supportsLive() {
    try { return typeof this.db.collection === 'function' && typeof this.db.doc('meta/probe').onSnapshot === 'function'; } catch (e) { return false; }
  }
  /** Live updates of a collection; cb(changes) with [{id, data|null}]. */
  watchCollection(collPath, cb, onError) {
    try {
      return this.db.collection(collPath).onSnapshot((qs) => {
        const changes = qs.docChanges().map((ch) => ({ id: ch.doc.id, type: ch.type, data: ch.type === 'removed' ? null : thaw(ch.doc.data()), meta: qs.metadata || {} }));
        cb(changes, qs.metadata || {});
      }, (e) => onError && onError(e));
    } catch (e) { if (onError) onError(e); return () => {}; }
  }
  /** Live updates of one document; returns an unsubscribe function. */
  watch(path, cb) {
    try {
      return this.db.doc(path).onSnapshot((snap) => cb(snap.exists ? thaw(snap.data()) : null, snap.metadata || {}), () => {});
    } catch (e) { return () => {}; }
  }
  async set(path, data) { await withRetry(() => this.db.doc(path).set(data)); }
  async del(path) { try { await withRetry(() => this.db.doc(path).delete(), 2); } catch (e) { /* best effort */ } }
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('morph-slides', 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs'); if (!db.objectStoreNames.contains('local')) db.createObjectStore('local'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
let _idb = null;
const idb = () => (_idb = _idb || idbOpen());
async function idbOp(store, mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class IdbBackend {
  constructor() { this.kind = 'browser'; }
  async list(collPath) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = db.transaction('docs', 'readonly');
      const req = tx.objectStore('docs').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        const k = String(cur.key);
        if (k.startsWith(collPath + '/') && k.slice(collPath.length + 1).indexOf('/') < 0) out.push({ id: k.slice(collPath.length + 1), data: cur.value });
        cur.continue();
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  }
  async get(path) { const v = await idbOp('docs', 'readonly', (s) => s.get(path)); return v == null ? null : v; }
  async set(path, data) { await idbOp('docs', 'readwrite', (s) => s.put(data, path)); }
  async del(path) { try { await idbOp('docs', 'readwrite', (s) => s.delete(path)); } catch (e) { /* ignore */ } }
}

// Local crash-recovery draft (never counts as a save).
export async function saveDraft(pid, project, meta) {
  try { await idbOp('local', 'readwrite', (s) => s.put({ project, ...meta, at: Date.now() }, 'draft:' + pid)); } catch (e) { /* ignore */ }
}
export async function loadDraft(pid) {
  try { return (await idbOp('local', 'readonly', (s) => s.get('draft:' + pid))) || null; } catch (e) { return null; }
}
export async function clearDraft(pid) {
  try { await idbOp('local', 'readwrite', (s) => s.delete('draft:' + pid)); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Asset extraction
// ---------------------------------------------------------------------------
const ASSET_PREFIX = '@asset:';
export function extractAssets(project) {
  const assets = {};
  const walk = (v) => {
    if (typeof v === 'string') {
      if (v.length > 1024 && v.startsWith('data:')) {
        const key = hashStr(v) + '-' + v.length.toString(36);
        assets[key] = v;
        return ASSET_PREFIX + key;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
    return v;
  };
  const stripped = walk(project);
  return { stripped, assets };
}
export function injectAssets(obj, assets) {
  const walk = (v) => {
    if (typeof v === 'string' && v.startsWith(ASSET_PREFIX)) {
      const key = v.slice(ASSET_PREFIX.length);
      if (!(key in assets)) throw new Error('Missing image ' + key);
      return assets[key];
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
    return v;
  };
  return walk(obj);
}

// ---------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------
async function writeChunks(be, base, str) {
  const parts = chunk(str, be.maxDoc || MAX_DOC_BYTES);
  await pool(parts, 4, (d, i) => be.set(`${base}/c/${i}`, { d }));
  return parts.length;
}
async function readChunks(be, base, n) {
  const parts = new Array(n);
  await pool(Array.from({ length: n }, (_, i) => i), 6, async (i) => {
    const doc = await be.get(`${base}/c/${i}`);
    if (!doc || typeof doc.d !== 'string') throw new Error(`Missing piece ${i + 1}/${n}`);
    parts[i] = doc.d;
  });
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Single images (used by live editing)
// ---------------------------------------------------------------------------
export function assetKey(dataUrl) { return hashStr(dataUrl) + '-' + dataUrl.length.toString(36); }
export const ASSET_REF = ASSET_PREFIX;

/** Make sure an image is stored (content addressed, so storing twice is harmless). */
export async function ensureAsset(be, key, data) {
  const m = await be.get(`assets/${key}`);
  if (m && m.n) return;
  const n = await writeChunks(be, `assets/${key}`, data);
  await be.set(`assets/${key}`, { n, len: data.length, at: Date.now() });
  try {
    const index = (await be.get('meta/assets')) || { list: {} };
    index.list = index.list || {};
    index.list[key] = { n, len: data.length, at: Date.now() };
    await be.set('meta/assets', index);
  } catch (e) { /* the index only drives cleanup */ }
}

export async function fetchAsset(be, key) {
  const m = await be.get(`assets/${key}`);
  if (!m) throw new Error('Image not found yet');
  const data = await readChunks(be, `assets/${key}`, m.n);
  const [h, l] = key.split('-');
  if (data.length !== parseInt(l, 36) || hashStr(data) !== h) throw new Error('Image is damaged');
  return data;
}

// Every project lives under a base prefix: '' for the original (first) project, 'proj/<id>/' for the others.
// ---------------------------------------------------------------------------
// Version history.  <base>meta/head = { saves: [entry, ...] } newest first, mirrored in <base>meta/head2.
// entry = { slot, savedAt, hash, len, n, slides, assets, title, by, tab, auto, name, reason, authors }
// Named versions (and saves from older app versions) are kept until deleted; automatic ones are thinned.
// ---------------------------------------------------------------------------
const H = 3600 * 1000, D = 24 * H;

export function thinVersions(list, now = Date.now()) {
  const keep = [], drop = [];
  const hours = new Set(), days = new Set();
  let autos = 0;
  for (const v of list) {
    if (!v.auto) { keep.push(v); continue; }
    autos++;
    const age = now - v.savedAt;
    let ok = false;
    if (autos <= 8 || age < 2 * H) ok = true;
    else if (age < D) { const k = Math.floor(v.savedAt / H); ok = !hours.has(k); hours.add(k); }
    else if (age < 30 * D) { const k = Math.floor(v.savedAt / D); ok = !days.has(k); days.add(k); }
    (ok && autos <= 60 ? keep : drop).push(v);
  }
  return { keep, drop };
}

export async function listSaves(be, base = '') {
  for (const name of ['head', 'head2']) {
    const doc = await be.get(`${base}meta/${name}`);
    if (doc && Array.isArray(doc.saves) && doc.saves.length) return doc.saves.slice();
  }
  // Older layout: rebuild from the 4 fixed slots.
  const saves = [];
  for (const slot of SLOTS) { const m = await be.get(`${base}saves/${slot}`); if (m && m.hash) saves.push(m); }
  saves.sort((x, y) => y.savedAt - x.savedAt);
  return saves;
}

async function writeHead(be, base, saves) {
  await be.set(`${base}meta/head`, { v: 2, saves });
  try { await be.set(`${base}meta/head2`, { v: 2, saves }); } catch (e) { /* mirror is best effort */ }
}

async function deleteVersionDocs(be, base, v) {
  for (let i = 0; i < (v.n || 0) + 2; i++) await be.del(`${base}saves/${v.slot}/c/${i}`);
  await be.del(`${base}saves/${v.slot}`);
}

async function lockHead(be, base, tab) {
  if (be.lease) await be.lease(`${base}meta/head`, tab || 'app');
}

/**
 * Store a version. opts: { auto, name, reason, authors, by, tab, skipIfNewerThan }.
 * With skipIfNewerThan, nothing is stored when someone else made a version that recently (returns { skipped }).
 */
export async function saveVersion(be, project, base = '', opts = {}, onProgress) {
  if (opts.skipIfNewerThan) {
    const top = (await listSaves(be, base))[0];
    if (top && Date.now() - top.savedAt < opts.skipIfNewerThan) return { skipped: true, saves: await listSaves(be, base) };
  }
  const { stripped, assets } = extractAssets(project);
  const json = JSON.stringify(stripped);
  const index = (await be.get('meta/assets')) || { list: {} };
  index.list = index.list || {};
  const keys = Object.keys(assets);
  const missing = keys.filter((k) => !index.list[k]);
  let doneSteps = 0;
  const total = missing.length + 2;
  const step = () => onProgress && onProgress(++doneSteps / total);
  for (const k of missing) {
    await ensureAsset(be, k, assets[k]);
    step();
  }
  const slot = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const n = await writeChunks(be, `${base}saves/${slot}`, json);
  step();
  const entry = {
    slot, savedAt: Date.now(), hash: hashStr(json), len: json.length, n, slides: project.slides.length, assets: keys,
    title: project.title || '', by: opts.by || null, tab: opts.tab || null, auto: !!opts.auto, name: opts.name || '',
    reason: opts.reason || '', authors: (opts.authors || []).slice(0, 12),
  };
  await be.set(`${base}saves/${slot}`, entry);
  await lockHead(be, base, opts.tab);
  const current = await listSaves(be, base);
  if (opts.skipIfNewerThan && current[0] && Date.now() - current[0].savedAt < opts.skipIfNewerThan) {
    await deleteVersionDocs(be, base, entry);
    return { skipped: true, saves: current };
  }
  const { keep, drop } = thinVersions([entry, ...current.filter((x) => x.slot !== slot)]);
  await writeHead(be, base, keep);
  step();
  for (const d of drop) { try { await deleteVersionDocs(be, base, d); } catch (e) { /* ignore */ } }
  return { entry, saves: keep };
}

/** Older call sites: a manual save. */
export async function saveProject(be, project, base = '', onProgress, meta = {}) {
  return saveVersion(be, project, base, { ...meta, auto: false }, onProgress);
}

export async function renameVersion(be, base, slot, name, tab) {
  await lockHead(be, base, tab);
  const saves = await listSaves(be, base);
  const v = saves.find((x) => x.slot === slot);
  if (!v) return saves;
  v.name = String(name || '').slice(0, 80);
  if (v.name) v.auto = false; // a named version is kept until deleted
  await writeHead(be, base, saves);
  return saves;
}

export async function deleteVersion(be, base, slot, tab) {
  await lockHead(be, base, tab);
  const saves = await listSaves(be, base);
  const v = saves.find((x) => x.slot === slot);
  if (!v) return saves;
  const rest = saves.filter((x) => x.slot !== slot);
  await writeHead(be, base, rest);
  try { await deleteVersionDocs(be, base, v); } catch (e) { /* ignore */ }
  return rest;
}

/**
 * Delete images that no kept save of any listed project references.
 * Skipped entirely if any project's save list cannot be read (never delete when unsure).
 */
export async function gcAssets(be, bases) {
  try {
    const live = new Set();
    const scan = (v) => {
      if (typeof v === 'string') { if (v.startsWith(ASSET_PREFIX)) live.add(v.slice(ASSET_PREFIX.length)); return; }
      if (Array.isArray(v)) { v.forEach(scan); return; }
      if (v && typeof v === 'object') for (const k of Object.keys(v)) scan(v[k]);
    };
    for (const b of bases) {
      const saves = await listSaves(be, b);
      for (const x of saves) for (const k of x.assets || []) live.add(k);
      if (be.list) for (const d of await be.list(`${b}live`)) scan(d.data);
    }
    if (be.list) for (const d of await be.list('templates')) scan(d.data);
    const index = (await be.get('meta/assets')) || { list: {} };
    let changed = false;
    const grace = Date.now() - 48 * 3600 * 1000;
    for (const k of Object.keys(index.list || {})) {
      if (live.has(k)) continue;
      const info = index.list[k];
      if (info.at && info.at > grace) continue; // never remove recent images (a collaborator may be adding them)
      delete index.list[k];
      changed = true;
      await be.del(`assets/${k}`);
      for (let i = 0; i < (info.n || 0); i++) await be.del(`assets/${k}/c/${i}`);
    }
    if (changed) await be.set('meta/assets', index);
  } catch (e) { /* best effort */ }
}

/** Remove every save of a project (its images are collected by gcAssets afterwards). */
export async function purgeProject(be, base) {
  let saves0 = [];
  try { saves0 = await listSaves(be, base); } catch (e) { /* ignore */ }
  for (const slot of SLOTS) {
    const m = await be.get(`${base}saves/${slot}`);
    if (m) {
      for (let i = 0; i < (m.n || 0) + 2; i++) await be.del(`${base}saves/${slot}/c/${i}`);
      await be.del(`${base}saves/${slot}`);
    }
  }
  await be.del(`${base}meta/head`);
  await be.del(`${base}meta/head2`);
  try { for (const v of saves0) await deleteVersionDocs(be, base, v); } catch (e) { /* ignore */ }
  if (be.list) { try { for (const d of await be.list(`${base}live`)) await be.del(`${base}live/${d.id}`); } catch (e) { /* ignore */ } }
}

export async function loadSave(be, entry, base = '') {
  const json = await readChunks(be, `${base}saves/${entry.slot}`, entry.n);
  if (json.length !== entry.len || hashStr(json) !== entry.hash) throw new Error('Save is damaged (checksum mismatch)');
  const stripped = JSON.parse(json);
  const keys = new Set();
  const scan = (v) => {
    if (typeof v === 'string') { if (v.startsWith(ASSET_PREFIX)) keys.add(v.slice(ASSET_PREFIX.length)); return; }
    if (Array.isArray(v)) { v.forEach(scan); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) scan(v[k]);
  };
  scan(stripped);
  const assets = {};
  for (const k of keys) {
    const m = await be.get(`assets/${k}`);
    if (!m) throw new Error('An image of this save is missing');
    const data = await readChunks(be, `assets/${k}`, m.n);
    const [h, l] = k.split('-');
    if (data.length !== parseInt(l, 36) || hashStr(data) !== h) throw new Error('An image of this save is damaged');
    assets[k] = data;
  }
  return injectAssets(stripped, assets);
}

/** Load the newest save that verifies, falling back to older ones. */
export async function loadLatest(be, base = '') {
  const saves = await listSaves(be, base);
  const errors = [];
  for (let i = 0; i < saves.length; i++) {
    try {
      const project = await loadSave(be, saves[i], base);
      return { project, entry: saves[i], saves, fellBack: i > 0, errors };
    } catch (e) {
      errors.push({ entry: saves[i], message: e && e.message ? e.message : String(e) });
    }
  }
  return { project: null, entry: null, saves, fellBack: false, errors };
}

// ---------------------------------------------------------------------------
// Project list:  meta/projects { list: [ {id, base, title, createdAt, updatedAt, slides, w, h, cover} ], last }
// ---------------------------------------------------------------------------
export const baseFor = (id) => (id === 'main' ? '' : `proj/${id}/`);

export async function loadIndex(be) {
  const doc = await be.get('meta/projects');
  if (doc && Array.isArray(doc.list)) return { list: doc.list, last: doc.last || null };
  // First run with project support: adopt the original single project if it exists.
  const saves = await listSaves(be, '');
  if (saves.length) {
    const s0 = saves[0];
    const idx = { list: [{ id: 'main', base: '', title: s0.title || 'Untitled presentation', createdAt: s0.savedAt, updatedAt: s0.savedAt, slides: s0.slides }], last: 'main' };
    await be.set('meta/projects', idx);
    return idx;
  }
  return { list: [], last: null };
}

/** Read-modify-write of the project list (re-reads first so another tab's changes are kept). */
export async function updateIndex(be, fn) {
  const doc = (await be.get('meta/projects')) || { list: [], last: null };
  doc.list = Array.isArray(doc.list) ? doc.list : [];
  const next = fn(doc) || doc;
  await be.set('meta/projects', { list: next.list, last: next.last || null });
  return next;
}
