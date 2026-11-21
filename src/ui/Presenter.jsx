import React, { useEffect, useRef } from 'react';
import { createPlayer } from '../player';

export function Presenter({ c, start, onClose }) {
  const ref = useRef(null);
  const lastIndex = useRef(start);
  useEffect(() => {
    c.store.selectElements([]);
    const close = () => onClose(lastIndex.current);
    const player = createPlayer({
      root: ref.current,
      project: c.project,
      ctx: c.ctx,
      startIndex: start,
      onIndex: (i) => { lastIndex.current = i; },
      onExit: close,
    });
    return () => player.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="presenter" ref={ref} />;
}
