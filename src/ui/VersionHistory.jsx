import React, { useEffect, useState } from 'react';
import { Alert, Button, Icon, InputGroup, Menu, MenuDivider, MenuItem, Popover, Spinner, Switch } from '@blueprintjs/core';
import { useController } from './hooks';
import { Thumb } from './SlideSorter';
import { Avatar } from './People';
import { t, tj, LANG } from '../i18n';

const dayLabel = (ts) => {
  const d = new Date(ts), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return t('Today');
  if (d.toDateString() === y.toDateString()) return t('Yesterday');
  return d.toLocaleDateString(LANG, { weekday: 'long', month: 'long', day: 'numeric' });
};
const timeLabel = (ts) => new Date(ts).toLocaleTimeString(LANG, { hour: 'numeric', minute: '2-digit' });
const REASON = { restore: 'Before restoring', created: 'Created' }; // translated where shown

function NameEditor({ initial, onDone }) {
  const [v, setV] = useState(initial || '');
  return (
    <InputGroup
      autoFocus
      small
      value={v}
      placeholder={t('Version name')}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') onDone(null); }}
    />
  );
}

export function VersionHistory({ c, onClose }) {
  useController(c);
  const [sel, setSel] = useState('current');
  const [preview, setPreview] = useState(null); // project shown on the left
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // slot | 'current'
  const [namedOnly, setNamedOnly] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const saves = c.saves || [];
  const entry = sel === 'current' ? null : saves.find((x) => x.slot === sel);

  useEffect(() => {
    let alive = true;
    if (sel === 'current') { setPreview(null); return undefined; }
    if (!entry) { setSel('current'); return undefined; }
    setLoading(true);
    c.loadVersion(entry).then((p) => { if (alive) { setPreview(p); setLoading(false); } })
      .catch(() => { if (alive) { setLoading(false); setPreview(null); c.toast(t('This version could not be opened.'), 'danger'); } });
    return () => { alive = false; };
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !editing && !confirm) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, confirm, onClose]);

  const shown = preview || c.project;
  const list = saves.filter((v) => !namedOnly || v.name);
  const groups = [];
  for (const v of list) {
    const label = dayLabel(v.savedAt);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(v); else groups.push({ label, items: [v] });
  }

  const authorsOf = (v) => {
    const a = (v.authors && v.authors.length ? v.authors : v.by ? [{ uid: v.by }] : []);
    return a.slice(0, 5).map((x) => c.personOf(x));
  };

  return (
    <div className="vh" role="dialog" aria-label={t('Version history')}>
      <header className="vh-bar">
        <Button minimal icon="arrow-left" text={t('Back')} onClick={onClose} />
        <div className="vh-title">{entry ? (entry.name || `${dayLabel(entry.savedAt)}, ${timeLabel(entry.savedAt)}`) : t('Current version')}</div>
        <div className="vh-actions">
          {entry && c.isOwner && <Button icon="duplicate" text={t('Make a copy')} onClick={() => c.copyVersionAsProject(entry)} />}
          {entry && <Button intent="primary" icon="history" text={t('Restore this version')} onClick={() => setConfirm(entry)} />}
        </div>
      </header>
      <div className="vh-body">
        <div className="vh-preview">
          {loading ? <div className="vh-loading"><Spinner size={28} /></div> : (
            <div className="vh-grid">
              {shown.slides.map((s, i) => (
                <div key={s.id + i} className="vh-slide">
                  <div className="vh-thumb" style={{ aspectRatio: `${shown.width} / ${shown.height}` }}>
                    <Thumb page={s.page} w={shown.width} h={shown.height} ctx={c.ctx} tick={c.renderTick} />
                  </div>
                  <span>{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="vh-list">
          <div className="vh-list-head">
            <Switch checked={namedOnly} onChange={(e) => setNamedOnly(e.currentTarget.checked)} label={t('Named versions only')} />
          </div>
          <button type="button" className={'vh-item' + (sel === 'current' ? ' is-selected' : '')} onClick={() => setSel('current')}>
            <div className="vh-time">{t('Current version')}</div>
            <div className="vh-sub">{t('Saved automatically')}</div>
            <div className="vh-people">{c.othersIn(c.projectId).length ? null : null}</div>
          </button>
          <div className="vh-name-current">
            {editing === 'current'
              ? <NameEditor initial="" onDone={async (v) => { setEditing(null); if (v != null) await c.nameCurrentVersion(v.trim()); }} />
              : <Button small minimal icon="tag" text={t('Name current version')} onClick={() => setEditing('current')} />}
          </div>
          {groups.map((g) => (
            <div key={g.label} className="vh-group">
              <div className="vh-day">{g.label}</div>
              {g.items.map((v) => (
                <div key={v.slot} className={'vh-item' + (sel === v.slot ? ' is-selected' : '')} role="button" tabIndex={0}
                  onClick={() => setSel(v.slot)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(v.slot); }}>
                  <div className="vh-row">
                    <div className="vh-time">{timeLabel(v.savedAt)}</div>
                    <Popover placement="bottom-end" minimal content={
                      <Menu>
                        <MenuItem icon="tag" text={v.name ? t('Rename') : t('Name this version')} onClick={() => setEditing(v.slot)} />
                        {c.isOwner && <MenuItem icon="duplicate" text={t('Make a copy')} onClick={() => c.copyVersionAsProject(v)} />}
                        <MenuDivider />
                        <MenuItem icon="trash" intent="danger" text={t('Delete')} onClick={() => c.deleteVersion(v.slot).then(() => { if (sel === v.slot) setSel('current'); })} />
                      </Menu>
                    }>
                      <Button minimal small icon="more" aria-label={t('Version options')} onClick={(e) => e.stopPropagation()} />
                    </Popover>
                  </div>
                  {editing === v.slot
                    ? <div onClick={(e) => e.stopPropagation()}><NameEditor initial={v.name} onDone={(n) => { setEditing(null); if (n != null) c.renameVersion(v.slot, n.trim()); }} /></div>
                    : (v.name || REASON[v.reason]) && <div className={'vh-sub' + (v.name ? ' is-name' : '')}>{v.name || t(REASON[v.reason])}</div>}
                  <div className="vh-people">
                    {authorsOf(v).map((p, k) => <span key={k} className="vh-person"><Avatar person={p} size={16} ring="transparent" /><span>{p.name}</span></span>)}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {!list.length && <p className="vh-empty">{namedOnly ? t('No named versions yet.') : t('Versions are saved automatically every few minutes while you edit.')}</p>}
        </aside>
      </div>
      <Alert
        isOpen={!!confirm}
        icon="history"
        intent="primary"
        confirmButtonText={t('Restore')}
        cancelButtonText={t('Cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { const v = confirm; setConfirm(null); if (await c.restoreVersion(v)) onClose(); }}
      >
        <p>{tj('Restore the version from {when}?', { when: <b>{confirm && timeLabel(confirm.savedAt)}{confirm && confirm.name ? ` (“${confirm.name}”)` : ''}</b> })}</p>
        <p className="muted">{t('Everyone in this project will see it. The current state stays in the history.')}</p>
      </Alert>
    </div>
  );
}
