import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { inviteHash, joinFailure, joinOps } from '../household/invites';
import { inviteKey } from '../household/keys';
import { HouseholdError } from '../household/types';
import { emitSecurityEvent } from '../security/events';
import { ConditionFailedError } from '../store';
import type { Item, Key, Store } from '../store';
import { hashPassword } from './password';
import type { PasswordRecord } from './password';

export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export const MAX_EMAIL_LENGTH = 254;

// One shared partition, because Store.query lists a single partition and ending a user's sessions must find them all.
const SESSIONS_PK = 'AUTH#SESSIONS';
// Written in the same transaction as the first account, and never removed: setup can only ever happen once.
const SETUP_KEY: Key = { PK: 'AUTH#SETUP', SK: 'DONE' };
const THROTTLE_LIFETIME_SECONDS = 24 * 60 * 60;

const FREE_ATTEMPTS = 3;
const MAX_DELAY_SECONDS = 15 * 60;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export interface Account extends PasswordRecord {
  userId: string;
  email: string;
  // The name the person gave when they signed up. The welcome form starts from it; their household name is their own.
  displayName: string;
  createdAt: string;
}

export class EmailTakenError extends Error {
  constructor() {
    super('That email already has an account');
    this.name = 'EmailTakenError';
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// An email becomes part of a store key, so only one that is safe to use as one is accepted: a plain address of at most 254
// characters, with no `#` (the key separator) and no control characters.
export function isUsableEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const normalised = normaliseEmail(email);
  return normalised.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(normalised) && !normalised.includes('#') && !CONTROL_CHARACTERS.test(normalised);
}

function usableOrThrow(email: string): string {
  if (!isUsableEmail(email)) throw new Error('Not a usable email address');
  return normaliseEmail(email);
}

const accountKey = (normalised: string): Key => ({ PK: `AUTH#ACCOUNT#${normalised}`, SK: 'PROFILE' });
const throttleKey = (normalised: string): Key => ({ PK: `AUTH#THROTTLE#${normalised}`, SK: 'LOGIN' });

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function getAccountByEmail(store: Store, email: string): Promise<Account | undefined> {
  if (!isUsableEmail(email)) return undefined;
  const item = await store.get(accountKey(normaliseEmail(email)));
  return item ? (item as unknown as Account) : undefined;
}

export async function isSetupOpen(store: Store): Promise<boolean> {
  return (await store.get(SETUP_KEY)) === undefined;
}

async function newAccount(email: string, password: string, displayName: string, nowMs: number): Promise<Account> {
  const record = await hashPassword(password);
  return { userId: `local|${randomUUID()}`, email, displayName, ...record, createdAt: new Date(nowMs).toISOString() };
}

interface FirstAccountInput {
  email: string;
  password: string;
  displayName: string;
  nowMs?: number;
}

// Throws ConditionFailedError once setup has happened, which is what closes it for good. The marker and the account are one
// transaction, so two simultaneous setups leave one account.
export async function createFirstAccount(store: Store, input: FirstAccountInput): Promise<Account> {
  const nowMs = input.nowMs ?? Date.now();
  const email = usableOrThrow(input.email);
  const account = await newAccount(email, input.password, input.displayName, nowMs);
  await store.transact([
    { put: { ...SETUP_KEY, at: new Date(nowMs).toISOString() }, ifAbsent: true },
    { put: { ...accountKey(email), ...account }, ifAbsent: true },
  ]);
  return account;
}

interface InvitedAccountInput extends FirstAccountInput {
  token: string;
}

// The account, its household membership and the used-up invite are one transaction: if any part fails (the link is spent, the
// household is full, the email is taken) nothing is written, so a failed sign-up never leaves an account with no household.
export async function createInvitedAccount(
  store: Store,
  input: InvitedAccountInput,
  emit: typeof emitSecurityEvent = emitSecurityEvent,
): Promise<{ account: Account; householdId: string }> {
  const nowMs = input.nowMs ?? Date.now();
  const email = usableOrThrow(input.email);
  const hash = inviteHash(input.token);

  // Looked at before the costly password hashing, so a bad link cannot be used to make the server do that work.
  const invite = await store.get(inviteKey(hash), { consistent: true });
  if (!invite || !(Number(invite.expiresAt) > Math.floor(nowMs / 1000)) || invite.usedBy !== undefined) throw new HouseholdError('invite_expired', 410);
  const householdId = String(invite.householdId);

  const account = await newAccount(email, input.password, input.displayName, nowMs);
  try {
    await store.transact([
      { put: { ...accountKey(email), ...account }, ifAbsent: true },
      ...joinOps({ hash, householdId }, account.userId, input.displayName, nowMs),
    ]);
  } catch (error) {
    if (!(error instanceof ConditionFailedError)) throw error;
    if (error.failedIndex === 0) throw new EmailTakenError();
    throw joinFailure(error.failedIndex, 1);
  }

  await emit({ event: 'invite_accepted', userId: account.userId, householdId, at: new Date(nowMs).toISOString() });
  return { account, householdId };
}

// Sets a new password on the named account and returns it, so the caller can end that user's sessions.
export async function replacePassword(store: Store, email: string, password: string): Promise<Account> {
  const key = accountKey(usableOrThrow(email));
  const record = await hashPassword(password);
  try {
    return (await store.patch(key, { ...record }, { mustExist: true })) as unknown as Account;
  } catch (error) {
    if (error instanceof ConditionFailedError) throw new Error('No account has that email address');
    throw error;
  }
}

function sessionKey(token: string): Key {
  return { PK: SESSIONS_PK, SK: hashToken(token) };
}

export async function createSession(store: Store, user: { userId: string; email: string }, nowSeconds: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await store.put({
    ...sessionKey(token),
    userId: user.userId,
    email: user.email,
    createdAt: nowSeconds,
    expiresAt: nowSeconds + SESSION_LIFETIME_SECONDS,
  });
  return token;
}

export async function readSession(store: Store, token: string | undefined, nowSeconds: number): Promise<{ userId: string; email: string } | undefined> {
  if (!token) return undefined;
  const key = sessionKey(token);
  const item = await store.get(key);
  if (!item) return undefined;

  // The TTL purge is hourly, so a row past its expiry can still be read: check it here.
  const expiresAt = Number(item.expiresAt);
  if (!(expiresAt > nowSeconds)) return undefined;

  // Slide the expiry only once half the lifetime has gone, so most requests cost no write.
  if (expiresAt - nowSeconds < SESSION_LIFETIME_SECONDS / 2) {
    try {
      await store.patch(key, { expiresAt: nowSeconds + SESSION_LIFETIME_SECONDS }, { mustExist: true });
    } catch (error) {
      if (error instanceof ConditionFailedError) return undefined; // logged out while this request was in flight
      throw error;
    }
  }
  return { userId: String(item.userId), email: String(item.email) };
}

export async function deleteSession(store: Store, token: string | undefined): Promise<void> {
  if (!token) return;
  await store.delete(sessionKey(token));
}

export async function deleteSessionsForUser(store: Store, userId: string): Promise<void> {
  const sessions: Item[] = await store.query(SESSIONS_PK);
  for (const { PK, SK, userId: owner } of sessions) {
    if (owner === userId) await store.delete({ PK, SK });
  }
}

// The throttle is per email, so one person's failed attempts never lock another. An email that cannot be a key has no throttle
// row at all: the caller still answers 401, and a stranger cannot make the store grow by inventing addresses.
export async function throttleRemaining(store: Store, email: string, nowSeconds: number): Promise<number> {
  if (!isUsableEmail(email)) return 0;
  const item = await store.get(throttleKey(normaliseEmail(email)));
  if (!item) return 0;
  return Math.max(0, Number(item.nextAllowedAt) - nowSeconds);
}

// Two simultaneous failures can lose a count, which only makes an attacker's life slightly easier.
export async function recordFailure(store: Store, email: string, nowSeconds: number): Promise<void> {
  if (!isUsableEmail(email)) return;
  const key = throttleKey(normaliseEmail(email));
  const item = await store.get(key);
  const failures = (Number(item?.failures) || 0) + 1;
  const delay = failures <= FREE_ATTEMPTS ? 0 : Math.min(MAX_DELAY_SECONDS, 2 ** (failures - FREE_ATTEMPTS - 1));
  await store.put({ ...key, failures, nextAllowedAt: nowSeconds + delay, expiresAt: nowSeconds + THROTTLE_LIFETIME_SECONDS });
}

export async function clearThrottle(store: Store, email: string): Promise<void> {
  if (!isUsableEmail(email)) return;
  await store.delete(throttleKey(normaliseEmail(email)));
}
