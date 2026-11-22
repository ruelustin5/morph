// Builds the standalone .html presentation.
import playerCode from '../build/player.txt';
import { collectFonts, googleFontsUrl, flattenPage } from './render';
import { deepClone } from './project';
import { hashStr } from './storage';

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function loadSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function buildExportHtml(project, ctx) {
  const p = deepClone(project);
  // Speaker notes, slide owners and names stay in the app: the exported file is for the audience.
  delete p.notes; delete p.owners; delete p.settings; delete p.objects;
  // Resolve SVG color replacements to final images so the player needs no SVG tooling.
  const walk = (children) => {
    for (const el of children || []) {
      if (el.type === 'group') { walk(el.children); continue; }
      if (el.type === 'svg') { el.src = ctx.svgSrc(el); delete el.colorsReplace; }
    }
  };
  for (const s of p.slides) walk(s.page.children);

  // Natural sizes of raster images (needed for crop math).
  const sizes = {};
  const srcs = new Set();
  for (const s of p.slides) for (const el of flattenPage(s.page)) if ((el.type === 'image' || el.type === 'gif') && el.src) srcs.add(el.src);
  await Promise.all(Array.from(srcs).map(async (src) => { const sz = ctx.size(src) || (await loadSize(src)); if (sz) sizes[src] = sz; }));

  // De-duplicate big data URLs (duplicated slides share the same images).
  const assets = {};
  const keyOf = new Map();
  const dedupe = (v) => {
    if (typeof v === 'string') {
      if (v.length > 1024 && v.startsWith('data:')) {
        let k = keyOf.get(v);
        if (!k) { k = hashStr(v).slice(0, 12); keyOf.set(v, k); assets[k] = v; }
        return '@a:' + k;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(dedupe);
    if (v && typeof v === 'object') { const o = {}; for (const kk of Object.keys(v)) o[kk] = dedupe(v[kk]); return o; }
    return v;
  };
  const slim = {
    width: p.width, height: p.height,
    slides: p.slides.map((s) => ({ page: dedupe(s.page), anim: s.anim || {} })),
  };
  const sizesOut = {};
  for (const [src, sz] of Object.entries(sizes)) sizesOut[keyOf.has(src) ? '@a:' + keyOf.get(src) : src] = sz;
  const data = { project: slim, assets, sizes: sizesOut };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  const families = collectFonts(p);
  const customFonts = (p.fonts || []).filter((f) => families.includes(f.fontFamily));
  const custom = new Set(customFonts.map((f) => f.fontFamily));
  const links = families.filter((f) => !custom.has(f)).map((f) => `<link rel="stylesheet" href="${escHtml(googleFontsUrl(f))}">`).join('\n');
  const faces = customFonts.map((f) => {
    const styles = f.styles || (f.url ? [{ src: `url("${f.url}")` }] : []);
    return styles.map((s) => `@font-face{font-family:'${f.fontFamily}';src:${s.src};font-style:${s.fontStyle || 'normal'};font-weight:${s.fontWeight || 'normal'};font-display:swap}`).join('\n');
  }).join('\n');
  const title = project.title || 'Presentation';
  const safeCode = playerCode.replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
${links ? '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' + links : ''}
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden}
#deck{position:fixed;inset:0}
${faces}
</style>
</head>
<body>
<div id="deck"></div>
<script id="deck-data" type="application/json">${json}</script>
<script>${safeCode}</script>
</body>
</html>`;
}

export function exportFileName(project) {
  const base = (project.title || 'presentation').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'presentation';
  return base + '.html';
}
