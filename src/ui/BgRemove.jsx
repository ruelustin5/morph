import React from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Dialog, DialogBody, DialogFooter, Icon, ProgressBar, Tooltip } from '@blueprintjs/core';
import { useController } from './hooks';
import { t } from '../i18n';
import { TARGET } from '../controller';
import { removeBackground, isDownloaded } from '../bg-remove';

// Remove background (web version only): a button in the picture toolbar and the right-click menu.
// The first time it asks before downloading the remover; then it runs at once.

export const bgRemoveAvailable = () => TARGET === 'web';

/** The pictures this would apply to: one picture selected. */
export const bgTarget = (store) => {
  const sel = store.selectedElements || [];
  return sel.length === 1 && sel[0].type === 'image' && !sel[0].locked ? sel[0] : null;
};

function findInPage(children, id) {
  for (const el of children || []) {
    if (el.id === id) return el;
    const x = findInPage(el.children, id);
    if (x) return x;
  }
  return null;
}

/**
 * Where the picture goes after its empty edges are trimmed: the part still visible (the old crop
 * ∩ the subject's box), placed where it was on the slide. Works with crops, rotation and flips.
 */
export function placeCutout(el, box) {
  const V = { x0: el.cropX || 0, y0: el.cropY || 0 };
  V.x1 = V.x0 + (el.cropWidth == null ? 1 : el.cropWidth);
  V.y1 = V.y0 + (el.cropHeight == null ? 1 : el.cropHeight);
  const B = { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h };
  const I = { x0: Math.max(V.x0, B.x0), y0: Math.max(V.y0, B.y0), x1: Math.min(V.x1, B.x1), y1: Math.min(V.y1, B.y1) };
  if (I.x1 - I.x0 <= 1e-4 || I.y1 - I.y0 <= 1e-4) return null; // the subject is outside the visible part
  const vw = V.x1 - V.x0, vh = V.y1 - V.y0;
  // Offset of the kept part inside the element, before rotation (mirrored when flipped).
  const dx = ((el.flipX ? V.x1 - I.x1 : I.x0 - V.x0) / vw) * el.width;
  const dy = ((el.flipY ? V.y1 - I.y1 : I.y0 - V.y0) / vh) * el.height;
  const r = ((el.rotation || 0) * Math.PI) / 180;
  const bw = B.x1 - B.x0, bh = B.y1 - B.y0;
  return {
    x: el.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: el.y + dx * Math.sin(r) + dy * Math.cos(r),
    width: ((I.x1 - I.x0) / vw) * el.width,
    height: ((I.y1 - I.y0) / vh) * el.height,
    cropX: (I.x0 - B.x0) / bw,
    cropY: (I.y0 - B.y0) / bh,
    cropWidth: (I.x1 - I.x0) / bw,
    cropHeight: (I.y1 - I.y0) / bh,
  };
}

let busy = false;

/** Remove the background of picture `id` (asks first when the remover is not downloaded yet). */
export async function startBgRemove(c, store, id, { asked = false } = {}) {
  if (busy || c.canWrite === false) return;
  if (!asked && !(await isDownloaded())) { c.setUi({ bgAsk: id }); return; }
  const el0 = store.getElementById(id);
  if (!el0 || el0.type !== 'image') return;
  const slideId = c.activeSlideId();
  const src = el0.src;
  busy = true;
  c.setUi({ bg: { id, step: 'download', p: 0 } });
  try {
    const res = await removeBackground(src, (step, p) => c.setUi({ bg: { id, step, p } }));
    if (res.empty) { c.toast(t('No subject found in this picture: nothing was removed.'), 'warning'); return; }
    // Apply to the picture where it is now (it may have moved, or another slide may be open).
    const live = store.getElementById(id);
    if (live && live.src === src) {
      const place = placeCutout(live, res.box);
      if (!place) { c.toast(t('The subject is outside the visible part of this picture.'), 'warning'); return; }
      live.set({ src: res.src, ...place });
    } else {
      const sl = c.project && c.project.slides.find((s) => s.id === slideId);
      const el = sl && findInPage(sl.page.children, id);
      if (!el || el.src !== src) return; // changed or deleted meanwhile
      const place = placeCutout(el, res.box);
      if (!place) return;
      Object.assign(el, { src: res.src }, place);
      c.liveTouch([slideId]);
      c.markDirty();
      c.emit();
    }
    c.toast(t('Background removed. Ctrl+Z puts it back.'), 'success');
  } catch (e) {
    const code = e && e.code;
    c.toast(code === 'tainted'
      ? t('This picture’s website does not allow changing it. Download it and add it with Upload.')
      : code === 'download'
        ? t('The background remover could not be downloaded. Check your connection and try again.')
        : code === 'image'
          ? t('This picture could not be read.')
          : t('The background could not be removed: {e}', { e: (e && e.message) || String(e) }), 'danger');
  } finally {
    busy = false;
    c.setUi({ bg: null });
  }
}

/** Button in the picture toolbar. */
export function makeBgButton(c) {
  return observer(function ImageBackgroundRemover({ store }) {
    useController(c);
    const el = bgTarget(store);
    if (!el || !bgRemoveAvailable() || c.canWrite === false) return null;
    const running = !!(c.ui.bg && c.ui.bg.id === el.id);
    return (
      <Tooltip content={t('Keep only the subject of the picture')} placement="bottom" compact>
        <Button minimal icon="clean" text={t('Remove background')} loading={running} disabled={!!c.ui.bg && !running}
          onClick={() => startBgRemove(c, store, el.id)} />
      </Tooltip>
    );
  });
}

/** First time: ask before the big download. */
export function BgRemoveDialog({ c, store }) {
  useController(c);
  const id = c.ui.bgAsk;
  const close = () => c.setUi({ bgAsk: null });
  return (
    <Dialog isOpen={!!id} onClose={close} title={t('Remove backgrounds')} icon="clean" className="bg-dialog">
      <DialogBody>
        <p>{t('Morph removes backgrounds on your computer: your pictures are never sent anywhere.')}</p>
        <p>{t('The first time, it downloads the background remover (about 90 MB). After that it starts at once, even offline.')}</p>
      </DialogBody>
      <DialogFooter actions={<>
        <Button text={t('Cancel')} onClick={close} />
        <Button intent="primary" icon="download" text={t('Download and remove')} onClick={() => { close(); startBgRemove(c, store, id, { asked: true }); }} />
      </>} />
    </Dialog>
  );
}

/** Progress while it works. */
export function BgRemoveStatus({ c }) {
  useController(c);
  const s = c.ui.bg;
  if (!s) return null;
  const dl = s.step === 'download';
  return (
    <div className="bg-status" role="status" aria-live="polite">
      <Icon icon="clean" size={14} />
      <span>{dl ? t('Downloading the background remover… {p}%', { p: Math.round((s.p || 0) * 100) }) : t('Removing the background…')}</span>
      <ProgressBar value={dl ? s.p || 0 : undefined} animate={!dl} stripes={!dl} intent="primary" />
    </div>
  );
}
