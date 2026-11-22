import React from 'react';
import { observer } from 'mobx-react-lite';
import { ContextMenuPopover, Menu, MenuDivider, MenuItem } from '@blueprintjs/core';
import { duplicateElements } from 'opn/utils/duplicate';
import { MotionIcon } from './People';
import { nameOf } from '../project';
import { t } from '../i18n';

/**
 * Right-click menu on canvas objects (replaces the editor's own).
 * Adds "Animation" (opens the panel on this object) and shows the object's ID.
 */
export function makeObjectMenu(c) {
  return observer(function ObjectMenu({ store, isOpen, offset, setIsOpen }) {
    const sel = store.selectedElements;
    if (!sel.length) return null;
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
            <MenuItem icon="duplicate" text={t('Duplicate')} onClick={() => duplicateElements(sel, store)} />
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
