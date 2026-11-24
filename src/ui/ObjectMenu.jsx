import React from 'react';
import { observer } from 'mobx-react-lite';
import { ContextMenuPopover, Menu, MenuDivider, MenuItem } from '@blueprintjs/core';
import { duplicateElements } from 'opn/utils/duplicate';
import { MotionIcon } from './People';
import { nameOf } from '../project';
import { t } from '../i18n';
import { copyObjects, pasteObjects, hasClip } from '../clipboard';

/**
 * Right-click menu on canvas objects (replaces the editor's own).
 * Adds "Animation" (opens the panel on this object) and shows the object's ID.
 */
export function makeObjectMenu(c) {
  return observer(function ObjectMenu({ store, isOpen, offset, setIsOpen }) {
    const sel = store.selectedElements;
    const mod = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl+';
    const can = c.canWrite !== false;
    const close0 = () => setIsOpen(false);
    if (!sel.length) {
      // Right-click on an empty spot: paste.
      if (!hasClip() || !can) return null;
      return (
        <ContextMenuPopover isOpen={isOpen} onClose={close0} targetOffset={{ top: offset.y, left: offset.x }}
          content={<Menu className="obj-menu"><MenuItem icon="clipboard" text={t('Paste')} label={mod + 'V'} onClick={() => pasteObjects(c, store)} /></Menu>} />
      );
    }
    const ids = store.selectedElementsIds;
    const page = store.activePage;
    const locked = sel.every((el) => el.locked);
    const leaf = c.selectedLeafIds();
    const title = leaf.length === 1 && c.project ? nameOf(c.project, leaf[0]) : `${leaf.length} objects`;
    const close = () => setIsOpen(false);
    return (
      <ContextMenuPopover
        isOpen={isOpen}
        onClose={close}
        targetOffset={{ top: offset.y, left: offset.x }}
        content={
          <Menu className="obj-menu">
            <MenuItem icon={<MotionIcon size={16} />} text={t('Animation')} label={title} onClick={() => { close(); c.openAnim && c.openAnim(); }} />
            <MenuDivider />
            <MenuItem icon="cut" text={t('Cut')} label={mod + 'X'} disabled={!can || !sel.some((el) => el.removable)} onClick={() => copyObjects(c, store, { cut: true })} />
            <MenuItem icon="duplicate" text={t('Copy')} label={mod + 'C'} onClick={() => copyObjects(c, store)} />
            <MenuItem icon="clipboard" text={t('Paste')} label={mod + 'V'} disabled={!can || !hasClip()} onClick={() => pasteObjects(c, store)} />
            <MenuItem icon="insert" text={t('Duplicate')} label={mod + 'D'} onClick={() => duplicateElements(sel, store)} />
            <MenuItem icon={locked ? 'unlock' : 'lock'} text={locked ? t('Unlock') : t('Lock')} shouldDismissPopover={false}
              onClick={() => sel.forEach((el) => el.set({ draggable: locked, resizable: locked, contentEditable: locked, styleEditable: locked }))} />
            <MenuItem icon="trash" text={t('Delete')} intent="danger" disabled={!sel.some((el) => el.removable)}
              onClick={() => store.deleteElements(sel.filter((el) => el.removable).map((el) => el.id))} />
            <MenuDivider />
            <MenuItem icon="layers" text={t('Order')}>
              <MenuItem icon="double-chevron-up" text={t('Bring to front')} disabled={!page || !page.canMoveElementsTop(ids)} onClick={() => page.moveElementsTop(ids)} />
              <MenuItem icon="chevron-up" text={t('Bring forward')} disabled={!page || !page.canMoveElementsUp(ids)} onClick={() => page.moveElementsUp(ids)} />
              <MenuItem icon="chevron-down" text={t('Send backward')} disabled={!page || !page.canMoveElementsDown(ids)} onClick={() => page.moveElementsDown(ids)} />
              <MenuItem icon="double-chevron-down" text={t('Send to back')} disabled={!page || !page.canMoveElementsBottom(ids)} onClick={() => page.moveElementsBottom(ids)} />
            </MenuItem>
          </Menu>
        }
      />
    );
  });
}
