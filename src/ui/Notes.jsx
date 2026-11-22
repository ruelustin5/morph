import React, { useEffect, useRef, useState } from 'react';
import { Icon, Tooltip } from '@blueprintjs/core';
import { useController } from './hooks';
import { t } from '../i18n';

const OPEN_KEY = 'morph-notes-open';
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch (e) { return false; } };

/** Speaker notes for the open slide, under the canvas. Only you see them while presenting (never exported). */
export function NotesBar({ c }) {
  useController(c);
  const [open, setOpen] = useState(readOpen);
  const slide = c.project && c.project.slides[c.active];
  const sid = slide && slide.id;
  const saved = sid ? c.noteOf(sid) : '';
  const [text, setText] = useState(saved);
  const focused = useRef(false);
  const editing = useRef(null); // slide id being typed in
  // Show the stored note when switching slides, or when someone else changes it (not while typing).
  useEffect(() => { if (!focused.current || editing.current !== sid) setText(saved); }, [sid, saved]);
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } };
  if (!slide) return null;
  const can = c.canWrite !== false;
  const owner = c.ownerOf(sid);
  return (
    <div className={'notes-bar' + (open ? ' is-open' : '')}>
      <button type="button" className="notes-toggle" onClick={toggle} aria-expanded={open}>
        <Icon icon={open ? 'chevron-down' : 'chevron-up'} size={12} />
        <span>{t('Notes')}</span>
        {!open && saved && <span className="notes-peek">{saved.split('\n')[0].slice(0, 80)}</span>}
        {owner && <span className="notes-owner"><Icon icon="person" size={10} />{c.personName(owner)}</span>}
      </button>
      {open && (
        <textarea
          className="notes-input"
          value={text}
          readOnly={!can}
          placeholder={t('What you want to say on this slide. Only you see it while presenting; it is never exported.')}
          onFocus={() => { focused.current = true; editing.current = sid; }}
          onBlur={() => { focused.current = false; }}
          onChange={(e) => { setText(e.target.value); c.setNote(sid, e.target.value); }}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={t('Notes for slide {n}', { n: c.active + 1 })}
        />
      )}
    </div>
  );
}

/** Whose turn it is to talk (slides assigned to people), shown while presenting in the app. */
function Turn({ c, index }) {
  const p = c.project;
  const sid = p && p.slides[index] && p.slides[index].id;
  const owner = sid ? c.ownerOf(sid) : null;
  const prevOwner = index > 0 ? c.ownerOf(p.slides[index - 1].id) : null;
  // the next slide given to someone else
  let next = null;
  for (let k = index + 1; k < p.slides.length; k++) {
    const o = c.ownerOf(p.slides[k].id);
    if (o && o !== owner) { next = { key: o, at: k }; break; }
    if (!o && owner) break;
  }
  const changed = !!owner && owner !== prevOwner;
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!changed) { setFlash(false); return undefined; }
    setFlash(true);
    const tm = setTimeout(() => setFlash(false), 2600);
    return () => clearTimeout(tm);
  }, [index, owner]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!owner && !next) return null;
  const me = c.myKey();
  const name = (k) => (k === me ? t('You') : c.personName(k));
  return (
    <>
      <div className="pt-turn" aria-live="polite">
        {owner
          ? <><Icon icon="person" size={12} /><b>{owner === me ? t('Your turn') : t('{name}’s turn', { name: name(owner) })}</b></>
          : <span className="muted-w">{t('Nobody assigned')}</span>}
        {next && <span className="pt-next">{t('then {name} (slide {n})', { name: name(next.key), n: next.at + 1 })}</span>}
      </div>
      {flash && (
        <div className="pt-flash" role="status">
          <Icon icon="person" size={22} />
          <span>{owner === me ? t('Your turn') : t('{name}’s turn', { name: name(owner) })}</span>
        </div>
      )}
    </>
  );
}

/** Notes shown on top of the in-app presentation (S to show or hide). They can be edited right there. */
export function PresenterNotes({ c, index }) {
  useController(c);
  const [show, setShow] = useState(() => { try { return localStorage.getItem('morph-present-notes') === '1'; } catch (e) { return false; } });
  const showRef = useRef(show);
  const set = (v) => { showRef.current = v; setShow(v); try { localStorage.setItem('morph-present-notes', v ? '1' : '0'); } catch (e) { /* ignore */ } };
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tg = e.target;
      if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || ''))) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tg.blur(); }
        return;
      }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); e.stopPropagation(); set(!showRef.current); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const slide = c.project && c.project.slides[index];
  const sid = slide && slide.id;
  const saved = sid ? c.noteOf(sid) : '';
  const [text, setText] = useState(saved);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(saved); }, [sid, saved]);
  const can = c.canWrite !== false;
  return (
    <>
      <Turn c={c} index={index} />
      <Tooltip content={show ? t('Hide notes (S)') : t('Show notes (S)')} placement="bottom-end" compact>
        <button type="button" className={'pn-toggle' + (show ? ' is-on' : '')} onClick={() => set(!show)} aria-pressed={show}>
          <Icon icon="annotation" size={14} /> {t('Notes')}
        </button>
      </Tooltip>
      {show && slide && (
        <div className="pn-panel" role="note" onClick={(e) => e.stopPropagation()}>
          <div className="pn-head">
            <span>{t('Slide {n}', { n: index + 1 })}</span>
            <span className="pn-hint">{can ? t('Click to edit. Esc to go back to the slides.') : ''}</span>
          </div>
          <textarea
            className="pn-text"
            value={text}
            readOnly={!can}
            placeholder={t('No notes for this slide.')}
            onFocus={() => { focused.current = true; }}
            onBlur={() => { focused.current = false; }}
            onChange={(e) => { setText(e.target.value); c.setNote(sid, e.target.value); }}
            aria-label={t('Notes for slide {n}', { n: index + 1 })}
          />
        </div>
      )}
    </>
  );
}
