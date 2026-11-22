// Web version: gives the app the same `window.claude.use(name)` services it has inside a Claude artifact,
// built on Firebase (free Spark plan):
//   db        → Cloud Firestore (each document stored as one JSON string, so any shape is accepted)
//   leases    → Realtime Database transactions (short cooperative locks used by live editing)
//   room      → Realtime Database presence, one room per project (who is here, cursors, live drags)
//   user      → Firebase Authentication: guests sign in anonymously (no account), the owner with Google
//   downloads → a normal browser download
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut,
} from 'firebase/auth';
import {
  initializeFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot,
} from 'firebase/firestore';
import {
  getDatabase, ref, set, remove, onChildAdded, onChildChanged, onChildRemoved, onValue, onDisconnect, runTransaction,
} from 'firebase/database';
import config from './firebase-config';

/* global __FAKE_FB__ */
const configured = (typeof __FAKE_FB__ !== 'undefined' && __FAKE_FB__) || !String(config.apiKey || '').startsWith('PASTE');
const app = configured ? initializeApp(config) : null;
const auth = app ? getAuth(app) : null;
const fs = app ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : null;
const rtdb = app ? getDatabase(app) : null;

// ---- sign-in ------------------------------------------------------------------------------------
let resolveAuth;
const authReady = new Promise((r) => { resolveAuth = r; });
let currentUser = null;
if (auth) {
  onAuthStateChanged(auth, async (u) => {
    currentUser = u;
    if (u) {
      resolveAuth(u);
      return;
    }
    try { await signInAnonymously(auth); } catch (e) { console.error('Anonymous sign-in failed', e); resolveAuth(null); }
  });
} else {
  resolveAuth(null);
}

let serverOffset = 0;
if (rtdb) onValue(ref(rtdb, '.info/serverTimeOffset'), (s) => { serverOffset = s.val() || 0; });
const now = () => Date.now() + serverOffset;
/** The signed-in user now (it changes when the owner signs in with Google). */
async function who() { await authReady; return (auth && auth.currentUser) || currentUser; }

function mapErr(e) {
  const c = String((e && e.code) || '');
  const code = c.includes('permission') ? 'permission_denied'
    : c.includes('invalid-argument') ? 'invalid_argument'
      : c.includes('resource-exhausted') ? 'quota_exceeded'
        : c.includes('unauthenticated') ? 'not_granted'
          : c.includes('unavailable') ? 'unavailable' : c || 'error';
  return Object.assign(new Error((e && e.message) || String(e)), { code });
}

// ---- db -----------------------------------------------------------------------------------------
// Documents are stored as { j: "<json>" }. pub/space also keeps `owner` as a plain field for the rules.
const pack = (path, data) => (path === 'pub/space' ? { j: JSON.stringify(data), owner: data && data.owner } : { j: JSON.stringify(data) });
const unpack = (raw) => (raw && typeof raw.j === 'string' ? JSON.parse(raw.j) : raw);
const wrap = (s) => {
  const ex = s.exists();
  let cached;
  return { exists: ex, id: s.id, metadata: s.metadata || {}, data: () => (ex ? (cached === undefined ? (cached = unpack(s.data())) : cached) : undefined) };
};
const lockKey = (path) => 'locks/' + encodeURIComponent(path).replace(/\./g, '%2E');

const db = {
  doc(path) {
    const r = () => doc(fs, path);
    return {
      async get() { await authReady; try { return wrap(await getDoc(r())); } catch (e) { throw mapErr(e); } },
      async set(data) { await authReady; try { await setDoc(r(), pack(path, data)); } catch (e) { throw mapErr(e); } },
      async delete() { await authReady; try { await deleteDoc(r()); } catch (e) { throw mapErr(e); } },
      onSnapshot(next, err) {
        let un = null, off = false;
        authReady.then(() => { if (!off) un = onSnapshot(r(), (s) => next(wrap(s)), (e) => err && err(mapErr(e))); });
        return () => { off = true; if (un) un(); };
      },
      /** Short lock: { acquired, expiresAt }. */
      async acquire({ holder, ttlMs = 1000 }) {
        await authReady;
        try {
          const res = await runTransaction(ref(rtdb, lockKey(path)), (cur) => {
            if (!cur || cur.exp < now() || cur.holder === holder) return { holder, exp: now() + Math.max(1000, ttlMs) };
            return undefined; // someone else holds it
          }, { applyLocally: false });
          const v = res.snapshot.val();
          return { acquired: !!(res.committed && v && v.holder === holder), expiresAt: v ? new Date(v.exp - serverOffset).toISOString() : null, holder: v && v.holder };
        } catch (e) { throw mapErr(e); }
      },
    };
  },
  collection(path) {
    const c = () => collection(fs, path);
    return {
      async get() {
        await authReady;
        try {
          const qs = await getDocs(c());
          const docs = qs.docs.map(wrap);
          return { docs, size: docs.length, empty: !docs.length, metadata: qs.metadata || {}, docChanges: () => docs.map((d) => ({ type: 'added', doc: d })) };
        } catch (e) { throw mapErr(e); }
      },
      onSnapshot(next, err) {
        let un = null, off = false;
        authReady.then(() => {
          if (off) return;
          un = onSnapshot(c(), (qs) => {
            const changes = qs.docChanges().map((ch) => ({ type: ch.type, doc: wrap(ch.doc) }));
            next({ docs: qs.docs.map(wrap), size: qs.size, empty: qs.empty, metadata: qs.metadata || {}, docChanges: () => changes });
          }, (e) => err && err(mapErr(e)));
        });
        return () => { off = true; if (un) un(); };
      },
    };
  },
};

// ---- user ---------------------------------------------------------------------------------------
let spaceOwner;
async function readSpaceOwner(force) {
  if (spaceOwner !== undefined && !force) return spaceOwner;
  try { const s = await getDoc(doc(fs, 'pub/space')); spaceOwner = s.exists() ? (s.data().owner || null) : null; }
  catch (e) { spaceOwner = null; }
  return spaceOwner;
}
const user = {
  async isOwner() { const u = await who(); return !!(u && !u.isAnonymous && (await readSpaceOwner()) === u.uid); },
  async canEdit() { return !!(await authReady); },
  async can() { return !!(await authReady); },
  async id() { const u = await who(); return u ? u.uid : null; },
  async me() {
    const u = await who();
    return { id: u ? u.uid : null, name: (u && !u.isAnonymous && u.displayName) || '', avatarUrl: (u && u.photoURL) || '', color: null, email: null, guest: !!(u && u.isAnonymous) };
  },
  /** Names are not stored in the database (privacy): only your own is known here; others come from
   *  the encrypted project data and from live presence. */
  async profiles(ids) {
    const u = await who();
    const out = {};
    for (const id of (Array.isArray(ids) ? ids : [ids]).filter(Boolean)) {
      out[id] = u && id === u.uid && !u.isAnonymous ? { id, name: u.displayName || '', avatarUrl: u.photoURL || '' } : { id, name: '', avatarUrl: '' };
    }
    return out;
  },
  async setName() { /* names are not stored in the database */ },
  async search() { return []; },
};

// ---- room (presence) ----------------------------------------------------------------------------
const conn = Math.random().toString(36).slice(2, 12);
let mine = {};
let roomId = null;
let nodeRef = null;
let unsubs = [];
const peers = new Map();
const handlers = new Set();
let pendingWrite = null;
let lastWrite = 0;

function snapshot() { return Array.from(peers.values()); }
function deliver(joined = [], left = [], updated = []) {
  const ps = snapshot();
  handlers.forEach((h) => { try { h({ peers: ps, joined, left, updated }); } catch (e) { console.error(e); } });
}
function myPeer() {
  return { peer: conn, by: currentUser ? currentUser.uid : null, isMe: true, sameTab: true, kind: 'viewer', guest: !!(currentUser && currentUser.isAnonymous), presence: { ...mine }, updatedAt: Date.now() };
}
function toPeer(key, v) {
  const by = v && v.by;
  return { peer: key, by, isMe: !!(currentUser && by === currentUser.uid), sameTab: key === conn, kind: 'viewer', guest: !!(v && v.guest), presence: (v && v.p) || {}, updatedAt: (v && v.at) || Date.now() };
}
const safeRoom = (id) => encodeURIComponent(String(id)).replace(/\./g, '%2E');

function leaveRoom() {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (nodeRef) { remove(nodeRef).catch(() => {}); nodeRef = null; }
  for (const k of [...peers.keys()]) if (k !== conn) peers.delete(k);
}
function joinRoom(id) {
  leaveRoom();
  roomId = id;
  if (!id || !rtdb || !currentUser) { deliver(); return; }
  const roomRef = ref(rtdb, `rooms/${safeRoom(id)}`);
  nodeRef = ref(rtdb, `rooms/${safeRoom(id)}/${conn}`);
  onDisconnect(nodeRef).remove().catch(() => {});
  writeNow();
  const add = (s) => { if (s.key === conn) return; const p = toPeer(s.key, s.val()); peers.set(s.key, p); deliver([p], [], []); };
  const chg = (s) => { if (s.key === conn) return; const p = toPeer(s.key, s.val()); peers.set(s.key, p); deliver([], [], [p]); };
  const rem = (s) => { const p = peers.get(s.key); peers.delete(s.key); if (p) deliver([], [p], []); };
  unsubs.push(onChildAdded(roomRef, add), onChildChanged(roomRef, chg), onChildRemoved(roomRef, rem));
}
function writeNow() {
  pendingWrite = null;
  lastWrite = Date.now();
  if (!nodeRef || !currentUser) return;
  set(nodeRef, { by: currentUser.uid, guest: !!currentUser.isAnonymous, p: mine, at: Date.now() }).catch(() => {});
}
function scheduleWrite() {
  // At most ~20 updates a second (cursor moves and live drags).
  if (pendingWrite) return;
  const wait = Math.max(0, 50 - (Date.now() - lastWrite));
  pendingWrite = setTimeout(writeNow, wait);
}
if (rtdb) {
  onValue(ref(rtdb, '.info/connected'), (s) => {
    if (s.val() === true && nodeRef) { onDisconnect(nodeRef).remove().catch(() => {}); writeNow(); }
  });
}
window.addEventListener('pagehide', () => { if (nodeRef) remove(nodeRef).catch(() => {}); });

const room = {
  async presence(patch) {
    await authReady;
    const next = { ...mine, ...patch };
    for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined) delete next[k];
    mine = next;
    peers.set(conn, myPeer());
    // One room per project: people only see who is in the same project.
    const want = mine.project || null;
    if (want !== roomId) joinRoom(want); else scheduleWrite();
    deliver([], [], []);
  },
  onPeers(h) {
    handlers.add(h);
    peers.set(conn, myPeer());
    setTimeout(() => h({ peers: snapshot(), joined: snapshot(), left: [], updated: [] }), 0);
    return () => handlers.delete(h);
  },
  peers: snapshot,
  connected: () => true,
  onConnection: () => () => {},
  emit: async () => {},
  on: () => () => {},
};

// ---- downloads ----------------------------------------------------------------------------------
const downloads = {
  async save({ filename, data, mimeType }) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'download';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: 'saved' };
  },
};

// ---- the owner ----------------------------------------------------------------------------------
export const web = {
  configured,
  /** Sign in with Google. The first person to do this on a new site becomes its owner. */
  async signInOwner() {
    if (!auth) throw new Error('Firebase is not configured yet (src/web/firebase-config.js).');
    const res = await signInWithPopup(auth, new GoogleAuthProvider());
    const u = res.user;
    const owner = await readSpaceOwner(true);
    if (!owner) {
      await setDoc(doc(fs, 'pub/space'), pack('pub/space', { owner: u.uid, at: Date.now() }));
      spaceOwner = u.uid;
    }
    return { owner: (await readSpaceOwner(true)) === u.uid };
  },
  async signOut() { if (auth) await fbSignOut(auth); },
  async status() { const u = await who(); return { signedIn: !!u, anonymous: !!(u && u.isAnonymous), name: u && u.displayName, claimed: !!(await readSpaceOwner()) }; },
};

const services = { db, user, room, downloads };
window.__web = web;
window.claude = {
  use: async (name) => {
    if (!configured) return name === 'downloads' ? downloads : null; // browser-only mode until Firebase is set up
    if (!(await authReady)) return name === 'downloads' ? downloads : null;
    return services[name] || null;
  },
};
