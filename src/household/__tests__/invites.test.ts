import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../store/memory';
import { loadContext } from '../guard';
import { createHousehold } from '../households';
import { ConditionFailedError } from '../../store';
import { acceptInvite, createInvite, inviteHash, joinOps, listInvites, revokeInvite } from '../invites';
import { removeMember } from '../members';
import { hhPk, inviteKey, invitePointerSk, membershipKey, memberSk, metaKey } from '../keys';
import type { HouseholdContext } from '../types';

const NOW = Date.parse('2026-11-13T10:00:00.000Z');
const WEEK = 7 * 24 * 60 * 60;
const A = 'auth0|a';
const B = 'auth0|b';
const C = 'auth0|c';

let store: MemoryStore;
let householdId: string;
let ctx: HouseholdContext;

const fresh = async (userId = A): Promise<HouseholdContext> => (await loadContext(store, userId))!;
const accept = (token: string, userId: string, over: Record<string, unknown> = {}, emit = vi.fn()) =>
  acceptInvite(store, { token, userId, displayName: `Name ${userId}`, nowMs: NOW, ...over }, emit);

beforeEach(async () => {
  store = new MemoryStore();
  ({ householdId } = await createHousehold(store, { userId: A, name: 'Home', timezone: 'Europe/London', displayName: 'Ana', nowMs: NOW }, vi.fn()));
  ctx = await fresh();
});

describe('createInvite', () => {
  it('stores the hash, the household, the creator and a seven day expiry, and no usedBy', async () => {
    const { token, hash, expiresAt } = await createInvite(store, ctx, NOW);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(inviteHash(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt).toBe(Math.floor(NOW / 1000) + WEEK);
    const invite = await store.get(inviteKey(hash));
    expect(invite).toMatchObject({ householdId, createdBy: A, expiresAt });
    expect('usedBy' in (invite as object)).toBe(false);
  });

  it('keeps a pointer in the household, with the same expiry, so it can list its open invites', async () => {
    const { hash, expiresAt } = await createInvite(store, ctx, NOW);
    expect(await store.get({ PK: hhPk(householdId), SK: invitePointerSk(hash) })).toMatchObject({ createdBy: A, expiresAt });
  });

  it('never stores the raw token', async () => {
    const { token, hash } = await createInvite(store, ctx, NOW);
    const stored = [await store.get(inviteKey(hash)), await store.get({ PK: hhPk(householdId), SK: invitePointerSk(hash) })];
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('makes a different token each time', async () => {
    const first = await createInvite(store, ctx, NOW);
    const second = await createInvite(store, ctx, NOW);
    expect(first.token).not.toBe(second.token);
  });

  it('refuses when the household already has two members', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    await accept(token, B);
    await expect(createInvite(store, await fresh(), NOW)).rejects.toMatchObject({ code: 'household_full', status: 409 });
  });

  it('allows ten open invites and refuses the eleventh', async () => {
    for (let i = 0; i < 10; i += 1) await createInvite(store, await fresh(), NOW);
    await expect(createInvite(store, await fresh(), NOW)).rejects.toMatchObject({ code: 'too_many_invites', status: 409 });
  });
});

describe('listInvites and revokeInvite', () => {
  it('lists open invites without their tokens, and leaves out an expired one', async () => {
    const open = await createInvite(store, ctx, NOW);
    await createInvite(store, ctx, NOW - 8 * 24 * 60 * 60 * 1000);
    const list = await listInvites(store, householdId, Math.floor(NOW / 1000));
    expect(list).toEqual([{ hash: open.hash, createdBy: A, expiresAt: open.expiresAt }]);
    expect(JSON.stringify(list)).not.toContain(open.token);
  });

  it('revokes an invite, which then fails like an expired one', async () => {
    const { token, hash } = await createInvite(store, ctx, NOW);
    await revokeInvite(store, ctx, hash);
    expect(await store.get(inviteKey(hash))).toBeUndefined();
    await expect(accept(token, B)).rejects.toMatchObject({ code: 'invite_expired', status: 410 });
    expect(await store.get(membershipKey(B))).toBeUndefined();
  });

  it("is not_found for another household's invite, and leaves it untouched", async () => {
    const other = await createHousehold(store, { userId: B, name: 'Theirs', timezone: 'Europe/London', displayName: 'Bea' }, vi.fn());
    const theirs = await createInvite(store, (await fresh(B)), NOW);
    await expect(revokeInvite(store, ctx, theirs.hash)).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(await store.get(inviteKey(theirs.hash))).toBeDefined();
    expect(other.householdId).not.toBe(householdId);
  });

  it('is not_found for a hash that never existed', async () => {
    await expect(revokeInvite(store, ctx, 'f'.repeat(64))).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('acceptInvite', () => {
  it('CUJ 1: puts the second person in the same household with both members visible', async () => {
    const { token, hash } = await createInvite(store, ctx, NOW);
    const emit = vi.fn();
    const result = await accept(token, B, {}, emit);

    expect(result).toEqual({ householdId });
    const second = await loadContext(store, B);
    expect(second?.householdId).toBe(householdId);
    expect(second?.members.map(member => member.userId).sort()).toEqual([A, B]);
    expect(second?.household.memberCount).toBe(2);
    expect(second?.member.displayName).toBe(`Name ${B}`);
    expect(await store.get({ PK: hhPk(householdId), SK: invitePointerSk(hash) })).toBeUndefined();
    expect(await store.get(inviteKey(hash))).toMatchObject({ usedBy: B });
  });

  it('works once: a second person using the same link is refused', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    await accept(token, B);
    await expect(accept(token, C)).rejects.toMatchObject({ code: 'invite_expired', status: 410 });
    expect(await store.get(membershipKey(C))).toBeUndefined();
  });

  it('answers the same person retrying with success, changes nothing and raises no second alert', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    const emit = vi.fn();
    await accept(token, B, {}, emit);
    const again = await accept(token, B, {}, emit);
    expect(again).toEqual({ householdId });
    expect(emit).toHaveBeenCalledTimes(1);
    expect((await fresh(B)).household.memberCount).toBe(2);
  });

  it('CUJ 10: an expired invite is invite_expired and creates nothing', async () => {
    const { token } = await createInvite(store, ctx, NOW - 8 * 24 * 60 * 60 * 1000);
    await expect(accept(token, B)).rejects.toMatchObject({ code: 'invite_expired', status: 410 });
    expect(await store.get(membershipKey(B))).toBeUndefined();
    expect(await store.get(metaKey(householdId))).toMatchObject({ memberCount: 1 });
  });

  it('treats a token nobody made as expired', async () => {
    await expect(accept('A'.repeat(43), B)).rejects.toMatchObject({ code: 'invite_expired', status: 410 });
  });

  it('refuses a third member with household_full, including when two accepts race', async () => {
    const first = await createInvite(store, ctx, NOW);
    const second = await createInvite(store, ctx, NOW);
    const results = await Promise.allSettled([accept(first.token, B), accept(second.token, C)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'household_full', status: 409 } });
    expect((await fresh()).household.memberCount).toBe(2);
    expect((await fresh()).members).toHaveLength(2);
  });

  it('lets exactly one of two people win the same link when they race', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    const results = await Promise.allSettled([accept(token, B), accept(token, C)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await fresh()).members).toHaveLength(2);
  });

  it('leaves no half-joined state when it fails: no membership without a member record', async () => {
    const first = await createInvite(store, ctx, NOW);
    const second = await createInvite(store, ctx, NOW);
    await accept(first.token, B);
    await expect(accept(second.token, C)).rejects.toBeDefined();
    expect(await store.get(membershipKey(C))).toBeUndefined();
    expect(await store.get({ PK: hhPk(householdId), SK: memberSk(C) })).toBeUndefined();
  });

  it('raises exactly one invite_accepted event with ids only, and none when it fails', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    const emit = vi.fn();
    await expect(accept('B'.repeat(43), B, {}, emit)).rejects.toBeDefined();
    expect(emit).not.toHaveBeenCalled();
    await accept(token, B, {}, emit);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ event: 'invite_accepted', userId: B, householdId, at: '2026-11-13T10:00:00.000Z' });
    expect(JSON.stringify(emit.mock.calls[0][0])).not.toMatch(/Name|Ana|Home/);
  });

  it('refuses someone already in this household, and someone in a household with things in it', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    await expect(accept(token, A)).rejects.toMatchObject({ code: 'already_member', status: 409, extra: { canMove: false } });

    await createHousehold(store, { userId: B, name: 'Theirs', timezone: 'Europe/London', displayName: 'Bea' }, vi.fn());
    const theirs = await fresh(B);
    await store.put({ PK: hhPk(theirs.householdId), SK: 'TASK#t1', title: 'Hoover' });
    await expect(accept(token, B, { confirmMove: true })).rejects.toMatchObject({ code: 'already_member', extra: { canMove: false } });
    expect(await store.get(membershipKey(B))).toMatchObject({ householdId: theirs.householdId });
  });

  it('refuses a move from a household that has a shopping item, or a second member', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    await createHousehold(store, { userId: B, name: 'Theirs', timezone: 'Europe/London', displayName: 'Bea' }, vi.fn());
    const theirs = await fresh(B);
    await store.put({ PK: hhPk(theirs.householdId), SK: 'ITEM#i1', text: 'Milk' });
    await expect(accept(token, B, { confirmMove: true })).rejects.toMatchObject({ extra: { canMove: false } });
  });

  describe('CUJ 11: someone who signed up first and made an empty household', () => {
    let oldId: string;
    let token: string;

    beforeEach(async () => {
      ({ householdId: oldId } = await createHousehold(store, { userId: B, name: 'Theirs', timezone: 'Europe/London', displayName: 'Bea' }, vi.fn()));
      ({ token } = await createInvite(store, ctx, NOW));
    });

    it('is asked to confirm first, and nothing changes until they do', async () => {
      await expect(accept(token, B)).rejects.toMatchObject({ code: 'already_member', status: 409, extra: { canMove: true } });
      expect(await store.get(membershipKey(B))).toMatchObject({ householdId: oldId });
      expect(await store.get(metaKey(oldId))).toBeDefined();
    });

    it('moves them, and removes the empty household with its member record and its invites', async () => {
      const theirInvite = await createInvite(store, await fresh(B), NOW);
      await accept(token, B, { confirmMove: true });

      expect((await fresh(B)).householdId).toBe(householdId);
      expect((await fresh(B)).members).toHaveLength(2);
      expect(await store.get(metaKey(oldId))).toBeUndefined();
      expect(await store.get({ PK: hhPk(oldId), SK: memberSk(B) })).toBeUndefined();
      expect(await store.get({ PK: hhPk(oldId), SK: invitePointerSk(theirInvite.hash) })).toBeUndefined();
      expect(await store.get(inviteKey(theirInvite.hash))).toBeUndefined();
    });

    it('does not let a move proceed when their household stopped being empty meanwhile', async () => {
      await store.put({ PK: hhPk(oldId), SK: 'TASK#t1', title: 'Hoover' });
      await expect(accept(token, B, { confirmMove: true })).rejects.toMatchObject({ extra: { canMove: false } });
      expect(await store.get(metaKey(oldId))).toBeDefined();
    });

    it('leaves a household alone that gained a member after the emptiness check, so nobody is stranded', async () => {
      const { hash } = await createInvite(store, ctx, NOW);
      // Someone accepts one of the old household's invites between the check and the move.
      await store.patch(metaKey(oldId), { memberCount: 2 });

      await expect(store.transact(joinOps({ hash, householdId }, B, 'Bea', NOW, { moveFrom: { householdId: oldId, inviteHashes: [] } })))
        .rejects.toBeInstanceOf(ConditionFailedError);
      expect(await store.get(metaKey(oldId))).toMatchObject({ memberCount: 2 });
      expect(await store.get(membershipKey(B))).toMatchObject({ householdId: oldId });
    });
  });
});

describe('a removed member replaying their invite link', () => {
  it('is not told they are in, because they have no membership', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    await accept(token, B);
    await removeMember(store, await fresh(), B);
    expect(await store.get(membershipKey(B))).toBeUndefined();

    await expect(accept(token, B)).rejects.toMatchObject({ code: 'invite_expired', status: 410 });
    expect(await store.get(membershipKey(B))).toBeUndefined();
  });

  it('still treats a retry by someone who is in as success', async () => {
    const { token } = await createInvite(store, ctx, NOW);
    await accept(token, B);
    await expect(accept(token, B)).resolves.toEqual({ householdId });
  });
});
