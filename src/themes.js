// Slide themes. Every theme has every layout, with the same colors and fonts.
// Five "role" objects (panel, two decorations, accent bar, title) keep the same ID on every
// layout of a theme, so going from one layout to another morphs them (the panel grows into a
// full-screen cover, the title moves and resizes…). Everything else fades in and out.
// Layouts are drawn at 1920×1080 and fitted to the project size when inserted.

import { t } from './i18n';

const W = 1920, H = 1080, M = 160;

export const THEMES = [
  {
    id: 'classic', name: 'Classic', head: 'Outfit', body: 'Inter', hw: 'bold', radius: 20, shape: 'circle',
    paper: '#ffffff', panel: '#0b1324', ink: '#1b1f27', muted: '#5f6672', onPanel: '#ffffff', onPanelMuted: '#a8b9d6',
    accent: '#0b57d0', accent2: '#7cacf8', onAccent: '#ffffff', strong: '#0b57d0', card: '#f2f5fa', line: '#dde3ec',
  },
  {
    id: 'midnight', name: 'Midnight', head: 'Sora', body: 'Inter', hw: 'bold', radius: 24, shape: 'rounded',
    paper: '#0f1626', panel: '#1b2742', ink: '#eef2fa', muted: '#94a3bf', onPanel: '#ffffff', onPanelMuted: '#a9b7d3',
    accent: '#7cacf8', accent2: '#f2b84b', onAccent: '#0f1626', strong: '#7cacf8', card: '#18223a', line: '#2a3654',
  },
  {
    id: 'forest', name: 'Forest', head: 'Fraunces', body: 'Work Sans', hw: 'bold', radius: 6, shape: 'square',
    paper: '#fbfaf6', panel: '#1f3d30', ink: '#1d231f', muted: '#66706a', onPanel: '#f3efe2', onPanelMuted: '#b9c7bd',
    accent: '#d4a72c', accent2: '#5f9e7a', onAccent: '#1d231f', strong: '#1f3d30', card: '#f1eee4', line: '#dcd7c8',
  },
  {
    id: 'coral', name: 'Coral', head: 'Poppins', body: 'Nunito', hw: 'bold', radius: 36, shape: 'circle',
    paper: '#fff8f3', panel: '#ff6a4d', ink: '#2b1b16', muted: '#8b6f64', onPanel: '#ffffff', onPanelMuted: '#ffe3da',
    accent: '#ffb400', accent2: '#2a9d8f', onAccent: '#2b1b16', strong: '#e8492b', card: '#ffffff', line: '#f3dcd2',
  },
  {
    id: 'swiss', name: 'Swiss', head: 'Archivo', body: 'Inter', hw: 'bold', radius: 0, shape: 'square',
    paper: '#ffffff', panel: '#e3241b', ink: '#000000', muted: '#5c5c5c', onPanel: '#ffffff', onPanelMuted: '#ffd9d6',
    accent: '#000000', accent2: '#ffcf00', onAccent: '#ffffff', strong: '#e3241b', card: '#f2f2f2', line: '#d9d9d9',
  },
  {
    id: 'ocean', name: 'Ocean', head: 'Lexend', body: 'Source Sans 3', hw: 'bold', radius: 16, shape: 'rounded',
    paper: '#f3f8fa', panel: '#0b4f6c', ink: '#0c2a36', muted: '#5b7884', onPanel: '#eaf7fb', onPanelMuted: '#9fc6d4',
    accent: '#1fb5a3', accent2: '#4cc3f0', onAccent: '#062a33', strong: '#0b4f6c', card: '#ffffff', line: '#d6e6ec',
  },
  {
    id: 'grape', name: 'Grape', head: 'Fredoka', body: 'Nunito', hw: 'bold', radius: 40, shape: 'circle',
    paper: '#f7f4ff', panel: '#5a3bd1', ink: '#1e1446', muted: '#6c64a3', onPanel: '#ffffff', onPanelMuted: '#d3c9ff',
    accent: '#ff6fb1', accent2: '#ffd166', onAccent: '#1e1446', strong: '#5a3bd1', card: '#ffffff', line: '#e3dcfa',
  },
  {
    id: 'terminal', name: 'Terminal', head: 'JetBrains Mono', body: 'IBM Plex Sans', hw: 'bold', radius: 6, shape: 'square',
    paper: '#0d1117', panel: '#161b22', ink: '#e6edf3', muted: '#8b949e', onPanel: '#f0f6fc', onPanelMuted: '#9aa4ae',
    accent: '#3fb950', accent2: '#d2a8ff', onAccent: '#0d1117', strong: '#3fb950', card: '#151a21', line: '#30363d',
  },
  {
    id: 'chalk', name: 'Chalkboard', head: 'Kalam', body: 'Nunito', hw: 'bold', radius: 14, shape: 'rounded',
    paper: '#213c34', panel: '#2b4c42', ink: '#f2f0e4', muted: '#a8c0b6', onPanel: '#fffbea', onPanelMuted: '#b9cfc5',
    accent: '#f6d76b', accent2: '#f0a3a3', onAccent: '#213c34', strong: '#f6d76b', card: '#29473e', line: '#45695d',
  },
  {
    id: 'plum', name: 'Plum', head: 'Instrument Serif', body: 'Manrope', hw: 'normal', radius: 2, shape: 'circle',
    paper: '#fdf7f7', panel: '#3b1f2b', ink: '#2a1a21', muted: '#8a6b76', onPanel: '#fbe9ee', onPanelMuted: '#d6b3bf',
    accent: '#e86f8a', accent2: '#c9a86a', onAccent: '#ffffff', strong: '#b8405e', card: '#ffffff', line: '#f0dde2',
  },
];

export const COLOR_TOKENS = ['paper', 'panel', 'ink', 'muted', 'onPanel', 'onPanelMuted', 'accent', 'accent2', 'onAccent', 'strong', 'card', 'line'];
export const ROLES = ['panel', 'deco1', 'deco2', 'bar', 'title'];

export const themeById = (id) => THEMES.find((t) => t.id === id) || null;
export const roleId = (themeId, role) => `th-${themeId}-${role}`;
/** { theme, role } when `id` is a theme role object, else null. */
export function parseRoleId(id) {
  const m = /^th-([a-z0-9]+)-(panel|deco1|deco2|bar|title)$/.exec(String(id || ''));
  return m ? { theme: m[1], role: m[2] } : null;
}

export function decoRadius(shape, size) {
  if (shape === 'circle') return size / 2;
  if (shape === 'rounded') return size * 0.22;
  return 0;
}

// ---- element helpers -------------------------------------------------------------------------
let seq = 0;
const tmpId = () => 'x' + (++seq);

function estLines(str, size, w) {
  return String(str).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil((line.length * size * 0.52) / Math.max(1, w))), 0);
}
function text(T, str0, x, y, w, size, o = {}) {
  const str = t(str0);
  const lh = o.lh || 1.25;
  return {
    id: o.id || tmpId(), type: 'text', text: str, x, y, width: w, height: Math.round(size * lh * estLines(str, size, w)),
    fontSize: size, fontFamily: o.head ? T.head : T.body, fontWeight: o.head ? T.hw : (o.weight || 'normal'), fontStyle: 'normal',
    fill: o.fill || T.ink, align: o.align || 'left', lineHeight: lh, letterSpacing: 0, opacity: 1,
  };
}
const head = (T, str, x, y, w, size, o = {}) => text(T, str, x, y, w, size, { ...o, head: true, lh: o.lh || 1.1 });
function rect(x, y, w, h, fill, o = {}) {
  return {
    id: o.id || tmpId(), type: 'figure', subType: 'rect', x, y, width: w, height: h, fill,
    stroke: o.stroke || fill, strokeWidth: o.strokeWidth || 0, cornerRadius: o.r || 0, opacity: o.opacity == null ? 1 : o.opacity,
  };
}

// The five role objects, placed for one layout.
function roleEls(T, r) {
  const d = (k, def) => {
    const b = r[k];
    return rect(b.x, b.y, b.s, b.s, b.fill || def, { id: roleId(T.id, k), r: decoRadius(T.shape, b.s), opacity: b.opacity == null ? 1 : b.opacity });
  };
  const p = r.panel, bar = r.bar, t = r.title;
  return {
    under: [
      rect(p.x, p.y, p.w, p.h, p.fill || T.panel, { id: roleId(T.id, 'panel') }),
      d('deco1', T.accent),
      d('deco2', T.accent2),
    ],
    over: [
      rect(bar.x, bar.y, bar.w, bar.h, bar.fill || T.accent, { id: roleId(T.id, 'bar'), r: Math.min(bar.h / 2, T.radius) }),
      head(T, t.text, t.x, t.y, t.w, t.size, { id: roleId(T.id, 'title'), fill: t.fill || T.ink, align: t.align, lh: t.lh }),
    ],
  };
}

// Where the role objects sit on ordinary content slides (so content → content only morphs the title).
const content = (T, title) => ({
  panel: { x: 0, y: 0, w: 24, h: H },
  deco1: { x: 1740, y: -140, s: 320 },
  deco2: { x: 1850, y: 960, s: 150 },
  bar: { x: M, y: 222, w: 96, h: 10 },
  title: { text: title, x: M, y: 104, w: 1480, size: 76 },
});
const full = { x: 0, y: 0, w: W, h: H };

// ---- layouts ---------------------------------------------------------------------------------
export const LAYOUTS = [
  {
    id: 'title', name: 'Title',
    make: (T) => ({
      roles: {
        panel: full, deco1: { x: 1300, y: -220, s: 860 }, deco2: { x: 1160, y: 720, s: 200 },
        bar: { x: M, y: 330, w: 140, h: 14 },
        title: { text: 'Your title here', x: M, y: 380, w: 1080, size: 120, fill: T.onPanel, lh: 1.05 },
      },
      extras: [
        text(T, 'A short subtitle that says what this is about', M + 4, 570, 1000, 44, { fill: T.onPanelMuted }),
        text(T, 'Your name, date', M + 4, 900, 900, 30, { fill: T.onPanelMuted }),
      ],
    }),
  },
  {
    id: 'section', name: 'Section',
    make: (T) => ({
      roles: {
        panel: full, deco1: { x: 1240, y: 420, s: 920 }, deco2: { x: 1080, y: 180, s: 130 },
        bar: { x: M, y: 560, w: 110, h: 12 },
        title: { text: 'Section title', x: M, y: 600, w: 1080, size: 100, fill: T.onPanel },
      },
      extras: [
        head(T, '01', M - 6, 250, 600, 260, { fill: T.accent, lh: 1 }),
        text(T, 'What this part covers', M + 4, 740, 1000, 40, { fill: T.onPanelMuted }),
      ],
    }),
  },
  {
    id: 'agenda', name: 'Agenda',
    make: (T) => ({
      roles: {
        panel: { x: 0, y: 0, w: 700, h: H }, deco1: { x: 170, y: 700, s: 460 }, deco2: { x: 560, y: 140, s: 80 },
        bar: { x: 120, y: 300, w: 96, h: 10 },
        title: { text: 'Agenda', x: 120, y: 170, w: 480, size: 88, fill: T.onPanel },
      },
      extras: [0, 1, 2, 3].flatMap((k) => {
        const y = 190 + k * 190;
        return [
          head(T, '0' + (k + 1), 860, y, 120, 56, { fill: T.strong }),
          head(T, ['First topic', 'Second topic', 'Third topic', 'Wrap-up'][k], 1000, y - 2, 760, 48),
          text(T, 'One line about it', 1000, y + 66, 760, 30, { fill: T.muted }),
          ...(k < 3 ? [rect(860, y + 145, 900, 2, T.line)] : []),
        ];
      }),
    }),
  },
  {
    id: 'titleonly', name: 'Title only',
    make: (T) => ({ roles: content(T, 'Slide title'), extras: [] }),
  },
  {
    id: 'points', name: 'Points',
    make: (T) => ({
      roles: content(T, 'Slide title'),
      extras: [text(T, '•  First point, short and clear\n•  Second point with one idea\n•  Third point that leads to the next slide', M, 320, 1400, 46, { lh: 1.9 })],
    }),
  },
  {
    id: 'twocols', name: 'Two columns',
    make: (T) => ({
      roles: content(T, 'Two ideas side by side'),
      extras: [[M, T.accent, 'First idea'], [1000, T.accent2, 'Second idea']].flatMap(([x, c, h]) => [
        rect(x, 330, 56, 8, c, { r: Math.min(4, T.radius) }),
        head(T, h, x, 365, 760, 52),
        text(T, 'Explain it in two or three short lines. Keep one idea per column.', x, 450, 740, 36, { lh: 1.55 }),
      ]),
    }),
  },
  {
    id: 'compare', name: 'Compare',
    make: (T) => ({
      roles: content(T, 'Before and after'),
      extras: [[M, T.accent, 'Before', 'What it looked like, in one or two lines.'], [1000, T.accent2, 'After', 'What changed, in one or two lines.']].flatMap(([x, c, h, d]) => [
        rect(x, 300, 760, 640, T.card, { r: T.radius }),
        head(T, h, x + 60, 360, 640, 56),
        rect(x + 60, 445, 64, 8, c, { r: Math.min(4, T.radius) }),
        text(T, d, x + 60, 490, 640, 36, { lh: 1.5 }),
      ]),
    }),
  },
  {
    id: 'cards', name: 'Three cards',
    make: (T) => ({
      roles: content(T, 'Three key ideas'),
      extras: [0, 1, 2].flatMap((k) => {
        const x = M + k * 540;
        const c = k === 1 ? T.accent2 : T.accent;
        return [
          rect(x, 300, 500, 620, T.card, { r: T.radius }),
          rect(x + 50, 350, 96, 96, c, { r: decoRadius(T.shape, 96) }),
          head(T, String(k + 1), x + 50, 371, 96, 48, { fill: T.onAccent, align: 'center', lh: 1.1 }),
          head(T, ['Idea one', 'Idea two', 'Idea three'][k], x + 50, 490, 400, 46),
          text(T, 'A sentence or two that explains it.', x + 50, 570, 400, 32, { fill: T.muted, lh: 1.5 }),
        ];
      }),
    }),
  },
  {
    id: 'number', name: 'Big number',
    make: (T) => ({
      roles: {
        ...content(T, ''),
        deco1: { x: 1180, y: 180, s: 640, opacity: 0.16 },
        bar: { x: M, y: 170, w: 96, h: 10 },
        title: { text: 'Key number', x: M, y: 100, w: 1200, size: 40, fill: T.muted },
      },
      extras: [
        head(T, '87%', M - 8, 240, 1400, 340, { fill: T.strong, lh: 1 }),
        text(T, 'of something important, said in one line', M, 640, 1400, 56),
        text(T, 'Source: where the number comes from', M, 900, 1200, 28, { fill: T.muted }),
      ],
    }),
  },
  {
    id: 'stats', name: 'Numbers',
    make: (T) => ({
      roles: content(T, 'In numbers'),
      extras: [0, 1, 2].flatMap((k) => {
        const x = M + k * 540;
        return [
          head(T, ['42', '3×', '98%'][k], x, 330, 500, 150, { fill: T.strong, lh: 1 }),
          rect(x, 520, 64, 8, k === 1 ? T.accent2 : T.accent, { r: Math.min(4, T.radius) }),
          text(T, ['things we measured', 'faster than before', 'of people said yes'][k], x, 560, 460, 38, { lh: 1.4 }),
        ];
      }),
    }),
  },
  {
    id: 'quote', name: 'Quote',
    make: (T) => ({
      roles: {
        panel: full, deco1: { x: 1460, y: 640, s: 620 }, deco2: { x: 1700, y: 120, s: 100 },
        bar: { x: 268, y: 790, w: 80, h: 8 },
        title: { text: 'A sentence worth remembering, set large enough to be read from the back of the room.', x: 260, y: 350, w: 1300, size: 66, fill: T.onPanel, lh: 1.3 },
      },
      extras: [
        head(T, '“', 240, 130, 300, 300, { fill: T.accent, lh: 1 }),
        text(T, 'Name, role', 268, 830, 1000, 36, { fill: T.onPanelMuted }),
      ],
    }),
  },
  {
    id: 'picture', name: 'Picture and text',
    make: (T) => ({
      roles: {
        panel: { x: 1000, y: 0, w: 920, h: H }, deco1: { x: 840, y: 820, s: 300 }, deco2: { x: 1820, y: -40, s: 150 },
        bar: { x: M, y: 300, w: 96, h: 10 },
        title: { text: 'Picture title', x: M, y: 340, w: 760, size: 72 },
      },
      extras: [
        text(T, 'Two or three lines that explain what the picture shows and why it matters here.', M, 470, 740, 38, { lh: 1.5 }),
        text(T, 'Your picture here', 1000, 520, 920, 32, { fill: T.onPanelMuted, align: 'center' }),
      ],
    }),
  },
  {
    id: 'fullpicture', name: 'Full picture',
    make: (T) => ({
      roles: {
        panel: full, deco1: { x: 1640, y: 820, s: 360, opacity: 0.9 }, deco2: { x: 1820, y: 50, s: 70 },
        bar: { x: 180, y: 762, w: 80, h: 8 },
        title: { text: 'Caption title', x: 180, y: 790, w: 820, size: 56 },
      },
      extras: [
        text(T, 'Your picture here', 0, 380, W, 32, { fill: T.onPanelMuted, align: 'center' }),
        rect(120, 720, 940, 260, T.paper, { r: T.radius }),
        text(T, 'One line about what we see.', 180, 880, 820, 32, { fill: T.muted }),
      ],
    }),
  },
  {
    id: 'steps', name: 'Steps',
    make: (T) => ({
      roles: content(T, 'How it works'),
      extras: [
        rect(300, 535, 1320, 6, T.line, { r: Math.min(3, T.radius) }),
        ...[0, 1, 2, 3].flatMap((k) => {
          const x = 240 + k * 440;
          return [
            rect(x, 478, 120, 120, k === 0 ? T.accent : T.card, { r: decoRadius(T.shape === 'square' ? 'square' : 'circle', 120), stroke: T.accent, strokeWidth: 6 }),
            head(T, String(k + 1), x, 508, 120, 52, { fill: k === 0 ? T.onAccent : T.strong, align: 'center' }),
            head(T, ['Start', 'Build', 'Check', 'Share'][k], x - 80, 650, 280, 40, { align: 'center' }),
            text(T, 'One short line', x - 80, 710, 280, 30, { fill: T.muted, align: 'center' }),
          ];
        }),
      ],
    }),
  },
  {
    id: 'timeline', name: 'Timeline',
    make: (T) => ({
      roles: content(T, 'Timeline'),
      extras: [
        rect(M, 560, 1600, 6, T.line, { r: Math.min(3, T.radius) }),
        ...[0, 1, 2, 3, 4].flatMap((k) => {
          const x = 200 + k * 380;
          return [
            rect(x - 18, 545, 36, 36, k % 2 ? T.accent2 : T.accent, { r: decoRadius(T.shape === 'square' ? 'square' : 'circle', 36) }),
            head(T, String(2020 + k), x - 150, 470, 300, 44, { fill: T.strong, align: 'center' }),
            text(T, ['Started', 'First result', 'Grew', 'Changed course', 'Today'][k], x - 150, 610, 300, 32, { align: 'center' }),
          ];
        }),
      ],
    }),
  },
  {
    id: 'definition', name: 'Definition',
    make: (T) => ({
      roles: content(T, 'Key term'),
      extras: [
        rect(M, 300, 1600, 380, T.card, { r: T.radius }),
        rect(M, 300, 14, 380, T.accent, { r: Math.min(7, T.radius) }),
        head(T, 'Word', M + 80, 350, 1400, 64, { fill: T.strong }),
        text(T, 'A clear definition in one or two sentences. Say what it is, then what it is not.', M + 80, 450, 1420, 40, { lh: 1.5 }),
        text(T, 'Example: a short, concrete case that makes it click.', M, 760, 1600, 34, { fill: T.muted }),
      ],
    }),
  },
  {
    id: 'people', name: 'People',
    make: (T) => ({
      roles: content(T, 'The team'),
      extras: [0, 1, 2].flatMap((k) => {
        const cx = M + 260 + k * 540;
        return [
          rect(cx - 140, 320, 280, 280, T.card, { r: decoRadius(T.shape === 'square' ? 'rounded' : 'circle', 280), stroke: T.line, strokeWidth: 2 }),
          text(T, 'Photo', cx - 140, 445, 280, 28, { fill: T.muted, align: 'center' }),
          head(T, 'Name', cx - 200, 640, 400, 44, { align: 'center' }),
          text(T, 'Role', cx - 200, 700, 400, 32, { fill: T.muted, align: 'center' }),
        ];
      }),
    }),
  },
  {
    id: 'end', name: 'Thank you',
    make: (T) => ({
      roles: {
        panel: full, deco1: { x: -220, y: -260, s: 760 }, deco2: { x: 1580, y: 780, s: 260 },
        bar: { x: 912, y: 330, w: 96, h: 12 },
        title: { text: 'Thank you', x: M, y: 380, w: 1600, size: 140, fill: T.onPanel, align: 'center' },
      },
      extras: [
        text(T, 'Questions?', M, 580, 1600, 52, { fill: T.onPanelMuted, align: 'center' }),
        text(T, 'your@email.com', M, 900, 1600, 30, { fill: T.onPanelMuted, align: 'center' }),
      ],
    }),
  },
];

const ROLE_ANIM = { enter: { type: 'fade', duration: 0.8, easing: 'ease-in-out' }, exit: { type: 'fade', duration: 0.35, easing: 'ease-in' } };
const EXTRA_ANIM = { enter: { type: 'fade', duration: 0.45, easing: 'ease-out' }, exit: { type: 'fade', duration: 0.3, easing: 'ease-in' } };

/** A layout of a theme as a template { id, name, w, h, page, anim, theme, layout }. */
export function buildLayout(T, L) {
  const { roles, extras } = L.make(T);
  const r = roleEls(T, roles);
  const children = [...r.under, ...extras, ...r.over].filter((el) => !(el.type === 'text' && el.text === ''));
  const anim = {};
  for (const el of children) anim[el.id] = JSON.parse(JSON.stringify(parseRoleId(el.id) ? ROLE_ANIM : EXTRA_ANIM));
  return {
    id: `${T.id}/${L.id}`, name: L.name, w: W, h: H, theme: T.id, layout: L.id, anim, at: 0,
    page: { id: tmpId(), background: T.paper, children, width: 'auto', height: 'auto', bleed: 0, duration: 5000 },
  };
}

const _cache = new Map();
export function themeLayouts(themeId) {
  const T = themeById(themeId);
  if (!T) return [];
  if (!_cache.has(themeId)) _cache.set(themeId, LAYOUTS.map((L) => buildLayout(T, L)));
  return _cache.get(themeId);
}
