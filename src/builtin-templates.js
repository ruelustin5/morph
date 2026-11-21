// Slide templates that come with the app (1920×1080). Their objects get new IDs when inserted.
const H1 = 'Outfit';
const BODY = 'Inter';
let n = 0;
const id = () => 'tpl' + (++n);

const text = (t, x, y, w, size, o = {}) => ({
  id: id(), type: 'text', text: t, x, y, width: w, height: Math.round(size * (o.lineHeight || 1.2) * (t.split('\n').length)),
  fontSize: size, fontFamily: o.font || BODY, fontWeight: o.weight || 'normal', fontStyle: o.style || 'normal',
  fill: o.fill || '#1f1f1f', align: o.align || 'left', lineHeight: o.lineHeight || 1.2, letterSpacing: o.spacing || 0,
});
const rect = (x, y, w, h, fill, o = {}) => ({
  id: id(), type: 'figure', subType: o.circle ? 'circle' : 'rect', x, y, width: w, height: h, fill,
  stroke: o.stroke || '#ffffff', strokeWidth: o.strokeWidth || 0, cornerRadius: o.r || 0,
});
const page = (background, children) => ({ id: id(), background, children, width: 'auto', height: 'auto', bleed: 0, duration: 5000 });

export const BUILTIN_TEMPLATES = [
  {
    id: 'b-title', name: 'Title',
    page: page('#0b1324', [
      rect(160, 340, 140, 12, '#7cacf8', { r: 6 }),
      text('Presentation title', 160, 390, 1400, 128, { font: H1, weight: 'bold', fill: '#ffffff', lineHeight: 1.05 }),
      text('A short subtitle that says what this is about', 164, 560, 1300, 44, { fill: '#a8b9d6' }),
      text('Your name  ·  Date', 164, 880, 900, 32, { fill: '#6f84a8' }),
    ]),
  },
  {
    id: 'b-section', name: 'Section',
    page: page('#1a3d8f', [
      text('01', 160, 300, 600, 280, { font: H1, weight: 'bold', fill: '#7cacf8', lineHeight: 1 }),
      text('Section title', 168, 620, 1500, 96, { font: H1, weight: 'bold', fill: '#ffffff' }),
      text('What this part covers', 172, 760, 1300, 40, { fill: '#c2d4f7' }),
    ]),
  },
  {
    id: 'b-bullets', name: 'Title and points',
    page: page('#ffffff', [
      text('Slide title', 160, 130, 1600, 80, { font: H1, weight: 'bold', fill: '#0b1324' }),
      rect(160, 250, 100, 8, '#0b57d0', { r: 4 }),
      text('First point, short and clear\nSecond point with one idea\nThird point that leads to the next slide', 160, 330, 1500, 48,
        { fill: '#3c4043', lineHeight: 1.8 }),
    ]),
  },
  {
    id: 'b-two', name: 'Two columns',
    page: page('#f6f8fc', [
      text('Compare two things', 160, 130, 1600, 80, { font: H1, weight: 'bold', fill: '#0b1324' }),
      rect(160, 300, 760, 600, '#ffffff', { r: 28 }),
      rect(1000, 300, 760, 600, '#ffffff', { r: 28 }),
      text('First', 220, 360, 640, 52, { font: H1, weight: 'bold', fill: '#0b57d0' }),
      text('Describe the first option in a sentence or two.', 220, 450, 640, 36, { fill: '#3c4043', lineHeight: 1.5 }),
      text('Second', 1060, 360, 640, 52, { font: H1, weight: 'bold', fill: '#b3261e' }),
      text('Describe the second option in a sentence or two.', 1060, 450, 640, 36, { fill: '#3c4043', lineHeight: 1.5 }),
    ]),
  },
  {
    id: 'b-number', name: 'Big number',
    page: page('#fff4e0', [
      text('87%', 160, 250, 1600, 360, { font: H1, weight: 'bold', fill: '#b05a00', lineHeight: 1 }),
      text('of something important, said in one line', 172, 650, 1500, 56, { fill: '#5c3c00' }),
      text('Source: where the number comes from', 172, 900, 1200, 28, { fill: '#8a6a3a' }),
    ]),
  },
  {
    id: 'b-quote', name: 'Quote',
    page: page('#141218', [
      text('“', 150, 120, 300, 360, { font: 'Playfair Display', weight: 'bold', fill: '#f2b84b', lineHeight: 1 }),
      text('A sentence worth remembering, set large enough to be read from the back of the room.', 260, 380, 1400, 72,
        { font: 'Playfair Display', style: 'italic', fill: '#ffffff', lineHeight: 1.3 }),
      text('— Name, role', 264, 760, 1200, 36, { fill: '#a9a3b4' }),
    ]),
  },
  {
    id: 'b-image', name: 'Picture and text',
    page: page('#ffffff', [
      rect(0, 0, 900, 1080, '#e3e8f1'),
      text('Replace this block with a picture', 120, 500, 660, 32, { fill: '#7b8597', align: 'center' }),
      text('Picture title', 1020, 330, 760, 80, { font: H1, weight: 'bold', fill: '#0b1324' }),
      text('Two or three lines that explain what the picture shows and why it matters here.', 1020, 460, 760, 40,
        { fill: '#3c4043', lineHeight: 1.5 }),
    ]),
  },
  {
    id: 'b-steps', name: 'Steps',
    page: page('#ffffff', [
      text('How it works', 160, 130, 1600, 80, { font: H1, weight: 'bold', fill: '#0b1324' }),
      rect(300, 535, 1320, 6, '#d3e3fd', { r: 3 }),
      ...[0, 1, 2, 3].flatMap((k) => [
        rect(240 + k * 440, 478, 120, 120, k === 0 ? '#0b57d0' : '#ffffff', { circle: true, stroke: '#0b57d0', strokeWidth: 6 }),
        text(String(k + 1), 240 + k * 440, 508, 120, 52, { font: H1, weight: 'bold', fill: k === 0 ? '#ffffff' : '#0b57d0', align: 'center' }),
        text(['Start', 'Build', 'Check', 'Share'][k], 160 + k * 440, 650, 280, 40, { font: H1, weight: 'bold', fill: '#0b1324', align: 'center' }),
        text('One short line', 160 + k * 440, 710, 280, 30, { fill: '#5f6368', align: 'center' }),
      ]),
    ]),
  },
  {
    id: 'b-end', name: 'Thank you',
    page: page('#0b57d0', [
      text('Thank you', 160, 380, 1600, 160, { font: H1, weight: 'bold', fill: '#ffffff', align: 'center' }),
      text('Questions?', 160, 600, 1600, 56, { fill: '#d3e3fd', align: 'center' }),
    ]),
  },
].map((t) => ({ ...t, builtin: true, w: 1920, h: 1080, anim: {}, at: 0 }));

/** Fit a page made for w×h into W×H (same proportions kept, centred). */
export function fitPage(page, w, h, W, H) {
  if (w === W && h === H) return page;
  const s = Math.min(W / w, H / h);
  const dx = (W - w * s) / 2, dy = (H - h * s) / 2;
  const walk = (el) => {
    const o = { ...el, x: (el.x || 0) * s + dx, y: (el.y || 0) * s + dy, width: (el.width || 0) * s, height: (el.height || 0) * s };
    for (const k of ['fontSize', 'strokeWidth', 'cornerRadius']) if (typeof el[k] === 'number') o[k] = el[k] * s;
    if (Array.isArray(el.children)) o.children = el.children.map((c) => ({ ...walk(c), x: (c.x || 0) * s, y: (c.y || 0) * s }));
    return o;
  };
  return { ...page, children: (page.children || []).map(walk) };
}
