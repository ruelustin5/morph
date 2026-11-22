import React from 'react';
import { EASINGS } from '../render';
import { t } from '../i18n';

// Plain names for the speed curves.
export const CURVE_NAMES = {
  linear: 'Steady', ease: 'Natural', 'ease-in': 'Slow start', 'ease-out': 'Slow end', 'ease-in-out': 'Slow start and end',
  back: 'Overshoot', elastic: 'Elastic', bounce: 'Bounce',
};
const CURVE_HELP = {
  linear: 'The same speed from start to end.',
  ease: 'Starts a little fast and slows down gently at the end, like most things in real life.',
  'ease-in': 'Starts slowly, then speeds up.',
  'ease-out': 'Starts fast, then slows down to stop.',
  'ease-in-out': 'Slow at the start and at the end, fast in the middle.',
  back: 'Goes a little too far, then comes back.',
  elastic: 'Wobbles around the end like a spring before stopping.',
  bounce: 'Bounces a few times at the end, like a ball.',
};
export const curveName = (k) => t(CURVE_NAMES[k] || 'Steady');

const W = 44, H = 30, PAD = 5;

function curvePath(fn) {
  // y range: allow overshoot between -0.25 and 1.25
  const lo = -0.25, hi = 1.25;
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const x = i / 48;
    const y = fn(x);
    const px = PAD + x * (W - 2 * PAD);
    const py = PAD + (1 - (y - lo) / (hi - lo)) * (H - 2 * PAD);
    pts.push(`${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  return pts.join(' ');
}

const PATHS = Object.fromEntries(Object.entries(EASINGS).map(([k, v]) => [k, curvePath(v.fn)]));

export function CurveIcon({ name, size = 1 }) {
  return (
    <svg width={W * size} height={H * size} viewBox={`0 0 ${W} ${H}`} className="curve-icon" aria-hidden="true">
      <path d={PATHS[name] || PATHS.linear} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CurvePicker({ value, onChange, disabled }) {
  return (
    <div className={'curve-grid' + (disabled ? ' is-disabled' : '')} role="radiogroup" aria-label={t('Motion')}>
      {Object.entries(EASINGS).map(([k, v]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          className={'curve-tile' + (value === k ? ' is-active' : '')}
          title={t(CURVE_HELP[k] || '')}
          disabled={disabled}
          onClick={() => onChange(k)}
        >
          <CurveIcon name={k} />
          <span className="curve-name">{curveName(k)}</span>
        </button>
      ))}
    </div>
  );
}
