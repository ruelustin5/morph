import React from 'react';
import { Button, Navbar, Tooltip } from '@blueprintjs/core';
import { useController } from './hooks';
import { t } from '../i18n';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl+';

/** Undo / redo for the whole presentation (replaces the editor's buttons, which only knew one slide). */
export function makeHistoryButtons(c) {
  return function HistoryButtons() {
    useController(c);
    return (
      <Navbar.Group align="left" style={{ paddingRight: 10 }}>
        <Tooltip content={t('Undo') + ` (${MOD}Z)`} placement="bottom" compact>
          <Button minimal icon="undo" disabled={!c.canUndo} onClick={() => c.undo()} aria-label={t('Undo')} />
        </Tooltip>
        <Tooltip content={t('Redo') + ` (${MOD === '⌘' ? '⌘⇧Z' : 'Ctrl+Y'})`} placement="bottom" compact>
          <Button minimal icon="redo" disabled={!c.canRedo} onClick={() => c.redo()} aria-label={t('Redo')} />
        </Tooltip>
      </Navbar.Group>
    );
  };
}
