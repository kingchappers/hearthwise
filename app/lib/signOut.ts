import { useSyncExternalStore } from 'react';

// "Sign out" is asked for from several places (Settings, the profile menu); one dialog, mounted in the layout, answers. It knows how
// many changes are waiting to be saved, so it can ask first.
let requested = false;
const listeners = new Set<() => void>();

function set(value: boolean): void {
  requested = value;
  listeners.forEach(listener => listener());
}

export const requestSignOut = (): void => set(true);
export const cancelSignOut = (): void => set(false);

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useSignOutRequested(): boolean {
  return useSyncExternalStore(subscribe, () => requested, () => false);
}
