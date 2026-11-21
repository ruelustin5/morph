import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef, useLayoutEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Icon, InputGroup, NumericInput, Popover, SegmentedControl, Switch, Tooltip } from '@blueprintjs/core';
import { useController } from './hooks';
import { CurvePicker } from './CurvePicker';
import { renderStatic, EASINGS } from '../render';
import { startTransition } from '../player';
import { animOf, leafMap, nearestPrevWith, nameOf, findRaw, idByName, normalizeId } from '../project';
import { labelOf } from '../controller';
import { MotionIcon, Avatar } from './People';

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
        <Tooltip content={i === 0 ? 'First slide' : `Play slide ${i} → ${i + 1}`} compact placement="bottom">
          <Button small minimal icon="play" disabled={i === 0} onClick={() => play('in')} text={i === 0 ? '—' : `${i} → ${i + 1}`} />
        </Tooltip>
        <Tooltip content={i >= n - 1 ? 'Last slide' : `Play slide ${i + 1} → ${i + 2}`} compact placement="bottom">
          <Button small minimal rightIcon="play" disabled={i >= n - 1} onClick={() => play('out')} text={i >= n - 1 ? '—' : `${i + 1} → ${i + 2}`} />
        </Tooltip>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
function Duration({ value, onChange }) {
  const presets = [0.3, 0.5, 1, 2];
  return (
    <div className="dur-row">
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
        aria-label="Duration in seconds"
      />
      <div className="chips">
        {presets.map((d) => (
          <button key={d} type="button" className={'chip' + (Math.abs(value - d) < 1e-6 ? ' is-active' : '')} onClick={() => onChange(d)}>{d}s</button>
        ))}
      </div>
    </div>
  );
}

const MOVE_OPTS = [
  { value: 'morph', label: 'Morph', icon: 'exchange' },
  { value: 'jump', label: 'Jump', icon: 'lightning' },
];
const IN_OPTS = [
  { value: 'none', label: 'None', icon: 'disable' },
  { value: 'fade', label: 'Fade in', icon: 'eye-open' },
];
const OUT_OPTS = [
  { value: 'none', label: 'None', icon: 'disable' },
  { value: 'fade', label: 'Fade out', icon: 'eye-off' },
];

/** Curve + duration (shown only when something actually moves). */
function Timing({ s, onPatch }) {
  return (
    <div className="timing">
      <CurvePicker value={s.easing} onChange={(v) => onPatch({ easing: v })} />
      <Duration value={s.duration} onChange={(v) => onPatch({ duration: v })} />
    </div>
  );
}

/**
 * One phase card (In or Out).
 * moving: objects that are also on the neighbour slide (morph/jump); appearing: the others (fade/none).
 */
function PhaseCard({ kind, chip, chipTip, idle, idleTip, moving, other, onPlay }) {
  const title = kind === 'in' ? 'In' : 'Out';
  const rows = [moving, other].filter(Boolean);
  const active = rows.find((r) => r.active) || null;
  return (
    <section className={'phase' + (idle ? ' is-idle' : '')}>
      <header>
        <Icon icon={kind === 'in' ? 'log-in' : 'log-out'} size={14} className="phase-icon" />
        <span className="phase-title">{title}</span>
        <Tooltip content={idle ? idleTip : chipTip} compact placement="left" disabled={!(idle ? idleTip : chipTip)}>
          <span className="phase-chip">{chip}</span>
        </Tooltip>
        <span className="phase-spacer" />
        {onPlay && (
          <Tooltip content="Preview" compact placement="left">
            <Button small minimal icon="play" onClick={onPlay} aria-label="Preview" />
          </Tooltip>
        )}
      </header>
      {rows.map((r) => (
        <div className="phase-row" key={r.key}>
          {rows.length > 1 && (
            <Tooltip content={r.countTip} compact placement="left">
              <span className="phase-count"><Icon icon={r.key === 'move' ? 'exchange' : kind === 'in' ? 'plus' : 'minus'} size={10} />{r.count}</span>
            </Tooltip>
          )}
          <SegmentedControl small fill value={r.value} onValueChange={r.onChange} options={r.options} />
        </div>
      ))}
      {active && <Timing s={active.timing} onPatch={active.onTiming} />}
    </section>
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
      if (r.skipped) c.toast(`${target.name} was already on ${r.skipped} of those slide${r.skipped > 1 ? 's' : ''}; ${me} stays there.`, 'none', { timeout: 6000 });
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
        <Button fill alignText="left" icon="square" text="This slide" onClick={() => finish(picked, false)} />
        <Button fill alignText="left" icon="layers" intent="primary" text={`All ${spread} slides with ${me}`} onClick={() => finish(picked, true)} />
        <Button small minimal icon="arrow-left" text="Back" onClick={() => setPicked(null)} />
      </div>
    );
  }
  return (
    <div className="link-pop-body">
      <InputGroup autoFocus small leftIcon="search" placeholder="Find an ID" value={q}
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
        {!list.length && <div className="muted link-none">{items.length ? 'No match' : 'Nothing on other slides'}</div>}
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
      setErr(cand ? null : `${n} is already on this slide`);
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
        <label className="id-label" htmlFor="obj-id">ID</label>
        <InputGroup
          id="obj-id"
          value={val}
          onChange={(e) => { setVal(e.target.value.toUpperCase()); setErr(null); setTaken(null); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setVal(name); setErr(null); setTaken(null); e.currentTarget.blur(); } }}
          intent={err ? 'danger' : 'none'}
          aria-label="Object ID"
          className="id-input"
          spellCheck={false}
        />
        <Popover isOpen={linkOpen} onInteraction={(o) => { setLinkOpen(o); if (!o) setPreset(null); }} placement="bottom-end" minimal popoverClassName="link-pop"
          content={<LinkPopoverContent key={(preset && preset.id) || 'x'} c={c} id={id} preset={preset} onDone={() => { setLinkOpen(false); setPreset(null); }} />}>
          <Tooltip content="Same object as…" compact placement="bottom" disabled={linkOpen}>
            <Button small icon="link" aria-label="Link to another ID" active={linkOpen} />
          </Tooltip>
        </Popover>
        <Tooltip content="Make it a separate object here" compact placement="bottom-end">
          <Button small icon="unlink" aria-label="Unlink" disabled={onSlides.length < 2} onClick={() => c.dissociate(id)} />
        </Tooltip>
      </div>
      {taken && (
        <div className="id-taken">
          <span><b>{taken.name}</b> exists</span>
          <Button small intent="primary" icon="link" text="Same object" onClick={() => { setVal(name); setTaken(null); setPreset(taken); setLinkOpen(true); }} />
          <Button small minimal icon="cross" aria-label="Cancel" onClick={() => { setVal(name); setTaken(null); }} />
        </div>
      )}
      {err && <div className="field-error">{err}</div>}
      <div className="on-slides">
        {onSlides.map((k) => (
          <Tooltip key={k} content={k === i ? 'This slide' : `Go to slide ${k + 1}`} compact placement="bottom">
            <button type="button" className={'slide-chip' + (k === i ? ' is-current' : '')} onClick={() => c.gotoObject(k, id)}>{k + 1}</button>
          </Tooltip>
        ))}
        <span className="phase-spacer" />
        <Tooltip content={prevK < 0 ? 'Not on an earlier slide' : `Back to its look on slide ${prevK + 1}`} compact placement="bottom-end">
          <Button small minimal icon="reset" disabled={prevK < 0} onClick={() => c.resetToPrevious(id)} aria-label="Reset look" text={prevK < 0 ? null : prevK + 1} />
        </Tooltip>
      </div>
      <div className="obj-props">
        <Tooltip content={fresh ? 'Duplicated slides get a new, separate copy' : 'Duplicated slides keep the same object (it morphs)'} compact placement="bottom" className="prop-tip">
          <Switch small checked={!fresh} onChange={(e) => c.setFresh(id, !e.currentTarget.checked)} label="Same object in duplicates" alignIndicator="right" />
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
      <span>{people.length === 1 ? `${people[0].name} has it selected` : `${people.length} people have it selected`}</span>
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
    const leave = [...cur.keys()].filter((id) => !nextMap.has(id)).length;
    body = (
      <div className="anim-empty">
        <div className="slide-stats">
          <Tooltip content={i > 0 ? `Morph from slide ${i}` : 'First slide'} compact placement="bottom"><span><Icon icon="exchange" size={12} />{i > 0 ? shared : '—'}</span></Tooltip>
          <Tooltip content="New on this slide" compact placement="bottom"><span><Icon icon="log-in" size={12} />{i > 0 ? appear : '—'}</span></Tooltip>
          <Tooltip content={i < n - 1 ? `Not on slide ${i + 2}` : 'Last slide'} compact placement="bottom"><span><Icon icon="log-out" size={12} />{i < n - 1 ? leave : '—'}</span></Tooltip>
        </div>
        {cur.size > 0 ? (
          <div className="obj-list">
            {[...cur.values()].reverse().map((el) => (
              <button key={el.id} type="button" className="obj-row" onClick={() => c.store.selectElements([el.id])}>
                <Icon icon={TYPE_ICON[el.type] || 'cube'} size={12} />
                <b>{nameOf(p, el.id)}</b>
                <span className="muted ellipsis">{labelOf(el)}</span>
                {prevMap.has(el.id) && <Icon icon="exchange" size={11} className="row-flag" />}
              </button>
            ))}
          </div>
        ) : <div className="muted empty-line">Empty slide</div>}
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

    // ---- In
    const inMove = mvIn.length ? (() => {
      const a = enterOf(mvIn[0]);
      return {
        key: 'move', count: mvIn.length, countTip: `${mvIn.length} come from slide ${i}`, options: MOVE_OPTS,
        value: a.cut ? 'jump' : 'morph', active: !a.cut, timing: a,
        onChange: (v) => { c.setAnim(i, mvIn, 'enter', { cut: v === 'jump' }); autoPlay('in'); },
        onTiming: (patch) => { c.setAnim(i, mvIn, 'enter', patch); autoPlay('in'); },
      };
    })() : null;
    const inAppear = apIn.length ? (() => {
      const a = enterOf(apIn[0]);
      return {
        key: 'appear', count: apIn.length, countTip: `${apIn.length} new on this slide`, options: IN_OPTS,
        value: a.type, active: a.type !== 'none', timing: a,
        onChange: (v) => { c.setAnim(i, apIn, 'enter', { type: v }); if (i > 0) autoPlay('in'); },
        onTiming: (patch) => { c.setAnim(i, apIn, 'enter', patch); if (i > 0) autoPlay('in'); },
      };
    })() : null;

    // ---- Out (objects also on the next slide: same setting as their "In" there)
    const outMove = mvOut.length ? (() => {
      const a = animOf(p.slides[i + 1], mvOut[0], 'enter');
      return {
        key: 'move', count: mvOut.length, countTip: `${mvOut.length} go on to slide ${i + 2}`, options: MOVE_OPTS,
        value: a.cut ? 'jump' : 'morph', active: !a.cut, timing: a,
        onChange: (v) => { c.setAnim(i + 1, mvOut, 'enter', { cut: v === 'jump' }); autoPlay('out'); },
        onTiming: (patch) => { c.setAnim(i + 1, mvOut, 'enter', patch); autoPlay('out'); },
      };
    })() : null;
    const outLeave = lvOut.length ? (() => {
      const a = animOf(p.slides[i], lvOut[0], 'exit');
      return {
        key: 'leave', count: lvOut.length, countTip: `${lvOut.length} not on slide ${i + 2}`, options: OUT_OPTS,
        value: a.type, active: a.type !== 'none', timing: a,
        onChange: (v) => { c.setAnim(i, lvOut, 'exit', { type: v }); if (i < n - 1) autoPlay('out'); },
        onTiming: (patch) => { c.setAnim(i, lvOut, 'exit', patch); if (i < n - 1) autoPlay('out'); },
      };
    })() : null;

    const inChip = i === 0 ? <><Icon icon="flag" size={10} />start</> : mvIn.length && !apIn.length ? <><Icon icon="exchange" size={10} />from {i}</> : !mvIn.length ? <><Icon icon="plus" size={10} />new</> : <>mixed</>;
    const outChip = i === n - 1 ? <><Icon icon="flag" size={10} />end</> : mvOut.length && !lvOut.length ? <><Icon icon="link" size={10} />to {i + 2}</> : !mvOut.length ? <><Icon icon="minus" size={10} />leaves</> : <>mixed</>;

    body = (
      <div className="anim-obj">
        {single
          ? <ObjectHead c={c} id={id} el={el} onSlides={onSlides} />
          : <div className="obj-head multi"><Icon icon="layers" size={14} /> <b>{sel.length} objects</b></div>}
        <EditingNotice c={c} ids={sel} />
        <PhaseCard kind="in" chip={inChip}
          chipTip={mvIn.length && !apIn.length ? `Morphs from slide ${i}` : !mvIn.length ? `Not on slide ${i}` : null}
          idle={i === 0} idleTip="First slide: shown as is"
          moving={inMove} other={inAppear}
          onPlay={i > 0 ? () => play('in') : null} />
        <PhaseCard kind="out" chip={outChip}
          chipTip={mvOut.length && !lvOut.length ? `Morphs to slide ${i + 2} (same as In on slide ${i + 2})` : !mvOut.length ? `Not on slide ${i + 2}` : null}
          idle={i === n - 1} idleTip="Last slide: nothing comes after"
          moving={outMove} other={outLeave}
          onPlay={i < n - 1 ? () => play('out') : null} />
      </div>
    );
  }

  return (
    <aside className="anim" aria-label="Animation">
      <div className="anim-head"><MotionIcon /> Animation <span className="anim-slide muted">{i + 1} / {n}</span>
        {c.closeAnim && <Tooltip content="Hide" compact placement="bottom-end"><Button small minimal icon="cross" className="anim-close" aria-label="Hide the animation panel" onClick={c.closeAnim} /></Tooltip>}
      </div>
      <MiniPreview c={c} ref={previewRef} />
      {body}
    </aside>
  );
});
