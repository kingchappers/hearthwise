import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { createHousehold } from '../households';
import { loadContext } from '../guard';
import { hhPk, membershipKey, memberSk } from '../keys';

let store: MemoryStore;
let householdId: string;

beforeEach(async () => {
  store = new MemoryStore();
  ({ householdId } = await createHousehold(store, { userId: 'auth0|u1', name: 'Home', timezone: 'Europe/London', displayName: 'Sam' }, vi.fn()));
});

describe('loadContext', () => {
  it('returns the household, the caller and every member', async () => {
    await store.put({ PK: hhPk(householdId), SK: memberSk('auth0|u2'), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
    const ctx = await loadContext(store, 'auth0|u1');

    expect(ctx?.householdId).toBe(householdId);
    expect(ctx?.household).toMatchObject({ name: 'Home', timezone: 'Europe/London', createdBy: 'auth0|u1', memberCount: 1 });
    expect(ctx?.member).toMatchObject({ userId: 'auth0|u1', displayName: 'Sam' });
    expect(ctx?.members.map(member => member.userId).sort()).toEqual(['auth0|u1', 'auth0|u2']);
  });

  it('answers for each member with their own record', async () => {
    await store.put({ PK: hhPk(householdId), SK: memberSk('auth0|u2'), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
    await store.put({ ...membershipKey('auth0|u2'), householdId });
    expect((await loadContext(store, 'auth0|u2'))?.member.displayName).toBe('Alex');
  });

  it('is undefined for someone with no membership', async () => {
    expect(await loadContext(store, 'auth0|stranger')).toBeUndefined();
  });

  it('is undefined when the membership points at a household that no longer exists', async () => {
    await store.put({ ...membershipKey('auth0|ghost'), householdId: 'gone' });
    expect(await loadContext(store, 'auth0|ghost')).toBeUndefined();
  });

  it('is undefined when the household has no record for the caller', async () => {
    await store.put({ ...membershipKey('auth0|orphan'), householdId });
    expect(await loadContext(store, 'auth0|orphan')).toBeUndefined();
  });

  it('fills in any setting a stored member record lacks, from the defaults', async () => {
    await store.put({ PK: hhPk(householdId), SK: memberSk('auth0|u1'), displayName: 'Sam', joinedAt: '2026-11-13T10:00:00.000Z', settings: { defaultView: 'next' } });
    const ctx = await loadContext(store, 'auth0|u1');
    expect(ctx?.member.settings).toEqual({ ...DEFAULT_SETTINGS, defaultView: 'next' });
  });
});
