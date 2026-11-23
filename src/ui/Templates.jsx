import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, Icon, InputGroup, Spinner, Tooltip } from '@blueprintjs/core';
import { Thumb } from './SlideSorter';
import { useController } from './hooks';
import { fitPage } from '../builtin-templates';
import { THEMES, themeById, themeLayouts } from '../themes';
import { ensureFonts } from '../controller';
import { t, tn } from '../i18n';

/** Name a slide and keep it as a template (shared by all projects). */
export function SaveTemplateDialog({ c }) {
  useController(c);
  const i = c.ui.saveTpl;
  const open = i != null && !!c.project && !!c.project.slides[i];
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(t('Slide {n}', { n: i + 1 })); }, [open, i]);
  const close = () => c.setUi({ saveTpl: null });
  const p = c.project;
  return (
    <Dialog isOpen={open} onClose={close} title={t('Save as template')} icon="bookmark" className="tpl-save">
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
            <InputGroup large autoFocus value={name} maxLength={60} placeholder={t('Template name')} onChange={(e) => setName(e.target.value)} />
          </DialogBody>
          <DialogFooter actions={<>
            <Button text={t('Cancel')} onClick={close} />
            <Button type="submit" intent="primary" text={t('Save template')} loading={busy} disabled={!name.trim()} />
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
  const layouts = useMemo(() => (view === 'yours' ? [] : themeLayouts(view)).map((x) => ({ ...x, fitted: fitPage(x.page, x.w, x.h, PW, PH) })), [view, PW, PH]);
  useEffect(() => { if (open && layouts.length) ensureFonts({ slides: layouts.map((x) => ({ page: x.page })), fonts: [] }); }, [open, view]);
  const close = () => c.setUi({ tplAt: null, tplView: null });
  const list = c.templates || [];
  const T = themeById(view);
  const cur = c.theme;
  const curCount = cur && T && cur.id !== T.id ? c.themeSlides(cur.id).length : 0;
  const pick = (tp) => { close(); c.insertTemplate(tp, at); };
  return (
    <Dialog isOpen={open} onClose={close} title={t('New slide')} icon="add" className="tpl-gallery">
      {open && (
        <DialogBody>
          <div className="tpl-themes" role="tablist" aria-label={t('Themes')}>
            {THEMES.map((th) => (
              <button key={th.id} type="button" role="tab" aria-selected={view === th.id}
                className={'tpl-theme' + (view === th.id ? ' is-on' : '')} onClick={() => setView(th.id)}>
                <span className="tpl-swatch" style={{ background: th.paper }}>
                  <i style={{ background: th.panel }} /><i style={{ background: th.accent }} />
                </span>
                {t(th.name)}
                {cur && cur.id === th.id && <span className="tpl-current" title={t('This presentation\'s theme')}><Icon icon="tick" size={10} /></span>}
              </button>
            ))}
            {c.isOwner && (
              <button type="button" role="tab" aria-selected={view === 'yours'}
                className={'tpl-theme' + (view === 'yours' ? ' is-on' : '')} onClick={() => setView('yours')}>
                <Icon icon="bookmark" size={12} /> {t('Yours')}
              </button>
            )}
          </div>
          {T && (
            <p className="tpl-hint">
              {curCount > 0
                ? <>{t('This presentation uses {theme}.', { theme: t(cur.name) })} <Button small minimal intent="primary" text={tn(curCount, 'Switch 1 slide to {theme}', 'Switch {n} slides to {theme}', { theme: t(T.name) })}
                    onClick={() => c.setTheme(T.id, { restyle: true })} /></>
                : !cur && c.project.slides.length > 0
                  ? <>{t('Layouts of a theme share their shapes, so going from one to the next morphs smoothly.')} <Button small minimal intent="primary"
                      text={tn(c.project.slides.length, 'Apply {theme} to the slide', 'Apply {theme} to all {n} slides', { theme: t(T.name) })}
                      onClick={() => c.setTheme(T.id, { restyle: true })} /></>
                  : <>{t('Layouts of a theme share their shapes, so going from one to the next morphs smoothly.')}</>}
            </p>
          )}
          {view !== 'yours' && (
            <div className="tpl-grid">
              <button type="button" className="tpl-tile" onClick={() => { close(); c.addSlide(at, T ? { background: T.paper } : {}); }}>
                <span className="tpl-thumb tpl-blank" style={{ aspectRatio: `${c.project.width} / ${c.project.height}`, background: T ? T.paper : undefined, color: T ? T.muted : undefined }}>
                  <Icon icon="plus" size={22} />
                </span>
                <span className="tpl-name">{t('Blank')}</span>
              </button>
              {layouts.map((tp) => (
                <button key={tp.id} type="button" className="tpl-tile" onClick={() => pick(tp)}>
                  <span className="tpl-thumb" style={{ aspectRatio: `${c.project.width} / ${c.project.height}` }}>
                    <Thumb page={tp.fitted} w={PW} h={PH} ctx={c.ctx} tick={c.renderTick} />
                  </span>
                  <span className="tpl-name">{t(tp.name)}</span>
                </button>
              ))}
            </div>
          )}
          {view === 'yours' && list.length > 0 && <div className="tpl-grid">
            {list.map((tp) => (
              <div key={tp.id} className="tpl-tile" role="button" tabIndex={0}
                onClick={() => pick(tp)}
                onKeyDown={(e) => { if (e.key === 'Enter') pick(tp); }}>
                <span className="tpl-thumb" style={{ aspectRatio: `${tp.w} / ${tp.h}` }}>
                  <Thumb page={tp.page} w={tp.w} h={tp.h} ctx={c.ctx} tick={c.renderTick} />
                </span>
                <span className="tpl-name">{tp.name}</span>
                <Tooltip content={confirm === tp.id ? t('Click again to delete') : t('Delete template')} compact placement="top">
                  <button type="button" className={'tpl-del' + (confirm === tp.id ? ' is-armed' : '')} aria-label={t('Delete template')}
                    onClick={(e) => { e.stopPropagation(); if (confirm === tp.id) c.deleteTemplate(tp.id); else setConfirm(tp.id); }}>
                    <Icon icon="trash" size={12} />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>}
          {view === 'yours' && loading && <div className="tpl-loading"><Spinner size={18} /></div>}
          {view === 'yours' && !loading && !list.length && (
            <p className="muted tpl-empty"><Icon icon="bookmark" size={12} /> {t('Right-click a slide › Save as template')}</p>
          )}
        </DialogBody>
      )}
      {open && (
        <DialogFooter actions={<Button text={t('Cancel')} onClick={close} />}>
          {cur
            ? <span className="tpl-foot">{t('The + button opens this window.')} <Button small minimal text={t('Turn off')} onClick={() => c.setTheme(null)} /></span>
            : <span className="tpl-foot muted">{t('Pick a layout to give this presentation a theme.')}</span>}
        </DialogFooter>
      )}
    </Dialog>
  );
}
