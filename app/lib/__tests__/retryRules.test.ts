import { describe, expect, it } from 'vitest';
import { ApiError } from '../apiError';
import { retryDelay, shouldRetry } from '../retryRules';

const sessionEnded = (code: string): Error => Object.assign(new Error(code), { error: code });

describe('shouldRetry', () => {
  it('retries a network failure for ever, however many times it has failed', () => {
    for (const count of [0, 1, 3, 50, 1000]) expect(shouldRetry(count, new TypeError('Failed to fetch'))).toBe(true);
  });

  it('retries the 10-second timeout for ever', () => {
    const timeout = new DOMException('signal timed out', 'TimeoutError');
    for (const count of [0, 5, 500]) expect(shouldRetry(count, timeout)).toBe(true);
  });

  it('retries a lapsed sign-in for ever, so the write waits for the person to sign in again', () => {
    expect(shouldRetry(10, new ApiError(401, 'Unauthorized'))).toBe(true);
    expect(shouldRetry(10, sessionEnded('login_required'))).toBe(true);
    expect(shouldRetry(10, sessionEnded('missing_refresh_token'))).toBe(true);
  });

  it('retries a server error three times and then stops', () => {
    expect(shouldRetry(0, new ApiError(503, 'Unavailable'))).toBe(true);
    expect(shouldRetry(2, new ApiError(500, 'Error'))).toBe(true);
    expect(shouldRetry(3, new ApiError(500, 'Error'))).toBe(false);
  });

  it('never retries what the server refused', () => {
    for (const status of [400, 403, 404, 409, 410, 422]) expect(shouldRetry(0, new ApiError(status, 'x'))).toBe(false);
  });

  it('does not retry an error it does not know', () => {
    expect(shouldRetry(0, new Error('something else'))).toBe(false);
    expect(shouldRetry(0, undefined)).toBe(false);
  });
});

describe('retryDelay', () => {
  it('doubles from a second and stops at a minute', () => {
    expect([0, 1, 2, 3, 4, 5].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000]);
    expect(retryDelay(6)).toBe(60_000);
    expect(retryDelay(40)).toBe(60_000);
  });
});
