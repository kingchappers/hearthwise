import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { purgeNonMemberData } from '../cleanup';
import { deleteEvent, listEvents, putEvent, setEventReminders } from '../events';
import { eventKey } from '../keys';
import type { EventView, EventWrite } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
let store: MemoryStore;
let ctx1: HouseholdContext;
let ctx2: HouseholdContext;
let householdId: string;

beforeEach(async () => {
  n = 0;
  store = new MemoryStore();
  ({ householdId } = await createHousehold(store, { userId: U1, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW }, vi.fn()));
  await store.put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey(U2), householdId });
  ctx1 = (await loadContext(store, U1))!;
  ctx2 = (await loadContext(store, U2))!;
});

const write = (isPrivate: boolean): EventWrite => ({
  kind: 'event', title: { value: 'T', at: NOW - 1 },
  schedule: { value: { startOn: '2026-12-02', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' }, skipOn: [] }, at: NOW - 1 },
  people: { value: { who: 'both', private: isPrivate }, at: NOW - 1 },
});
const make = async (ctx: HouseholdContext, isPrivate = false): Promise<string> => {
  const id = uuid();
  await putEvent(store, ctx, id, { ...write(isPrivate), mutationId: uuid() }, NOW);
  return id;
};
const remind = (ctx: HouseholdContext, id: string) => setEventReminders(store, ctx, id, { list: [{ from: 'start', minutes: 5 }], mutationId: uuid() }, NOW + 1);

describe('purgeNonMemberData', () => {
  it('deletes the private events of someone who is no longer a member, and nobody else\'s', async () => {
    const theirsPrivate = await make(ctx2, true);
    const theirsShared = await make(ctx2);
    const minePrivate = await make(ctx1, true);
    const result = await purgeNonMemberData(store, householdId, new Set([U1]));
    expect(result).toMatchObject({ deleted: 1, failed: 0 });
    expect(await store.get(eventKey(householdId, theirsPrivate))).toBeUndefined();
    expect(await store.get(eventKey(householdId, theirsShared))).toBeDefined();
    expect(await store.get(eventKey(householdId, minePrivate))).toBeDefined();
  });

  it('deletes a deleted private event of theirs too', async () => {
    const id = await make(ctx2, true);
    await deleteEvent(store, ctx2, id, { mutationId: uuid() }, NOW + 1);
    await purgeNonMemberData(store, householdId, new Set([U1]));
    expect(await store.get(eventKey(householdId, id))).toBeUndefined();
  });

  it('takes their reminders off events that stay, and keeps the remaining person\'s', async () => {
    const id = await make(ctx1);
    await remind(ctx1, id);
    await remind(ctx2, id);
    const only2 = await make(ctx1);
    await remind(ctx2, only2);
    const result = await purgeNonMemberData(store, householdId, new Set([U1]));
    expect(result.trimmed).toBe(2);
    expect(Object.keys((await store.get(eventKey(householdId, id)))!.reminders as object)).toEqual([U1]);
    expect('reminders' in (await store.get(eventKey(householdId, only2)))!).toBe(false);
  });

  it('does nothing to a household where everyone is a member, and is safe to run twice', async () => {
    await make(ctx2, true);
    expect(await purgeNonMemberData(store, householdId, new Set([U1, U2]))).toEqual({ deleted: 0, trimmed: 0, failed: 0 });
    await purgeNonMemberData(store, householdId, new Set([U1]));
    expect(await purgeNonMemberData(store, householdId, new Set([U1]))).toEqual({ deleted: 0, trimmed: 0, failed: 0 });
  });

  it('counts a delete that fails, carries on with the rest, and never throws or logs text', async () => {
    const a = await make(ctx2, true);
    const b = await make(ctx2, true);
    const real = store.delete.bind(store);
    vi.spyOn(store, 'delete').mockImplementation(async (key, opts) => {
      if (key.SK === `EVENT#${a}`) throw new Error('SENTINEL boom');
      return real(key, opts);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await purgeNonMemberData(store, householdId, new Set([U1]));
    expect(result).toMatchObject({ deleted: 1, failed: 1 });
    expect(await store.get(eventKey(householdId, b))).toBeUndefined();
    expect(await store.get(eventKey(householdId, a))).toBeDefined();
    expect(JSON.stringify(errors.mock.calls)).not.toContain('SENTINEL');
  });

  it('leaves what it did not get to hidden: reads leave out the private event and the reminders', async () => {
    const hidden = await make(ctx2, true);
    const shared = await make(ctx1);
    await remind(ctx2, shared);
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    await store.delete(membershipKey(U2));
    const after = (await loadContext(store, U1))!;
    const data = await listEvents(store, after, NOW + 2);
    expect(data.events.map(event => event.id)).toEqual([shared]);
    expect((data.events[0] as EventView).reminders).toEqual({});
    expect(hidden).toBeDefined();
  });
});
