// The tutorial: a practice presentation (never saved) and the steps that walk through it.
// It explains object IDs and morphing by showing them, lets the person do one morph themselves
// ("Show me" does it for them), then points at the rest of the interface.
//
// Keep it in step with the interface: when something it points at changes, update the step here
// and bump TOUR_VERSION in ui/Tour.jsx. test/e2e/tour_test.py walks through every step.
import { t } from './i18n';
import { blankPage } from './project';

const BG = '#f6f8fc';
const SUN = 'tut-sun', BOX = 'tut-box', TITLE = 'tut-title', CAP = 'tut-cap';
export const TUTORIAL_IDS = { SUN, BOX, TITLE, CAP };

const text = (id, str, x, y, w, size, o = {}) => ({
  id, type: 'text', text: str, x, y, width: w, height: Math.round(size * 1.2 * (o.lines || 1)), fontSize: size,
  fontFamily: 'Outfit', fontWeight: o.weight || 'bold', fontStyle: 'normal', fill: o.fill || '#1b1f27', align: 'left',
  lineHeight: 1.2, letterSpacing: 0, opacity: 1,
});
const circle = (id, x, y, s, fill) => ({ id, type: 'figure', subType: 'rect', x, y, width: s, height: s, cornerRadius: s / 2, fill, stroke: fill, strokeWidth: 0, opacity: 1, rotation: 0 });

export function tutorialProject() {
  const page = (id, children) => ({ ...blankPage(), id, background: BG, children });
  return {
    version: 1, title: t('Practice presentation'), width: 1920, height: 1080, fonts: [],
    objects: { [SUN]: { name: 'SUN' }, [BOX]: { name: 'BOX' }, [TITLE]: { name: 'TITLE' }, [CAP]: { name: 'CAPTION' } },
    settings: {}, owners: {},
    notes: { 'tut-s1': t('Speaker notes go here: what you want to say on this slide.') },
    slides: [
      {
        id: 'tut-s1',
        page: page('tut-s1', [
          text(TITLE, t('Morph in 2 minutes'), 160, 120, 1500, 96),
          circle(SUN, 260, 500, 240, '#fbbc04'),
          { id: BOX, type: 'figure', subType: 'rect', x: 1320, y: 470, width: 300, height: 300, cornerRadius: 28, fill: '#4285f4', stroke: '#4285f4', strokeWidth: 0, opacity: 1, rotation: 0 },
        ]),
        anim: { [BOX]: { exit: { type: 'fade', duration: 0.5, easing: 'ease-in' } } },
      },
      {
        id: 'tut-s2',
        page: page('tut-s2', [
          text(TITLE, t('Same ID = same object'), 160, 90, 1500, 64),
          circle(SUN, 1180, 260, 520, '#ea4335'),
          text(CAP, t('I am new on this slide, so I fade in.'), 160, 820, 900, 44, { weight: 'normal', fill: '#5f6368' }),
        ]),
        anim: {
          [TITLE]: { enter: { type: 'fade', duration: 0.9, easing: 'ease-in-out' } },
          [SUN]: { enter: { type: 'fade', duration: 1.2, easing: 'ease-in-out' } },
          [CAP]: { enter: { type: 'fade', duration: 0.6, easing: 'ease-out' } },
        },
      },
    ],
  };
}

// ---- helpers used by the steps --------------------------------------------------------------
const onSlide = (c, k, id) => {
  const sl = c.project && c.project.slides[k];
  return sl ? (sl.page.children || []).find((e) => e.id === id) || null : null;
};
/** Go to slide k, select an object there and open the Animation panel on it. */
function show(c, k, id) {
  if (!c.project || k >= c.project.slides.length) return;
  c.selectSlide(k);
  if (c.openAnim) c.openAnim();
  if (id) setTimeout(() => { try { c.store.selectElements([id]); } catch (e) { /* not there */ } }, 60);
}
const moved = (a, b) => !!a && !!b && ['x', 'y', 'width', 'height', 'fill', 'rotation', 'opacity', 'cornerRadius'].some((k) => {
  const va = a[k], vb = b[k];
  return typeof va === 'number' ? Math.abs(va - vb) > 2 : String(va) !== String(vb);
});

/**
 * Steps. target: what to point at (CSS selectors, first visible wins). setup(c): put the screen in the
 * right state first. demo: [a, b] plays slide a → b inside the card. interactive: the page stays usable.
 * check(c): shows a tick when the person has done it. doIt(c): "Show me" does it for them.
 * owner: only for the space owner. optional: skipped when its target is not on screen.
 */
export const TUTORIAL_STEPS = [
  {
    id: 'ids', target: '.obj-head', setup: (c) => show(c, 0, SUN),
    title: 'Every object has an ID',
    body: 'This yellow circle is called SUN. Its ID is shown here, in the Animation panel. You can rename it: IDs are just names, like SUN, TITLE or A28. They are not shown on the slides.',
  },
  {
    id: 'same', target: '.sorter .slide-item[data-index="1"] .slide-thumb', setup: (c) => show(c, 1, SUN),
    title: 'The same ID on the next slide',
    body: 'Slide 2 also has an object called SUN: bigger, on the right, and red. The same ID on two slides in a row means it is the same object.',
  },
  {
    id: 'watch', demo: [0, 1],
    title: 'Watch the morph',
    body: 'From slide 1 to slide 2, SUN moves, grows and turns red by itself. That is a morph. BOX is not on slide 2, so it fades out. The caption is new, so it fades in. The title has the same ID on both: it moves and its words change.',
  },
  {
    id: 'dup', target: '.sorter .slide-item[data-index="1"]', interactive: true, setup: (c) => show(c, 1, null),
    title: 'Your turn: copy slide 2',
    body: 'Hover slide 2 and click its copy button (or press Ctrl+D). The copy keeps the same IDs, so SUN is on slide 3 too.',
    check: (c) => !!onSlide(c, 2, SUN),
    doIt: (c) => { c.duplicateSlide(1); c.selectSlide(2); },
  },
  {
    id: 'change', target: '.raeditor-workspace-container', interactive: true,
    setup: (c) => { if (onSlide(c, 2, SUN)) show(c, 2, SUN); },
    title: 'Now change SUN on slide 3',
    body: 'Drag SUN somewhere else, make it smaller, or give it another color in the toolbar. Whatever you change will be animated.',
    check: (c) => moved(onSlide(c, 1, SUN), onSlide(c, 2, SUN)),
    doIt: (c) => {
      if (!onSlide(c, 2, SUN)) { c.duplicateSlide(1); }
      c.selectSlide(2);
      setTimeout(() => {
        const el = c.store.getElementById && c.store.getElementById(SUN);
        if (el) el.set({ x: 300, y: 330, width: 300, height: 300, cornerRadius: 150, fill: '#34a853', stroke: '#34a853' });
      }, 80);
    },
  },
  {
    id: 'watch2', demo: [1, 2],
    title: 'Watch your morph',
    body: 'SUN travels from where it is on slide 2 to where you put it on slide 3. You never drew a path: Morph works it out.',
  },
  {
    id: 'how', target: '.anim .step, .anim', setup: (c) => show(c, Math.min(2, c.project.slides.length - 1), SUN),
    title: 'How it arrives and leaves',
    body: 'With an object selected, the Animation panel says what happens to it, slide by slide. Arrives: Morph or Jump if it was on the slide before, Fade in or Just appear if it is new. Leaves: the same toward the next slide. Then how long it takes, and how it moves (try Bounce). The Play buttons above preview it.',
  },
  {
    id: 'link', target: '.obj-actions', setup: (c) => show(c, 1, CAP),
    title: 'Turn one object into another',
    body: 'Two objects with different IDs do not morph. To make them the same object, click “Same object as…” and pick the other one (or type its ID in the ID box). A word can even morph into a picture. “Separate here” does the opposite.',
  },
  {
    id: 'layouts', target: '.sorter-head button[data-tour="layouts"]', optional: true,
    title: 'Themes do it for you',
    body: 'Pick a theme here: its slide layouts already share their shapes, so going from one layout to the next morphs on its own. Once you have a theme, + offers its layouts.',
  },
  {
    id: 'add', target: '.raeditor-side-tabs-container', optional: true,
    title: 'Add things',
    body: 'Text, shapes, equations (with LaTeX packages), your own pictures, and, online, free photos and icons.',
  },
  {
    id: 'notes', target: '.notes-bar', optional: true,
    title: 'Speaker notes',
    body: 'What you want to say on each slide. While presenting, press S to see them, and you can change them right there. They are never in the exported file.',
  },
  {
    id: 'assign', target: '.sorter', optional: true,
    title: 'Give slides to people',
    body: 'Right-click a slide › Assign to. While presenting, the top-left corner says whose turn it is. The person button above the slides shows only yours.',
  },
  {
    id: 'share', target: '.share-chip', owner: true, optional: true,
    title: 'Share',
    body: 'In your own presentations, the lock next to the title shares them: each person gets their own secret link, and removing the person turns their link off.',
  },
  {
    id: 'present', target: '.present-group', optional: true,
    title: 'Present',
    body: 'Arrows, Page Up/Down and classroom clickers change slides. B blacks out the screen, L is a laser pointer, S shows your notes, Esc leaves.',
  },
  {
    id: 'export', target: '.topbar button:has(.bp5-icon-export)', optional: true,
    title: 'Export',
    body: 'One standalone .html file that plays your presentation anywhere, even offline. It always starts on slide 1.',
  },
  {
    id: 'done', final: true,
    title: 'You’re ready',
    body: 'This practice presentation is not saved. You can keep playing with it, or go back to your own presentation. The tutorial is always in the ⋯ menu.',
  },
];
