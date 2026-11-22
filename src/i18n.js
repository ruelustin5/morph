// Interface language: French when the browser prefers French, English otherwise.
// Strings are written in English in the code and looked up in the French dictionary (i18n-fr.js).
// Placeholders: t('Slide {n}', { n: 3 }).
import { FR } from './i18n-fr';

function pickLang() {
  try {
    const forced = localStorage.getItem('morph-lang');
    if (forced === 'fr' || forced === 'en') return forced;
  } catch (e) { /* storage blocked */ }
  const list = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  for (const l of list) {
    const k = String(l || '').toLowerCase().slice(0, 2);
    if (k === 'fr') return 'fr';
    if (k === 'en') return 'en';
  }
  return 'en';
}

export const LANG = pickLang();
if (typeof document !== 'undefined') document.documentElement.lang = LANG;

const missing = new Set();
export function t(s, vars) {
  let out = s;
  if (LANG === 'fr') {
    const f = FR[s];
    if (f != null) out = f;
    else if (typeof window !== 'undefined' && window.__morphI18nDebug && !missing.has(s)) { missing.add(s); console.warn('[i18n] missing:', s); }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return out;
}

/** "1 slide" / "3 slides" style counts. */
export function tn(n, one, many, vars = {}) {
  return t(n === 1 ? one : many, { n, ...vars });
}

export function setLang(l) {
  try { if (l) localStorage.setItem('morph-lang', l); else localStorage.removeItem('morph-lang'); } catch (e) { /* ignore */ }
  location.reload();
}

export const missingStrings = () => Array.from(missing);
