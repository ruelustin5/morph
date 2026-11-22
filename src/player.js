// Presentation player with per-object morph / intro / exit animations.
// Shared by the in-app presenter and the exported standalone HTML file.
import { flattenPage, renderStatic, createObjectNode, paintStatic, paintMorph, backgroundCSS, easeFn } from './render';

export const DEFAULT_ANIM = Object.freeze({ type: 'none', duration: 0.5, easing: 'linear' });

export function animOf(slide, id, kind) {
  const a = slide && slide.anim && slide.anim[id] && slide.anim[id][kind];
  return a ? { ...DEFAULT_ANIM, ...a } : { ...DEFAULT_ANIM };
}


/**
 * Animate `stage` (currently showing `fromSlide`) to `toSlide`.
 * Returns { finish() } which jumps straight to the end state.
 */
export function startTransition(stage, fromSlide, toSlide, ctx, onDone) {
  const A = flattenPage(fromSlide.page), B = flattenPage(toSlide.page);
  const mapA = new Map(A.map((e) => [e.id, e]));
  const mapB = new Map(B.map((e) => [e.id, e]));
  const z = new Map();
  B.forEach((e, k) => z.set(e.id, 2 * (k + 1)));
  let lastZ = 0;
  A.forEach((e) => { if (mapB.has(e.id)) lastZ = z.get(e.id); else z.set(e.id, lastZ + 1); });
  Object.assign(stage.style, backgroundCSS(toSlide.page.background));
  const nodes = new Map();
  for (const n of Array.from(stage.children)) if (n.classList.contains('mo')) nodes.set(n.dataset.id, n);
  const tracks = [];
  for (const e of B) {
    let node = nodes.get(e.id);
    if (!node) { node = createObjectNode(e.id); stage.appendChild(node); }
    node.style.zIndex = String(z.get(e.id));
    const p = animOf(toSlide, e.id, 'enter');
    const dur = Math.max(0, +p.duration || 0) * 1000;
    if (mapA.has(e.id)) {
      if (dur > 0 && !p.cut) tracks.push({ kind: 'morph', node, a: mapA.get(e.id), b: e, dur, ease: easeFn(p.easing) });
      else paintStatic(node, e, ctx); // "Jump": straight to the new look
    } else if (p.type === 'fade' && dur > 0) {
      paintStatic(node, e, ctx, 0);
      tracks.push({ kind: 'in', node, b: e, dur, ease: easeFn(p.easing) });
    } else {
      paintStatic(node, e, ctx);
    }
  }
  for (const e of A) {
    if (mapB.has(e.id)) continue;
    const node = nodes.get(e.id);
    if (!node) continue;
    node.style.zIndex = String(z.get(e.id));
    const p = animOf(fromSlide, e.id, 'exit');
    const dur = Math.max(0, +p.duration || 0) * 1000;
    if (p.type === 'fade' && dur > 0) tracks.push({ kind: 'out', node, a: e, dur, ease: easeFn(p.easing) });
    else node.remove();
  }
  let raf = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    renderStatic(stage, toSlide.page, ctx);
    if (onDone) onDone();
  };
  if (!tracks.length) { finish(); return { finish }; }
  const t0 = performance.now();
  const frame = (now) => {
    if (finished) return;
    const el = now - t0;
    let done = true;
    for (const tr of tracks) {
      const x = Math.min(1, el / tr.dur);
      if (x < 1) done = false;
      const e = x >= 1 ? 1 : tr.ease(x);
      if (tr.kind === 'morph') paintMorph(tr.node, tr.a, tr.b, e, ctx);
      else if (tr.kind === 'in') paintStatic(tr.node, tr.b, ctx, Math.max(0, Math.min(1, e)));
      else paintStatic(tr.node, tr.a, ctx, 1 - Math.max(0, Math.min(1, e)));
    }
    if (done) { finish(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { finish };
}

const PLAYER_CSS = `
.mp-root{position:absolute;inset:0;background:#000;overflow:hidden;user-select:none;-webkit-user-select:none;cursor:default;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.mp-root.mp-idle{cursor:none}
.mp-stage{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden}
.mp-ui{position:absolute;right:16px;bottom:16px;display:flex;align-items:center;gap:4px;padding:4px;border-radius:999px;background:rgba(20,20,22,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;transition:opacity .25s;z-index:5}
.mp-idle .mp-ui{opacity:0;pointer-events:none}
.mp-btn{all:unset;box-sizing:border-box;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff}
.mp-btn:hover{background:rgba(255,255,255,.14)}
.mp-btn:focus-visible{outline:2px solid #4c90f0}
.mp-btn[disabled]{opacity:.35;cursor:default;background:none}
.mp-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.mp-count{min-width:62px;text-align:center;font-size:13px;font-variant-numeric:tabular-nums;opacity:.9}
.mp-sep{width:1px;height:20px;background:rgba(255,255,255,.18);margin:0 4px}
.mp-progress{position:absolute;left:0;bottom:0;height:3px;background:#4c90f0;transition:width .3s ease;z-index:4;opacity:.85}
.mp-idle .mp-progress{opacity:0}
.mp-veil{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:0;transition:opacity .2s;background:#000}
.mp-veil.is-black{opacity:1}
.mp-veil.is-white{opacity:1;background:#fff}
.mp-laser{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;z-index:7;pointer-events:none;display:none;background:radial-gradient(circle,#fff 0,#ff3b30 28%,rgba(255,59,48,.55) 52%,rgba(255,59,48,0) 72%);box-shadow:0 0 14px 4px rgba(255,40,30,.45)}
.mp-laser-on{cursor:none!important}
.mp-laser-on .mp-laser.is-in{display:block}
.mp-btn.is-on{background:rgba(255,59,48,.85)}
.mp-help{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8;background:rgba(20,20,22,.9);color:#fff;border-radius:16px;padding:18px 22px;font-size:13px;line-height:1.9;display:none;min-width:260px}
.mp-help.is-open{display:block}
.mp-help kbd{display:inline-block;min-width:22px;padding:0 6px;margin-right:4px;border-radius:6px;background:rgba(255,255,255,.16);font:inherit;font-size:12px;text-align:center}
.mp-help div{display:flex;justify-content:space-between;gap:24px}
`;

const ICONS = {
  prev: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  laser: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
};

// The player also runs in exported files, so it carries its own few French words.
const PFR = {
  Next: 'Suivante', Previous: 'Précédente', 'Black screen': 'Écran noir', 'White screen': 'Écran blanc',
  'Laser pointer': 'Pointeur laser', 'Full screen': 'Plein écran', 'First / last': 'Première / dernière', Exit: 'Quitter',
  'Previous slide': 'Diapo précédente', 'Next slide': 'Diapo suivante', Shortcuts: 'Raccourcis',
  'Previous (←)': 'Précédente (←)', 'Next (→ / space / click)': 'Suivante (→ / espace / clic)', 'Shortcuts (?)': 'Raccourcis (?)',
  'Laser pointer (L)': 'Pointeur laser (L)', 'Full screen (F)': 'Plein écran (F)', 'Exit (Esc)': 'Quitter (Échap)',
};
const pt = (s) => {
  let fr = false;
  try { const l = (document.documentElement.lang || navigator.language || '').toLowerCase(); fr = l.startsWith('fr'); } catch (e) { /* ignore */ }
  return (fr && PFR[s]) || s;
};
const HELP = [
  ['→ Space PgDn', 'Next'], ['← PgUp', 'Previous'], ['B  .', 'Black screen'], ['W  ,', 'White screen'],
  ['L', 'Laser pointer'], ['F', 'Full screen'], ['Home End', 'First / last'], ['Esc', 'Exit'],
];

export function createPlayer({ root, project, ctx, startIndex = 0, onIndex, onExit, useHash = false, keyboard = true, autofocus = true }) {
  const slides = project.slides;
  const W = project.width, H = project.height;
  if (!document.getElementById('mp-style')) {
    const st = document.createElement('style'); st.id = 'mp-style'; st.textContent = PLAYER_CSS; document.head.appendChild(st);
  }
  const view = document.createElement('div');
  view.className = 'mp-root';
  view.tabIndex = 0;
  const stage = document.createElement('div');
  stage.className = 'mp-stage';
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
  view.appendChild(stage);
  const progress = document.createElement('div');
  progress.className = 'mp-progress';
  view.appendChild(progress);
  const ui = document.createElement('div');
  ui.className = 'mp-ui';
  ui.innerHTML = `<button class="mp-btn" data-a="prev" aria-label="${pt('Previous slide')}" title="${pt('Previous (←)')}">${ICONS.prev}</button>` +
    `<span class="mp-count"></span>` +
    `<button class="mp-btn" data-a="next" aria-label="${pt('Next slide')}" title="${pt('Next (→ / space / click)')}">${ICONS.next}</button>` +
    `<span class="mp-sep"></span>` +
    `<button class="mp-btn" data-a="help" aria-label="${pt('Shortcuts')}" title="${pt('Shortcuts (?)')}"><b style="font-size:15px">?</b></button>` +
    `<button class="mp-btn" data-a="laser" aria-label="${pt('Laser pointer')}" aria-pressed="false" title="${pt('Laser pointer (L)')}">${ICONS.laser}</button>` +
    `<button class="mp-btn" data-a="full" aria-label="${pt('Full screen')}" title="${pt('Full screen (F)')}">${ICONS.full}</button>` +
    (onExit ? `<button class="mp-btn" data-a="exit" aria-label="${pt('Exit')}" title="${pt('Exit (Esc)')}">${ICONS.exit}</button>` : '');
  view.appendChild(ui);
  const veil = document.createElement('div');
  veil.className = 'mp-veil';
  view.appendChild(veil);
  const dot = document.createElement('div');
  dot.className = 'mp-laser';
  view.appendChild(dot);
  const help = document.createElement('div');
  help.className = 'mp-help';
  help.innerHTML = HELP.map(([k, v]) => `<div><span>${k.split(/\s+/).map((x) => `<kbd>${x}</kbd>`).join('')}</span><span>${pt(v)}</span></div>`).join('');
  view.appendChild(help);
  root.appendChild(view);

  // Black / white screen (clickers' "blank" button sends B or "."), laser pointer, help.
  let veilMode = null;
  function setVeil(m) { veilMode = m && veilMode !== m ? m : null; veil.className = 'mp-veil' + (veilMode ? ' is-' + veilMode : ''); }
  let laser = false;
  function setLaser(on) {
    laser = on;
    view.classList.toggle('mp-laser-on', on);
    const b = ui.querySelector('[data-a="laser"]');
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  function moveDot(e) {
    if (!laser) return;
    const r = view.getBoundingClientRect();
    dot.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
    dot.classList.add('is-in');
  }

  let index = Math.max(0, Math.min(slides.length - 1, startIndex));
  let running = null; // { finish }

  function layout() {
    const vw = view.clientWidth || window.innerWidth, vh = view.clientHeight || window.innerHeight;
    const s = Math.min(vw / W, vh / H);
    stage.style.transform = `translate(${(vw - W * s) / 2}px, ${(vh - H * s) / 2}px) scale(${s})`;
  }

  function updateUi() {
    ui.querySelector('.mp-count').textContent = `${index + 1} / ${slides.length}`;
    ui.querySelector('[data-a="prev"]').disabled = index <= 0;
    ui.querySelector('[data-a="next"]').disabled = index >= slides.length - 1;
    progress.style.width = slides.length > 1 ? `${(index / (slides.length - 1)) * 100}%` : '100%';
    if (useHash) { try { history.replaceState(null, '', '#' + (index + 1)); } catch (e) { /* ignore */ } }
    if (onIndex) onIndex(index);
  }

  function showStatic(i) {
    renderStatic(stage, slides[i].page, ctx);
  }

  function finishRunning() {
    if (running) { const r = running; running = null; r.finish(); }
  }

  function animateTo(j) {
    const from = slides[index];
    index = j;
    updateUi();
    running = startTransition(stage, from, slides[j], ctx, () => { running = null; });
  }

  function go(j, animate) {
    if (j < 0 || j >= slides.length) return;
    finishRunning();
    if (animate && j === index + 1) { animateTo(j); return; }
    index = j;
    showStatic(j);
    updateUi();
  }

  const next = () => go(index + 1, true);
  const prev = () => go(index - 1, false);

  function toggleFull() {
    try {
      const d = document;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else { const tgt = view.parentNode === document.body ? document.documentElement : view; (tgt.requestFullscreen || tgt.webkitRequestFullscreen).call(tgt).catch?.(() => {}); }
    } catch (e) { /* fullscreen may be blocked */ }
  }

  const NEXT_KEYS = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'];
  const PREV_KEYS = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'];
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // Typing in a field (speaker notes while presenting) is not a slide command.
    const tg = e.target;
    if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || ''))) return;
    const k = e.key;
    const handled = [...NEXT_KEYS, ...PREV_KEYS, 'Home', 'End', 'f', 'F', 'Escape', 'Delete', 'b', 'B', '.', 'w', 'W', ',', 'l', 'L', '?', 'F5', 'Tab'];
    if (handled.includes(k)) e.stopPropagation();
    if (k === 'F5' || k === 'Tab') { e.preventDefault(); if (k === 'F5' && !e.shiftKey && !(document.fullscreenElement || document.webkitFullscreenElement)) toggleFull(); return; } // clickers' "start" button
    if (help.classList.contains('is-open') && k !== '?') { help.classList.remove('is-open'); if (k === 'Escape') { e.preventDefault(); return; } }
    if (k === 'b' || k === 'B' || k === '.') { e.preventDefault(); setVeil('black'); return; }
    if (k === 'w' || k === 'W' || k === ',') { e.preventDefault(); setVeil('white'); return; }
    if (k === 'l' || k === 'L') { e.preventDefault(); setLaser(!laser); return; }
    if (k === '?') { e.preventDefault(); help.classList.toggle('is-open'); return; }
    // Any slide key on a blank screen brings the slide back first (like PowerPoint).
    if (veilMode && (NEXT_KEYS.includes(k) || PREV_KEYS.includes(k) || k === 'Escape')) { e.preventDefault(); setVeil(null); return; }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') { e.preventDefault(); go(0, false); }
    else if (k === 'End') { e.preventDefault(); go(slides.length - 1, false); }
    else if (k === 'f' || k === 'F') { e.preventDefault(); toggleFull(); }
    else if (k === 'Escape' && onExit && !(document.fullscreenElement || document.webkitFullscreenElement)) { e.preventDefault(); onExit(); }
  }

  let idleTimer = 0;
  function wake() {
    view.classList.remove('mp-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => view.classList.add('mp-idle'), 2200);
  }

  function onClick(e) {
    const b = e.target.closest && e.target.closest('.mp-btn');
    if (b) {
      e.stopPropagation();
      const a = b.dataset.a;
      if (a === 'prev') prev(); else if (a === 'next') next(); else if (a === 'full') toggleFull(); else if (a === 'laser') setLaser(!laser); else if (a === 'help') help.classList.toggle('is-open'); else if (a === 'exit') onExit && onExit();
      return;
    }
    if (e.target.closest && e.target.closest('.mp-ui')) return;
    if (help.classList.contains('is-open')) { help.classList.remove('is-open'); return; }
    if (veilMode) { setVeil(null); return; }
    next();
  }

  let touchX = null, touchY = null, touchMoved = false;
  function onTouchStart(e) { const t = e.touches[0]; touchX = t.clientX; touchY = t.clientY; touchMoved = false; }
  function onTouchMove(e) { if (touchX == null) return; const t = e.touches[0]; if (Math.abs(t.clientX - touchX) > 10 || Math.abs(t.clientY - touchY) > 10) touchMoved = true; }
  function onTouchEnd(e) {
    if (touchX == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX, dy = t.clientY - touchY;
    touchX = null;
    if (touchMoved && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); if (dx < 0) next(); else prev(); }
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(layout) : null;
  if (ro) ro.observe(view);
  window.addEventListener('resize', layout);
  if (keyboard) window.addEventListener('keydown', onKey, true);
  view.addEventListener('click', onClick);
  view.addEventListener('mousemove', wake);
  view.addEventListener('mousemove', moveDot);
  view.addEventListener('mouseleave', () => dot.classList.remove('is-in'));
  view.addEventListener('touchstart', onTouchStart, { passive: true });
  view.addEventListener('touchmove', onTouchMove, { passive: true });
  view.addEventListener('touchend', onTouchEnd);

  layout();
  showStatic(index);
  updateUi();
  wake();
  if (autofocus) setTimeout(() => { try { view.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);

  return {
    next, prev, go: (i) => go(i, false), get index() { return index; },
    rerender() { if (!running) showStatic(index); },
    destroy() {
      finishRunning();
      clearTimeout(idleTimer);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', layout);
      window.removeEventListener('keydown', onKey, true);
      view.remove();
    },
  };
}
