import { useSyncExternalStore } from 'react';
import { droppedKey, readObject, writeObject } from './deviceKeys';

// Changes the server refused, for the banner. A notice stays until the person dismisses it, and is kept on this device for them (so a
// reload does not lose it). The "ask" action is not kept: it is only offered while the page it came from is open.
export interface DroppedEntry {
  id: string;
  message: string;
  // Whose notice it is. Without one it is kept in memory only.
  userId?: string;
  // Set when the change needed the other person's say: sends it as a proposal instead.
  ask?: () => void;
}

let entries: DroppedEntry[] = [];
const listeners = new Set<() => void>();

export const MAX_DROPPED = 20;

function persist(userId: string | undefined): void {
  if (userId === undefined) return;
  const mine = entries.filter(entry => entry.userId === userId).map(({ id, message }) => ({ id, message }));
  writeObject(droppedKey(userId), { entries: mine });
}

function publish(next: DroppedEntry[], userId?: string): void {
  entries = next;
  persist(userId);
  listeners.forEach(listener => listener());
}

export function recordDropped(entry: DroppedEntry): void {
  if (entries.some(existing => existing.id === entry.id)) return;
  // The same words twice in a row are one notice.
  if (entries.some(existing => existing.userId === entry.userId && existing.message === entry.message)) return;
  publish([...entries, entry].slice(-MAX_DROPPED), entry.userId);
}

export function dismissDropped(id: string): void {
  const gone = entries.find(entry => entry.id === id);
  publish(entries.filter(entry => entry.id !== id), gone?.userId);
}

// Brings back what this device kept for the person, once, when the banner opens.
export function loadDropped(userId: string | undefined): void {
  if (userId === undefined) return;
  const stored = readObject(droppedKey(userId)).entries;
  if (!Array.isArray(stored)) return;
  const known = new Set(entries.map(entry => entry.id));
  const fresh = (stored as { id?: unknown; message?: unknown }[])
    .filter((entry): entry is { id: string; message: string } => typeof entry.id === 'string' && typeof entry.message === 'string' && !known.has(entry.id))
    .map(entry => ({ id: entry.id, message: entry.message, userId }));
  if (fresh.length > 0) publish([...fresh, ...entries].slice(-MAX_DROPPED));
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
