import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearReview, readReview, REVIEW_LIFETIME_MS, saveReview } from '../reviewState';
import type { ReviewState } from '../reviewState';

const ME = 'auth0|a';
const THEM = 'auth0|b';
const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const state = (over: Partial<ReviewState> = {}): ReviewState => ({
  savedAt: NOW, included: { '2026-11-16': false }, have: ['onion|'], mutationId: 'm1', ids: { 'onion|': 'id1' }, ...over,
});

beforeEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe('review state', () => {
  it('survives a remount: it reads back from the device', () => {
    saveReview(ME, state(), () => NOW);
    expect(readReview(ME, () => NOW + 60_000)).toEqual(state());
  });

  it('is ignored and removed when it is more than an hour old', () => {
    saveReview(ME, state(), () => NOW);
    expect(readReview(ME, () => NOW + REVIEW_LIFETIME_MS)).toEqual(state());
    expect(readReview(ME, () => NOW + REVIEW_LIFETIME_MS + 1)).toBeUndefined();
    expect(window.localStorage.getItem(`hearthwise.review.${ME}`)).toBeNull();
  });

  it('stamps the time it was saved, so a change keeps it alive', () => {
    saveReview(ME, state({ savedAt: 0 }), () => NOW + 30 * 60_000);
    expect(readReview(ME, () => NOW + 80 * 60_000)?.savedAt).toBe(NOW + 30 * 60_000);
  });

  it('is cleared when the add is sent or cancelled', () => {
    saveReview(ME, state(), () => NOW);
    clearReview(ME);
    expect(readReview(ME, () => NOW)).toBeUndefined();
  });

  it('is separate for each person on the device', () => {
    saveReview(ME, state({ mutationId: 'mine' }), () => NOW);
    saveReview(THEM, state({ mutationId: 'theirs' }), () => NOW);
    clearReview(THEM);
    expect(readReview(ME, () => NOW)?.mutationId).toBe('mine');
  });

  it('is never kept without a person to clean it up after', () => {
    saveReview('', state(), () => NOW);
    expect(readReview('', () => NOW)).toBeUndefined();
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  it('never throws when storage is blocked or full, and reads as nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveReview(ME, state(), () => NOW)).not.toThrow();
    expect(readReview(ME, () => NOW)).toBeUndefined();
    expect(() => clearReview(ME)).not.toThrow();
  });

  it('reads as nothing when what is stored is not a review', () => {
    window.localStorage.setItem(`hearthwise.review.${ME}`, JSON.stringify({ savedAt: 'x' }));
    expect(readReview(ME, () => NOW)).toBeUndefined();
    window.localStorage.setItem(`hearthwise.review.${ME}`, '{broken');
    expect(readReview(ME, () => NOW)).toBeUndefined();
  });
});
