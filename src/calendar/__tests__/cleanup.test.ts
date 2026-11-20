import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { purgeNonMemberData } from '../cleanup';
import { deleteEvent, listEvents, putEvent, setEventReminders } from '../events';
import { addFeed } from '../feeds';
import type { FeedDeps } from '../feeds';
import { CALFEEDS, eventKey, feedIndexKey, feedKey, secretKey } from '../keys';
import { fetchedFixtureDeps } from './feedFixtures';
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
const leave = async (user: string): Promise<void> => { await store.delete({ PK: hhPk(householdId), SK: memberSk(user) }); await store.delete(membershipKey(user)); };
const remind = (ctx: HouseholdContext, id: string) => setEventReminders(store, ctx, id, { list: [{ from: 'start', minutes: 5 }], mutationId: uuid() }, NOW + 1);

describe('purgeNonMemberData', () => {
  it('deletes the private events of someone who is no longer a member, and nobody else\'s', async () => {
    const theirsPrivate = await make(ctx2, true);
    await leave(U2);
    const theirsShared = await make(ctx2);
    const minePrivate = await make(ctx1, true);
    const result = await purgeNonMemberData(store, householdId);
    expect(result).toMatchObject({ deleted: 1, failed: 0 });
    expect(await store.get(eventKey(householdId, theirsPrivate))).toBeUndefined();
    expect(await store.get(eventKey(householdId, theirsShared))).toBeDefined();
    expect(await store.get(eventKey(householdId, minePrivate))).toBeDefined();
  });

  it('deletes a deleted private event of theirs too', async () => {
    const id = await make(ctx2, true);
    await deleteEvent(store, ctx2, id, { mutationId: uuid() }, NOW + 1);
    await leave(U2);
    await purgeNonMemberData(store, householdId);
    expect(await store.get(eventKey(householdId, id))).toBeUndefined();
  });

  it('takes their reminders off events that stay, and keeps the remaining person\'s', async () => {
    const id = await make(ctx1);
    await remind(ctx1, id);
    await remind(ctx2, id);
    const only2 = await make(ctx1);
    await remind(ctx2, only2);
    await leave(U2);
    const result = await purgeNonMemberData(store, householdId);
    expect(result.trimmed).toBe(2);
    expect(Object.keys((await store.get(eventKey(householdId, id)))!.reminders as object)).toEqual([U1]);
    expect('reminders' in (await store.get(eventKey(householdId, only2)))!).toBe(false);
  });

  it('does nothing to a household where everyone is a member, and is safe to run twice', async () => {
    await make(ctx2, true);
    expect(await purgeNonMemberData(store, householdId, )).toEqual({ deleted: 0, trimmed: 0, feeds: 0, failed: 0 });
    await leave(U2);
    await purgeNonMemberData(store, householdId);
    expect(await purgeNonMemberData(store, householdId)).toEqual({ deleted: 0, trimmed: 0, feeds: 0, failed: 0 });
  });

  it('counts a delete that fails, carries on with the rest, and never throws or logs text', async () => {
    const a = await make(ctx2, true);
    const b = await make(ctx2, true);
    await leave(U2);
    const real = store.delete.bind(store);
    vi.spyOn(store, 'delete').mockImplementation(async (key, opts) => {
      if (key.SK === `EVENT#${a}`) throw new Error('SENTINEL boom');
      return real(key, opts);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await purgeNonMemberData(store, householdId);
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

describe('a member who is still valid', () => {
  it('keeps their data when the list the route read before the removal is stale (someone joined meanwhile)', async () => {
    const U3 = 'auth0|u3';
    await store.put({ PK: hhPk(householdId), SK: memberSk(U3), displayName: 'Cam', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-14T09:00:00.000Z' });
    await store.put({ ...membershipKey(U3), householdId });
    const ctx3 = (await loadContext(store, U3))!;
    const theirs = await make(ctx3, true);
    const shared = await make(ctx1);
    await remind(ctx3, shared);
    await leave(U2);
    // ctx1.members is the stale read (Sam and Alex); the purge must use the current records.
    await purgeNonMemberData(store, householdId);
    expect(await store.get(eventKey(householdId, theirs))).toBeDefined();
    expect(Object.keys((await store.get(eventKey(householdId, shared)))!.reminders as object)).toEqual([U3]);
  });
});

describe('purgeNonMemberData: stale and failing reads', () => {
  it('treats the removed user as a non-member even when the member query still lists them', async () => {
    const id = await make(ctx2, true);
    // No `leave`: the member list a read returns still holds Alex, as a non-consistent query can just after a removal.
    const result = await purgeNonMemberData(store, householdId, U2);
    expect(result.deleted).toBe(1);
    expect(await store.get(eventKey(householdId, id))).toBeUndefined();
  });

  it('still keeps everyone else the current records list', async () => {
    const mine = await make(ctx1, true);
    await purgeNonMemberData(store, householdId, U2);
    expect(await store.get(eventKey(householdId, mine))).toBeDefined();
  });

  it('never throws when a query rejects, and logs only the error name', async () => {
    vi.spyOn(store, 'query').mockRejectedValue(new Error('SENTINEL boom'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(purgeNonMemberData(store, householdId, U2)).resolves.toEqual({ deleted: 0, trimmed: 0, feeds: 0, failed: 1 });
    expect(JSON.stringify(errors.mock.calls)).not.toContain('SENTINEL');
    expect(errors).toHaveBeenCalled();
  });
});

describe('purgeNonMemberData: feeds', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  let deps: FeedDeps;
  beforeEach(() => { deps = fetchedFixtureDeps(); vi.spyOn(console, 'log').mockImplementation(() => undefined); });
  const addFor = (ctx: HouseholdContext, id: string) => addFeed(store, deps, ctx, { id, link: 'https://calendar.google.com/calendar/ical/x/y/basic.ics', label: 'L', share: 'busy' }, NOW);
  const snaps = (id: string) => store.query(hhPk(householdId), { skPrefix: `CALSNAP#${id}#` });

  it('deletes the feed, its secret, its chunks and its index item for someone who is no longer a member, and keeps the other person\'s', async () => {
    await addFor(ctx2, A);
    await addFor(ctx1, B);
    expect((await snaps(A)).length).toBeGreaterThan(0);
    await leave(U2);
    const result = await purgeNonMemberData(store, householdId);
    expect(result.feeds).toBe(1);
    expect(await store.get(feedKey(householdId, A))).toBeUndefined();
    expect(await store.get(secretKey(householdId, A))).toBeUndefined();
    expect(await snaps(A)).toEqual([]);
    expect(await store.get(feedIndexKey(householdId, A))).toBeUndefined();
    expect(await store.get(feedKey(householdId, B))).toBeDefined();
    expect((await store.query(CALFEEDS)).map(row => row.SK)).toEqual([`${householdId}#${B}`]);
  });

  it('deletes the removed person\'s feed even when the member query still lists them, when told who was removed', async () => {
    await addFor(ctx2, A);
    await purgeNonMemberData(store, householdId, U2);
    expect(await store.get(feedKey(householdId, A))).toBeUndefined();
  });
});
