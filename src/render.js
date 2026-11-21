// Pure DOM renderer for editor page JSON + interpolation helpers.
// Used for slide thumbnails, the in-app presenter and the exported standalone player,
// so what you see in the slide list is exactly what gets presented.
// Rendering rules follow the editor's own HTML exporter (utils/to-html.ts).
import { subTypeToPathDataFunc } from 'opn/utils/figure-to-svg';
import { shapeFilterToCSS } from 'opn/utils/filters';
import { getCornerRadii, clampCornerRadii } from 'opn/utils/corner-radius';

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    if (t < 0 || t > 1) {
      let lo = 0, hi = 1; t = x;
      for (let i = 0; i < 30; i++) { const v = sx(t); if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    }
    return sy(t);
  };
}
function bounceOut(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
export const EASINGS = {
  linear: { label: 'Linear', fn: (x) => x },
  ease: { label: 'Ease', fn: bezier(0.25, 0.1, 0.25, 1) },
  'ease-in': { label: 'Ease in', fn: bezier(0.42, 0, 1, 1) },
  'ease-out': { label: 'Ease out', fn: bezier(0, 0, 0.58, 1) },
  'ease-in-out': { label: 'Ease in-out', fn: bezier(0.42, 0, 0.58, 1) },
  back: { label: 'Overshoot', fn: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); } },
  elastic: { label: 'Elastic', fn: (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1) },
  bounce: { label: 'Bounce', fn: bounceOut },
};
export const easeFn = (name) => (EASINGS[name] || EASINGS.linear).fn;

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
/** Flatten groups: groups in the editor have no transform of their own, children use page coordinates. */
export function flattenPage(page) {
  const out = [];
  const walk = (children, mul) => {
    for (const el of children || []) {
      if (el.visible === false || el.showInExport === false) continue;
      if (el.type === 'group') {
        walk(el.children, mul * (el.opacity ?? 1));
      } else if (el.type !== 'audio') {
        out.push(mul === 1 ? el : { ...el, opacity: (el.opacity ?? 1) * mul });
      }
    }
  };
  walk(page && page.children, 1);
  return out;
}

const isImageBackground = (bg) => !!bg && (bg.indexOf('url') >= 0 || bg.indexOf('http') === 0 || bg.indexOf('data:') === 0 || /\.(jpe?g|png|webp|gif|svg)/i.test(bg));

export function backgroundCSS(bg) {
  if (!bg) return { background: 'white' };
  if (isImageBackground(bg)) {
    const url = bg.indexOf('url(') === 0 ? bg : `url("${bg}")`;
    return { background: `${url} center / cover no-repeat` };
  }
  return { background: bg };
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
let _ctx2d = null;
const _colorCache = new Map();
export function parseColor(c) {
  if (c == null) return null;
  if (_colorCache.has(c)) return _colorCache.get(c);
  let res = null;
  if (typeof c === 'string' && c.indexOf('gradient') < 0) {
    try {
      if (!_ctx2d) _ctx2d = document.createElement('canvas').getContext('2d');
      _ctx2d.fillStyle = '#010203';
      _ctx2d.fillStyle = c;
      const v = _ctx2d.fillStyle;
      if (v === '#010203' && c.replace(/\s/g, '').toLowerCase() !== '#010203') res = null;
      else if (v[0] === '#') res = [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
      else {
        const m = v.match(/rgba?\(([^)]+)\)/);
        if (m) { const p = m[1].split(',').map((s) => parseFloat(s)); res = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
      }
    } catch (e) { res = null; }
  }
  if (_colorCache.size > 2000) _colorCache.clear();
  _colorCache.set(c, res);
  return res;
}
const isGradient = (c) => typeof c === 'string' && c.indexOf('gradient') >= 0;

function lerpColor(a, b, t) {
  if (a === b) return a;
  const ca = parseColor(a), cb = parseColor(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const tt = Math.max(0, Math.min(1, t));
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * tt);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * tt);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * tt);
  const al = ca[3] + (cb[3] - ca[3]) * tt;
  return `rgba(${r},${g},${bl},${Math.round(al * 1000) / 1000})`;
}

function withOpacity(color, opacity) {
  if (opacity === 1 || opacity == null) return color;
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c[0]},${c[1]},${c[2]},${c[3] * opacity})`;
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------
const NUM_PROPS = [
  'x', 'y', 'width', 'height', 'opacity', 'fontSize', 'letterSpacing', 'strokeWidth',
  'cornerRadius', 'cornerRadiusTopLeft', 'cornerRadiusTopRight', 'cornerRadiusBottomRight', 'cornerRadiusBottomLeft',
  'cropX', 'cropY', 'cropWidth', 'cropHeight', 'blurRadius', 'brightness', 'shadowBlur', 'shadowOffsetX',
  'shadowOffsetY', 'shadowOpacity', 'borderSize', 'backgroundOpacity', 'backgroundPadding',
  'backgroundCornerRadius', 'curvePower',
];
const COLOR_PROPS = ['fill', 'stroke', 'color', 'borderColor', 'shadowColor', 'backgroundColor'];

// Properties that cannot be interpolated: when they differ the old and new looks cross-fade.
export function contentKey(el) {
  switch (el.type) {
    case 'text':
      return ['t', el.text, el.fontFamily, el.fontWeight, el.fontStyle, el.textDecoration, el.textTransform,
        el.align, el.verticalAlign, el.curveEnabled ? 1 : 0, isGradient(el.fill) ? el.fill : ''].join('\u0001');
    case 'image': case 'svg': case 'gif':
      return ['i', el.src, el.clipSrc || '', el.maskSrc || '', el.flipX ? 1 : 0, el.flipY ? 1 : 0, el.colorsReplace ? JSON.stringify(el.colorsReplace) : ''].join('\u0001');
    case 'figure':
      return ['f', el.subType, isGradient(el.fill) ? el.fill : '', (el.dash || []).join(',')].join('\u0001');
    case 'line':
      return ['l', el.startHead, el.endHead, (el.dash || []).join(',')].join('\u0001');
    case 'video':
      return ['v', el.src].join('\u0001');
    default:
      return el.type + '\u0001' + JSON.stringify(el).length;
  }
}

/** Interpolated element state between a and b. Discrete props come from `discreteFrom`. */
export function lerpEl(a, b, t, discreteFrom) {
  const base = discreteFrom || (t < 0.5 ? a : b);
  const out = { ...base };
  // Enable/disable toggles interpolate through a neutral value.
  const A = { ...a }, B = { ...b };
  if (!!A.shadowEnabled !== !!B.shadowEnabled) {
    if (!A.shadowEnabled) { A.shadowOpacity = 0; A.shadowBlur = B.shadowBlur; A.shadowOffsetX = B.shadowOffsetX; A.shadowOffsetY = B.shadowOffsetY; A.shadowColor = B.shadowColor; }
    else { B.shadowOpacity = 0; B.shadowBlur = A.shadowBlur; B.shadowOffsetX = A.shadowOffsetX; B.shadowOffsetY = A.shadowOffsetY; B.shadowColor = A.shadowColor; }
    out.shadowEnabled = true;
  }
  if (!!A.blurEnabled !== !!B.blurEnabled) { if (!A.blurEnabled) A.blurRadius = 0; else B.blurRadius = 0; out.blurEnabled = true; }
  if (!!A.brightnessEnabled !== !!B.brightnessEnabled) { if (!A.brightnessEnabled) A.brightness = 0; else B.brightness = 0; out.brightnessEnabled = true; }
  if (A.type === 'text' && !!A.backgroundEnabled !== !!B.backgroundEnabled) {
    if (!A.backgroundEnabled) { A.backgroundOpacity = 0; A.backgroundColor = B.backgroundColor; } else { B.backgroundOpacity = 0; B.backgroundColor = A.backgroundColor; }
    out.backgroundEnabled = true;
  }
  for (const k of NUM_PROPS) {
    const va = A[k], vb = B[k];
    if (typeof va === 'number' && typeof vb === 'number' && va !== vb) out[k] = va + (vb - va) * t;
  }
  if (typeof A.lineHeight === 'number' && typeof B.lineHeight === 'number') out.lineHeight = A.lineHeight + (B.lineHeight - A.lineHeight) * t;
  // rotation: shortest path
  const ra = A.rotation || 0, rb = B.rotation || 0;
  if (ra !== rb) { let d = ((rb - ra) % 360 + 540) % 360 - 180; out.rotation = ra + d * t; }
  for (const k of COLOR_PROPS) {
    const va = A[k], vb = B[k];
    if (typeof va === 'string' && typeof vb === 'string' && va !== vb && !isGradient(va) && !isGradient(vb)) out[k] = lerpColor(va, vb, t);
  }
  if (out.opacity != null) out.opacity = Math.max(0, Math.min(1, out.opacity));
  for (const k of ['width', 'height', 'fontSize', 'strokeWidth', 'blurRadius', 'shadowBlur', 'borderSize']) if (typeof out[k] === 'number' && out[k] < 0) out[k] = 0;
  for (const k of ['cropWidth', 'cropHeight']) if (typeof out[k] === 'number' && out[k] <= 0.0001) out[k] = 0.0001;
  return out;
}

// ---------------------------------------------------------------------------
// Element painting
// ---------------------------------------------------------------------------
const BLEND = new Set(['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']);
let _uid = 0;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = (v) => (Math.round(v * 100) / 100) + 'px';

function cornerRadii(el) {
  const r = getCornerRadii(el);
  if (!r.topLeft && !r.topRight && !r.bottomRight && !r.bottomLeft) return '0';
  const c = clampCornerRadii(Math.max(0, el.width || 0), Math.max(0, el.height || 0), r);
  return `${px(c.topLeft)} ${px(c.topRight)} ${px(c.bottomRight)} ${px(c.bottomLeft)}`;
}

/** Paint the wrapper (geometry + effects) of an object node. */
export function paintWrapper(node, el, opacityMul = 1) {
  const s = node.style;
  s.left = px(el.x || 0);
  s.top = px(el.y || 0);
  s.width = px(Math.max(0, el.width || 0));
  s.height = px(Math.max(0, el.height || 0));
  s.transform = el.rotation ? `rotate(${el.rotation}deg)` : 'none';
  s.opacity = String(Math.max(0, Math.min(1, (el.opacity ?? 1) * opacityMul)));
  const filters = [];
  if (el.blurEnabled && el.blurRadius > 0) filters.push(`blur(${el.blurRadius / 2}px)`);
  if (el.brightnessEnabled) filters.push(`brightness(${100 * (el.brightness || 0) + 100}%)`);
  if (el.sepiaEnabled) filters.push('sepia()');
  if (el.grayscaleEnabled) filters.push('grayscale()');
  let extras = '';
  if (el.filters && typeof el.filters === 'object') {
    for (const key of Object.keys(el.filters)) {
      const val = el.filters[key];
      const css = shapeFilterToCSS(key, val && val.intensity);
      if (css) { filters.push(css.filter); if (css.html) extras += css.html; }
    }
  }
  if (el.shadowEnabled && (el.shadowOpacity ?? 1) > 0) {
    filters.push(`drop-shadow(${el.shadowOffsetX || 0}px ${el.shadowOffsetY || 0}px ${(el.shadowBlur || 0) / 2}px ${withOpacity(el.shadowColor || 'black', el.shadowOpacity ?? 1)})`);
  }
  s.filter = filters.join(' ') || 'none';
  s.mixBlendMode = BLEND.has(el.blendMode) ? el.blendMode : 'normal';
  if (node.__extras !== extras) {
    node.__extras = extras;
    let ex = node.querySelector(':scope > .mx');
    if (extras) {
      if (!ex) { ex = document.createElement('div'); ex.className = 'mx'; ex.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; node.appendChild(ex); }
      ex.innerHTML = extras;
    } else if (ex) ex.remove();
  }
}

function paintText(layer, el) {
  const key = 'text:' + (el.curveEnabled ? 'c' : 'n');
  if (layer.__kind !== key) {
    layer.__kind = key; layer.__content = null;
    layer.innerHTML = '';
    const bg = document.createElement('div'); bg.className = 'mbg'; bg.style.position = 'absolute';
    const tx = document.createElement('div'); tx.className = 'mtx';
    layer.appendChild(bg); layer.appendChild(tx);
  }
  const bg = layer.firstChild, tx = layer.lastChild;
  const fontSize = el.fontSize || 14;
  const lh = typeof el.lineHeight === 'number' ? el.lineHeight : parseFloat(el.lineHeight) || 1.2;
  const bgPad = (el.backgroundPadding || 0) * (fontSize * lh);
  const bs = bg.style;
  bs.display = el.backgroundEnabled ? 'block' : 'none';
  if (el.backgroundEnabled) {
    bs.top = px(-bgPad / 2); bs.left = px(-bgPad / 2);
    bs.width = px((el.width || 0) + bgPad); bs.height = px((el.height || 0) + bgPad);
    bs.backgroundColor = el.backgroundColor || 'transparent';
    bs.opacity = String(el.backgroundOpacity ?? 1);
    bs.borderRadius = px((el.backgroundCornerRadius || 0) * (fontSize * lh * 0.5));
  }
  if (el.curveEnabled) {
    const text = String(el.text || '').replace(/<[^>]*>/g, '').replace(/\n/g, ' ');
    const id = layer.__cid || (layer.__cid = 'mc' + (++_uid));
    const w = el.width || 0, h = el.height || 0;
    const path = curvePath(w, h, el.curvePower || 0, fontSize);
    tx.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    tx.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;overflow:visible"><defs><path id="${id}" d="${path}" fill="none"/></defs><text font-family="'${esc(el.fontFamily)}'" font-size="${fontSize}" font-weight="${esc(el.fontWeight || 'normal')}" font-style="${esc(el.fontStyle || 'normal')}" fill="${esc(el.fill || 'black')}" text-anchor="middle" dominant-baseline="central" letter-spacing="${(el.letterSpacing || 0) * fontSize}px"${el.textDecoration ? ` text-decoration="${esc(el.textDecoration)}"` : ''}${el.strokeWidth ? ` stroke="${esc(el.stroke)}" stroke-width="${el.strokeWidth}" paint-order="stroke fill"` : ''}><textPath href="#${id}" startOffset="50%">${esc(text)}</textPath></text></svg>`;
    return;
  }
  const ts = tx.style;
  ts.position = 'absolute';
  ts.left = '0';
  ts.width = px(el.width || 0);
  ts.whiteSpace = 'pre-wrap';
  ts.wordBreak = 'break-word';
  ts.overflowWrap = 'break-word';
  ts.fontSize = px(fontSize);
  ts.textAlign = el.align || 'left';
  ts.fontFamily = `'${el.fontFamily || 'Roboto'}', sans-serif`;
  ts.fontStyle = el.fontStyle || 'normal';
  ts.fontWeight = el.fontWeight || 'normal';
  ts.textDecoration = el.textDecoration || 'none';
  ts.textTransform = el.textTransform || 'none';
  ts.lineHeight = String(lh);
  ts.letterSpacing = px((el.letterSpacing || 0) * fontSize);
  if (el.strokeWidth) { ts.webkitTextStroke = `${el.strokeWidth}px ${el.stroke || 'black'}`; ts.paintOrder = 'stroke fill'; }
  else { ts.webkitTextStroke = '0'; ts.paintOrder = 'normal'; }
  if (isGradient(el.fill)) {
    ts.color = 'transparent'; ts.backgroundImage = el.fill; ts.backgroundSize = '100% 100%';
    ts.webkitBackgroundClip = 'text'; ts.backgroundClip = 'text'; ts.webkitTextFillColor = 'transparent';
  } else {
    ts.color = el.fill || 'black'; ts.backgroundImage = 'none'; ts.webkitTextFillColor = '';
    ts.webkitBackgroundClip = ''; ts.backgroundClip = '';
  }
  const va = el.verticalAlign || 'top';
  if (va === 'middle') { ts.top = '50%'; ts.bottom = ''; ts.transform = 'translateY(-50%)'; }
  else if (va === 'bottom') { ts.top = ''; ts.bottom = '0'; ts.transform = 'none'; }
  else { ts.top = '0'; ts.bottom = ''; ts.transform = 'none'; }
  const content = String(el.text || '');
  if (layer.__content !== content) {
    layer.__content = content;
    if (/<[a-z][\s\S]*>/i.test(content)) tx.innerHTML = content;
    else tx.innerHTML = esc(content).split('\n').join('<br>');
  }
}

// Same curve the editor uses for curved text (canvas/text-element.tsx getCurvePath).
function curvePath(width, height, power, absLineHeight) {
  const clamped = Math.max(-0.9999, Math.min(0.9999, power));
  if (Math.abs(clamped) < 1e-4) return `M 0 ${height / 2} L ${width} ${height / 2}`;
  const r = (5 * absLineHeight) / (2 * Math.abs(clamped)) - absLineHeight;
  const cx = width / 2;
  if (clamped > 0) {
    const bottom = 2 * r + absLineHeight / 2;
    return `M ${cx} ${bottom} A ${r} ${r} 0 1 1 ${cx} ${bottom - 2 * r} A ${r} ${r} 0 1 1 ${cx} ${bottom}`;
  }
  const top = -(2 * r - Math.round(height)) - absLineHeight / 2;
  return `M ${cx} ${top} A ${r} ${r} 0 1 0 ${cx} ${top + 2 * r} A ${r} ${r} 0 1 0 ${cx} ${top}`;
}

function paintImage(layer, el, ctx) {
  if (layer.__kind !== 'image') {
    layer.__kind = 'image'; layer.innerHTML = '';
    const d = document.createElement('div'); d.className = 'mim';
    d.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;background-repeat:no-repeat';
    layer.appendChild(d);
  }
  const d = layer.firstChild;
  const s = d.style;
  const src = el.type === 'svg' && ctx && ctx.svgSrc ? ctx.svgSrc(el) : el.src;
  if (d.__src !== src) { d.__src = src; s.backgroundImage = src ? `url("${src}")` : 'none'; }
  const W = Math.max(0.01, el.width || 0), H = Math.max(0.01, el.height || 0);
  const cw = el.cropWidth ?? 1, ch = el.cropHeight ?? 1, cx = el.cropX || 0, cy = el.cropY || 0;
  const size = ctx && ctx.size ? ctx.size(src) : null;
  if (el.type === 'svg' || el.stretchEnabled || !size) {
    const bgW = W / cw, bgH = H / ch;
    if (!size && el.type !== 'svg' && !el.stretchEnabled && cw === 1 && ch === 1) {
      s.backgroundSize = 'cover'; s.backgroundPosition = 'center';
    } else {
      s.backgroundSize = `${px(bgW)} ${px(bgH)}`;
      s.backgroundPosition = `${px(-cx * bgW)} ${px(-cy * bgH)}`;
    }
  } else {
    const iw = size.w, ih = size.h;
    const cropW = iw * cw, cropH = ih * ch;
    const aspect = W / H, cropAspect = cropW / cropH;
    let srcW, srcH;
    if (aspect >= cropAspect) { srcW = cropW; srcH = cropW / aspect; } else { srcW = cropH * aspect; srcH = cropH; }
    const scale = srcW / srcH > W / H ? H / srcH : W / srcW;
    const bgW = iw * scale, bgH = ih * scale;
    s.backgroundSize = `${px(bgW)} ${px(bgH)}`;
    s.backgroundPosition = `${px(-cx * scale * iw)} ${px(-cy * scale * ih)}`;
  }
  let flip = '';
  if (el.flipX) flip += 'scaleX(-1) ';
  if (el.flipY) flip += 'scaleY(-1)';
  s.transform = flip || 'none';
  s.borderRadius = cornerRadii(el);
  s.border = el.borderSize ? `${px(el.borderSize)} solid ${el.borderColor || 'black'}` : 'none';
  s.boxSizing = 'border-box';
  const mask = el.clipSrc || '';
  if (d.__mask !== mask) {
    d.__mask = mask;
    const v = mask ? `url("${mask}")` : 'none';
    s.webkitMaskImage = v; s.maskImage = v;
    s.webkitMaskSize = '100% 100%'; s.maskSize = '100% 100%';
    s.webkitMaskRepeat = 'no-repeat'; s.maskRepeat = 'no-repeat';
  }
}

function paintFigure(layer, el) {
  if (layer.__kind !== 'figure') {
    layer.__kind = 'figure'; layer.innerHTML = '';
    const f = document.createElement('div'); f.className = 'mfi';
    f.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0';
    layer.appendChild(f);
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    st.setAttribute('class', 'mst');
    st.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
    layer.appendChild(st);
    layer.__cid = 'mf' + (++_uid);
  }
  const W = Math.max(0.01, el.width || 0), H = Math.max(0.01, el.height || 0);
  const fn = subTypeToPathDataFunc(el.subType || 'rect');
  let res = fn({ ...el, width: W, height: H, cornerRadius: Math.max(0, el.cornerRadius || 0) });
  let sx = 1, sy = 1, d = res;
  if (typeof res !== 'string') { sx = res.scaleX; sy = res.scaleY; d = res.path; }
  const f = layer.firstChild;
  const fs = f.style;
  fs.width = px(W / sx); fs.height = px(H / sy);
  fs.transform = sx !== 1 || sy !== 1 ? `scale(${sx},${sy})` : 'none';
  fs.clipPath = `path('${d}')`;
  fs.webkitClipPath = `path('${d}')`;
  fs.background = el.fill || 'transparent';
  const st = layer.lastChild;
  const sw = el.strokeWidth || 0;
  st.setAttribute('width', W); st.setAttribute('height', H);
  if (sw > 0) {
    const dash = (el.dash || []).map((v) => v * sw).join(' ');
    const id = layer.__cid;
    st.innerHTML = `<defs><clipPath id="${id}"><path d="${d}" transform="scale(${sx},${sy})"/></clipPath></defs><path d="${d}" fill="none" stroke="${esc(el.stroke || 'black')}" stroke-width="${2 * sw / Math.max(sx, sy)}" transform="scale(${sx},${sy})" clip-path="url(#${id})" stroke-dasharray="${dash}"/>`;
  } else if (st.firstChild) st.innerHTML = '';
}

function lineHead(type, h, color) {
  const common = `stroke-width="${h}" stroke="${esc(color)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  if (type === 'arrow' || type === 'triangle') return `<polyline points="${3 * h},${-2 * h} 0,0 ${3 * h},${2 * h}" ${common}${type === 'triangle' ? ` fill="${esc(color)}"` : ''}/>`;
  if (type === 'bar') return `<polyline points="0,${-2 * h} 0,${2 * h}" ${common}/>`;
  if (type === 'circle') return `<circle r="${h}" ${common} fill="${esc(color)}"/>`;
  if (type === 'square') return `<polyline points="${-h},${-h} ${-h},${h} ${h},${h} ${h},${-h}" ${common} fill="${esc(color)}"/>`;
  return '';
}

function paintLine(layer, el) {
  if (layer.__kind !== 'line') {
    layer.__kind = 'line'; layer.innerHTML = '';
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible';
    layer.appendChild(sv);
  }
  const W = el.width || 0, H = el.height || 0, c = el.color || 'black';
  const dash = (el.dash || []).length ? ` stroke-dasharray="${(el.dash || []).map((v) => v * H).join(' ')}"` : '';
  layer.firstChild.innerHTML = `<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="${esc(c)}" stroke-width="${H}"${dash}/>` +
    `<g transform="translate(0 ${H / 2})">${lineHead(el.startHead, H, c)}</g>` +
    `<g transform="translate(${W} ${H / 2}) rotate(180)">${lineHead(el.endHead, H, c)}</g>`;
}

function paintVideo(layer, el) {
  if (layer.__kind !== 'video' || layer.__src !== el.src) {
    layer.__kind = 'video'; layer.__src = el.src; layer.innerHTML = '';
    const v = document.createElement('video');
    v.src = el.src; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
    v.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover';
    layer.appendChild(v);
  }
  layer.firstChild.style.borderRadius = cornerRadii(el);
}

/** Paint the content of one layer for element state `el`. */
export function paintLayer(layer, el, ctx) {
  switch (el.type) {
    case 'text': return paintText(layer, el);
    case 'image': case 'svg': case 'gif': return paintImage(layer, el, ctx);
    case 'figure': return paintFigure(layer, el);
    case 'line': return paintLine(layer, el);
    case 'video': return paintVideo(layer, el);
    default:
      if (layer.__kind !== 'other') { layer.__kind = 'other'; layer.innerHTML = ''; }
  }
}

export function createObjectNode(id) {
  const node = document.createElement('div');
  node.className = 'mo';
  node.dataset.id = id;
  node.style.cssText = 'position:absolute;transform-origin:0 0;';
  const layer = document.createElement('div');
  layer.className = 'ml';
  layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
  node.appendChild(layer);
  return node;
}

function layers(node) {
  return Array.from(node.children).filter((c) => c.classList.contains('ml'));
}
function ensureLayers(node, n) {
  let ls = layers(node);
  while (ls.length < n) {
    const l = document.createElement('div');
    l.className = 'ml';
    l.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    node.insertBefore(l, node.querySelector(':scope > .mx'));
    ls = layers(node);
  }
  while (ls.length > n) { ls[ls.length - 1].remove(); ls = layers(node); }
  return ls;
}

/** Paint a node with a single static state. */
export function paintStatic(node, el, ctx, opacityMul = 1) {
  paintWrapper(node, el, opacityMul);
  const [l] = ensureLayers(node, 1);
  l.style.opacity = '1';
  paintLayer(l, el, ctx);
}

/** Paint a node between two states a→b at eased progress e (may overshoot). */
export function paintMorph(node, a, b, e, ctx) {
  const cross = contentKey(a) !== contentKey(b) || a.type !== b.type;
  if (!cross) {
    const s = lerpEl(a, b, e);
    paintWrapper(node, s);
    const [l] = ensureLayers(node, 1);
    l.style.opacity = '1';
    paintLayer(l, s, ctx);
    return;
  }
  const t = Math.max(0, Math.min(1, e));
  const sa = lerpEl(a, b, e, a), sb = lerpEl(a, b, e, b);
  paintWrapper(node, lerpEl(a, b, e));
  const [la, lb] = ensureLayers(node, 2);
  la.style.opacity = String(1 - t);
  lb.style.opacity = String(t);
  paintLayer(la, sa, ctx);
  paintLayer(lb, sb, ctx);
}

/** Render a whole slide statically into `stage` (re-using object nodes by id). */
export function renderStatic(stage, page, ctx) {
  Object.assign(stage.style, backgroundCSS(page.background));
  const els = flattenPage(page);
  const keep = new Set();
  const existing = new Map();
  for (const n of Array.from(stage.children)) if (n.classList.contains('mo')) existing.set(n.dataset.id, n);
  els.forEach((el, i) => {
    let node = existing.get(el.id);
    if (!node) { node = createObjectNode(el.id); }
    node.style.zIndex = String(i + 1);
    paintStatic(node, el, ctx);
    if (node.parentNode !== stage) stage.appendChild(node);
    keep.add(el.id);
  });
  for (const [id, n] of existing) if (!keep.has(id)) n.remove();
}

export function collectFonts(project) {
  const fams = new Set();
  for (const s of project.slides || []) for (const el of flattenPage(s.page)) if (el.type === 'text' && el.fontFamily) fams.add(el.fontFamily);
  return Array.from(fams);
}

export function googleFontsUrl(family) {
  return `https://fonts.googleapis.com/css?family=${family.replace(/ /g, '+')}:400,400italic,700,700italic`;
}
