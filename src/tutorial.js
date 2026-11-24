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
  id, type: 'text', text: str, x, y, width: w, height: Math.ceil(size * 1.2 * (o.lines || 1)), fontSize: size,
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

// ---- the states the steps need, and putting them back ---------------------------------------
// Steps never trust the screen: on entering a step its state is checked and, if someone changed the
// practice slides in a way that breaks it, they are put back (and the card says so).
const ORIGINAL = () => tutorialProject().slides;
const KEYS = ['x', 'y', 'width', 'height', 'fill', 'text', 'rotation', 'opacity', 'cornerRadius', 'fontSize'];
// (a text's height is left out: the editor adjusts it to the text by itself)
// A missing value means the editor's default (the editor fills these in when it saves a slide).
const DEFAULTS = { rotation: 0, opacity: 1, cornerRadius: 0 };
const sameEl = (a, b) => !!a && !!b && KEYS.every((k) => {
  if (k === 'height' && b.type === 'text') return true; // text boxes grow to fit their text
  const va = a[k] == null ? DEFAULTS[k] : a[k], vb = b[k] == null ? DEFAULTS[k] : b[k];
  if (va == null && vb == null) return true;
  return typeof va === 'number' && typeof vb === 'number' ? Math.abs(va - vb) < 1.5 : String(va) === String(vb);
});
const els = (sl) => (sl && sl.page && sl.page.children) || [];
const onSlide = (c, k, id) => els(c.project && c.project.slides[k]).find((e) => e.id === id) || null;
/** Slide k still looks like the original slide k (same objects, same places and looks). */
function intact(c, k) {
  const sl = c.project && c.project.slides[k];
  const og = ORIGINAL()[k];
  if (!sl || !og) return false;
  const a = els(sl), b = els(og);
  return a.length === b.length && b.every((e) => sameEl(a.find((x) => x.id === e.id), e));
}
/** Slide 3 is a copy of slide 2: it has the same objects (their looks may differ). */
const isCopy = (c) => {
  const sl = c.project && c.project.slides[2];
  if (!sl) return false;
  const ids = new Set(els(sl).map((e) => e.id));
  return els(sl).length === els(ORIGINAL()[1]).length && els(ORIGINAL()[1]).every((e) => ids.has(e.id));
};
/** How slide k differs from the original slide `og` (0 or 1): objects missing, added, or changed. */
function diff(c, k, og) {
  const a = els(c.project && c.project.slides[k]);
  const b = els(ORIGINAL()[og]);
  const ids = new Set(b.map((e) => e.id));
  return {
    missing: b.filter((e) => !a.some((x) => x.id === e.id)).map((e) => e.id),
    added: a.filter((x) => !ids.has(x.id)),
    changed: b.filter((e) => { const x = a.find((y) => y.id === e.id); return x && !sameEl(x, e); }).map((e) => e.id),
  };
}
/** A slide made of the same kinds of objects as the original slide `og`, but with other IDs. */
const looksLike = (c, k, og) => {
  const a = els(c.project && c.project.slides[k]), b = els(ORIGINAL()[og]);
  return a.length === b.length && b.every((e) => a.some((x) => x.type === e.type && Math.abs((x.width || 0) - (e.width || 0)) < 2));
};
const NAMES = { [SUN]: 'SUN', [BOX]: 'BOX', [TITLE]: 'TITLE', [CAP]: 'CAPTION' };
const sunChanged = (c) => { const a = onSlide(c, 2, SUN); return !!a && !sameEl(a, els(ORIGINAL()[1]).find((e) => e.id === SUN)); };

const sunNamed = (c) => !!c.project && (c.project.objects[SUN] || {}).name === 'SUN';
export const STATE = {
  base: (c) => !!c.project && intact(c, 0) && intact(c, 1) && sunNamed(c),
  dup: (c) => STATE.base(c) && c.project.slides.length === 3 && isCopy(c),
  changed: (c) => STATE.dup(c) && sunChanged(c),
};

function copyOfSlide2(changed) {
  const s2 = JSON.parse(JSON.stringify(ORIGINAL()[1]));
  s2.id = 'tut-s3'; s2.page.id = 'tut-s3';
  if (changed) {
    const sun = s2.page.children.find((e) => e.id === SUN);
    Object.assign(sun, { x: 300, y: 330, width: 300, height: 300, cornerRadius: 150, fill: '#34a853', stroke: '#34a853' });
  }
  return s2;
}
/** Put the practice slides in the state a step needs (keeps the person's slide 3 when it is still right). */
export function restore(c, need, active) {
  const og = ORIGINAL();
  let slides;
  if (need === 'base') slides = og;
  else if (need === 'dup') slides = [...og, STATE.dup(c) ? JSON.parse(JSON.stringify(c.project.slides[2])) : copyOfSlide2(false)];
  else slides = [...og, STATE.changed(c) ? JSON.parse(JSON.stringify(c.project.slides[2])) : copyOfSlide2(true)];
  c.setTutorialSlides(slides, active == null ? Math.min(c.active, slides.length - 1) : active);
}
/** Make sure the state a step needs is there; true if something had to be put back. */
export function ensureState(c, need) {
  if (!need || !c.tutorial || STATE[need](c)) return false;
  restore(c, need);
  return true;
}

// ---- helpers used by the steps --------------------------------------------------------------
/** Go to slide k, select an object there and open the Animation panel on it. */
function show(c, k, id) {
  if (!c.project || k >= c.project.slides.length) return;
  c.selectSlide(k);
  if (c.openAnim) c.openAnim();
  if (id) setTimeout(() => { try { c.store.selectElements([id]); } catch (e) { /* not there */ } }, 60);
}

/**
 * Steps. target: what to point at (CSS selectors, first visible wins). need: the state of the practice
 * slides it needs (base: slides 1 and 2 as made; dup: plus a copy of slide 2; changed: with SUN changed on
 * that copy). setup(c): put the screen in the right state. demo: [a, b] plays slide a → b inside the card.
 * interactive: the page stays usable, and Next waits until check(c) is true. problem(c): what went wrong,
 * fixed by fix(c). doIt(c): "Show me" does it. owner: only for the space owner. optional: skipped when its
 * target is not on screen when the tutorial starts.
 */
export const TUTORIAL_STEPS = [
  {
    id: 'ids', target: '.obj-head', need: 'base', setup: (c) => show(c, 0, SUN),
    title: 'Every object has an ID',
    body: 'This yellow circle is called SUN. Its ID is shown here, in the Animation panel. You can rename it: IDs are just names, like SUN, TITLE or A28. They are not shown on the slides.',
  },
  {
    id: 'same', target: '.sorter .slide-item[data-index="1"] .slide-thumb', need: 'base', setup: (c) => show(c, 1, SUN),
    title: 'The same ID on the next slide',
    body: 'Slide 2 also has an object called SUN: bigger, on the right, and red. The same ID on two slides in a row means it is the same object.',
  },
  {
    id: 'watch', demo: [0, 1], need: 'base',
    title: 'Watch the morph',
    body: 'From slide 1 to slide 2, SUN moves, grows and turns red by itself. That is a morph. BOX is not on slide 2, so it fades out. The caption is new, so it fades in. The title has the same ID on both: it moves and its words change.',
  },
  {
    id: 'dup', target: '.sorter .slide-item[data-index="1"]', interactive: true, need: 'base',
    setup: (c) => { show(c, 1, null); setTimeout(() => { try { c.store.selectElements([]); } catch (e) { /* ignore */ } }, 120); },
    title: 'Your turn: duplicate slide 2',
    body: 'In the slide list on the left, hover slide 2 and click its Duplicate button (the two small squares), or right-click slide 2 › Duplicate. The new slide 3 keeps the same IDs, so SUN is on it too.',
    check: (c) => STATE.dup(c),
    problem: (c) => {
      const p = c.project;
      if (!sunNamed(c)) return 'SUN was renamed. The tutorial needs its name to stay SUN.';
      if (p.slides.length < 2) return 'A slide was deleted.';
      // what happened to slide 2? (duplicating slide 1 puts its copy in second place)
      if (p.slides.length >= 3 && diff(c, 1, 0).missing.length === 0 && diff(c, 1, 0).added.length === 0 && intact(c, 0)) {
        return 'That duplicated slide 1. Duplicate slide 2 instead: the one with the big red circle.';
      }
      const d2 = diff(c, 1, 1);
      if (d2.added.length) {
        const copyOfOne = d2.added.some((x) => els(ORIGINAL()[1]).some((e) => e.type === x.type && Math.abs((x.width || 0) - (e.width || 0)) < 2));
        return copyOfOne
          ? 'That duplicated an object on the slide, not the slide itself. Use the Duplicate button of slide 2 in the slide list on the left.'
          : 'Something was added to slide 2.';
      }
      if (d2.missing.length) return t('{names} was deleted from slide 2.', { names: d2.missing.map((id) => NAMES[id] || '?').join(', ') });
      if (d2.changed.length) return t('Slide 2 was changed ({names}).', { names: d2.changed.map((id) => NAMES[id] || '?').join(', ') });
      if (!intact(c, 0)) return 'Slide 1 was changed.';
      if (p.slides.length >= 3 && !isCopy(c)) {
        const s3 = els(p.slides[2]);
        if (!s3.length) return 'That added an empty slide. Duplicate slide 2 instead.';
        if (looksLike(c, 2, 1)) return 'That copy has new objects (“Duplicate as new objects”), so nothing would morph. Use plain Duplicate.';
        if (diff(c, 2, 1).added.length && !diff(c, 2, 1).missing.length) return 'Slide 3 is a copy of slide 2 with something added.';
        return 'Slide 3 is not a copy of slide 2.';
      }
      if (p.slides.length > 3) return 'One copy is enough.';
      return null;
    },
    fix: (c) => { restore(c, 'base', 1); setTimeout(() => { try { c.store.selectElements([]); } catch (e) { /* ignore */ } }, 120); },
    doIt: (c) => { restore(c, 'base', 1); c.duplicateSlide(1); c.selectSlide(2); },
  },
  {
    id: 'change', target: '.raeditor-workspace-container', interactive: true, need: 'dup',
    setup: (c) => show(c, 2, SUN),
    title: 'Now change SUN on slide 3',
    body: 'On slide 3, drag SUN (the red circle) somewhere else, make it smaller with a corner handle, or give it another color in the toolbar. Whatever you change will be animated.',
    check: (c) => STATE.changed(c),
    problem: (c) => {
      const p = c.project;
      if (!sunNamed(c)) return 'SUN was renamed. The tutorial needs its name to stay SUN.';
      if (p.slides.length > 3) return 'There are more slides than the tutorial needs.';
      if (!p.slides[2]) return 'Slide 3 is gone.';
      if (!intact(c, 1)) return 'That was slide 2. Change SUN on slide 3 (the copy).';
      if (!intact(c, 0)) return 'Slide 1 was changed.';
      const d3 = diff(c, 2, 1);
      if (d3.missing.includes(SUN)) return 'SUN is not on slide 3 anymore.';
      if (d3.missing.length) return t('{names} was deleted from slide 3.', { names: d3.missing.map((id) => NAMES[id] || '?').join(', ') });
      if (d3.added.length) return 'Slide 3 has an extra object (did you duplicate SUN?). Change SUN itself instead.';
      return null;
    },
    // Not a mistake, but worth saying: where they are, or what they changed instead.
    hint: (c) => {
      if (c.active !== 2) return t('You are on slide {n}. Click slide 3 in the slide list first.', { n: c.active + 1 });
      const d3 = diff(c, 2, 1);
      if (d3.changed.length && !d3.changed.includes(SUN)) return t('You changed {names}. This step is about SUN, the red circle.', { names: d3.changed.map((id) => NAMES[id] || '?').join(', ') });
      return null;
    },
    fix: (c) => { restore(c, 'dup', 2); setTimeout(() => { try { c.store.selectElements([SUN]); } catch (e) { /* ignore */ } }, 80); },
    doIt: (c) => { restore(c, 'changed', 2); setTimeout(() => { try { c.store.selectElements([SUN]); } catch (e) { /* ignore */ } }, 80); },
  },
  {
    id: 'watch2', demo: [1, 2], need: 'changed',
    title: 'Watch your morph',
    body: 'SUN travels from where it is on slide 2 to where you put it on slide 3. You never drew a path: Morph works it out.',
  },
  {
    id: 'how', target: '.anim .step, .anim', need: 'changed', setup: (c) => show(c, 2, SUN),
    title: 'How it arrives and leaves',
    body: 'With an object selected, the Animation panel says what happens to it, slide by slide. Arrives: Morph or Jump if it was on the slide before, Fade in or Just appear if it is new. Leaves: the same toward the next slide. Then how long it takes, and how it moves (try Bounce). The Play buttons above preview it.',
  },
  {
    id: 'link', target: '.obj-actions', need: 'base', setup: (c) => show(c, 1, CAP),
    title: 'Turn one object into another',
    body: 'Two objects with different IDs do not morph. To make them the same object, click “Same object as…” and pick the other one (or type its ID in the ID box). A word can even morph into a picture. “Separate here” does the opposite. Copying an object and pasting it on the next slide keeps its ID too.',
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
    body: 'What you want to say on each slide. While presenting, press S to see them: you can change them right there, and drag them anywhere on the screen. The exported file keeps them only as hidden comments in its code.',
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
