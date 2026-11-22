import React, { useState } from 'react';
import { Alert, Button, Dialog, DialogBody, EditableText, Icon, Menu, MenuItem, MenuDivider, Popover, Tag } from '@blueprintjs/core';
import { useController } from './hooks';
import { Thumb } from './SlideSorter';
import { fmtTime } from '../controller';
import { AvatarStack } from './People';
import { JoinForm } from './Share';
import { t, tn, tj } from '../i18n';

function Card({ c, p, onOpen, onDelete, onShare, renaming, setRenaming }) {
  const w = p.w || 1920, h = p.h || 1080;
  const cover = p.current && c.project ? c.project.slides[0].page : p.cover;
  const owner = c.isOwner;
  return (
    <div className={'proj-card' + (p.current ? ' is-current' : '')}>
      <button type="button" className="proj-cover" style={{ aspectRatio: `${w} / ${h}` }} onClick={() => onOpen(p)} aria-label={t('Open {title}', { title: p.title })}>
        {cover ? <Thumb page={cover} w={w} h={h} ctx={c.ctx} tick={c.renderTick} /> : <div className="proj-empty"><Icon icon="presentation" size={24} /></div>}
        {p.current && <Tag className="proj-badge" intent="primary" round>{t('Open')}</Tag>}
        {owner && p.shared && <span className="proj-shared" title={t('Shared')}><Icon icon="people" size={12} /></span>}
        {c.othersIn(p.id).length > 0 && (
          <span className="proj-people"><AvatarStack c={c} peers={c.othersIn(p.id)} size={22} describe={(x) => (x.presence.dirty ? t('editing, unsaved changes') : t('has it open'))} /></span>
        )}
      </button>
      <div className="proj-meta">
        <div className="proj-text">
          {renaming === p.id ? (
            <EditableText
              className="proj-title-edit"
              defaultValue={p.title}
              isEditing
              selectAllOnFocus
              maxLength={80}
              onConfirm={(v) => { setRenaming(null); if ((v || '').trim() && v.trim() !== p.title) c.renameProject(p.id, v); }}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <div className="proj-title" title={p.title} onDoubleClick={() => owner && setRenaming(p.id)}>{p.title}</div>
          )}
          <div className="proj-sub muted">
            {tn(p.slides, '1 slide', '{n} slides')}, {p.unsaved ? t('not saved yet') : c.live ? t('edited {when}', { when: fmtTime(p.updatedAt) }) : p.current && p.dirty ? t('unsaved changes') : t('saved {when}', { when: fmtTime(p.updatedAt) })}
          </div>
        </div>
        <Popover placement="bottom-end" minimal content={
          owner ? (
            <Menu>
              <MenuItem icon="folder-open" text={t('Open')} disabled={p.current} onClick={() => onOpen(p)} />
              {c.canShare && <MenuItem icon="people" text={t('Share…')} disabled={p.unsaved} onClick={() => onShare(p)} />}
              <MenuItem icon="edit" text={t('Rename')} onClick={() => setRenaming(p.id)} />
              <MenuItem icon="duplicate" text={t('Duplicate')} disabled={p.unsaved} onClick={() => c.duplicateProject(p.id)} />
              <MenuDivider />
              <MenuItem icon="trash" intent="danger" text={t('Delete')} disabled={p.unsaved} onClick={() => onDelete(p)} />
            </Menu>
          ) : (
            <Menu>
              <MenuItem icon="folder-open" text={t('Open')} disabled={p.current} onClick={() => onOpen(p)} />
              <MenuDivider />
              <MenuItem icon="log-out" intent="danger" text={t('Remove from my list')} onClick={() => c.leaveProject(p.id)} />
            </Menu>
          )
        }>
          <Button minimal small icon="more" aria-label={t('Options for {title}', { title: p.title })} />
        </Popover>
      </div>
    </div>
  );
}

export function ProjectsDialog({ c, isOpen, onClose, onShare }) {
  useController(c);
  const [confirm, setConfirm] = useState(null); // { kind: 'open'|'new', p }
  const [del, setDel] = useState(null);
  const [renaming, setRenaming] = useState(null);
  if (!c.project && c.isOwner) return null;
  const list = c.projectList();

  const go = async (action, saveFirst) => {
    if (saveFirst) { await c.save(); if (c.dirty) return; }
    if (action.kind === 'new') c.newProject();
    else await c.openProject(action.p.id);
    onClose();
  };
  const request = (action) => {
    if (action.kind === 'open' && action.p.current) { onClose(); return; }
    if (c.dirty && !c.live) setConfirm(action); else go(action, false);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={c.spaceName()} icon={c.isOwner ? 'home' : 'people'} className="proj-dialog">
      <DialogBody>
        <div className="proj-toolbar">
          {c.isOwner ? (
            <>
              <span className="muted proj-count"><Icon icon="lock" size={12} /> {tn(list.length, '1 project, private unless you share it', '{n} projects, private unless you share them')}</span>
              <Button intent="primary" icon="plus" text={t('New project')} onClick={() => request({ kind: 'new' })} />
            </>
          ) : (typeof window !== 'undefined' && window.__web) ? (
            <span className="muted proj-count"><Icon icon="link" size={12} /> {t('Open a secret link to add a project here')}</span>
          ) : (
            <JoinForm c={c} autoFocus={false} onDone={onClose} />
          )}
        </div>
        <div className="proj-grid">
          {list.map((p) => (
            <Card key={p.id} c={c} p={p} renaming={renaming} setRenaming={setRenaming}
              onOpen={(x) => request({ kind: 'open', p: x })} onDelete={setDel} onShare={(x) => onShare && onShare(x.id)} />
          ))}
        </div>
      </DialogBody>
      <Alert
        isOpen={!!confirm}
        icon="floppy-disk"
        intent="primary"
        confirmButtonText={t('Save and continue')}
        cancelButtonText={t('Cancel')}
        onConfirm={() => { const a = confirm; setConfirm(null); go(a, true); }}
        onCancel={() => setConfirm(null)}
      >
        <p>{tj('{title} has unsaved changes.', { title: <b>{c.project && c.project.title}</b> })}</p>
        <p>{confirm && confirm.kind === 'new' ? t('Save them before starting a new project?') : tj('Save them before opening {title}?', { title: <b>{confirm && confirm.p.title}</b> })}</p>
        <Button minimal small intent="danger" text={t('Continue without saving')} onClick={() => { const a = confirm; setConfirm(null); go(a, false); }} />
      </Alert>
      <Alert
        isOpen={!!del}
        icon="trash"
        intent="danger"
        confirmButtonText={t('Delete project')}
        cancelButtonText={t('Cancel')}
        onConfirm={() => { const p = del; setDel(null); c.deleteProject(p.id); }}
        onCancel={() => setDel(null)}
      >
        <p>{tj('Delete {title} and all its saved copies?', { title: <b>{del && del.title}</b> })}</p>
        <p className="muted">{t('You’ll have a few seconds to undo.')}</p>
      </Alert>
    </Dialog>
  );
}
