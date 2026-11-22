// Fake Cloud Firestore for tests: localStorage-backed, shared across tabs, enforcing firestore.rules.
import { __state } from './auth.js';
const K = (p) => 'fbfs:' + p;
const LAT = () => 20 + Math.random() * 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OWNER_COLLS = ['meta', 'proj', 'saves', 'live', 'assets', 'templates', 'shares'];
window.__fsDenied = [];
function deny(op, path) { window.__fsDenied.push(op + ':' + path); throw Object.assign(new Error('Missing or insufficient permissions: ' + op + ' ' + path), { code: 'permission-denied' }); }
function raw(path) { const v = localStorage.getItem(K(path)); return v == null ? null : JSON.parse(v); }
function uid() { return __state.user && __state.user.uid; }
function isOwner() { const s = raw('pub/space'); return !!(__state.user && s && s.owner === uid()); }
function allowed(op, path, data) {
  if (!__state.user) return false;
  const seg = path.split('/');
  const top = seg[0];
  if (top === 'sh') {
    if (seg.length <= 2) return (op === 'set' || op === 'delete') && isOwner(); // place marker: owner opens it, nobody reads it
    return raw('sh/' + seg[1]) != null; // only inside places the owner opened
  }
  if (top === 'inv') return op === 'get' || ((op === 'set' || op === 'delete') && isOwner());
  if (top === 'pub' && seg[1] === 'space') {
    if (op === 'get') return true;
    if (op === 'set') { const cur = raw(path); return cur ? isOwner() : (!__state.user.isAnonymous && data && data.owner === uid()); }
    return isOwner();
  }
  if (top === 'data' && seg[1] === 'users') return seg[2] === uid();
  if (OWNER_COLLS.includes(top)) return isOwner();
  return false;
}
class Snap {
  constructor(path) { this.ref = { path }; this.id = path.split('/').pop(); const v = raw(path); this._v = v; this.metadata = { fromCache: false, hasPendingWrites: false }; }
  exists() { return this._v != null; }
  data() { return this._v == null ? undefined : JSON.parse(JSON.stringify(this._v)); }
}
export function initializeFirestore() { return { fake: true }; }
export function doc(fs, path) { return { kind: 'doc', path, id: path.split('/').pop() }; }
export function collection(fs, path) { return { kind: 'coll', path }; }
function childrenOf(coll) {
  const pre = K(coll + '/');
  return Object.keys(localStorage).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => k.slice(5));
}
export async function getDoc(r) { await sleep(LAT()); if (!allowed('get', r.path)) deny('get', r.path); return new Snap(r.path); }
export async function setDoc(r, data) {
  await sleep(LAT());
  if (!allowed('set', r.path, data)) deny('set', r.path);
  const s = JSON.stringify(data);
  if (s.length > 1048000) throw Object.assign(new Error('Document too large'), { code: 'invalid-argument' });
  const had = localStorage.getItem(K(r.path)) != null;
  localStorage.setItem(K(r.path), s);
  window.__fsWrites = (window.__fsWrites || 0) + 1;
  fire(r.path, had ? 'modified' : 'added');
}
export async function deleteDoc(r) { await sleep(LAT()); if (!allowed('delete', r.path)) deny('delete', r.path); localStorage.removeItem(K(r.path)); fire(r.path, 'removed'); }
export async function getDocs(c) {
  await sleep(LAT());
  if (!allowed('list', c.path + '/x')) deny('list', c.path);
  const docs = childrenOf(c.path).map((p) => new Snap(p));
  return { docs, size: docs.length, empty: !docs.length, metadata: {}, docChanges: () => docs.map((d) => ({ type: 'added', doc: d })) };
}
const docL = new Map(), colL = new Map();
function fire(path, type) {
  (docL.get(path) || []).forEach((fn) => setTimeout(() => fn(new Snap(path)), LAT()));
  const coll = path.split('/').slice(0, -1).join('/');
  (colL.get(coll) || []).forEach((fn) => setTimeout(() => {
    const d = new Snap(path);
    const t = d.exists() ? type || 'modified' : 'removed';
    const docs = childrenOf(coll).map((p) => new Snap(p));
    fn({ docs, size: docs.length, empty: !docs.length, metadata: {}, docChanges: () => [{ type: t, doc: d }] });
  }, LAT()));
}
window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('fbfs:')) fire(e.key.slice(5), e.oldValue == null ? 'added' : e.newValue == null ? 'removed' : 'modified'); });
export function onSnapshot(r, next, err) {
  if (r.kind === 'doc') {
    if (!allowed('get', r.path)) { setTimeout(() => err && err({ code: 'permission-denied', message: 'denied' }), 5); return () => {}; }
    const a = docL.get(r.path) || []; a.push(next); docL.set(r.path, a);
    setTimeout(() => next(new Snap(r.path)), LAT());
    return () => { const l = docL.get(r.path) || []; docL.set(r.path, l.filter((f) => f !== next)); };
  }
  if (!allowed('list', r.path + '/x')) { setTimeout(() => err && err({ code: 'permission-denied', message: 'denied' }), 5); return () => {}; }
  const a = colL.get(r.path) || []; a.push(next); colL.set(r.path, a);
  setTimeout(() => { const docs = childrenOf(r.path).map((p) => new Snap(p)); next({ docs, size: docs.length, empty: !docs.length, metadata: {}, docChanges: () => docs.map((d) => ({ type: 'added', doc: d })) }); }, LAT());
  return () => { const l = colL.get(r.path) || []; colL.set(r.path, l.filter((f) => f !== next)); };
}
