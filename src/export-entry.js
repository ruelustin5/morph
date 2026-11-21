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
  let start = 0;
  const m = /^#(\d+)$/.exec(location.hash || '');
  if (m) start = Math.max(0, Math.min(project.slides.length - 1, parseInt(m[1], 10) - 1));
  const root = document.getElementById('deck') || document.body;
  createPlayer({ root, project, ctx, startIndex: start, useHash: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => window.dispatchEvent(new Event('resize')));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
