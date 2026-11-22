import '@platform';
import { startTransition } from './player';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
import './app.css';
import './theme.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { setTranslations } from 'opn/utils/l10n';
import { setGoogleFonts } from 'opn/utils/fonts';
import { createStore } from 'opn/model/store';
import { EN } from './i18n-en';
import { EDITOR_FR } from './i18n-editor-fr';
import { LANG } from './i18n';
import { Controller } from './controller';
import { themeLayouts } from './themes';
import { App } from './App';

setTranslations(EN);
if (LANG === 'fr') setTranslations(EDITOR_FR);
setGoogleFonts([
  'Roboto', 'Inter', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway', 'Oswald', 'Nunito', 'Work Sans',
  'DM Sans', 'Manrope', 'Outfit', 'Sora', 'Space Grotesk', 'Rubik', 'Source Sans 3', 'Playfair Display',
  'Merriweather', 'Libre Baskerville', 'EB Garamond', 'Bebas Neue', 'Archivo Black', 'Anton', 'Lobster',
  'Pacifico', 'Caveat', 'Amatic SC', 'Press Start 2P', 'Roboto Mono', 'Fira Code',
]);

const store = createStore({ key: '', showCredit: false });
store.setPageControlsEnabled(false);
store.setAiToolsEnabled(false);
store.setShowCustomSvg(false);
store.setSize(1920, 1080);

const controller = new Controller(store, null);
if (typeof window !== 'undefined') { window.__morph = { store, controller, startTransition, themeLayouts }; }

createRoot(document.getElementById('root')).render(<App c={controller} store={store} />);
