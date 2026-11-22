// A short guided tour. It points at real parts of the screen; a step whose target is not on
// screen right now is skipped, so the tour never points at nothing.
// Update TOUR_STEPS (and bump TOUR_VERSION) whenever the interface changes: people who saw an
// older tour get the new one once.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@blueprintjs/core';
import { useController } from './hooks';
import { t } from '../i18n';

export const TOUR_VERSION = 1;
const SEEN_KEY = 'morph-tour-seen';

export const TOUR_STEPS = [
  { id: 'welcome', title: 'Welcome to Morph', body: 'A one-minute tour of the essentials. You can come back to it from the ⋯ menu.' },
  { id: 'slides', target: '.sorter', title: 'Your slides', body: 'Click a slide to edit it, drag to reorder, right-click for more. With a theme, + offers its layouts.' },
  { id: 'layouts', target: '.sorter-head button[data-tour="layouts"]', title: 'Themes and layouts', body: 'Pick a theme: its layouts share shapes, so going from one slide to the next morphs smoothly.' },
  { id: 'add', target: '.raeditor-side-tabs-container', title: 'Add things', body: 'Text, shapes, equations with LaTeX packages, your pictures, and (online) free photos and icons.' },
  { id: 'canvas', target: '.raeditor-workspace-container, .editor', title: 'The slide', body: 'Select an object to change it. An object with the same ID on the next slide moves and changes into its new look.' },
  { id: 'anim', target: '.anim', title: 'Animation', body: 'For the selected object: how it arrives, how it leaves, how long it takes and how it moves.' },
  { id: 'notes', target: '.notes-bar', title: 'Speaker notes', body: 'What you want to say on each slide. You can show them while presenting (S); they are never exported.' },
  { id: 'share', target: '.share-chip', owner: true, title: 'Share', body: 'Each person gets their own secret link. Remove the person and their link stops working.' },
  { id: 'present', target: '.present-group', title: 'Present', body: 'Arrows, Page Up/Down and clickers move between slides. B blacks out the screen, L is a laser pointer, Esc leaves.' },
  { id: 'export', target: '.topbar .bp5-intent-primary:has(.bp5-icon-export), .topbar button:has(.bp5-icon-export)', title: 'Export', body: 'One standalone .html file that plays your presentation anywhere, even offline.' },
  { id: 'done', title: 'That’s it', body: 'Have fun. Changes are saved automatically.' },
];

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

/** Steps that can be shown right now (target on screen, owner-only steps for the owner). */
export function availableSteps(c) {
  return TOUR_STEPS.filter((s) => (!s.owner || c.isOwner) && (!s.target || visibleRect(s.target)));
}

export function Tour({ c }) {
  useController(c);
  const open = c.ui.tour != null;
  const [steps, setSteps] = useState([]);
  const [rect, setRect] = useState(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef(null);
  const [card, setCard] = useState({ w: 340, h: 160 });
  const k = Math.max(0, Math.min(c.ui.tour || 0, steps.length - 1));
  const step = steps[k];

  useEffect(() => { if (open) setSteps(availableSteps(c)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the target while it moves (panels opening, window resizing).
  useEffect(() => {
    if (!open || !step) return undefined;
    let raf = 0;
    const tick = () => {
      const r = step.target ? visibleRect(step.target) : null;
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

  const close = () => { markSeen(); c.setUi({ tour: null }); };
  const go = (d) => {
    const n = k + d;
    if (n < 0) return;
    if (n >= steps.length) { close(); return; }
    c.setUi({ tour: n });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
      else e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open || !step) return null;

  // Card position: beside the target where there is room, else centered; always inside the window.
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

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('Tour')}>
      <svg className="tour-shade" width={size.w} height={size.h} aria-hidden="true">
        <defs>
          <mask id="tour-mask">
            <rect width={size.w} height={size.h} fill="#fff" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="14" fill="#000" />}
          </mask>
        </defs>
        <rect width={size.w} height={size.h} fill="rgba(15,20,30,.55)" mask="url(#tour-mask)" />
        {hole && <rect className="tour-ring" x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="14" />}
      </svg>
      <div className={'tour-card is-' + side} ref={cardRef} style={{ left: x, top: y }} data-step={step.id} data-side={side}>
        <div className="tour-count">{t('{a} of {b}', { a: k + 1, b: steps.length })}</div>
        <h3>{t(step.title)}</h3>
        <p>{t(step.body)}</p>
        <div className="tour-actions">
          {k < steps.length - 1 && <Button minimal small text={t('Skip')} onClick={close} />}
          <span className="phase-spacer" />
          {k > 0 && <Button small text={t('Back')} onClick={() => go(-1)} />}
          <Button small intent="primary" text={k < steps.length - 1 ? t('Next') : t('Let’s go')} onClick={() => go(1)} autoFocus />
        </div>
      </div>
    </div>
  );
}
