import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Alert, AnchorButton, Button, ButtonGroup, Classes, Dialog, DialogBody, DialogFooter, EditableText, Icon, InputGroup, Menu,
  MenuDivider, MenuItem, OverlayToaster, Popover, Spinner, Tooltip,
} from '@blueprintjs/core';
import { RaeditorContainer, SidePanelWrap, WorkspaceWrap } from 'opn/raeditor-app';
import SidePanel, { DEFAULT_SECTIONS } from 'opn/side-panel/side-panel';
import Toolbar from 'opn/toolbar/toolbar';
import Workspace from 'opn/canvas/workspace';
import ZoomButtons from 'opn/toolbar/zoom-buttons';
import { handleHotkey } from 'opn/canvas/hotkeys';
import { useController } from './ui/hooks';
import { SlideSorter } from './ui/SlideSorter';
import { AnimPanel } from './ui/AnimPanel';
import { Presenter } from './ui/Presenter';
import { fmtTime } from './controller';
import { ProjectsDialog } from './ui/ProjectsDialog';
import { Avatar, AvatarStack, MotionIcon } from './ui/People';
import { VersionHistory } from './ui/VersionHistory';
import { CollabOverlay } from './collab-overlay';
import { OfflineTextSection, OfflineBackgroundSection } from './ui/OfflinePanels';
import { makeObjectMenu } from './ui/ObjectMenu';
import { EquationSection, bindEquations } from './ui/EquationPanel';
import { SaveTemplateDialog, TemplateGallery } from './ui/Templates';
import { ShareDialog, JoinScreen } from './ui/Share';
import { TextFontFamily } from './ui/FontPicker';
import { TextFontSize } from './ui/FontSize';

// Duplicate / delete / position are on the selection's own bar and in the right-click menu.
const Nothing = () => null;
const TOOLBAR_COMPONENTS = { TextFontFamily, TextFontSize, Duplicate: Nothing, Remove: Nothing, Position: Nothing };

// Clicking the open tab again closes the panel (more room for the slide).
let STORE = null;
const toggleTab = (sec) => ({
  ...sec,
  Tab: observer((props) => React.createElement(sec.Tab, { ...props, onClick: () => (props.active && STORE ? STORE.openSidePanel('') : props.onClick()) })),
});

// Editor side-panel sections that work without the editor's online catalogs (see README.md).
const SECTIONS = DEFAULT_SECTIONS
  .filter((s) => ['text', 'elements', 'upload', 'background', 'layers', 'size'].includes(s.name))
  .map((s) => (s.name === 'text' ? OfflineTextSection : s.name === 'background' ? OfflineBackgroundSection : s));
SECTIONS.splice(SECTIONS.findIndex((s) => s.name === 'elements') + 1, 0, EquationSection);
const SECTIONS_T = SECTIONS.map(toggleTab);

const NoPageControls = () => null;

function Logo() {
  return <span className="brand-mark"><MotionIcon size={18} /></span>;
}

function SaveStatus({ c }) {
  if (c.newerSave) {
    return (
      <button type="button" className="save-status is-newer" onClick={() => { c.wantNewer = true; c.emitNow(); }}>
        <Icon icon="refresh" size={12} /><span>Newer version saved by {c.whoSaved(c.newerSave)}</span>
      </button>
    );
  }
  if (c.live && !c.saving) {
    const st = c.readOnlyView ? 'readonly' : c.liveStatus || 'synced';
    const map = {
      synced: ['cloud-tick', 'Saved'], syncing: [null, 'Saving…'],
      offline: ['offline', 'Offline, retrying'], readonly: ['eye-open', 'View only'],
    };
    const [ic, text] = map[st] || map.synced;
    return (
      <Tooltip content={c.status.text} placement="bottom" compact>
        <span className={'save-status is-live-' + st} aria-live="polite">
          {ic ? <Icon icon={ic} size={12} /> : <Spinner size={12} />}<span>{text}</span>
        </span>
      </Tooltip>
    );
  }
  const s = c.status;
  const icon = { ok: 'tick-circle', dirty: 'dot', saving: null, error: 'error', warn: 'warning-sign', loading: null }[s.kind];
  return (
    <span className={'save-status is-' + s.kind} aria-live="polite">
      {s.kind === 'saving' || s.kind === 'loading' ? <Spinner size={12} /> : icon ? <Icon icon={icon} size={12} /> : null}
      <span>{s.text}</span>
    </span>
  );
}

function BackupsMenu({ c, onOpenFile, onRestore }) {
  const saves = c.saves || [];
  return (
    <Menu className="backups-menu">
      <li className={Classes.MENU_HEADER}><h6 className={Classes.HEADING}>Saved versions <span className="muted">(the 3 newest are kept)</span></h6></li>
      {saves.length === 0 && <MenuItem disabled text="Nothing saved yet" />}
      {saves.map((s, k) => (
        <MenuItem
          key={s.slot + s.savedAt}
          icon={k === 0 ? 'floppy-disk' : 'history'}
          text={<span>{k === 0 ? 'Latest' : `Backup ${k}`} <span className="muted">({s.slides} slide{s.slides === 1 ? '' : 's'})</span></span>}
          label={fmtTime(s.savedAt)}
          onClick={() => onRestore(s)}
        />
      ))}
      <MenuDivider />
      <MenuItem icon="download" text="Download project file (.json)" onClick={async () => {
        const r = await c.exportProjectFile();
        if (r.ok) c.toast('Project file downloaded', 'success');
        else if (r.reason !== 'declined') c.toast('Downloads are not available here.', 'warning');
      }} />
      <MenuItem icon="folder-open" text="Open project file…" onClick={onOpenFile} />
    </Menu>
  );
}

const TopBar = observer(function TopBar({ c, onPresent, onExport, exporting, animOpen, onToggleAnim, onProjects, onHistory, onShare }) {
  useController(c);
  const fileRef = useRef(null);
  const [restore, setRestore] = useState(null);
  const p = c.project;
  return (
    <header className="topbar">
      <div className="brand"><Logo /><span className="brand-name">Morph</span></div>
      <span className="topbar-sep" />
      <Tooltip content={c.isOwner ? 'Your projects' : 'Projects shared with you'} placement="bottom-start" compact>
        <Button minimal icon={c.isOwner ? 'home' : 'people'} text={c.spaceName()} className="projects-btn" onClick={onProjects} disabled={!p && c.isOwner} />
      </Tooltip>
      <Icon icon="chevron-right" size={12} className="muted crumb" />
      {p && (
        <EditableText
          className="title-edit"
          key={p.title}
          defaultValue={p.title}
          placeholder="Untitled presentation"
          maxLength={80}
          selectAllOnFocus
          onConfirm={(v) => { if ((v || '').trim() !== p.title) c.setTitle((v || '').trim()); }}
        />
      )}
      {p && c.isOwner && c.canShare && (
        <Tooltip content={c.projectShared ? 'Shared · manage who can open it' : 'Private · share it'} placement="bottom" compact>
          <Button small minimal icon={c.projectShared ? 'people' : 'lock'} className={'share-chip' + (c.projectShared ? ' is-shared' : '')}
            text={c.projectShared ? 'Shared' : null} onClick={onShare} aria-label="Share" />
        </Tooltip>
      )}
      <div className="topbar-spacer" />
      {p && (
        <span className="people">
          {c.othersIn(c.projectId).length > 0 && (
            <AvatarStack c={c} peers={c.othersIn(c.projectId)} describe={(x) => {
              const k = c.project.slides.findIndex((s) => s.id === x.presence.slide);
              return k >= 0 ? `slide ${k + 1}` : '';
            }} />
          )}
          {c.room && (
            <Tooltip content={c.myName() ? `You: ${c.myName()}${c.me && c.me.name ? '' : ' (click to change)'}` : 'Set your name'} placement="bottom" compact>
              <button type="button" className="me-chip" onClick={() => { if (!(c.me && c.me.name)) { c.needsName = true; c.emitNow(); } }} aria-label="Your name">
                <Avatar person={{ name: c.myName() || '?', color: (c.me && c.me.color) || '#5f6b7c', avatar: c.me && c.me.avatarUrl && !c.me.avatarUrl.startsWith('data:') ? c.me.avatarUrl : null }} size={26} ring="#f0f4f9" />
              </button>
            </Tooltip>
          )}
        </span>
      )}
      <SaveStatus c={c} />
      {c.live ? (
        <Tooltip content="Version history" placement="bottom" compact>
          <Button minimal icon="history" aria-label="Version history" onClick={onHistory} disabled={!p} />
        </Tooltip>
      ) : (
        <ButtonGroup className="save-group">
          <Tooltip content="Save (Ctrl+S)" placement="bottom" compact>
            <Button icon="floppy-disk" text="Save" intent={c.dirty ? 'primary' : 'none'} disabled={c.saving || !p} onClick={() => c.save()} />
          </Tooltip>
          <Popover content={<BackupsMenu c={c} onOpenFile={() => fileRef.current && fileRef.current.click()} onRestore={setRestore} />}
            placement="bottom-end" minimal onOpening={() => c.refreshSaves()}>
            <Button icon="history" aria-label="Backups" />
          </Popover>
        </ButtonGroup>
      )}
      <Popover placement="bottom-end" minimal content={
        <Menu>
          <MenuItem icon="download" text="Download project file" onClick={async () => {
            const r = await c.exportProjectFile();
            if (r.ok) c.toast('Project file downloaded', 'success');
            else if (r.reason !== 'declined') c.toast('Downloads are not available here.', 'warning');
          }} />
          {c.isOwner && <MenuItem icon="folder-open" text="Open project file…" onClick={() => fileRef.current && fileRef.current.click()} />}
          {typeof window !== 'undefined' && window.__web && window.__web.configured && (c.isOwner
            ? <MenuItem icon="log-out" text="Sign out" onClick={async () => { await window.__web.signOut(); window.location.reload(); }} />
            : <MenuItem icon="log-in" text="This is my space: sign in" onClick={async () => {
                try { const r = await window.__web.signInOwner(); if (r.owner) window.location.reload(); else c.toast('This space belongs to someone else.', 'warning'); }
                catch (e) { c.toast('Sign-in did not finish: ' + ((e && e.message) || e), 'warning'); }
              }} />)}
        </Menu>
      }>
        <Button minimal icon="more" aria-label="More" disabled={!p} />
      </Popover>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try { await c.importProjectFile(await f.text()); c.toast('Imported as a new project', 'success'); }
        catch (err) { c.toast('Could not open that file: ' + (err.message || err), 'danger'); }
      }} />
      <span className="topbar-sep" />
      <ButtonGroup className="present-group">
        <Button className="present-btn" icon="play" text="Present" onClick={() => onPresent(0)} disabled={!p} />
        <Popover placement="bottom-end" minimal content={
          <Menu>
            <MenuItem icon="fast-backward" text="From the beginning" onClick={() => onPresent(0)} />
            <MenuItem icon="play" text={`From slide ${c.active + 1}`} onClick={() => onPresent(c.active)} />
          </Menu>
        }>
          <Button icon="caret-down" aria-label="Present options" disabled={!p} />
        </Popover>
      </ButtonGroup>
      <Tooltip content="Download the presentation as one standalone .html file" placement="bottom-end" compact>
        <Button icon="export" text="Export" intent="primary" loading={exporting} onClick={onExport} disabled={!p} />
      </Tooltip>
      <Tooltip content={animOpen ? 'Hide the animation panel' : 'Show the animation panel'} placement="bottom-end" compact>
        <Button icon={<MotionIcon />} text="Animation" className="anim-toggle" minimal active={animOpen} onClick={onToggleAnim} aria-label="Toggle animation panel" aria-pressed={animOpen} />
      </Tooltip>
      <Alert
        isOpen={!!restore}
        icon="history"
        cancelButtonText="Cancel"
        confirmButtonText="Open this save"
        onCancel={() => setRestore(null)}
        onConfirm={() => { const s = restore; setRestore(null); c.restoreSave(s); }}
      >
        <p>{c.live ? 'Restore' : 'Open'} the version from <b>{restore && fmtTime(restore.savedAt)}</b>?</p>
        {c.live
          ? <p>The project goes back to that version for everyone working on it.{c.othersIn(c.projectId).length ? ' Others are editing right now.' : ''}</p>
          : c.dirty && <p>Your current unsaved changes will be replaced.</p>}
        <p className="muted">Nothing is deleted: the other saved copies stay available.</p>
      </Alert>
    </header>
  );
});

export const App = observer(function App({ c, store }) {
  useController(c);
  STORE = store;
  bindEquations(c);
  const toasterRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [presenting, setPresenting] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportFallback, setExportFallback] = useState(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareId, setShareId] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [animOpen, setAnimOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const presentingRef = useRef(false);
  const editorRef = useRef(null);
  const [wsComponents] = useState(() => ({ PageControls: NoPageControls, ContextMenu: makeObjectMenu(c) }));
  c.openAnim = () => setAnimOpen(true);
  c.closeAnim = () => setAnimOpen(false);
  useEffect(() => {
    if (!ready || !editorRef.current) return;
    const ov = new CollabOverlay(c, editorRef.current);
    return () => ov.destroy();
  }, [ready, c]);
  presentingRef.current = presenting != null;
  c.isPresenting = presenting != null; // no toasts over the presentation
  useEffect(() => { if (presenting != null && toasterRef.current) toasterRef.current.clear(); }, [presenting != null]);

  useEffect(() => {
    c.toaster = { show: (o) => toasterRef.current && toasterRef.current.show(o) };
    c.init().then(() => setReady(true));
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        c.save();
      }
    };
    const onBeforeUnload = (e) => {
      const pending = c.live ? c.live.busy() : c.dirty;
      if (pending) { if (c.live) c.live.flushAll(); e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('beforeunload', onBeforeUnload); };
  }, [c]);

  // Editor shortcuts stay off while presenting or while focus is in the slide list / animation panel.
  const onEditorKey = (e, st) => {
    if (presentingRef.current) return;
    const a = document.activeElement;
    if (a && a.closest && a.closest('.sorter, .anim, .topbar, .bp5-overlay')) return;
    handleHotkey(e, st);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const r = await c.exportHtml();
      if (r.ok) c.toast(`Exported ${r.name}`, 'success');
      else if (r.reason === 'declined') { /* viewer said no */ }
      else setExportFallback(r);
    } catch (e) {
      c.toast('Export failed: ' + (e.message || e), 'danger');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <TopBar c={c} onPresent={(i) => setPresenting(i)} onExport={doExport} exporting={exporting}
        animOpen={animOpen} onToggleAnim={() => setAnimOpen((v) => !v)} onProjects={() => setProjectsOpen(true)} onHistory={() => setHistoryOpen(true)}
        onShare={() => setShareId(c.projectId)} />
      <div className={'main' + (animOpen ? '' : ' no-anim')}>
        <SlideSorter c={c} />
        <div className="editor" ref={editorRef}>
          <RaeditorContainer className="editor-host">
            <SidePanelWrap><SidePanel store={store} sections={SECTIONS_T} defaultSection="" /></SidePanelWrap>
            <WorkspaceWrap>
              <Toolbar store={store} components={TOOLBAR_COMPONENTS} />
              <Workspace store={store} pageControlsEnabled={false} components={wsComponents} onKeyDown={onEditorKey} backgroundColor="#f0f4f9" />
              <ZoomButtons store={store} />
            </WorkspaceWrap>
          </RaeditorContainer>
        </div>
        <AnimPanel c={c} />
      </div>
      {(!ready || c.busy) && (
        <div className="boot">
          <Spinner size={28} />
          <div>Opening your presentation…</div>
        </div>
      )}
      <ProjectsDialog c={c} isOpen={projectsOpen} onClose={() => setProjectsOpen(false)} onShare={(id) => { setProjectsOpen(false); setShareId(id); }} />
      {shareId && <ShareDialog c={c} projectId={shareId} onClose={() => setShareId(null)} />}
      {ready && !c.project && !c.isOwner && !c.busy && <JoinScreen c={c} />}
      {typeof window !== 'undefined' && window.__web && !window.__web.configured && (
        <div className="setup-banner"><Icon icon="warning-sign" size={14} /> Firebase isn’t set up yet: projects are saved in this browser only (see SETUP.md).</div>
      )}
      {historyOpen && <VersionHistory c={c} onClose={() => setHistoryOpen(false)} />}
      <SaveTemplateDialog c={c} />
      <TemplateGallery c={c} />
      <Dialog isOpen={!!(ready && c.needsName)} title="What’s your name?" icon="user" isCloseButtonShown={!!c.myName()} canEscapeKeyClose={!!c.myName()} canOutsideClickClose={false}
        onClose={() => { c.needsName = false; c.emitNow(); }} className="name-dialog">
        <form onSubmit={(e) => { e.preventDefault(); if (nameDraft.trim()) c.setNick(nameDraft); }}>
          <DialogBody>
            <p className="muted">Shown to people working with you.</p>
            <InputGroup large autoFocus value={nameDraft} placeholder="Your name" maxLength={40} onChange={(e) => setNameDraft(e.target.value)} />
          </DialogBody>
          <DialogFooter actions={<Button type="submit" intent="primary" text="Continue" disabled={!nameDraft.trim()} />} />
        </form>
      </Dialog>
      <Alert
        isOpen={!!c.saveConflict}
        icon="warning-sign"
        intent="warning"
        confirmButtonText="Save mine anyway"
        cancelButtonText="Cancel"
        onConfirm={() => c.save({ force: true })}
        onCancel={() => { c.saveConflict = null; c.emitNow(); }}
      >
        <p><b>{c.saveConflict && c.whoSaved(c.saveConflict)}</b> saved this project at {c.saveConflict && fmtTime(c.saveConflict.savedAt)}, after you opened it.</p>
        <p>If you save now, your version becomes the latest. Theirs stays available under <b>Backups</b> (clock button).</p>
      </Alert>
      <Alert
        isOpen={!!c.wantNewer}
        icon="refresh"
        intent="primary"
        confirmButtonText="Open the newer version"
        cancelButtonText="Keep working on mine"
        onConfirm={() => c.openNewer()}
        onCancel={() => { c.wantNewer = false; c.emitNow(); }}
      >
        <p><b>{c.newerSave && c.whoSaved(c.newerSave)}</b> saved this project at {c.newerSave && fmtTime(c.newerSave.savedAt)}.</p>
        {c.dirty ? <p>Opening it replaces your unsaved changes here.</p> : <p>Your screen shows the older version.</p>}
      </Alert>
      {presenting != null && (
        <Presenter c={c} start={presenting} onClose={(i) => { setPresenting(null); c.selectSlide(i); }} />
      )}
      <Alert
        isOpen={!!c.pendingDraft}
        icon="lifesaver"
        intent="primary"
        confirmButtonText="Restore"
        cancelButtonText="Discard"
        onConfirm={() => c.restoreDraft()}
        onCancel={() => c.discardDraft()}
      >
        <p>You have unsaved changes from <b>{c.pendingDraft && fmtTime(c.pendingDraft.at)}</b> (newer than your last save).</p>
        <p>Restore them?</p>
      </Alert>
      <Dialog isOpen={!!exportFallback} onClose={() => setExportFallback(null)} title="Export" icon="export">
        <DialogBody>
          <p>Downloads are not available in this view, so the file could not be saved directly.</p>
          <p>Copy the HTML below and paste it into a new file named <code>{exportFallback && exportFallback.name}</code>, then open it in a browser.</p>
        </DialogBody>
        <DialogFooter actions={<>
          <Button text="Close" onClick={() => setExportFallback(null)} />
          <Button intent="primary" icon="clipboard" text="Copy HTML" onClick={async () => {
            try { await navigator.clipboard.writeText(exportFallback.html); c.toast('HTML copied', 'success'); }
            catch (e) { c.toast('Copy was blocked by the browser.', 'warning'); }
          }} />
        </>} />
      </Dialog>
      <OverlayToaster ref={toasterRef} position="bottom" maxToasts={3} />
    </div>
  );
});
