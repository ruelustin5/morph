import React from 'react';
import { Tooltip } from '@blueprintjs/core';

/** Icon for the animation panel: an easing curve between two keyframes. */
export function MotionIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="bp5-icon motion-icon">
      <path d="M2.5 12.5 C 7 12.5, 9 3.5, 13.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="2.5" cy="12.5" r="1.9" fill="currentColor" opacity=".45" />
      <circle cx="13.5" cy="3.5" r="1.9" fill="currentColor" />
    </svg>
  );
}

export function Avatar({ person, size = 22, ring = '#fff' }) {
  const initials = (person.name || '?').replace(/\(.*\)/, '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <span className="avatar" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}`, background: person.color }}>
      {person.avatar ? <img src={person.avatar} alt="" /> : <span style={{ fontSize: size * 0.42 }}>{initials}</span>}
    </span>
  );
}

/** Overlapping avatars of the peers given, with a tooltip saying who and where. */
export function AvatarStack({ c, peers, size = 22, max = 3, describe, ring }) {
  if (!peers || !peers.length) return null;
  // One entry per person (a person with two tabs shows once).
  const byKey = new Map();
  for (const p of peers) {
    const key = p.by || (p.presence && p.presence.uid) || p.peer;
    if (!byKey.has(key)) byKey.set(key, p);
  }
  const list = Array.from(byKey.values());
  const shown = list.slice(0, max);
  const content = (
    <div className="people-tip">
      {list.map((p) => {
        const person = c.personOf(p);
        return (
          <div key={p.peer} className="people-tip-row">
            <Avatar person={person} size={18} ring="transparent" />
            <span>{person.name}</span>
            {describe && <span className="muted">{describe(p)}</span>}
          </div>
        );
      })}
    </div>
  );
  return (
    <Tooltip content={content} placement="bottom" compact>
      <span className="avatar-stack">
        {shown.map((p) => <Avatar key={p.peer} person={c.personOf(p)} size={size} ring={ring} />)}
        {list.length > max && <span className="avatar more" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring || '#fff'}` }}>+{list.length - max}</span>}
      </span>
    </Tooltip>
  );
}
