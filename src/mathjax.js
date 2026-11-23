import { t } from './i18n';
import { sampleUse } from './latex-macros';
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
        packages: ['base', 'ams', 'configmacros'],
        macros: { bm: ['\\boldsymbol{#1}', 1] },
      },
      loader: { versionWarnings: false },
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
    s.onerror = () => { loading = null; reject(new Error(t('The equation engine could not be loaded.'))); };
    document.head.appendChild(s);
  });
  return loading;
}

const EX = 0.442; // ex height relative to the font size (MathJax TeX fonts)

// ---------------------------------------------------------------------------------------------
// Packages. "mj" ones are MathJax extensions (physics is downloaded the first time it is turned on);
// "macros" ones are small versions written here. A presentation keeps its list in settings.latex.packages,
// so nobody has to write \usepackage (it still works: a known package named there is turned on for that equation).
// ---------------------------------------------------------------------------------------------
const PLUMBING = ['base', 'configmacros', 'newcommand', 'tagformat', 'textmacros', 'action', 'unicode', 'verb', 'bbox', 'html', 'color', 'ams', 'boldsymbol'];
export const LATEX_PACKAGES = [
  { id: 'amsmath', mj: 'ams', locked: true, desc: 'Aligned equations, matrices, \\text', ex: '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}' },
  { id: 'amssymb', mj: 'ams', locked: true, desc: 'Extra symbols: \\mathbb, \\leqslant…', ex: '\\mathbb{R}, \\leqslant' },
  { id: 'bm', mj: 'boldsymbol', locked: true, desc: 'Bold symbols', ex: '\\bm{\\alpha}' },
  { id: 'mathtools', mj: 'mathtools', desc: 'More AMS tools: \\coloneqq, \\underbrace…', ex: 'x \\coloneqq 2' },
  { id: 'physics', mj: 'physics', load: true, desc: 'Derivatives, bra-kets, vectors: \\dv, \\pdv, \\ket, \\abs', ex: '\\pdv{f}{x}, \\ket{\\psi}' },
  { id: 'mhchem', mj: 'mhchem', desc: 'Chemistry: \\ce', ex: '\\ce{2H2 + O2 -> 2H2O}' },
  { id: 'braket', mj: 'braket', desc: 'Dirac notation: \\Braket, \\Set', ex: '\\Braket{\\phi | \\psi}' },
  { id: 'cancel', mj: 'cancel', desc: 'Strike out terms', ex: '\\cancel{x}' },
  { id: 'cases', mj: 'cases', desc: 'Numbered cases', ex: '\\begin{numcases}{f(x)=} 1 & x>0 \\end{numcases}' },
  { id: 'empheq', mj: 'empheq', desc: 'Boxes and braces around equations', ex: '\\begin{empheq}[left=\\empheqlbrace]{align} a&=b \\end{empheq}' },
  { id: 'gensymb', mj: 'gensymb', desc: '\\degree, \\celsius, \\ohm', ex: '90\\degree' },
  { id: 'upgreek', mj: 'upgreek', desc: 'Upright Greek letters', ex: '\\upmu' },
  { id: 'textcomp', mj: 'textcomp', desc: 'Text symbols', ex: '\\textdegree' },
  { id: 'bussproofs', mj: 'bussproofs', desc: 'Proof trees', ex: '\\begin{prooftree}\\AxiomC{A}\\UnaryInfC{B}\\end{prooftree}' },
  { id: 'extpfeil', mj: 'extpfeil', desc: 'Extensible arrows', ex: '\\xtwoheadrightarrow{f}' },
  { id: 'centernot', mj: 'centernot', desc: 'Centered negation', ex: '\\centernot\\implies' },
  { id: 'enclose', mj: 'enclose', desc: 'Circles and boxes: \\enclose', ex: '\\enclose{circle}{x}' },
  { id: 'amscd', mj: 'amscd', desc: 'Commutative diagrams', ex: '\\begin{CD} A @>f>> B \\end{CD}' },
  { id: 'colortbl', mj: 'colortbl', desc: 'Colored table cells', ex: '\\begin{array}{c}\\rowcolor{yellow} x\\end{array}' },
  {
    id: 'siunitx', desc: 'Units (simple version): \\qty, \\SI, \\si, \\num. Its \\qty replaces the one from physics.', ex: '\\qty{9.81}{\\meter\\per\\second\\squared}',
    macros: {
      SI: ['#1\\,\\mathrm{#2}', 2], qty: ['#1\\,\\mathrm{#2}', 2], si: ['\\mathrm{#1}', 1], unit: ['\\mathrm{#1}', 1], num: ['#1', 1], ang: ['#1^{\\circ}', 1],
      per: '/', squared: '^{2}', cubed: '^{3}',
      meter: 'm', metre: 'm', second: 's', kilogram: 'kg', gram: 'g', newton: 'N', joule: 'J', watt: 'W', kelvin: 'K', ampere: 'A', volt: 'V',
      ohm: '\\Omega', hertz: 'Hz', pascal: 'Pa', coulomb: 'C', tesla: 'T', mole: 'mol', candela: 'cd', electronvolt: 'eV', liter: 'L', litre: 'L',
      kilo: 'k', mega: 'M', giga: 'G', milli: 'm', micro: '\\mu{}', nano: 'n', pico: 'p', centi: 'c', degreeCelsius: '{}^{\\circ}C',
    },
  },
  { id: 'dsfont', desc: 'Double-struck letters: \\mathds', ex: '\\mathds{1}', macros: { mathds: ['\\mathbb{#1}', 1] } },
  { id: 'bbm', desc: 'Double-struck letters: \\mathbbm', ex: '\\mathbbm{1}', macros: { mathbbm: ['\\mathbb{#1}', 1] } },
  { id: 'esint', desc: 'More integrals: \\oiint, \\oiiint', ex: '\\oiint_S \\vec{E}\\cdot d\\vec{A}', macros: { oiint: '\\mathop{\\unicode{x222F}}\\nolimits', oiiint: '\\mathop{\\unicode{x2230}}\\nolimits' } },
  { id: 'xfrac', desc: 'Slanted fractions: \\sfrac', ex: '\\sfrac{1}{2}', macros: { sfrac: ['{}^{#1}\\!/\\!{}_{#2}', 2] } },
  { id: 'nicefrac', desc: 'Slanted fractions: \\nicefrac', ex: '\\nicefrac{1}{2}', macros: { nicefrac: ['{}^{#1}\\!/\\!{}_{#2}', 2] } },
];
const BY_ID = new Map(LATEX_PACKAGES.map((p) => [p.id, p]));
export const DEFAULT_PACKAGES = LATEX_PACKAGES.filter((p) => p.mj).map((p) => p.id);
export const IGNORED = new Set(['amsfonts', 'amsthm', 'color', 'graphicx', 'mathrsfs', 'amsbsy', 'latexsym', 'inputenc', 'fontenc', 'xcolor', 'geometry', 'hyperref', 'babel']);

/** Packages on for a presentation (its settings), always including the locked ones. */
export function enabledPackages(settings) {
  const list = settings && settings.latex && Array.isArray(settings.latex.packages) ? settings.latex.packages : DEFAULT_PACKAGES;
  const out = new Set(list.filter((id) => BY_ID.has(id)));
  for (const p of LATEX_PACKAGES) if (p.locked) out.add(p.id);
  return out;
}

/** Remove \usepackage / \documentclass lines; returns { tex, named: [known packages], missing: [unknown] }. */
export function preprocess(latex, own = null) {
  const missing = [], named = [];
  const mine = new Set(own || []);
  const tex = String(latex || '').replace(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g, (m, names) => {
    for (const n of names.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (BY_ID.has(n)) named.push(n);
      else if (!IGNORED.has(n) && !mine.has(n)) missing.push(n);
    }
    return '';
  }).replace(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '');
  return { tex: tex.trim(), named, missing };
}

// ---------------------------------------------------------------------------------------------
// Your own commands: files (.sty / .tex) whose \newcommand-style lines were read into macros
// (src/latex-macros.js). A presentation keeps them in settings.latex.files: [{ id, name, on, macros, envs }].
// ---------------------------------------------------------------------------------------------
export function customFiles(settings) {
  const f = settings && settings.latex && settings.latex.files;
  return Array.isArray(f) ? f.filter((x) => x && typeof x.id === 'string' && x.macros && typeof x.macros === 'object') : [];
}

const MACRO_NAME = /^(?:[A-Za-z]{1,60}|[^A-Za-z@\s])$/;
const goodValue = (v) => (typeof v === 'string' && v.length <= 4000)
  || (Array.isArray(v) && typeof v[0] === 'string' && v[0].length <= 4000 && Number.isInteger(v[1]) && v[1] >= 0 && v[1] <= 9 && (v.length < 3 || typeof v[2] === 'string') && v.length <= 3);

/** Macros and environments of the files that are on, merged in list order (later files win). */
export function customMacros(settings) {
  const macros = Object.create(null), envs = Object.create(null), names = [];
  let key = '';
  for (const f of customFiles(settings)) {
    names.push(String(f.name || '').replace(/\.(sty|tex)$/i, ''));
    if (!f.on) continue;
    // Settings come from everyone in the presentation: copy only well-formed entries.
    for (const [k, v] of Object.entries(f.macros)) if (MACRO_NAME.test(k) && goodValue(v)) macros[k] = v;
    for (const [k, v] of Object.entries(f.envs || {})) if (/^[A-Za-z*]{1,40}$/.test(k) && Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') envs[k] = v.slice(0, 3);
    key += f.id + ':' + (f.rev || 0) + ';';
  }
  return { macros, envs, key, names };
}

let configured = '';
async function configure(MJ, ids, custom = null) {
  const key = [...ids].sort().join(',') + '|' + (custom ? custom.key : '');
  if (key === configured) return;
  const pk = new Set(PLUMBING);
  const macros = { bm: ['\\boldsymbol{#1}', 1] };
  for (const id of ids) {
    const p = BY_ID.get(id);
    if (!p) continue;
    if (p.mj) pk.add(p.mj);
    if (p.macros) Object.assign(macros, p.macros);
    if (p.load && !(MJ._loaded || (MJ._loaded = new Set())).has(p.mj)) {
      await MJ.loader.load('[tex]/' + p.mj);
      MJ._loaded.add(p.mj);
    }
  }
  if (custom) Object.assign(macros, custom.macros);
  MJ.config.tex.packages = [...pk];
  MJ.config.tex.macros = macros;
  MJ.config.tex.environments = (custom && custom.envs) || {};
  MJ.startup.getComponents();
  configured = key;
}

/**
 * Render LaTeX. Returns { svg, width, height } at the given font size (px), or { error }.
 */
export async function texToSvg(latex, { color = '#1f1f1f', fontSize = 72, display = true, packages = null, custom = null } = {}) {
  const MJ = await loadMathJax();
  const { tex: src, missing, named } = preprocess(latex, custom && custom.names);
  if (missing.length) return { error: t('Not available here: {list}', { list: missing.join(', ') }) };
  if (!src) return { error: t('Empty') };
  const ids = new Set(packages || DEFAULT_PACKAGES);
  for (const p of LATEX_PACKAGES) if (p.locked) ids.add(p.id);
  for (const n of named) ids.add(n);
  let node;
  try {
    await configure(MJ, ids, custom);
    MJ.texReset && MJ.texReset();
    node = await MJ.tex2svgPromise(src, { display });
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
  const svg = node.querySelector('svg');
  if (!svg) return { error: t('Nothing to show') };
  const err = svg.querySelector('[data-mjx-error]');
  if (err) return { error: err.getAttribute('data-mjx-error') || t('Invalid LaTeX') };
  const exPx = fontSize * EX;
  const w = parseFloat(svg.getAttribute('width')) * exPx;
  const h = parseFloat(svg.getAttribute('height')) * exPx;
  if (!(w > 0 && h > 0)) return { error: t('Nothing to show') };
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

export const isKnownPackage = (id) => BY_ID.has(id);

/**
 * Try each macro of a parsed file in the equation engine and drop the ones that fail
 * (they use commands MathJax does not have). Returns { macros, envs, failed: [names] }.
 */
export async function checkMacros(parsed, packages) {
  const MJ = await loadMathJax();
  const ids = new Set(packages || DEFAULT_PACKAGES);
  for (const p of LATEX_PACKAGES) if (p.locked) ids.add(p.id);
  const macros = { ...parsed.macros }, envs = { ...parsed.envs }, failed = [];
  const fatal = /undefined control sequence|unknown environment|maximum macro substitution|recursive|not allowed in|missing (?:argument|or unrecognized)/i;
  for (let round = 0; round < 3; round++) {
    let changed = false;
    await configure(MJ, ids, { macros, envs, key: 'check' + Math.random() });
    const test = async (tex) => {
      try {
        MJ.texReset && MJ.texReset();
        const node = await MJ.tex2svgPromise(tex, { display: true });
        const err = node.querySelector('[data-mjx-error]');
        return err ? err.getAttribute('data-mjx-error') || 'error' : '';
      } catch (e) { return (e && e.message) || 'error'; }
    };
    for (const [name, v] of Object.entries(macros)) {
      const e = await test(sampleUse(name, v));
      if (e && fatal.test(e)) { delete macros[name]; failed.push(name); changed = true; }
    }
    for (const [name, v] of Object.entries(envs)) {
      const e = await test(`\\begin{${name}}${'{x}'.repeat(v[2] || 0)} x \\end{${name}}`);
      if (e && fatal.test(e)) { delete envs[name]; failed.push(name); changed = true; }
    }
    if (!changed) break;
  }
  configured = '';
  return { macros, envs, failed };
}
