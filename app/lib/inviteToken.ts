// An invite link carries its token in the address fragment. It is kept for an hour so a person who has to sign in first
// (and so leaves the page) still joins afterwards. Storage can be blocked or throw, so every access is guarded.
const KEY = 'hearthwise-invite';
const LIFETIME_MS = 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function storeInviteToken(token: string, nowMs: number = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ token, expiresAt: nowMs + LIFETIME_MS }));
  } catch (error) {
    console.warn('Could not keep the invite link:', error);
  }
}

export function peekInviteToken(nowMs: number = Date.now()): string | undefined {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown };
    if (typeof stored.token !== 'string' || typeof stored.expiresAt !== 'number') return undefined;
    return nowMs < stored.expiresAt && TOKEN.test(stored.token) ? stored.token : undefined;
  } catch (error) {
    console.warn('Could not read the invite link:', error);
    return undefined;
  }
}

export function clearInviteToken(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch (error) {
    console.warn('Could not clear the invite link:', error);
  }
}

export function tokenFromHash(hash: string): string | undefined {
  const token = hash.startsWith('#') ? hash.slice(1) : hash;
  return TOKEN.test(token) ? token : undefined;
}
