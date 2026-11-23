// App controller: owns the project, keeps the editor store loaded with the active slide,
// and exposes the actions used by the UI.
import { replaceColors, svgToURL, fixSize } from 'opn/utils/svg';
import {
  ensureNames, nameOf, idByName, pruneRegistry, setAnim, leafMap, allLeafIds, findRaw, nearestPrevWith,
  duplicateSlideData, blankPage, deepClone, stateProps, makeName, nameTaken, newId, replaceIdInPage, demoProject,
  normalizeId, normalizeRegistry, freshIds, remapAnim,
} from './project';
import { flattenPage } from './render';
import { fitPage } from './builtin-templates';
import { themeById, parseRoleId, roleId, COLOR_TOKENS, ROLES, decoRadius } from './themes';
import { tutorialProject } from './tutorial';
import { extractAssets, injectAssets, fetchAsset, ensureAsset } from './storage';
import {
  DbBackend, IdbBackend, saveProject, saveVersion, renameVersion, deleteVersion, loadLatest, loadSave, listSaves, saveDraft, loadDraft, clearDraft,
  loadIndex, updateIndex, baseFor, gcAssets, purgeProject,
} from './storage';
import { buildExportHtml, exportFileName } from './export';
import { applySnapshot, getSnapshot } from 'mobx-state-tree';
import { reaction } from 'mobx';
import { LiveSync } from './live';
import { t, tn, LANG } from './i18n';
import { diffPage, applyPageOps, pageOpsEmpty, clone as fastClone } from './sync-core';
import { collectFonts, googleFontsUrl } from './render';
import {
  ScopedBackend, cryptoReady, newKey, randomId, newCode, normalizeCode, codeId, sealInvite, openInvite, copyProjectData, purgeScope,
} from './space';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* global __TARGET__ */
export const TARGET = typeof __TARGET__ !== 'undefined' ? __TARGET__ : 'artifact';
// Where magic links point. The artifact page cannot see its own claude.ai address, so it is written here.
/* global __ARTIFACT_URL__ */
const ARTIFACT_URL = typeof __ARTIFACT_URL__ !== 'undefined' ? __ARTIFACT_URL__ : '';
const CODE_RE = /^#?([A-Za-z0-9]{4})-?([A-Za-z0-9]{4})-?([A-Za-z0-9]{4})$/;

/** A code in the address (#ABCD-EFGH-JKLM) is read once and removed from the address bar. */
function takeHashCode() {
  try {
    const m = (window.location.hash || '').match(CODE_RE);
    if (!m) return null;
    if (TARGET === 'web' && window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    else window.location.hash = '';
    return `${m[1]}-${m[2]}-${m[3]}`.toUpperCase();
  } catch (e) { return null; }
}

/** The magic link for a code. */
export function linkForCode(code) {
  if (TARGET === 'web') return `${window.location.origin}${window.location.pathname}#${code}`;
  return `${ARTIFACT_URL}#${code}`;
}

/** Resolve an artifact capability; waits for the runtime to inject `window.claude`. */
export async function getCapability(name, waitMs = 4000) {
  const t0 = Date.now();
  while (!(window.claude && typeof window.claude.use === 'function')) {
    if (Date.now() - t0 > waitMs) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    return await Promise.race([window.claude.use(name), new Promise((r) => setTimeout(() => r(null), 12000))]);
  } catch (e) { return null; }
}

const _fontLinks = new Set();
/** Make sure every font used on any slide is loaded (the editor only loads the open slide's fonts). */
export function ensureFonts(project) {
  const custom = new Map((project.fonts || []).map((f) => [f.fontFamily, f]));
  for (const fam of collectFonts(project)) {
    if (_fontLinks.has(fam)) continue;
    _fontLinks.add(fam);
    const f = custom.get(fam);
    if (f) {
      const styles = f.styles || (f.url ? [{ src: `url("${f.url}")` }] : []);
      const st = document.createElement('style');
      st.textContent = styles.map((x) => `@font-face{font-family:'${fam}';src:${x.src};font-style:${x.fontStyle || 'normal'};font-weight:${x.fontWeight || 'normal'};font-display:swap}`).join('\n');
      document.head.appendChild(st);
    } else {
      const url = googleFontsUrl(fam);
      if (document.querySelector(`link[href="${url}"]`)) continue;
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = url;
      document.head.appendChild(l);
    }
  }
}

const AUTO_VERSION_MS = 10 * 60 * 1000;
const DEFAULT_NAME_RE = /^(text|image|svg|figure|line|video|gif|group|html)-\d+$/;

function decodeSvgDataUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('data:image/svg+xml')) return null;
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  const meta = url.slice(0, comma), data = url.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) return decodeURIComponent(escape(atob(data)));
    return decodeURIComponent(data);
  } catch (e) { return null; }
}

function stretchSvg(svg) {
  try {
    const fixed = fixSize(svg);
    const doc = new DOMParser().parseFromString(fixed, 'image/svg+xml');
    doc.documentElement.setAttribute('preserveAspectRatio', 'none');
    return new XMLSerializer().serializeToString(doc);
  } catch (e) { return svg; }
}

export function makeRenderCtx(onChange) {
  const sizes = new Map();
  const pending = new Set();
  const svgCache = new Map();
  return {
    size(src) {
      if (!src) return null;
      if (sizes.has(src)) return sizes.get(src);
      if (!pending.has(src)) {
        pending.add(src);
        const img = new Image();
        img.onload = () => { sizes.set(src, { w: img.naturalWidth, h: img.naturalHeight }); onChange(); };
        img.onerror = () => { sizes.set(src, null); };
        img.src = src;
      }
      return null;
    },
    svgSrc(el) {
      const cr = el.colorsReplace && Object.keys(el.colorsReplace).length ? el.colorsReplace : null;
      const key = el.src + '|' + (cr ? JSON.stringify(cr) : '');
      if (svgCache.has(key)) return svgCache.get(key);
      let out = el.src;
      const text = decodeSvgDataUrl(el.src);
      if (text) {
        const svg = stretchSvg(text);
        try { out = cr ? replaceColors(svg, new Map(Object.entries(cr))) : svgToURL(svg); } catch (e) { out = el.src; }
      }
      if (svgCache.size > 400) svgCache.clear();
      svgCache.set(key, out);
      return out;
    },
  };
}

export class Controller {
  constructor(store, toaster) {
    this.store = store;
    this.toaster = toaster;
    this.project = null;
    this.active = 0;
    this.version = 0;
    this.listeners = new Set();
    this.dirty = false;
    this.loading = false;
    this.saving = false;
    this.backend = null; // the whole database (the owner's private part lives at its root)
    this.pbe = null;     // where the open project lives (the root, or an encrypted shared place)
    this.isOwner = true;
    this.keyring = [];   // guests: projects joined with a code
    this.saves = [];
    this.lastSavedAt = null;
    this.status = { kind: 'loading', text: t('Loading…') };
    this.presenting = null;
    this.ctx = makeRenderCtx(() => this.bumpRender());
    this.renderTick = 0;
    this.ui = {}; // which small dialogs are open (templates…)
    this._raf = 0;
    this._draftTimer = 0;
    store.on('change', (json) => this.onStoreChange(json));
    // Tell collaborators what is selected here.
    reaction(() => (store.selectedElementsIds || []).join(','), () => this.pushPresence());
  }

  // ---- subscription -------------------------------------------------------
  subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getVersion = () => this.version;
  emit() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.version++; this.pushPresence(); this.listeners.forEach((f) => f()); });
  }
  emitNow() { cancelAnimationFrame(this._raf); this._raf = 0; this.version++; this.pushPresence(); this.listeners.forEach((f) => f()); }
  bumpRender() { this.renderTick++; this.emit(); }
  setUi(patch) { this.ui = { ...this.ui, ...patch }; this.emitNow(); }
  toast(message, intent = 'none', extra = {}) { if (this.toaster && !this.isPresenting) this.toaster.show({ message, intent, timeout: 3500, ...extra }); }

  // ---- startup ------------------------------------------------------------
  async init() {
    this.pendingCode = takeHashCode();
    const db = await getCapability('db');
    this.backend = db ? new DbBackend(db) : new IdbBackend();
    this.pbe = this.backend;
    this.tab = newId();
    this.liveMode = !!(this.backend.watchCollection && this.backend.kind === 'cloud' && this.backend.supportsLive);
    this.canShare = this.liveMode && cryptoReady();
    const user = db ? await getCapability('user') : null;
    if (user) {
      try { if (typeof user.isOwner === 'function') this.isOwner = (await user.isOwner()) !== false; } catch (e) { this.isOwner = true; }
      try { this.me = await user.me(); } catch (e) { this.me = null; }
    }
    if (!this.liveMode) this.isOwner = true; // no sharing without live editing
    this.initLive();
    this.projects = [];
    if (!this.isOwner) return this.initGuest();
    let openId = null;
    try {
      const idx = await loadIndex(this.backend);
      this.projects = idx.list;
      openId = idx.last && idx.list.some((x) => x.id === idx.last) ? idx.last
        : (idx.list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || {}).id || null;
    } catch (e) {
      this.toast(t('Could not reach saved data: ') + (e.message || e), 'danger', { timeout: 9000 });
    }
    if (this.liveMode) this.publishSpaceInfo();
    if (this.pendingCode) {
      const code = this.pendingCode;
      this.pendingCode = null;
      const r = await this.joinWithCode(code);
      if (r.ok && this.project) return this.finishInit();
    }
    if (openId) {
      await this.openProject(openId, { silent: true });
    } else if (this.liveMode) {
      await this.createProject(demoProject(), { open: true, id: 'main' });
    } else {
      this.startNewProject(demoProject());
    }
    return this.finishInit();
  }

  finishInit() {
    // Keep the project list live (another person may add or rename projects).
    if (this.backend.watch && !this._watchingIndex) {
      this._watchingIndex = true;
      this.backend.watch('meta/projects', (doc) => {
        if (doc && Array.isArray(doc.list)) { this.projects = doc.list; this.emit(); }
      });
    }
    return true;
  }

  // ---- the space: owner, guests, sharing ------------------------------------------
  /** Where a project's data lives: { be, base }. */
  scopeFor(entry) {
    if (entry && entry.shared) return { be: new ScopedBackend(this.backend, `sh/${entry.shared.sid}/`, entry.shared.key), base: '' };
    return { be: this.backend, base: entry ? entry.base : '' };
  }
  privateBases() { return (this.projects || []).filter((x) => !x.shared).map((x) => x.base); }

  /** Lets guests show whose space this is. */
  async publishSpaceInfo() {
    if (!this.isOwner || !this.me || !this.me.id) return;
    try {
      const cur = await this.backend.get('pub/space');
      if (!cur || cur.owner !== this.me.id) await this.backend.set('pub/space', { owner: this.me.id, at: Date.now() });
    } catch (e) { /* optional */ }
  }

  async loadSpaceInfo() {
    try {
      const info = await this.backend.get('pub/space');
      this.spaceOwnerId = info && info.owner;
      this.spaceUnclaimed = !this.spaceOwnerId;
      if (this.spaceOwnerId) {
        const user = this.user || await getCapability('user');
        const prof = user ? await user.profiles([this.spaceOwnerId]) : null;
        if (prof) this.profiles = { ...(this.profiles || {}), ...prof };
      }
    } catch (e) { /* optional */ }
    this.emit();
  }

  /** "Your space" / "Ana's space". */
  spaceName() {
    if (this.isOwner) return t('Your space');
    if (this.spaceUnclaimed && TARGET === 'web') return t('Welcome to Morph');
    const k = this.keyring && (this.keyring.find((x) => x.pid === this.projectId) || this.keyring.find((x) => x.ownerName));
    const p = this.spaceOwnerId && this.profiles && this.profiles[this.spaceOwnerId];
    const n = (k && k.ownerName) || (p && p.name);
    return n ? `${n.split(' ')[0]}’s space` : 'Shared with you';
  }

  // guests ------------------------------------------------------------------
  keyringPath() { return this.me && this.me.id ? `data/users/${this.me.id}/keys` : null; }

  async loadKeyring() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('morph-keys') || '[]') || []; } catch (e) { list = []; }
    const path = this.keyringPath();
    if (path) {
      try {
        const doc = await this.backend.get(path);
        if (doc && Array.isArray(doc.list)) {
          const byPid = new Map(list.map((k) => [k.pid, k]));
          for (const k of doc.list) { const mine = byPid.get(k.pid); if (!mine || (k.at || 0) >= (mine.at || 0)) byPid.set(k.pid, k); }
          list = [...byPid.values()];
        }
      } catch (e) { /* keep the local copy */ }
    }
    this.keyring = list.filter((k) => k && k.pid && k.sid && k.key);
    this.projects = this.keyring.map((k) => this.keyToEntry(k));
  }

  keyToEntry(k) {
    return { id: k.pid, title: k.title || t('Untitled presentation'), shared: { sid: k.sid, key: k.key }, base: '', guest: true,
      updatedAt: k.updatedAt || k.at, slides: k.slides, w: k.w, h: k.h, cover: k.cover };
  }

  async saveKeyring() {
    const list = this.keyring.map((k) => ({ ...k }));
    try { localStorage.setItem('morph-keys', JSON.stringify(list)); } catch (e) { /* ignore */ }
    const path = this.keyringPath();
    // Covers can be large: keep the private copy small.
    if (path) { try { await this.backend.set(path, { list: list.map(({ cover, ...k }) => k) }); } catch (e) { /* local copy only */ } }
    this.projects = this.keyring.map((k) => this.keyToEntry(k));
    this.emit();
  }

  async initGuest() {
    await this.loadKeyring();
    this.loadSpaceInfo();
    if (this.pendingCode) {
      const code = this.pendingCode;
      this.pendingCode = null;
      const r = await this.joinWithCode(code);
      if (r.ok) return true;
      this.joinError = r.error;
    }
    let last = null;
    try { last = localStorage.getItem('morph-last'); } catch (e) { /* ignore */ }
    const order = this.keyring.slice().sort((a, b) => (b.pid === last) - (a.pid === last) || (b.at || 0) - (a.at || 0));
    for (const k of order) {
      if (await this.openProject(k.pid, { silent: true, quiet: true })) return true;
    }
    this.project = null;
    this.status = { kind: 'ok', text: '' };
    this.emitNow();
    return true;
  }

  /** Open a project with the code someone gave you. */
  async joinWithCode(input) {
    const code = normalizeCode(input);
    if (!code) return { error: t('Codes look like ABCD-EFGH-JKLM.') };
    let inv = null;
    try {
      const doc = await this.backend.get(`inv/${await codeId(code)}`);
      inv = doc ? await openInvite(code, doc) : null;
    } catch (e) { inv = null; }
    if (!inv || !inv.pid) return { error: t('This code doesn’t work. Check it, or ask for a new one.') };
    if (this.isOwner) { // your own code
      if (this.projects.some((x) => x.id === inv.pid)) await this.openProject(inv.pid);
      return { ok: true };
    }
    const prev = this.keyring.find((k) => k.pid === inv.pid);
    const k = { ...(prev || {}), pid: inv.pid, sid: inv.sid, key: inv.key, code, title: inv.title || (prev && prev.title), as: inv.name || '', ownerName: inv.owner || (prev && prev.ownerName) || '', at: Date.now() };
    this.keyring = [k, ...this.keyring.filter((x) => x.pid !== inv.pid)];
    await this.saveKeyring();
    if (inv.name && !(this.me && this.me.name)) { this.setNick(inv.name); this.needsName = false; }
    this.markJoined(k);
    const ok = await this.openProject(inv.pid);
    return ok ? { ok: true } : { error: t('This project could not be opened.') };
  }

  /** Tell the owner this code was used (shown as "Joined" in Share). */
  async markJoined(k) {
    try {
      const be = new ScopedBackend(this.backend, `sh/${k.sid}/`, k.key);
      await be.set(`m/${await codeId(k.code)}`, { uid: (this.me && this.me.id) || null, nick: this.myName() || k.as || '', at: Date.now() });
    } catch (e) { /* optional */ }
  }

  /** After the owner moved a project to a new key: ask the invite again. Returns false if access was removed. */
  async refreshKey(pid) {
    const k = this.keyring.find((x) => x.pid === pid);
    if (!k || !k.code) return false;
    try {
      const doc = await this.backend.get(`inv/${await codeId(k.code)}`);
      const inv = doc ? await openInvite(k.code, doc) : null;
      if (!inv || inv.pid !== pid) return false;
      if (inv.sid === k.sid) return true;
      Object.assign(k, { sid: inv.sid, key: inv.key, at: Date.now() });
      await this.saveKeyring();
      this.markJoined(k);
      return true;
    } catch (e) { return false; }
  }

  async leaveProject(pid) {
    const k = this.keyring.find((x) => x.pid === pid);
    this.keyring = this.keyring.filter((x) => x.pid !== pid);
    await this.saveKeyring();
    if (k) { try { const be = new ScopedBackend(this.backend, `sh/${k.sid}/`, k.key); await be.del(`m/${await codeId(k.code)}`); } catch (e) { /* ignore */ } }
    if (pid === this.projectId) await this.openAnother();
    this.emitNow();
  }

  /** Open the most recent other project, or show the "enter a code" screen (guests) / a new project. */
  async openAnother() {
    await this.closeLive();
    const next = (this.projects || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (next && await this.openProject(next.id, { silent: true, quiet: true })) return;
    if (!this.isOwner) { this.project = null; this.projectId = null; this.store.clear && this.store.clear(); this.emitNow(); return; }
    if (this.liveMode) await this.createProject(demoProject(), { open: true });
    else this.startNewProject(demoProject());
  }

  /** The open project moved to a new key, or access was removed. */
  async onProjectMoved() {
    if (this._moving) return;
    this._moving = true;
    const id = this.projectId;
    const title = this.project && this.project.title;
    try {
      await this.closeLive();
      if (this.isOwner) {
        try { const idx = await loadIndex(this.backend); this.projects = idx.list; } catch (e) { /* keep */ }
        await sleep(600);
        await this.openProject(id, { silent: true });
        return;
      }
      if (await this.refreshKey(id)) { await sleep(600); if (await this.openProject(id, { silent: true, quiet: true })) return; }
      this.keyring = this.keyring.filter((x) => x.pid !== id);
      await this.saveKeyring();
      this.toast(t('You no longer have access to “{title}”.', { title: title || t('this project') }), 'warning', { timeout: 8000 });
      await this.openAnother();
    } finally {
      this._moving = false;
    }
  }

  // owner: sharing -----------------------------------------------------------
  async shareInfo(id) {
    const entry = this.projects.find((x) => x.id === id);
    if (!entry) return null;
    let doc = null;
    try { doc = await this.backend.get(`shares/${id}`); } catch (e) { doc = null; }
    const invites = (doc && doc.invites) || [];
    const joined = {};
    if (entry.shared) {
      try { for (const d of await this.scopeFor(entry).be.list('m')) joined[d.id] = d.data; } catch (e) { /* ignore */ }
    }
    return { shared: !!entry.shared, invites: invites.map((x) => ({ ...x, joined: joined[x.id] || null })) };
  }

  async _writeInvite(entry, inv) {
    const ownerName = String((this.me && this.me.name) || this.myName() || '').split(' ')[0];
    const { id, doc } = await sealInvite(inv.code, { pid: entry.id, sid: entry.shared.sid, key: entry.shared.key, title: entry.title || '', name: inv.name || '', owner: ownerName });
    await this.backend.set(`inv/${id}`, doc);
    return id;
  }

  /** Move a private project to an encrypted shared place (once), then add a code. */
  async createInvite(id, name = '') {
    let entry = this.projects.find((x) => x.id === id);
    if (!entry) throw new Error('Unknown project');
    if (!entry.shared) entry = await this._moveProject(entry, 'share');
    const code = newCode();
    const inv = { code, name: String(name || '').trim().slice(0, 40), at: Date.now() };
    inv.id = await this._writeInvite(entry, inv);
    const doc = (await this.backend.get(`shares/${id}`)) || { invites: [] };
    doc.invites = [...(doc.invites || []).filter((x) => x.id !== inv.id), inv];
    await this.backend.set(`shares/${id}`, doc);
    this.emitNow();
    return inv;
  }

  /** Remove one code. If it was used, the project gets a new key so that person is really out. */
  async removeInvite(id, inviteId) {
    const entry = this.projects.find((x) => x.id === id);
    const doc = (await this.backend.get(`shares/${id}`)) || { invites: [] };
    const inv = (doc.invites || []).find((x) => x.id === inviteId);
    await this.backend.del(`inv/${inviteId}`);
    doc.invites = (doc.invites || []).filter((x) => x.id !== inviteId);
    await this.backend.set(`shares/${id}`, doc);
    let used = false;
    if (entry && entry.shared) {
      try { used = !!(await this.scopeFor(entry).be.get(`m/${inviteId}`)); } catch (e) { used = true; }
    }
    if (used && entry) {
      if (doc.invites.length) await this._moveProject(entry, 'rekey');
      else await this._moveProject(entry, 'private');
    }
    this.emitNow();
    return { rekeyed: used, name: inv && inv.name };
  }

  /** Make a shared project private again: every code stops working and everyone loses access. */
  async stopSharing(id) {
    const entry = this.projects.find((x) => x.id === id);
    if (!entry || !entry.shared) return;
    const doc = (await this.backend.get(`shares/${id}`)) || { invites: [] };
    for (const x of doc.invites || []) await this.backend.del(`inv/${x.id}`);
    await this.backend.del(`shares/${id}`);
    await this._moveProject(entry, 'private');
    this.emitNow();
  }

  /**
   * Copy a project's data to a new place and switch to it:
   *   share   private → new encrypted place
   *   rekey   encrypted → new encrypted place (new key)
   *   private encrypted → private
   * The old place gets a "moved" marker (open screens follow it), then is emptied.
   */
  async _moveProject(entry, mode) {
    const from = this.scopeFor(entry);
    const isCurrent = entry.id === this.projectId;
    if (isCurrent && this.live) await this.live.flushAll();
    let to, shared = null, base = '';
    if (mode === 'private') {
      base = baseFor(entry.id);
      to = { be: this.backend, base };
    } else {
      shared = { sid: randomId(16), key: await newKey() };
      to = { be: new ScopedBackend(this.backend, `sh/${shared.sid}/`, shared.key), base: '' };
      // Opens the place (the database rules only accept writes inside places the owner opened).
      await this.backend.set(`sh/${shared.sid}`, { at: Date.now() });
    }
    this.busy = mode === 'share' ? t('Sharing…') : mode === 'rekey' ? t('Changing the key…') : t('Making it private…');
    this.emitNow();
    try {
      await copyProjectData(from.be, from.base, to.be, to.base);
      // Check the copy opens before touching the original.
      const probe = new LiveSync({ backend: to.be, base: to.base, tab: this.tab, host: this.liveHost() });
      const loaded = await probe.load();
      probe.close();
      if (!loaded) throw new Error('The copy could not be read back');
      const d = await updateIndex(this.backend, (doc) => {
        const e = doc.list.find((x) => x.id === entry.id);
        if (e) { if (shared) { e.shared = shared; } else { delete e.shared; e.base = base; } }
        return doc;
      });
      this.projects = d.list;
      const next = this.projects.find((x) => x.id === entry.id);
      if (mode === 'rekey') { // codes still in use follow the new key
        const sdoc = (await this.backend.get(`shares/${entry.id}`)) || { invites: [] };
        for (const inv of sdoc.invites || []) await this._writeInvite(next, inv);
      }
      // Tell open screens, reopen here, then empty the old place.
      if (entry.shared) { try { await from.be.setPlain('live/moved', { moved: true, at: Date.now() }); } catch (e) { /* ignore */ } }
      if (isCurrent) { await this.closeLive(); await this.openProject(entry.id, { silent: true }); }
      const old = from;
      setTimeout(async () => {
        try {
          if (entry.shared) await purgeScope(old.be, { keepMoved: true });
          else { await purgeProject(old.be, old.base); await gcAssets(this.backend, this.privateBases()); }
        } catch (e) { /* best effort */ }
      }, 5000);
      return next;
    } finally {
      this.busy = null;
      this.emitNow();
    }
  }

  // ---- presence: who else has this open --------------------------------------
  async initLive() {
    const [room, user] = await Promise.all([getCapability('room'), getCapability('user')]);
    this.user = user;
    this.peers = [];
    this.profiles = this.profiles || {};
    try { this.nick = localStorage.getItem('morph-nick') || ''; } catch (e) { this.nick = ''; }
    if (user) {
      try { this.me = await user.me(); } catch (e) { this.me = null; }
      try { this.canWrite = await user.can('data.write'); } catch (e) { this.canWrite = null; }
      if (this.canWrite === false && this.live) { this.live.readOnly = true; this.live.refreshStatus(); }
    }
    if (!room) return; // nobody else can see you: no need for a name
    if (!(this.me && this.me.name) && !this.nick) { this.needsName = true; this.emitNow(); }
    this.room = room;
    const seen = new Set();
    room.onPeers((ch) => {
      this.peers = ch.peers;
      if (this.onPeersChange) this.onPeersChange(ch);
      for (const p of ch.joined) {
        if (p.sameTab || seen.has(p.peer)) continue;
        seen.add(p.peer);
      }
      this.resolveProfiles();
      this.emit();
    }, () => {});
    this._lastPresence = null;
    this.pushPresence();
  }

  pushPresence() {
    if (!this.room || !this.project) return;
    const slide = this.project.slides[this.active];
    const sel = (this.store.selectedElementsIds || []).slice(0, 40);
    // The practice presentation is private to this screen: no room, so nobody sees anybody there.
    const p = { project: this.tutorial ? null : this.projectId || null, slide: slide ? slide.id : null, dirty: !!this.dirty, uid: (this.me && this.me.id) || null, sel, nick: this.myName() || null };
    const key = JSON.stringify(p);
    if (key === this._lastPresence) return;
    this._lastPresence = key;
    this.room.presence(p).catch(() => {});
  }

  async resolveProfiles() {
    if (!this.user) return;
    const ids = Array.from(new Set((this.peers || []).map((p) => p.by || (p.presence && p.presence.uid)).filter(Boolean)));
    if (!ids.length) return;
    try { this.profiles = { ...this.profiles, ...(await this.user.profiles(ids)) }; this.emit(); } catch (e) { /* ignore */ }
  }

  /** People (other tabs included) with a given project open, excluding this tab. */
  othersIn(projectId) {
    return (this.peers || []).filter((p) => !p.sameTab && p.kind === 'viewer' && p.presence && p.presence.project === projectId);
  }

  myName() { return (this.me && this.me.name) || this.nick || ''; }

  setNick(name) {
    const n = String(name || '').trim().slice(0, 40);
    if (!n) return;
    this.nick = n;
    this.needsName = false;
    try { localStorage.setItem('morph-nick', n); } catch (e) { /* ignore */ }
    if (this.user && this.user.setName) this.user.setName(n);
    this.pushPresence();
    this.emitNow();
  }

  /** A person to display: a room peer, a user id, or a {uid, nick} author record. */
  personOf(x) {
    let id = null, nick = '', isMe = false;
    if (typeof x === 'string') { id = x; isMe = !!(this.me && this.me.id === x); }
    else if (x && 'peer' in x) { id = x.by || (x.presence && x.presence.uid) || null; nick = (x.presence && x.presence.nick) || ''; isMe = x.isMe; }
    else if (x) { id = x.uid || null; nick = x.nick || ''; isMe = !!(this.me && id && this.me.id === id); }
    const prof = id && this.profiles ? this.profiles[id] : null;
    const base = (prof && prof.name) || nick || '';
    const name = isMe && x && 'peer' in x ? t('You (another tab)') : isMe ? t('You') : base || t('Someone');
    let color = prof && prof.color;
    if (!color) { let h = 0; const k = id || nick || 'x'; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; color = ['#d1336b', '#2a9d8f', '#e07a1f', '#6f43c0', '#0b8043', '#c2185b', '#1565c0', '#8d6e00'][h % 8]; }
    return { id, name, avatar: prof && prof.avatarUrl, color, isMe };
  }

  // ---- newer saves made elsewhere ------------------------------------------------
  watchHead() {
    if (this._unwatchHead) { this._unwatchHead(); this._unwatchHead = null; }
    this.newerSave = null;
    if (!this.backend.watch || this.liveMode || this.tutorial) return;
    const id = this.projectId, base = this.projectBase;
    this._unwatchHead = this.backend.watch(`${base}meta/head`, (head) => {
      if (id !== this.projectId) return;
      const top = head && head.saves && head.saves[0];
      if (!top || top.tab === this.tab || (this.lastSavedAt && top.savedAt <= this.lastSavedAt)) return;
      if (this.newerSave && this.newerSave.savedAt >= top.savedAt) return;
      this.newerSave = top;
      this.resolveIds([top.by]);
      this.toast(t('{name} saved a newer version of this project.', { name: this.whoSaved(top) }), 'warning', {
        timeout: 12000, action: { text: t('Open it'), onClick: () => { this.wantNewer = true; this.emitNow(); } },
      });
      this.emitNow();
    });
  }

  async resolveIds(ids) {
    const list = (ids || []).filter(Boolean);
    if (!this.user || !list.length) return;
    try { this.profiles = { ...this.profiles, ...(await this.user.profiles(list)) }; this.emit(); } catch (e) { /* ignore */ }
  }

  whoSaved(entry) {
    if (!entry || !entry.by) return t('Someone');
    if (this.me && this.me.id === entry.by) return t('You (in another tab)');
    const p = this.profiles && this.profiles[entry.by];
    return (p && p.name) || t('Someone');
  }

  async openNewer() {
    this.wantNewer = false;
    this.newerSave = null;
    await this.openProject(this.projectId);
  }

  statusFromSave() {
    if (this.tutorial) return { kind: 'ok', text: t('Practice: nothing is saved') };
    if (this.live) return { kind: 'ok', text: this.lastSavedAt ? t('Last version {when}', { when: fmtWhen(this.lastSavedAt) }) : t('No version yet') };
    if (this.backend.kind === 'cloud') return { kind: 'ok', text: this.lastSavedAt ? t('Saved {when}', { when: fmtWhen(this.lastSavedAt) }) : t('Not saved yet') };
    return { kind: 'warn', text: this.lastSavedAt ? t('Saved in this browser {when}', { when: fmtWhen(this.lastSavedAt) }) : t('Saving in this browser only') };
  }

  /** Open a project from the project list (loads its newest valid save). */
  async openProject(id, opts = {}) {
    this.tutorial = null;
    if (this.liveMode) return this.openProjectLive(id, opts);
    const { silent = false } = opts;
    const entry = (this.projects || []).find((x) => x.id === id);
    const base = entry ? entry.base : baseFor(id);
    this.busy = 'Opening…';
    this.emitNow();
    let project = null;
    let res = null;
    try {
      res = await loadLatest(this.backend, base);
      project = res.project;
    } catch (e) {
      this.toast(t('Could not open this project: ') + (e.message || e), 'danger', { timeout: 9000 });
    }
    this.busy = null;
    if (!project) {
      if (res && res.errors.length) this.toast(t('This project’s saved copies could not be read.'), 'danger', { timeout: 9000 });
      if (!silent) { this.emitNow(); return false; }
      project = demoProject();
    }
    if (entry && entry.title) project.title = entry.title;
    this.projectId = id;
    this.projectBase = base;
    this.pbe = this.backend;
    this.saves = res ? res.saves : [];
    this.lastSavedAt = res && res.entry ? res.entry.savedAt : null;
    this.pendingDraft = null;
    this.setProject(project, 0);
    this.dirty = false;
    this.status = this.statusFromSave();
    this.watchHead();
    if (res && res.fellBack) this.toast(t('The latest save could not be read, so the backup from {when} was opened instead.', { when: fmtTime(res.entry.savedAt) }), 'warning', { timeout: 9000 });
    this.emitNow();
    const needCover = entry && !entry.cover;
    const cover = needCover ? coverOf(project) : null;
    updateIndex(this.backend, (d) => {
      d.last = id;
      if (needCover) { const e = d.list.find((x) => x.id === id); if (e) Object.assign(e, { cover, w: project.width, h: project.height }); }
      return d;
    }).then((d) => { if (needCover) { this.projects = d.list; this.emit(); } }).catch(() => {});
    // Offer to restore unsaved work from a crash/reload.
    const draft = await loadDraft(id);
    if (this.projectId === id && draft && draft.dirty && draft.project && (!this.lastSavedAt || draft.at > this.lastSavedAt)) {
      this.pendingDraft = draft;
      this.emitNow();
    } else if (draft && !draft.dirty) {
      clearDraft(id);
    }
    return true;
  }

  // ---- live editing --------------------------------------------------------------
  async closeLive() {
    if (!this.live) return;
    const live = this.live;
    try { await live.flushAll(); } catch (e) { /* keep going */ }
    live.close();
    if (this.live === live) this.live = null;
  }

  liveHost() {
    return {
      getSlide: (sid) => {
        const sl = this.project && this.project.slides.find((x) => x.id === sid);
        return sl ? { page: sl.page, anim: sl.anim || {} } : null;
      },
      getMeta: () => this.project && ({
        order: this.project.slides.map((x) => x.id), title: this.project.title, width: this.project.width,
        height: this.project.height, fonts: this.project.fonts || [], objects: this.project.objects || {},
        settings: this.project.settings || {}, notes: this.project.notes || {}, owners: this.project.owners || {},
      }),
      applySlide: (sid, state, info) => this.applyLiveSlide(sid, state, info),
      applyMeta: (meta, getBase, info) => this.applyLiveMeta(meta, getBase, info),
      onStatus: (st) => { this.liveStatus = st; if (st === 'synced') this.scheduleDraftClear(); this.emit(); },
      onError: (e, docKey) => this.liveError(e, docKey),
      canWrite: () => this.canWrite,
      who: () => this.me_(),
      onMoved: () => this.onProjectMoved(),
    };
  }

  liveError(e, docKey) {
    const now = Date.now();
    if (this._lastLiveErr && now - this._lastLiveErr < 8000) return;
    this._lastLiveErr = now;
    const msg = (e && e.message) || String(e);
    if (e && e.code === 'invalid_argument' && docKey && docKey.startsWith('s-')) {
      this.toast(this.canWrite === false ? t('You can view this project but not change it.') : t('A slide could not be shared (it may be too large): {why}', { why: msg }), 'warning', { timeout: 8000 });
    } else if (e && (e.code === 'not_granted' || e.code === 'revoked')) {
      this.toast(t('You can view this project but not change it.'), 'warning', { timeout: 8000 });
    } else {
      this.toast(t('Connection problem — your changes are kept and will be sent again. (') + msg + ')', 'warning', { timeout: 6000 });
    }
  }

  async openProjectLive(id, { silent = false, quiet = false } = {}) {
    this.tutorial = null;
    const entry = (this.projects || []).find((x) => x.id === id);
    if (!entry && !this.isOwner) return false;
    const { be, base } = this.scopeFor(entry || { base: baseFor(id) });
    this.busy = 'Opening…';
    this.emitNow();
    await this.closeLive();
    const live = new LiveSync({ backend: be, base, tab: this.tab, host: this.liveHost() });
    let loaded = null;
    let res = null;
    let seededFromSaveAt = null;
    try {
      loaded = await live.load();
      if (!loaded && entry && entry.shared) {
        // A shared project is never created here: it moved (new key) or was removed.
        this.busy = null;
        const moved = await be.get('live/moved');
        if (moved && !this.isOwner && await this.refreshKey(id)) return this.openProjectLive(id, { silent, quiet });
        if (!quiet) this.toast(this.isOwner ? t('This project could not be opened.') : t('This project is no longer shared with you.'), 'warning', { timeout: 8000 });
        this.emitNow();
        return false;
      }
      if (!loaded) {
        // First time this project is opened with live editing: start from its newest save.
        res = await loadLatest(be, base);
        let seedFrom = res.project;
        if (!seedFrom) {
          if (res.errors.length) this.toast(t('This project’s saved copies could not be read.'), 'danger', { timeout: 9000 });
          if (!silent) { this.busy = null; this.emitNow(); return false; }
          seedFrom = demoProject();
        }
        if (entry && entry.title) seedFrom.title = entry.title;
        this.normalizeProject(seedFrom);
        seededFromSaveAt = res.entry ? res.entry.savedAt : 0;
        await live.seed(seedFrom);
        loaded = await live.load();
      }
    } catch (e) {
      this.busy = null;
      this.toast(t('Could not open this project: ') + (e.message || e), 'danger', { timeout: 9000 });
      this.emitNow();
      return false;
    }
    this.busy = null;
    if (!loaded) { this.emitNow(); return false; }
    const project = loaded.project;
    this.projectId = id;
    this.projectBase = base;
    this.pbe = be;
    this.projectShared = !!(entry && entry.shared);
    this.live = live;
    this.liveStatus = 'synced';
    this.liveAt = loaded.at;
    this.pendingDraft = null;
    this.newerSave = null;
    this.setProject(project, 0);
    this.dirty = false;
    try { this.saves = await listSaves(be, base); } catch (e) { this.saves = []; }
    this.lastSavedAt = this.saves[0] ? this.saves[0].savedAt : null;
    this.status = this.statusFromSave();
    live.start();
    live.metaChanged(); // names given while opening, if any
    this.editsSinceVersion = false;
    this.authors = new Map();
    this.watchVersions();
    this.startVersionTimer();
    if (this.canWrite === false) { live.readOnly = true; live.refreshStatus(); }
    this.emitNow();
    this.people = null;
    this.refreshPeople();
    if (this.isOwner) updateIndex(this.backend, (d) => { d.last = id; return d; }).catch(() => {});
    else {
      try { localStorage.setItem('morph-last', id); } catch (e) { /* ignore */ }
      const k = this.keyring.find((x) => x.pid === id);
      if (k) { Object.assign(k, { title: project.title, slides: project.slides.length, w: project.width, h: project.height, cover: coverOf(project) }); this.saveKeyring(); }
    }
    // Unsaved work from an older version of the app or from a connection loss.
    const draft = await loadDraft(id);
    // Only when the shared copy was just created from an older save (first open after an update):
    // unsaved work from the previous app version is offered back once. Otherwise everything is saved live.
    if (this.projectId === id && seededFromSaveAt != null && draft && draft.dirty && draft.project && draft.at > seededFromSaveAt) {
      this.pendingDraft = draft;
      this.emitNow();
    } else if (draft) {
      clearDraft(id);
    }
    return true;
  }

  /** Create a project (saved version + shared working copy) and optionally open it. */
  async createProject(project, { open = true, id = null } = {}) {
    const pid = id || newId();
    const base = baseFor(pid);
    this.normalizeProject(project);
    pruneRegistry(project);
    ensureNames(project);
    const live = new LiveSync({ backend: this.backend, base, tab: this.tab, host: this.liveHost() });
    await live.seed(project);
    await this._saveAs(pid, base, deepClone(project), null, { auto: true, reason: 'created', authors: [this.me_()] }, this.backend);
    live.close();
    if (open) await this.openProjectLive(pid);
    return pid;
  }

  normalizeProject(project) {
    project.version = project.version || 1;
    project.title = project.title || t('Untitled presentation');
    project.objects = project.objects || {};
    project.width = project.width || 1920;
    project.height = project.height || 1080;
    if (!project.slides || !project.slides.length) project.slides = [{ id: null, page: blankPage(), anim: {} }];
    for (const sl of project.slides) { sl.anim = sl.anim || {}; sl.id = sl.page.id; }
    return project;
  }

  activeSlideId() { const sl = this.project && this.project.slides[this.active]; return sl ? sl.id : null; }

  /** A newer version of one slide arrived (or our own write settled). */
  applyLiveSlide(sid, state, info = {}) {
    if (info.who && !info.own) { this.noteAuthor(info.who); this.editsSinceVersion = true; }
    const sl = this.project && this.project.slides.find((x) => x.id === sid);
    if (!sl) return;
    sl.page = state.page;
    sl.anim = state.anim || {};
    sl.id = state.page.id;
    if (sid === this.activeSlideId()) this.applyToStore(sl.page);
    if (!info.own) ensureFonts(this.project);
    this.emit();
  }

  /** The list of slides / title / names changed elsewhere. */
  applyLiveMeta(meta, getBase, info = {}) {
    const p = this.project;
    if (!p) return;
    const activeSid = this.activeSlideId();
    const oldIndex = this.active;
    const byId = new Map(p.slides.map((x) => [x.id, x]));
    let slides = meta.order.map((sid) => {
      if (byId.has(sid)) return byId.get(sid);
      const b = getBase(sid);
      return b ? { id: sid, page: fastClone(b.page), anim: fastClone(b.anim || {}) } : null;
    }).filter(Boolean);
    const removedActive = activeSid && !slides.some((x) => x.id === activeSid) ? byId.get(activeSid) : null;
    if (!slides.length) {
      // Everyone deleted different slides at the same time: keep one so the deck is never empty.
      slides = [removedActive || { id: null, page: blankPage(), anim: {} }];
      slides[0].id = slides[0].page.id;
      if (this.live) { this.live.slideChanged(slides[0].id); this.live.metaChanged(); }
    }
    const titleChanged = p.title !== meta.title;
    p.slides = slides;
    p.title = meta.title;
    p.fonts = meta.fonts || [];
    p.objects = meta.objects || {};
    p.settings = meta.settings || {};
    p.notes = meta.notes || {};
    p.owners = meta.owners || {};
    if (normalizeRegistry(p) && this.live) this.live.metaChanged();
    if (meta.width !== p.width || meta.height !== p.height) {
      p.width = meta.width; p.height = meta.height;
      this.applyingRemote = true;
      try { this.store.history.ignore(() => this.store.setSize(meta.width, meta.height)); } finally { this.applyingRemote = false; }
    }
    ensureFonts(p);
    const idx = p.slides.findIndex((x) => x.id === activeSid);
    if (idx >= 0) {
      this.active = idx;
      this.syncStoreNames();
    } else {
      this.active = Math.max(0, Math.min(oldIndex, p.slides.length - 1));
      this.loadSlide(this.active);
      if (removedActive && !info.own) {
        this.toast(t('The slide you were on was deleted by someone else.'), 'warning', {
          timeout: 8000,
          action: { text: t('Bring it back'), onClick: () => {
            this.project.slides.splice(Math.min(oldIndex, this.project.slides.length), 0, removedActive);
            this.active = this.project.slides.indexOf(removedActive);
            this.loadSlide(this.active);
            if (this.live) { this.live.slideChanged(removedActive.id); this.live.metaChanged(); }
            this.markDirty();
            this.emitNow();
          } },
        });
      }
    }
    if (titleChanged) this.scheduleIndexUpdate();
    this.emitNow();
  }

  /** Bring the open slide in the editor to `page` without disturbing what the person is doing. */
  applyToStore(page) {
    const store = this.store;
    const sp = store.pages && store.pages[0];
    if (!sp || sp.id !== page.id) return;
    const before = store.toJSON().pages[0];
    const target = this.pageForEditor(page);
    // Keep this screen's own state (text being edited, crop mode...) on the elements.
    const keep = new Map();
    const walkB = (ch) => { for (const el of ch || []) { const o = {}; for (const k of Object.keys(el)) if (k[0] === '_') o[k] = el[k]; keep.set(el.id, o); if (el.children) walkB(el.children); } };
    walkB(before.children);
    const walkT = (ch) => { for (const el of ch || []) { const o = keep.get(el.id); if (o) Object.assign(el, o); if (el.children) walkT(el.children); } };
    walkT(target.children);
    const delta = diffPage(before, target);
    if (pageOpsEmpty(delta)) return;
    this.applyingRemote = true;
    try {
      store.history.ignore(() => {
        applySnapshot(sp, target);
        this.patchHistory(page.id, delta);
      });
    } catch (e) {
      try { store.history.clear(); } catch (e2) { /* ignore */ }
    } finally {
      this.applyingRemote = false;
    }
  }

  /** Apply someone else's change to every undo step too, so Undo only ever undoes your own edits. */
  patchHistory(pageId, delta) {
    const h = this.store.history;
    const snap = getSnapshot(h);
    const list = snap.history || [];
    const start = Math.max(0, list.length - 60);
    const patched = list.slice(start).map((state) => {
      if (!state || !state.pages || !state.pages[0] || state.pages[0].id !== pageId) return state;
      return { ...state, pages: [applyPageOps(state.pages[0], delta), ...state.pages.slice(1)] };
    });
    applySnapshot(h, { ...snap, history: patched, undoIdx: Math.max(-1, snap.undoIdx - start) });
  }

  syncStoreNames() {
    const fixes = [];
    const walk = (ch) => { for (const el of ch || []) { if (el.type === 'group') { walk(el.children); continue; } const n = nameOf(this.project, el.id); if (el.name !== n) fixes.push([el.id, n]); } };
    const page = this.store.pages[0];
    if (!page) return;
    walk(this.store.toJSON().pages[0].children);
    if (!fixes.length) return;
    this.applyingRemote = true;
    try {
      this.store.history.ignore(() => { for (const [id, name] of fixes) { const e = this.store.getElementById(id); if (e) e.set({ name }); } });
    } finally { this.applyingRemote = false; }
  }

  liveTouch(sids = [], meta = true) {
    if (!this.live) return;
    for (const sid of sids) this.live.slideChanged(sid);
    if (meta) this.live.metaChanged();
  }

  scheduleIndexUpdate() {
    if (!this.liveMode) return;
    clearTimeout(this._idxTimer);
    const id = this.projectId, base = this.projectBase;
    this._idxTimer = setTimeout(async () => {
      if (id !== this.projectId || !this.project) return;
      const p = this.project;
      try {
        if (!this.isOwner) {
          const k = this.keyring.find((x) => x.pid === id);
          if (k) { Object.assign(k, { title: p.title, updatedAt: Date.now(), slides: p.slides.length, w: p.width, h: p.height, cover: coverOf(p) }); await this.saveKeyring(); }
          return;
        }
        const d = await updateIndex(this.backend, (doc) => {
          const e = doc.list.find((x) => x.id === id);
          if (e) Object.assign(e, { ...(e.shared ? {} : { base }), title: p.title, updatedAt: Date.now(), slides: p.slides.length, w: p.width, h: p.height, cover: coverOf(p) });
          return doc;
        });
        this.projects = d.list;
        this.emit();
      } catch (e) { /* ignore */ }
    }, 6000);
  }

  scheduleDraftClear() {
    clearTimeout(this._draftClear);
    const id = this.projectId;
    this._draftClear = setTimeout(() => { if (this.live && this.live.status === 'synced') clearDraft(id); }, 1200);
  }

  /** Put a not-yet-saved project in the editor (it joins the list on first save). */
  startNewProject(project) {
    const id = newId();
    this.projectId = id;
    this.projectBase = baseFor(id);
    this.pbe = this.backend;
    this.saves = [];
    this.lastSavedAt = null;
    this.pendingDraft = null;
    this.setProject(project, 0);
    this.dirty = false;
    this.status = this.statusFromSave();
    this.watchHead();
    this.emitNow();
    return id;
  }

  async newProject() {
    this.tutorial = null;
    if (this.liveMode) {
      await this.closeLive();
      await this.createProject({ version: 1, title: t('Untitled presentation'), width: this.project ? this.project.width : 1920, height: this.project ? this.project.height : 1080, fonts: [], slides: [{ id: null, page: blankPage(), anim: {} }], objects: {} }, { open: true });
      this.toast(t('New project created'), 'success');
      return;
    }
    this.startNewProject({ version: 1, title: t('Untitled presentation'), width: this.project ? this.project.width : 1920, height: this.project ? this.project.height : 1080, fonts: [], slides: [{ id: null, page: blankPage(), anim: {} }], objects: {} });
    this.toast(t('New project. Save it to add it to your projects.'), 'none');
  }

  /** Projects shown in the project list: saved ones plus the open one if it has never been saved. */
  projectList() {
    const list = (this.projects || []).map((x) => (x.id === this.projectId && this.project ? { ...x, title: this.project.title, current: true, dirty: this.dirty } : x));
    if (this.project && !list.some((x) => x.id === this.projectId)) {
      list.unshift({ id: this.projectId, title: this.project.title, slides: this.project.slides.length, current: true, unsaved: true, dirty: this.dirty, w: this.project.width, h: this.project.height, cover: coverOf(this.project) });
    }
    return list.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async duplicateProject(id) {
    let src = null;
    if (id === this.projectId) { if (this.live) await this.live.flushAll(); src = this.snapshotForSave(); }
    else if (this.liveMode) {
      const entry = this.projects.find((x) => x.id === id);
      const sc = this.scopeFor(entry);
      const tmp = new LiveSync({ backend: sc.be, base: sc.base, tab: this.tab, host: this.liveHost() });
      const loaded = await tmp.load();
      tmp.close();
      src = loaded ? loaded.project : (await loadLatest(sc.be, sc.base)).project;
      if (!src) { this.toast(t('This project could not be read.'), 'danger'); return; }
      if (entry.title) src.title = entry.title;
    } else {
      const entry = this.projects.find((x) => x.id === id);
      const res = await loadLatest(this.backend, entry.base);
      if (!res.project) { this.toast(t('This project could not be read.'), 'danger'); return; }
      src = res.project;
      if (entry.title) src.title = entry.title;
    }
    src.title = t('Copy of {title}', { title: src.title || t('Untitled presentation') });
    const nid = newId();
    try {
      if (this.liveMode) await this.createProject(src, { open: false, id: nid });
      else await this._saveAs(nid, baseFor(nid), src, null, {}, this.backend);
      this.toast(t('“{title}” created', { title: src.title }), 'success');
    } catch (e) {
      this.toast(t('Could not duplicate: ') + (e.message || e), 'danger');
    }
    this.emitNow();
  }

  async renameProject(id, title) {
    const tt = (title || '').trim() || t('Untitled presentation');
    if (id === this.projectId) { this.setTitle(tt); }
    if (this.isOwner && this.projects.some((x) => x.id === id)) {
      const d = await updateIndex(this.backend, (doc) => { const e = doc.list.find((x) => x.id === id); if (e) e.title = tt; return doc; });
      this.projects = d.list;
    }
    this.emitNow();
  }

  /** Delete a project. Its data is purged after a short delay so it can be undone. */
  async deleteProject(id) {
    if (!this.isOwner) return this.leaveProject(id);
    const entry = this.projects.find((x) => x.id === id);
    const wasCurrent = id === this.projectId;
    if (entry) {
      const d = await updateIndex(this.backend, (doc) => { doc.list = doc.list.filter((x) => x.id !== id); if (doc.last === id) doc.last = null; return doc; });
      this.projects = d.list;
    }
    if (wasCurrent) await this.openAnother();
    this.emitNow();
    if (!entry) return;
    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      if (entry.shared) {
        const sc = this.scopeFor(entry);
        try {
          const sdoc = await this.backend.get(`shares/${id}`);
          for (const x of (sdoc && sdoc.invites) || []) await this.backend.del(`inv/${x.id}`);
          await this.backend.del(`shares/${id}`);
          await sc.be.setPlain('live/moved', { moved: true, at: Date.now() });
          await purgeScope(sc.be, { keepMoved: true });
        } catch (e) { /* best effort */ }
      } else {
        await purgeProject(this.backend, entry.base);
        await gcAssets(this.backend, this.privateBases());
      }
      clearDraft(id);
    }, 10000);
    this.toast(t('“{title}” deleted', { title: entry.title }), 'none', {
      timeout: 9000,
      action: { text: t('Undo'), onClick: async () => {
        undone = true;
        clearTimeout(timer);
        const d = await updateIndex(this.backend, (doc) => { if (!doc.list.some((x) => x.id === id)) doc.list.push(entry); return doc; });
        this.projects = d.list;
        this.emitNow();
      } },
    });
  }

  restoreDraft() {
    const d = this.pendingDraft;
    this.pendingDraft = null;
    if (!d) return;
    this.setProject(d.project, Math.min(d.active || 0, d.project.slides.length - 1));
    this.liveTouch(this.project.slides.map((x) => x.id));
    this.markDirty();
    this.toast(this.live ? t('Unsaved changes restored and shared.') : t('Unsaved changes restored. Remember to save.'), 'success');
  }
  discardDraft() { this.pendingDraft = null; clearDraft(this.projectId); this.emitNow(); }

  setProject(project, active = 0) {
    project.version = project.version || 1;
    project.title = project.title || t('Untitled presentation');
    project.objects = project.objects || {};
    if (!project.slides || !project.slides.length) project.slides = [{ id: newId(), page: blankPage(), anim: {} }];
    for (const s of project.slides) { s.anim = s.anim || {}; s.id = s.page.id; }
    ensureNames(project);
    normalizeRegistry(project);
    this.project = project;
    ensureFonts(project);
    this.active = Math.max(0, Math.min(active, project.slides.length - 1));
    this.loadSlide(this.active);
    this.emitNow();
  }

  // ---- editor <-> project sync -------------------------------------------
  pageForEditor(page) {
    const p = deepClone(page);
    const walk = (ch) => {
      for (const el of ch || []) {
        if (el.type === 'group') { walk(el.children); continue; }
        el.name = nameOf(this.project, el.id);
        // Corner handles keep the picture's proportions (the editor's own keepRatio option).
        if (el.type === 'image') el.keepRatio = true;
      }
    };
    walk(p.children);
    return p;
  }

  loadSlide(i, keepHistory = false) {
    const s = this.project.slides[i];
    this.loading = true;
    try {
      this.store.loadJSON({
        width: this.project.width, height: this.project.height, fonts: this.project.fonts || [],
        pages: [this.pageForEditor(s.page)], unit: 'px', dpi: 72, schemaVersion: 2,
      }, keepHistory);
    } finally {
      this.loading = false;
    }
  }

  onStoreChange(json) {
    if (this.loading || this.applyingRemote || !this.project) return;
    const page = json && json.pages && json.pages[0];
    if (!page) return;
    const slide = this.project.slides[this.active];
    if (!slide || slide.id !== page.id) return;
    const prevPage = slide.page;
    slide.page = page;
    slide.id = page.id;
    this.project.width = json.width;
    this.project.height = json.height;
    this.project.fonts = json.fonts || [];
    ensureFonts(this.project);
    // Name new objects (pasted, duplicated, freshly added) and pick up renames from the Layers panel.
    const fixes = [];
    const taken = nameTaken(this.project);
    const remoteBase = this.live && this.live.bases.get(slide.id);
    let registryChanged = false;
    const newIds = [];
    for (const id of allLeafIds(page)) {
      const el = findRaw(page, id);
      const reg = this.project.objects[id];
      // An object that arrived from a collaborator gets its name from them, not from us.
      if (!reg && remoteBase && findRaw(remoteBase.page, id)) continue;
      if (!reg) {
        registryChanged = true;
        newIds.push(id);
        const name = makeName(taken); taken.add(name);
        this.project.objects[id] = { name };
        fixes.push([id, name]);
      } else if (el.name !== reg.name) {
        const raw = (el.name || '').trim();
        const n = normalizeId(raw);
        if (raw && !DEFAULT_NAME_RE.test(raw) && n && !idByName(this.project, n)) { this.project.objects[id] = { ...reg, name: n }; registryChanged = true; fixes.push([id, n]); }
        else fixes.push([id, reg.name]);
      }
    }
    const ratioFix = [];
    for (const id of allLeafIds(page)) { const el = findRaw(page, id); if (el.type === 'image' && el.keepRatio !== true) ratioFix.push(id); }
    if (fixes.length || ratioFix.length) {
      this.store.history.ignore(() => {
        for (const [id, name] of fixes) { const e = this.store.getElementById(id); if (e) e.set({ name }); }
        for (const id of ratioFix) { const e = this.store.getElementById(id); if (e) e.set({ keepRatio: true }); }
      });
    }
    if (this.live) {
      this.live.slideChanged(slide.id);
      if (registryChanged || json.width !== this.live.baseMeta?.width || json.height !== this.live.baseMeta?.height) this.live.metaChanged();
      else this.live.metaChanged(); // fonts and other project fields; an unchanged diff costs nothing
    }
    if (this.onLocalEdit) this.onLocalEdit(prevPage, page);
    if (newIds.length) this.checkDuplicateImages(page, newIds);
    this.markDirty();
  }

  /** A newly added picture that is already used on another slide: offer to make it the same object. */
  checkDuplicateImages(page, ids) {
    const here = allLeafIds(page);
    for (const id of ids) {
      const el = findRaw(page, id);
      if (!el || (el.type !== 'image' && el.type !== 'svg') || !el.src || el.src.length < 64) continue;
      let found = null;
      this.project.slides.forEach((sl, k) => {
        if (found || k === this.active) return;
        for (const oid of allLeafIds(sl.page)) {
          if (oid === id || here.has(oid)) continue;
          const o = findRaw(sl.page, oid);
          if (o && o.src === el.src) { found = { id: oid, k }; break; }
        }
      });
      if (!found) continue;
      const name = nameOf(this.project, found.id);
      this.toast(t('Already used as {name} on slide {k}.', { name, k: found.k + 1 }), 'none', {
        timeout: 9000,
        action: { text: t('Make it the same object'), onClick: () => { const err = this.linkTo(id, name); if (err) this.toast(err, 'warning'); } },
      });
      break;
    }
  }

  // ---- slide templates (shared by all projects) ---------------------------------------------
  async saveSlideAsTemplate(i, name) {
    const sl = this.project.slides[i];
    if (!sl) return;
    const { stripped, assets } = extractAssets({ page: sl.page, anim: sl.anim || {} });
    try {
      for (const [k, v] of Object.entries(assets)) await ensureAsset(this.backend, k, v);
      const tid = newId();
      await this.backend.set(`templates/${tid}`, { v: 1, name: (name || 'Template').slice(0, 60), page: stripped.page, anim: stripped.anim, w: this.project.width, h: this.project.height, at: Date.now(), by: (this.me && this.me.id) || null });
      this.templates = null;
      this.toast(t('Saved as template “{name}”', { name: name || t('Template') }), 'success');
    } catch (e) {
      this.toast(t('Could not save the template: ') + ((e && e.message) || e), 'danger');
    }
    this.emitNow();
  }

  async loadTemplates() {
    if (!this.backend.list || !this.isOwner) { this.templates = []; this.emitNow(); return []; }
    let docs = [];
    try { docs = await this.backend.list('templates'); } catch (e) { docs = []; }
    this._tplAssets = this._tplAssets || new Map();
    const out = [];
    for (const d of docs) {
      try {
        const refs = new Set();
        const scan = (v) => { if (typeof v === 'string') { if (v.startsWith('@asset:')) refs.add(v.slice(7)); return; } if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
        scan(d.data.page);
        const assets = {};
        for (const k of refs) { if (!this._tplAssets.has(k)) this._tplAssets.set(k, await fetchAsset(this.backend, k)); assets[k] = this._tplAssets.get(k); }
        out.push({ id: d.id, name: d.data.name, at: d.data.at || 0, w: d.data.w || 1920, h: d.data.h || 1080, page: injectAssets(d.data.page, assets), anim: d.data.anim || {} });
      } catch (e) { /* skip unreadable template */ }
    }
    out.sort((a, b) => b.at - a.at);
    this.templates = out;
    this.emitNow();
    return out;
  }

  async deleteTemplate(tid) {
    try { await this.backend.del(`templates/${tid}`); } catch (e) { /* ignore */ }
    this.templates = (this.templates || []).filter((x) => x.id !== tid);
    this.emitNow();
  }

  /**
   * New slide from a template: its objects are new (never linked to the template or other slides),
   * except a theme's role objects, which keep one ID per theme so layouts of a theme morph.
   */
  insertTemplate(tpl, at) {
    const page = fitPage(deepClone(tpl.page), tpl.w || 1920, tpl.h || 1080, this.project.width, this.project.height);
    page.id = newId();
    const map = freshIds(page, this.project, (id) => !parseRoleId(id));
    if (tpl.theme) {
      for (const id of allLeafIds(page)) if (parseRoleId(id)) this.registerRole(id);
      if ((this.project.settings || {}).theme !== tpl.theme) this.project.settings = { ...(this.project.settings || {}), theme: tpl.theme };
    }
    const sl = { id: page.id, page, anim: remapAnim(tpl.anim, map) };
    const idx = Math.max(0, Math.min(at, this.project.slides.length));
    this.project.slides.splice(idx, 0, sl);
    this.active = idx;
    this.loadSlide(idx);
    this.liveTouch([sl.id]);
    this.markDirty();
    this.emitNow();
  }

  /** Give a theme role object its registry entry (a readable ID such as OCEAN-TITLE). */
  registerRole(id) {
    this.project.objects = this.project.objects || {};
    if (this.project.objects[id]) return;
    const r = parseRoleId(id);
    let name = normalizeId(`${r.theme}-${r.role}`);
    const owner = idByName(this.project, name);
    if (owner && owner !== id) name = makeName(nameTaken(this.project));
    this.project.objects[id] = { name };
  }

  // ---- tutorial (a practice presentation that is never saved) -------------------------------
  async startTutorial() {
    if (this.tutorial) return;
    const back = { id: this.projectId, active: this.active };
    if (this.live) await this.closeLive();
    if (this._unwatchHead) { this._unwatchHead(); this._unwatchHead = null; }
    clearTimeout(this._draftTimer);
    this.tutorial = { back };
    this.projectId = '__tutorial';
    this.projectBase = null;
    this.saves = [];
    this.lastSavedAt = null;
    this.pendingDraft = null;
    this.newerSave = null;
    this.ui = { ...this.ui, mine: false, tplAt: null };
    this.setProject(tutorialProject(), 0);
    this.dirty = false;
    this.status = { kind: 'ok', text: t('Practice: nothing is saved') };
    this.people = null;
    this.pushPresence();
    this.emitNow();
  }

  /** The tutorial puts the practice slides back the way a step needs them. */
  setTutorialSlides(slides, active = 0) {
    if (!this.tutorial) return;
    const p = tutorialProject();
    p.slides = JSON.parse(JSON.stringify(slides));
    if (this.project && this.project.notes) p.notes = { ...this.project.notes };
    this.setProject(p, active);
    this.dirty = false;
  }

  /** Leave the practice presentation and reopen the one that was open before. */
  async endTutorial() {
    if (!this.tutorial) return;
    const back = this.tutorial.back || {};
    this.tutorial = null;
    let ok = false;
    if (back.id && back.id !== '__tutorial') ok = await this.openProject(back.id, { silent: true });
    if (!ok && this.projects && this.projects.length) ok = await this.openProject(this.projects[0].id, { silent: true });
    if (ok && back.active) this.selectSlide(Math.min(back.active, this.project.slides.length - 1));
    if (!ok) { this.project = null; this.emitNow(); }
  }

  // ---- speaker notes and slide owners ---------------------------------------------------------
  noteOf(sid) { return (this.project && this.project.notes && this.project.notes[sid]) || ''; }

  setNote(sid, text) {
    if (!this.project) return;
    const notes = { ...(this.project.notes || {}) };
    const v = String(text || '').slice(0, 20000);
    if (v.trim()) notes[sid] = v; else delete notes[sid];
    this.project.notes = notes;
    this.liveTouch([]);
    this.markDirty();
  }

  /** This person's key in the open project: 'owner' for the space owner, else their link's id. */
  myKey() {
    if (this.isOwner || this.tutorial) return 'owner';
    const k = this.keyring.find((x) => x.pid === this.projectId);
    return (k && k.personKey) || null;
  }

  ownerOf(sid) { return (this.project && this.project.owners && this.project.owners[sid]) || null; }

  personName(key) {
    if (!key) return '';
    const known = (this.people || []).find((x) => x.key === key);
    if (known) return known.name;
    const names = this.settings.people || {};
    return names[key] || (key === 'owner' ? t('Owner') : t('Someone'));
  }

  /** People who can be given slides: the owner and everyone with a link to this project. */
  async refreshPeople() {
    const pid = this.projectId;
    if (this.tutorial) { this.people = [{ key: this.myKey() || 'owner', name: this.myName() || t('Me') }]; this.emitNow(); return; }
    const out = [];
    const ownerName = this.isOwner ? ((this.me && this.me.name) || this.myName() || t('Me')) : ((this.keyring.find((x) => x.pid === pid) || {}).ownerName || t('Owner'));
    out.push({ key: 'owner', name: ownerName });
    try {
      if (!this.isOwner) {
        const k = this.keyring.find((x) => x.pid === pid);
        if (k && k.code && !k.personKey) { k.personKey = await codeId(k.code); this.saveKeyring(); }
      }
      if (this.isOwner) {
        const info = await this.shareInfo(pid);
        for (const inv of (info && info.invites) || []) out.push({ key: inv.id, name: inv.name || (inv.joined && inv.joined.nick) || t('Someone') });
      } else if (this.pbe && this.pbe.list) {
        for (const d of await this.pbe.list('m')) out.push({ key: d.id, name: (d.data && d.data.nick) || t('Someone') });
      }
    } catch (e) { /* keep what we have */ }
    if (pid !== this.projectId) return;
    this.people = out;
    this.emitNow();
  }

  /** Show only the slides assigned to me (and go to the first of them). */
  setMineOnly(on) {
    this.ui = { ...this.ui, mine: !!on };
    if (on && this.project) {
      const me = this.myKey();
      const cur = this.project.slides[this.active];
      if (!cur || this.ownerOf(cur.id) !== me) {
        const k = this.project.slides.findIndex((x) => this.ownerOf(x.id) === me);
        if (k >= 0) this.selectSlide(k);
      }
    }
    this.emitNow();
  }

  /** Give a slide to someone (null: nobody). Their name is kept with the project so everyone sees it. */
  setOwner(sids, person) {
    if (!this.project) return;
    const owners = { ...(this.project.owners || {}) };
    for (const sid of [].concat(sids)) { if (person) owners[sid] = person.key; else delete owners[sid]; }
    this.project.owners = owners;
    if (person) this.project.settings = { ...this.settings, people: { ...(this.settings.people || {}), [person.key]: person.name } };
    this.liveTouch([]);
    this.markDirty();
    this.emitNow();
  }

  // ---- project settings and themes ----------------------------------------------------------
  get settings() { return (this.project && this.project.settings) || {}; }
  get theme() { return themeById(this.settings.theme); }

  setSettings(patch) {
    if (!this.project) return;
    this.project.settings = { ...this.settings, ...patch };
    this.liveTouch([]);
    this.markDirty();
    this.emitNow();
  }

  /** "+" opens the theme's layouts once a theme is chosen, else adds a blank slide. */
  newSlideAt(at) {
    if (this.theme) this.setUi({ tplAt: at });
    else this.addSlide(at);
  }

  /** Slides made with a theme (they hold one of its role objects or its background). */
  themeSlides(themeId) {
    const T = themeById(themeId);
    if (!T || !this.project) return [];
    return this.project.slides.map((sl, k) => {
      const ids = allLeafIds(sl.page);
      const has = ROLES.some((r) => ids.has(roleId(themeId, r)));
      const bg = String(sl.page.background || '').toLowerCase() === T.paper;
      return has || bg ? k : -1;
    }).filter((k) => k >= 0);
  }

  /** Choose the project theme; with restyle, slides made with the old theme switch to the new one. */
  setTheme(id, { restyle = false } = {}) {
    const from = this.theme;
    const to = themeById(id);
    if (restyle && from && to && from.id !== to.id) this.restyleTheme(from, to);
    this.setSettings({ theme: to ? to.id : null });
  }

  restyleTheme(A, B) {
    const colors = new Map();
    for (const k of COLOR_TOKENS) { const c = A[k].toLowerCase(); if (!colors.has(c)) colors.set(c, B[k]); }
    const fonts = new Map([[A.body, [B.body, null]], [A.head, [B.head, B.hw]]]);
    const s = Math.min(this.project.width / 1920, this.project.height / 1080);
    const ids = new Map(ROLES.map((r) => [roleId(A.id, r), roleId(B.id, r)]));
    const touched = [];
    for (const k of this.themeSlides(A.id)) {
      const sl = this.project.slides[k];
      const page = deepClone(sl.page);
      if (String(page.background || '').toLowerCase() === A.paper) page.background = B.paper;
      const walk = (ch) => {
        for (const el of ch || []) {
          if (el.children) walk(el.children);
          for (const p of ['fill', 'stroke']) {
            const c = typeof el[p] === 'string' && colors.get(el[p].toLowerCase());
            if (c) el[p] = c;
          }
          if (el.type === 'text' && fonts.has(el.fontFamily)) {
            const [f, w] = fonts.get(el.fontFamily);
            if (w && el.fontFamily === A.head && el.fontWeight === A.hw) el.fontWeight = w;
            el.fontFamily = f;
          }
          const role = parseRoleId(el.id);
          if (role && role.theme === A.id && (role.role === 'deco1' || role.role === 'deco2')) el.cornerRadius = decoRadius(B.shape, el.width || 0);
          else if (el.type === 'figure' && typeof el.cornerRadius === 'number' && Math.abs(el.cornerRadius - A.radius * s) < 0.5) el.cornerRadius = B.radius * s;
          if (ids.has(el.id)) el.id = ids.get(el.id);
        }
      };
      walk(page.children);
      const anim = {};
      for (const [id, v] of Object.entries(sl.anim || {})) anim[ids.get(id) || id] = v;
      sl.page = page;
      sl.anim = anim;
      touched.push(sl.id);
    }
    for (const nid of ids.values()) if (this.project.slides.some((sl) => findRaw(sl.page, nid))) this.registerRole(nid);
    if (touched.length) {
      this.loadSlide(this.active);
      this.liveTouch(touched);
      this.toast(tn(touched.length, '1 slide restyled with {theme}', '{n} slides restyled with {theme}', { theme: t(B.name) }), 'success');
    }
  }

  markDirty() {
    this.dirty = true;
    this.editCount = (this.editCount || 0) + 1;
    if (this.tutorial) this.status = { kind: 'ok', text: t('Practice: nothing is saved') };
    else if (this.status.kind !== 'saving') this.status = this.live ? this.statusFromSave() : { kind: 'dirty', text: t('Unsaved changes') };
    if (this.live) { this.scheduleIndexUpdate(); this.editsSinceVersion = true; this.noteAuthor(this.me_()); }
    clearTimeout(this._draftTimer);
    const pid = this.projectId;
    if (!this.live && !this.tutorial) {
      this._draftTimer = setTimeout(() => {
        if (pid !== this.projectId) return;
        saveDraft(pid, this.project, { dirty: true, active: this.active });
      }, 1500);
    }
    this.emit();
  }

  // ---- slides -------------------------------------------------------------
  selectSlide(i) {
    if (i === this.active || i < 0 || i >= this.project.slides.length) return;
    this.active = i;
    this.loadSlide(i);
    this.emitNow();
  }

  gotoObject(k, id) {
    this.selectSlide(k);
    if (this.store.getElementById(id)) this.store.selectElements([id]);
    this.emitNow();
  }

  addSlide(at, opts = {}) {
    const s = { id: null, page: blankPage(), anim: {} };
    const cur = this.project.slides[this.active];
    if (opts.background) s.page.background = opts.background;
    else if (cur && cur.page && cur.page.background) s.page.background = cur.page.background;
    s.id = s.page.id;
    this.project.slides.splice(at, 0, s);
    this.active = at;
    this.loadSlide(at);
    this.liveTouch([s.id]);
    this.markDirty();
    this.emitNow();
  }

  duplicateSlide(i, opts = {}) {
    const copy = duplicateSlideData(this.project.slides[i], this.project, opts);
    const from = this.project.slides[i].id;
    if (this.project.notes && this.project.notes[from]) this.project.notes = { ...this.project.notes, [copy.id]: this.project.notes[from] };
    if (this.project.owners && this.project.owners[from]) this.project.owners = { ...this.project.owners, [copy.id]: this.project.owners[from] };
    this.project.slides.splice(i + 1, 0, copy);
    this.active = i + 1;
    this.loadSlide(i + 1);
    this.liveTouch([copy.id]);
    this.markDirty();
    this.emitNow();
  }

  deleteSlide(i) {
    const slides = this.project.slides;
    if (slides.length <= 1) { this.toast(t('A presentation needs at least one slide.')); return; }
    const [removed] = slides.splice(i, 1);
    const wasActive = i === this.active;
    if (i < this.active || (wasActive && this.active >= slides.length)) this.active = Math.max(0, this.active - 1);
    if (wasActive) this.loadSlide(this.active);
    this.liveTouch([]);
    this.markDirty();
    this.emitNow();
    this.toast(t('Slide {n} deleted', { n: i + 1 }), 'none', {
      action: { text: t('Undo'), onClick: () => {
        if (this.project.slides.some((x) => x.id === removed.id)) return;
        this.project.slides.splice(Math.min(i, this.project.slides.length), 0, removed);
        this.active = this.project.slides.indexOf(removed);
        this.loadSlide(this.active);
        this.liveTouch([removed.id]);
        this.markDirty();
        this.emitNow();
      } },
      timeout: 6000,
    });
  }

  moveSlide(from, to) {
    const slides = this.project.slides;
    if (from === to || from < 0 || to < 0 || from >= slides.length || to >= slides.length) return;
    const activeId = slides[this.active].id;
    const [s] = slides.splice(from, 1);
    slides.splice(to, 0, s);
    this.active = slides.findIndex((x) => x.id === activeId);
    this.liveTouch([]);
    this.markDirty();
    this.emitNow();
  }

  // ---- objects & animation -------------------------------------------------
  /** Leaf object ids of the current selection (groups expand to their children). */
  selectedLeafIds() {
    const out = [];
    const walk = (el) => { if (el.type === 'group') (el.children || []).forEach(walk); else out.push(el.id); };
    (this.store.selectedElements || []).forEach(walk);
    return out;
  }

  setAnim(slideIndex, ids, kind, patch) {
    const s = this.project.slides[slideIndex];
    if (!s) return;
    for (const id of ids) setAnim(s, id, kind, patch);
    this.liveTouch([s.id], false);
    this.markDirty();
    this.emitNow();
  }

  rename(id, name) {
    const n = normalizeId(name);
    if (!n) return t('Use letters or numbers');
    let other = idByName(this.project, n);
    if (other && other !== id && !this.slidesWith(other).length) { delete this.project.objects[other]; other = null; } // stale entry
    if (other && other !== id) return t('{n} is already used. Use Link to make them the same object.', { n });
    this.project.objects[id] = { ...(this.project.objects[id] || {}), name: n };
    const e = this.store.getElementById(id);
    if (e) this.store.history.ignore(() => e.set({ name: n }));
    this.liveTouch([]);
    this.markDirty();
    this.emitNow();
    return null;
  }

  /** Replace the id of an element on the current slide (keeps undo history). */
  _swapId(oldId, nid) {
    const json = this.store.toJSON();
    const page = json.pages[0];
    if (!replaceIdInPage(page, oldId, nid)) return false;
    const el = findRaw(page, nid);
    el.name = nameOf(this.project, nid);
    const slide = this.project.slides[this.active];
    if (slide.anim && slide.anim[oldId]) {
      if (!slide.anim[nid]) slide.anim[nid] = slide.anim[oldId];
      delete slide.anim[oldId];
    }
    this.loading = true;
    try { this.store.loadJSON(json, true); } finally { this.loading = false; }
    slide.page = this.store.toJSON().pages[0];
    this.store.selectElements([nid]);
    this.liveTouch([slide.id]);
    this.markDirty();
    this.emitNow();
    return true;
  }

  /** Slides (indexes) containing an object. */
  slidesWith(id) { return this.project.slides.map((sl, k) => (findRaw(sl.page, id) ? k : -1)).filter((k) => k >= 0); }

  /**
   * Make `elementId` the same object as `targetName`. scope 'slide' = this slide only,
   * 'all' = every slide where it appears (slides that already have the target keep theirs).
   */
  linkEverywhere(elementId, targetName) {
    const target = idByName(this.project, targetName);
    if (!target || target === elementId) return { changed: 0, skipped: 0 };
    let changed = 0, skipped = 0;
    this.project.slides.forEach((sl, k) => {
      if (k === this.active || !findRaw(sl.page, elementId)) return;
      if (findRaw(sl.page, target)) { skipped++; return; }
      const page = deepClone(sl.page);
      replaceIdInPage(page, elementId, target);
      sl.page = page;
      if (sl.anim && sl.anim[elementId]) {
        sl.anim = { ...sl.anim };
        if (!sl.anim[target]) sl.anim[target] = sl.anim[elementId];
        delete sl.anim[elementId];
      }
      changed++;
      if (this.live) this.live.slideChanged(sl.id);
    });
    const cur = this.project.slides[this.active];
    if (findRaw(cur.page, elementId)) {
      if (findRaw(cur.page, target)) skipped++;
      else { this._swapId(elementId, target); changed++; }
    }
    this.markDirty();
    this.emitNow();
    return { changed, skipped };
  }

  setFresh(id, fresh) {
    const o = this.project.objects[id] || { name: nameOf(this.project, id) };
    this.project.objects[id] = { ...o, fresh: !!fresh || undefined };
    if (!fresh) delete this.project.objects[id].fresh;
    this.liveTouch([]);
    this.markDirty();
    this.emitNow();
  }

  linkTo(elementId, targetName) {
    const target = idByName(this.project, targetName);
    if (!target) return t('No object is called “{name}”', { name: targetName });
    if (target === elementId) return null;
    const page = this.project.slides[this.active].page;
    if (leafMap(page).has(target) || findRaw(page, target)) return t('{n} is already on this slide', { n: nameOf(this.project, target) });
    this._swapId(elementId, target);
    return null;
  }

  dissociate(elementId) {
    const nid = newId();
    const name = makeName(nameTaken(this.project));
    this.project.objects[nid] = { name };
    this._swapId(elementId, nid);
  }

  resetToPrevious(id) {
    const k = nearestPrevWith(this.project, this.active, id);
    if (k < 0) return;
    const prev = findRaw(this.project.slides[k].page, id);
    const el = this.store.getElementById(id);
    if (!prev || !el) return;
    if (prev.type !== el.type) { this.toast(t('The previous version is a different kind of element.'), 'warning'); return; }
    el.set(stateProps(prev));
    this.toast(t('Back to its look on slide {k}', { k: k + 1 }));
  }

  /** Objects available for linking (not on the current slide). */
  linkCandidates() {
    const here = allLeafIds(this.project.slides[this.active].page);
    const seen = new Map();
    this.project.slides.forEach((s, i) => {
      for (const el of leafMap(s.page).values()) {
        if (here.has(el.id) || seen.has(el.id)) continue;
        seen.set(el.id, { id: el.id, name: nameOf(this.project, el.id), slide: i, type: el.type, label: labelOf(el) });
      }
    });
    // Same kind of object first (a circle is most likely linked to a circle).
    const sel = this.store.selectedElements[0];
    const kind = sel && sel.type;
    return Array.from(seen.values()).sort((a, b) => ((b.type === kind) - (a.type === kind)) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  // ---- save / load -----------------------------------------------------------
  snapshotForSave() {
    const p = deepClone(this.project);
    pruneRegistry(p);
    const ids = new Set(p.slides.map((x) => x.id));
    for (const k of ['notes', 'owners']) if (p[k]) for (const sid of Object.keys(p[k])) if (!ids.has(sid)) delete p[k][sid];
    return p;
  }

  /** Write a project's save + update the project list entry. */
  async _saveAs(id, base, p, onProgress, opts = {}, be = this.pbe) {
    const res0 = await saveVersion(be, p, base, { by: (this.me && this.me.id) || null, tab: this.tab, ...opts }, onProgress);
    if (res0.skipped) return res0;
    const { entry, saves } = res0;
    const cover = coverOf(p);
    const shared = be !== this.backend;
    if (this.isOwner) {
      const d = await updateIndex(this.backend, (doc) => {
        let e = doc.list.find((x) => x.id === id);
        if (!e) { e = { id, base, createdAt: entry.savedAt }; doc.list.push(e); }
        Object.assign(e, { ...(shared ? {} : { base }), title: p.title || t('Untitled presentation'), updatedAt: entry.savedAt, slides: p.slides.length, w: p.width, h: p.height, cover });
        return doc;
      });
      this.projects = d.list;
    }
    if (shared) gcAssets(be, ['']);
    else gcAssets(this.backend, this.privateBases());
    return { entry, saves };
  }

  // ---- version history (live mode) -------------------------------------------------
  me_() { return { uid: (this.me && this.me.id) || null, nick: this.myName() || '' }; }

  noteAuthor(who) {
    if (!who) return;
    this.authors = this.authors || new Map();
    const key = who.uid || ('nick:' + (who.nick || '?'));
    this.authors.set(key, { uid: who.uid || null, nick: who.nick || '' });
  }

  startVersionTimer() {
    clearInterval(this._verTimer);
    this._verTimer = setInterval(() => this.autoVersionTick(), 60 * 1000);
  }

  async autoVersionTick() {
    if (!this.live || this.live.readOnly || !this.editsSinceVersion || this._versioning) return;
    const last = (this.saves && this.saves[0] && this.saves[0].savedAt) || 0;
    if (Date.now() - last < AUTO_VERSION_MS) return;
    await this.makeVersion({ auto: true });
  }

  /** Create a version of the shared state. Returns the entry (or null when someone else just made one). */
  async makeVersion({ auto = false, name = '', reason = '', force = false } = {}) {
    if (this._versioning) return null;
    this._versioning = true;
    const id = this.projectId, base = this.projectBase;
    try {
      if (this.live) await this.live.flushAll();
      const p = this.snapshotForSave();
      const authors = Array.from((this.authors || new Map()).values());
      const res = await this._saveAs(id, base, p, null, { auto, name, reason, authors, skipIfNewerThan: auto && !force ? AUTO_VERSION_MS : 0 });
      if (id !== this.projectId) return null;
      this.saves = res.saves || this.saves;
      if (!res.skipped) { this.editsSinceVersion = false; this.authors = new Map(); }
      this.lastSavedAt = this.saves[0] ? this.saves[0].savedAt : null;
      this.dirty = false;
      this.emitNow();
      return res.skipped ? null : res.entry;
    } catch (e) {
      if (!auto) this.toast(t('The version could not be saved: ') + ((e && e.message) || e), 'danger', { timeout: 8000 });
      return null;
    } finally {
      this._versioning = false;
    }
  }

  async nameCurrentVersion(name) {
    const entry = await this.makeVersion({ auto: false, name: name || '', force: true });
    if (entry) this.toast(name ? t('Version “{name}” saved', { name }) : t('Version saved'), 'success');
    return entry;
  }

  async renameVersion(slot, name) {
    try { this.saves = await renameVersion(this.pbe, this.projectBase, slot, name, this.tab); } catch (e) { this.toast(t('Could not rename: ') + e.message, 'danger'); }
    this.emitNow();
  }

  async deleteVersion(slot) {
    try { this.saves = await deleteVersion(this.pbe, this.projectBase, slot, this.tab); } catch (e) { this.toast(t('Could not delete: ') + e.message, 'danger'); }
    this.emitNow();
  }

  async loadVersion(entry) {
    this._verCache = this._verCache || new Map();
    if (this._verCache.has(entry.slot)) return this._verCache.get(entry.slot);
    const p = await loadSave(this.pbe, entry, this.projectBase);
    if (this._verCache.size > 6) this._verCache.clear();
    this._verCache.set(entry.slot, p);
    return p;
  }

  /** Restore a version for everyone. The current state is kept as a version first (like Google Slides). */
  async restoreVersion(entry) {
    try {
      const p = await this.loadVersion(entry);
      await this.makeVersion({ auto: true, reason: 'restore', force: true });
      this.setProject(deepClone(p), 0);
      this.liveTouch(this.project.slides.map((x) => x.id));
      this.markDirty();
      this.toast(t('Restored the version from {when}', { when: fmtTime(entry.savedAt) }), 'success', { timeout: 5000 });
      return true;
    } catch (e) {
      this.toast(t('This version could not be restored: ') + ((e && e.message) || e), 'danger');
      return false;
    }
  }

  async copyVersionAsProject(entry) {
    const p = deepClone(await this.loadVersion(entry));
    p.title = `${this.project.title} (${entry.name || fmtTime(entry.savedAt)})`;
    if (this.liveMode) await this.createProject(p, { open: false });
    else { const nid = newId(); await this._saveAs(nid, baseFor(nid), p, null, {}, this.backend); }
    this.toast(t('“{title}” added to your projects', { title: p.title }), 'success');
  }

  watchVersions() {
    if (this._unwatchVersions) { this._unwatchVersions(); this._unwatchVersions = null; }
    if (!this.pbe || !this.pbe.watch || !this.liveMode) return;
    const id = this.projectId, base = this.projectBase;
    this._unwatchVersions = this.pbe.watch(`${base}meta/head`, (head) => {
      if (id !== this.projectId || !head || !Array.isArray(head.saves)) return;
      this.saves = head.saves;
      this.lastSavedAt = head.saves[0] ? head.saves[0].savedAt : null;
      this.emit();
    });
  }

  async save({ force = false } = {}) {
    if (this.tutorial) { this.toast(t('This is the practice presentation: nothing here is saved.'), 'none'); return; }
    if (this.live) {
      // Everything is saved continuously; Ctrl+S just makes sure the last edits are written.
      await this.live.flushAll();
      this.toast(t('All changes are saved automatically.'), 'none', { timeout: 2200 });
      return;
    }
    if (this.saving) return;
    if (this.live) {
      this.saving = true;
      this.status = { kind: 'saving', text: t('Saving version…') };
      this.emitNow();
      try { await this.live.flushAll(); } catch (e) { /* the version is still saved from this screen */ }
      this.saving = false;
      force = true;
    }
    // Someone else saved this project after we opened it: ask before making ours the latest.
    if (!force) {
      try {
        const latest = (await listSaves(this.pbe, this.projectBase))[0];
        if (latest && latest.tab !== this.tab && (!this.lastSavedAt || latest.savedAt > this.lastSavedAt)) {
          await this.resolveIds([latest.by]);
          this.saveConflict = latest;
          this.emitNow();
          return;
        }
      } catch (e) { /* if we cannot check, save normally */ }
    }
    this.saveConflict = null;
    this.saving = true;
    this.status = { kind: 'saving', text: t('Saving…') };
    this.emitNow();
    try {
      const p = this.snapshotForSave();
      const startEdits = this.editCount || 0;
      const id = this.projectId;
      const { entry, saves } = await this._saveAs(id, this.projectBase, p, (f) => { this.status = { kind: 'saving', text: `Saving… ${Math.round(f * 100)}%` }; this.emitNow(); });
      if (id !== this.projectId) return;
      this.saves = saves;
      this.lastSavedAt = entry.savedAt;
      this.newerSave = null;
      this.dirty = (this.editCount || 0) !== startEdits;
      this.status = this.dirty ? { kind: 'dirty', text: this.live ? t('Changes since last version') : t('Unsaved changes') } : this.statusFromSave();
      if (!this.dirty && !this.live) saveDraft(id, this.project, { dirty: false, active: this.active });
    } catch (e) {
      const msg = e && e.code === 'quota_exceeded' ? t('Storage is full (images are large). Try smaller images.') : (e && e.message) || String(e);
      this.status = { kind: 'error', text: t('Save failed') };
      this.toast(t('Save failed — your previous saves are untouched. ') + msg, 'danger', { timeout: 9000 });
    } finally {
      this.saving = false;
      this.emitNow();
    }
  }

  async refreshSaves() { try { this.saves = await listSaves(this.pbe, this.projectBase); } catch (e) { /* ignore */ } this.emitNow(); return this.saves; }

  async restoreSave(entry) {
    try {
      const p = await loadSave(this.pbe, entry, this.projectBase);
      this.setProject(p, 0);
      this.liveTouch(this.project.slides.map((x) => x.id));
      this.markDirty();
      this.toast(this.live
        ? t('Version from {when} restored for everyone. The other versions are still in Backups.', { when: fmtTime(entry.savedAt) })
        : t('Opened the save from {when}. Save to keep it as the latest version.', { when: fmtTime(entry.savedAt) }), 'success', { timeout: 7000 });
    } catch (e) {
      this.toast(t('This save could not be opened: ') + (e.message || e), 'danger');
    }
  }

  async download(filename, data) {
    const dl = await getCapability('downloads', 1500);
    if (!dl) return { ok: false, reason: 'unavailable' };
    try { await dl.save({ filename, data }); return { ok: true }; }
    catch (e) { return { ok: false, reason: (e && e.code) || 'error', message: e && e.message }; }
  }

  async exportHtml() {
    const html = await buildExportHtml(this.project, this.ctx);
    const name = exportFileName(this.project);
    const res = await this.download(name, html);
    return { ...res, html, name };
  }

  async exportProjectFile() {
    const p = this.snapshotForSave();
    const name = exportFileName(p).replace(/\.html$/, '') + '.morph.json';
    const data = JSON.stringify({ format: 'morph-slides', ...p });
    const res = await this.download(name, data);
    return { ...res, data, name };
  }

  async importProjectFile(text) {
    const p = JSON.parse(text);
    if (!p || !Array.isArray(p.slides)) throw new Error('This file is not a presentation');
    delete p.format;
    if (this.liveMode) { await this.closeLive(); await this.createProject(p, { open: true }); return; }
    this.startNewProject(p);
    await this.save();
  }

  setTitle(v) { this.project.title = v || t('Untitled presentation'); this.liveTouch([]); this.markDirty(); this.emitNow(); }
}

/** Small copy of the first slide (big images left out) used as the project's preview. */
export function coverOf(project) {
  const s0 = project.slides && project.slides[0];
  if (!s0) return null;
  const strip = (v) => {
    if (typeof v === 'string') return v.length > 1024 ? '' : v;
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = strip(v[k]); return o; }
    return v;
  };
  const page = strip(s0.page);
  return JSON.stringify(page).length > 24000 ? { background: page.background, children: [] } : page;
}

export function labelOf(el) {
  if (el.type === 'text') return String(el.text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').slice(0, 40) || 'Text';
  if (el.type === 'figure') return (el.subType || 'shape').replace(/^\w/, (c) => c.toUpperCase());
  if (el.type === 'image') return 'Image';
  if (el.type === 'svg') return 'Graphic';
  if (el.type === 'line') return 'Line';
  return el.type;
}

/** "6:12 PM" today, otherwise "Nov 19, 6:12 PM". */
export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const time = d.toLocaleTimeString(LANG, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return d.toLocaleDateString(LANG, { month: 'short', day: 'numeric' }) + ', ' + time;
}
/** "at 6:12 PM" today, otherwise "on Nov 19, 6:12 PM". */
export function fmtWhen(ts) {
  const d = new Date(ts), now = new Date();
  return t(d.toDateString() === now.toDateString() ? 'at {time}' : 'on {time}', { time: fmtTime(ts) });
}
