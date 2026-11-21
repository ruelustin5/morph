// Shows collaborators on the canvas: their cursor, what they have selected, and the objects they are
// dragging, live. Movement is shown by moving the canvas shape only (not the document), so the
// document itself only ever changes through the merged, saved versions.

const TRANSIENT_RESET_MS = 2500;
const LIVE_CLEAR_MS = 900;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class CollabOverlay {
  constructor(c, host) {
    this.c = c;
    this.host = host;
    this.raf = 0;
    this.transient = new Map(); // element id -> last time a collaborator moved it
    this.curPending = null;
    this.curRaf = 0;
    this.livePending = null;
    this.liveRaf = 0;
    this.liveTimer = 0;
    this.layer = document.createElement('div');
    this.layer.className = 'collab-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    host.appendChild(this.layer);
    this.onMove = this.onMove.bind(this);
    this.onLeave = this.onLeave.bind(this);
    host.addEventListener('pointermove', this.onMove, true);
    host.addEventListener('pointerleave', this.onLeave, true);
    c.onPeersChange = () => this.kick();
    c.onLocalEdit = (prev, page) => this.publishLive(prev, page);
    this.kick();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.host.removeEventListener('pointermove', this.onMove, true);
    this.host.removeEventListener('pointerleave', this.onLeave, true);
    this.layer.remove();
    if (this.c.onPeersChange) this.c.onPeersChange = null;
    if (this.c.onLocalEdit) this.c.onLocalEdit = null;
  }

  // ---- geometry ---------------------------------------------------------------
  stage() {
    const K = window.Konva;
    if (!K || !K.stages) return null;
    return K.stages.find((s) => { try { return this.host.contains(s.container()); } catch (e) { return false; } }) || null;
  }

  xf() {
    const st = this.stage();
    if (!st) return null;
    const ec = st.findOne('.elements-container');
    if (!ec) return null;
    const t = ec.getAbsoluteTransform().copy();
    const r = st.container().getBoundingClientRect();
    const inv = t.copy().invert();
    return {
      st,
      toScreen: (x, y) => { const p = t.point({ x, y }); return { x: r.left + p.x, y: r.top + p.y }; },
      toPage: (sx, sy) => inv.point({ x: sx - r.left, y: sy - r.top }),
    };
  }

  workspaceRect() {
    const w = this.host.querySelector('.raeditor-workspace-inner');
    return w ? w.getBoundingClientRect() : null;
  }

  // ---- my cursor ----------------------------------------------------------------
  onMove(e) {
    if (!this.c.room) return;
    const wr = this.workspaceRect();
    const inside = wr && e.clientX >= wr.left && e.clientX <= wr.right && e.clientY >= wr.top && e.clientY <= wr.bottom;
    let cur = null;
    if (inside) { const x = this.xf(); if (x) { const p = x.toPage(e.clientX, e.clientY); cur = [Math.round(p.x), Math.round(p.y)]; } }
    this.sendCursor(cur);
  }
  onLeave() { this.sendCursor(null); }
  sendCursor(cur) {
    this.curPending = cur;
    if (this.curRaf) return;
    this.curRaf = requestAnimationFrame(() => {
      this.curRaf = 0;
      const v = this.curPending;
      if (JSON.stringify(v) === JSON.stringify(this.curSent)) return;
      this.curSent = v;
      if (this.c.room) this.c.room.presence({ cur: v }).catch(() => {});
    });
  }

  // ---- my live drag ---------------------------------------------------------------
  publishLive(prev, page) {
    if (!this.c.room || !prev || !page) return;
    const sel = new Set();
    const leafs = (el) => { if (el.type === 'group') (el.children || []).forEach(leafs); else sel.add(el.id); };
    (this.c.store.selectedElements || []).forEach((el) => leafs(el));
    if (!sel.size) return;
    const index = (p) => { const m = new Map(); const w = (ch) => { for (const el of ch || []) { m.set(el.id, el); if (el.children) w(el.children); } }; w(p.children); return m; };
    const a = index(prev), b = index(page);
    const els = {};
    let any = false;
    for (const id of sel) {
      const x = a.get(id), y = b.get(id);
      if (!x || !y) continue;
      if (x.x !== y.x || x.y !== y.y || (x.rotation || 0) !== (y.rotation || 0)) {
        els[id] = [Math.round(y.x * 10) / 10, Math.round(y.y * 10) / 10, Math.round((y.rotation || 0) * 10) / 10];
        any = true;
      }
    }
    if (!any) return;
    this.livePending = { sid: page.id, els };
    if (!this.liveRaf) {
      this.liveRaf = requestAnimationFrame(() => {
        this.liveRaf = 0;
        if (this.livePending && this.c.room) this.c.room.presence({ live: this.livePending }).catch(() => {});
      });
    }
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => { this.livePending = null; if (this.c.room) this.c.room.presence({ live: null }).catch(() => {}); }, LIVE_CLEAR_MS);
  }

  // ---- drawing ----------------------------------------------------------------------
  peersHere() {
    const c = this.c;
    if (!c.project) return [];
    const sid = c.activeSlideId();
    return c.othersIn(c.projectId).filter((p) => p.presence.slide === sid);
  }

  kick() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.raf = 0;
    const peers = this.peersHere();
    const x = this.xf();
    const now = Date.now();
    const mine = new Set(this.c.store.selectedElementsIds || []);
    let moved = false;
    // Collaborators' drags: move the canvas shapes.
    if (x) {
      for (const p of peers) {
        const live = p.presence.live;
        if (!live || live.sid !== this.c.activeSlideId() || !live.els) continue;
        for (const [id, g] of Object.entries(live.els)) {
          if (mine.has(id) || !Array.isArray(g)) continue;
          const node = x.st.findOne('#' + id);
          if (!node) continue;
          if (node.x() !== g[0] || node.y() !== g[1] || node.rotation() !== g[2]) {
            node.x(g[0]); node.y(g[1]); node.rotation(g[2]);
            moved = true;
          }
          this.transient.set(id, now);
        }
      }
      // A drag that stopped: put shapes back to the document's values (the merged version has arrived by now).
      for (const [id, t] of this.transient) {
        if (now - t < TRANSIENT_RESET_MS) continue;
        this.transient.delete(id);
        const node = x.st.findOne('#' + id);
        const el = this.c.store.getElementById(id);
        if (node && el && el.type !== 'group') { node.x(el.x); node.y(el.y); node.rotation(el.rotation || 0); moved = true; }
      }
      if (moved) x.st.batchDraw();
    }
    this.draw(peers, x);
    if (peers.length || this.transient.size) this.raf = requestAnimationFrame(() => this.frame());
  }

  boxOf(el, x) {
    if (!el) return null;
    if (el.type === 'group') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const walk = (e) => {
        if (e.type === 'group') { (e.children || []).forEach(walk); return; }
        for (const p of this.corners(e)) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
      };
      walk(el);
      if (!isFinite(minX)) return null;
      return [x.toScreen(minX, minY), x.toScreen(maxX, minY), x.toScreen(maxX, maxY), x.toScreen(minX, maxY)];
    }
    return this.corners(el).map((p) => x.toScreen(p.x, p.y));
  }

  corners(el) {
    const node = this.stageNode(el.id);
    const ex = node ? node.x() : el.x, ey = node ? node.y() : el.y, rot = node ? node.rotation() : (el.rotation || 0);
    const w = el.width || 0, h = el.height || 0;
    const r = (rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    return [[0, 0], [w, 0], [w, h], [0, h]].map(([dx, dy]) => ({ x: ex + dx * cos - dy * sin, y: ey + dx * sin + dy * cos }));
  }

  stageNode(id) {
    const st = this._st || (this._st = this.stage());
    try { return st ? st.findOne('#' + id) : null; } catch (e) { return null; }
  }

  draw(peers, x) {
    this._st = x ? x.st : null;
    if (!peers.length || !x) { if (this.layer.innerHTML) this.layer.innerHTML = ''; return; }
    const hr = this.host.getBoundingClientRect();
    const wr = this.workspaceRect() || hr;
    this.layer.style.clipPath = `inset(${Math.max(0, wr.top - hr.top)}px ${Math.max(0, hr.right - wr.right)}px ${Math.max(0, hr.bottom - wr.bottom)}px ${Math.max(0, wr.left - hr.left)}px)`;
    let svg = '';
    let html = '';
    for (const p of peers) {
      const person = this.c.personOf(p);
      const color = person.color || '#8f99a8';
      const name = esc(person.name);
      for (const id of (p.presence.sel || []).slice(0, 40)) {
        const el = this.c.store.getElementById(id);
        const pts = this.boxOf(el, x);
        if (!pts) continue;
        const rel = pts.map((q) => `${(q.x - hr.left).toFixed(1)},${(q.y - hr.top).toFixed(1)}`).join(' ');
        svg += `<polygon points="${rel}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
        const top = pts.reduce((m, q) => (q.y < m.y || (q.y === m.y && q.x < m.x) ? q : m), pts[0]);
        html += `<div class="collab-tag" style="left:${(top.x - hr.left).toFixed(1)}px;top:${(top.y - hr.top - 20).toFixed(1)}px;background:${color}">${name}</div>`;
      }
      const cur = p.presence.cur;
      if (Array.isArray(cur)) {
        const q = x.toScreen(cur[0], cur[1]);
        const lx = q.x - hr.left, ly = q.y - hr.top;
        html += `<div class="collab-cursor" style="transform:translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)">` +
          `<svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1 L1 16 L5.2 12.2 L8.2 19 L11 17.8 L8 11.2 L14 11.2 Z" fill="${color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>` +
          `<span style="background:${color}">${name}</span></div>`;
      }
    }
    this.layer.innerHTML = `<svg class="collab-svg" width="${hr.width}" height="${hr.height}">${svg}</svg>${html}`;
  }
}
