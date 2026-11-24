// Undo / redo for the whole presentation: object edits, slides added, deleted, duplicated or
// moved, layouts, themes, slide size, IDs and links, notes, owners…
//
// Each step stores the changes it made as "ops" (the same diff format live editing uses,
// src/sync-core.js), not a copy of the whole presentation. Undo applies the reverse ops to the
// presentation as it is now, so what collaborators changed in the meantime is kept.
// Changes arrive one by one; quick successive changes (dragging, typing) become one step.
import {
  clone, diffSlide, applySlide, slideOpsEmpty, diffMeta, applyMeta, metaOpsEmpty,
} from './sync-core';

const LIMIT = 200;
const QUIET_MS = 350;

const metaOf = (p) => ({
  order: p.slides.map((s) => s.id), title: p.title, width: p.width, height: p.height, fonts: p.fonts || [],
  objects: p.objects || {}, settings: p.settings || {}, notes: p.notes || {}, owners: p.owners || {},
});
const slideOf = (s) => ({ page: s.page, anim: s.anim || {} });
function snap(p) {
  return { meta: clone(metaOf(p)), slides: new Map(p.slides.map((s) => [s.id, clone(slideOf(s))])) };
}

function diff(A, B) {
  const slides = [];
  for (const [sid, a] of A.slides) {
    const b = B.slides.get(sid);
    if (!b) { slides.push({ sid, before: a, after: null }); continue; }
    const fwd = diffSlide(a, b);
    if (!slideOpsEmpty(fwd)) slides.push({ sid, fwd, inv: diffSlide(b, a) });
  }
  for (const [sid, b] of B.slides) if (!A.slides.has(sid)) slides.push({ sid, before: null, after: b });
  const fwd = diffMeta(A.meta, B.meta);
  if (!slides.length && metaOpsEmpty(fwd)) return null;
  return { slides, meta: { fwd, inv: diffMeta(B.meta, A.meta) } };
}

export class History {
  constructor(onChange = () => {}) {
    this.past = [];
    this.future = [];
    this.base = null;
    this.timer = 0;
    this.onChange = onChange;
  }

  get canUndo() { return this.past.length > 0 || !!this.timer; }
  get canRedo() { return this.future.length > 0 && !this.timer; }
  get pending() { return !!this.timer; }

  /** A presentation was opened: nothing to undo. */
  reset(p) {
    clearTimeout(this.timer);
    this.timer = 0;
    this.past = [];
    this.future = [];
    this.base = p ? snap(p) : null;
    this.onChange();
  }

  /** Something changed: it becomes a step once things are quiet for a moment. */
  schedule(getProject) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = 0; this.commit(getProject()); }, QUIET_MS);
    this.onChange();
  }

  /** Make what changed since the last step a step now. */
  commit(p) {
    clearTimeout(this.timer);
    this.timer = 0;
    if (!p) return;
    if (!this.base) { this.base = snap(p); return; }
    const now = snap(p);
    const step = diff(this.base, now);
    this.base = now;
    if (step) {
      this.past.push(step);
      if (this.past.length > LIMIT) this.past.shift();
      this.future = [];
    }
    this.onChange();
  }

  /**
   * The presentation changed in a way that is not a step of its own (a collaborator's edit, a text
   * box growing to fit its text). Anything of ours still waiting becomes a step first.
   */
  absorb(p, { keepPending = false } = {}) {
    if (this.timer && keepPending) return; // it will be part of the step that is waiting
    if (this.timer) this.commit(p);
    this.base = p ? snap(p) : null;
  }

  undo(p) { return this.move(p, 'undo'); }
  redo(p) { return this.move(p, 'redo'); }

  move(p, dir) {
    if (!p) return null;
    if (this.timer) this.commit(p);
    const from = dir === 'undo' ? this.past : this.future;
    const to = dir === 'undo' ? this.future : this.past;
    const step = from.pop();
    if (!step) return null;
    const res = apply(p, step, dir);
    to.push(step);
    this.base = snap(p);
    this.onChange();
    return res;
  }
}

/** Apply one step backwards (undo) or forwards (redo) to the presentation, in place. */
function apply(p, step, dir) {
  const back = dir === 'undo';
  const touched = [];
  const removed = [];
  for (const d of step.slides) {
    const idx = p.slides.findIndex((s) => s.id === d.sid);
    if (d.fwd) {
      if (idx < 0) continue; // deleted by someone else meanwhile
      const ns = applySlide(slideOf(p.slides[idx]), back ? d.inv : d.fwd);
      ns.page.id = d.sid;
      p.slides[idx] = { id: d.sid, page: ns.page, anim: ns.anim };
      touched.push(d.sid);
    } else {
      const want = back ? d.before : d.after;
      if (want) {
        const sl = { id: d.sid, page: { ...clone(want.page), id: d.sid }, anim: clone(want.anim || {}) };
        if (idx >= 0) p.slides[idx] = sl; else p.slides.push(sl);
        touched.push(d.sid);
      } else if (idx >= 0 && p.slides.length > 1) {
        p.slides.splice(idx, 1);
        removed.push(d.sid);
      }
    }
  }
  const m = applyMeta(metaOf(p), back ? step.meta.inv : step.meta.fwd);
  const byId = new Map(p.slides.map((s) => [s.id, s]));
  const listed = new Set(m.order);
  const ordered = m.order.filter((id) => byId.has(id)).map((id) => byId.get(id));
  for (const s of p.slides) if (!listed.has(s.id)) ordered.push(s);
  if (ordered.length) p.slides = ordered;
  p.title = m.title;
  p.width = m.width;
  p.height = m.height;
  p.fonts = m.fonts;
  p.objects = m.objects;
  p.settings = m.settings;
  p.notes = m.notes;
  p.owners = m.owners;
  const orderChanged = !!(step.meta.fwd.order && (step.meta.fwd.order.ins.length || step.meta.fwd.order.del.length));
  return { touched, removed, orderChanged, sizeChanged: 'width' in step.meta.fwd.fields || 'height' in step.meta.fwd.fields };
}
