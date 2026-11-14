import { useEffect, useSyncExternalStore } from 'react';

// "Let <name> know" is one tick on a page that applies to the changes made on it: unticked by default, never remembered, and off
// again as soon as the last box that shows it leaves the screen. Nothing notifies the other person unless it was ticked just now.
let on = false;
let boxes = 0;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (on === next) return;
  on = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useLetThemKnow(): { on: boolean; set(value: boolean): void } {
  const value = useSyncExternalStore(subscribe, () => on, () => false);
  useEffect(() => {
    boxes += 1;
    return () => {
      boxes -= 1;
      if (boxes === 0) set(false);
    };
  }, []);
  return { on: value, set };
}

export const letThemKnowOn = (): boolean => on;

// What a write's variables gain when the box is ticked: nothing at all when it is not.
export const notifyFields = (): { notify?: true } => (on ? { notify: true } : {});

export function resetLetThemKnow(): void {
  boxes = 0;
  set(false);
}
