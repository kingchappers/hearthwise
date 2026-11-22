// Half-typed text, kept on this device so an interruption does not lose it: a tap outside a sheet, Escape, a reload, leaving the page.
// Kept under the person's user id (cleared at sign-out like the other device keys), never sent anywhere, and removed when the thing is
// saved. Every read and write is inside try/catch through `readObject` and `writeObject`: blocked storage must never break a page.
import { useCallback, useState } from 'react';
import { readObject, textDraftsKey, writeObject } from './deviceKeys';

const MAX_DRAFTS = 40;
const MAX_AGE_MS = 14 * 86_400_000;

interface StoredDraft { value: string; at: number }

const isStored = (value: unknown): value is StoredDraft =>
  typeof value === 'object' && value !== null && typeof (value as StoredDraft).value === 'string' && typeof (value as StoredDraft).at === 'number';

export function readTextDraft(userId: string, key: string, now: number = Date.now()): string | undefined {
  if (userId === '') return undefined;
  const stored = readObject(textDraftsKey(userId))[key];
  return isStored(stored) && now - stored.at < MAX_AGE_MS ? stored.value : undefined;
}

// An empty text removes the draft. Past the cap the oldest go first.
export function writeTextDraft(userId: string, key: string, value: string, now: number = Date.now()): void {
  if (userId === '') return;
  const all = readObject(textDraftsKey(userId));
  if (value === '') delete all[key];
  else all[key] = { value, at: now };
  const kept = Object.entries(all).filter(([, entry]) => isStored(entry)).sort((a, b) => (a[1] as StoredDraft).at - (b[1] as StoredDraft).at).slice(-MAX_DRAFTS);
  writeObject(textDraftsKey(userId), Object.fromEntries(kept));
}

export const clearTextDraft = (userId: string, key: string): void => writeTextDraft(userId, key, '');

// A text field that remembers itself: starts from the saved draft if there is one, saves each change, and `clear` forgets it once the
// thing it was for has been saved.
export function useDraftText(userId: string, key: string, initial = ''): [string, (value: string) => void, () => void] {
  const [text, setText] = useState(() => readTextDraft(userId, key) ?? initial);
  const change = useCallback((value: string) => {
    setText(value);
    writeTextDraft(userId, key, value === initial ? '' : value);
  }, [userId, key, initial]);
  const clear = useCallback(() => {
    clearTextDraft(userId, key);
  }, [userId, key]);
  return [text, change, clear];
}
