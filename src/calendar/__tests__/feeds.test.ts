import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { hhPk, membershipKey, memberSk, metaKey } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { twoMemberHousehold, U1, U2 } from '../../push/__tests__/fixture';
import type { MemoryStore } from '../../store/memory';
import { TaskError } from '../../tasks/types';
import { addFeed, editFeed, listFeeds, readImported, refreshFeedNow, removeFeed, replaceFeedLink } from '../feeds';
import type { FeedDeps } from '../feeds';
import type { FetchResult } from '../fetcher';
import { CALFEEDS, CALRATE, feedIndexKey, feedKey, secretKey } from '../keys';
import type { ParsedOccurrence, ParseResult } from '../parseCore';
import { decryptLink } from '../secret';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const HOUR = 3_600_000;
const KEY = Buffer.alloc(32, 7);
const LINK = 'https://calendar.google.com/calendar/ical/SENTINEL-link-token/private-abc/basic.ics';
const LINK2 = 'https://outlook.office365.com/owa/calendar/SENTINEL-link-two/calendar.ics';
const TITLE = 'SENTINEL-title';
const LABEL = 'SENTINEL-label';
const FEED = '11111111-1111-4111-8111-111111111111';
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const meeting: ParsedOccurrence = { allDay: false, startMs: Date.parse('2026-11-17T14:00:00Z'), endMs: Date.parse('2026-11-17T15:00:00Z'), title: TITLE, free: false, approx: false };
const free: ParsedOccurrence = { allDay: false, startMs: Date.parse('2026-11-17T16:00:00Z'), endMs: Date.parse('2026-11-17T17:00:00Z'), title: `${TITLE}-free`, free: true, approx: false };
const birthday: ParsedOccurrence = { allDay: true, startOn: '2026-11-18', endOn: '2026-11-18', title: 'Birthday', free: false };
const parsed = (occurrences: ParsedOccurrence[]): ParseResult => ({ ok: true, occurrences, counts: { events: occurrences.length, skipped: 1, approx: 0, truncated: false } });

let store: MemoryStore;
let ctx1: HouseholdContext;
let ctx2: HouseholdContext;
let householdId: string;
let deps: FeedDeps & { readLink: ReturnType<typeof vi.fn>; parse: ReturnType<typeof vi.fn> };
let logged: string[];

beforeEach(async () => {
  n = 0;
  ({ store, ctx1, ctx2, householdId } = await twoMemberHousehold());
  logged = [];
  for (const channel of ['log', 'error', 'warn', 'info'] as const) vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
  deps = {
    readLink: vi.fn(async (): Promise<FetchResult> => ({ ok: true, text: 'BEGIN:VCALENDAR', bytes: 1234 })),
    parse: vi.fn(async (): Promise<ParseResult> => parsed([meeting, free, birthday])),
    loadKey: async () => KEY,
    extraHosts: [],
    newId: uuid,
  };
});
afterEach(() => vi.restoreAllMocks());

const add = (ctx = ctx1, over: Record<string, unknown> = {}, at = NOW) =>
  addFeed(store, deps, ctx, { id: FEED, link: LINK, label: LABEL, share: 'busy', ...over } as never, at);

async function everything(): Promise<string> {
  const rows: unknown[] = [];
  for (const pk of [hhPk(householdId), CALFEEDS, CALRATE]) rows.push(...await store.query(pk));
  return JSON.stringify(rows);
}
const chunksOf = async (feedId = FEED) => store.query(hhPk(householdId), { skPrefix: `CALSNAP#${feedId}#` });

describe('adding a feed', () => {
  it('checks the link, fetches and parses it, then stores the feed, the secret, the chunks and the index item together', async () => {
    const outcome = await add();
    expect(outcome).toEqual({ fresh: true, id: FEED });
    expect(deps.readLink).toHaveBeenCalledWith(LINK);
    expect(deps.parse).toHaveBeenCalledWith('BEGIN:VCALENDAR', expect.objectContaining({ zone: 'Europe/London', now: NOW, from: NOW - 14 * 86_400_000, to: NOW + 120 * 86_400_000 }));

    const feed = (await store.get(feedKey(householdId, FEED)))!;
    expect(feed).toMatchObject({
      label: LABEL, ownerId: U1, host: 'calendar.google.com', share: 'busy', status: 'ok', lastOutcome: 'ok', fetchedAt: NOW, lastGoodAt: NOW, lastAttemptAt: NOW,
      nextFetchAt: NOW + HOUR, consecutiveFailures: 0, eventCount: 3, skippedCount: 1, approxCount: 0, createdAt: NOW,
    });
    const secret = (await store.get(secretKey(householdId, FEED)))!;
    expect(decryptLink(KEY, secret as never, { householdId, feedId: FEED })).toBe(LINK);
    expect(await store.get(feedIndexKey(householdId, FEED))).toMatchObject({ nextFetchAt: NOW + HOUR });
    expect((await chunksOf()).map(row => row.SK)).toEqual([`CALSNAP#${FEED}#${feed.snapshotId}#2026-11`]);
  });

  it('never keeps the link as text anywhere in the store', async () => {
    await add();
    const stored = await everything();
    expect(stored).not.toContain('SENTINEL-link');
    expect(stored).not.toContain('private-abc');
  });

  it('stores nothing, and says so in a code, when the link cannot be read', async () => {
    deps.readLink.mockResolvedValue({ ok: false, internal: 'connect', code: 'unreachable' });
    await expect(add()).rejects.toMatchObject({ code: 'feed_failed', status: 422, extra: { code: 'unreachable' } });
    expect(await store.get(feedKey(householdId, FEED))).toBeUndefined();
    expect(await store.get(secretKey(householdId, FEED))).toBeUndefined();
    expect(await store.query(CALFEEDS)).toEqual([]);
    expect(await chunksOf()).toEqual([]);
  });

  it('stores nothing when the file does not parse, and says it is not a calendar', async () => {
    deps.parse.mockResolvedValue({ ok: false, internal: 'parse' });
    await expect(add()).rejects.toMatchObject({ extra: { code: 'not_calendar' } });
    expect(await store.get(feedKey(householdId, FEED))).toBeUndefined();
  });

  it('says too_big when the parser says so', async () => {
    deps.parse.mockResolvedValue({ ok: false, internal: 'too_big' });
    await expect(add()).rejects.toMatchObject({ extra: { code: 'too_big' } });
  });

  it('refuses a link at an unlisted host without calling the fetcher, and logs only ids and the outcome', async () => {
    await expect(add(ctx1, { link: 'https://evil.example.com/SENTINEL-link-secret' })).rejects.toMatchObject({ extra: { code: 'not_supported' } });
    expect(deps.readLink).not.toHaveBeenCalled();
    const line = logged.find(text => text.includes('calendar_link_refused'));
    expect(JSON.parse(line!)).toEqual({ event: 'calendar_link_refused', householdId, feedId: FEED, outcome: 'blocked_host' });
  });

  it('says calendars are not set up when there is no key, before it fetches anything', async () => {
    deps.loadKey = async () => undefined;
    await expect(add()).rejects.toMatchObject({ code: 'calendar_key_missing', status: 503 });
    expect(deps.readLink).not.toHaveBeenCalled();
  });

  it('answers a retry of the same feed id from what is stored, with no fetch and no charge', async () => {
    await add();
    deps.readLink.mockClear();
    const before = JSON.stringify(await store.query(CALRATE));
    expect(await add(ctx1, { link: 'https://other.example/ignored' })).toEqual({ fresh: false, id: FEED });
    expect(deps.readLink).not.toHaveBeenCalled();
    expect(JSON.stringify(await store.query(CALRATE))).toBe(before);
  });

  it('logs one line for the fetch with counts and no link, host or title', async () => {
    await add();
    const line = logged.find(text => text.includes('calendar_fetch'))!;
    expect(JSON.parse(line)).toMatchObject({ event: 'calendar_fetch', householdId, feedId: FEED, outcome: 'ok', userCode: 'ok', bytes: 1234, events: 3, skipped: 1 });
    for (const text of logged) for (const secret of ['SENTINEL', 'calendar.google.com']) expect(text).not.toContain(secret);
  });

  it('never lets a link, a host or a title into a log or an error, whatever the fetch did', async () => {
    deps.readLink.mockRejectedValue(new Error(`boom ${LINK}`));
    const error = await add().catch((caught: unknown) => caught);
    expect(String((error as Error).stack) + (error as Error).message).not.toContain('SENTINEL');
    for (const text of logged) expect(text).not.toContain('SENTINEL');
  });
});

describe('limits', () => {
  const second = (ctx: HouseholdContext, index: number) => add(ctx, { id: `00000000-0000-4000-9000-${String(index).padStart(12, '0')}` });

  it('lets a person have 3 feeds, and refuses the 4th with feed_limit', async () => {
    for (const index of [1, 2, 3]) await second(ctx1, index);
    await expect(second(ctx1, 4)).rejects.toMatchObject({ code: 'feed_limit', status: 409 });
    expect(deps.readLink).toHaveBeenCalledTimes(3);
  });

  it('lets a household have 6, and refuses the 7th', async () => {
    for (const index of [1, 2, 3]) await second(ctx1, index);
    for (const index of [4, 5, 6]) await second(ctx2, index);
    await expect(second(ctx2, 7)).rejects.toMatchObject({ code: 'feed_limit' });
  });

  it('does not count a feed whose owner is no longer a member', async () => {
    for (const index of [1, 2, 3]) await second(ctx2, index);
    for (const index of [4, 5, 6]) await second(ctx1, index);
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    await store.delete(membershipKey(U2));
    await expect(second(ctx1, 7)).rejects.toMatchObject({ code: 'feed_limit' }); // still 3 of their own
    const fresh = (await loadContext(store, U1))!;
    await store.delete(feedKey(householdId, '00000000-0000-4000-9000-000000000004'));
    await expect(second(fresh, 8)).resolves.toMatchObject({ fresh: true });
  });

  it('allows 10 adds an hour for a person and says slow_down for the 11th, then lets them again in the next hour', async () => {
    await store.patch(metaKey(householdId), { createdAt: '2026-01-01T00:00:00.000Z' });
    const old = (await loadContext(store, U1))!;
    // A failed add is still a charge, and stores nothing, so ten of them never reach the feed limit.
    deps.readLink.mockResolvedValue({ ok: false, internal: 'connect', code: 'unreachable' });
    for (let index = 0; index < 10; index += 1) await expect(second(old, index)).rejects.toMatchObject({ code: 'feed_failed' });
    await expect(second(old, 11)).rejects.toMatchObject({ code: 'slow_down', status: 429 });
    await expect(addFeed(store, deps, old, { id: uuid(), link: LINK, label: 'x', share: 'busy' }, NOW + HOUR)).rejects.toMatchObject({ code: 'feed_failed' });
  });

  it('shares 30 adds an hour between households under a week old, and exempts older ones', async () => {
    deps.readLink.mockResolvedValue({ ok: false, internal: 'connect', code: 'unreachable' });
    // Another person's counter for the same hour already holds 29 of the shared 30.
    await store.put({ PK: CALRATE, SK: `new#${Math.floor(NOW / HOUR)}`, count: 29, expiresAt: 9_999_999_999 });
    await expect(second(ctx1, 1)).rejects.toMatchObject({ code: 'feed_failed' });
    await expect(second(ctx1, 2)).rejects.toMatchObject({ code: 'slow_down' });

    await store.patch(metaKey(householdId), { createdAt: '2026-01-01T00:00:00.000Z' });
    const old = (await loadContext(store, U1))!;
    await expect(second(old, 3)).rejects.toMatchObject({ code: 'feed_failed' });
  });

  it('gives its counters an expiry two hours on', async () => {
    await add();
    const rows = await store.query(CALRATE);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.expiresAt).toBe(Math.floor(NOW / 1000) + 7200);
  });

  it('refuses when two adds race for the same counter and it loses twice', async () => {
    await store.put({ PK: CALRATE, SK: `${U1}#${Math.floor(NOW / HOUR)}`, count: 3, expiresAt: 9_999_999_999 });
    const real = store.patch.bind(store);
    store.patch = async (key, fields, opts) => {
      if (key.PK === CALRATE) await real(key, { count: Number((await store.get(key))!.count) + 1 });
      return real(key, fields, opts);
    };
    await expect(add()).rejects.toMatchObject({ code: 'slow_down' });
  });
});

describe('who can see a feed', () => {
  beforeEach(async () => { await add(); });

  it('shows its owner the label, host and counts, and the other person only what is theirs to see', async () => {
    const mine = (await listFeeds(store, ctx1)).find(view => view.id === FEED)!;
    expect(mine).toMatchObject({ label: LABEL, mine: true, host: 'calendar.google.com', share: 'busy', status: 'ok', fetchedAt: NOW, eventCount: 3 });
    const theirs = (await listFeeds(store, ctx2)).find(view => view.id === FEED)!;
    expect(theirs).toEqual({ id: FEED, label: "Sam's calendar", owner: 'Sam', mine: false, share: 'busy', status: 'ok', fetchedAt: NOW });
    expect(JSON.stringify(theirs)).not.toMatch(/SENTINEL|google/);
  });

  it('shows the other person the label of a feed that shows details', async () => {
    await editFeed(store, ctx1, FEED, { mutationId: uuid(), share: 'details' }, NOW);
    expect((await listFeeds(store, ctx2))[0]).toMatchObject({ label: LABEL, share: 'details' });
  });

  it('hides a feed whose owner is no longer a member', async () => {
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U1) });
    expect(await listFeeds(store, (await loadContext(store, U2))!)).toEqual([]);
  });
});

describe('imported occurrences', () => {
  const window = (ctx: HouseholdContext) => readImported(store, ctx, '2026-11-10', '2026-11-30', NOW);
  beforeEach(async () => { await add(); });

  it('gives the owner every occurrence with its title, free ones marked', async () => {
    const { occurrences } = await window(ctx1);
    expect(occurrences.map(item => item.title).sort()).toEqual(['Birthday', TITLE, `${TITLE}-free`]);
    expect(occurrences.find(item => item.title === `${TITLE}-free`)).toMatchObject({ free: true });
    expect(occurrences.find(item => item.title === TITLE)).toMatchObject({ feedId: FEED, owner: 'Sam', allDay: false, startMs: meeting.allDay ? 0 : meeting.startMs });
  });

  it('gives the other person only busy times from a busy feed, never a title, and nothing for a free occurrence', async () => {
    const { occurrences, feeds } = await window(ctx2);
    expect(occurrences).toHaveLength(2);
    for (const item of occurrences) {
      expect(item.busy).toBe(true);
      expect(item.title).toBeUndefined();
    }
    const text = JSON.stringify({ occurrences, feeds });
    expect(text).not.toContain('SENTINEL');
    expect(text).not.toContain('Birthday');
  });

  it('gives the other person titles from a feed that shows details', async () => {
    await editFeed(store, ctx1, FEED, { mutationId: uuid(), share: 'details' }, NOW);
    const { occurrences } = await window(ctx2);
    expect(occurrences.map(item => item.title).sort()).toEqual(['Birthday', TITLE, `${TITLE}-free`]);
  });

  it('only gives what falls in the window', async () => {
    const { occurrences } = await readImported(store, ctx1, '2026-11-18', '2026-11-30', NOW);
    expect(occurrences.map(item => item.title)).toEqual(['Birthday']);
  });

  it('gives nothing from a feed whose owner has left', async () => {
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U1) });
    expect((await window((await loadContext(store, U2))!)).occurrences).toEqual([]);
  });

  it('refuses a window over 62 days', async () => {
    await expect(readImported(store, ctx1, '2026-11-01', '2027-02-01', NOW)).rejects.toMatchObject({ code: 'invalid', status: 400 });
  });

  it('carries the feeds, so each item can say how old its calendar is', async () => {
    expect((await window(ctx1)).feeds[0]).toMatchObject({ id: FEED, fetchedAt: NOW });
  });
});

describe('changing a feed', () => {
  beforeEach(async () => { await add(); });

  it('renames it and changes who sees what, for its owner only', async () => {
    await editFeed(store, ctx1, FEED, { mutationId: uuid(), label: 'Work', share: 'details' }, NOW);
    expect(await store.get(feedKey(householdId, FEED))).toMatchObject({ label: 'Work', share: 'details' });
    await expect(editFeed(store, ctx2, FEED, { mutationId: uuid(), label: 'Mine now' }, NOW)).rejects.toMatchObject({ code: 'not_owner', status: 403 });
    expect(await store.get(feedKey(householdId, FEED))).toMatchObject({ label: 'Work' });
  });

  it('answers a retry of the same mutation without writing again', async () => {
    const mutationId = uuid();
    expect((await editFeed(store, ctx1, FEED, { mutationId, label: 'A' }, NOW)).fresh).toBe(true);
    await store.patch(feedKey(householdId, FEED), { label: 'B' });
    expect((await editFeed(store, ctx1, FEED, { mutationId, label: 'A' }, NOW)).fresh).toBe(false);
    expect(await store.get(feedKey(householdId, FEED))).toMatchObject({ label: 'B' });
  });

  it('says not found for a feed that is not there', async () => {
    await expect(editFeed(store, ctx1, uuid(), { mutationId: uuid(), label: 'x' }, NOW)).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});

describe('removing a feed', () => {
  it('deletes the feed, its secret, its snapshot chunks and its index item', async () => {
    await add();
    expect(await store.get(feedKey(householdId, FEED))).toBeDefined();
    expect(await store.get(secretKey(householdId, FEED))).toBeDefined();
    expect((await chunksOf()).length).toBeGreaterThan(0);
    expect(await store.get(feedIndexKey(householdId, FEED))).toBeDefined();

    await removeFeed(store, ctx1, FEED, { mutationId: uuid() }, NOW);

    expect(await store.get(feedKey(householdId, FEED))).toBeUndefined();
    expect(await store.get(secretKey(householdId, FEED))).toBeUndefined();
    expect(await chunksOf()).toEqual([]);
    expect(await store.get(feedIndexKey(householdId, FEED))).toBeUndefined();
  });

  it('also deletes chunks of an older snapshot that a crash left behind', async () => {
    await add();
    await store.put({ PK: hhPk(householdId), SK: `CALSNAP#${FEED}#leftover#2026-10`, items: [], expiresAt: 9_999_999_999 });
    await removeFeed(store, ctx1, FEED, { mutationId: uuid() }, NOW);
    expect(await chunksOf()).toEqual([]);
  });

  it('is for the owner only, and changes nothing when someone else asks', async () => {
    await add();
    await expect(removeFeed(store, ctx2, FEED, { mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'not_owner' });
    expect(await store.get(feedKey(householdId, FEED))).toBeDefined();
  });

  it('answers a retry of a removal that already happened', async () => {
    await add();
    const mutationId = uuid();
    await removeFeed(store, ctx1, FEED, { mutationId }, NOW);
    expect((await removeFeed(store, ctx1, FEED, { mutationId }, NOW)).fresh).toBe(false);
    await expect(removeFeed(store, ctx1, FEED, { mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keeps nothing of the link in the write record', async () => {
    await add();
    await removeFeed(store, ctx1, FEED, { mutationId: uuid() }, NOW);
    expect(await everything()).not.toContain('SENTINEL');
  });
});

describe('replacing the link', () => {
  beforeEach(async () => { await add(); });
  const replace = (over: Record<string, unknown> = {}, ctx = ctx1, at = NOW + 1000) => replaceFeedLink(store, deps, ctx, FEED, { replaceId: uuid(), link: LINK2, ...over } as never, at);

  it('fetches the new link, stores it encrypted in place of the old, and swaps the snapshot', async () => {
    const before = (await store.get(feedKey(householdId, FEED)))!;
    deps.parse.mockResolvedValue(parsed([birthday]));
    await replace();
    const feed = (await store.get(feedKey(householdId, FEED)))!;
    expect(feed.snapshotId).not.toBe(before.snapshotId);
    expect(feed).toMatchObject({ host: 'outlook.office365.com', status: 'ok', eventCount: 1, consecutiveFailures: 0 });
    expect(decryptLink(KEY, (await store.get(secretKey(householdId, FEED)))! as never, { householdId, feedId: FEED })).toBe(LINK2);
    const chunks = await chunksOf();
    expect(chunks.every(row => String(row.SK).includes(String(feed.snapshotId)))).toBe(true);
    expect(await everything()).not.toContain('SENTINEL-link');
  });

  it('keeps the old link and snapshot when the new one does not work', async () => {
    deps.readLink.mockResolvedValue({ ok: false, internal: 'status', code: 'link_stopped' });
    await expect(replace()).rejects.toMatchObject({ extra: { code: 'link_stopped' } });
    expect(decryptLink(KEY, (await store.get(secretKey(householdId, FEED)))! as never, { householdId, feedId: FEED })).toBe(LINK);
  });

  it('treats the same replaceId as a retry: no fetch, no charge', async () => {
    const replaceId = uuid();
    await replace({ replaceId });
    deps.readLink.mockClear();
    expect(await replace({ replaceId })).toEqual({ fresh: false, id: FEED });
    expect(deps.readLink).not.toHaveBeenCalled();
  });

  it('is for the owner only', async () => {
    await expect(replace({}, ctx2)).rejects.toMatchObject({ code: 'not_owner' });
  });

  it('refuses a link at an unlisted host without fetching', async () => {
    deps.readLink.mockClear();
    await expect(replace({ link: 'https://evil.example/x' })).rejects.toMatchObject({ extra: { code: 'not_supported' } });
    expect(deps.readLink).not.toHaveBeenCalled();
  });
});

describe('refreshing now', () => {
  beforeEach(async () => { await add(); });
  const refresh = (at: number, ctx = ctx1, mutationId = uuid()) => refreshFeedNow(store, deps, ctx, FEED, { mutationId }, at);

  it('fetches the stored link again and slides the snapshot', async () => {
    deps.parse.mockResolvedValue(parsed([birthday]));
    const before = (await store.get(feedKey(householdId, FEED)))!;
    await refresh(NOW + 6 * 60_000);
    expect(deps.readLink).toHaveBeenLastCalledWith(LINK);
    const feed = (await store.get(feedKey(householdId, FEED)))!;
    expect(feed).toMatchObject({ fetchedAt: NOW + 6 * 60_000, eventCount: 1 });
    expect(feed.snapshotId).not.toBe(before.snapshotId);
    expect((await chunksOf()).every(row => String(row.SK).includes(String(feed.snapshotId)))).toBe(true);
  });

  it('is once per feed per 5 minutes', async () => {
    await expect(refresh(NOW + 4 * 60_000)).rejects.toMatchObject({ code: 'slow_down', status: 429 });
    await expect(refresh(NOW + 5 * 60_000)).resolves.toMatchObject({ id: FEED });
  });

  it('is for the owner only', async () => {
    await expect(refresh(NOW + HOUR, ctx2)).rejects.toMatchObject({ code: 'not_owner' });
  });

  it('answers a retry of the same mutation from its record, with no new fetch', async () => {
    const mutationId = uuid();
    await refresh(NOW + HOUR, ctx1, mutationId);
    deps.readLink.mockClear();
    expect((await refresh(NOW + 2 * HOUR, ctx1, mutationId)).fresh).toBe(false);
    expect(deps.readLink).not.toHaveBeenCalled();
  });

  it('says calendars are not set up when the key is missing', async () => {
    deps.loadKey = async () => undefined;
    await expect(refresh(NOW + HOUR)).rejects.toMatchObject({ code: 'calendar_key_missing' });
  });

  it('keeps the last snapshot and says what happened when the link stopped working', async () => {
    deps.readLink.mockResolvedValue({ ok: false, internal: 'status', code: 'link_stopped' });
    const before = (await store.get(feedKey(householdId, FEED)))!;
    await refresh(NOW + HOUR);
    const feed = (await store.get(feedKey(householdId, FEED)))!;
    expect(feed).toMatchObject({ status: 'link_stopped', lastOutcome: 'status', consecutiveFailures: 1, fetchedAt: NOW, snapshotId: before.snapshotId });
    expect((await readImported(store, ctx1, '2026-11-10', '2026-11-30', NOW + HOUR)).occurrences).toHaveLength(3);
  });

  it('says the link needs to be added again when the stored link cannot be read (the key was lost)', async () => {
    deps.loadKey = async () => Buffer.alloc(32, 9);
    await refresh(NOW + HOUR);
    expect(await store.get(feedKey(householdId, FEED))).toMatchObject({ status: 'link_needed', lastOutcome: 'secret' });
    expect(deps.readLink).toHaveBeenCalledTimes(1);
  });

  it('backs off: hourly, then every 6 hours after 5 failures in a row', async () => {
    deps.readLink.mockResolvedValue({ ok: false, internal: 'connect', code: 'unreachable' });
    let at = NOW;
    const gaps: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      at += HOUR;
      await refresh(at);
      const feed = (await store.get(feedKey(householdId, FEED)))!;
      gaps.push(Number(feed.nextFetchAt) - at);
      expect(Number((await store.get(feedIndexKey(householdId, FEED)))!.nextFetchAt)).toBe(feed.nextFetchAt);
    }
    expect(gaps).toEqual([HOUR, HOUR, HOUR, HOUR, 6 * HOUR, 6 * HOUR]);
  });
});

describe('a feed that is removed while it is being fetched', () => {
  it('does not bring back an index item or leave chunks', async () => {
    await add();
    deps.parse.mockImplementation(async () => {
      await removeFeed(store, ctx1, FEED, { mutationId: uuid() }, NOW);
      return parsed([meeting]);
    });
    await refreshFeedNow(store, deps, ctx1, FEED, { mutationId: uuid() }, NOW + HOUR).catch((error: unknown) => { if (!(error instanceof TaskError)) throw error; });
    expect(await store.query(CALFEEDS)).toEqual([]);
    expect(await chunksOf()).toEqual([]);
    expect(await store.get(feedKey(householdId, FEED))).toBeUndefined();
  });
});
