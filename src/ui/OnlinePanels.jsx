// Photos (Wikimedia Commons: freely licensed images) and Icons (Iconify), for the website version only.
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
    const tm = setTimeout(() => run(q.trim()), 500);
    return () => clearTimeout(tm);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return { q, setQ, items, state };
}

// ---- photos ---------------------------------------------------------------------------------
const stripHtml = (h) => { const d = document.createElement('div'); d.innerHTML = String(h || ''); return (d.textContent || '').trim(); };

async function searchPhotos(q) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search'
    + `&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=40`
    + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=Artist|LicenseShortName|ObjectName&iiurlwidth=500';
  const r = await fetch(u);
  if (!r.ok) throw new Error('search failed');
  const d = await r.json();
  const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.filter((x) => x.imageinfo && x.imageinfo[0] && /^image\/(jpeg|png|webp|gif)$/.test(x.imageinfo[0].mime)).map((x) => {
    const ii = x.imageinfo[0];
    const m = ii.extmetadata || {};
    const big = ii.width > 1920 && ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, '/1920px-') : ii.url;
    return {
      id: String(x.pageid), title: stripHtml((m.ObjectName && m.ObjectName.value) || x.title.replace(/^File:/, '').replace(/\.\w+$/, '')),
      creator: stripHtml(m.Artist && m.Artist.value), license: stripHtml(m.LicenseShortName && m.LicenseShortName.value),
      page: ii.descriptionurl || '', full: big, thumb: ii.thumburl || ii.url, w: ii.width, h: ii.height,
    };
  });
}

const PhotosPanel = observer(function PhotosPanel({ store }) {
  const s = useSearch(searchPhotos, 'landscape');
  const [busy, setBusy] = useState(null);
  const add = async (it, pos) => {
    if (busy) return;
    setBusy(it.id);
    try {
      const pic = await fetchPicture([it.full, it.thumb]);
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
      <p className="online-note">{t('Freely licensed photos from Wikimedia Commons. The credit is added to the slide notes.')}</p>
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
// One request per icon set (not one per icon): the public Iconify API refuses too many requests at
// once, which left most previews broken. Icons are drawn from their data as <img> data URLs, so
// nothing from the API ever runs as page code.
const ICON_CACHE = new Map(); // "prefix:name" → svg markup (with currentColor)
const ICON_COLOR = '#202124';

function iconSvg(set, name) {
  let icon = set.icons && set.icons[name];
  let hFlip = false, vFlip = false, rotate = 0;
  if (!icon && set.aliases && set.aliases[name]) {
    const al = set.aliases[name];
    icon = set.icons[al.parent];
    hFlip = !!al.hFlip; vFlip = !!al.vFlip; rotate = al.rotate || 0;
  }
  if (!icon || !icon.body) return null;
  const w = icon.width || set.width || 16, h = icon.height || set.height || 16;
  const tr = [];
  if (hFlip || icon.hFlip) tr.push(`translate(${w} 0) scale(-1 1)`);
  if (vFlip || icon.vFlip) tr.push(`translate(0 ${h}) scale(1 -1)`);
  if (rotate || icon.rotate) tr.push(`rotate(${90 * ((rotate || 0) + (icon.rotate || 0))} ${w / 2} ${h / 2})`);
  const body = tr.length ? `<g transform="${tr.join(' ')}">${icon.body}</g>` : icon.body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left || 0} ${icon.top || 0} ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

async function searchIcons(q) {
  const r = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=64`);
  if (!r.ok) throw new Error('search failed');
  const d = await r.json();
  const list = (d.icons || []).slice(0, 64).map((n) => { const [prefix, name] = n.split(':'); return { id: n, prefix, name }; });
  // Fetch what is missing, grouped by icon set, a few sets at a time.
  const need = new Map();
  for (const it of list) if (!ICON_CACHE.has(it.id)) { if (!need.has(it.prefix)) need.set(it.prefix, []); need.get(it.prefix).push(it.name); }
  const sets = [...need.entries()];
  for (let k = 0; k < sets.length; k += 4) {
    await Promise.all(sets.slice(k, k + 4).map(async ([prefix, names]) => {
      try {
        const res = await fetch(`https://api.iconify.design/${prefix}.json?icons=${names.map(encodeURIComponent).join(',')}`);
        if (!res.ok) return;
        const set = await res.json();
        for (const nm of names) { const svg = iconSvg(set, nm); if (svg) ICON_CACHE.set(`${prefix}:${nm}`, svg); }
      } catch (e) { /* that set is skipped */ }
    }));
  }
  const ok = list.filter((it) => ICON_CACHE.has(it.id));
  if (list.length && !ok.length) throw new Error('icons failed');
  return ok.map((it) => ({ ...it, url: svgToURL(ICON_CACHE.get(it.id).replace(/currentColor/g, ICON_COLOR)) }));
}

const IconsPanel = observer(function IconsPanel({ store }) {
  const s = useSearch(searchIcons, 'star');
  const add = (it, pos) => {
    const page = store.activePage;
    if (!page) return;
    const size = Math.min(store.width, store.height) * 0.2;
    const x = pos ? pos.x - size / 2 : (store.width - size) / 2, y = pos ? pos.y - size / 2 : (store.height - size) / 2;
    // inserted in the theme's text color (or the base style's)
    const color = C && C.project ? C.currentStyle().text : ICON_COLOR;
    page.addElement({ type: 'svg', src: svgToURL(ICON_CACHE.get(it.id).replace(/currentColor/g, color)), width: size, height: size, x, y, keepRatio: true });
  };
  return (
    <div className="online-panel">
      <InputGroup leftIcon="search" placeholder={t('Search icons')} value={s.q} onChange={(e) => s.setQ(e.target.value)} />
      <p className="online-note">{t('Free icons from Iconify. Change their color in the toolbar.')}</p>
      {s.state === 'loading' && <div className="online-wait"><Spinner size={20} /></div>}
      {s.state === 'error' && <p className="online-note">{t('Icons could not be loaded. Check your connection, or try again in a minute.')}</p>}
      {s.state === 'done' && !s.items.length && <p className="online-note">{t('No icons found.')}</p>}
      <div className="icon-grid">
        {s.items.map((it) => (
          <button key={it.id} type="button" className="icon-tile" title={it.id} draggable onClick={() => add(it)}
            onDragStart={() => registerNextDomDrop((pos) => add(it, pos))} onDragEnd={() => registerNextDomDrop(null)}>
            <img src={it.url} alt={it.name} />
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
