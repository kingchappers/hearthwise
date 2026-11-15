import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { mutKey } from '../../tasks/keys';
import { TaskError } from '../../tasks/types';
import { calremKey, eventKey } from '../keys';
import { deleteEvent, EVENT_LIMIT, listEvents, putEvent, REMINDER_EVENT_LIMIT, restoreEventEntry, setEventReminders, viewEvent } from '../events';
import type { CalendarEvent, EventWrite, EventView, Reminder, Schedule } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const DAY = 86_400_000;
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const SECRET = 'SENTINEL-title';
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

const AT = NOW - 5000;
const ONE_OFF: Schedule = { startOn: '2026-12-02', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' }, skipOn: [] };
const createWrite = (extra: EventWrite = {}): EventWrite => ({
  kind: 'event', title: { value: 'Dentist', at: AT }, schedule: { value: ONE_OFF, at: AT }, people: { value: { who: 'both', private: false }, at: AT }, ...extra,
});
const put = (id: string, write: EventWrite, who = ctx1, now = NOW, mutationId = uuid()) => putEvent(store, who, id, { ...write, mutationId }, now);
const create = async (extra: EventWrite = {}, who = ctx1): Promise<string> => {
  const id = uuid();
  await put(id, createWrite(extra), who);
  return id;
};
const privateWrite = (): EventWrite => ({ title: { value: SECRET, at: AT }, people: { value: { who: U1, private: true }, at: AT } });
const raw = async (id: string) => (await store.get(eventKey(householdId, id)))!;
const refusal = async (promise: Promise<unknown>): Promise<{ code: string; status: number; extra: Record<string, unknown> }> => {
  try { await promise; } catch (error) { if (error instanceof TaskError) return { code: error.code, status: error.status, extra: error.extra }; throw error; }
  throw new Error('expected a refusal');
};
const list = [{ from: 'start', minutes: 30 }] as Reminder[];

describe('putEvent', () => {
  it('creates an event, and the write record holds the id and nothing else', async () => {
    const id = uuid();
    const mutationId = uuid();
    const outcome = await putEvent(store, ctx1, id, { ...createWrite(), mutationId }, NOW);
    expect(outcome).toMatchObject({ fresh: true, change: 'created', result: { id } });
    expect((await store.get(mutKey(householdId, mutationId)))?.result).toEqual({ id });
    expect(await raw(id)).toMatchObject({ title: 'Dentist', createdBy: U1, kind: 'event' });
  });

  it('stores no attribute as null', async () => {
    const id = await create();
    for (const [name, value] of Object.entries(await raw(id))) expect(value, name).not.toBeNull();
  });

  it('changes an event as the other person, and keeps the rest', async () => {
    const id = await create();
    const outcome = await put(id, { title: { value: 'Hygienist', at: AT + 100 } }, ctx2, NOW + 10);
    expect(outcome.change).toBe('applied');
    expect(await raw(id)).toMatchObject({ title: 'Hygienist', startTime: '10:30', updatedBy: U2 });
  });

  it('answers a retry from the record and writes nothing', async () => {
    const id = uuid();
    const mutationId = uuid();
    const first = await putEvent(store, ctx1, id, { ...createWrite(), mutationId }, NOW);
    const before = await raw(id);
    const again = await putEvent(store, ctx1, id, { ...createWrite({ title: { value: 'Other', at: NOW } }), mutationId }, NOW + 5000);
    expect(first.fresh).toBe(true);
    expect(again).toMatchObject({ fresh: false, result: { id } });
    expect(await raw(id)).toEqual(before);
  });

  it('says nothing changed for an older write', async () => {
    const id = await create();
    const outcome = await put(id, { title: { value: 'Old', at: AT - 100 } }, ctx2);
    expect(outcome.change).toBe('noop');
    expect((await raw(id)).title).toBe('Dentist');
  });

  it('refuses an edit of an id that does not exist when it is not a create', async () => {
    expect(await refusal(put(uuid(), { title: { value: 'x', at: AT } }))).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('refuses a who that is not a member, but accepts both and either member', async () => {
    const write = (who: string): EventWrite => createWrite({ people: { value: { who, private: false }, at: AT } });
    expect(await refusal(put(uuid(), write('auth0|stranger')))).toMatchObject({ code: 'invalid', status: 400, extra: { field: 'who' } });
    await put(uuid(), write('both'));
    await put(uuid(), write(U2));
  });

  it('answers gone for an event that is deleted', async () => {
    const id = await create();
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW + 1);
    expect(await refusal(put(id, { title: { value: 'B', at: NOW } }, ctx1, NOW + 2))).toMatchObject({ code: 'gone', status: 410 });
  });

  it('refuses the other person any change to a private event, also when they replay it', async () => {
    const id = await create(privateWrite());
    const mutationId = uuid();
    const attempt = () => putEvent(store, ctx2, id, { title: { value: 'Mine now', at: NOW }, mutationId }, NOW + 1);
    expect(await refusal(attempt())).toMatchObject({ code: 'private', status: 403 });
    expect(await refusal(attempt())).toMatchObject({ code: 'private', status: 403 });
    expect((await raw(id)).title).toBe(SECRET);
  });

  it('refuses the other person making an event private', async () => {
    const id = await create();
    expect(await refusal(put(id, { people: { value: { who: U1, private: true }, at: NOW } }, ctx2, NOW + 1))).toMatchObject({ code: 'private' });
    expect((await raw(id)).private).toBe(false);
  });

  it('keeps a private event\'s who as its creator even when asked otherwise', async () => {
    const id = await create({ people: { value: { who: U2, private: true }, at: AT } });
    expect(await raw(id)).toMatchObject({ private: true, who: U1 });
  });

  it('runs again on what is stored when another write lands between the read and the update', async () => {
    const id = await create();
    const real = store.get.bind(store);
    let stale = true;
    vi.spyOn(store, 'get').mockImplementation(async (key, opts) => {
      const item = await real(key, opts);
      if (stale && item && item.SK === `EVENT#${id}`) {
        stale = false;
        return { ...item, updatedAt: Number(item.updatedAt) - 1 };
      }
      return item;
    });
    const outcome = await put(id, { place: { value: 'Surgery', at: AT + 5 } }, ctx2, NOW + 10);
    expect(outcome.change).toBe('applied');
    expect((await raw(id)).place).toBe('Surgery');
  });

  it('refuses the 501st live event, and does not count deleted ones', async () => {
    for (let i = 0; i < EVENT_LIMIT; i += 1) {
      const id = `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`;
      await store.put({ ...eventKey(householdId, id), title: 'x', createdBy: U1, private: false, ...(i === 0 ? { deletedAt: NOW } : {}) });
    }
    await put(uuid(), createWrite());
    expect(await refusal(put(uuid(), createWrite()))).toMatchObject({ code: 'event_limit', status: 409 });
  });

  it('does not count another person\'s hidden private events toward the limit once their creator has left', async () => {
    for (let i = 0; i < EVENT_LIMIT; i += 1) {
      const id = `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`;
      await store.put({ ...eventKey(householdId, id), title: 'x', createdBy: 'auth0|gone', private: true });
    }
    await put(uuid(), createWrite());
  });
});

describe('deleteEvent', () => {
  it('writes a tombstone either person can write for an event that is not private', async () => {
    const id = await create();
    const outcome = await deleteEvent(store, ctx2, id, { mutationId: uuid() }, NOW + 1);
    expect(outcome.result).toEqual({ id });
    expect(await raw(id)).toMatchObject({ deletedAt: NOW + 1, deletedBy: U2 });
  });

  it('answers 404 for an event that does not exist', async () => {
    expect(await refusal(deleteEvent(store, ctx1, uuid(), { mutationId: uuid() }, NOW))).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('refuses the other person a private event', async () => {
    const id = await create(privateWrite());
    expect(await refusal(deleteEvent(store, ctx2, id, { mutationId: uuid() }, NOW + 1))).toMatchObject({ code: 'private', status: 403 });
    expect((await raw(id)).deletedAt).toBeUndefined();
  });

  it('answers a retry from the record', async () => {
    const id = await create();
    const mutationId = uuid();
    await deleteEvent(store, ctx1, id, { mutationId }, NOW + 1);
    expect(await deleteEvent(store, ctx1, id, { mutationId }, NOW + 9)).toMatchObject({ fresh: false });
  });
});

describe('setEventReminders', () => {
  const set = (id: string, reminders: Reminder[], who = ctx1, now = NOW + 1) => setEventReminders(store, who, id, { list: reminders, mutationId: uuid() }, now);

  it('saves the caller\'s own list and the household\'s CALREM item together', async () => {
    const id = await create();
    await set(id, list);
    expect((await raw(id)).reminders).toEqual({ [U1]: { savedAt: NOW + 1, list } });
    expect(await store.get(calremKey(householdId))).toMatchObject({ PK: 'CALREM', SK: householdId, updatedAt: NOW + 1 });
  });

  it('lets either person set their own on an event that is for the other', async () => {
    const id = await create({ people: { value: { who: U1, private: false }, at: AT } });
    await set(id, list, ctx2);
    expect(Object.keys((await raw(id)).reminders as object)).toEqual([U2]);
  });

  it('keeps the other person\'s reminders when one person saves theirs', async () => {
    const id = await create();
    await set(id, list, ctx1);
    await set(id, [{ from: 'start', minutes: 5 }], ctx2, NOW + 2);
    expect(Object.keys((await raw(id)).reminders as object).sort()).toEqual([U1, U2]);
  });

  it('refuses the other person on a private event', async () => {
    const id = await create(privateWrite());
    expect(await refusal(set(id, list, ctx2))).toMatchObject({ code: 'private', status: 403 });
  });

  it('refuses more than 3 on one event with reminder_limit', async () => {
    const id = await create();
    const four = [0, 5, 10, 15].map(minutes => ({ from: 'start', minutes }) as Reminder);
    expect(await refusal(set(id, four))).toMatchObject({ code: 'reminder_limit', status: 409 });
  });

  it('refuses reminders on an all-day event, and "at the end" on an event that is not a block', async () => {
    const allDay = await create({ schedule: { value: { startOn: '2026-12-02', allDay: true, repeat: { type: 'none' }, skipOn: [] }, at: AT } });
    expect(await refusal(set(allDay, list))).toMatchObject({ code: 'invalid', status: 400, extra: { field: 'list' } });
    const timed = await create();
    expect(await refusal(set(timed, [{ from: 'end', minutes: 0 }]))).toMatchObject({ code: 'invalid', status: 400 });
  });

  it('refuses reminders on a 31st event, but lets an event that already has them be changed', async () => {
    const ids: string[] = [];
    for (let i = 0; i < REMINDER_EVENT_LIMIT; i += 1) {
      const id = await create();
      await set(id, list);
      ids.push(id);
    }
    const extra = await create();
    expect(await refusal(set(extra, list))).toMatchObject({ code: 'reminder_limit', status: 409 });
    await set(ids[0], [{ from: 'start', minutes: 5 }]);
    await set(ids[1], []);
    await set(extra, list);
  });

  it('answers 404 for an event that does not exist and 410 for a deleted one', async () => {
    expect(await refusal(set(uuid(), list))).toMatchObject({ code: 'not_found', status: 404 });
    const id = await create();
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW);
    expect(await refusal(set(id, list))).toMatchObject({ code: 'gone', status: 410 });
  });

  it('answers a retry from the record without writing again', async () => {
    const id = await create();
    const mutationId = uuid();
    await setEventReminders(store, ctx1, id, { list, mutationId }, NOW + 1);
    const again = await setEventReminders(store, ctx1, id, { list: [], mutationId }, NOW + 50);
    expect(again.fresh).toBe(false);
    expect((await raw(id)).reminders).toEqual({ [U1]: { savedAt: NOW + 1, list } });
  });

  it('does not touch CALREM when there was nothing to clear', async () => {
    const id = await create();
    await set(id, []);
    expect(await store.get(calremKey(householdId))).toBeUndefined();
  });
});

describe('listEvents and viewEvent', () => {
  it('projects a private event as busy for the other person, with no text anywhere', async () => {
    const id = await create({ ...privateWrite(), place: { value: 'SENTINEL-place', at: AT }, notes: { value: 'SENTINEL-notes', at: AT } });
    await setEventReminders(store, ctx1, id, { list, mutationId: uuid() }, NOW + 1);
    const forOther = await listEvents(store, ctx2, NOW + 2);
    expect(forOther.events).toEqual([expect.objectContaining({ id, busy: true, owner: 'Sam' })]);
    expect(JSON.stringify(forOther)).not.toContain('SENTINEL');
    expect(JSON.stringify(await viewEvent(store, ctx2, id))).not.toContain('SENTINEL');
    const forCreator = await listEvents(store, ctx1, NOW + 2);
    expect(forCreator.events[0]).toMatchObject({ title: SECRET, reminders: { [U1]: { list } } });
  });

  it('gives each person only their own reminders on a shared event', async () => {
    const id = await create();
    await setEventReminders(store, ctx1, id, { list, mutationId: uuid() }, NOW + 1);
    await setEventReminders(store, ctx2, id, { list: [{ from: 'start', minutes: 5 }], mutationId: uuid() }, NOW + 2);
    const mine = (await listEvents(store, ctx1)).events[0] as EventView;
    const theirs = (await listEvents(store, ctx2)).events[0] as EventView;
    expect(Object.keys(mine.reminders)).toEqual([U1]);
    expect(Object.keys(theirs.reminders)).toEqual([U2]);
  });

  it('lists live events and the 50 newest deleted ones the caller may see, in the last 30 days', async () => {
    const live = await create();
    const old = await create();
    await deleteEvent(store, ctx1, old, { mutationId: uuid() }, NOW - 31 * DAY);
    for (let i = 0; i < 52; i += 1) {
      const id = await create();
      await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW - 1000 + i);
    }
    const data = await listEvents(store, ctx2, NOW);
    expect(data.events.map(event => event.id)).toEqual([live]);
    expect(data.deleted).toHaveLength(50);
    expect(data.deleted.some(event => event.id === old)).toBe(false);
    expect(data.serverTime).toBe(NOW);
  });

  it('never lists the other person\'s deleted private event, but lists the creator\'s own', async () => {
    const id = await create(privateWrite());
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW + 1);
    expect((await listEvents(store, ctx2, NOW + 2)).deleted).toEqual([]);
    expect((await listEvents(store, ctx1, NOW + 2)).deleted.map(event => event.id)).toEqual([id]);
  });

  it('hides a private event, and the reminders, of someone who is no longer a member', async () => {
    const id = await create(privateWrite());
    const shared = await create();
    await setEventReminders(store, ctx1, shared, { list, mutationId: uuid() }, NOW + 1);
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U1) });
    await store.delete(membershipKey(U1));
    const after = (await loadContext(store, U2))!;
    const data = await listEvents(store, after, NOW + 2);
    expect(data.events.map(event => event.id)).toEqual([shared]);
    expect((data.events[0] as EventView).reminders).toEqual({});
    expect(await refusal(viewEvent(store, after, id))).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('answers 404 for an event that does not exist', async () => {
    expect(await refusal(viewEvent(store, ctx1, uuid()))).toMatchObject({ code: 'not_found' });
  });
});

describe('restoreEventEntry', () => {
  const restore = (id: string, deletedAt: number, who = ctx1, batch: { live?: number } = {}) => restoreEventEntry(store, who, { id, deletedAt }, batch, NOW + 100);

  it('restores an event the caller saw deleted, as either person', async () => {
    const id = await create();
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW + 1);
    expect(await restore(id, NOW + 1, ctx2)).toBe('restored');
    const event = (await raw(id)) as unknown as CalendarEvent;
    expect(event.deletedAt).toBeUndefined();
    expect(event.title).toBe('Dentist');
  });

  it('does nothing twice, and not for an event that is not deleted', async () => {
    const id = await create();
    expect(await restore(id, NOW)).toBe('noop');
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW + 1);
    expect(await restore(id, NOW + 1)).toBe('restored');
    expect(await restore(id, NOW + 1)).toBe('noop');
  });

  it('says entry_changed when it was restored and deleted again since', async () => {
    const id = await create();
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW + 1);
    expect(await restore(id, NOW + 999)).toBe('entry_changed');
  });

  it('says not_found for a missing event', async () => {
    expect(await restore(uuid(), NOW)).toBe('not_found');
  });

  it('lets only the creator restore a private one, and shows the other person nothing', async () => {
    const id = await create(privateWrite());
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW + 1);
    expect(await restore(id, NOW + 1, ctx2)).toBe('not_found');
    expect(await restore(id, NOW + 1, ctx1)).toBe('restored');
  });

  it('is held to the 500 live event limit, counting those restored earlier in the batch', async () => {
    const id = await create();
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, NOW + 1);
    expect(await restore(id, NOW + 1, ctx1, { live: EVENT_LIMIT })).toBe('event_limit');
    expect(await restore(id, NOW + 1, ctx1, { live: EVENT_LIMIT - 1 })).toBe('restored');
  });
});
