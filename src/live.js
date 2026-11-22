// Live collaboration engine.
//
// Every project has a shared "working copy" in the artifact database:
//   <base>live/meta        { order, title, width, height, fonts, objects, settings, notes, owners, rev, by, at }
//                          settings: { theme, latex: { packages }, people: { personKey: name } }
//                          notes: { slideId: text }   owners: { slideId: personKey }
//   <base>live/s-<slideId> { page, anim, rev, by, at }      (images stored once under assets/<key>)
// Each screen keeps, per document, the last version it knows from the database (its "base").
// Local edits are the difference between that base and the screen's current state; they are written
// a moment later by reading the latest version under a short lock, applying the edits on top
// (attribute by attribute) and writing the result. Incoming versions are handled the same way in
// reverse: the screen's own not-yet-written edits are re-applied on top of what arrived.
// So nobody's work overwrites anybody else's, and every screen converges to the same state.
import {
  clone, diffSlide, applySlide, slideOpsEmpty, diffMeta, applyMeta, metaOpsEmpty, dedupeNames, localOnly,
} from './sync-core';
import { assetKey, ASSET_REF, ensureAsset, fetchAsset } from './storage';

const DEBOUNCE = 250;
const MAX_WAIT = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Page without screen-only fields and with images replaced by references. */
function stripPage(page, keyOf, assetsOut) {
  const walk = (v, depth) => {
    if (typeof v === 'string') {
      if (v.length > 1024 && v.startsWith('data:')) { const k = keyOf(v); assetsOut.set(k, v); return ASSET_REF + k; }
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) { if (localOnly(k)) continue; o[k] = walk(v[k], depth + 1); }
      return o;
    }
    return v;
  };
  return walk(page, 0);
}

function collectRefs(v, out = new Set()) {
  if (typeof v === 'string') { if (v.startsWith(ASSET_REF)) out.add(v.slice(ASSET_REF.length)); return out; }
  if (Array.isArray(v)) { v.forEach((x) => collectRefs(x, out)); return out; }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) collectRefs(v[k], out);
  return out;
}

function resolveRefs(v, cache) {
  if (typeof v === 'string') return v.startsWith(ASSET_REF) ? (cache.get(v.slice(ASSET_REF.length)) || '') : v;
  if (Array.isArray(v)) return v.map((x) => resolveRefs(x, cache));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = resolveRefs(v[k], cache); return o; }
  return v;
}

export class LiveSync {
  constructor({ backend, base, tab, host }) {
    this.be = backend;
    this.base = base;
    this.tab = tab;
    this.host = host; // controller callbacks
    this.bases = new Map(); // sid -> { page, anim, rev }
    this.baseMeta = null;
    this.assets = new Map(); // key -> dataURL
    this.keys = new Map(); // dataURL -> key
    this.uploaded = new Set();
    this.timers = new Map(); // docKey -> { t, first }
    this.inflight = new Set();
    this.again = new Set();
    this.queue = new Map(); // docId -> data
    this.draining = false;
    this.closed = false;
    this.failures = 0;
    this.status = 'synced';
    this.readOnly = false;
    this.bad = new Map(); // docKey -> consecutive rejected writes
  }

  path(docId) { return `${this.base}live/${docId}`; }
  keyOf = (dataUrl) => { let k = this.keys.get(dataUrl); if (!k) { k = assetKey(dataUrl); this.keys.set(dataUrl, k); this.assets.set(k, dataUrl); } return k; };

  setStatus(s) { if (this.status !== s) { this.status = s; this.host.onStatus(s); } }
  busy() { return this.inflight.size > 0 || this.timers.size > 0 || this.again.size > 0; }
  refreshStatus() {
    if (this.readOnly) return this.setStatus('readonly');
    if (this.failures > 0) return this.setStatus('offline');
    this.setStatus(this.busy() ? 'syncing' : 'synced');
  }

  // ---- wire format ----------------------------------------------------------
  toWire(state) {
    const assets = new Map();
    const page = stripPage(state.page, this.keyOf, assets);
    return { page, anim: clone(state.anim || {}), assets };
  }

  async resolve(doc) {
    const refs = collectRefs(doc.page);
    for (const k of refs) {
      if (this.assets.has(k)) continue;
      let data = null;
      for (let attempt = 0; attempt < 4 && data == null; attempt++) {
        try { data = await fetchAsset(this.be, k); } catch (e) { await sleep(400 * (attempt + 1)); }
      }
      if (data == null) throw new Error('An image could not be loaded');
      this.assets.set(k, data);
      this.keys.set(data, k);
      this.uploaded.add(k);
    }
    return { page: resolveRefs(doc.page, this.assets), anim: clone(doc.anim || {}), rev: doc.rev || 0 };
  }

  /** Resolve image references anywhere in a value (used for uploaded fonts in the project data). */
  async resolveAny(v) {
    const refs = collectRefs(v);
    for (const k of refs) {
      if (this.assets.has(k)) continue;
      const data = await fetchAsset(this.be, k);
      this.assets.set(k, data); this.keys.set(data, k); this.uploaded.add(k);
    }
    return resolveRefs(v, this.assets);
  }

  async metaFromDocResolved(d) {
    const m = this.metaFromDoc(d);
    m.fonts = await this.resolveAny(m.fonts);
    return m;
  }

  async fontsToWire(fonts) {
    const assets = new Map();
    const out = stripPage(fonts || [], this.keyOf, assets);
    await this.upload(assets);
    return out;
  }

  metaFromDoc(d) {
    return { order: (d.order || []).slice(), title: d.title || 'Untitled presentation', width: d.width || 1920, height: d.height || 1080, fonts: clone(d.fonts || []), objects: clone(d.objects || {}), settings: clone(d.settings || {}), notes: clone(d.notes || {}), owners: clone(d.owners || {}), rev: d.rev || 0, at: d.at || 0 };
  }

  // ---- loading ----------------------------------------------------------------
  /** Read the working copy. Returns { project, at } or null if this project has none yet. */
  async load() {
    const docs = await this.be.list(`${this.base}live`);
    const metaDoc = docs.find((d) => d.id === 'meta');
    if (!metaDoc) return null;
    const meta = await this.metaFromDocResolved(metaDoc.data);
    const slideDocs = new Map(docs.filter((d) => d.id.startsWith('s-')).map((d) => [d.id.slice(2), d.data]));
    const slides = [];
    for (const sid of meta.order) {
      const d = slideDocs.get(sid);
      if (!d) continue;
      const st = await this.resolve(d);
      this.bases.set(sid, { page: st.page, anim: st.anim, rev: st.rev });
      slides.push({ id: sid, page: clone(st.page), anim: clone(st.anim) });
    }
    // Slides listed but not stored (should not happen): keep the list consistent.
    meta.order = meta.order.filter((sid) => this.bases.has(sid));
    this.baseMeta = meta;
    const project = { version: 1, title: meta.title, width: meta.width, height: meta.height, fonts: meta.fonts, objects: dedupeNames(clone(meta.objects)), settings: clone(meta.settings || {}), notes: clone(meta.notes || {}), owners: clone(meta.owners || {}), slides };
    return { project, at: meta.at };
  }

  /** Create the working copy from a project (first open of a project, new project, import...). */
  async seed(project) {
    const ok = await this.be.lease(this.path('meta'), this.tab);
    if (!ok) throw new Error('Could not lock the project');
    const existing = await this.be.get(this.path('meta'));
    if (existing) return false; // someone else just created it
    for (const s of project.slides) {
      const w = this.toWire({ page: s.page, anim: s.anim });
      await this.upload(w.assets);
      await this.be.set(this.path('s-' + s.page.id), { v: 1, page: w.page, anim: w.anim, rev: 1, by: this.tab, at: Date.now() });
    }
    const meta = { v: 1, order: project.slides.map((s) => s.page.id), title: project.title, width: project.width, height: project.height, fonts: await this.fontsToWire(project.fonts), objects: project.objects || {}, settings: project.settings || {}, notes: project.notes || {}, owners: project.owners || {}, rev: 1, by: this.tab, at: Date.now() };
    await this.be.set(this.path('meta'), meta);
    return true;
  }

  async upload(assets) {
    for (const [k, data] of assets) {
      if (this.uploaded.has(k)) continue;
      await ensureAsset(this.be, k, data);
      this.uploaded.add(k);
    }
  }

  // ---- incoming ------------------------------------------------------------
  start() {
    this.unsub = this.be.watchCollection(`${this.base}live`, (changes) => {
      for (const ch of changes) {
        if (ch.type === 'removed' || !ch.data) continue;
        if (ch.id === 'moved') { // the project moved (new key): stop here, the app reopens it
          if (!this.closed && this.host.onMoved) this.host.onMoved();
          this.close();
          return;
        }
        this.queue.set(ch.id, ch.data);
      }
      this.drain();
    }, () => { this.failures++; this.refreshStatus(); });
  }

  async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.size && !this.closed) {
        // Meta first: it says which slides exist.
        const id = this.queue.has('meta') ? 'meta' : this.queue.keys().next().value;
        const data = this.queue.get(id);
        this.queue.delete(id);
        try {
          if (id === 'meta') await this.onRemoteMeta(data);
          else if (id.startsWith('s-')) await this.onRemoteSlide(id.slice(2), data);
        } catch (e) {
          // Could not apply (an image is not there yet): retry a bit later.
          setTimeout(() => { if (!this.queue.has(id)) { this.queue.set(id, data); this.drain(); } }, 1500);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  async onRemoteSlide(sid, doc) {
    const b0 = this.bases.get(sid);
    if (b0 && (doc.rev || 0) <= b0.rev) return; // already known (or our own write)
    const remote = await this.resolve(doc);
    const b = this.bases.get(sid);
    if (b && remote.rev <= b.rev) return;
    const local = this.host.getSlide(sid);
    let next = remote;
    if (local && b) {
      const ops = diffSlide(b, local);
      if (!slideOpsEmpty(ops)) { next = applySlide(remote, ops); this.schedule('s-' + sid); }
    }
    this.bases.set(sid, { page: remote.page, anim: remote.anim, rev: remote.rev });
    this.host.applySlide(sid, clone(next), { by: doc.by, who: doc.who || null });
  }

  async onRemoteMeta(doc) {
    if (this.baseMeta && (doc.rev || 0) <= this.baseMeta.rev) return;
    const remote = await this.metaFromDocResolved(doc);
    // Make sure every listed slide is known before showing the new list.
    const missing = remote.order.filter((sid) => !this.bases.has(sid));
    for (const sid of missing) {
      const d = await this.be.get(this.path('s-' + sid));
      if (d) await this.onRemoteSlide(sid, d);
    }
    const local = this.host.getMeta();
    let next = remote;
    if (this.baseMeta && local) {
      const ops = diffMeta(this.baseMeta, local);
      if (!metaOpsEmpty(ops)) { next = applyMeta(remote, ops); this.schedule('meta'); }
    }
    next.order = next.order.filter((sid) => this.bases.has(sid) || this.host.getSlide(sid));
    next.objects = dedupeNames(clone(next.objects));
    this.baseMeta = remote;
    this.host.applyMeta(clone(next), (sid) => this.bases.get(sid), { by: doc.by });
  }

  // ---- outgoing -------------------------------------------------------------
  slideChanged(sid) { if (sid) this.schedule('s-' + sid); }
  metaChanged() { this.schedule('meta'); }

  schedule(docKey) {
    if (this.closed || this.readOnly) return;
    const now = Date.now();
    const cur = this.timers.get(docKey);
    const first = cur ? cur.first : now;
    if (cur) clearTimeout(cur.t);
    const wait = Math.max(0, Math.min(DEBOUNCE, first + MAX_WAIT - now));
    const t = setTimeout(() => { this.timers.delete(docKey); this.flush(docKey); }, wait);
    this.timers.set(docKey, { t, first });
    this.refreshStatus();
  }

  /** Write everything pending now (before saving a version, switching project...). */
  async flushAll() {
    for (let round = 0; round < 6 && !this.readOnly; round++) {
      for (let i = 0; i < 80 && this.inflight.size; i++) await sleep(100);
      const keys = new Set([...this.timers.keys(), ...this.again]);
      if (!keys.size) break;
      for (const k of keys) { const cur = this.timers.get(k); if (cur) clearTimeout(cur.t); this.timers.delete(k); }
      this.again.clear();
      // Slides first so the list never names a slide that is not stored yet.
      const ordered = [...keys].sort((a, b) => (a === 'meta') - (b === 'meta'));
      for (const k of ordered) await this.flush(k);
    }
    this.refreshStatus();
  }

  async flush(docKey) {
    if (this.closed || this.readOnly) return;
    if (this.inflight.has(docKey)) { this.again.add(docKey); return; }
    this.inflight.add(docKey);
    this.refreshStatus();
    try {
      if (docKey === 'meta') await this.flushMeta();
      else await this.flushSlide(docKey.slice(2));
      this.failures = 0;
      this.bad.delete(docKey);
    } catch (e) {
      const code = e && e.code;
      if (code === 'not_granted' || code === 'revoked') {
        this.readOnly = true;
        this.host.onError(e, docKey);
      } else if (code === 'invalid_argument') {
        // Refused write: no permission, or the slide is too large to store. Retry once, then report.
        const n = (this.bad.get(docKey) || 0) + 1;
        this.bad.set(docKey, n);
        if (n < 2) setTimeout(() => this.schedule(docKey), 1500);
        else { this.host.onError(e, docKey); if (this.host.canWrite() === false) this.readOnly = true; }
      } else {
        this.failures++;
        const delay = code === 'busy' ? 300 : Math.min(30000, 1000 * Math.pow(2, Math.min(5, this.failures)));
        setTimeout(() => this.schedule(docKey), delay);
        if (code !== 'busy' && this.failures >= 2) this.host.onError(e, docKey);
      }
    } finally {
      this.inflight.delete(docKey);
      if (this.again.has(docKey)) { this.again.delete(docKey); this.schedule(docKey); }
      this.refreshStatus();
    }
  }

  async flushSlide(sid) {
    const local = this.host.getSlide(sid);
    if (!local) return; // slide removed here; the list update takes care of it
    const L0 = { page: clone(local.page), anim: clone(local.anim || {}) };
    const b = this.bases.get(sid);
    const ops = b ? diffSlide(b, L0) : null;
    if (ops && slideOpsEmpty(ops)) return;
    const w0 = this.toWire(L0);
    await this.upload(w0.assets);
    const path = this.path('s-' + sid);
    if (!(await this.be.lease(path, this.tab))) throw Object.assign(new Error('busy'), { code: 'busy' });
    const latestDoc = await this.be.get(path);
    let merged = L0;
    if (latestDoc && ops) merged = applySlide(await this.resolve(latestDoc), ops);
    const rev = ((latestDoc && latestDoc.rev) || 0) + 1;
    const w = this.toWire(merged);
    await this.upload(w.assets);
    if (!(await this.be.lease(path, this.tab))) throw Object.assign(new Error('busy'), { code: 'busy' });
    await this.be.set(path, { v: 1, page: w.page, anim: w.anim, rev, by: this.tab, who: this.host.who ? this.host.who() : null, at: Date.now() });
    this.bases.set(sid, { page: merged.page, anim: merged.anim, rev });
    // Keep edits made while we were writing, on top of what was written.
    const now = this.host.getSlide(sid);
    if (now) {
      const delta = diffSlide(L0, now);
      const next = slideOpsEmpty(delta) ? merged : applySlide(merged, delta);
      this.host.applySlide(sid, clone(next), { own: true });
      if (!slideOpsEmpty(delta)) this.schedule('s-' + sid);
    }
  }

  async flushMeta() {
    const local = this.host.getMeta();
    if (!local) return;
    // New slides must be stored before the list mentions them.
    for (const sid of local.order) if (!this.bases.has(sid) && this.host.getSlide(sid)) await this.flushSlide(sid);
    const L0 = clone(local);
    const ops = this.baseMeta ? diffMeta(this.baseMeta, L0) : null;
    if (ops && metaOpsEmpty(ops)) return;
    const path = this.path('meta');
    if (!(await this.be.lease(path, this.tab))) throw Object.assign(new Error('busy'), { code: 'busy' });
    const latestDoc = await this.be.get(path);
    let merged = L0;
    if (latestDoc && ops) merged = applyMeta(await this.metaFromDocResolved(latestDoc), ops);
    merged.objects = dedupeNames(clone(merged.objects || {}));
    const rev = ((latestDoc && latestDoc.rev) || 0) + 1;
    const at = Date.now();
    if (!(await this.be.lease(path, this.tab))) throw Object.assign(new Error('busy'), { code: 'busy' });
    const fontsWire = await this.fontsToWire(merged.fonts);
    await this.be.set(path, { v: 1, order: merged.order, title: merged.title, width: merged.width, height: merged.height, fonts: fontsWire, objects: merged.objects, settings: merged.settings || {}, notes: merged.notes || {}, owners: merged.owners || {}, rev, by: this.tab, at });
    this.baseMeta = { ...clone(merged), rev, at };
    const now = this.host.getMeta();
    if (now) {
      const delta = diffMeta(L0, now);
      const next = metaOpsEmpty(delta) ? merged : applyMeta(merged, delta);
      this.host.applyMeta(clone(next), (sid) => this.bases.get(sid), { own: true });
      if (!metaOpsEmpty(delta)) this.schedule('meta');
    }
  }

  close() {
    this.closed = true;
    for (const { t } of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.unsub) { try { this.unsub(); } catch (e) { /* ignore */ } }
  }
}
