import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Icon, Spinner, Tooltip } from '@blueprintjs/core';
import { SectionTab } from 'opn/side-panel/tab-button';
import { svgToURL } from 'opn/utils/svg';
import { texToSvg, loadMathJax, PACKAGES } from '../mathjax';


const COLORS = ['#1f1f1f', '#ffffff', '#0b57d0', '#b3261e', '#146c2e', '#7c4dff', '#e8710a'];
const DEFAULT_TEX = 'e^{i\\pi} + 1 = 0';

const isEquation = (el) => !!(el && el.type === 'svg' && el.custom && typeof el.custom.latex === 'string');

const EquationPanel = observer(function EquationPanel({ store }) {
  const sel = store.selectedElements.length === 1 && isEquation(store.selectedElements[0]) ? store.selectedElements[0] : null;
  const [tex, setTex] = useState(DEFAULT_TEX);
  const [color, setColor] = useState(COLORS[0]);
  const [preview, setPreview] = useState(null); // { svg, width, height } | { error }
  const [engine, setEngine] = useState('loading'); // loading | ready | failed
  const taRef = useRef(null);
  const reqRef = useRef(0);

  useEffect(() => {
    loadMathJax().then(() => setEngine('ready'), () => setEngine('failed'));
  }, []);

  // Selecting an equation on the canvas loads it here for editing.
  const selId = sel ? sel.id : null;
  useEffect(() => {
    if (!sel) return;
    setTex(sel.custom.latex);
    const replaced = sel.colorsReplace && sel.colorsReplace.get && sel.colorsReplace.get(sel.custom.color);
    setColor(replaced || sel.custom.color || COLORS[0]);
  }, [selId]);

  // Live preview.
  useEffect(() => {
    if (engine !== 'ready') return;
    const n = ++reqRef.current;
    const t = setTimeout(async () => {
      const r = await texToSvg(tex, { color, fontSize: 72 });
      if (n === reqRef.current) setPreview(r);
    }, 160);
    return () => clearTimeout(t);
  }, [tex, color, engine]);

  const apply = async (asNew = false) => {
    const r = await texToSvg(tex, { color, fontSize: 72 });
    if (r.error) { setPreview(r); return; }
    const src = svgToURL(r.svg);
    const custom = { latex: tex.trim(), color, nw: r.width, nh: r.height };
    if (sel && !asNew) {
      // Keep its current scale and position; only the content changes.
      const k = sel.custom.nw ? sel.width / sel.custom.nw : sel.width / r.width;
      sel.set({ src, width: r.width * k, height: r.height * k, custom, colorsReplace: {} });
      return;
    }
    const page = store.activePage;
    if (!page) return;
    const scale = (store.width + store.height) / 3000;
    let w = r.width * scale, h = r.height * scale;
    const maxW = store.width * 0.8;
    if (w > maxW) { h *= maxW / w; w = maxW; }
    page.addElement({ type: 'svg', src, width: w, height: h, x: (store.width - w) / 2, y: (store.height - h) / 2, keepRatio: true, custom });
  };

  const ok = preview && !preview.error;
  return (
    <div className="eq-panel">
      <div className="eq-preview" aria-live="polite">
        {engine === 'loading' && <Spinner size={20} />}
        {engine === 'failed' && <span className="eq-err"><Icon icon="error" size={12} /> The equation engine could not be loaded.</span>}
        {engine === 'ready' && ok && <img alt="Equation preview" src={svgToURL(preview.svg)} className={color.toLowerCase() === '#ffffff' ? 'on-dark' : ''} />}
        {engine === 'ready' && preview && preview.error && <span className="eq-err"><Icon icon="warning-sign" size={12} /> {preview.error}</span>}
      </div>
      <textarea
        ref={taRef}
        className="eq-input bp5-input"
        value={tex}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={4}
        placeholder={"\\frac{a}{b}"}
        onChange={(e) => setTex(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); apply(false); } }}
        aria-label="LaTeX"
      />
      <div className="eq-colors" role="radiogroup" aria-label="Color">
        <Tooltip placement="top-end" compact content={<div className="eq-pk">\usepackage works for: {PACKAGES.join(', ')}</div>}>
          <span className="eq-pk-btn" tabIndex={0} aria-label="Available packages"><Icon icon="cube" size={12} /> Packages</span>
        </Tooltip>
        {COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
            className={'eq-color' + (color === c ? ' is-active' : '')} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </div>
      <Button fill large intent="primary" icon={sel ? 'refresh' : 'add'} text={sel ? 'Update equation' : 'Add equation'}
        disabled={engine !== 'ready' || !ok} onClick={() => apply(false)} title="Ctrl+Enter" />
      {sel && <Button fill minimal icon="add" text="Add as new" className="eq-new" disabled={engine !== 'ready' || !ok}
        onClick={() => apply(true)} />}
    </div>
  );
});

export const EquationSection = {
  name: 'equation',
  Tab: observer((props) => (
    <SectionTab name="Equation" {...props}>
      <svg className="eq-tab-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 13h3l3.5 7L15 4h6" /><path d="M14.5 11.5l5 5M19.5 11.5l-5 5" />
      </svg>
    </SectionTab>
  )),
  Panel: ({ store }) => <EquationPanel store={store} />,
};
