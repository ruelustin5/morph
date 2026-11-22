import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Icon, InputGroup, Spinner, Switch } from '@blueprintjs/core';
import { SectionTab } from 'opn/side-panel/tab-button';
import { svgToURL } from 'opn/utils/svg';
import { texToSvg, loadMathJax, LATEX_PACKAGES, enabledPackages, preprocess } from '../mathjax';
import { useController } from './hooks';
import { t } from '../i18n';

// The side panel sections are created once for the whole app; the controller is bound here.
let C = null;
export function bindEquations(c) { C = c; }

/** Turn LaTeX packages on or off for this presentation (no \usepackage needed). */
function PackageManager({ c, onBack }) {
  useController(c);
  const [q, setQ] = useState('');
  const on = enabledPackages(c.settings);
  const set = (id, v) => {
    const next = new Set(on);
    if (v) next.add(id); else next.delete(id);
    c.setSettings({ latex: { ...(c.settings.latex || {}), packages: [...next] } });
  };
  const nq = q.trim().toLowerCase();
  const list = LATEX_PACKAGES.filter((p) => !nq || (p.id + ' ' + p.desc).toLowerCase().includes(nq));
  const can = c.canWrite !== false;
  return (
    <div className="pk-panel">
      <div className="pk-head">
        <Button small minimal icon="arrow-left" text={t('Equation')} onClick={onBack} />
        <span className="muted">{t('{n} on', { n: on.size })}</span>
      </div>
      <p className="pk-intro">{t('Packages turned on here work in every equation of this presentation, without \\usepackage.')}</p>
      <InputGroup small leftIcon="search" placeholder={t('Find a package')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pk-list">
        {list.map((p) => (
          <div key={p.id} className={'pk-row' + (on.has(p.id) ? ' is-on' : '')}>
            <div className="pk-text">
              <b>{p.id}</b>
              <span>{t(p.desc)}</span>
              <code>{p.ex}</code>
            </div>
            {p.locked
              ? <span className="pk-always">{t('always on')}</span>
              : <Switch large={false} checked={on.has(p.id)} disabled={!can} onChange={(e) => set(p.id, e.currentTarget.checked)} aria-label={p.id} />}
          </div>
        ))}
        {!list.length && <p className="muted">{t('No match')}</p>}
      </div>
    </div>
  );
}


const COLORS = ['#1f1f1f', '#ffffff', '#0b57d0', '#b3261e', '#146c2e', '#7c4dff', '#e8710a'];
const DEFAULT_TEX = 'e^{i\\pi} + 1 = 0';

const isEquation = (el) => !!(el && el.type === 'svg' && el.custom && typeof el.custom.latex === 'string');

const EquationPanel = observer(function EquationPanel({ store }) {
  const c = C;
  useController(c);
  const [view, setView] = useState('edit');
  const pkgs = c ? enabledPackages(c.settings) : null;
  const pkKey = pkgs ? [...pkgs].sort().join(',') : '';
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
      const r = await texToSvg(tex, { color, fontSize: 72, packages: pkgs });
      if (n === reqRef.current) setPreview(r);
    }, 160);
    return () => clearTimeout(t);
  }, [tex, color, engine, pkKey]);

  const apply = async (asNew = false) => {
    const r = await texToSvg(tex, { color, fontSize: 72, packages: pkgs });
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
  if (view === 'packages' && c) return <PackageManager c={c} onBack={() => setView('edit')} />;
  const offNamed = pkgs ? preprocess(tex).named.filter((x) => !pkgs.has(x)) : [];
  return (
    <div className="eq-panel">
      <div className="eq-preview" aria-live="polite">
        {engine === 'loading' && <Spinner size={20} />}
        {engine === 'failed' && <span className="eq-err"><Icon icon="error" size={12} /> {t('The equation engine could not be loaded.')}</span>}
        {engine === 'ready' && ok && <img alt={t('Equation preview')} src={svgToURL(preview.svg)} className={color.toLowerCase() === '#ffffff' ? 'on-dark' : ''} />}
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
      {offNamed.length > 0 && c && c.canWrite !== false && (
        <div className="eq-offpk">
          <span>{t('{list} is off for this presentation.', { list: offNamed.join(', ') })}</span>
          <Button small minimal intent="primary" text={t('Turn on')} onClick={() => {
            const next = new Set(pkgs); offNamed.forEach((x) => next.add(x));
            c.setSettings({ latex: { ...(c.settings.latex || {}), packages: [...next] } });
          }} />
        </div>
      )}
      <div className="eq-colors" role="radiogroup" aria-label={t('Color')}>
        {c && <button type="button" className="eq-pk-btn" onClick={() => setView('packages')}><Icon icon="cube" size={12} /> {t('Packages')} <span className="eq-pk-n">{pkgs.size}</span></button>}
        {COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
            className={'eq-color' + (color === c ? ' is-active' : '')} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </div>
      <Button fill large intent="primary" icon={sel ? 'refresh' : 'add'} text={sel ? t('Update equation') : t('Add equation')}
        disabled={engine !== 'ready' || !ok} onClick={() => apply(false)} title="Ctrl+Enter" />
      {sel && <Button fill minimal icon="add" text={t('Add as new')} className="eq-new" disabled={engine !== 'ready' || !ok}
        onClick={() => apply(true)} />}
    </div>
  );
});

export const EquationSection = {
  name: 'equation',
  Tab: observer((props) => (
    <SectionTab name={t('Equation')} {...props}>
      <svg className="eq-tab-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 13h3l3.5 7L15 4h6" /><path d="M14.5 11.5l5 5M19.5 11.5l-5 5" />
      </svg>
    </SectionTab>
  )),
  Panel: ({ store }) => <EquationPanel store={store} />,
};
