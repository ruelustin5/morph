import React from 'react';
import { Tooltip } from '@blueprintjs/core';
import { EASINGS } from '../render';

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
    <div className={'curve-grid' + (disabled ? ' is-disabled' : '')} role="radiogroup" aria-label="Speed curve">
      {Object.entries(EASINGS).map(([k, v]) => (
        <Tooltip key={k} content={v.label} placement="top" hoverOpenDelay={300} compact>
          <button
            type="button"
            role="radio"
            aria-checked={value === k}
            aria-label={v.label}
            className={'curve-tile' + (value === k ? ' is-active' : '')}
            disabled={disabled}
            onClick={() => onChange(k)}
          >
            <CurveIcon name={k} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
