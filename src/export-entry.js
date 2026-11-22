// Entry of the standalone exported presentation (bundled to a single inline script).
import { createPlayer } from './player';

function boot() {
  const raw = document.getElementById('deck-data');
  if (!raw) return;
  const data = JSON.parse(raw.textContent);
  const assets = data.assets || {};
  const resolve = (v) => {
    if (typeof v === 'string' && v.startsWith('@a:')) return assets[v.slice(3)] || '';
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = resolve(v[k]); return o; }
    return v;
  };
  const project = resolve(data.project);
  const sizes = new Map();
  for (const [k, s] of Object.entries(data.sizes || {})) sizes.set(k.startsWith('@a:') ? assets[k.slice(3)] : k, s);
  const ctx = {
    size: (src) => sizes.get(src) || null,
  };
  // Always start on the first slide: when the file is opened, reloaded, or shown again from the
  // browser's cache (back/forward). An old "#3" in the address is cleared.
  try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// in some browsers */ }
  const root = document.getElementById('deck') || document.body;
  const player = createPlayer({ root, project, ctx, startIndex: 0, useHash: false });
  window.addEventListener('pageshow', (e) => { if (e.persisted) player.go(0); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => window.dispatchEvent(new Event('resize')));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
