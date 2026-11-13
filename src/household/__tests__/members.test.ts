import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { loadContext } from '../guard';
import { createHousehold } from '../households';
import { hhPk, membershipKey, memberSk } from '../keys';
import { updateOwnMember } from '../members';
import type { HouseholdContext } from '../types';

let store: MemoryStore;
let householdId: string;
let ctx: HouseholdContext;

beforeEach(async () => {
  store = new MemoryStore();
  ({ householdId } = await createHousehold(store, { userId: 'auth0|u1', name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: Date.parse('2026-11-13T10:00:00.000Z') }, vi.fn()));
  await store.put({ PK: hhPk(householdId), SK: memberSk('auth0|u2'), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey('auth0|u2'), householdId });
  ctx = (await loadContext(store, 'auth0|u1'))!;
});

describe('updateOwnMember', () => {
  it('changes the display name alone', async () => {
    const member = await updateOwnMember(store, ctx, { displayName: 'Samuel' });
    expect(member).toMatchObject({ userId: 'auth0|u1', displayName: 'Samuel', settings: DEFAULT_SETTINGS });
  });

  it('changes one setting and keeps the rest, including the switch beside an hour', async () => {
    await updateOwnMember(store, ctx, { settings: { digest: { on: true } } });
    const after = await updateOwnMember(store, (await loadContext(store, 'auth0|u1'))!, { settings: { digest: { hour: 21 } } });
    expect(after.settings.digest).toEqual({ on: true, hour: 21 });
    expect(after.settings.dueNudges).toEqual(DEFAULT_SETTINGS.dueNudges);
    expect(after.settings.defaultView).toBe('list');
  });

  it('sets and clears quiet hours', async () => {
    const set = await updateOwnMember(store, ctx, { settings: { quietHours: { start: 22, end: 7 } } });
    expect(set.settings.quietHours).toEqual({ start: 22, end: 7 });
    const cleared = await updateOwnMember(store, (await loadContext(store, 'auth0|u1'))!, { settings: { quietHours: null } });
    expect(cleared.settings.quietHours).toBeNull();
  });

  it('persists, so the next request sees it', async () => {
    await updateOwnMember(store, ctx, { settings: { defaultView: 'next' } });
    expect((await loadContext(store, 'auth0|u1'))?.member.settings.defaultView).toBe('next');
  });

  it("never touches the other member's record", async () => {
    const before = await store.get({ PK: hhPk(householdId), SK: memberSk('auth0|u2') });
    await updateOwnMember(store, ctx, { displayName: 'Samuel', settings: { defaultView: 'next' } });
    expect(await store.get({ PK: hhPk(householdId), SK: memberSk('auth0|u2') })).toEqual(before);
  });

  it('keeps the joined time and the reminder bookkeeping', async () => {
    await store.patch({ PK: hhPk(householdId), SK: memberSk('auth0|u1') }, { lastDigestSent: '2026-11-12' });
    const member = await updateOwnMember(store, (await loadContext(store, 'auth0|u1'))!, { displayName: 'Samuel' });
    expect(member).toMatchObject({ joinedAt: '2026-11-13T10:00:00.000Z', lastDigestSent: '2026-11-12' });
  });
});
