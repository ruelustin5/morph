(() => {
  const params = new URLSearchParams(location.search);
  const uid = 'u_' + (params.get('u') || 'me');
  const LAT = () => 40 + Math.random() * 120; // simulated network latency
  const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
  const K = (p) => 'fakedb:' + p;
  const snapOf = (path) => { const v = localStorage.getItem(K(path)); return { exists: v != null, data: () => (v ? deepFreeze(JSON.parse(v)) : undefined), id: path.split('/').pop(), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const docL = new Map(), colL = new Map();
  const collOf = (path) => path.split('/').slice(0, -1).join('/');
  const fire = (path, type) => {
    (docL.get(path) || []).forEach((fn) => setTimeout(() => fn(snapOf(path)), LAT()));
    const coll = collOf(path);
    (colL.get(coll) || []).forEach((fn) => setTimeout(() => { const d = snapOf(path); const t = d.exists ? type || 'modified' : 'removed'; fn({ docs: [], size: 0, empty: false, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [{ type: t, doc: d.exists ? d : { ...d, exists: true, data: () => ({}) }, oldIndex: -1, newIndex: -1 }] }); }, LAT()));
  };
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('fakedb:')) fire(e.key.slice(7), e.oldValue == null ? 'added' : 'modified'); });
  window.__writes = 0;
  // ?roles=1 : alice owns the artifact; everyone else follows the declared db rules.
  const ROLES = params.has('roles');
  const OWNER = uid === 'u_alice' || !ROLES;
  const canRead = (path) => OWNER || path.startsWith('sh/') || path.startsWith('inv/') || path.startsWith('pub/') || path.startsWith(`data/users/${uid}/`);
  const canWrite = (path) => OWNER ? !path.startsWith('data/users/') || path.startsWith(`data/users/${uid}/`) : path.startsWith('sh/') || path.startsWith(`data/users/${uid}/`);
  const deny = (path, what) => { window.__denied = (window.__denied || 0) + 1; (window.__deniedPaths = window.__deniedPaths || []).push(what + ':' + path); throw { code: 'permission_denied', message: 'not allowed: ' + path }; };
  const list = (coll) => Object.keys(localStorage).filter((k) => k.startsWith(K(coll + '/')) && !k.slice(K(coll + '/').length).includes('/')).map((k) => snapOf(k.slice(7)));
  const db = {
    doc: (path) => ({
      get: async () => { await new Promise((r) => setTimeout(r, LAT())); if (!canRead(path)) deny(path, 'get'); return snapOf(path); },
      set: async (d) => { await new Promise((r) => setTimeout(r, LAT())); if (!canWrite(path)) deny(path, 'set'); const s = JSON.stringify(d); if (s.length > 256 * 1024) throw { code: 'invalid_argument', message: 'document too large' }; const had = localStorage.getItem(K(path)) != null; localStorage.setItem(K(path), s); window.__writes++; fire(path, had ? 'modified' : 'added'); },
      delete: async () => { if (!canWrite(path)) deny(path, 'del'); localStorage.removeItem(K(path)); fire(path, 'removed'); },
      onSnapshot: (next, err) => { if (!canRead(path)) { setTimeout(() => err && err({ code: 'permission_denied' }), 10); return () => {}; } const a = docL.get(path) || []; a.push(next); docL.set(path, a); setTimeout(() => next(snapOf(path)), LAT()); return () => {}; },
      acquire: async ({ holder, ttlMs }) => {
        await new Promise((r) => setTimeout(r, LAT() / 2));
        const key = 'lease:' + path; const now = Date.now(); const cur = JSON.parse(localStorage.getItem(key) || 'null');
        if (!cur || cur.exp < now || cur.holder === holder) { const exp = now + Math.max(1000, ttlMs || 30000); localStorage.setItem(key, JSON.stringify({ holder, exp })); return { acquired: true, expiresAt: new Date(exp).toISOString(), holder }; }
        return { acquired: false, expiresAt: new Date(cur.exp).toISOString() };
      },
    }),
    collection: (coll) => ({
      get: async () => { await new Promise((r) => setTimeout(r, LAT())); if (!canRead(coll + '/x')) deny(coll, 'list'); const docs = list(coll); return { docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((d) => ({ type: 'added', doc: d })), metadata: {} }; },
      onSnapshot: (next, err) => { if (!canRead(coll + '/x')) { setTimeout(() => err && err({ code: 'permission_denied' }), 10); return () => {}; } const a = colL.get(coll) || []; a.push(next); colL.set(coll, a); setTimeout(() => { const docs = list(coll); next({ docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false }, docChanges: () => docs.map((d) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: -1 })) }); }, LAT()); return () => {}; },
    }),
  };
  const me = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel('fake-room');
  const peers = new Map();
  let mine = {};
  const handlers = [];
  const snapshot = () => Object.freeze(Array.from(peers.values()));
  const deliver = (joined = [], left = [], updated = []) => { const ps = snapshot(); handlers.forEach((h) => setTimeout(() => h({ peers: ps, joined, left, updated }), 0)); };
  peers.set(me, Object.freeze({ peer: me, by: uid, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({}), updatedAt: Date.now() }));
  bc.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'hello') { bc.postMessage({ type: 'presence', peer: me, by: uid, presence: mine }); return; }
    if (m.type === 'presence') {
      const was = peers.has(m.peer);
      const p = Object.freeze({ peer: m.peer, by: m.by, isMe: m.by === uid, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(m.presence), updatedAt: Date.now() });
      peers.set(m.peer, p);
      deliver(was ? [] : [p], [], was ? [p] : []);
    }
    if (m.type === 'bye') { const p = peers.get(m.peer); peers.delete(m.peer); deliver([], p ? [p] : [], []); }
  };
  window.addEventListener('beforeunload', () => bc.postMessage({ type: 'bye', peer: me }));
  const room = {
    presence: async (patch) => { mine = { ...mine, ...patch }; for (const k of Object.keys(mine)) if (mine[k] === null) delete mine[k]; peers.set(me, Object.freeze({ ...peers.get(me), presence: Object.freeze({ ...mine }) })); bc.postMessage({ type: 'presence', peer: me, by: uid, presence: mine }); deliver([], [], []); },
    onPeers: (h) => { handlers.push(h); setTimeout(() => h({ peers: snapshot(), joined: snapshot(), left: [], updated: [] }), 0); bc.postMessage({ type: 'hello' }); return () => {}; },
    peers: snapshot, emit: async () => {}, on: () => () => {}, connected: () => true, onConnection: () => () => {},
  };
  const NAMES = { u_alice: 'Alice Martin', u_bob: 'Bob Tremblay', u_me: 'Me', u_carl: 'Carl' };
  const COLORS = { u_alice: '#d1336b', u_bob: '#2a9d8f', u_me: '#5f6b7c' };
  const user = {
    me: async () => ({ id: uid, name: NAMES[uid] || '', avatarUrl: '', color: COLORS[uid] || '#888', email: null, isOwner: true, canEdit: true }),
    id: async () => uid, can: async () => true,
    ...(ROLES ? { isOwner: () => OWNER } : {}),
    profiles: async (ids) => Object.fromEntries((Array.isArray(ids) ? ids : [ids]).map((i) => [i, { id: i, name: NAMES[i] || '', avatarUrl: '', color: COLORS[i] || '#888', email: null, isMe: i === uid, guest: false }])),
  };
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'room' ? room : n === 'user' ? user : n === 'downloads' ? { save: async () => ({ status: 'saved' }) } : null) };
})();
