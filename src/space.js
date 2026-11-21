// The space: the artifact owner's projects, and the projects they share with codes.
//
// Who can read what (enforced by the artifact database rules, see README):
//   everything at the root      owner only (private projects, the project list, templates, share settings)
//   sh/<scope>/...              shared projects: readable by anyone who can open the artifact, but every
//                               document is encrypted (AES-256-GCM) with that project's own key
//   inv/<codeId>                invites: the project key, encrypted with a key derived from the code
//   pub/space                   who owns the space (so guests can show "Ana's space")
//   data/users/<id>/keys        a guest's own list of joined projects (private to that person)
//
// Without its code nobody can read a shared project. Removing someone who joined moves the project to a
// new key (and new place), so their old key opens nothing.

const te = new TextEncoder();
const td = new TextDecoder();

// ---- encoding ---------------------------------------------------------------------------------
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function concat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; }

async function streamBytes(bytes, transform) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer();
  return new Uint8Array(out);
}
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// ---- keys ---------------------------------------------------------------------------------------
export const cryptoReady = () => !!(globalThis.crypto && crypto.subtle && crypto.getRandomValues);

export async function newKey() {
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return b64(new Uint8Array(await crypto.subtle.exportKey('raw', k)));
}
const keyCache = new Map();
export async function importKey(raw) {
  if (!keyCache.has(raw)) keyCache.set(raw, crypto.subtle.importKey('raw', unb64(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']));
  return keyCache.get(raw);
}

export function randomId(n = 12) {
  const A = 'abcdefghijkmnopqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const x of r) s += A[x % A.length];
  return s;
}

/** Encrypt a document; the path is bound to it (a document copied elsewhere does not open). */
export async function seal(key, path, data) {
  let bytes = te.encode(JSON.stringify(data));
  let z = 0;
  if (canZip() && bytes.length > 200) {
    try { const g = await streamBytes(bytes, new CompressionStream('gzip')); if (g.length < bytes.length) { bytes = g; z = 1; } } catch (e) { /* keep plain */ }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(path) }, key, bytes));
  return { _e: 1, z, x: b64(concat(iv, ct)) };
}

export async function unseal(key, path, doc) {
  if (!doc || doc._e !== 1 || typeof doc.x !== 'string') return null;
  const all = unb64(doc.x);
  let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12), additionalData: te.encode(path) }, key, all.subarray(12)));
  if (doc.z) bytes = await streamBytes(bytes, new DecompressionStream('gzip'));
  return JSON.parse(td.decode(bytes));
}

// Plain (unencrypted) documents accepted inside a shared scope: only the "moved" marker.
const PLAIN_OK = new Set(['live/moved']);

/**
 * A backend seen through a path prefix, optionally encrypting every document.
 * Same interface as DbBackend, so versions, images and live editing work unchanged inside it.
 */
export class ScopedBackend {
  constructor(inner, prefix, rawKey = null) {
    this.inner = inner;
    this.prefix = prefix;
    this.rawKey = rawKey;
    this.kind = inner.kind;
    // Encrypted documents grow by about a third (base64): keep the pieces smaller.
    this.maxDoc = rawKey ? 150000 : inner.maxDoc;
  }
  get supportsLive() { return this.inner.supportsLive; }
  key() { return importKey(this.rawKey); }
  async wrap(path, data) { return this.rawKey ? seal(await this.key(), path, data) : data; }
  async unwrap(path, data) {
    if (!this.rawKey || data == null) return data;
    if (data._e !== 1) return PLAIN_OK.has(path) ? data : null;
    try { return await unseal(await this.key(), path, data); } catch (e) { return null; }
  }
  async get(path) { return this.unwrap(path, await this.inner.get(this.prefix + path)); }
  async set(path, data) { await this.inner.set(this.prefix + path, await this.wrap(path, data)); }
  async setPlain(path, data) { await this.inner.set(this.prefix + path, data); }
  async del(path) { await this.inner.del(this.prefix + path); }
  async list(coll) {
    const docs = await this.inner.list(this.prefix + coll);
    const out = [];
    for (const d of docs) {
      const data = await this.unwrap(`${coll}/${d.id}`, d.data);
      if (data != null) out.push({ id: d.id, data });
    }
    return out;
  }
  lease(path, holder) { return this.inner.lease ? this.inner.lease(this.prefix + path, holder) : true; }
  watchCollection(coll, cb, onError) {
    let chain = Promise.resolve();
    let off = false;
    const unsub = this.inner.watchCollection(this.prefix + coll, (changes, meta) => {
      chain = chain.then(async () => {
        const out = [];
        for (const ch of changes) {
          const data = ch.data == null ? null : await this.unwrap(`${coll}/${ch.id}`, ch.data);
          if (ch.data != null && data == null) continue; // unreadable: ignore
          out.push({ ...ch, data });
        }
        if (!off && out.length) cb(out, meta);
      }).catch(() => {});
    }, onError);
    return () => { off = true; if (unsub) unsub(); };
  }
  watch(path, cb) {
    let chain = Promise.resolve();
    let off = false;
    const unsub = this.inner.watch(this.prefix + path, (data, meta) => {
      chain = chain.then(async () => { const d = await this.unwrap(path, data); if (!off) cb(d, meta); }).catch(() => {});
    });
    return () => { off = true; if (unsub) unsub(); };
  }
}

// ---- invite codes -------------------------------------------------------------------------------
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I
export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (const x of r) s += CODE_ALPHABET[x % 32];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
export function normalizeCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 12 || [...s].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
export async function codeId(code) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('morph-invite:' + code)));
  return Array.from(h.subarray(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
}
async function codeKey(code, id) {
  const base = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: te.encode('morph-salt:' + id), iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/** Invite document for a code: { pid, sid, key, title, name, owner }. */
export async function sealInvite(code, payload) {
  const id = await codeId(code);
  const k = await codeKey(code, id);
  return { id, doc: { v: 1, ...(await seal(k, 'inv/' + id, payload)), at: Date.now() } };
}
export async function openInvite(code, doc) {
  const id = await codeId(code);
  const k = await codeKey(code, id);
  return unseal(k, 'inv/' + id, doc);
}

// ---- copying a project between places ------------------------------------------------------------
/**
 * Copy a project's documents (working copy, versions, images) from one place to another.
 * Both are backends (plain or encrypted) with a base prefix inside them.
 */
export async function copyProjectData(from, fromBase, to, toBase, onProgress) {
  const refs = new Set();
  const scan = (v) => {
    if (typeof v === 'string') { const m = v.match(/@asset:[a-z0-9-]+/g); if (m) m.forEach((x) => refs.add(x.slice(7))); return; }
    if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') Object.values(v).forEach(scan);
  };
  const steps = [];
  // working copy
  const live = await from.list(`${fromBase}live`);
  for (const d of live) { if (d.id === 'moved') continue; scan(d.data); steps.push([`${toBase}live/${d.id}`, d.data]); }
  // versions
  const head = (await from.get(`${fromBase}meta/head`)) || (await from.get(`${fromBase}meta/head2`));
  const saves = (head && head.saves) || [];
  for (const v of saves) {
    const m = await from.get(`${fromBase}saves/${v.slot}`);
    if (m) steps.push([`${toBase}saves/${v.slot}`, m]);
    for (let i = 0; i < (v.n || 0); i++) {
      const c = await from.get(`${fromBase}saves/${v.slot}/c/${i}`);
      if (!c) continue;
      scan(c.d);
      steps.push([`${toBase}saves/${v.slot}/c/${i}`, c]);
    }
    (v.assets || []).forEach((k) => refs.add(k));
  }
  // images
  const index = { list: {} };
  for (const k of refs) {
    const m = await from.get(`assets/${k}`);
    if (!m || !m.n) continue;
    for (let i = 0; i < m.n; i++) {
      const c = await from.get(`assets/${k}/c/${i}`);
      if (c) steps.push([`assets/${k}/c/${i}`, c]);
    }
    steps.push([`assets/${k}`, m]);
    index.list[k] = { n: m.n, len: m.len, at: m.at || Date.now() };
  }
  let done = 0;
  for (const [path, data] of steps) {
    await to.set(path, data);
    done++;
    if (onProgress) onProgress(done / (steps.length + 2));
  }
  const prevIndex = (await to.get('meta/assets')) || { list: {} };
  await to.set('meta/assets', { list: { ...(prevIndex.list || {}), ...index.list } });
  if (saves.length) {
    await to.set(`${toBase}meta/head`, { v: 2, saves });
    await to.set(`${toBase}meta/head2`, { v: 2, saves });
  }
  if (onProgress) onProgress(1);
  return { docs: steps.length };
}

/** Delete everything inside a shared scope (best effort). */
export async function purgeScope(be, { keepMoved = false } = {}) {
  const del = async (coll) => {
    let docs = [];
    try { docs = await be.inner.list(be.prefix + coll); } catch (e) { return; }
    for (const d of docs) {
      if (keepMoved && coll === 'live' && d.id === 'moved') continue;
      await be.del(`${coll}/${d.id}`);
    }
  };
  await del('live');
  await del('m');
  const head = (await be.get('meta/head')) || (await be.get('meta/head2'));
  for (const v of (head && head.saves) || []) {
    for (let i = 0; i < (v.n || 0) + 2; i++) await be.del(`saves/${v.slot}/c/${i}`);
    await be.del(`saves/${v.slot}`);
  }
  await del('saves');
  const idx = await be.get('meta/assets');
  for (const [k, m] of Object.entries((idx && idx.list) || {})) {
    for (let i = 0; i < (m.n || 0) + 2; i++) await be.del(`assets/${k}/c/${i}`);
    await be.del(`assets/${k}`);
  }
  await del('assets');
  for (const p of ['meta/head', 'meta/head2', 'meta/assets']) await be.del(p);
}
