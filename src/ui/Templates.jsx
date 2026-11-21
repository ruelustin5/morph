import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, Icon, InputGroup, Spinner, Tooltip } from '@blueprintjs/core';
import { Thumb } from './SlideSorter';
import { useController } from './hooks';
import { BUILTIN_TEMPLATES } from '../builtin-templates';

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

/** Pick a template (or a blank slide) to insert. */
export function TemplateGallery({ c }) {
  useController(c);
  const at = c.ui.tplAt;
  const open = at != null && !!c.project;
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => {
    if (!open) return;
    setConfirm(null);
    setLoading(!c.templates);
    c.loadTemplates().catch(() => {}).finally(() => setLoading(false));
  }, [open]);
  const close = () => c.setUi({ tplAt: null });
  const list = c.templates || [];
  return (
    <Dialog isOpen={open} onClose={close} title="New slide" icon="add" className="tpl-gallery">
      {open && (
        <DialogBody>
          <div className="tpl-grid">
            <button type="button" className="tpl-tile" onClick={() => { close(); c.addSlide(at); }}>
              <span className="tpl-thumb tpl-blank" style={{ aspectRatio: `${c.project.width} / ${c.project.height}` }}><Icon icon="plus" size={22} /></span>
              <span className="tpl-name">Blank</span>
            </button>
            {BUILTIN_TEMPLATES.map((t) => (
              <button key={t.id} type="button" className="tpl-tile" onClick={() => { close(); c.insertTemplate(t, at); }}>
                <span className="tpl-thumb" style={{ aspectRatio: `${t.w} / ${t.h}` }}>
                  <Thumb page={t.page} w={t.w} h={t.h} ctx={c.ctx} tick={c.renderTick} />
                </span>
                <span className="tpl-name">{t.name}</span>
              </button>
            ))}
          </div>
          {c.isOwner && <div className="tpl-section">Yours</div>}
          {c.isOwner && list.length > 0 && <div className="tpl-grid">
            {list.map((t) => (
              <div key={t.id} className="tpl-tile" role="button" tabIndex={0}
                onClick={() => { close(); c.insertTemplate(t, at); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { close(); c.insertTemplate(t, at); } }}>
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
          {loading && <div className="tpl-loading"><Spinner size={18} /></div>}
          {c.isOwner && !loading && !list.length && (
            <p className="muted tpl-empty"><Icon icon="bookmark" size={12} /> Right-click a slide › Save as template</p>
          )}
        </DialogBody>
      )}
    </Dialog>
  );
}
