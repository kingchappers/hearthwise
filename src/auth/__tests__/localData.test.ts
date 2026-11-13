import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { createInvite } from '../../household/invites';
import { inviteKey, membershipKey } from '../../household/keys';
import { ConditionFailedError } from '../../store';
import { MemoryStore } from '../../store/memory';
import { verifyPassword } from '../password';
import {
  EmailTakenError, SESSION_LIFETIME_SECONDS, clearThrottle, createFirstAccount, createInvitedAccount, createSession, deleteSession,
  deleteSessionsForUser, getAccountByEmail, hashToken, isSetupOpen, isUsableEmail, normaliseEmail, readSession, recordFailure,
  replacePassword, throttleRemaining,
} from '../localData';

const NOW = 1_800_000_000;
const NOW_MS = NOW * 1000;
const PASSWORD = 'a long enough password';
let store: MemoryStore;

beforeEach(() => { store = new MemoryStore(); });

async function firstAccount(email = 'me@example.com') {
  return createFirstAccount(store, { email, password: PASSWORD, displayName: 'Sam', nowMs: NOW_MS });
}

// A household for the first account, and an invite into it.
async function inviteFor(account: { userId: string }, nowMs = NOW_MS) {
  await createHousehold(store, { userId: account.userId, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs }, vi.fn());
  return createInvite(store, (await loadContext(store, account.userId))!, nowMs);
}

describe('emails', () => {
  it('normalises by trimming and lower-casing', () => {
    expect(normaliseEmail('  Me@Example.COM ')).toBe('me@example.com');
  });

  it.each(['me@example.com', 'a.b+c@sub.example.co.uk', 'x@y'])('accepts %s', email => {
    expect(isUsableEmail(email)).toBe(true);
  });

  it.each([
    ['empty', ''], ['no at sign', 'plain'], ['two at signs', 'a@b@c'], ['a hash', 'a#b@x.com'], ['a NUL', 'a\0b@x.com'],
    ['a newline', 'a\nb@x.com'], ['a space inside', 'a b@x.com'], ['255 characters', `${'a'.repeat(250)}@x.com`], ['a number', 5], ['null', null],
  ])('rejects an email that is %s', (_name, email) => {
    expect(isUsableEmail(email)).toBe(false);
  });

  it('accepts exactly 254 characters', () => {
    expect(isUsableEmail(`${'a'.repeat(244)}@x.com`)).toBe(true);
  });
});

describe('first-run setup', () => {
  it('is open until the first account exists, and closed for good after it', async () => {
    expect(await isSetupOpen(store)).toBe(true);
    await firstAccount();
    expect(await isSetupOpen(store)).toBe(false);
  });

  it('creates the account with a hash, never the password, and the display name', async () => {
    const account = await firstAccount('  Me@Example.com ');
    expect(account).toMatchObject({ email: 'me@example.com', displayName: 'Sam' });
    expect(account.userId).toMatch(/^local\|[0-9a-f-]{36}$/);
    const stored = JSON.stringify(await store.get({ PK: 'AUTH#ACCOUNT#me@example.com', SK: 'PROFILE' }));
    expect(stored).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, account)).toBe(true);
  });

  it('refuses a second first account', async () => {
    await firstAccount();
    await expect(firstAccount('other@example.com')).rejects.toBeInstanceOf(ConditionFailedError);
  });

  it('stays closed even if the account is later deleted', async () => {
    await firstAccount();
    await store.delete({ PK: 'AUTH#ACCOUNT#me@example.com', SK: 'PROFILE' });
    await expect(firstAccount('other@example.com')).rejects.toBeInstanceOf(ConditionFailedError);
    expect(await getAccountByEmail(store, 'other@example.com')).toBeUndefined();
  });

  it('leaves exactly one account when two setups race', async () => {
    const results = await Promise.allSettled([firstAccount('a@example.com'), firstAccount('b@example.com')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const found = [await getAccountByEmail(store, 'a@example.com'), await getAccountByEmail(store, 'b@example.com')].filter(Boolean);
    expect(found).toHaveLength(1);
  });

  it('refuses an email that cannot be a key', async () => {
    await expect(createFirstAccount(store, { email: 'a#b@x.com', password: PASSWORD, displayName: 'Sam' })).rejects.toThrow(/email/i);
    expect(await isSetupOpen(store)).toBe(true);
  });
});

describe('createInvitedAccount', () => {
  it('CUJ 1: creates the account, and puts it in the inviter\'s household, in one step', async () => {
    const first = await firstAccount();
    const invite = await inviteFor(first);
    const emit = vi.fn();
    const { account, householdId } = await createInvitedAccount(store, { token: invite.token, email: 'Bea@Example.com', password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, emit);

    expect(account.email).toBe('bea@example.com');
    expect(householdId).toBe((await loadContext(store, first.userId))!.householdId);
    const context = (await loadContext(store, account.userId))!;
    expect(context.members.map(member => member.displayName).sort()).toEqual(['Bea', 'Sam']);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ event: 'invite_accepted', userId: account.userId, householdId, at: new Date(NOW_MS).toISOString() });
  });

  it('treats ME@Example.com and me@example.com as one account', async () => {
    const first = await firstAccount('ME@Example.com ');
    const invite = await inviteFor(first);
    await expect(createInvitedAccount(store, { token: invite.token, email: 'me@example.com', password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, vi.fn()))
      .rejects.toBeInstanceOf(EmailTakenError);
  });

  it('leaves the invite unused and nobody joined when the email is taken', async () => {
    const first = await firstAccount();
    const invite = await inviteFor(first);
    await expect(createInvitedAccount(store, { token: invite.token, email: 'me@example.com', password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, vi.fn())).rejects.toBeDefined();
    expect('usedBy' in ((await store.get(inviteKey(invite.hash))) as object)).toBe(false);
    expect((await loadContext(store, first.userId))?.members).toHaveLength(1);
  });

  it('stops a link being used to look up which emails have accounts: the fifth taken-email answer revokes it', async () => {
    const first = await firstAccount();
    const invite = await inviteFor(first);
    const tryEmail = (email: string) => createInvitedAccount(store, { token: invite.token, email, password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, vi.fn());

    for (let i = 0; i < 5; i += 1) await expect(tryEmail('me@example.com')).rejects.toBeInstanceOf(EmailTakenError);

    await expect(tryEmail('fresh@example.com')).rejects.toMatchObject({ code: 'invite_expired', status: 410 });
    expect(await store.get(inviteKey(invite.hash))).toBeUndefined();
    expect(await store.get({ PK: `HH#${(await loadContext(store, first.userId))!.householdId}`, SK: `INVITE#${invite.hash}` })).toBeUndefined();
    expect(await getAccountByEmail(store, 'fresh@example.com')).toBeUndefined();
  });

  it('counts only taken-email answers, so a few typos leave the link usable', async () => {
    const first = await firstAccount();
    const invite = await inviteFor(first);
    const tryEmail = (email: string) => createInvitedAccount(store, { token: invite.token, email, password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, vi.fn());

    for (let i = 0; i < 4; i += 1) await expect(tryEmail('me@example.com')).rejects.toBeInstanceOf(EmailTakenError);
    await expect(tryEmail('bea@example.com')).resolves.toMatchObject({ account: { email: 'bea@example.com' } });
  });

  it('creates no account when the invite has expired, is unknown, or the household is full', async () => {
    const first = await firstAccount();
    const stale = await inviteFor(first, NOW_MS - 8 * 24 * 60 * 60 * 1000);
    await expect(createInvitedAccount(store, { token: stale.token, email: 'bea@example.com', password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, vi.fn()))
      .rejects.toMatchObject({ code: 'invite_expired', status: 410 });
    await expect(createInvitedAccount(store, { token: 'A'.repeat(43), email: 'bea@example.com', password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, vi.fn()))
      .rejects.toMatchObject({ code: 'invite_expired' });
    expect(await getAccountByEmail(store, 'bea@example.com')).toBeUndefined();

    const one = await createInvite(store, (await loadContext(store, first.userId))!, NOW_MS);
    const two = await createInvite(store, (await loadContext(store, first.userId))!, NOW_MS);
    await createInvitedAccount(store, { token: one.token, email: 'bea@example.com', password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, vi.fn());
    await expect(createInvitedAccount(store, { token: two.token, email: 'cat@example.com', password: PASSWORD, displayName: 'Cat', nowMs: NOW_MS }, vi.fn()))
      .rejects.toMatchObject({ code: 'household_full', status: 409 });
    expect(await getAccountByEmail(store, 'cat@example.com')).toBeUndefined();
  });

  it('leaves no account without its membership, or membership without its member, when two sign-ups race for one household', async () => {
    const first = await firstAccount();
    const one = await createInvite(store, (await (async () => { await createHousehold(store, { userId: first.userId, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW_MS }, vi.fn()); return loadContext(store, first.userId); })())!, NOW_MS);
    const two = await createInvite(store, (await loadContext(store, first.userId))!, NOW_MS);
    const results = await Promise.allSettled([
      createInvitedAccount(store, { token: one.token, email: 'bea@example.com', password: PASSWORD, displayName: 'Bea', nowMs: NOW_MS }, vi.fn()),
      createInvitedAccount(store, { token: two.token, email: 'cat@example.com', password: PASSWORD, displayName: 'Cat', nowMs: NOW_MS }, vi.fn()),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const accounts = [await getAccountByEmail(store, 'bea@example.com'), await getAccountByEmail(store, 'cat@example.com')].filter(Boolean);
    expect(accounts).toHaveLength(1);
    expect(await store.get(membershipKey(accounts[0]!.userId))).toBeDefined();
    expect((await loadContext(store, first.userId))?.members).toHaveLength(2);
  });
});

describe('passwords', () => {
  it('replaces the password on the named account and returns it', async () => {
    const account = await firstAccount();
    const updated = await replacePassword(store, ' ME@example.com ', 'another long password');
    expect(updated.userId).toBe(account.userId);
    expect(await verifyPassword('another long password', updated)).toBe(true);
    expect(await verifyPassword(PASSWORD, updated)).toBe(false);
  });

  it('refuses an email with no account, and creates nothing', async () => {
    await expect(replacePassword(store, 'nobody@example.com', PASSWORD)).rejects.toThrow(/no account/i);
    expect(await getAccountByEmail(store, 'nobody@example.com')).toBeUndefined();
  });

  it('finds an account whatever the case or spacing of the email', async () => {
    await firstAccount();
    expect((await getAccountByEmail(store, '  ME@EXAMPLE.COM '))?.email).toBe('me@example.com');
    expect(await getAccountByEmail(store, 'a#b@x.com')).toBeUndefined();
  });
});

describe('sessions', () => {
  const user = { userId: 'local|u1', email: 'me@example.com' };

  it('keeps only the hash of the token, with the user id and email', async () => {
    const token = await createSession(store, user, NOW);
    const row = await store.get({ PK: 'AUTH#SESSIONS', SK: hashToken(token) });
    expect(row).toMatchObject({ userId: 'local|u1', email: 'me@example.com' });
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('reads a live session with its email, and rejects unknown, empty and expired tokens', async () => {
    const token = await createSession(store, user, NOW);
    expect(await readSession(store, token, NOW + 10)).toEqual(user);
    expect(await readSession(store, 'nope', NOW)).toBeUndefined();
    expect(await readSession(store, undefined, NOW)).toBeUndefined();
    expect(await readSession(store, token, NOW + SESSION_LIFETIME_SECONDS + 1)).toBeUndefined();
  });

  it('extends a session only once half its lifetime has passed', async () => {
    const token = await createSession(store, user, NOW);
    const key = { PK: 'AUTH#SESSIONS', SK: hashToken(token) };
    await readSession(store, token, NOW + 100);
    expect((await store.get(key))?.expiresAt).toBe(NOW + SESSION_LIFETIME_SECONDS);
    const late = NOW + SESSION_LIFETIME_SECONDS / 2 + 10;
    await readSession(store, token, late);
    expect((await store.get(key))?.expiresAt).toBe(late + SESSION_LIFETIME_SECONDS);
  });

  it('deletes one session', async () => {
    const token = await createSession(store, user, NOW);
    await deleteSession(store, token);
    expect(await readSession(store, token, NOW)).toBeUndefined();
  });

  it("ends one user's sessions and leaves the other user's", async () => {
    const mine = await createSession(store, user, NOW);
    const mineToo = await createSession(store, user, NOW);
    const theirs = await createSession(store, { userId: 'local|u2', email: 'bea@example.com' }, NOW);
    await deleteSessionsForUser(store, 'local|u1');
    expect(await readSession(store, mine, NOW)).toBeUndefined();
    expect(await readSession(store, mineToo, NOW)).toBeUndefined();
    expect(await readSession(store, theirs, NOW)).toEqual({ userId: 'local|u2', email: 'bea@example.com' });
  });
});

describe('login throttle, per email', () => {
  it('allows a few failures, then backs off exponentially up to a cap', async () => {
    const waits: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      await recordFailure(store, 'me@example.com', NOW);
      waits.push(await throttleRemaining(store, 'me@example.com', NOW));
    }
    expect(waits.slice(0, 3)).toEqual([0, 0, 0]);
    expect(waits.slice(3, 6)).toEqual([1, 2, 4]);
    expect(Math.max(...waits)).toBe(15 * 60);
  });

  it("does not let one email's failures lock another", async () => {
    for (let i = 0; i < 8; i += 1) await recordFailure(store, 'me@example.com', NOW);
    expect(await throttleRemaining(store, 'me@example.com', NOW)).toBeGreaterThan(0);
    expect(await throttleRemaining(store, 'bea@example.com', NOW)).toBe(0);
  });

  it('treats case and spacing as the same email', async () => {
    for (let i = 0; i < 6; i += 1) await recordFailure(store, i % 2 ? ' ME@example.com' : 'me@EXAMPLE.com', NOW);
    expect(await throttleRemaining(store, 'me@example.com', NOW)).toBeGreaterThan(0);
  });

  it('expires the row a day after the last failure', async () => {
    await recordFailure(store, 'me@example.com', NOW);
    await recordFailure(store, 'me@example.com', NOW + 500);
    expect((await store.get({ PK: 'AUTH#THROTTLE#me@example.com', SK: 'LOGIN' }))?.expiresAt).toBe(NOW + 500 + 24 * 60 * 60);
  });

  it('clears only that email', async () => {
    for (let i = 0; i < 6; i += 1) { await recordFailure(store, 'me@example.com', NOW); await recordFailure(store, 'bea@example.com', NOW); }
    await clearThrottle(store, 'me@example.com');
    expect(await throttleRemaining(store, 'me@example.com', NOW)).toBe(0);
    expect(await throttleRemaining(store, 'bea@example.com', NOW)).toBeGreaterThan(0);
  });

  it.each(['a#b@x.com', 'a\0b@x.com', `${'a'.repeat(300)}@x.com`, ''])('never builds a key from the unusable email %j', async email => {
    await recordFailure(store, email, NOW);
    expect(await throttleRemaining(store, email, NOW)).toBe(0);
    expect(await store.query(`AUTH#THROTTLE#${email}`)).toEqual([]);
    await expect(clearThrottle(store, email)).resolves.toBeUndefined();
  });
});
