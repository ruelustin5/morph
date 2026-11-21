import { useSyncExternalStore } from 'react';
export function useController(c) {
  useSyncExternalStore(c.subscribe, c.getVersion);
  return c;
}
