import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Icon, InputGroup, Popover } from '@blueprintjs/core';
import { FixedSizeList } from 'react-window';
import { globalFonts } from 'opn/utils/fonts';
import ALL from '../google-fonts.json';

// Well-known families shown first.
export const CLASSICS = [
  'Roboto', 'Open Sans', 'Inter', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Work Sans', 'DM Sans', 'Raleway', 'Source Sans 3', 'Noto Sans', 'Manrope', 'Outfit',
  'Playfair Display', 'Merriweather', 'Lora', 'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond', 'Crimson Pro', 'PT Serif', 'Noto Serif',
  'Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Abril Fatface', 'Lobster', 'Righteous',
  'Caveat', 'Pacifico', 'Dancing Script', 'Amatic SC', 'Permanent Marker', 'Indie Flower',
  'Roboto Mono', 'JetBrains Mono', 'Fira Code', 'Space Mono', 'IBM Plex Mono',
];
const CAT = Object.fromEntries(ALL);
const CATS = [['all', 'All'], ['s', 'Sans'], ['r', 'Serif'], ['d', 'Display'], ['h', 'Script'], ['m', 'Mono']];
const ROW = 34;

function FontRow({ fam, active, store, onPick, style }) {
  useEffect(() => { if (!store.fonts.find((f) => f.fontFamily === fam)) store.loadFont(fam); }, [fam]);
  return (
    <button type="button" style={style} className={'fp-row' + (active ? ' is-active' : '')} onClick={() => onPick(fam)} title={fam}>
      <span className="fp-name" style={{ fontFamily: `"${fam}", system-ui` }}>{fam}</span>
      {active && <Icon icon="tick" size={14} />}
    </button>
  );
}

function FontList({ store, current, onPick }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const inputRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 30); return () => clearTimeout(t); }, []);
  const custom = [...store.fonts, ...globalFonts].map((f) => f.fontFamily);
  const used = [];
  store.find((el) => { if (el.type === 'text' && el.fontFamily && !used.includes(el.fontFamily)) used.push(el.fontFamily); return false; });
  const rows = useMemo(() => {
    const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
    const nq = norm(q);
    const okCat = (f) => cat === 'all' || CAT[f] === cat;
    const match = (f) => !nq || norm(f).includes(nq);
    const out = [];
    const section = (label, list) => {
      const l = list.filter((f) => match(f) && (okCat(f) || (!CAT[f] && cat === 'all')));
      if (!l.length) return;
      if (label) out.push({ h: label, n: l.length });
      l.forEach((f) => out.push({ f }));
    };
    if (!nq && cat === 'all') {
      section('In this deck', [...new Set([...used, ...custom])]);
      section('Classics', CLASSICS.filter((f) => !used.includes(f)));
      section('All Google Fonts', ALL.map((x) => x[0]));
    } else {
      const seen = new Set();
      const merged = [...custom, ...CLASSICS, ...ALL.map((x) => x[0])].filter((f) => (seen.has(f) ? false : seen.add(f)));
      section(null, merged);
    }
    return out;
  }, [q, cat, used.join('|'), custom.join('|')]);
  return (
    <div className="fp">
      <InputGroup inputRef={inputRef} leftIcon="search" placeholder="Search 1,800+ fonts" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const first = rows.find((r) => r.f); if (first) onPick(first.f); } }} />
      <div className="fp-cats">
        {CATS.map(([k, label]) => (
          <button key={k} type="button" className={'fp-cat' + (cat === k ? ' is-active' : '')} onClick={() => setCat(k)}>{label}</button>
        ))}
      </div>
      {rows.length ? (
        <FixedSizeList height={Math.min(360, rows.length * ROW)} width={288} itemCount={rows.length} itemSize={ROW} className="fp-list">
          {({ index, style }) => {
            const r = rows[index];
            if (r.h) return <div style={style} className="fp-head">{r.h}</div>;
            return <FontRow key={r.f} fam={r.f} active={r.f === current} store={store} onPick={onPick} style={style} />;
          }}
        </FixedSizeList>
      ) : <div className="fp-none muted">No font named “{q}”</div>}
    </div>
  );
}

/** Replaces the editor's font menu: every Google Font, searchable, classics first. */
export const TextFontFamily = observer(function TextFontFamily({ elements, store }) {
  const [open, setOpen] = useState(false);
  const current = elements[0] && elements[0].fontFamily;
  const pick = (fam) => {
    setOpen(false);
    store.history.transaction(() => { elements.forEach((el) => el.set({ fontFamily: fam })); });
  };
  return (
    <Popover isOpen={open} onInteraction={setOpen} placement="bottom-start" minimal popoverClassName="fp-pop"
      content={open ? <FontList store={store} current={current} onPick={pick} /> : <div />}>
      <Button minimal rightIcon="caret-down" className="fp-btn" style={{ fontFamily: `"${current}", system-ui` }} text={current} />
    </Popover>
  );
});
