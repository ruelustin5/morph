import React, { useEffect, useLayoutEffect, useRef, memo } from 'react';
import Sortable from 'sortablejs';
import { Button, Menu, MenuItem, MenuDivider, Popover, Tooltip, ContextMenu, Icon } from '@blueprintjs/core';
import { renderStatic, flattenPage } from '../render';
import { useController } from './hooks';
import { AvatarStack } from './People';
import { t } from '../i18n';

const THUMB_W = 160;

export const Thumb = memo(function Thumb({ page, w, h, ctx, tick }) {
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!stageRef.current) {
      const st = document.createElement('div');
      st.className = 'thumb-stage';
      host.appendChild(st);
      stageRef.current = st;
    }
    const st = stageRef.current;
    st.style.width = w + 'px';
    st.style.height = h + 'px';
    const scale = (host.clientWidth || THUMB_W) / w;
    st.style.transform = `scale(${scale})`;
    renderStatic(st, page, ctx);
  }, [page, w, h, tick, ctx]);
  // Keep the scale right if the column is resized.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (stageRef.current) stageRef.current.style.transform = `scale(${host.clientWidth / w})`; });
    ro.observe(host);
    return () => ro.disconnect();
  }, [w]);
  return <div className="thumb-host" ref={hostRef} />;
});

function ownerMenu(c, i) {
  const sid = c.project.slides[i].id;
  const cur = c.ownerOf(sid);
  const people = c.people || [{ key: 'owner', name: c.personName('owner') }];
  return (
    <MenuItem icon="person" text={t('Assign to')} label={cur ? c.personName(cur) : ''} disabled={c.canWrite === false}
      popoverProps={{ onOpening: () => c.refreshPeople() }}>
      {people.map((pp) => (
        <MenuItem key={pp.key} icon={cur === pp.key ? 'tick' : 'blank'} text={pp.name + (pp.key === c.myKey() ? ' ' + t('(you)') : '')}
          onClick={() => c.setOwner(sid, pp)} />
      ))}
      <MenuDivider />
      <MenuItem icon={cur ? 'blank' : 'tick'} text={t('Nobody')} onClick={() => c.setOwner(sid, null)} />
      {c.isOwner && people.length < 2 && <MenuItem disabled icon="info-sign" text={t('Share the project to add people')} />}
    </MenuItem>
  );
}

function slideMenu(c, i, n) {
  return (
    <Menu>
      <MenuItem icon="insert" text={t('New slide before')} onClick={() => c.addSlide(i)} />
      <MenuItem icon="add" text={t('New slide after')} onClick={() => c.addSlide(i + 1)} />
      <MenuItem icon="new-layers" text={t('Layouts and templates…')} onClick={() => c.setUi({ tplAt: i + 1 })} />
      <MenuDivider />
      <MenuItem icon="duplicate" text={t('Duplicate')} label="Ctrl+D" onClick={() => c.duplicateSlide(i)} />
      <MenuItem icon="clean" text={t('Duplicate as new objects')} onClick={() => c.duplicateSlide(i, { unlinked: true })} />
      {c.isOwner && <MenuItem icon="bookmark" text={t('Save as template…')} onClick={() => c.setUi({ saveTpl: i })} />}
      {ownerMenu(c, i)}
      <MenuDivider />
      <MenuItem icon="arrow-up" text={t('Move up')} disabled={i === 0} onClick={() => c.moveSlide(i, i - 1)} />
      <MenuItem icon="arrow-down" text={t('Move down')} disabled={i === n - 1} onClick={() => c.moveSlide(i, i + 1)} />
      <MenuDivider />
      <MenuItem icon="trash" intent="danger" text={t('Delete')} disabled={n <= 1} onClick={() => c.deleteSlide(i)} />
    </Menu>
  );
}

const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function SlideSorter({ c }) {
  useController(c);
  const listRef = useRef(null);
  const p = c.project;
  const slides = p ? p.slides : [];
  const n = slides.length;

  // Objects shared with the previous slide (they morph in).
  const morphCounts = [];
  {
    let prev = null;
    for (const s of slides) {
      const ids = new Set(flattenPage(s.page).map((e) => e.id));
      let k = 0;
      if (prev) for (const id of ids) if (prev.has(id)) k++;
      morphCounts.push(k);
      prev = ids;
    }
  }

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const s = Sortable.create(el, {
      disabled: !!c.ui.mine, // the list is filtered: positions would not match
      animation: 160,
      draggable: '.slide-item',
      filter: '.slide-insert, .slide-actions',
      preventOnFilter: false,
      ghostClass: 'slide-ghost',
      chosenClass: 'slide-chosen',
      dragClass: 'slide-drag',
      delay: 0,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      scrollSensitivity: 60,
      onEnd: (evt) => {
        const from = evt.oldDraggableIndex, to = evt.newDraggableIndex;
        if (from == null || to == null || from === to) return;
        // Put the DOM back where React expects it, then let React re-render in the new order.
        const { item, from: parent } = evt;
        parent.removeChild(item);
        parent.insertBefore(item, parent.children[from] || null);
        c.moveSlide(from, to);
      },
    });
    return () => s.destroy();
  }, [c, !!p, !!c.ui.mine]);

  // Keep the active slide visible.
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('.slide-item.active');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [c.active, n]);

  function onKeyDown(e) {
    if (e.target !== listRef.current) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); c.selectSlide(Math.min(n - 1, c.active + 1)); }
    else if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); c.selectSlide(Math.max(0, c.active - 1)); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); c.deleteSlide(c.active); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'd' || k === 'D')) { e.preventDefault(); e.stopPropagation(); c.duplicateSlide(c.active); }
    else if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); c.addSlide(c.active + 1); }
  }

  if (!p) return <aside className="sorter" />;
  const W = p.width, H = p.height;
  const others = c.othersIn(c.projectId);
  const me = c.myKey();
  const mine = !!c.ui.mine;
  const hasOwners = Object.keys(p.owners || {}).length > 0;
  const mineCount = slides.filter((x) => c.ownerOf(x.id) === me).length;

  return (
    <aside className="sorter" aria-label={t('Slides')}>
      <div className="sorter-head">
        <span>{t('Slides')} <span className="muted">{mine ? `${mineCount} / ${n}` : n}</span></span>
        <span>
          {(hasOwners || mine) && (
            <Tooltip content={mine ? t('Show all slides') : t('Only the slides assigned to me')} placement="bottom" compact>
              <Button small minimal icon="person" active={mine} aria-pressed={mine} aria-label={t('Only the slides assigned to me')} onClick={() => c.setMineOnly(!mine)} />
            </Tooltip>
          )}
          <Tooltip content={t('Layouts and themes')} placement="bottom" compact>
            <Button small minimal icon="new-layers" aria-label={t('New slide from a layout')} onClick={() => c.setUi({ tplAt: c.active + 1 })} />
          </Tooltip>
          <Tooltip content={t('New slide')} placement="bottom" compact>
            <Button small minimal icon="plus" aria-label={t('New slide')} onClick={() => c.newSlideAt(c.active + 1)} />
          </Tooltip>
        </span>
      </div>
      <div className="sorter-list" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}
        title={t('↑/↓ change slide, Enter new slide, Ctrl+D duplicate, Delete remove')}>
        {slides.map((s, i) => (
          <div key={s.id} className={'slide-item' + (i === c.active ? ' active' : '') + (mine && c.ownerOf(s.id) !== me ? ' is-filtered' : '')} data-index={i}>
            <div className="slide-insert" role="button" aria-label={t('Insert a slide before slide {n}', { n: i + 1 })}
              onClick={(e) => { e.stopPropagation(); c.newSlideAt(i); }}>
              <span><Icon icon="plus" size={10} /></span>
            </div>
            <div className="slide-num">{i + 1}</div>
            <ContextMenu
              className="slide-thumb"
              style={{ aspectRatio: `${W} / ${H}` }}
              onMouseDown={(e) => { if (e.button === 0 || e.button === 2) c.selectSlide(i); }}
              content={slideMenu(c, i, n)}
            >
              <Thumb page={s.page} w={W} h={H} ctx={c.ctx} tick={c.renderTick} />
              {others.some((x) => x.presence.slide === s.id) && (
                <span className="slide-people"><AvatarStack c={c} peers={others.filter((x) => x.presence.slide === s.id)} size={18} max={2} describe={() => t('on this slide')} /></span>
              )}
              {c.ownerOf(s.id) && (
                <Tooltip content={t('Assigned to {name}', { name: c.personName(c.ownerOf(s.id)) })} placement="right" compact>
                  <span className={'owner-badge' + (c.ownerOf(s.id) === me ? ' is-me' : '')}>{initials(c.personName(c.ownerOf(s.id)))}</span>
                </Tooltip>
              )}
              {c.noteOf(s.id) && <span className="note-dot" title={t('Has notes')}><Icon icon="annotation" size={9} /></span>}
              {morphCounts[i] > 0 && (
                <Tooltip content={morphCounts[i] > 1 ? t('{n} objects carried over from slide {k} (they morph)', { n: morphCounts[i], k: i }) : t('1 object carried over from slide {k} (it morphs)', { k: i })} placement="right" compact>
                  <span className="morph-badge"><Icon icon="exchange" size={9} />{morphCounts[i]}</span>
                </Tooltip>
              )}
              <div className="slide-actions" onMouseDown={(e) => e.stopPropagation()}>
                <Tooltip content={t('Duplicate')} placement="top" compact>
                  <button type="button" className="mini-btn" aria-label={t('Duplicate')} onClick={() => c.duplicateSlide(i)}><Icon icon="duplicate" size={12} /></button>
                </Tooltip>
                <Popover content={slideMenu(c, i, n)} placement="right-start" minimal>
                  <button type="button" className="mini-btn" aria-label={t('Slide options')}><Icon icon="more" size={12} /></button>
                </Popover>
              </div>
            </ContextMenu>
          </div>
        ))}
        <div className="add-tile" role="button" tabIndex={-1} onClick={() => c.newSlideAt(n)}>
          <Icon icon="plus" size={12} /> {t('New slide')}
        </div>
        {mine && !mineCount && <p className="muted mine-empty">{t('No slide is assigned to you yet. Right-click a slide › Assign to.')}</p>}
      </div>
    </aside>
  );
}
