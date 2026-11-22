// Photos (Openverse: openly licensed images) and Icons (Iconify), for the website version only.
// Both are free public APIs that need no key. Inserted pictures are copied into the project
// (resized to at most 1920 px) so presentations keep working offline and in exported files.
import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Icon, InputGroup, Spinner } from '@blueprintjs/core';
import { SectionTab } from 'opn/side-panel/tab-button';
import { registerNextDomDrop } from 'opn/canvas/page';
import { svgToURL } from 'opn/utils/svg';
import { t } from '../i18n';

let C = null;
export function bindOnline(c) { C = c; }

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Download a picture and shrink it to at most `max` px on its long side. */
async function fetchPicture(urls, max = 1920) {
  let blob = null;
  for (const u of urls) {
    try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) { blob = await r.blob(); if (blob.size) break; } } catch (e) { /* try the next */ }
  }
  if (!blob) throw new Error(t('The picture could not be downloaded.'));
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const png = blob.type === 'image/png' || blob.type === 'image/gif';
  return { src: cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86), w, h };
}

function useSearch(fetcher, initial) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const req = useRef(0);
  const run = async (query) => {
    const n = ++req.current;
    setState('loading');
    try {
      const r = await fetcher(query);
      if (n !== req.current) return;
      setItems(r); setState('done');
    } catch (e) {
      if (n === req.current) { setItems([]); setState('error'); }
    }
  };
  useEffect(() => { run(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!q.trim()) return undefined;
    const tm = setTimeout(() => run(q.trim()), 400);
    return () => clearTimeout(tm);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return { q, setQ, items, state };
}

// ---- photos ---------------------------------------------------------------------------------
async function searchPhotos(q) {
  const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=40&mature=false`);
  if (!r.ok) throw new Error('search failed');
  const d = await r.json();
  return (d.results || []).map((x) => ({
    id: x.id, title: x.title || '', creator: x.creator || '', license: `${String(x.license || '').toUpperCase()} ${x.license_version || ''}`.trim(),
    page: x.foreign_landing_url || '', url: x.url, thumb: `https://api.openverse.org/v1/images/${x.id}/thumb/`, w: x.width || 0, h: x.height || 0,
  }));
}

const PhotosPanel = observer(function PhotosPanel({ store }) {
  const s = useSearch(searchPhotos, 'nature');
  const [busy, setBusy] = useState(null);
  const add = async (it, pos) => {
    if (busy) return;
    setBusy(it.id);
    try {
      const pic = await fetchPicture([`https://api.openverse.org/v1/images/${it.id}/thumb/?full_size=true`, it.url, it.thumb]);
      const page = store.activePage;
      if (!page) return;
      const k = Math.min(1, (store.width * 0.6) / pic.w, (store.height * 0.6) / pic.h);
      const w = pic.w * k, h = pic.h * k;
      const x = pos ? pos.x - w / 2 : (store.width - w) / 2, y = pos ? pos.y - h / 2 : (store.height - h) / 2;
      page.addElement({ type: 'image', src: pic.src, width: w, height: h, x, y, keepRatio: true });
      // Openly licensed pictures need a credit: it goes into the slide's notes.
      if (C && C.project) {
        const sid = C.project.slides[C.active] && C.project.slides[C.active].id;
        const credit = t('Photo: “{title}” by {creator}, {license}. {page}', { title: it.title || t('untitled'), creator: it.creator || t('unknown'), license: it.license, page: it.page });
        if (sid) { const prev = C.noteOf(sid); C.setNote(sid, prev ? prev + '\n' + credit : credit); }
        C.toast(t('Photo added. Its credit is in the slide notes.'), 'success');
      }
    } catch (e) {
      if (C) C.toast((e && e.message) || String(e), 'warning');
    } finally { setBusy(null); }
  };
  return (
    <div className="online-panel">
      <InputGroup leftIcon="search" placeholder={t('Search free photos')} value={s.q} onChange={(e) => s.setQ(e.target.value)} />
      <p className="online-note">{t('Openly licensed photos from Openverse. The credit is added to the slide notes.')}</p>
      {s.state === 'loading' && <div className="online-wait"><Spinner size={20} /></div>}
      {s.state === 'error' && <p className="online-note">{t('Photos could not be loaded. Check your connection.')}</p>}
      {s.state === 'done' && !s.items.length && <p className="online-note">{t('No photos found.')}</p>}
      <div className="photo-grid">
        {s.items.map((it) => (
          <button key={it.id} type="button" className="photo-tile" title={`${it.title} — ${it.creator} (${it.license})`}
            draggable onClick={() => add(it)}
            onDragStart={() => registerNextDomDrop((pos) => add(it, pos))} onDragEnd={() => registerNextDomDrop(null)}>
            <img src={it.thumb} alt={it.title} loading="lazy" referrerPolicy="no-referrer" />
            {busy === it.id && <span className="photo-busy"><Spinner size={16} /></span>}
          </button>
        ))}
      </div>
    </div>
  );
});

// ---- icons ----------------------------------------------------------------------------------
async function searchIcons(q) {
  const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=96`);
  if (!r.ok) throw new Error('search failed');
  const d = await r.json();
  return (d.icons || []).map((n) => { const [prefix, name] = n.split(':'); return { id: n, prefix, name }; });
}

const IconsPanel = observer(function IconsPanel({ store }) {
  const s = useSearch(searchIcons, 'star');
  const add = async (it, pos) => {
    try {
      const r = await fetch(`https://api.iconify.design/${it.prefix}/${it.name}.svg?color=%23202124&height=256`);
      if (!r.ok) throw new Error();
      const svg = await r.text();
      const page = store.activePage;
      if (!page) return;
      const size = Math.min(store.width, store.height) * 0.2;
      const x = pos ? pos.x - size / 2 : (store.width - size) / 2, y = pos ? pos.y - size / 2 : (store.height - size) / 2;
      page.addElement({ type: 'svg', src: svgToURL(svg), width: size, height: size, x, y, keepRatio: true });
    } catch (e) {
      if (C) C.toast(t('The icon could not be downloaded.'), 'warning');
    }
  };
  return (
    <div className="online-panel">
      <InputGroup leftIcon="search" placeholder={t('Search icons')} value={s.q} onChange={(e) => s.setQ(e.target.value)} />
      <p className="online-note">{t('Free icons from Iconify. Change their color in the toolbar.')}</p>
      {s.state === 'loading' && <div className="online-wait"><Spinner size={20} /></div>}
      {s.state === 'error' && <p className="online-note">{t('Icons could not be loaded. Check your connection.')}</p>}
      {s.state === 'done' && !s.items.length && <p className="online-note">{t('No icons found.')}</p>}
      <div className="icon-grid">
        {s.items.map((it) => (
          <button key={it.id} type="button" className="icon-tile" title={it.id} draggable onClick={() => add(it)}
            onDragStart={() => registerNextDomDrop((pos) => add(it, pos))} onDragEnd={() => registerNextDomDrop(null)}>
            <img src={`https://api.iconify.design/${it.prefix}/${it.name}.svg?height=32`} alt={it.name} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
});

export const PhotosSection = {
  name: 'photos',
  Tab: observer((props) => (
    <SectionTab name={t('Photos')} {...props}><Icon icon="media" /></SectionTab>
  )),
  Panel: ({ store }) => <PhotosPanel store={store} />,
};

export const IconsSection = {
  name: 'icons',
  Tab: observer((props) => (
    <SectionTab name={t('Icons')} {...props}><Icon icon="star" /></SectionTab>
  )),
  Panel: ({ store }) => <IconsPanel store={store} />,
};
