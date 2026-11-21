// LaTeX → standalone SVG with MathJax 3 (tex-svg-full), loaded on first use from ./mathjax/.
// The SVG is self-contained (no font cache, no <use> links) so it works as an image anywhere,
// including exported presentations.

let loading = null;

export function loadMathJax() {
  if (window.MathJax && window.MathJax.tex2svgPromise) return Promise.resolve(window.MathJax);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    window.MathJax = {
      tex: {
        inlineMath: [], displayMath: [], processEscapes: false,
        // Undefined commands must be reported, not silently drawn in red.
        packages: { '[+]': ['physics'], '[-]': ['noerrors', 'noundefined'] },
        macros: { bm: ['\\boldsymbol{#1}', 1] },
      },
      loader: { load: ['[tex]/physics'], versionWarnings: false },
      svg: { fontCache: 'none' },
      options: { enableMenu: false, enableAssistiveMml: false, enableEnrichment: false, enableExplorer: false },
      startup: {
        typeset: false,
        ready: () => {
          window.MathJax.startup.defaultReady();
          window.MathJax.startup.promise.then(() => resolve(window.MathJax), reject);
        },
      },
    };
    const s = document.createElement('script');
    s.src = new URL('mathjax/tex-svg-full.js', document.baseURI).href;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error('The equation engine could not be loaded.')); };
    document.head.appendChild(s);
  });
  return loading;
}

const EX = 0.442; // ex height relative to the font size (MathJax TeX fonts)

// LaTeX packages that work here (all are always on, so \usepackage{...} lines are accepted and removed).
export const PACKAGES = ['amsmath', 'amssymb', 'mathtools', 'physics', 'mhchem', 'braket', 'cancel', 'bm', 'xcolor', 'cases', 'empheq', 'gensymb', 'upgreek', 'textcomp', 'bussproofs', 'extpfeil', 'centernot', 'colortbl', 'enclose', 'amscd'];
const BUILT_IN = new Set([...PACKAGES, 'amsfonts', 'amsthm', 'color', 'graphicx', 'mathrsfs', 'amsbsy', 'latexsym', 'inputenc', 'fontenc']);

/** Remove \usepackage / \documentclass lines; returns { tex, missing: [names not available] }. */
export function preprocess(latex) {
  const missing = [];
  const tex = String(latex || '').replace(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g, (m, names) => {
    for (const n of names.split(',').map((x) => x.trim()).filter(Boolean)) if (!BUILT_IN.has(n)) missing.push(n);
    return '';
  }).replace(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '');
  return { tex: tex.trim(), missing };
}

/**
 * Render LaTeX. Returns { svg, width, height } at the given font size (px), or { error }.
 */
export async function texToSvg(latex, { color = '#1f1f1f', fontSize = 72, display = true } = {}) {
  const MJ = await loadMathJax();
  const { tex: src, missing } = preprocess(latex);
  if (missing.length) return { error: `Not available here: ${missing.join(', ')}` };
  if (!src) return { error: 'Empty' };
  let node;
  try {
    MJ.texReset && MJ.texReset();
    node = await MJ.tex2svgPromise(src, { display });
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
  const svg = node.querySelector('svg');
  if (!svg) return { error: 'Nothing to show' };
  const err = svg.querySelector('[data-mjx-error]');
  if (err) return { error: err.getAttribute('data-mjx-error') || 'Invalid LaTeX' };
  const exPx = fontSize * EX;
  const w = parseFloat(svg.getAttribute('width')) * exPx;
  const h = parseFloat(svg.getAttribute('height')) * exPx;
  if (!(w > 0 && h > 0)) return { error: 'Nothing to show' };
  svg.setAttribute('width', w.toFixed(2));
  svg.setAttribute('height', h.toFixed(2));
  svg.removeAttribute('style');
  svg.removeAttribute('role');
  svg.removeAttribute('focusable');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  let out = svg.outerHTML.replace(/currentColor/g, color);
  // Make sure no stray accessibility markup remains.
  out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/g, '');
  return { svg: out, width: w, height: h };
}
