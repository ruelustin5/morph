import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AnchorButton, Button, Icon, InputGroup, Spinner, Switch } from '@blueprintjs/core';
import { SectionTab } from 'opn/side-panel/tab-button';
import { svgToURL } from 'opn/utils/svg';
import { texToSvg, loadMathJax, LATEX_PACKAGES, enabledPackages, preprocess, customFiles, customMacros, checkMacros, isKnownPackage } from '../mathjax';
import { parseMacros, LIMITS } from '../latex-macros';
import { useController } from './hooks';
import { t, tn } from '../i18n';

// The side panel sections are created once for the whole app; the controller is bound here.
let C = null;
export function bindEquations(c) { C = c; }

const readText = (file) => (file.text ? file.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(file); }));
const listNames = (names, max = 8) => names.slice(0, max).map((x) => '\\' + x).join(', ') + (names.length > max ? ` +${names.length - max}` : '');

/** Your own commands: drop a .sty / .tex file, or type \newcommand lines. */
function OwnCommands({ c, can }) {
  useController(c);
  const files = customFiles(c.settings);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null); // { name, added, failed, skipped, turnedOn } | { error }
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const pickRef = useRef(null);

  const save = (list, packages) => c.setSettings({ latex: { ...(c.settings.latex || {}), files: list, ...(packages ? { packages } : {}) } });

  const add = async (name, text, fixedId = null) => {
    if (!can) return;
    setBusy(true); setReport(null);
    try {
      const parsed = parseMacros(text);
      const on = enabledPackages(c.settings);
      const known = parsed.required.filter((x) => isKnownPackage(x) && !on.has(x));
      const ids = new Set([...on, ...known]);
      const nDefs = Object.keys(parsed.macros).length + Object.keys(parsed.envs).length;
      if (!nDefs) { setReport({ name, error: parsed.skipped.length ? 'none-usable' : 'none' , skipped: parsed.skipped }); return; }
      const checked = await checkMacros(parsed, ids);
      const added = Object.keys(checked.macros).length + Object.keys(checked.envs).length;
      if (!added) { setReport({ name, error: 'none-usable', skipped: [...parsed.skipped, ...checked.failed] }); return; }
      const files = customFiles(c.settings); // fresh: several files can be added one after the other
      const old = files.find((f) => (fixedId ? f.id === fixedId : f.name === name));
      const entry = { id: old ? old.id : fixedId || 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, on: true, macros: checked.macros, envs: checked.envs, rev: old ? (old.rev || 0) + 1 : 0, at: Date.now() };
      const list = old ? files.map((f) => (f.id === old.id ? entry : f)) : [...files, entry];
      if (list.length > LIMITS.files) { setReport({ name, error: 'too-many' }); return; }
      if (JSON.stringify(list).length > LIMITS.bytes) { setReport({ name, error: 'too-big' }); return; }
      save(list, known.length ? [...ids] : null);
      setReport({ name, added, updated: !!old, failed: checked.failed, skipped: parsed.skipped, turnedOn: known });
      return true;
    } catch (e) {
      setReport({ name, error: 'read', detail: (e && e.message) || String(e) });
    } finally {
      setBusy(false);
    }
  };

  const addFiles = async (list) => {
    for (const f of Array.from(list || [])) {
      if (!/\.(sty|tex|cls|txt|def)$/i.test(f.name)) { setReport({ name: f.name, error: 'type' }); continue; }
      if (f.size > 2e6) { setReport({ name: f.name, error: 'too-big' }); continue; }
      await add(f.name, await readText(f));
    }
  };

  const dropProps = can ? {
    onDragOver: (e) => { if (Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
    onDrop: (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); },
  } : {};

  const msg = report && (report.error
    ? ({
      type: t('{name} is not a .sty or .tex file.', { name: report.name }),
      'too-big': t('{name} is too big. Keep only the command definitions and try again.', { name: report.name }),
      'too-many': t('You can have up to {n} files. Remove one first.', { n: LIMITS.files }),
      none: t('No \\newcommand, \\DeclareMathOperator or \\def found in {name}.', { name: report.name }),
      'none-usable': t('None of the commands in {name} can work in equations here.', { name: report.name }),
      read: t('{name} could not be read: {e}', { name: report.name, e: report.detail || '' }),
    })[report.error]
    : (report.updated ? tn(report.added, '{name} updated: 1 command.', '{name} updated: {n} commands.', { name: report.name })
      : tn(report.added, '{name} added: 1 command.', '{name} added: {n} commands.', { name: report.name })));
  const left = report ? [...(report.failed || []), ...(report.skipped || [])] : [];

  return (
    <div className="pk-own" {...dropProps}>
      <div className={'pk-drop' + (over ? ' is-over' : '') + (can ? '' : ' is-off')}>
        <Icon icon={busy ? 'refresh' : 'document-open'} size={16} className={busy ? 'pk-spin' : ''} />
        <div>
          <b>{over ? t('Drop to add its commands') : t('Your own commands')}</b>
          <span>{t('Drop a .sty or .tex file here. Its \\newcommand, \\DeclareMathOperator and \\def lines become commands you can use in every equation.')}</span>
          {can && (
            <span className="pk-drop-actions">
              <Button small text={t('Choose a file…')} onClick={() => pickRef.current && pickRef.current.click()} disabled={busy} />
              <Button small minimal text={typing ? t('Close') : t('Type them')} onClick={() => setTyping(!typing)} />
            </span>
          )}
        </div>
        <input ref={pickRef} type="file" accept=".sty,.tex,.cls,.def,.txt,text/x-tex,text/plain" multiple hidden onChange={(e) => { const f = e.target.files; addFiles(f).finally(() => { e.target.value = ''; }); }} />
      </div>
      {typing && can && (
        <div className="pk-type">
          <textarea className="bp5-input" rows={4} spellCheck={false} value={typed} placeholder={'\\newcommand{\\R}{\\mathbb{R}}\n\\DeclareMathOperator{\\Tr}{Tr}'}
            onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={t('Your commands')} />
          <Button small intent="primary" text={t('Add commands')} disabled={!typed.trim() || busy}
            onClick={async () => {
              const mine = files.find((f) => f.id === 'typed');
              // Typed commands add to the ones typed before (same names are replaced).
              const prev = mine ? Object.entries(mine.macros).map(([k, v]) => macroLine(k, v)).join('\n') + '\n' + Object.entries(mine.envs || {}).map(([k, v]) => envLine(k, v)).join('\n') : '';
              if (await addTyped(prev + '\n' + typed)) { setTyped(''); setTyping(false); }
            }} />
        </div>
      )}
      {msg && (
        <div className={'pk-report' + (report.error ? ' is-err' : '')} role="status">
          <span>{msg}</span>
          {report.turnedOn && report.turnedOn.length > 0 && <span>{t('Also turned on, because the file needs it: {list}', { list: report.turnedOn.join(', ') })}</span>}
          {left.length > 0 && <span className="pk-left" title={left.map((x) => '\\' + x).join(' ')}>{tn(left.length, '1 cannot work here: {list}', '{n} cannot work here: {list}', { list: listNames(left, 6) })}</span>}
        </div>
      )}
      {files.map((f) => {
        const names = [...Object.keys(f.macros), ...Object.keys(f.envs || {})];
        return (
          <div key={f.id} className={'pk-row pk-file' + (f.on ? ' is-on' : '')}>
            <div className="pk-text">
              <b>{f.id === 'typed' ? t('Typed commands') : f.name}</b>
              <span>{tn(names.length, '1 command', '{n} commands')}</span>
              <code title={names.map((x) => '\\' + x).join(' ')}>{listNames(names)}</code>
            </div>
            {can && <Button small minimal icon="trash" aria-label={t('Remove {name}', { name: f.name })} title={t('Remove')}
              onClick={() => { save(files.filter((x) => x.id !== f.id)); setReport(null); }} />}
            <Switch large={false} checked={!!f.on} disabled={!can} onChange={(e) => save(files.map((x) => (x.id === f.id ? { ...x, on: e.currentTarget.checked } : x)))} aria-label={f.name} />
          </div>
        );
      })}
    </div>
  );

  function addTyped(text) { return add(t('Typed commands'), text, 'typed'); }
}

const macroLine = (k, v) => (Array.isArray(v)
  ? `\\newcommand{\\${k}}[${v[1]}]${v.length > 2 ? `[${v[2]}]` : ''}{${v[0]}}`
  : `\\newcommand{\\${k}}{${v}}`);
const envLine = (k, v) => `\\newenvironment{${k}}${v[2] ? `[${v[2]}]` : ''}{${v[0]}}{${v[1]}}`;

/** Turn LaTeX packages on or off for this presentation (no \usepackage needed), and add your own commands. */
function PackageManager({ c, onBack }) {
  useController(c);
  const [q, setQ] = useState('');
  const on = enabledPackages(c.settings);
  const set = (id, v) => {
    const next = new Set(on);
    if (v) next.add(id); else next.delete(id);
    c.setSettings({ latex: { ...(c.settings.latex || {}), packages: [...next] } });
  };
  const nq = q.trim().toLowerCase().replace(/^\\/, '');
  const hay = (p) => (p.id + ' ' + p.desc + ' ' + Object.keys(p.macros || {}).join(' ')).toLowerCase();
  const list = LATEX_PACKAGES.filter((p) => !nq || hay(p).includes(nq));
  const ownHit = nq && customFiles(c.settings).some((f) => (f.name + ' ' + Object.keys(f.macros).join(' ')).toLowerCase().includes(nq));
  const can = c.canWrite !== false;
  const slug = nq.replace(/[^a-z0-9-]/g, '');
  return (
    <div className="pk-panel">
      <div className="pk-head">
        <Button small minimal icon="arrow-left" text={t('Equation')} onClick={onBack} />
        <span className="muted">{t('{n} on', { n: on.size })}</span>
      </div>
      <p className="pk-intro">{t('Packages turned on here work in every equation of this presentation, without \\usepackage.')}</p>
      <InputGroup small leftIcon="search" placeholder={t('Find a package or a command')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="pk-list">
        {!nq && <OwnCommands c={c} can={can} />}
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
        {nq && ownHit && <p className="pk-intro">{t('Found in your own commands: clear the search to see them.')}</p>}
        {nq && !list.length && !ownHit && (
          <div className="pk-missing">
            <b>{t('“{q}” is not in this list.', { q: q.trim() })}</b>
            <span>{t('This list has every package the equation engine (MathJax) can run. Packages for drawings (like TikZ), page layout or fonts cannot work in equations.')}</span>
            <span>{t('If “{q}” mostly defines math commands, download its .sty file and drop it in “Your own commands”.', { q: q.trim() })}</span>
            {slug && <AnchorButton small icon="share" text={t('Find {q} on CTAN', { q: slug })} href={`https://ctan.org/pkg/${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" />}
            <Button small minimal text={t('Clear the search')} onClick={() => setQ('')} />
          </div>
        )}
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
  const own = c ? customMacros(c.settings) : null;
  const pkKey = (pkgs ? [...pkgs].sort().join(',') : '') + '|' + (own ? own.key : '');
  const sel = store.selectedElements.length === 1 && isEquation(store.selectedElements[0]) ? store.selectedElements[0] : null;
  const [tex, setTex] = useState(DEFAULT_TEX);
  const [color, setColor] = useState(() => (C && C.project ? C.currentStyle().text : COLORS[0]));
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
    const tm = setTimeout(async () => {
      const r = await texToSvg(tex, { color, fontSize: 72, packages: pkgs, custom: own });
      if (n === reqRef.current) setPreview(r);
    }, 160);
    return () => clearTimeout(tm);
  }, [tex, color, engine, pkKey]);

  const apply = async (asNew = false) => {
    const r = await texToSvg(tex, { color, fontSize: 72, packages: pkgs, custom: own });
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
  const offNamed = pkgs ? preprocess(tex, own && own.names).named.filter((x) => !pkgs.has(x)) : [];
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
        aria-label={t('LaTeX')}
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
