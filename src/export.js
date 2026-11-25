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

// Text that is safe inside an HTML comment: no "--" (which could end it early), no "<!-".
function commentSafe(text) {
  let s = String(text || '').replace(/\r\n?/g, '\n');
  while (s.includes('--')) s = s.replace(/--/g, '- -');
  return s.replace(/<!-/g, '<! -').replace(/-$/gm, '- ');
}

/** The slide's title for a person reading the code: its biggest text. */
function slideLabel(page) {
  let best = null;
  for (const el of flattenPage(page)) if (el.type === 'text' && el.text && (!best || (el.fontSize || 0) > (best.fontSize || 0))) best = el;
  const s = best ? String(best.text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
  return s.length > 70 ? s.slice(0, 69) + '…' : s;
}

/**
 * Speaker notes as HTML comments, one per slide, in slide order: not shown in the presentation,
 * but there in the code for whoever reads it.
 */
function notesComments(project, shown = false) {
  const notes = project.notes || {};
  const out = [];
  project.slides.forEach((sl, k) => {
    const n = String(notes[sl.id] || '').trim();
    if (!n) return;
    const label = slideLabel(sl.page);
    const head = `Slide ${k + 1}${label ? ` · “${label}”` : ''}`;
    out.push(`<!-- ${commentSafe(head)}\n${commentSafe(n).split('\n').map((l) => '  ' + l).join('\n')}\n-->`);
  });
  if (!out.length) return '';
  const intro = shown ? 'Speaker notes: press S in the presentation to show them. One comment per slide.' : 'Speaker notes: written in the editor, never shown in the presentation. One comment per slide.';
  return `<!-- ${intro} -->\n` + out.join('\n') + '\n';
}

/**
 * opts.notes: also put the speaker notes and who presents each slide in the file, shown in a panel
 * (S) that can be moved. opts.personName(key) gives a person's name; opts.lang sets the file's language.
 */
export async function buildExportHtml(project, ctx, opts = {}) {
  const p = deepClone(project);
  // Speaker notes are always in the code as HTML comments (below). Shown on screen, with the names of
  // the people presenting, only in the "with speaker notes" export.
  const notesHtml = notesComments(p, !!opts.notes);
  const speaker = opts.notes
    ? p.slides.map((sl) => {
      const key = (p.owners || {})[sl.id];
      return { t: String((p.notes || {})[sl.id] || ''), w: key && opts.personName ? String(opts.personName(key) || '') : '' };
    })
    : null;
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
  if (speaker && speaker.some((x) => x.t.trim() || x.w)) data.notes = speaker;
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
<html lang="${escHtml(opts.lang || 'en')}">
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
${notesHtml}<div id="deck"></div>
<script id="deck-data" type="application/json">${json}</script>
<script>${safeCode}</script>
</body>
</html>`;
}

export function exportFileName(project, { notes = false } = {}) {
  const base = (project.title || 'presentation').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'presentation';
  return base + (notes ? '-notes' : '') + '.html';
}
