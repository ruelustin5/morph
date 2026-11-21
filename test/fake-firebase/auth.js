// Fake Firebase Auth for tests. Identity comes from ?u=<name> in the page address.
const params = new URLSearchParams(location.search);
const name = params.get('u') || 'me';
const NAMES = { alice: 'Alice Martin', bob: 'Bob Tremblay', carl: 'Carl' };
export const __state = { user: null, listeners: new Set() };
function anon() { return { uid: 'anon_' + name, isAnonymous: true, displayName: null, photoURL: null }; }
function google() { return { uid: 'g_' + name, isAnonymous: false, displayName: NAMES[name] || name, photoURL: null }; }
function emit() { __state.listeners.forEach((cb) => setTimeout(() => cb(__state.user), 0)); }
export function getAuth() { return { fake: true }; }
export function onAuthStateChanged(auth, cb) {
  __state.listeners.add(cb);
  setTimeout(() => {
    if (!__state.user && sessionStorage.getItem('fakeauth:google:' + name)) __state.user = google();
    cb(__state.user);
  }, 20);
  return () => __state.listeners.delete(cb);
}
export async function signInAnonymously() { __state.user = anon(); emit(); return { user: __state.user }; }
export class GoogleAuthProvider {}
export async function signInWithPopup() { sessionStorage.setItem('fakeauth:google:' + name, '1'); __state.user = google(); emit(); return { user: __state.user }; }
export async function signOut() { sessionStorage.removeItem('fakeauth:google:' + name); __state.user = null; emit(); }
