// Read the command definitions out of a .sty or .tex file so the equation engine (MathJax) can use them.
// MathJax cannot run a real LaTeX package, but most math packages and preambles are mostly
// \newcommand / \DeclareMathOperator lines, and those it can use as macros.
//
// parseMacros(text) → { macros, envs, required, skipped }
//   macros:   { name: body | [body, n] | [body, n, default] }   (MathJax "macros" format)
//   envs:     { name: [begin, end] | [begin, end, n] }           (MathJax "environments" format)
//   required: package names found in \usepackage / \RequirePackage
//   skipped:  names of definitions that cannot work here (LaTeX internals, complex argument specs)

export const LIMITS = { macros: 600, body: 4000, files: 12, bytes: 120000 };

const DEF = /\\(newcommand|renewcommand|providecommand|DeclareRobustCommand|DeclareMathOperator|DeclarePairedDelimiter|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand|newenvironment|renewenvironment|def|gdef|edef|xdef|let|usepackage|RequirePackage)(?![A-Za-z@])/g;

function stripComments(src) {
  return String(src || '').replace(/\r\n?/g, '\n').split('\n').map((line) => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] === '%') return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

// Commands that only matter to LaTeX's typesetting, not to math: removed from bodies.
const clean = (body) => body
  .replace(/\\ensuremath(?![A-Za-z])/g, '')
  .replace(/\\(?:xspace|protect|relax|nobreak|leavevmode|ignorespaces|unskip)(?![A-Za-z])\s*/g, '')
  .trim();

export function parseMacros(text) {
  const src = stripComments(text);
  const macros = {}, envs = {}, required = [], skipped = [];
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const group = () => {
    ws();
    if (src[i] !== '{') return null;
    const s = i;
    let d = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '{') d++;
      else if (ch === '}' && --d === 0) { i++; return src.slice(s + 1, i - 1); }
    }
    i = s;
    return null;
  };
  const optional = () => {
    ws();
    if (src[i] !== '[') return null;
    const s = i;
    let d = 0;
    for (i++; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '{') d++;
      else if (ch === '}') d--;
      else if (ch === ']' && d === 0) { i++; return src.slice(s + 1, i - 1); }
    }
    i = s;
    return null;
  };
  const cs = () => {
    ws();
    const m = /^\\([A-Za-z@]+|[^A-Za-z@\s])/.exec(src.slice(i, i + 80));
    if (!m) return null;
    i += m[0].length;
    return m[1];
  };
  const csName = () => {
    ws();
    if (src[i] === '{') {
      const g = group();
      const m = /^\s*\\([A-Za-z@]+|[^A-Za-z@\s])\s*$/.exec(g || '');
      return m ? m[1] : null;
    }
    return cs();
  };
  const star = () => { ws(); if (src[i] === '*') { i++; return true; } return false; };
  const ok = (name, body) => name && !name.includes('@') && body != null && !body.includes('@') && body.length <= LIMITS.body;
  const put = (name, value, provide) => {
    if (provide && name in macros) return;
    if (Object.keys(macros).length >= LIMITS.macros && !(name in macros)) { skipped.push(name); return; }
    macros[name] = value;
  };

  DEF.lastIndex = 0;
  let m;
  while ((m = DEF.exec(src))) {
    const kind = m[1];
    i = m.index + m[0].length;
    let name = null;
    try {
      if (kind === 'usepackage' || kind === 'RequirePackage') {
        optional();
        const g = group();
        if (g) for (const n of g.split(',').map((x) => x.trim()).filter(Boolean)) required.push(n);
      } else if (kind === 'newcommand' || kind === 'renewcommand' || kind === 'providecommand' || kind === 'DeclareRobustCommand') {
        star();
        name = csName();
        const n = optional();
        const dflt = n != null ? optional() : null;
        const body = group();
        const k = n == null ? 0 : parseInt(n, 10);
        if (!ok(name, body) || !(k >= 0 && k <= 9)) throw 0;
        const b = clean(body);
        put(name, k ? (dflt != null ? [b, k, dflt] : [b, k]) : b, kind === 'providecommand');
      } else if (kind === 'DeclareMathOperator') {
        const s = star();
        name = csName();
        const body = group();
        if (!ok(name, body)) throw 0;
        put(name, `\\operatorname${s ? '*' : ''}{${clean(body)}}`);
      } else if (kind === 'DeclarePairedDelimiter') {
        name = csName();
        const l = group(), r = group();
        if (!ok(name, l) || !ok(name, r)) throw 0;
        put(name, [`\\left${l.trim()} #1 \\right${r.trim()}`, 1]);
      } else if (/DocumentCommand$/.test(kind)) {
        name = csName();
        const spec = group();
        const body = group();
        if (!ok(name, body) || spec == null) throw 0;
        // Only plain arguments (m), optionally with one leading O{default}.
        const sm = /^\s*(?:O\{([^{}]*)\})?\s*((?:m\s*)*)$/.exec(spec);
        if (!sm) throw 0;
        const k = (sm[2].match(/m/g) || []).length + (sm[1] != null ? 1 : 0);
        if (k > 9) throw 0;
        put(name, k ? (sm[1] != null ? [clean(body), k, sm[1]] : [clean(body), k]) : clean(body), kind === 'ProvideDocumentCommand');
      } else if (kind === 'newenvironment' || kind === 'renewenvironment') {
        star();
        ws();
        const env = group();
        name = env;
        const n = optional();
        const dflt = n != null ? optional() : null;
        const begin = group(), end = group();
        const k = n == null ? 0 : parseInt(n, 10);
        if (!env || !/^[A-Za-z*]+$/.test(env.trim()) || !ok('x', begin) || !ok('x', end) || dflt != null || !(k >= 0 && k <= 9)) throw 0;
        envs[env.trim()] = k ? [clean(begin), clean(end), k] : [clean(begin), clean(end)];
      } else if (kind === 'let') {
        name = cs();
        ws();
        if (src[i] === '=') i++;
        const target = cs();
        if (!name || !target || name.includes('@') || target.includes('@')) throw 0;
        put(name, '\\' + target + (/^[A-Za-z]/.test(target) ? ' ' : ''));
      } else {
        // \def\name#1#2{body}: only undelimited parameters.
        name = cs();
        const s = i;
        while (i < src.length && src[i] !== '{' && i - s < 40) i++;
        const params = src.slice(s, i).replace(/\s+/g, '');
        if (!/^(#[1-9])*$/.test(params)) throw 0;
        const k = params.length / 2;
        const body = group();
        if (!ok(name, body)) throw 0;
        put(name, k ? [clean(body), k] : clean(body));
      }
    } catch (e) {
      if (name && typeof name === 'string' && !name.includes('@')) skipped.push(name);
      else if (name == null && kind !== 'usepackage' && kind !== 'RequirePackage') {
        // A definition of an internal (\@foo) or one we could not read: not worth listing.
      }
      i = m.index + m[0].length;
    }
    DEF.lastIndex = Math.max(i, m.index + m[0].length);
  }
  return { macros, envs, required: [...new Set(required)], skipped: [...new Set(skipped)] };
}

/** Sample use of a macro for a test render: \name{x}{y}… */
export function sampleUse(name, value) {
  const n = Array.isArray(value) ? value[1] || 0 : 0;
  const optional = Array.isArray(value) && value.length > 2;
  const args = [];
  for (let k = optional ? 1 : 0; k < n; k++) args.push('{' + 'xyzabcdef'[k] + '}');
  return '\\' + name + (/^[A-Za-z]/.test(name) ? ' ' : '') + args.join('');
}
