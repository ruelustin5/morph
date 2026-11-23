import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, NumericInput, Switch } from '@blueprintjs/core';
import { useController } from './hooks';
import { t } from '../i18n';

// Common slide shapes. Sizes are in pixels; the ratio is what matters on screen.
const PRESETS = [
  { name: 'Widescreen', ratio: '16:9', w: 1920, h: 1080 },
  { name: 'Standard', ratio: '4:3', w: 1440, h: 1080 },
  { name: 'Wide laptop', ratio: '16:10', w: 1920, h: 1200 },
  { name: 'A4 paper', ratio: '√2:1', w: 1754, h: 1240 },
  { name: 'Square', ratio: '1:1', w: 1080, h: 1080 },
  { name: 'Phone', ratio: '9:16', w: 1080, h: 1920 },
];

function Shape({ w, h }) {
  const k = 34 / Math.max(w, h);
  return <span className="size-shape" style={{ width: Math.round(w * k), height: Math.round(h * k) }} />;
}

export function SlideSizeDialog({ c }) {
  useController(c);
  const open = !!c.ui.slideSize && !!c.project;
  const p = c.project;
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [fit, setFit] = useState(true);
  useEffect(() => { if (open) { setW(p.width); setH(p.height); setFit(true); } }, [open]);
  const close = () => c.setUi({ slideSize: false });
  const same = open && w === p.width && h === p.height;
  const n = open ? p.slides.length : 0;
  return (
    <Dialog isOpen={open} onClose={close} title={t('Slide size')} icon="fullscreen" className="size-dialog">
      {open && (
        <>
          <DialogBody>
            <p className="size-note">{n === 1 ? t('This changes the size of the slide.') : t('This changes the size of all {n} slides.', { n })}</p>
            <div className="size-presets">
              {PRESETS.map((x) => (
                <button key={x.name} type="button" className={'size-preset' + (w === x.w && h === x.h ? ' on' : '')} onClick={() => { setW(x.w); setH(x.h); }}>
                  <span className="size-box"><Shape w={x.w} h={x.h} /></span>
                  <span className="size-name">{t(x.name)}</span>
                  <span className="size-ratio">{x.ratio}</span>
                </button>
              ))}
            </div>
            <div className="size-custom">
              <label>{t('Width')}<NumericInput value={w} min={200} max={8000} stepSize={10} majorStepSize={100} onValueChange={(v) => Number.isFinite(v) && setW(Math.round(v))} fill /></label>
              <span className="size-x">×</span>
              <label>{t('Height')}<NumericInput value={h} min={200} max={8000} stepSize={10} majorStepSize={100} onValueChange={(v) => Number.isFinite(v) && setH(Math.round(v))} fill /></label>
              <span className="size-unit">px</span>
            </div>
            <Switch checked={fit} onChange={(e) => setFit(e.target.checked)} label={t('Scale what is on the slides to fit the new size')} />
            {!fit && <p className="size-warn">{t('Objects keep their place and size, so some may end up outside the slide.')}</p>}
          </DialogBody>
          <DialogFooter actions={<>
            <Button text={t('Cancel')} onClick={close} />
            <Button intent="primary" text={t('Apply to all slides')} disabled={same || w < 200 || h < 200} onClick={() => { c.setSlideSize(w, h, fit); close(); }} />
          </>} />
        </>
      )}
    </Dialog>
  );
}
