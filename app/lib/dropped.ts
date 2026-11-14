import { useSyncExternalStore } from 'react';

// Changes the server refused, for the banner. Kept in memory only: a refused change is dropped, and the person is told once.
export interface DroppedEntry {
  id: string;
  message: string;
  // Set when the change needed the other person's say: sends it as a proposal instead.
  ask?: () => void;
}

let entries: DroppedEntry[] = [];
const listeners = new Set<() => void>();

function publish(next: DroppedEntry[]): void {
  entries = next;
  listeners.forEach(listener => listener());
}

export function recordDropped(entry: DroppedEntry): void {
  if (entries.some(existing => existing.id === entry.id)) return;
  publish([...entries, entry]);
}

export function dismissDropped(id: string): void {
  publish(entries.filter(entry => entry.id !== id));
}

export function clearDropped(): void {
  publish([]);
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useDropped(): DroppedEntry[] {
  return useSyncExternalStore(subscribe, () => entries, () => entries);
}
