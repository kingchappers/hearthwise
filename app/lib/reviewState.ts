// The add-to-list review's state, kept on this device for an hour so a phone call or a locked screen mid-review does not lose it.
// Cleared when the add is sent or cancelled.
import { readObject, reviewKey, writeObject } from './deviceKeys';

export const REVIEW_LIFETIME_MS = 60 * 60 * 1000;

export interface ReviewState {
  savedAt: number;
  // Whether each plan day's switch is on, for the days the person changed.
  included: Record<string, boolean>;
  // The keys of the review lines marked "I have this".
  have: string[];
  // Made once when the review opens, and kept, so a double tap or a redraw sends the same ids.
  mutationId: string;
  // A stable shopping line id for each review line, so a line switched off and on keeps its id.
  ids: Record<string, string>;
}

const isState = (value: Record<string, unknown>): value is Record<string, unknown> & ReviewState =>
  typeof value.savedAt === 'number' && typeof value.mutationId === 'string' && Array.isArray(value.have)
  && typeof value.included === 'object' && value.included !== null && typeof value.ids === 'object' && value.ids !== null;

type Now = () => number;

export function clearReview(userId: string): void {
  if (userId === '') return;
  try {
    window.localStorage.removeItem(reviewKey(userId));
  } catch (error) {
    console.error('reviewState: could not clear the review', error);
  }
}

// The saved review, or nothing. One more than an hour old is ignored and removed.
export function readReview(userId: string, now: Now = Date.now): ReviewState | undefined {
  if (userId === '') return undefined;
  const stored = readObject(reviewKey(userId));
  if (!isState(stored)) return undefined;
  if (now() - stored.savedAt > REVIEW_LIFETIME_MS) {
    clearReview(userId);
    return undefined;
  }
  return { savedAt: stored.savedAt, included: stored.included, have: stored.have, mutationId: stored.mutationId, ids: stored.ids };
}

export function saveReview(userId: string, state: ReviewState, now: Now = Date.now): void {
  if (userId === '') return;
  writeObject(reviewKey(userId), { ...state, savedAt: now() });
}
