import React, { useEffect, useRef, useState } from 'react';
import { createPlayer } from '../player';
import { PresenterNotes } from './Notes';

export function Presenter({ c, start, onClose }) {
  const ref = useRef(null);
  const lastIndex = useRef(start);
  const [index, setIndex] = useState(start);
  useEffect(() => {
    c.store.selectElements([]);
    const close = () => onClose(lastIndex.current);
    const player = createPlayer({
      root: ref.current,
      project: c.project,
      ctx: c.ctx,
      startIndex: start,
      onIndex: (i) => { lastIndex.current = i; setIndex(i); },
      onExit: close,
    });
    return () => player.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="presenter-wrap">
      <div className="presenter" ref={ref} />
      <PresenterNotes c={c} index={index} />
    </div>
  );
}
