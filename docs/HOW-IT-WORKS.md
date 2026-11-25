# How Morph works

For people who want to change the code. To install your own copy, see [SETUP.md](../SETUP.md).

## Two versions, one code base

| | Website (`node build.mjs web` → `dist-web/`) | Claude artifact (`node build.mjs` → `dist/`) |
|---|---|---|
| Hosting | GitHub Pages, published on every push to `main` (`.github/workflows/deploy.yml`) | claude.ai artifact |
| Storage, live editing | Firebase free plan: Firestore + Realtime Database (`src/web/platform.js`) | the artifact's `db` and `room` |
| Who can edit | the owner (Google sign-in) and anyone with a project's magic link, no account | people invited on claude.ai with "Can edit" |
| Setup | **[SETUP.md](../SETUP.md)** | none |

`src/web/platform.js` gives the app the same `window.claude.use(name)` services the artifact runtime provides
(db, room, user, downloads), so everything else is shared. Rules: `firestore.rules`, `database.rules.json`.
`node build.mjs webtest` builds the website against a fake Firebase (`test/fake-firebase/`) for local tests.

**Magic links** (`https://…/morph/#ABCD-EFGH-JKLM`): the part after `#` is never sent to a server. It opens an
invite that holds the project's encryption key (see "Your space and sharing" below), the app saves it in that
browser, and removes it from the address bar. Removing a person gives the project a new key.

## What's in it

- **Editor**: [OpenPolotno](https://www.npmjs.com/package/@reyka/openpolotno) (MIT), bundled from its TypeScript
  source and used as-is. The app only configures it (English strings, font list, side-panel sections) and
  loads one slide at a time into it.
- **Slides**: the list on the left. Drag to reorder, insert between slides, duplicate (objects stay linked)
  or "duplicate as new objects", delete with undo, save a slide as a template and start new slides from one
  (templates are shared by all projects; their objects always get new IDs).
- **IDs**: every object has an ID (A28, K5…). Shown in capitals, compared without case ("pig" = "PIG").
  The same ID on two neighbouring slides makes the object move/transform between them. Link = "same object
  as…": when the object is on several slides you choose *this slide* or *all slides* (e.g. three PIG and
  three PIGGY: linking one PIG to PIGGY with "all slides" makes the six the same object; slides that already
  have a PIGGY keep their PIG). Typing an existing ID offers the link instead of an error. A picture added
  that is already used on another slide offers "Make it the same object". Per object: "Same object in
  duplicates" (off = duplicated slides and templates get a separate copy).
- **Animation**: In (morph or jump when it was on the previous slide, otherwise none or fade in) and Out
  (the next slide's In when it continues, otherwise none or fade out), 8 speed curves, duration.
  Settings live on the slide where the object arrives, so reordering slides never loses anything.
  Right-click an object › Animation opens the panel on it.
- **Equations**: LaTeX with MathJax 3 (`dist/mathjax/tex-svg-full.js`, plus `physics` downloaded when turned on).
  The package manager (Equation › Packages) keeps the list per presentation in `settings.latex.packages`:
  MathJax extensions, plus small versions written here (siunitx, dsfont, bbm, esint, xfrac, nicefrac as macros).
  `\usepackage{…}` still works for known packages; unknown ones (tikz) are reported. Inserted as a
  self-contained SVG (`custom.latex` keeps the source).
  That list is every package MathJax can run, so there is no online "library" to search: a real LaTeX package
  cannot run in MathJax (and CTAN does not allow requests from web pages). What does work is a package's
  command definitions: drop a `.sty` / `.tex` file (or type the lines) and `src/latex-macros.js` reads
  `\newcommand`, `\renewcommand`, `\providecommand`, `\DeclareMathOperator`, `\DeclarePairedDelimiter`, `\def`,
  `\let`, simple `\NewDocumentCommand` and `\newenvironment` into MathJax macros. Each one is tried in MathJax
  (`checkMacros`) and dropped if it uses something MathJax does not have. They are kept in `settings.latex.files`.
- **Notes and slide owners**: `notes` and `owners` maps in the project (per slide id), merged key by key between
  people. Notes show in the in-app presenter (S). In exported files they are HTML comments, one per slide in
  slide order, just before `<div id="deck">` (`notesComments` in `src/export.js`). Only **Export with speaker
  notes** also puts them in the slide data (`notes: [{ t: text, w: name of who presents }]`), with the names;
  the player then has a notes panel (S, `createPlayer({ notes })` in `src/player.js`): `[cues]` highlighted,
  whose turn it is (highlighted when it changes) and who is next, movable and resizable, its place kept in
  `localStorage` as fractions of the window. While presenting, the notes
  panel can be dragged by its top bar and resized by its corner; its place is kept on the device (double-click
  the bar to put it back). People's names for owners
  are kept in `settings.people`, inside the (encrypted) project.
- **Languages**: `src/i18n.js` picks French when the browser prefers it (`morph-lang` in localStorage overrides);
  strings are English in the code and looked up in `src/i18n-fr.js`; the editor's own strings in
  `src/i18n-editor-fr.js`; the player carries its own few words (it also runs in exported files).
- **Tour**: `src/ui/Tour.jsx`. Steps point at real elements and are skipped when their target is not on screen.
  Bump `TOUR_VERSION` when the interface changes so people see the new tour once.
- **Fonts**: every Google Font with Latin characters (1,891 families, `src/google-fonts.json`, made from the
  `google-font-metadata` package), searchable and filterable by kind, with classics first.
- **Themes**: 10 themes × 18 layouts (`src/themes.js`). Four shape "role" objects (panel, two decorations, accent
  bar) keep the IDs `th-<theme>-<role>` on every layout of a theme, so layouts morph into each other. Text never
  shares an ID between layouts (a different text is a different object). Older presentations gave every title
  the ID `th-<theme>-title`; when one is opened, each title gets its own ID (`splitThemeTitles`), except on
  slides in a row with the same text. The project's theme is `settings.theme`, and **+** opens its layouts. Switching theme can restyle the slides made
  with the old one (colors, fonts, corner radii and role IDs are mapped). Your own templates: right-click a slide.
- **Panels**: click the open tab again (or the round arrow) to close the side panel; × or the Animation
  button closes the animation panel.
- **Undo / redo** (`src/history.js`): Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y and the arrows above the slide undo any
  change: objects, slides added, deleted, duplicated or moved, layouts, theme, slide size, IDs and links, notes,
  owners. A step stores ops (the live-editing diff format, `src/sync-core.js`), and undo applies the reverse
  ops to the presentation as it is now, so collaborators' changes in the meantime stay. Changes in a row
  (dragging, typing) become one step after 350 ms of quiet; operations listed in `STEP_METHODS` are steps of
  their own. Text boxes growing to fit and collaborators' edits are not steps. Text fields keep their own undo.
- **Copy and paste** (`src/clipboard.js`): Ctrl+C / Ctrl+X / Ctrl+V and the right-click menu. Pasting on
  another slide of the same presentation keeps the object's ID if that slide does not have it, so it morphs
  (a toast says so and offers "Make separate"); on the same slide, or a second time, it gets a new ID. The
  copy is kept in `localStorage` (other tabs and presentations, which always get new IDs); the system
  clipboard gets the objects' text plus a marker, so text copied from another app is pasted as a new text box.
- **Text boxes grow to fit** (`src/text-fit.js`): the canvas cuts off any line that does not fit in a text
  box's height, so the box is made taller whenever its text needs more room (never smaller).
- **Slide size**: ⋯ menu › Slide size (`src/ui/SlideSize.jsx`). It applies to every slide, so it is not in
  the side panel; the content of each slide is scaled and centered with `fitPage`, unless that is turned off.
- **Theme style**: new text (heading, subheading, body) and new shapes take the theme's fonts and colors, or a
  base style when there is no theme; colors are chosen for contrast with the slide's background (`styleFor`).
- **Presenting / export**: the same renderer draws thumbnails, the in-app presenter and the standalone
  `.html` export: space, click, arrows, PageUp/PageDown (presentation clickers), B or "." black screen,
  W or "," white screen, L laser pointer, F full screen, ? shortcuts, swipe on touch screens.
- **Versions** (like Google Slides): edits are saved continuously; a version is recorded automatically
  after 10 minutes of editing, and you can name the current version at any time. Version history shows
  every version with its authors; restore keeps the current state as a version first; "Make a copy" turns
  a version into a new project. Old automatic versions are thinned (all of the last 2 h, then hourly for a
  day, daily for a month); named versions are kept.

## Online features (website only)

The website adds **Photos** ([Wikimedia Commons](https://commons.wikimedia.org), freely licensed; the credit goes
into the slide's notes) and **Icons** ([Iconify](https://iconify.design)), `src/ui/OnlinePanels.jsx`. Pictures are copied into the
project (at most 1920 px), so presentations keep working offline. The Claude artifact cannot reach the internet.

**Remove background** (picture toolbar and right-click menu, `src/bg-remove.js`, `src/ui/BgRemove.jsx`) runs the
IS-Net "general use" model (Apache 2.0) with ONNX Runtime Web, in the browser: pictures never leave the computer.
The model (`assets/bg/`, 90 MB, made with `assets/bg/convert.py`, see `assets/bg/README.md`) and the runtime are
served from the site's `bg/` folder and downloaded only when someone first uses it (a dialog asks first); the
model is then kept in Cache Storage. WebGPU when available, else WebAssembly in a worker (slower, the editor stays
usable); if the GPU returns an unusable result it is done again on the processor. The result is a WebP with
transparency trimmed to the subject, placed exactly where the subject was (crop, rotation and flips included),
and Ctrl+Z puts the original back. Not in the Claude artifact (the model is too big to ship there).

## Removed because an artifact cannot reach the internet

Artifacts run in a sandbox: no requests to outside servers, no remote images. These editor features call
the editor's online API (api.polotno.com, which also needs a paid key) and were removed:

| Removed | Where it was | How to bring it back |
|---|---|---|
| Templates tab | `DEFAULT_SECTIONS` → `templates` | Keep it in `SECTIONS` in `src/App.jsx` |
| Photos tab (Unsplash) | `DEFAULT_SECTIONS` → `photos` | Keep it in `SECTIONS` in `src/App.jsx` |
| Text templates under the quick text buttons | built-in Text panel | Use the built-in `TextSection` instead of `OfflineTextSection` (`src/ui/OfflinePanels.jsx`) |
| Unsplash photo search in Background | built-in Background panel | Use the built-in `BackgroundSection` instead of `OfflineBackgroundSection` |
| SVG catalog search in Elements | `store.setShowCustomSvg(false)` in `src/main.jsx` | Set it back to `true` |
| AI writing tools | `store.setAiToolsEnabled(false)` in `src/main.jsx` | Set it back to `true` |

When hosting it yourself (e.g. a Node/Vite app with internet access), configure the API before creating the store:

```js
import { setAPI, setApiEndpoints, setAuthorization } from '@reyka/openpolotno/utils/api';
setApiEndpoints({ urlBase: 'https://api.polotno.com' }); // plus setAuthorization(...) or your own endpoints via setAPI(name, fn)
```

Outside an artifact, the artifact-only services also need replacing:

| Artifact service | Used for | Replace with |
|---|---|---|
| `db` | projects, saved versions, live working copy, images | Firestore (same shape: documents, `onSnapshot`, leases → transactions) |
| `room` | who is online, cursors, live drags, selections | WebSocket / Liveblocks / Firebase presence |
| `user` | names and avatars | your auth provider |
| `downloads` | export / project file | a normal `<a download>` |

`src/storage.js` has a browser-only fallback (IndexedDB) that already works without any of them, minus collaboration.

## Your space and sharing

The artifact is its owner's space. The database rules (declared with the artifact) are:

| Path | Read | Write | Holds |
|---|---|---|---|
| everything at the root | owner | owner | private projects, project list, templates, share settings (`shares/<id>`) |
| `sh/<place>/…` | anyone who can open the artifact | Contributor and up | shared projects, every document encrypted |
| `inv/<codeId>` | anyone who can open the artifact | owner | invites |
| `pub/space` | anyone who can open the artifact | owner | who owns the space (for "Ana's space") |
| `data/users/<id>/keys` | that person only (built in) | that person | the projects they joined |

- **Private** projects are protected by the rules: nobody but the owner can read them.
- **Sharing** a project moves it to `sh/<place>/` and encrypts every document with that project's own
  AES-256-GCM key (WebCrypto, gzip before encryption, the path bound as additional data). A code
  (`ABCD-EFGH-JKLM`, 60 random bits) opens an invite: the project key encrypted with a key derived from the
  code (PBKDF2-SHA256, 150,000 rounds). Without a code the shared data is unreadable, even to people who can
  open the artifact. `src/space.js` has the encryption layer (`ScopedBackend`), codes and copying.
- **Removing someone who joined** moves the project to a new place with a new key and re-issues the
  remaining codes; open screens follow a `live/moved` marker, and the old place is emptied. **Stop sharing**
  moves it back to the private part.
- **Every move** (first share, new key, back to private) leaves the `live/moved` marker in the old place,
  including the owner's private place, so the owner's other tabs follow too; they also notice the change in
  the project list. A screen that missed both notices finds out on its next write: the project's list is gone
  from the old place, so it looks the project up again instead of re-creating it there
  (`LiveSync.flushMeta`). In every case the changes it had not sent yet are replayed on the new place
  (`LiveSync.pending`, `Controller.replayPending`).
- Artifact version: people also need to be invited to the artifact on claude.ai with "Can edit".
  Website version: the link is enough; the owner signs in with Google (the first Google sign-in claims the
  site), visitors are anonymous Firebase users.
- Limits: someone with a link can do anything inside that project (like a Google Slides editor), and
  anyone with a session could delete encrypted data they cannot read.

## Live collaboration (how it stays correct)

Shared working copy per project in the database:

```
<base>live/meta          slide order, title, size, fonts, object names, rev
<base>live/s-<slideId>   one slide: page JSON (images as references) + animation settings, rev
assets/<hash>            images and fonts, stored once, shared by everything
<base>meta/head          version list (+ head2 mirror); each version in <base>saves/<slot>
templates/<id>           slide templates (all projects)
```

- Each screen remembers the last version it knows of every document (its *base*). Its own edits are
  `diff(base, current)`, computed at attribute level (`src/sync-core.js`).
- Writing: wait ~250 ms (max 1 s), take a short lease on the document, read the latest version, apply
  my edits on top, write with `rev + 1`. Two people editing different things never overwrite each other;
  the same attribute at the same time → last writer wins, and every screen converges.
- Receiving: my unwritten edits are re-applied on top of what arrived, then the open slide in the editor
  is updated in place (MobX `applySnapshot`, so selection and drags are not disturbed).
- Undo only undoes your own edits: incoming changes are applied to every step of the editor's undo history too.
- Live drags are shown by moving the canvas shape only (presence data at ~30 fps); the document itself only
  changes through the merged versions.
- Screen-only fields (`_editModeEnabled`, layer names) are never synced; tiny text-height measurement
  differences between browsers are ignored so they cannot bounce back and forth.
- Saving while someone else edits is safe: there is no "save the whole file" step that could overwrite
  others. A version is a read-only snapshot of the shared state; restoring writes that state as ordinary
  edits for everyone, after recording the current state as a "Before restoring" version.
- Two people giving two objects the same ID at the same moment: the names are normalised the same way on
  every screen (`normalizeRegistry`), so one gets a suffix (PIG-K3) everywhere.

## Build

```bash
npm ci                  # .npmrc allows the editor's older React peer ranges
node build.mjs web      # website → dist-web/ (what GitHub Pages publishes)
node build.mjs          # Claude artifact → dist/
node build.mjs webtest  # website with a fake Firebase → dist-webtest/ (local tests)
```

`build.mjs` uses esbuild (the editor's source uses lazy `require` for circular imports, which esbuild
handles). It first bundles `src/export-entry.js` into `build/player.txt`, the player embedded in exported files.

## Files

| File | Role |
|---|---|
| `src/main.jsx` | creates the editor store, English strings, fonts |
| `src/App.jsx` | layout, top bar, dialogs |
| `src/controller.js` | project state, slides, objects, saving, projects, presence |
| `src/live.js`, `src/sync-core.js` | live collaboration engine and merge functions |
| `src/collab-overlay.js` | collaborators' cursors, selections and live drags on the canvas |
| `src/render.js`, `src/player.js` | renderer, morph interpolation, presenter |
| `src/export.js` | standalone HTML export |
| `src/storage.js` | versions (thinning, rename, delete, chunked), images, project list, clean-up |
| `src/mathjax.js` | LaTeX → SVG, `\usepackage` handling, your own commands |
| `src/latex-macros.js` | reading command definitions out of .sty / .tex files |
| `src/history.js` | undo / redo for the whole presentation |
| `src/clipboard.js` | copy, cut and paste |
| `src/bg-remove.js` | background removal in the browser |
| `src/space.js` | encryption layer, invite codes, copying a project between places |
| `src/web/platform.js`, `src/web/firebase-config.js` | website version: Firebase services, settings |
| `src/themes.js` | themes and layouts |
| `src/builtin-templates.js` | fitting a template to another slide size |
| `src/i18n.js`, `src/i18n-fr.js`, `src/i18n-editor-fr.js` | languages |
| `src/google-fonts.json` | Google Fonts family list |
| `src/ui/*` | slide list, animation panel, version history, themes and templates, equation panel and LaTeX packages, font picker and size, notes, photos and icons, tour, sharing, object menu, projects window, offline side panels |
| `src/theme.css` | Material 3 look |
