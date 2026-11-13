import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import type { Key } from '../../store';
import { createHousehold } from '../households';
import { hhPk, membershipKey, memberSk } from '../keys';
import { HouseholdError } from '../types';

const NOW = Date.parse('2026-11-13T10:00:00.000Z');
const input = { userId: 'auth0|u1', name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW };

let store: MemoryStore;
beforeEach(() => { store = new MemoryStore(); });

function hasNull(value: unknown): boolean {
  if (value === null) return true;
  return typeof value === 'object' && value !== undefined && Object.values(value as object).some(hasNull);
}

describe('createHousehold', () => {
  it('writes the household, the creator as its first member, and the membership lookup', async () => {
    const { householdId } = await createHousehold(store, input, vi.fn());

    expect(await store.get({ PK: hhPk(householdId), SK: 'META' })).toEqual({
      PK: hhPk(householdId), SK: 'META', name: 'Home', timezone: 'Europe/London', createdBy: 'auth0|u1',
      createdAt: '2026-11-13T10:00:00.000Z', memberCount: 1,
    });
    expect(await store.get({ PK: hhPk(householdId), SK: memberSk('auth0|u1') })).toEqual({
      PK: hhPk(householdId), SK: memberSk('auth0|u1'), displayName: 'Sam', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T10:00:00.000Z',
    });
    expect(await store.get(membershipKey('auth0|u1'))).toEqual({ ...membershipKey('auth0|u1'), householdId });
  });

  it('starts every reminder off, at the documented hours', async () => {
    const { householdId } = await createHousehold(store, input, vi.fn());
    const member = await store.get({ PK: hhPk(householdId), SK: memberSk('auth0|u1') });
    expect(member?.settings).toEqual({
      digest: { on: false, hour: 19 }, dueNudges: { on: false, hour: 8 }, quietHours: null, defaultView: 'list',
    });
  });

  it('never stores a null as an item attribute (the one null is inside the settings value the spec defines)', async () => {
    const { householdId } = await createHousehold(store, input, vi.fn());
    for (const key of [{ PK: hhPk(householdId), SK: 'META' }, membershipKey('auth0|u1')]) expect(hasNull(await store.get(key))).toBe(false);
    const member = (await store.get({ PK: hhPk(householdId), SK: memberSk('auth0|u1') })) as Record<string, unknown>;
    expect(hasNull({ ...member, settings: undefined })).toBe(false);
  });

  it('gives each household its own id', async () => {
    const first = await createHousehold(store, input, vi.fn());
    const second = await createHousehold(store, { ...input, userId: 'auth0|u2' }, vi.fn());
    expect(first.householdId).not.toBe(second.householdId);
  });

  it('refuses a person who already belongs to a household, and writes nothing', async () => {
    const first = await createHousehold(store, input, vi.fn());
    const emit = vi.fn();
    await expect(createHousehold(store, { ...input, name: 'Second' }, emit)).rejects.toMatchObject({ code: 'already_member', status: 409 });
    expect(await store.get(membershipKey('auth0|u1'))).toMatchObject({ householdId: first.householdId });
    expect(emit).not.toHaveBeenCalled();
  });

  it('leaves exactly one household behind when the same person creates two at once', async () => {
    const created: string[] = [];
    const realTransact = store.transact.bind(store);
    vi.spyOn(store, 'transact').mockImplementation(async ops => {
      const meta = ops.find(op => 'put' in op && op.put.SK === 'META');
      if (meta && 'put' in meta) created.push(meta.put.PK);
      return realTransact(ops);
    });

    const results = await Promise.allSettled([
      createHousehold(store, { ...input, name: 'A' }, vi.fn()),
      createHousehold(store, { ...input, name: 'B' }, vi.fn()),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(HouseholdError) });
    const surviving: Key[] = [];
    for (const pk of created) if (await store.get({ PK: pk, SK: 'META' })) surviving.push({ PK: pk, SK: 'META' });
    expect(surviving).toHaveLength(1);
  });

  it('emits one household_created event with the ids and time, and no name', async () => {
    const emit = vi.fn();
    const { householdId } = await createHousehold(store, input, emit);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ event: 'household_created', userId: 'auth0|u1', householdId, at: '2026-11-13T10:00:00.000Z' });
    expect(JSON.stringify(emit.mock.calls[0][0])).not.toMatch(/Home|Sam/);
  });
});
