import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { fakeSender, twoMemberHousehold, U1, U2 } from '../../push/__tests__/fixture';
import type { PushSender } from '../../push/sender';
import { removeSubscription, saveSubscription } from '../../push/subscriptions';
import type { MemoryStore } from '../../store/memory';
import { deleteEvent, putEvent, setEventReminders } from '../events';
import { calremKey, eventKey, remindKey } from '../keys';
import { runReminders } from '../reminders';
import type { EventWrite, Reminder, Schedule } from '../types';

const SECRET = 'SENTINEL-title';
const at = (iso: string): number => Date.parse(iso);
const SET_AT = at('2026-02-01T09:00:00Z');
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

let store: MemoryStore;
let ctx1: HouseholdContext;
let ctx2: HouseholdContext;
let householdId: string;
let sender: PushSender & { sent: { endpoint: string; payload: { title: string; body: string; url?: string } }[] };
let logs: string[];

beforeEach(async () => {
  n = 0;
  ({ store, ctx1, ctx2, householdId } = await twoMemberHousehold());
  sender = fakeSender();
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => { logs.push(String(line)); });
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => { logs.push(String(line)); });
});
afterEach(() => vi.restoreAllMocks());

const timed = (startOn: string, startTime: string, over: Partial<Schedule> = {}): Schedule =>
  ({ startOn, allDay: false, startTime, durationMin: 60, repeat: { type: 'none' }, skipOn: [], ...over });
const daily = (startOn: string, time: string, over: Partial<Schedule> = {}): Schedule =>
  timed(startOn, time, { repeat: { type: 'fixed', every: 1, unit: 'day', startOn } as never, ...over });

async function create(schedule: Schedule, extra: EventWrite = {}, who = ctx1): Promise<string> {
  const id = uuid();
  await putEvent(store, who, id, {
    mutationId: uuid(), kind: 'event', title: { value: SECRET, at: SET_AT }, schedule: { value: schedule, at: SET_AT },
    people: { value: { who: 'both', private: false }, at: SET_AT }, ...extra,
  }, SET_AT);
  return id;
}
const remind = (id: string, list: Reminder[], who = ctx1, savedAt = SET_AT) => setEventReminders(store, who, id, { list, mutationId: uuid() }, savedAt);
const run = (iso: string) => runReminders(store, sender, new Date(iso));
const start = (minutes: number): Reminder => ({ from: 'start', minutes });
const dentist = () => create(timed('2026-12-02', '10:30'));
const titles = (): string[] => sender.sent.map(item => item.payload.title);

describe('runReminders: when a reminder is sent', () => {
  it('sends the person who asked, and only them, about 30 minutes before', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    const summary = await run('2026-12-02T10:03:00Z');
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].endpoint).toContain(U1);
    expect(sender.sent[0].payload).toMatchObject({ title: `${SECRET} starts in 30 minutes`, body: '', url: '/plan/calendar' });
    expect(summary).toMatchObject({ due: 1, claimed: 1, sent: 1, failed: 0 });
  });

  it('does not send before the moment', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await run('2026-12-02T09:59:00Z');
    expect(sender.sent).toHaveLength(0);
  });

  it('says "is starting" for zero minutes and "ends now" for the end of a block', async () => {
    const id = await create(timed('2026-12-02', '21:30'), { kind: 'block' });
    await remind(id, [start(0), { from: 'end', minutes: 0 }]);
    await run('2026-12-02T21:31:00Z');
    await run('2026-12-02T22:31:00Z');
    expect(titles()).toEqual([`${SECRET} is starting`, `${SECRET} ends now`]);
  });

  it('says hours and days for whole ones', async () => {
    const id = await dentist();
    await remind(id, [start(60), start(120), start(1440)]);
    await run('2026-12-01T10:31:00Z');
    await run('2026-12-02T08:31:00Z');
    await run('2026-12-02T09:31:00Z');
    expect(titles().sort()).toEqual([`${SECRET} starts in 1 day`, `${SECRET} starts in 1 hour`, `${SECRET} starts in 2 hours`]);
  });

  it('finds a 1,440 minute reminder on an early event: the occurrence is the next day', async () => {
    const id = await create(timed('2026-12-03', '06:00'));
    await remind(id, [start(1440)]);
    await run('2026-12-02T06:05:00Z');
    expect(sender.sent).toHaveLength(1);
  });
});

describe('runReminders: at most once, and the catch-up window', () => {
  it('sends once however many runs see it, and records the claim', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await run('2026-12-02T10:01:00Z');
    await run('2026-12-02T10:06:00Z');
    expect(sender.sent).toHaveLength(1);
    const claim = await store.get(remindKey(householdId, id, '2026-12-02', 'start', 30, U1));
    expect(claim).toMatchObject({ instant: at('2026-12-02T10:00:00Z'), rule: 'normal' });
    expect(Number(claim?.expiresAt)).toBe(Math.floor(at('2026-12-02T10:01:00Z') / 1000) + 2 * 86_400);
  });

  it('two runs at the same moment give one send', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await Promise.all([run('2026-12-02T10:01:00Z'), run('2026-12-02T10:01:00Z')]);
    expect(sender.sent).toHaveLength(1);
  });

  it('catches up a missed run inside 15 minutes, and skips one 15 minutes old', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    const late = await run('2026-12-02T10:15:00Z');
    expect(sender.sent).toHaveLength(0);
    expect(late.stale).toBe(1);
    await run('2026-12-02T10:14:59Z');
    expect(sender.sent).toHaveLength(1);
  });

  it('never retries a send that failed', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    sender.send = vi.fn(async () => { throw new Error('offline'); });
    const first = await run('2026-12-02T10:01:00Z');
    expect(first).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    await run('2026-12-02T10:06:00Z');
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for a reminder saved after its moment', async () => {
    const id = await dentist();
    await remind(id, [start(30)], ctx1, at('2026-12-02T10:05:00Z'));
    const summary = await run('2026-12-02T10:06:00Z');
    expect(sender.sent).toHaveLength(0);
    expect(summary.stale).toBe(1);
  });

  it('sends nothing when the person has no push subscription, and does not use up the claim', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await removeSubscription(store, U1, `https://fcm.googleapis.com/fcm/send/${U1}`);
    await run('2026-12-02T10:01:00Z');
    expect(sender.sent).toHaveLength(0);
    expect(await store.get(remindKey(householdId, id, '2026-12-02', 'start', 30, U1))).toBeUndefined();
    await saveSubscription(store, U1, { endpoint: `https://fcm.googleapis.com/fcm/send/${U1}`, p256dh: 'p', auth: 'a', createdAt: 1 });
    await run('2026-12-02T10:06:00Z');
    expect(sender.sent).toHaveLength(1);
  });
});

describe('runReminders: who and what', () => {
  it('sends even in the person\'s quiet hours', async () => {
    const quiet = await twoMemberHousehold({ u1: { quietHours: { start: 22, end: 7 } } as never });
    store = quiet.store; ctx1 = quiet.ctx1; householdId = quiet.householdId;
    const id = await create(timed('2026-12-02', '06:00'));
    await remind(id, [start(0)]);
    await run('2026-12-02T06:01:00Z');
    expect(sender.sent).toHaveLength(1);
  });

  it('sends each person their own reminders', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await remind(id, [start(10)], ctx2);
    await run('2026-12-02T10:21:00Z');
    await run('2026-12-02T10:01:00Z');
    expect(sender.sent.map(item => [item.endpoint.slice(-2), item.payload.title])).toEqual([
      ['u2', `${SECRET} starts in 10 minutes`], ['u1', `${SECRET} starts in 30 minutes`],
    ]);
  });

  it('sends nothing for a deleted event', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await deleteEvent(store, ctx1, id, { mutationId: uuid() }, SET_AT + 1);
    await run('2026-12-02T10:01:00Z');
    expect(sender.sent).toHaveLength(0);
  });

  it('sends nothing for an all-day event', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await store.patch(eventKey(householdId, id), { allDay: true });
    await run('2026-12-02T10:01:00Z');
    expect(sender.sent).toHaveLength(0);
  });

  it('sends nothing for a person who is no longer a member, though their entry and device remain', async () => {
    const id = await dentist();
    await remind(id, [start(30)], ctx2);
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    await store.delete(membershipKey(U2));
    const summary = await run('2026-12-02T10:01:00Z');
    expect(sender.sent).toHaveLength(0);
    expect(summary.due).toBe(0);
  });

  it('sends nothing for a private event whose creator has left', async () => {
    const id = await create(timed('2026-12-02', '10:30'), { people: { value: { who: U2, private: true }, at: SET_AT } }, ctx2);
    await remind(id, [start(30)], ctx2);
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    await run('2026-12-02T10:01:00Z');
    expect(sender.sent).toHaveLength(0);
  });

  it('sends a person their own private event with its title', async () => {
    const id = await create(timed('2026-12-02', '10:30'), { people: { value: { who: U1, private: true }, at: SET_AT } });
    await remind(id, [start(30)]);
    await run('2026-12-02T10:01:00Z');
    expect(titles()).toEqual([`${SECRET} starts in 30 minutes`]);
  });

  it('sends the other person nothing after the event is made private, and the write removed their entry', async () => {
    const id = await dentist();
    await remind(id, [start(30)], ctx2);
    await putEvent(store, ctx1, id, { mutationId: uuid(), people: { value: { who: U1, private: true }, at: SET_AT + 1000 } }, SET_AT + 1000);
    expect((await store.get(eventKey(householdId, id)))?.reminders).toBeUndefined();
    await run('2026-12-02T10:01:00Z');
    expect(sender.sent).toHaveLength(0);
  });

  it('sends the other person nothing for a private event even if their entry were still stored', async () => {
    const id = await dentist();
    await remind(id, [start(30)], ctx2);
    await store.patch(eventKey(householdId, id), { private: true, who: U1 });
    await run('2026-12-02T10:01:00Z');
    expect(sender.sent).toHaveLength(0);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('skips a skipped day and stops at the end date of a repeat', async () => {
    const id = await create(daily('2026-12-01', '10:30', { skipOn: ['2026-12-02'], repeatEndsOn: '2026-12-03' }));
    await remind(id, [start(30)]);
    await run('2026-12-02T10:01:00Z');
    expect(sender.sent).toHaveLength(0);
    await run('2026-12-03T10:01:00Z');
    expect(sender.sent).toHaveLength(1);
    await run('2026-12-04T10:01:00Z');
    expect(sender.sent).toHaveLength(1);
  });
});

describe('runReminders: the clocks change (London)', () => {
  it('sends a reminder for 01:30 on the night it does not exist at the first moment after the gap', async () => {
    const id = await create(daily('2026-03-01', '01:30'), { kind: 'block' });
    await remind(id, [start(0)]);
    await run('2026-03-29T00:45:00Z');
    expect(sender.sent).toHaveLength(0);
    await run('2026-03-29T01:02:00Z');
    expect(sender.sent).toHaveLength(1);
    const claim = await store.get(remindKey(householdId, id, '2026-03-29', 'start', 0, U1));
    expect(claim).toMatchObject({ instant: at('2026-03-29T01:00:00Z'), rule: 'gap_forward' });
  });

  it('sends once on the night 01:30 happens twice, at the first', async () => {
    const id = await create(daily('2026-03-01', '01:30'), { kind: 'block' });
    await remind(id, [start(0)]);
    await run('2026-10-25T00:32:00Z');
    await run('2026-10-25T01:32:00Z');
    expect(sender.sent).toHaveLength(1);
    const claim = await store.get(remindKey(householdId, id, '2026-10-25', 'start', 0, U1));
    expect(claim).toMatchObject({ instant: at('2026-10-25T00:30:00Z'), rule: 'first_of_two' });
  });

  it('counts "60 minutes before" as 60 real minutes across the change', async () => {
    const id = await create(timed('2026-03-29', '03:00'));
    await remind(id, [start(60)]);
    await run('2026-03-29T00:01:00Z');
    expect(sender.sent).toHaveLength(0);
    // 03:00 BST is 02:00Z, so the moment is 01:00Z.
    await run('2026-03-29T01:01:00Z');
    expect(sender.sent).toHaveLength(1);
  });

  it('keeps a daily 21:30 block at 21:30 on both sides of the change', async () => {
    const id = await create(daily('2026-03-01', '21:30'), { kind: 'block' });
    await remind(id, [start(0)]);
    await run('2026-03-28T21:31:00Z');
    await run('2026-03-29T20:31:00Z');
    expect(sender.sent).toHaveLength(2);
  });

  it('has no special case in a zone with no daylight saving', async () => {
    await store.patch({ PK: hhPk(householdId), SK: 'META' }, { timezone: 'Asia/Tokyo' });
    const id = await create(timed('2026-03-29', '10:30'));
    await remind(id, [start(30)]);
    await run('2026-03-29T01:01:00Z');
    expect(sender.sent).toHaveLength(1);
  });
});

describe('runReminders: finding what is due', () => {
  it('reads nothing of a household whose item is marked empty', async () => {
    await store.put({ ...calremKey(householdId), updatedAt: 1, empty: true });
    const spy = vi.spyOn(store, 'query');
    await run('2026-12-02T10:01:00Z');
    expect(spy.mock.calls.filter(([pk]) => pk === hhPk(householdId))).toHaveLength(0);
  });

  it('marks the item empty when no event has a reminder, and a later save arms it again', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await remind(id, []);
    await run('2026-12-02T10:01:00Z');
    expect((await store.get(calremKey(householdId)))?.empty).toBe(true);
    await remind(id, [start(30)], ctx1, SET_AT + 10);
    expect((await store.get(calremKey(householdId)))?.empty).toBeUndefined();
    await run('2026-12-02T10:02:00Z');
    expect(sender.sent).toHaveLength(1);
  });

  it('does not mark the item empty when a save landed after the job read it', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await remind(id, []);
    const original = store.query.bind(store);
    let bumped = false;
    vi.spyOn(store, 'query').mockImplementation(async (pk, opts) => {
      const rows = await original(pk, opts);
      if (!bumped && pk === hhPk(householdId) && opts?.skPrefix === 'EVENT#') {
        bumped = true;
        await store.put({ ...calremKey(householdId), updatedAt: 999 });
      }
      return rows;
    });
    await run('2026-12-02T10:01:00Z');
    expect((await store.get(calremKey(householdId)))?.empty).toBeUndefined();
  });

  it('skips an index item whose household is gone', async () => {
    await store.put({ ...calremKey('ghost'), updatedAt: 1 });
    const summary = await run('2026-12-02T10:01:00Z');
    expect(summary.households).toBe(0);
  });

  it('does nothing without a sender', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    expect(await runReminders(store, undefined, new Date('2026-12-02T10:01:00Z'))).toMatchObject({ sent: 0 });
  });

  it('one household failing does not stop the rest', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await store.put({ ...calremKey('broken'), updatedAt: 1 });
    await store.put({ PK: hhPk('broken'), SK: 'META', name: 'x', timezone: 'Not/AZone', createdBy: 'x', createdAt: 'x', memberCount: 1 });
    await store.put({ PK: hhPk('broken'), SK: memberSk(U1), displayName: 'Sam', settings: {}, joinedAt: 'x' });
    const broken = { id: 'e', kind: 'event', title: 'x', startOn: '2026-12-02', allDay: false, startTime: '10:30', durationMin: 60, repeat: { type: 'none' }, skipOn: [], who: 'both', private: false, fieldTimes: {}, createdBy: U1, createdAt: 1, updatedAt: 1, updatedBy: U1, reminders: { [U1]: { savedAt: 1, list: [start(30)] } } };
    await store.put({ PK: hhPk('broken'), SK: 'EVENT#e', ...broken });
    const summary = await run('2026-12-02T10:01:00Z');
    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(1);
  });
});

describe('runReminders: logs', () => {
  it('logs one summary line, and per send the ids and outcome, never the title', async () => {
    const id = await dentist();
    await remind(id, [start(30)]);
    await run('2026-12-02T10:01:00Z');
    expect(logs.join('\n')).not.toContain(SECRET);
    const parsed = logs.map(line => { try { return JSON.parse(line); } catch { return undefined; } }).filter(Boolean);
    expect(parsed.filter(line => line.event === 'calendar_reminders')).toHaveLength(1);
    expect(parsed.filter(line => line.event === 'calendar_reminder')).toEqual([
      expect.objectContaining({ householdId, eventId: id, date: '2026-12-02', outcome: 'sent' }),
    ]);
  });
});
