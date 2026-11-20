import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { twoMemberHousehold, U2 } from '../../push/__tests__/fixture';
import type { MemoryStore } from '../../store/memory';
import { addFeed } from '../feeds';
import type { FeedDeps } from '../feeds';
import { CALFEEDS, calremKey, feedIndexKey, feedKey } from '../keys';
import { eventKey } from '../keys';
import { runCalendarRefresh } from '../refresh';
import { fetchedFixtureDeps } from './feedFixtures';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const HOUR = 3_600_000;
const LINK = 'https://calendar.google.com/calendar/ical/SENTINEL-link/x/basic.ics';
const feedId = (n: number): string => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

let store: MemoryStore;
let ctx1: HouseholdContext;
let ctx2: HouseholdContext;
let householdId: string;
let deps: FeedDeps;
let logged: string[];

beforeEach(async () => {
  ({ store, ctx1, ctx2, householdId } = await twoMemberHousehold());
  logged = [];
  for (const channel of ['log', 'error', 'warn', 'info'] as const) vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
  deps = fetchedFixtureDeps();
});
afterEach(() => vi.restoreAllMocks());

const add = (n: number, ctx = ctx1, at = NOW) => addFeed(store, deps, ctx, { id: feedId(n), link: LINK, label: `SENTINEL-label-${n}`, share: 'busy' }, at);
const run = (at: number, deadline = Number.POSITIVE_INFINITY, clock: () => number = () => at) => runCalendarRefresh(store, new Date(at), deadline, deps, clock);
const reads = (): number => (deps.readLink as ReturnType<typeof vi.fn>).mock.calls.length;
const feed = async (n: number) => (await store.get(feedKey(householdId, feedId(n))))!;
const summary = () => JSON.parse(logged.filter(line => line.includes('calendar_refresh')).at(-1)!);

describe('runCalendarRefresh', () => {
  it('fetches the feeds whose time has come, and not the others', async () => {
    await add(1);
    await add(2, ctx1, NOW + HOUR);
    (deps.readLink as ReturnType<typeof vi.fn>).mockClear();
    await run(NOW + HOUR);
    expect(reads()).toBe(1);
    expect((await feed(1)).fetchedAt).toBe(NOW + HOUR);
    expect((await feed(2)).fetchedAt).toBe(NOW + HOUR); // added at that moment, not due until an hour after
    expect(summary()).toMatchObject({ event: 'calendar_refresh', feeds: 2, due: 1, refreshed: 1, failed: 0 });
  });

  it('slides the snapshot of a feed it fetches, and the next time is an hour on', async () => {
    await add(1);
    const before = await feed(1);
    await run(NOW + HOUR);
    const after = await feed(1);
    expect(after.snapshotId).not.toBe(before.snapshotId);
    expect(after.nextFetchAt).toBe(NOW + 2 * HOUR);
    expect((await store.get(feedIndexKey(householdId, feedId(1))))!.nextFetchAt).toBe(NOW + 2 * HOUR);
  });

  it('claims each feed first, so two runs at once fetch it once', async () => {
    await add(1);
    (deps.readLink as ReturnType<typeof vi.fn>).mockClear();
    await Promise.all([run(NOW + HOUR), run(NOW + HOUR)]);
    expect(reads()).toBe(1);
  });

  it('keeps the last snapshot of a feed that fails, records why, and carries on with the others', async () => {
    await add(1);
    await add(2);
    const read = deps.readLink as ReturnType<typeof vi.fn>;
    read.mockImplementation(async () => (read.mock.calls.length % 2 === 1 ? { ok: false, internal: 'status', code: 'link_stopped' } : { ok: true, text: 'x', bytes: 1 }));
    read.mockClear();
    await run(NOW + HOUR);
    const stopped = [await feed(1), await feed(2)].filter(item => item.status === 'link_stopped');
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatchObject({ consecutiveFailures: 1, fetchedAt: NOW });
    expect(summary()).toMatchObject({ refreshed: 1, failed: 1 });
  });

  it('does not stop for a feed whose fetch blows up, and logs only the error name', async () => {
    await add(1);
    await add(2);
    const read = deps.readLink as ReturnType<typeof vi.fn>;
    read.mockClear();
    read.mockRejectedValueOnce(new Error(`kaboom ${LINK}`));
    await run(NOW + HOUR);
    expect(reads()).toBe(2);
    for (const line of logged) expect(line).not.toContain('SENTINEL');
  });

  it('starts at most 4 at a time', async () => {
    for (let n = 1; n <= 3; n += 1) await add(n, ctx1);
    for (let n = 4; n <= 6; n += 1) await add(n, ctx2);
    let running = 0;
    let peak = 0;
    (deps.readLink as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 5));
      running -= 1;
      return { ok: true, text: 'x', bytes: 1 };
    });
    await run(NOW + HOUR);
    expect(peak).toBe(4);
    expect(summary().refreshed).toBe(6);
  });

  it('works through the oldest due feed first', async () => {
    await add(1, ctx1, NOW);
    await add(2, ctx1, NOW - 3 * HOUR);
    await add(3, ctx1, NOW - HOUR);
    const order: string[] = [];
    const real = store.patch.bind(store);
    store.patch = async (key, fields, opts) => { if (key.SK.startsWith('CALFEED#') && 'lastAttemptAt' in fields) order.push(key.SK.slice(-2)); return real(key, fields, opts); };
    await run(NOW + 5 * HOUR);
    expect(order).toEqual(['02', '03', '01'].map(String));
  });

  it('starts no new feed once less than 30 seconds of its time remain', async () => {
    for (let n = 1; n <= 3; n += 1) await add(n, ctx1);
    for (let n = 4; n <= 6; n += 1) await add(n, ctx2);
    let clock = NOW + HOUR;
    (deps.readLink as ReturnType<typeof vi.fn>).mockImplementation(async () => { clock += 20_000; return { ok: true, text: 'x', bytes: 1 }; });
    await runCalendarRefresh(store, new Date(NOW + HOUR), NOW + HOUR + 60_000, deps, () => clock);
    // Four start at once with 60 s left; by the time one is free the clock is past the margin, so the last two are left for the next run.
    expect(summary()).toMatchObject({ due: 6, refreshed: 4, skippedForTime: 2 });
  });

  it('fetches a feed with 5 failures in a row every 6 hours, and one with 20 only when asked', async () => {
    await add(1);
    await add(2);
    await store.patch(feedKey(householdId, feedId(1)), { consecutiveFailures: 5, nextFetchAt: NOW + 6 * HOUR });
    await store.patch(feedKey(householdId, feedId(2)), { consecutiveFailures: 20, nextFetchAt: NOW });
    (deps.readLink as ReturnType<typeof vi.fn>).mockClear();
    await run(NOW + 5 * HOUR);
    expect(reads()).toBe(0);
    await store.patch(feedIndexKey(householdId, feedId(1)), { nextFetchAt: NOW + 6 * HOUR });
    await run(NOW + 6 * HOUR);
    expect(reads()).toBe(1);
  });

  it('does not fetch when there is no key, and says so once', async () => {
    await add(1);
    deps.loadKey = async () => undefined;
    (deps.readLink as ReturnType<typeof vi.fn>).mockClear();
    await run(NOW + HOUR);
    expect(reads()).toBe(0);
    expect(summary()).toMatchObject({ due: 1, refreshed: 0, keyMissing: true });
  });

  it('deletes an index item whose household or feed is gone', async () => {
    await store.put({ ...feedIndexKey('no-such-household', feedId(9)), nextFetchAt: 0 });
    await store.put({ ...feedIndexKey(householdId, feedId(8)), nextFetchAt: 0 });
    await run(NOW);
    expect(await store.query(CALFEEDS)).toEqual([]);
    expect(summary().orphans).toBe(2);
  });

  it('deletes a feed whose owner is no longer a member, and does not fetch it', async () => {
    await add(1, ctx2);
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    await store.delete(membershipKey(U2));
    (deps.readLink as ReturnType<typeof vi.fn>).mockClear();
    await run(NOW + HOUR);
    expect(reads()).toBe(0);
    expect(await store.get(feedKey(householdId, feedId(1)))).toBeUndefined();
    expect(await store.query(CALFEEDS)).toEqual([]);
  });

  it('finishes a cleanup that the removal did not: private events and reminders of a non-member, found through CALREM', async () => {
    await store.put({ ...eventKey(householdId, 'e1'), kind: 'event', title: 'SENTINEL', who: U2, private: true, createdBy: U2, startOn: '2026-12-01', allDay: true, repeat: { type: 'none' }, skipOn: [], fieldTimes: {}, createdAt: 1, updatedAt: 1, updatedBy: U2 });
    await store.put({ ...calremKey(householdId), updatedAt: 1 });
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    await store.delete(membershipKey(U2));
    await run(NOW);
    expect(await store.get(eventKey(householdId, 'e1'))).toBeUndefined();
  });

  it('logs one summary line with counts, and no link, host, label or title', async () => {
    await add(1);
    logged.length = 0;
    await run(NOW + HOUR);
    for (const line of logged) for (const word of ['SENTINEL', 'calendar.google.com', 'Meeting']) expect(line).not.toContain(word);
    expect(Object.keys(summary()).sort()).toEqual(['due', 'event', 'failed', 'feeds', 'gone', 'keyMissing', 'ms', 'orphans', 'refreshed', 'skippedForTime', 'swept'].sort());
  });

  it('never throws, even when the store fails', async () => {
    vi.spyOn(store, 'query').mockRejectedValue(new Error('SENTINEL down'));
    await expect(run(NOW)).resolves.toBeUndefined();
    for (const line of logged) expect(line).not.toContain('SENTINEL');
  });
});
