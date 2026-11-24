// Copy, cut and paste objects (Ctrl+C / Ctrl+X / Ctrl+V and the right-click menu).
//
// Pasting on another slide of the same presentation keeps the object's ID when that slide does
// not have it yet: the pasted object is "the same object", so it morphs, as in PowerPoint and
// Keynote. Pasting on the same slide (or a second time) gives it a new ID.
// The copied objects are kept here and in localStorage (other tabs and presentations), and the
// system clipboard gets their text, so it can be pasted in other apps too.
import { t } from './i18n';

const KEY = 'morph-clipboard';
const MIME = 'application/x-morph';
let mem = null;
let pendingCopy = null; // set by Ctrl+C until the browser's copy event fills the system clipboard

const clone = (x) => JSON.parse(JSON.stringify(x));
const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));
const ids = (el, out = []) => { if (el.id) out.push(el.id); for (const ch of el.children || []) ids(ch, out); return out; };
const plainText = (els) => {
  const out = [];
  const walk = (list) => { for (const el of list) { if (el.type === 'text' && el.text) out.push(String(el.text).replace(/<[^>]*>/g, '')); if (el.children) walk(el.children); } };
  walk(els);
  return out.join('\n');
};

export function readClip() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (!mem || d.at >= mem.at) return d;
    }
  } catch (e) { /* ignore */ }
  return mem;
}
export const hasClip = () => { const d = readClip(); return !!(d && d.els && d.els.length); };

/** Copy the selected objects. With cut, they are removed afterwards. Returns how many. */
export function copyObjects(c, store, { cut = false } = {}) {
  const sel = store.selectedElements || [];
  if (!sel.length) return 0;
  const els = sel.map((el) => el.toJSON());
  const names = {};
  if (c.project) for (const el of els) for (const id of ids(el)) if (c.project.objects[id]) names[id] = c.project.objects[id].name;
  const d = {
    v: 1, at: Date.now(), token: Math.random().toString(36).slice(2), project: c.projectId || null,
    slide: c.activeSlideId(), w: store.width, h: store.height, els, names, text: plainText(els),
  };
  mem = d;
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ } }
  pendingCopy = d;
  setTimeout(() => { if (pendingCopy === d) pendingCopy = null; }, 400);
  if (cut) {
    const del = sel.filter((el) => el.removable).map((el) => el.id);
    if (del.length) store.deleteElements(del);
  }
  return els.length;
}

/** Paste the copied objects on the open slide. */
export function pasteObjects(c, store, d = readClip()) {
  const page = store.activePage;
  if (!page || !d || !d.els || !d.els.length || c.canWrite === false) return [];
  const here = new Set();
  const walk = (list) => { for (const el of list || []) { here.add(el.id); walk(el.children); } };
  walk(page.children);
  const sameProject = !!c.project && d.project === (c.projectId || null);
  const sameSlide = sameProject && d.slide === c.activeSlideId();
  const els = clone(d.els);
  // From a presentation of another size: keep it on the slide.
  const k = d.w && d.w !== store.width ? store.width / d.w : 1;
  const off = sameSlide ? Math.round(store.width / 40) : 0;
  const kept = [];
  const strip = (el) => { delete el.id; for (const ch of el.children || []) strip(ch); };
  const move = (el) => {
    if (el.type === 'group') { for (const ch of el.children || []) move(ch); return; }
    el.x = el.x * k + off; el.y = el.y * k + off;
    if (k !== 1) { el.width *= k; el.height *= k; if (el.fontSize) el.fontSize *= k; }
  };
  for (const el of els) {
    const all = ids(el);
    const keep = sameProject && !sameSlide && all.every((id) => !here.has(id) && c.project.objects[id]);
    if (keep) { for (const id of all) here.add(id); kept.push(...all.filter((id) => !(el.type === 'group' && id === el.id))); } else strip(el);
    move(el);
  }
  const added = [];
  store.history.transaction(() => {
    for (const el of els) { const a = page.addElement(el); if (a) added.push(a.id); }
  });
  store.selectElements(added);
  d.slide = c.activeSlideId(); // pasting again here gives a copy next to it
  mem = { ...d };
  // Say when the pasted object is the same object as on the slide next to it (it morphs).
  const i = c.active, sid = c.activeSlideId();
  const near = kept.filter((id) => [i - 1, i + 1].some((j) => c.project.slides[j] && c.slidesWith(id).includes(j)));
  if (near.length) {
    const names = near.map((id) => c.project.objects[id] && c.project.objects[id].name).filter(Boolean);
    const j = c.slidesWith(near[0]).filter((x) => x !== i).sort((a, b) => Math.abs(a - i) - Math.abs(b - i))[0];
    c.toast(names.length === 1
      ? t('{name} is also on slide {k}, so it morphs between the two.', { name: names[0], k: j + 1 })
      : t('These objects are also on slide {k}, so they morph between the two.', { k: j + 1 }), 'primary', {
      timeout: 7000,
      action: { text: t('Make separate'), onClick: () => { if (c.activeSlideId() === sid) for (const id of near) c.dissociate(id); } },
    });
  }
  return added;
}

/** Text from another app becomes a new text box in the theme's body style. */
function pasteText(c, store, text) {
  const page = store.activePage;
  if (!page || c.canWrite === false) return;
  const st = c.currentStyle();
  const w = Math.round(store.width * 0.6);
  const size = Math.round(store.width / 40);
  const el = page.addElement({
    type: 'text', text: text.slice(0, 5000), x: Math.round((store.width - w) / 2), y: Math.round(store.height * 0.4), width: w,
    fontSize: size, fontFamily: st.body, fontWeight: 'normal', fill: st.text, lineHeight: 1.3,
  });
  if (el) store.selectElements([el.id]);
}

/**
 * Keyboard and clipboard events. `ok()` says whether the editor canvas is the place being used
 * (not a dialog, a panel or the slide list). Returns a function that removes the listeners.
 */
export function startClipboard(c, store, ok) {
  let waiting = 0;
  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (editable(document.activeElement) || !ok()) return;
    const k = e.code;
    if (k === 'KeyC' || k === 'KeyX') {
      if (!(store.selectedElements || []).length) return;
      const sel = window.getSelection && window.getSelection();
      if (sel && String(sel).trim()) return; // text selected on the page: the browser copies it
      copyObjects(c, store, { cut: k === 'KeyX' && c.canWrite !== false });
      e.stopImmediatePropagation(); // not the editor's own copy
    } else if (k === 'KeyV') {
      e.stopImmediatePropagation();
      // The browser's paste event normally follows; if it does not (some embedded pages), paste anyway.
      clearTimeout(waiting);
      waiting = setTimeout(() => { waiting = 0; pasteObjects(c, store); }, 150);
    }
  };
  const onCopy = (e) => {
    const d = pendingCopy;
    if (!d || editable(document.activeElement)) return;
    pendingCopy = null;
    try {
      if (d.text) e.clipboardData.setData('text/plain', d.text);
      e.clipboardData.setData(MIME, d.token);
      e.preventDefault();
    } catch (err) { /* the copy stays in this app only */ }
  };
  const onPaste = (e) => {
    clearTimeout(waiting);
    waiting = 0;
    if (editable(document.activeElement)) return;
    if (!ok()) { e.stopImmediatePropagation(); return; }
    const cd = e.clipboardData;
    const d = readClip();
    const marker = cd ? cd.getData(MIME) : '';
    const text = cd ? cd.getData('text/plain') : '';
    const image = cd && Array.from(cd.items || []).some((it) => it.type && it.type.startsWith('image/'));
    if (d && marker && marker === d.token) { e.preventDefault(); e.stopImmediatePropagation(); pasteObjects(c, store, d); return; }
    if (image) return; // the editor puts pictures on the slide
    e.preventDefault();
    e.stopImmediatePropagation();
    if (text && text.trim() && (!d || text !== d.text)) { pasteText(c, store, text); return; }
    if (d) pasteObjects(c, store, d);
  };
  // Capture on window: runs before the editor's own handlers, which are on window too.
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('copy', onCopy, true);
  window.addEventListener('cut', onCopy, true);
  window.addEventListener('paste', onPaste, true);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('copy', onCopy, true);
    window.removeEventListener('cut', onCopy, true);
    window.removeEventListener('paste', onPaste, true);
  };
}
