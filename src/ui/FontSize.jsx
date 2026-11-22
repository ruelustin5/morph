import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Menu, MenuItem, Popover, Tooltip } from '@blueprintjs/core';
import { t } from '../i18n';

// Sizes the − / + buttons step through (in slide pixels).
export const SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128, 144, 160, 200, 240, 300, 400];

export function stepSize(v, dir) {
  if (dir > 0) return SIZES.find((s) => s > v + 0.01) || Math.round(v * 1.25);
  const below = SIZES.filter((s) => s < v - 0.01);
  return below.length ? below[below.length - 1] : Math.max(5, Math.round(v * 0.8));
}

/** Font size: − [value] + with a list of common sizes. Replaces the editor's number box. */
export const TextFontSize = observer(({ elements, store }) => {
  const cur = Math.round(elements[0].fontSize);
  const [draft, setDraft] = useState(String(cur));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(cur)); }, [cur, editing]);
  const apply = (v) => {
    const n = Math.max(5, Math.min(4 * store.height, Math.round(v)));
    if (!Number.isFinite(n)) return;
    store.history.transaction(() => { elements.forEach((el) => el.set({ fontSize: n, width: Math.max(n, el.width) })); });
  };
  const commit = () => { setEditing(false); const v = parseFloat(draft); if (Number.isFinite(v) && v !== cur) apply(v); else setDraft(String(cur)); };
  const step = (dir) => apply(stepSize(elements[0].fontSize, dir));
  return (
    <div className="fs-box" role="group" aria-label={t('Font size')}>
      <Tooltip content={t('Smaller')} compact placement="bottom">
        <button type="button" className="fs-step" aria-label={t('Smaller')} onClick={() => step(-1)}>−</button>
      </Tooltip>
      <Popover minimal placement="bottom" autoFocus={false} enforceFocus={false} popoverClassName="fs-menu"
        content={<Menu>{SIZES.filter((s) => s <= 4 * store.height).map((s) => (
          <MenuItem key={s} text={String(s)} active={s === cur} onClick={() => apply(s)} />
        ))}</Menu>}>
        <input className="fs-input" inputMode="numeric" aria-label={t('Font size')} value={draft}
          onFocus={(e) => { setEditing(true); e.target.select(); }}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); e.target.blur(); }
            else if (e.key === 'Escape') { setEditing(false); setDraft(String(cur)); e.target.blur(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
            e.stopPropagation();
          }} />
      </Popover>
      <Tooltip content={t('Bigger')} compact placement="bottom">
        <button type="button" className="fs-step" aria-label={t('Bigger')} onClick={() => step(1)}>+</button>
      </Tooltip>
    </div>
  );
});

export default TextFontSize;
