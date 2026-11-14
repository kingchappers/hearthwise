import { ApiError } from './apiError';
import { isLaunchingError, isSessionEndedError } from './session';

const MAX_DELAY_MS = 60_000;
const SERVER_ERROR_TRIES = 3;

// Which failed household writes are tried again. A write is never lost to a bad connection or a lapsed sign-in: those are retried
// for ever, because the write is saved on this device and the server answers a repeat of it from its record. A server error is
// retried a few times; anything the server refused is final.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  // fetch rejects with a TypeError when the network fails, and the app's own 10-second limit ends a hung request with a TimeoutError.
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) return true;
  // Still launching: nothing can be sent yet, and the write waits.
  if (isLaunchingError(error)) return true;
  // The sign-in lapsed (Auth0 could not renew it, or the server said 401): the write waits for the person to sign in again.
  if (isSessionEndedError(error)) return true;
  if (error instanceof ApiError) {
    if (error.status === 401) return true;
    if (error.status >= 500) return failureCount < SERVER_ERROR_TRIES;
  }
  return false;
}

// A second, doubling, never more than a minute.
export const retryDelay = (failureCount: number): number => Math.min(1000 * 2 ** failureCount, MAX_DELAY_MS);
