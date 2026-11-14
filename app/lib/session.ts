import { useSyncExternalStore } from 'react';

const SESSION_ENDED_CODES = new Set(['login_required', 'missing_refresh_token', 'invalid_grant']);

type Listener = () => void;

const listeners = new Set<Listener>();
let sessionEnded = false;

// While the app is still launching (the saved lists are showing, sign-in has not finished) a request cannot be sent: there is no
// token yet. That is not a signed-out person, so it must not look like an ended session, and a write waiting to be sent is retried.
export const LAUNCHING_CODE = 'signing_in';

export function launchingError(): Error {
  return Object.assign(new Error('Signing in'), { error: LAUNCHING_CODE });
}

export function isLaunchingError(error: unknown): boolean {
  return error instanceof Error && (error as Error & { error?: unknown }).error === LAUNCHING_CODE;
}

export function isSessionEndedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { error?: unknown }).error;
  return typeof code === 'string' && SESSION_ENDED_CODES.has(code);
}

function setSessionEnded(value: boolean): void {
  if (sessionEnded === value) return;
  sessionEnded = value;
  listeners.forEach(listener => listener());
}

export function markSessionEnded(): void {
  setSessionEnded(true);
}

export function clearSessionEnded(): void {
  setSessionEnded(false);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return sessionEnded;
}

export function useSessionEnded(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
