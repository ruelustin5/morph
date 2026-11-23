// Text and Background panels without the editor's online galleries (text templates, Unsplash photos),
// which cannot load inside an artifact. Everything here works offline. See README.md to bring them back.
import React, { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Icon, Tab, Tabs } from '@blueprintjs/core';
import { TextSection, BackgroundSection } from 'opn/side-panel/side-panel';
import { ColorPicker } from 'opn/toolbar/color-picker';
import { registerNextDomDrop } from 'opn/canvas/page';
import { t } from 'opn/utils/l10n';
import { t as tr } from '../i18n';

// New text follows the presentation's theme (or the base style): heading, subheading and body text.
let C = null;
export function bindStyle(c) { C = c; }
const PRESETS = [
  { labelKey: 'sidePanel.createHeader', previewFontSize: 25, kind: 'head', size: 76, textKey: 'sidePanel.headerText' },
  { labelKey: 'sidePanel.createSubHeader', previewFontSize: 18, kind: 'sub', size: 44, textKey: 'sidePanel.subHeaderText' },
  { labelKey: 'sidePanel.createBody', previewFontSize: 14, kind: 'body', size: 30, textKey: 'sidePanel.bodyText' },
];
function presetAttrs(p) {
  const st = C && C.project ? C.currentStyle() : null;
  const a = { fontSize: p.size, text: t(p.textKey) };
  if (!st) return { ...a, fontFamily: 'Roboto' };
  if (p.kind === 'head') return { ...a, fontFamily: st.head, fontWeight: st.hw, fill: st.text };
  if (p.kind === 'sub') return { ...a, fontFamily: st.body, fontWeight: 'bold', fill: st.sub };
  return { ...a, fontFamily: st.body, fontWeight: 'normal', fill: st.text };
}

const readAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

function addText(store, attrs) {
  const width = attrs.width || store.width / 2;
  const x = (attrs.x || store.width / 2) - width / 2;
  const y = (attrs.y || store.height / 2) - attrs.fontSize / 2;
  const scale = (store.width + store.height) / 2160;
  const el = store.activePage && store.activePage.addElement({ type: 'text', fontFamily: 'Roboto', ...attrs, x, y, width, fontSize: attrs.fontSize * scale });
  if (el && el.toggleEditMode) el.toggleEditMode(true);
}

function DraggableItem({ onSelect, className, style, children }) {
  return (
    <button
      type="button"
      className={'quick-item ' + (className || '')}
      style={style}
      draggable
      onClick={() => onSelect()}
      onDragStart={() => registerNextDomDrop(({ x, y }) => onSelect({ x, y }))}
      onDragEnd={() => registerNextDomDrop(null)}
    >
      {children}
    </button>
  );
}

const OfflineTextPanel = observer(({ store }) => {
  const [tab, setTab] = useState('text');
  const fileRef = useRef(null);
  React.useEffect(() => { store.loadFont('Roboto'); }, [store]);
  React.useEffect(() => { store.fonts.forEach((f) => store.loadFont(f.fontFamily)); }, [store, store.fonts]);
  const st = C && C.project ? C.currentStyle() : null;
  React.useEffect(() => { if (st) { store.loadFont(st.head); store.loadFont(st.body); } }, [st && st.head, st && st.body]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="offline-panel">
      <Tabs id="morph-text-tabs" selectedTabId={tab} onChange={(id) => setTab(id)} large>
        <Tab id="text" title={t('sidePanel.text')} />
        <Tab id="font" title={t('sidePanel.myFonts')} />
      </Tabs>
      {tab === 'text' && (
        <div className="offline-body">
          {PRESETS.map((p) => (
            <DraggableItem key={p.labelKey} className="quick-text"
              style={{ fontSize: Math.min(30, p.previewFontSize) + 'px', fontFamily: st ? `'${p.kind === 'head' ? st.head : st.body}', sans-serif` : undefined, fontWeight: p.kind === 'body' ? 400 : 700 }}
              onSelect={(pos) => addText(store, { ...(pos || {}), ...presetAttrs(p) })}>
              {t(p.labelKey)}
            </DraggableItem>
          ))}
          <p className="panel-hint">{tr('Click to add, or drag onto the slide.')}</p>
          {st && <p className="panel-hint">{st.id === 'base' ? tr('New text and shapes use the base style. Pick a theme (+ › Layouts and themes) to change it.') : tr('New text and shapes follow the theme {name}.', { name: tr(st.name) })}</p>}
        </div>
      )}
      {tab === 'font' && (
        <div className="offline-body">
          <Button fill icon="upload" text={t('sidePanel.uploadFont')} onClick={() => fileRef.current && fileRef.current.click()} />
          <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={async (e) => {
            for (const file of Array.from(e.target.files || [])) {
              const url = await readAsDataURL(file);
              const fontFamily = file.name.split('.')[0].replace(/,/g, '');
              store.addFont({ fontFamily, url });
            }
            e.target.value = '';
          }} />
          <div className="font-list">
            {store.fonts.length === 0 && <p className="panel-hint">{tr('Fonts you upload appear here and can be used in any text.')}</p>}
            {store.fonts.map((font) => (
              <div key={font.fontFamily} className="font-row">
                <DraggableItem className="font-sample" style={{ fontFamily: `'${font.fontFamily}'` }}
                  onSelect={(pos) => addText(store, { ...(pos || {}), fontSize: 80, text: t('sidePanel.sampleCoolText'), fontFamily: font.fontFamily })}>
                  {font.fontFamily}
                </DraggableItem>
                <Button minimal small icon="trash" aria-label={`Remove ${font.fontFamily}`} onClick={() => {
                  store.find((el) => { if (el.type === 'text' && el.fontFamily === font.fontFamily) el.set({ fontFamily: 'Roboto' }); });
                  store.removeFont(font.fontFamily);
                }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const SWATCHES = [
  '#ffffff', '#f8fafd', '#e9eef6', '#1f1f1f', '#0f1729',
  '#0b57d0', '#d3e3fd', '#c2e7ff', '#146c2e', '#e6f4ea',
  '#b3261e', '#fce8e6', '#e8a200', '#fef7e0', '#6f43c0',
];
const GRADIENTS = [
  'linear-gradient(135deg, #0b57d0 0%, #6f43c0 100%)',
  'linear-gradient(160deg, #0f1729 0%, #27406f 100%)',
  'linear-gradient(135deg, #ff8a65 0%, #ffd54f 100%)',
  'linear-gradient(135deg, #e6f4ea 0%, #c2e7ff 100%)',
];
const isImage = (bg) => typeof bg === 'string' && (bg.startsWith('data:') || bg.startsWith('http') || bg.startsWith('url('));

const OfflineBackgroundPanel = observer(({ store }) => {
  const fileRef = useRef(null);
  const page = store.activePage;
  const bg = (page && page.background) || 'white';
  const set = (v) => page && page.set({ background: v });
  return (
    <div className="offline-panel">
      <div className="offline-body">
        <div className="panel-title">{tr('Color')}</div>
        <div className="swatches">
          <ColorPicker value={isImage(bg) ? 'white' : bg} onChange={set} store={store} position="bottom-left" gradientEnabled>
            <button type="button" className="swatch custom" aria-label={tr('Custom color or gradient')}><Icon icon="tint" size={16} /></button>
          </ColorPicker>
          {SWATCHES.map((c) => (
            <button key={c} type="button" className={'swatch' + (bg === c ? ' is-active' : '')} style={{ background: c }} aria-label={`Background ${c}`} onClick={() => set(c)} />
          ))}
        </div>
        <div className="panel-title">{tr('Gradient')}</div>
        <div className="swatches gradients">
          {GRADIENTS.map((g) => (
            <button key={g} type="button" className={'swatch wide' + (bg === g ? ' is-active' : '')} style={{ background: g }} aria-label={tr('Gradient background')} onClick={() => set(g)} />
          ))}
        </div>
        <div className="panel-title">{tr('Image')}</div>
        {isImage(bg) && <div className="bg-preview" style={{ backgroundImage: bg.startsWith('url(') ? bg : `url("${bg}")` }} />}
        <div className="bg-actions">
          <Button icon="media" text={isImage(bg) ? tr('Replace image') : tr('Use an image')} onClick={() => fileRef.current && fileRef.current.click()} />
          {isImage(bg) && <Button minimal icon="cross" text={tr('Remove')} onClick={() => set('white')} />}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          if (f) set(await readAsDataURL(f));
        }} />
      </div>
    </div>
  );
});

export const OfflineTextSection = { ...TextSection, Panel: ({ store }) => <OfflineTextPanel store={store} /> };
export const OfflineBackgroundSection = { ...BackgroundSection, Panel: ({ store }) => <OfflineBackgroundPanel store={store} /> };
