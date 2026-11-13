import { useCallback, useSyncExternalStore } from 'react';

// Root font size, so every rem-based size follows: 100%, 112.5% and 125%.
export type TextSize = 'standard' | 'large' | 'largest';
// How long a message with an Undo button stays on screen.
export type UndoDuration = 'until-closed' | '30s' | '10s';

// Display preferences, kept on this device only. Anything a person chooses that the household should share (reminders, quiet
// hours, the default view) is saved on the server with their member record instead.
export interface Preferences {
  textSize: TextSize;
  undoDuration: UndoDuration;
  // Overrides the device's reduced-motion setting for people who don't know it exists.
  reduceMotion: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  textSize: 'standard',
  undoDuration: 'until-closed',
  reduceMotion: false,
};

const TEXT_SIZES: readonly TextSize[] = ['standard', 'large', 'largest'];
const UNDO_DURATIONS: readonly UndoDuration[] = ['until-closed', '30s', '10s'];

export const PREFERENCES_KEY = 'hearthwise.preferences';

type Listener = () => void;

const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedPreferences: Preferences = DEFAULT_PREFERENCES;
let unsavedPreferences: Preferences | null = null;

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch (error) {
    console.error('preferences: localStorage is unavailable', error);
    return null;
  }
}

function readItem(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch (error) {
    console.error('preferences: could not read', key, error);
    return null;
  }
}

function parseStored(raw: string | null): Record<string, unknown> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch (error) {
    console.error('preferences: saved preferences are not valid JSON', error);
    return {};
  }
}

function fromStored(stored: Record<string, unknown>): Preferences {
  const result: Preferences = { ...DEFAULT_PREFERENCES };
  if (typeof stored.reduceMotion === 'boolean') result.reduceMotion = stored.reduceMotion;
  if (TEXT_SIZES.includes(stored.textSize as TextSize)) result.textSize = stored.textSize as TextSize;
  if (UNDO_DURATIONS.includes(stored.undoDuration as UndoDuration)) result.undoDuration = stored.undoDuration as UndoDuration;
  return result;
}

export function readPreferences(store: Storage | null): Preferences {
  if (store === null) return { ...DEFAULT_PREFERENCES };
  return fromStored(parseStored(readItem(store, PREFERENCES_KEY)));
}

export function writePreferences(store: Storage | null, next: Preferences): boolean {
  if (store === null) return false;
  try {
    store.setItem(PREFERENCES_KEY, JSON.stringify(next));
    return true;
  } catch (error) {
    console.error('preferences: could not save', PREFERENCES_KEY, error);
    return false;
  }
}

function notify(): void {
  listeners.forEach(listener => listener());
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== PREFERENCES_KEY) return;
  notify();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): Preferences {
  if (unsavedPreferences !== null) return unsavedPreferences;
  const store = localStore();
  const raw = store === null ? null : readItem(store, PREFERENCES_KEY);
  if (raw === cachedRaw) return cachedPreferences;
  cachedRaw = raw;
  cachedPreferences = readPreferences(store);
  return cachedPreferences;
}

function getServerSnapshot(): Preferences {
  return DEFAULT_PREFERENCES;
}

function updatePreferences(patch: Partial<Preferences>): void {
  const next = { ...getSnapshot(), ...patch };
  unsavedPreferences = writePreferences(localStore(), next) ? null : next;
  notify();
}

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setPreferences = useCallback((patch: Partial<Preferences>) => updatePreferences(patch), []);
  return [preferences, setPreferences];
}
