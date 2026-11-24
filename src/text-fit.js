// Text boxes grow to fit their text.
//
// The editor draws a text box clipped to its height, so text typed past the bottom of the box
// (or made bigger with the size buttons) disappeared once you stopped editing. This watches the
// text on the open slide and makes a box taller when its text needs more room. It never makes a
// box smaller: layouts sometimes leave room on purpose.
import Konva from 'konva';
import { autorun } from 'mobx';

const WATCHED = ['text', 'width', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textTransform', 'padding', 'height', 'curveEnabled'];

function textNode(id) {
  for (const stage of Konva.stages || []) {
    const n = stage.findOne((x) => x.getClassName() === 'Text' && x.id() === id);
    if (n) return n;
  }
  return null;
}

/** Height the text needs at its current width, measured on the editor's own text node. */
function neededHeight(node) {
  const saved = node.getAttr('height');
  node.height('auto');
  const lines = (node.textArr && node.textArr.length) || 1;
  const h = lines * node.lineHeight() * node.fontSize() + 2 * (node.padding() || 0);
  node.height(saved === undefined ? 'auto' : saved);
  return h;
}

function fontReady(el) {
  try {
    return !document.fonts || document.fonts.check(`${el.fontStyle === 'italic' ? 'italic ' : ''}${el.fontWeight || 'normal'} ${Math.max(1, Math.round(el.fontSize))}px "${el.fontFamily}"`);
  } catch (e) {
    return true;
  }
}

function texts(children, out = []) {
  for (const el of children || []) {
    if (el.type === 'text') out.push(el);
    else if (el.children) texts(el.children, out);
  }
  return out;
}

/**
 * Start watching. `canEdit()` says whether changes may be written now (not while a slide is
 * loading, not for people who can only view).
 */
export function startTextFit(store, canEdit) {
  let timer = 0;
  const fit = () => {
    timer = 0;
    if (!canEdit()) return;
    const page = store.activePage;
    if (!page) return;
    for (const el of texts(page.children)) {
      if (el.curveEnabled || !el.text || !fontReady(el)) continue;
      const node = textNode(el.id);
      if (!node) continue;
      const need = Math.ceil(neededHeight(node));
      // The canvas drops any line that does not fit entirely, even by a fraction of a pixel.
      if (need > el.height + 0.01) el.set({ height: need });
    }
  };
  // Run after the canvas has drawn the change, so the text node has the new text.
  const later = () => { if (!timer) timer = setTimeout(fit, 60); };
  const stop = autorun(() => {
    const page = store.activePage;
    if (!page) return;
    for (const el of texts(page.children)) for (const k of WATCHED) void el[k];
    later();
  });
  const onFonts = () => later();
  try { document.fonts && document.fonts.addEventListener('loadingdone', onFonts); } catch (e) { /* ignore */ }
  return () => {
    stop();
    clearTimeout(timer);
    try { document.fonts && document.fonts.removeEventListener('loadingdone', onFonts); } catch (e) { /* ignore */ }
  };
}
