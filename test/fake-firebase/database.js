// Fake Realtime Database for tests (presence rooms, locks), shared across tabs through localStorage.
import { __state } from './auth.js';
const K = (p) => 'fbdb:' + p;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function getDatabase() { return { fake: true }; }
export function ref(db, path) { return { path, key: path.split('/').pop() }; }
const snap = (path) => { const v = localStorage.getItem(K(path)); return { key: path.split('/').pop(), val: () => (v == null ? null : JSON.parse(v)), exists: () => v != null }; };
const childL = new Map(); // parent path → [{type, cb}]
function notify(path, type) {
  const parent = path.split('/').slice(0, -1).join('/');
  (childL.get(parent) || []).forEach((l) => { if (l.type === type) setTimeout(() => l.cb(snap(path)), 15); });
}
window.addEventListener('storage', (e) => {
  if (!e.key || !e.key.startsWith('fbdb:')) return;
  const p = e.key.slice(5);
  notify(p, e.newValue == null ? 'removed' : e.oldValue == null ? 'added' : 'changed');
});
export async function set(r, v) {
  await sleep(10);
  if (!__state.user) throw Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' });
  const had = localStorage.getItem(K(r.path)) != null;
  if (v == null) { localStorage.removeItem(K(r.path)); if (had) notify(r.path, 'removed'); return; }
  localStorage.setItem(K(r.path), JSON.stringify(v));
  notify(r.path, had ? 'changed' : 'added');
}
export async function remove(r) { return set(r, null); }
function listen(type) {
  return (r, cb) => {
    const l = { type, cb };
    const a = childL.get(r.path) || []; a.push(l); childL.set(r.path, a);
    if (type === 'added') {
      const pre = K(r.path + '/');
      Object.keys(localStorage).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).forEach((k) => setTimeout(() => cb(snap(k.slice(5))), 10));
    }
    return () => { childL.set(r.path, (childL.get(r.path) || []).filter((x) => x !== l)); };
  };
}
export const onChildAdded = listen('added');
export const onChildChanged = listen('changed');
export const onChildRemoved = listen('removed');
export function onValue(r, cb) {
  if (r.path === '.info/connected') setTimeout(() => cb({ val: () => true }), 10);
  else if (r.path === '.info/serverTimeOffset') setTimeout(() => cb({ val: () => 0 }), 10);
  else setTimeout(() => cb(snap(r.path)), 10);
  return () => {};
}
const onUnload = new Set();
window.addEventListener('pagehide', () => onUnload.forEach((p) => localStorage.removeItem(K(p))));
export function onDisconnect(r) { return { remove: async () => { onUnload.add(r.path); } }; }
export async function runTransaction(r, fn) {
  await sleep(15);
  const cur = snap(r.path).val();
  const next = fn(cur);
  if (next === undefined) return { committed: false, snapshot: snap(r.path) };
  if (r.path.startsWith('locks/') && !(next && typeof next.exp === 'number' && next.exp <= Date.now() + 120000)) throw Object.assign(new Error('validate failed'), { code: 'PERMISSION_DENIED' });
  localStorage.setItem(K(r.path), JSON.stringify(next));
  return { committed: true, snapshot: snap(r.path) };
}
