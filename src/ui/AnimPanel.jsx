import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef, useLayoutEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Icon, InputGroup, NumericInput, Popover, Switch, Tooltip } from '@blueprintjs/core';
import { useController } from './hooks';
import { CurvePicker } from './CurvePicker';
import { renderStatic, EASINGS } from '../render';
import { startTransition } from '../player';
import { animOf, leafMap, nearestPrevWith, nameOf, findRaw, idByName, normalizeId } from '../project';
import { labelOf } from '../controller';
import { MotionIcon, Avatar } from './People';
import { t } from '../i18n';

const TYPE_ICON = { text: 'font', image: 'media', svg: 'media', gif: 'media', figure: 'square', line: 'minus', video: 'video' };

// ---------------------------------------------------------------------------
// Mini preview: replays the transition into / out of the current slide.
// ---------------------------------------------------------------------------
const MiniPreview = forwardRef(function MiniPreview({ c }, ref) {
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const runRef = useRef(null);
  const timerRef = useRef(0);
  const [playing, setPlaying] = useState(null);
  const p = c.project;
  const i = c.active;
  const n = p.slides.length;

  const fit = () => {
    const host = hostRef.current, st = stageRef.current;
    if (!host || !st) return;
    st.style.transform = `scale(${host.clientWidth / p.width})`;
  };

  useLayoutEffect(() => {
    if (!stageRef.current) {
      const st = document.createElement('div');
      st.className = 'thumb-stage';
      hostRef.current.appendChild(st);
      stageRef.current = st;
    }
    const st = stageRef.current;
    st.style.width = p.width + 'px';
    st.style.height = p.height + 'px';
    fit();
    if (!runRef.current) renderStatic(st, p.slides[i].page, c.ctx);
  });

  useEffect(() => () => { clearTimeout(timerRef.current); if (runRef.current) runRef.current.finish(); }, []);
  // The panel can be hidden (width 0) and shown again: refit then.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(host);
    return () => ro.disconnect();
  }, [p.width]);

  const play = (dir) => {
    const st = stageRef.current;
    const from = dir === 'in' ? i - 1 : i;
    const to = from + 1;
    if (from < 0 || to >= n) return;
    clearTimeout(timerRef.current);
    if (runRef.current) { const r = runRef.current; runRef.current = null; r.finish(); }
    renderStatic(st, p.slides[from].page, c.ctx);
    setPlaying(dir);
    // Hold the start frame briefly so the motion reads clearly.
    timerRef.current = setTimeout(() => {
      runRef.current = startTransition(st, p.slides[from], p.slides[to], c.ctx, () => {
        timerRef.current = setTimeout(() => {
          runRef.current = null;
          setPlaying(null);
          renderStatic(st, c.project.slides[c.active].page, c.ctx);
        }, dir === 'out' ? 700 : 350);
      });
    }, 250);
  };
  useImperativeHandle(ref, () => ({ play }));

  return (
    <div className="mini">
      <div className="mini-screen" ref={hostRef} style={{ aspectRatio: `${p.width} / ${p.height}` }} onClick={() => play(i > 0 ? 'in' : 'out')}>
        {playing && <span className="mini-badge">{playing === 'in' ? `${i} → ${i + 1}` : `${i + 1} → ${i + 2}`}</span>}
      </div>
      <div className="mini-actions">
        <Tooltip content={i === 0 ? t('First slide') : t('Play slide {a} → {b}', { a: i, b: i + 1 })} compact placement="bottom">
          <Button small minimal icon="play" disabled={i === 0} onClick={() => play('in')} text={i === 0 ? '—' : `${i} → ${i + 1}`} />
        </Tooltip>
        <Tooltip content={i >= n - 1 ? t('Last slide') : t('Play slide {a} → {b}', { a: i + 1, b: i + 2 })} compact placement="bottom">
          <Button small minimal rightIcon="play" disabled={i >= n - 1} onClick={() => play('out')} text={i >= n - 1 ? '—' : `${i + 1} → ${i + 2}`} />
        </Tooltip>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
const SPEEDS = [[0.3, 'Quick'], [0.6, 'Normal'], [1.2, 'Slow']];

function Duration({ value, onChange }) {
  return (
    <div className="dur-row">
      <div className="chips" role="radiogroup" aria-label={t('Duration')}>
        {SPEEDS.map(([d, label]) => (
          <button key={d} type="button" role="radio" aria-checked={Math.abs(value - d) < 1e-6}
            className={'chip' + (Math.abs(value - d) < 1e-6 ? ' is-active' : '')} onClick={() => onChange(d)}>{t(label)}</button>
        ))}
      </div>
      <NumericInput
        small
        value={Math.round(value * 100) / 100}
        min={0}
        max={20}
        stepSize={0.1}
        minorStepSize={0.05}
        majorStepSize={1}
        clampValueOnBlur
        buttonPosition="none"
        rightElement={<span className="unit">s</span>}
        onValueChange={(v) => { if (Number.isFinite(v) && v >= 0) onChange(Math.min(20, v)); }}
        className="dur-input"
        aria-label={t('Duration in seconds')}
      />
    </div>
  );
}

/** Duration + curve, shown only when something actually animates. */
function Timing({ s, onPatch }) {
  return (
    <div className="timing">
      <div className="t-label">{t('Duration')}</div>
      <Duration value={s.duration} onChange={(v) => onPatch({ duration: v })} />
      <div className="t-label">{t('Motion')}</div>
      <CurvePicker value={s.easing} onChange={(v) => onPatch({ easing: v })} />
    </div>
  );
}

/** Two big choices with a line of explanation each. */
function Choice({ value, options, onChange }) {
  return (
    <div className="choice" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={'choice-opt' + (value === o.value ? ' is-on' : '')} onClick={() => onChange(o.value)}>
          <Icon icon={o.icon} size={14} />
          <span><b>{o.label}</b><small>{o.hint}</small></span>
        </button>
      ))}
    </div>
  );
}

const moveOpts = () => [
  { value: 'morph', icon: 'exchange', label: t('Morph'), hint: t('Moves and changes smoothly') },
  { value: 'jump', icon: 'lightning', label: t('Jump'), hint: t('Switches at once') },
];
const inOpts = () => [
  { value: 'fade', icon: 'eye-open', label: t('Fade in'), hint: t('Appears gradually') },
  { value: 'none', icon: 'disable', label: t('Just appear'), hint: t('Shows up at once') },
];
const outOpts = () => [
  { value: 'fade', icon: 'eye-off', label: t('Fade out'), hint: t('Disappears gradually') },
  { value: 'none', icon: 'disable', label: t('Just disappear'), hint: t('Goes away at once') },
];

/** "Arrives" or "Leaves": one block per group of selected objects (on the neighbour slide or not). */
function Step({ kind, title, edge, groups, onPlay, playTip }) {
  return (
    <section className={'step' + (edge ? ' is-idle' : '')}>
      <header>
        <Icon icon={kind === 'in' ? 'log-in' : 'log-out'} size={14} className="step-icon" />
        <span className="step-title">{title}</span>
        <span className="phase-spacer" />
        {onPlay && (
          <Tooltip content={playTip} compact placement="left">
            <Button small minimal icon="play" onClick={onPlay} aria-label={playTip} />
          </Tooltip>
        )}
      </header>
      {edge && <p className="step-say">{edge}</p>}
      {!edge && groups.map((g) => (
        <div className="step-group" key={g.key}>
          <p className="step-say">{g.say}</p>
          <Choice value={g.value} options={g.options} onChange={g.onChange} />
          {g.note && <p className="step-note">{g.note}</p>}
          {g.active && <Timing s={g.timing} onPatch={g.onTiming} />}
        </div>
      ))}
    </section>
  );
}

/** Slide before → this slide → slide after, with what happens on each arrow. */
function Journey({ i, n, inWord, outWord, onPlay }) {
  return (
    <div className="journey" aria-label={t('What happens to it')}>
      <span className={'j-slide' + (i === 0 ? ' is-none' : '')}>{i > 0 ? i : '·'}</span>
      <button type="button" className="j-arrow" disabled={i === 0} onClick={() => onPlay('in')} title={t('Play')}><span>{inWord}</span></button>
      <span className="j-slide is-cur">{i + 1}</span>
      <button type="button" className="j-arrow" disabled={i >= n - 1} onClick={() => onPlay('out')} title={t('Play')}><span>{outWord}</span></button>
      <span className={'j-slide' + (i >= n - 1 ? ' is-none' : '')}>{i < n - 1 ? i + 2 : '·'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
/** Link popover: pick an existing ID, then (if needed) choose this slide or every slide. */
function LinkPopoverContent({ c, id, preset, onDone }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(preset || null);
  const items = c.linkCandidates();
  const nq = q.trim().toLowerCase();
  const list = items.filter((it) => !nq || (it.name + ' ' + it.label).toLowerCase().includes(nq));
  const spread = c.slidesWith(id).length;
  const me = nameOf(c.project, id);
  const finish = (target, all) => {
    if (all) {
      const r = c.linkEverywhere(id, target.name);
      if (r.skipped) c.toast(t('{target} was already on {k} of those slides; {me} stays there.', { target: target.name, k: r.skipped, me }), 'none', { timeout: 6000 });
    } else {
      const err = c.linkTo(id, target.name);
      if (err) { c.toast(err, 'warning'); }
    }
    onDone();
  };
  const pick = (it) => { if (spread > 1) setPicked(it); else finish(it, false); };
  if (picked) {
    return (
      <div className="link-pop-body link-scope">
        <div className="link-scope-head"><b>{me}</b><Icon icon="arrow-right" size={12} /><b>{picked.name}</b></div>
        <Button fill alignText="left" icon="square" text={t('This slide')} onClick={() => finish(picked, false)} />
        <Button fill alignText="left" icon="layers" intent="primary" text={t('All {k} slides with {me}', { k: spread, me })} onClick={() => finish(picked, true)} />
        <Button small minimal icon="arrow-left" text={t('Back')} onClick={() => setPicked(null)} />
      </div>
    );
  }
  return (
    <div className="link-pop-body">
      <InputGroup autoFocus small leftIcon="search" placeholder={t('Find an ID')} value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) pick(list[0]); if (e.key === 'Escape') onDone(); }} />
      <div className="link-list" role="listbox">
        {list.slice(0, 60).map((it) => (
          <button key={it.id} type="button" role="option" className="link-item" onClick={() => pick(it)}>
            <Icon icon={TYPE_ICON[it.type] || 'cube'} size={12} />
            <b>{it.name}</b>
            <span className="muted ellipsis">{it.label}</span>
            <span className="link-slide">{it.slide + 1}</span>
          </button>
        ))}
        {!list.length && <div className="muted link-none">{items.length ? t('No match') : t('Nothing on other slides')}</div>}
      </div>
    </div>
  );
}

function ObjectHead({ c, id, el, onSlides }) {
  const p = c.project;
  const name = nameOf(p, id);
  const [val, setVal] = useState(name);
  const [err, setErr] = useState(null);
  const [taken, setTaken] = useState(null); // existing object with the typed ID → offer to link
  const [linkOpen, setLinkOpen] = useState(false);
  const [preset, setPreset] = useState(null);
  useEffect(() => { setVal(name); setErr(null); setTaken(null); }, [id, name]);
  const commit = () => {
    const n = normalizeId(val);
    if (n === name) { setVal(name); setErr(null); setTaken(null); return; }
    const other = n && idByName(p, n);
    if (other && other !== id && c.slidesWith(other).length) {
      const cand = c.linkCandidates().find((x) => x.id === other);
      setTaken(cand || null);
      setErr(cand ? null : t('{n} is already on this slide', { n }));
      return;
    }
    const e = c.rename(id, val);
    setErr(e); setTaken(null);
  };
  const i = c.active;
  const fresh = !!(p.objects[id] && p.objects[id].fresh);
  const prevK = nearestPrevWith(p, i, id);
  return (
    <div className="obj-head-wrap">
      <div className="obj-head">
        <div className="obj-type"><Icon icon={TYPE_ICON[el && el.type] || 'cube'} size={14} /></div>
        <Tooltip content={t('Objects with the same ID on two slides in a row morph into each other.')} compact placement="bottom-start"><label className="id-label" htmlFor="obj-id">ID</label></Tooltip>
        <InputGroup
          id="obj-id"
          value={val}
          onChange={(e) => { setVal(e.target.value.toUpperCase()); setErr(null); setTaken(null); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setVal(name); setErr(null); setTaken(null); e.currentTarget.blur(); } }}
          intent={err ? 'danger' : 'none'}
          aria-label={t('Object ID')}
          className="id-input"
          spellCheck={false}
        />
        <Popover isOpen={linkOpen} onInteraction={(o) => { setLinkOpen(o); if (!o) setPreset(null); }} placement="bottom-end" minimal popoverClassName="link-pop"
          content={<LinkPopoverContent key={(preset && preset.id) || 'x'} c={c} id={id} preset={preset} onDone={() => { setLinkOpen(false); setPreset(null); }} />}>
          <Tooltip content={t('Same object as…')} compact placement="bottom" disabled={linkOpen}>
            <Button small icon="link" aria-label={t('Same object as…')} active={linkOpen} />
          </Tooltip>
        </Popover>
        <Tooltip content={t('Make it a separate object here')} compact placement="bottom-end">
          <Button small icon="unlink" aria-label={t('Make it a separate object here')} disabled={onSlides.length < 2} onClick={() => c.dissociate(id)} />
        </Tooltip>
      </div>
      {taken && (
        <div className="id-taken">
          <span><b>{taken.name}</b> {t('exists')}</span>
          <Button small intent="primary" icon="link" text={t('Same object')} onClick={() => { setVal(name); setTaken(null); setPreset(taken); setLinkOpen(true); }} />
          <Button small minimal icon="cross" aria-label={t('Cancel')} onClick={() => { setVal(name); setTaken(null); }} />
        </div>
      )}
      {err && <div className="field-error">{err}</div>}
      <div className="on-slides">
        <span className="on-label">{t('On slides')}</span>
        {onSlides.map((k) => (
          <Tooltip key={k} content={k === i ? t('This slide') : t('Go to slide {k}', { k: k + 1 })} compact placement="bottom">
            <button type="button" className={'slide-chip' + (k === i ? ' is-current' : '')} onClick={() => c.gotoObject(k, id)}>{k + 1}</button>
          </Tooltip>
        ))}
        <span className="phase-spacer" />
        <Tooltip content={prevK < 0 ? t('Not on an earlier slide') : t('Back to its look on slide {k}', { k: prevK + 1 })} compact placement="bottom-end">
          <Button small minimal icon="reset" disabled={prevK < 0} onClick={() => c.resetToPrevious(id)} aria-label={t('Reset its look')} text={prevK < 0 ? null : prevK + 1} />
        </Tooltip>
      </div>
      <div className="obj-props">
        <Tooltip content={fresh ? t('Duplicated slides get a new, separate copy') : t('Duplicated slides keep the same object (it morphs)')} compact placement="bottom" className="prop-tip">
          <Switch small checked={!fresh} onChange={(e) => c.setFresh(id, !e.currentTarget.checked)} label={t('Same object in duplicates')} alignIndicator="right" />
        </Tooltip>
      </div>
    </div>
  );
}

function EditingNotice({ c, ids }) {
  const slide = c.project.slides[c.active];
  const set = new Set(ids);
  const sel = c.store.selectedElementsIds || [];
  sel.forEach((x) => set.add(x));
  const who = c.othersIn(c.projectId).filter((x) => x.presence.slide === slide.id && (x.presence.sel || []).some((s) => set.has(s)));
  if (!who.length) return null;
  const people = who.map((x) => c.personOf(x));
  return (
    <div className="editing-notice">
      {people.slice(0, 3).map((pp, k) => <Avatar key={k} person={pp} size={18} />)}
      <span>{people.length === 1 ? t('{name} has it selected', { name: people[0].name }) : t('{n} people have it selected', { n: people.length })}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
export const AnimPanel = observer(function AnimPanel({ c }) {
  useController(c);
  const previewRef = useRef(null);
  const autoTimer = useRef(0);
  if (!c.project) return <aside className="anim" />;
  const p = c.project;
  const i = c.active;
  const n = p.slides.length;
  const ids = c.selectedLeafIds();
  const cur = leafMap(p.slides[i].page);
  const prevMap = i > 0 ? leafMap(p.slides[i - 1].page) : new Map();
  const nextMap = i < n - 1 ? leafMap(p.slides[i + 1].page) : new Map();
  const sel = ids.filter((id) => cur.has(id) || findRaw(p.slides[i].page, id));

  const autoPlay = (dir) => {
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => previewRef.current && previewRef.current.play(dir), 250);
  };
  const play = (dir) => previewRef.current && previewRef.current.play(dir);

  let body;
  if (!sel.length) {
    const shared = [...cur.keys()].filter((id) => prevMap.has(id)).length;
    const appear = [...cur.keys()].filter((id) => !prevMap.has(id)).length;
    const going = [...cur.keys()].filter((id) => nextMap.has(id)).length;
    const leave = cur.size - going;
    body = (
      <div className="anim-empty">
        <p className="anim-intro">{t('Objects with the same ID on two slides in a row morph: they move and change between the slides. Select an object to choose how it arrives and leaves.')}</p>
        <div className="anim-summary">
          <div><Icon icon="log-in" size={12} />{i === 0 ? t('First slide') : t('From slide {a}: {m} morph, {k} new', { a: i, m: shared, k: appear })}</div>
          <div><Icon icon="log-out" size={12} />{i >= n - 1 ? t('Last slide') : t('To slide {b}: {m} morph, {k} leave', { b: i + 2, m: going, k: leave })}</div>
        </div>
        {cur.size > 0 ? (
          <div className="obj-list">
            {[...cur.values()].reverse().map((el) => (
              <button key={el.id} type="button" className="obj-row" onClick={() => c.store.selectElements([el.id])}>
                <Icon icon={TYPE_ICON[el.type] || 'cube'} size={12} />
                <b>{nameOf(p, el.id)}</b>
                <span className="muted ellipsis">{labelOf(el)}</span>
                {prevMap.has(el.id) && <span className="row-flag">{t('morphs')}</span>}
              </button>
            ))}
          </div>
        ) : <div className="muted empty-line">{t('Empty slide')}</div>}
      </div>
    );
  } else {
    const id = sel[0];
    const single = sel.length === 1;
    const el = cur.get(id) || findRaw(p.slides[i].page, id);
    const onSlides = c.slidesWith(id);
    const mvIn = sel.filter((x) => prevMap.has(x)), apIn = sel.filter((x) => !prevMap.has(x));
    const mvOut = sel.filter((x) => nextMap.has(x)), lvOut = sel.filter((x) => !nextMap.has(x));
    const enterOf = (x) => animOf(p.slides[i], x, 'enter');
    const part = (list, oneSay, manySay, vars) => (single ? t(oneSay, vars) : t(manySay, { ...vars, n: list.length, all: sel.length }));

    const inGroups = [];
    if (mvIn.length) {
      const a = enterOf(mvIn[0]);
      inGroups.push({
        key: 'move', value: a.cut ? 'jump' : 'morph', options: moveOpts(), active: !a.cut, timing: a,
        say: part(mvIn, 'It is also on slide {a}, so it travels from there.', '{n} of {all} are also on slide {a}.', { a: i }),
        onChange: (v) => { c.setAnim(i, mvIn, 'enter', { cut: v === 'jump' }); autoPlay('in'); },
        onTiming: (patch) => { c.setAnim(i, mvIn, 'enter', patch); autoPlay('in'); },
      });
    }
    if (apIn.length) {
      const a = enterOf(apIn[0]);
      inGroups.push({
        key: 'appear', value: a.type === 'fade' ? 'fade' : 'none', options: inOpts(), active: a.type === 'fade', timing: a,
        say: part(apIn, 'It is not on slide {a}: it is new here.', '{n} of {all} are new here.', { a: i }),
        onChange: (v) => { c.setAnim(i, apIn, 'enter', { type: v }); if (i > 0) autoPlay('in'); },
        onTiming: (patch) => { c.setAnim(i, apIn, 'enter', patch); if (i > 0) autoPlay('in'); },
      });
    }
    const outGroups = [];
    if (mvOut.length) {
      const a = animOf(p.slides[i + 1], mvOut[0], 'enter');
      outGroups.push({
        key: 'move', value: a.cut ? 'jump' : 'morph', options: moveOpts(), active: !a.cut, timing: a,
        say: part(mvOut, 'It is also on slide {b}, so it travels there.', '{n} of {all} are also on slide {b}.', { b: i + 2 }),
        note: t('Same setting as “Arrives” on slide {b}.', { b: i + 2 }),
        onChange: (v) => { c.setAnim(i + 1, mvOut, 'enter', { cut: v === 'jump' }); autoPlay('out'); },
        onTiming: (patch) => { c.setAnim(i + 1, mvOut, 'enter', patch); autoPlay('out'); },
      });
    }
    if (lvOut.length) {
      const a = animOf(p.slides[i], lvOut[0], 'exit');
      outGroups.push({
        key: 'leave', value: a.type === 'fade' ? 'fade' : 'none', options: outOpts(), active: a.type === 'fade', timing: a,
        say: part(lvOut, 'It is not on slide {b}: it leaves.', '{n} of {all} are not on slide {b}.', { b: i + 2 }),
        onChange: (v) => { c.setAnim(i, lvOut, 'exit', { type: v }); if (i < n - 1) autoPlay('out'); },
        onTiming: (patch) => { c.setAnim(i, lvOut, 'exit', patch); if (i < n - 1) autoPlay('out'); },
      });
    }
    const word = (groups, edgeWord) => {
      if (!groups.length) return edgeWord;
      if (groups.length > 1) return t('mixed');
      const g = groups[0];
      if (g.key === 'move') return g.value === 'jump' ? t('jumps') : t('morphs');
      if (g.key === 'appear') return g.value === 'fade' ? t('fades in') : t('appears');
      return g.value === 'fade' ? t('fades out') : t('disappears');
    };

    body = (
      <div className="anim-obj">
        {single
          ? <ObjectHead c={c} id={id} el={el} onSlides={onSlides} />
          : <div className="obj-head multi"><Icon icon="layers" size={14} /> <b>{t('{n} objects', { n: sel.length })}</b></div>}
        <EditingNotice c={c} ids={sel} />
        <Journey i={i} n={n} inWord={word(i === 0 ? [] : inGroups, '')} outWord={word(i >= n - 1 ? [] : outGroups, '')} onPlay={play} />
        <Step kind="in" title={t('Arrives')} groups={inGroups}
          edge={i === 0 ? t('This is the first slide: it is there from the start.') : null}
          onPlay={i > 0 ? () => play('in') : null} playTip={t('Play slide {a} → {b}', { a: i, b: i + 1 })} />
        <Step kind="out" title={t('Leaves')} groups={outGroups}
          edge={i === n - 1 ? t('This is the last slide: nothing comes after.') : null}
          onPlay={i < n - 1 ? () => play('out') : null} playTip={t('Play slide {a} → {b}', { a: i + 1, b: i + 2 })} />
      </div>
    );
  }

  return (
    <aside className="anim" aria-label={t('Animation')}>
      <div className="anim-head"><MotionIcon /> {t('Animation')} <span className="anim-slide muted">{i + 1} / {n}</span>
        {c.closeAnim && <Tooltip content={t('Hide')} compact placement="bottom-end"><Button small minimal icon="cross" className="anim-close" aria-label={t('Hide the animation panel')} onClick={c.closeAnim} /></Tooltip>}
      </div>
      <MiniPreview c={c} ref={previewRef} />
      {body}
    </aside>
  );
});
