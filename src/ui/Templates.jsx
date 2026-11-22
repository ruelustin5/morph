import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, Icon, InputGroup, Spinner, Tooltip } from '@blueprintjs/core';
import { Thumb } from './SlideSorter';
import { useController } from './hooks';
import { fitPage } from '../builtin-templates';
import { THEMES, themeById, themeLayouts } from '../themes';
import { ensureFonts } from '../controller';

/** Name a slide and keep it as a template (shared by all projects). */
export function SaveTemplateDialog({ c }) {
  useController(c);
  const i = c.ui.saveTpl;
  const open = i != null && !!c.project && !!c.project.slides[i];
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(`Slide ${i + 1}`); }, [open, i]);
  const close = () => c.setUi({ saveTpl: null });
  const p = c.project;
  return (
    <Dialog isOpen={open} onClose={close} title="Save as template" icon="bookmark" className="tpl-save">
      {open && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          await c.saveSlideAsTemplate(i, name.trim());
          setBusy(false);
          close();
        }}>
          <DialogBody>
            <div className="tpl-save-thumb" style={{ aspectRatio: `${p.width} / ${p.height}` }}>
              <Thumb page={p.slides[i].page} w={p.width} h={p.height} ctx={c.ctx} tick={c.renderTick} />
            </div>
            <InputGroup large autoFocus value={name} maxLength={60} placeholder="Template name" onChange={(e) => setName(e.target.value)} />
          </DialogBody>
          <DialogFooter actions={<>
            <Button text="Cancel" onClick={close} />
            <Button type="submit" intent="primary" text="Save template" loading={busy} disabled={!name.trim()} />
          </>} />
        </form>
      )}
    </Dialog>
  );
}

/** Pick a slide layout of a theme (or a blank slide, or one of your templates) to insert. */
export function TemplateGallery({ c }) {
  useController(c);
  const at = c.ui.tplAt;
  const open = at != null && !!c.project;
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [view, setView] = useState('classic');
  useEffect(() => {
    if (!open) return;
    setConfirm(null);
    setView(c.ui.tplView || (c.theme && c.theme.id) || 'classic');
    if (c.isOwner) {
      setLoading(!c.templates);
      c.loadTemplates().catch(() => {}).finally(() => setLoading(false));
    }
  }, [open]);
  const PW = c.project ? c.project.width : 1920, PH = c.project ? c.project.height : 1080;
  const layouts = useMemo(() => (view === 'yours' ? [] : themeLayouts(view)).map((t) => ({ ...t, fitted: fitPage(t.page, t.w, t.h, PW, PH) })), [view, PW, PH]);
  useEffect(() => { if (open && layouts.length) ensureFonts({ slides: layouts.map((t) => ({ page: t.page })), fonts: [] }); }, [open, view]);
  const close = () => c.setUi({ tplAt: null, tplView: null });
  const list = c.templates || [];
  const T = themeById(view);
  const cur = c.theme;
  const curCount = cur && T && cur.id !== T.id ? c.themeSlides(cur.id).length : 0;
  const pick = (t) => { close(); c.insertTemplate(t, at); };
  return (
    <Dialog isOpen={open} onClose={close} title="New slide" icon="add" className="tpl-gallery">
      {open && (
        <DialogBody>
          <div className="tpl-themes" role="tablist" aria-label="Themes">
            {THEMES.map((th) => (
              <button key={th.id} type="button" role="tab" aria-selected={view === th.id}
                className={'tpl-theme' + (view === th.id ? ' is-on' : '')} onClick={() => setView(th.id)}>
                <span className="tpl-swatch" style={{ background: th.paper }}>
                  <i style={{ background: th.panel }} /><i style={{ background: th.accent }} />
                </span>
                {th.name}
                {cur && cur.id === th.id && <span className="tpl-current" title="This presentation's theme"><Icon icon="tick" size={10} /></span>}
              </button>
            ))}
            {c.isOwner && (
              <button type="button" role="tab" aria-selected={view === 'yours'}
                className={'tpl-theme' + (view === 'yours' ? ' is-on' : '')} onClick={() => setView('yours')}>
                <Icon icon="bookmark" size={12} /> Yours
              </button>
            )}
          </div>
          {T && (
            <p className="tpl-hint">
              {curCount > 0
                ? <>This presentation uses {cur.name}. <Button small minimal intent="primary" text={`Switch ${curCount} slide${curCount > 1 ? 's' : ''} to ${T.name}`}
                    onClick={() => c.setTheme(T.id, { restyle: true })} /></>
                : <>Layouts of a theme share their shapes, so going from one to the next morphs smoothly.</>}
            </p>
          )}
          {view !== 'yours' && (
            <div className="tpl-grid">
              <button type="button" className="tpl-tile" onClick={() => { close(); c.addSlide(at, T ? { background: T.paper } : {}); }}>
                <span className="tpl-thumb tpl-blank" style={{ aspectRatio: `${c.project.width} / ${c.project.height}`, background: T ? T.paper : undefined, color: T ? T.muted : undefined }}>
                  <Icon icon="plus" size={22} />
                </span>
                <span className="tpl-name">Blank</span>
              </button>
              {layouts.map((t) => (
                <button key={t.id} type="button" className="tpl-tile" onClick={() => pick(t)}>
                  <span className="tpl-thumb" style={{ aspectRatio: `${c.project.width} / ${c.project.height}` }}>
                    <Thumb page={t.fitted} w={PW} h={PH} ctx={c.ctx} tick={c.renderTick} />
                  </span>
                  <span className="tpl-name">{t.name}</span>
                </button>
              ))}
            </div>
          )}
          {view === 'yours' && list.length > 0 && <div className="tpl-grid">
            {list.map((t) => (
              <div key={t.id} className="tpl-tile" role="button" tabIndex={0}
                onClick={() => pick(t)}
                onKeyDown={(e) => { if (e.key === 'Enter') pick(t); }}>
                <span className="tpl-thumb" style={{ aspectRatio: `${t.w} / ${t.h}` }}>
                  <Thumb page={t.page} w={t.w} h={t.h} ctx={c.ctx} tick={c.renderTick} />
                </span>
                <span className="tpl-name">{t.name}</span>
                <Tooltip content={confirm === t.id ? 'Click again to delete' : 'Delete template'} compact placement="top">
                  <button type="button" className={'tpl-del' + (confirm === t.id ? ' is-armed' : '')} aria-label="Delete template"
                    onClick={(e) => { e.stopPropagation(); if (confirm === t.id) c.deleteTemplate(t.id); else setConfirm(t.id); }}>
                    <Icon icon="trash" size={12} />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>}
          {view === 'yours' && loading && <div className="tpl-loading"><Spinner size={18} /></div>}
          {view === 'yours' && !loading && !list.length && (
            <p className="muted tpl-empty"><Icon icon="bookmark" size={12} /> Right-click a slide › Save as template</p>
          )}
        </DialogBody>
      )}
      {open && (
        <DialogFooter actions={<Button text="Cancel" onClick={close} />}>
          {cur
            ? <span className="tpl-foot">The + button opens this window. <Button small minimal text="Turn off" onClick={() => c.setTheme(null)} /></span>
            : <span className="tpl-foot muted">Pick a layout to give this presentation a theme.</span>}
        </DialogFooter>
      )}
    </Dialog>
  );
}
