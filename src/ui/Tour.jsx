// The tutorial. It first asks; if the person says yes, a practice presentation replaces the open one
// (nothing there is saved) and the steps in ../tutorial.js explain IDs and morphing by showing them,
// let the person do one morph (or "Show me"), then point at the rest of the interface.
// Steps marked optional are skipped when what they point at is not on screen.
// Bump TOUR_VERSION when the steps change: people who saw an older version get asked again once.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Icon } from '@blueprintjs/core';
import { useController } from './hooks';
import { createPlayer } from '../player';
import { TUTORIAL_STEPS } from '../tutorial';
import { t } from '../i18n';

export const TOUR_VERSION = 2;
const SEEN_KEY = 'morph-tour-seen';

export function tourSeen() {
  try { return Number(localStorage.getItem(SEEN_KEY) || 0) >= TOUR_VERSION; } catch (e) { return true; }
}
function markSeen() { try { localStorage.setItem(SEEN_KEY, String(TOUR_VERSION)); } catch (e) { /* ignore */ } }

function visibleRect(sel) {
  if (!sel) return null;
  for (const s of sel.split(',')) {
    let el = null;
    try { el = document.querySelector(s.trim()); } catch (e) { el = null; }
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 8 || r.height < 8 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) continue;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  return null;
}

/** The steps for this person, decided when the tutorial starts. */
export function tutorialSteps(c) {
  return TUTORIAL_STEPS.filter((s) => (!s.owner || c.isOwner) && (!s.optional || visibleRect(s.target)));
}

/** Slide a → slide b of the practice presentation, played inside the card. */
function Demo({ c, from, to }) {
  const ref = useRef(null);
  const [run, setRun] = useState(0);
  const W = c.project.width, H = c.project.height;
  const sl = c.project.slides;
  const ok = !!(sl[from] && sl[to]);
  useEffect(() => {
    if (!ref.current || !ok) return undefined;
    const project = JSON.parse(JSON.stringify({ ...c.project, slides: [sl[from], sl[to]] }));
    const player = createPlayer({ root: ref.current, project, ctx: c.ctx, startIndex: 0, keyboard: false, autofocus: false });
    const tm = setTimeout(() => player.next(), 900);
    const el = ref.current;
    return () => { clearTimeout(tm); player.destroy(); if (el) el.innerHTML = ''; };
  }, [run, from, to, ok]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="tour-demo-wrap">
      {ok ? <div className="tour-demo" ref={ref} style={{ aspectRatio: `${W} / ${H}` }} />
        : <p className="tour-demo-missing">{t('Do the previous step first (or use Show me).')}</p>}
      {ok && <Button small minimal icon="refresh" text={t('Play again')} onClick={() => setRun((n) => n + 1)} />}
    </div>
  );
}

export function Tour({ c }) {
  useController(c);
  const mode = c.ui.tour; // null | 'ask' | step number
  const open = mode != null;
  const [steps, setSteps] = useState([]);
  const k = typeof mode === 'number' ? Math.max(0, Math.min(mode, steps.length - 1)) : -1;
  const step = k >= 0 ? steps[k] : null;
  const [rect, setRect] = useState(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef(null);
  const [card, setCard] = useState({ w: 360, h: 180 });

  // Leaving the practice presentation another way (opening a project) ends the tutorial.
  useEffect(() => { if (typeof mode === 'number' && !c.tutorial) c.setUi({ tour: null }); }, [mode, !!c.tutorial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Entering a step: put the screen in the right state.
  useEffect(() => {
    if (step && step.setup) { try { step.setup(c); } catch (e) { /* the step still shows */ } }
  }, [step && step.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the target while it moves (panels opening, window resizing).
  useEffect(() => {
    if (!open) return undefined;
    let raf = 0;
    const tick = () => {
      const r = step && step.target ? visibleRect(step.target) : null;
      setRect((prev) => (JSON.stringify(prev) === JSON.stringify(r) ? prev : r));
      setSize((prev) => (prev.w === window.innerWidth && prev.h === window.innerHeight ? prev : { w: window.innerWidth, h: window.innerHeight }));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, step && step.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (cardRef.current) { const r = cardRef.current.getBoundingClientRect(); if (Math.abs(r.height - card.h) > 1 || Math.abs(r.width - card.w) > 1) setCard({ w: r.width, h: r.height }); }
  });

  // The card takes the keyboard focus on each step (not on hands-on steps), so arrow keys work.
  useEffect(() => {
    if (!open) return;
    const b = cardRef.current && cardRef.current.querySelector('[data-primary]');
    if (b && !(step && step.interactive)) b.focus({ preventScroll: true });
  }, [open, k, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const close = () => { markSeen(); c.setUi({ tour: null }); };
  const start = async () => {
    markSeen();
    await c.startTutorial();
    // Wait for the practice presentation to be on screen before deciding which steps can show.
    setTimeout(() => { setSteps(tutorialSteps(c)); c.setUi({ tour: 0 }); }, 500);
  };
  const go = (d) => {
    const n = k + d;
    if (n < 0) return;
    if (n >= steps.length) { close(); return; }
    c.setUi({ tour: n });
  };
  const leave = async () => { close(); await c.endTutorial(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight' && mode !== 'ask') { e.preventDefault(); e.stopPropagation(); go(1); }
    else if (e.key === 'ArrowLeft' && mode !== 'ask') { e.preventDefault(); e.stopPropagation(); go(-1); }
    else e.stopPropagation();
  };

  // ---- the question -----------------------------------------------------------------------------
  if (mode === 'ask') {
    return (
      <div className="tour" role="dialog" aria-modal="true" aria-label={t('Tutorial')} onKeyDown={onKey}>
        <div className="tour-shade-plain" />
        <div className="tour-card tour-ask" ref={cardRef} style={{ left: Math.max(12, (size.w - card.w) / 2), top: Math.max(12, (size.h - card.h) / 2) }} data-step="ask" data-side="center">
          <div className="tour-ask-icon"><Icon icon="learning" size={20} /></div>
          <h3>{t('New to Morph?')}</h3>
          <p>{t('A short hands-on tutorial: you will see how objects move from one slide to the next, and make one move yourself. It uses a practice presentation; your own work is not touched.')}</p>
          <div className="tour-actions">
            <Button minimal small text={t('Not now')} onClick={close} />
            <span className="phase-spacer" />
            <Button intent="primary" icon="play" text={t('Start the tutorial')} onClick={start} data-primary />
          </div>
        </div>
      </div>
    );
  }
  if (!step) return null;

  // ---- a step -----------------------------------------------------------------------------------
  const M = 12, PAD = 6;
  let x, y, side = 'center';
  if (rect && rect.w * rect.h > 0.35 * size.w * size.h) {
    // A big target (the slide area): the card sits inside its lower-left corner.
    side = 'inside'; x = rect.x + 24; y = rect.y + rect.h - card.h - 24;
  } else if (rect) {
    const room = { right: size.w - (rect.x + rect.w), left: rect.x, below: size.h - (rect.y + rect.h), above: rect.y };
    if (room.right >= card.w + 2 * M) { side = 'right'; x = rect.x + rect.w + M; y = rect.y + rect.h / 2 - card.h / 2; }
    else if (room.left >= card.w + 2 * M) { side = 'left'; x = rect.x - card.w - M; y = rect.y + rect.h / 2 - card.h / 2; }
    else if (room.below >= card.h + 2 * M) { side = 'below'; x = rect.x + rect.w / 2 - card.w / 2; y = rect.y + rect.h + M; }
    else if (room.above >= card.h + 2 * M) { side = 'above'; x = rect.x + rect.w / 2 - card.w / 2; y = rect.y - card.h - M; }
  }
  if (side === 'center') { x = (size.w - card.w) / 2; y = (size.h - card.h) / 2; }
  x = Math.max(M, Math.min(size.w - card.w - M, x));
  y = Math.max(M, Math.min(size.h - card.h - M, y));
  const hole = rect && { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + 2 * PAD, h: rect.h + 2 * PAD };
  const done = step.check ? !!step.check(c) : false;
  const last = k === steps.length - 1;

  return (
    <div className={'tour' + (step.interactive ? ' is-interactive' : '')} role="dialog" aria-modal={!step.interactive} aria-label={t('Tutorial')}>
      <svg className="tour-shade" width={size.w} height={size.h} aria-hidden="true">
        <defs>
          <mask id="tour-mask">
            <rect width={size.w} height={size.h} fill="#fff" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="14" fill="#000" />}
          </mask>
        </defs>
        <rect width={size.w} height={size.h} fill={step.interactive ? 'rgba(15,20,30,.22)' : 'rgba(15,20,30,.55)'} mask="url(#tour-mask)" />
        {hole && <rect className="tour-ring" x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="14" />}
      </svg>
      <div className={'tour-card is-' + side + (step.demo ? ' has-demo' : '')} ref={cardRef} style={{ left: x, top: y }} data-step={step.id} data-side={side} onKeyDown={onKey}>
        <div className="tour-count">{t('{a} of {b}', { a: k + 1, b: steps.length })}</div>
        <h3>{t(step.title)}</h3>
        <p>{t(step.body)}</p>
        {step.demo && <Demo c={c} from={step.demo[0]} to={step.demo[1]} />}
        {step.check && (
          <div className={'tour-task' + (done ? ' is-done' : '')}>
            {done
              ? <><Icon icon="tick-circle" size={14} /> {t('Done!')}</>
              : <><Icon icon="hand-up" size={14} /> {t('Your turn.')} <Button small minimal intent="primary" text={t('Show me')} onClick={() => step.doIt(c)} /></>}
          </div>
        )}
        <div className="tour-actions">
          {!last && <Button minimal small text={t('Stop')} onClick={leave} />}
          <span className="phase-spacer" />
          {k > 0 && <Button small text={t('Back')} onClick={() => go(-1)} />}
          {last ? (
            <>
              <Button small text={t('Keep practicing')} onClick={close} />
              <Button small intent="primary" text={t('Back to my presentation')} onClick={leave} data-primary />
            </>
          ) : (
            <Button small intent="primary" text={t('Next')} onClick={() => go(1)} data-primary />
          )}
        </div>
      </div>
    </div>
  );
}
