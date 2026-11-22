import React, { useEffect, useLayoutEffect, useRef, memo } from 'react';
import Sortable from 'sortablejs';
import { Button, Menu, MenuItem, MenuDivider, Popover, Tooltip, ContextMenu, Icon } from '@blueprintjs/core';
import { renderStatic, flattenPage } from '../render';
import { useController } from './hooks';
import { AvatarStack } from './People';

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

function slideMenu(c, i, n) {
  return (
    <Menu>
      <MenuItem icon="insert" text="New slide before" onClick={() => c.addSlide(i)} />
      <MenuItem icon="add" text="New slide after" onClick={() => c.addSlide(i + 1)} />
      <MenuItem icon="new-layers" text="Layouts and templates…" onClick={() => c.setUi({ tplAt: i + 1 })} />
      <MenuDivider />
      <MenuItem icon="duplicate" text="Duplicate" label="Ctrl+D" onClick={() => c.duplicateSlide(i)} />
      <MenuItem icon="clean" text="Duplicate as new objects" onClick={() => c.duplicateSlide(i, { unlinked: true })} />
      {c.isOwner && <MenuItem icon="bookmark" text="Save as template…" onClick={() => c.setUi({ saveTpl: i })} />}
      <MenuDivider />
      <MenuItem icon="arrow-up" text="Move up" disabled={i === 0} onClick={() => c.moveSlide(i, i - 1)} />
      <MenuItem icon="arrow-down" text="Move down" disabled={i === n - 1} onClick={() => c.moveSlide(i, i + 1)} />
      <MenuDivider />
      <MenuItem icon="trash" intent="danger" text="Delete" disabled={n <= 1} onClick={() => c.deleteSlide(i)} />
    </Menu>
  );
}

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
  }, [c, !!p]);

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

  return (
    <aside className="sorter" aria-label="Slides">
      <div className="sorter-head">
        <span>Slides <span className="muted">{n}</span></span>
        <span>
          <Tooltip content="Layouts and themes" placement="bottom" compact>
            <Button small minimal icon="new-layers" aria-label="New slide from a layout" onClick={() => c.setUi({ tplAt: c.active + 1 })} />
          </Tooltip>
          <Tooltip content="New slide" placement="bottom" compact>
            <Button small minimal icon="plus" aria-label="New slide" onClick={() => c.newSlideAt(c.active + 1)} />
          </Tooltip>
        </span>
      </div>
      <div className="sorter-list" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}
        title="↑/↓ change slide · Enter new slide · Ctrl+D duplicate · Delete remove">
        {slides.map((s, i) => (
          <div key={s.id} className={'slide-item' + (i === c.active ? ' active' : '')} data-index={i}>
            <div className="slide-insert" role="button" aria-label={`Insert a slide before slide ${i + 1}`}
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
                <span className="slide-people"><AvatarStack c={c} peers={others.filter((x) => x.presence.slide === s.id)} size={18} max={2} describe={() => 'on this slide'} /></span>
              )}
              {morphCounts[i] > 0 && (
                <Tooltip content={`${morphCounts[i]} object${morphCounts[i] > 1 ? 's' : ''} carried over from slide ${i} (they morph)`} placement="right" compact>
                  <span className="morph-badge"><Icon icon="exchange" size={9} />{morphCounts[i]}</span>
                </Tooltip>
              )}
              <div className="slide-actions" onMouseDown={(e) => e.stopPropagation()}>
                <Tooltip content="Duplicate" placement="top" compact>
                  <button type="button" className="mini-btn" aria-label="Duplicate slide" onClick={() => c.duplicateSlide(i)}><Icon icon="duplicate" size={12} /></button>
                </Tooltip>
                <Popover content={slideMenu(c, i, n)} placement="right-start" minimal>
                  <button type="button" className="mini-btn" aria-label="Slide options"><Icon icon="more" size={12} /></button>
                </Popover>
              </div>
            </ContextMenu>
          </div>
        ))}
        <div className="add-tile" role="button" tabIndex={-1} onClick={() => c.newSlideAt(n)}>
          <Icon icon="plus" size={12} /> New slide
        </div>
      </div>
    </aside>
  );
}
