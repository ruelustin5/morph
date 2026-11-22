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

/** Notes shown on top of the in-app presentation (S to show or hide). */
export function PresenterNotes({ c, index }) {
  const [show, setShow] = useState(() => { try { return localStorage.getItem('morph-present-notes') === '1'; } catch (e) { return false; } });
  const showRef = useRef(show);
  const set = (v) => { showRef.current = v; setShow(v); try { localStorage.setItem('morph-present-notes', v ? '1' : '0'); } catch (e) { /* ignore */ } };
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); e.stopPropagation(); set(!showRef.current); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const slide = c.project && c.project.slides[index];
  const note = slide ? c.noteOf(slide.id) : '';
  return (
    <>
      <Tooltip content={show ? t('Hide notes (S)') : t('Show notes (S)')} placement="bottom-end" compact>
        <button type="button" className={'pn-toggle' + (show ? ' is-on' : '')} onClick={() => set(!show)} aria-pressed={show}>
          <Icon icon="annotation" size={14} /> {t('Notes')}
        </button>
      </Tooltip>
      {show && (
        <div className="pn-panel" role="note">
          <div className="pn-head">{t('Slide {n}', { n: index + 1 })}</div>
          {note ? <div className="pn-text">{note}</div> : <div className="pn-text pn-empty">{t('No notes for this slide.')}</div>}
        </div>
      )}
    </>
  );
}
