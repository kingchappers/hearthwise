import { useEffect, useSyncExternalStore } from 'react';

// "Tell <name> when I save a change" is one tick: unticked by default, never remembered, cleared by the save it was ticked for, and off
// again as soon as the last box that shows it leaves the screen. Nothing notifies the other person unless it was ticked just now.
let on = false;
// True after a save that carried the tick, until the next tick or the page changes: the box says "<name> was told".
let told = false;
let boxes = 0;
const listeners = new Set<() => void>();

function change(nextOn: boolean, nextTold: boolean): void {
  if (on === nextOn && told === nextTold) return;
  on = nextOn;
  told = nextTold;
  for (const listener of listeners) listener();
}

const set = (next: boolean): void => change(next, false);

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useLetThemKnow(): { on: boolean; told: boolean; set(value: boolean): void } {
  const value = useSyncExternalStore(subscribe, () => on, () => false);
  const wasTold = useSyncExternalStore(subscribe, () => told, () => false);
  useEffect(() => {
    boxes += 1;
    return () => {
      boxes -= 1;
      if (boxes === 0) change(false, false);
    };
  }, []);
  return { on: value, told: wasTold, set };
}

export const letThemKnowOn = (): boolean => on;

// What a write's variables gain when the box is ticked: nothing at all when it is not. The tick is used up by the save it goes with,
// so a later save does not message the other person unless it is ticked again.
export function notifyFields(): { notify?: true } {
  if (!on) return {};
  change(false, true);
  return { notify: true };
}

export function resetLetThemKnow(): void {
  boxes = 0;
  change(false, false);
}
