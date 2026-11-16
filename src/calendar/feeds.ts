import { replayOf, withWriteRecord } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { dayInZone, isRealDate } from '../shared/schedule';
import { ConditionFailedError } from '../store';
import type { Item, Store, TxOp } from '../store';
import { TaskError } from '../tasks/types';
import { parseFeedLink } from './allowedHosts';
import { userCodeFor } from './fetcher';
import type { FailureCode, FetchResult, InternalOutcome } from './fetcher';
import { FEED_PREFIX, feedIndexKey, feedKey, rateKey, secretKey, snapPrefix } from './keys';
import { logFeedFetch, logFeedWrite, logLinkRefused } from './log';
import type { ParsedOccurrence, ParseResult, ParseWindow } from './parseCore';
import { decryptLink, encryptLink } from './secret';
import { chunkOccurrences, readSnapshot, SNAP_TTL_SECONDS, snapshotOps } from './snapshots';
import type { Feed, FeedShare, FeedStatus, FeedView, ImportedData, ImportedView } from './types';

// Feeds on the server: add, replace, rename, remove, refresh, and what each person may read of them. The link is a bearer secret: it
// is read from the request once, checked, fetched, encrypted, and never returned, logged, put in an error or kept as text. Every
// refusal carries a code and nothing else.

export const FEEDS_PER_HOUSEHOLD = 6;
export const FEEDS_PER_PERSON = 3;
export const ADDS_PER_PERSON_PER_HOUR = 10;
export const ADDS_PER_NEW_HOUSEHOLDS_PER_HOUR = 30;
export const NEW_HOUSEHOLD_DAYS = 7;
export const REFRESH_NOW_SPACING_MS = 5 * 60_000;
export const MAX_IMPORTED_DAYS = 62;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WINDOW_BACK_DAYS = 14;
const WINDOW_AHEAD_DAYS = 120;
const SLOW_AFTER = 5;
const MANUAL_ONLY_AFTER = 20;
const SLOW_MS = 6 * HOUR_MS;
const COUNTER_SECONDS = 2 * 3600;
const TX_CHUNK_DELETES = 20;

// Everything a feed operation reaches outside the store. The real set is built in feedRuntime.ts; a test passes its own, so nothing
// here can reach the network on its own.
export interface FeedDeps {
  // The one module that makes requests to a person's link.
  readLink: (link: string) => Promise<FetchResult>;
  parse: (text: string, range: ParseWindow) => Promise<ParseResult>;
  // Undefined means no key is set up: add and refresh say so and nothing crashes.
  loadKey: () => Promise<Buffer | undefined>;
  extraHosts: readonly string[];
  newId: () => string;
}

// What a feed write answers with: the id and whether it was new. The route reads the feed again and projects it for the caller.
export interface FeedWriteOutcome {
  fresh: boolean;
  id: string;
}

const nowSeconds = (nowMs: number): number => Math.floor(nowMs / 1000);
const memberIds = (ctx: Pick<HouseholdContext, 'members'>): Set<string> => new Set(ctx.members.map(member => member.userId));
const nameOf = (ctx: Pick<HouseholdContext, 'members'>, userId: string): string => ctx.members.find(member => member.userId === userId)?.displayName ?? 'Former member';

export function toFeed(raw: Item): Feed {
  const feed: Feed = {
    id: raw.SK.slice(FEED_PREFIX.length),
    label: String(raw.label ?? ''),
    ownerId: String(raw.ownerId ?? ''),
    host: String(raw.host ?? ''),
    share: raw.share === 'details' ? 'details' : 'busy',
    status: String(raw.status ?? 'ok') as FeedStatus,
    lastOutcome: String(raw.lastOutcome ?? ''),
    lastAttemptAt: Number(raw.lastAttemptAt ?? 0),
    nextFetchAt: Number(raw.nextFetchAt ?? 0),
    consecutiveFailures: Number(raw.consecutiveFailures ?? 0),
    eventCount: Number(raw.eventCount ?? 0),
    skippedCount: Number(raw.skippedCount ?? 0),
    approxCount: Number(raw.approxCount ?? 0),
    truncated: raw.truncated === true,
    snapshotId: String(raw.snapshotId ?? ''),
    createdAt: Number(raw.createdAt ?? 0),
  };
  if (typeof raw.fetchedAt === 'number') feed.fetchedAt = raw.fetchedAt;
  if (typeof raw.lastGoodAt === 'number') feed.lastGoodAt = raw.lastGoodAt;
  if (typeof raw.lastReplaceId === 'string') feed.lastReplaceId = raw.lastReplaceId;
  return feed;
}

// What each person may see of a feed. The other person gets no host and no counts, and the label only when the feed shows details,
// because a label can be private.
export function viewOf(ctx: Pick<HouseholdContext, 'members' | 'userId'>, feed: Feed): FeedView {
  const owner = nameOf(ctx, feed.ownerId);
  const base: FeedView = { id: feed.id, label: feed.label, owner, mine: feed.ownerId === ctx.userId, share: feed.share, status: feed.status };
  if (feed.fetchedAt !== undefined) base.fetchedAt = feed.fetchedAt;
  if (!base.mine) return feed.share === 'details' ? base : { ...base, label: `${owner}'s calendar` };
  return { ...base, host: feed.host, eventCount: feed.eventCount, skippedCount: feed.skippedCount, approxCount: feed.approxCount, truncated: feed.truncated };
}

async function feedRows(store: Store, ctx: Pick<HouseholdContext, 'householdId' | 'members'>): Promise<Feed[]> {
  const members = memberIds(ctx);
  return (await store.query(hhPk(ctx.householdId), { skPrefix: FEED_PREFIX })).map(toFeed).filter(feed => members.has(feed.ownerId));
}

async function ownFeed(store: Store, ctx: HouseholdContext, id: string): Promise<Feed> {
  const raw = await store.get(feedKey(ctx.householdId, id), { consistent: true });
  const feed = raw ? toFeed(raw) : undefined;
  if (!feed || !memberIds(ctx).has(feed.ownerId)) throw new TaskError('not_found', 404);
  if (feed.ownerId !== ctx.userId) throw new TaskError('not_owner', 403);
  return feed;
}

export async function listFeeds(store: Store, ctx: HouseholdContext): Promise<FeedView[]> {
  return (await feedRows(store, ctx)).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)).map(feed => viewOf(ctx, feed));
}

export async function viewFeed(store: Store, ctx: HouseholdContext, id: string): Promise<FeedView> {
  const raw = await store.get(feedKey(ctx.householdId, id), { consistent: true });
  const feed = raw ? toFeed(raw) : undefined;
  if (!feed || !memberIds(ctx).has(feed.ownerId)) throw new TaskError('not_found', 404);
  return viewOf(ctx, feed);
}

// ---- Limits ----

// A counter is a read, then a patch that needs the count just read, tried twice. Losing twice is a refusal.
async function bump(store: Store, subject: string, limit: number, nowMs: number): Promise<void> {
  const key = rateKey(subject, Math.floor(nowMs / HOUR_MS));
  const expiresAt = nowSeconds(nowMs) + COUNTER_SECONDS;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const row = await store.get(key, { consistent: true });
    try {
      if (!row) {
        await store.put({ ...key, count: 1, expiresAt }, { ifAbsent: true });
        return;
      }
      const count = Number(row.count);
      if (count >= limit) throw new TaskError('slow_down', 429);
      await store.patch(key, { count: count + 1 }, { ifEquals: { count } });
      return;
    } catch (error) {
      if (!(error instanceof ConditionFailedError)) throw error;
    }
  }
  throw new TaskError('slow_down', 429);
}

// Adding or replacing: 10 an hour for a person, and 30 an hour shared by every household under a week old.
async function chargeAdd(store: Store, ctx: HouseholdContext, nowMs: number): Promise<void> {
  await bump(store, ctx.userId, ADDS_PER_PERSON_PER_HOUR, nowMs);
  if (nowMs - Date.parse(ctx.household.createdAt) < NEW_HOUSEHOLD_DAYS * DAY_MS) await bump(store, 'new', ADDS_PER_NEW_HOUSEHOLDS_PER_HOUR, nowMs);
}

// Counts are read, not atomic, so the limits are soft: two adds at once can pass by one.
async function assertRoom(store: Store, ctx: HouseholdContext): Promise<void> {
  const feeds = await feedRows(store, ctx);
  if (feeds.length >= FEEDS_PER_HOUSEHOLD || feeds.filter(feed => feed.ownerId === ctx.userId).length >= FEEDS_PER_PERSON) throw new TaskError('feed_limit', 409);
}

// ---- Fetching ----

const refused = (code: FailureCode): TaskError => new TaskError('feed_failed', 422, { code });

type Read =
  | { ok: true; occurrences: ParsedOccurrence[]; events: number; skipped: number; approx: number; truncated: boolean }
  | { ok: false; internal: InternalOutcome; code: FailureCode };

// Fetches the link and reads the file. Never throws: a failure is a code, and the text of an underlying error is dropped.
async function readLink(deps: FeedDeps, link: string, zone: string, nowMs: number, ids: { householdId: string; feedId: string }): Promise<Read> {
  const started = Date.now();
  let bytes = 0;
  const done = (read: Read): Read => {
    logFeedFetch({
      ...ids, outcome: read.ok ? 'ok' : read.internal, userCode: read.ok ? 'ok' : read.code, bytes,
      events: read.ok ? read.occurrences.length : 0, skipped: read.ok ? read.skipped : 0, ms: Date.now() - started,
    });
    if (!read.ok && read.internal === 'blocked_host') logLinkRefused(ids.householdId, ids.feedId, read.internal);
    return read;
  };
  try {
    const fetched = await deps.readLink(link);
    if (!fetched.ok) return done({ ok: false, internal: fetched.internal, code: fetched.code });
    bytes = fetched.bytes;
    const range: ParseWindow = { from: nowMs - WINDOW_BACK_DAYS * DAY_MS, to: nowMs + WINDOW_AHEAD_DAYS * DAY_MS, now: nowMs, zone };
    const result = await deps.parse(fetched.text, range);
    if (!result.ok) return done({ ok: false, internal: result.internal, code: userCodeFor(result.internal) });
    return done({
      ok: true, occurrences: result.occurrences, events: result.counts.events, skipped: result.counts.skipped, approx: result.counts.approx, truncated: result.counts.truncated,
    });
  } catch (error) {
    console.error(`Calendar fetch failed (feed ${ids.feedId}): ${error instanceof Error ? error.name : 'Error'}`);
    return done({ ok: false, internal: 'connect', code: 'unreachable' });
  }
}

// What the person gets for a link the allow-list refuses, before any request is made.
function checkLink(deps: FeedDeps, link: string, ids: { householdId: string; feedId: string }): string {
  const checked = parseFeedLink(link, deps.extraHosts);
  if (checked.ok) return checked.host;
  logLinkRefused(ids.householdId, ids.feedId, checked.internal);
  throw refused(checked.code);
}

async function requireKey(deps: FeedDeps): Promise<Buffer> {
  const key = await deps.loadKey();
  if (!key) throw new TaskError('calendar_key_missing', 503);
  return key;
}

const nextFetchAfter = (failures: number, nowMs: number): number => nowMs + (failures >= SLOW_AFTER ? SLOW_MS : HOUR_MS);

function fresh(read: Extract<Read, { ok: true }>, nowMs: number): Record<string, unknown> {
  return {
    status: 'ok', lastOutcome: 'ok', fetchedAt: nowMs, lastGoodAt: nowMs, nextFetchAt: nowMs + HOUR_MS, consecutiveFailures: 0,
    eventCount: read.occurrences.length, skippedCount: read.skipped, approxCount: read.approx, truncated: read.truncated,
  };
}

const chunkOps = (householdId: string, feedId: string, snapshotId: string, read: Extract<Read, { ok: true }>, zone: string, nowMs: number): TxOp[] =>
  snapshotOps(householdId, feedId, snapshotId, chunkOccurrences(read.occurrences, zone), nowSeconds(nowMs) + SNAP_TTL_SECONDS);

// Removes every chunk of a feed except those of `keep`, one at a time. Chunks left by a crash are never read (no feed names them), so
// a failure here is never fatal; the store's expiry clears them in the end.
async function deleteChunks(store: Store, householdId: string, feedId: string, keep?: string): Promise<void> {
  try {
    const rows = await store.query(hhPk(householdId), { skPrefix: snapPrefix(feedId), attributes: ['SK'] });
    for (const row of rows) {
      if (keep !== undefined && row.SK.startsWith(snapPrefix(feedId, keep))) continue;
      await store.delete({ PK: hhPk(householdId), SK: row.SK });
    }
  } catch (error) {
    console.error(`Calendar cleanup failed (feed ${feedId}): ${error instanceof Error ? error.name : 'Error'}`);
  }
}

// ---- Add ----

export interface AddFeedInput {
  id: string;
  link: string;
  label: string;
  share: FeedShare;
}

// The add sequence: limits, counters, fetch and parse, then one transaction that puts the feed (if absent), the secret, the month
// chunks and the index item. A failure before the transaction stores nothing. A feed id that is already stored is a retry: it is
// answered from what is stored, ignores the body and is not charged.
export async function addFeed(store: Store, deps: FeedDeps, ctx: HouseholdContext, input: AddFeedInput, nowMs: number = Date.now()): Promise<FeedWriteOutcome> {
  const { householdId } = ctx;
  const ids = { householdId, feedId: input.id };
  if (await store.get(feedKey(householdId, input.id), { consistent: true })) return { fresh: false, id: input.id };

  const key = await requireKey(deps);
  const host = checkLink(deps, input.link, ids);
  await assertRoom(store, ctx);
  await chargeAdd(store, ctx, nowMs);

  const read = await readLink(deps, input.link, ctx.household.timezone, nowMs, ids);
  if (!read.ok) throw refused(read.code);

  const snapshotId = deps.newId();
  const feed: Item = {
    ...feedKey(householdId, input.id), label: input.label, ownerId: ctx.userId, host, share: input.share, snapshotId, createdAt: nowMs, lastAttemptAt: nowMs, ...fresh(read, nowMs),
  };
  try {
    await store.transact([
      { put: feed, ifAbsent: true },
      { put: { ...secretKey(householdId, input.id), ...encryptLink(key, input.link, { householdId, feedId: input.id }) } },
      ...chunkOps(householdId, input.id, snapshotId, read, ctx.household.timezone, nowMs),
      { put: { ...feedIndexKey(householdId, input.id), nextFetchAt: nowMs + HOUR_MS } },
    ]);
  } catch (error) {
    // A second add of the same id got in first: this one is its retry.
    if (error instanceof ConditionFailedError && error.failedIndex === 0) return { fresh: false, id: input.id };
    throw error;
  }
  logFeedWrite(householdId, input.id, 'add');
  return { fresh: true, id: input.id };
}

// ---- Replace ----

export async function replaceFeedLink(
  store: Store, deps: FeedDeps, ctx: HouseholdContext, id: string, input: { replaceId: string; link: string }, nowMs: number = Date.now(),
): Promise<FeedWriteOutcome> {
  const { householdId } = ctx;
  const feed = await ownFeed(store, ctx, id);
  if (feed.lastReplaceId === input.replaceId) return { fresh: false, id };

  const key = await requireKey(deps);
  const ids = { householdId, feedId: id };
  const host = checkLink(deps, input.link, ids);
  await chargeAdd(store, ctx, nowMs);

  const read = await readLink(deps, input.link, ctx.household.timezone, nowMs, ids);
  if (!read.ok) throw refused(read.code);

  const snapshotId = deps.newId();
  await store.transact(chunkOps(householdId, id, snapshotId, read, ctx.household.timezone, nowMs));
  try {
    await store.transact([
      { update: feedKey(householdId, id), set: { ...fresh(read, nowMs), host, snapshotId, lastReplaceId: input.replaceId, lastAttemptAt: nowMs }, ifEquals: { snapshotId: feed.snapshotId } },
      { put: { ...secretKey(householdId, id), ...encryptLink(key, input.link, { householdId, feedId: id }) } },
      { update: feedIndexKey(householdId, id), set: { nextFetchAt: nowMs + HOUR_MS } },
    ]);
  } catch (error) {
    await deleteChunks(store, householdId, id, feed.snapshotId);
    if (error instanceof ConditionFailedError) throw new TaskError('conflict', 409);
    throw error;
  }
  await deleteChunks(store, householdId, id, snapshotId);
  logFeedWrite(householdId, id, 'replace');
  return { fresh: true, id };
}

// ---- Rename, visibility ----

export async function editFeed(
  store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string; label?: string; share?: FeedShare }, nowMs: number = Date.now(),
): Promise<FeedWriteOutcome> {
  const replayed = await replayOf<{ id: string }>(store, ctx.householdId, input.mutationId);
  if (replayed) return { fresh: false, id };
  await ownFeed(store, ctx, id);
  const set: Record<string, unknown> = {};
  if (input.label !== undefined) set.label = input.label;
  if (input.share !== undefined) set.share = input.share;
  try {
    const written = await withWriteRecord(store, ctx.householdId, input.mutationId, [{ update: feedKey(ctx.householdId, id), set }], { id }, nowSeconds(nowMs));
    if (written.fresh) logFeedWrite(ctx.householdId, id, 'edit');
    return { fresh: written.fresh, id };
  } catch (error) {
    if (error instanceof ConditionFailedError && error.failedIndex === 0) throw new TaskError('not_found', 404);
    throw error;
  }
}

// ---- Remove ----

// The feed, its secret and its index item go together with the first chunks, and any more chunks follow. The feed goes first, so a
// read hides it at once.
export async function removeFeedItems(store: Store, householdId: string, feedId: string, extra: TxOp[] = [], record?: { mutationId: string; nowMs: number }): Promise<void> {
  const chunks = await store.query(hhPk(householdId), { skPrefix: snapPrefix(feedId), attributes: ['SK'] });
  const deletes: TxOp[] = chunks.map(row => ({ delete: { PK: hhPk(householdId), SK: row.SK } }));
  const head: TxOp[] = [
    { delete: feedKey(householdId, feedId), ...(record ? { ifPresent: true } : {}) },
    { delete: secretKey(householdId, feedId) },
    { delete: feedIndexKey(householdId, feedId) },
    ...extra,
    ...deletes.slice(0, TX_CHUNK_DELETES),
  ];
  if (record) await withWriteRecord(store, householdId, record.mutationId, head, { id: feedId }, nowSeconds(record.nowMs));
  else await store.transact(head);
  for (let at = TX_CHUNK_DELETES; at < deletes.length; at += TX_CHUNK_DELETES) await store.transact(deletes.slice(at, at + TX_CHUNK_DELETES));
}

export async function removeFeed(store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now()): Promise<FeedWriteOutcome> {
  const replayed = await replayOf<{ id: string }>(store, ctx.householdId, input.mutationId);
  if (replayed) return { fresh: false, id };
  await ownFeed(store, ctx, id);
  try {
    await removeFeedItems(store, ctx.householdId, id, [], { mutationId: input.mutationId, nowMs });
  } catch (error) {
    if (error instanceof ConditionFailedError && error.failedIndex === 0) throw new TaskError('not_found', 404);
    throw error;
  }
  logFeedWrite(ctx.householdId, id, 'remove');
  return { fresh: true, id };
}

// ---- Refresh ----

export interface Refreshed {
  // What happened to the feed: a new snapshot, a failure that kept the last one, or the feed was gone.
  outcome: 'updated' | 'failed' | 'gone';
}

async function recordFailure(store: Store, householdId: string, feed: Feed, status: FeedStatus, internal: string, nowMs: number): Promise<Refreshed> {
  const failures = feed.consecutiveFailures + 1;
  try {
    await store.transact([
      { update: feedKey(householdId, feed.id), set: { status, lastOutcome: internal, consecutiveFailures: failures, nextFetchAt: nextFetchAfter(failures, nowMs) } },
      { update: feedIndexKey(householdId, feed.id), set: { nextFetchAt: nextFetchAfter(failures, nowMs) } },
    ]);
  } catch (error) {
    if (error instanceof ConditionFailedError) return { outcome: 'gone' };
    throw error;
  }
  return { outcome: 'failed' };
}

// Fetches a feed's stored link again and swaps in a new snapshot. A failure keeps the last snapshot and records what happened. The
// caller has already claimed the feed (set its `lastAttemptAt`).
export async function refreshStoredFeed(
  store: Store, deps: FeedDeps, household: { householdId: string; timezone: string }, feed: Feed, key: Buffer, nowMs: number,
): Promise<Refreshed> {
  const { householdId, timezone } = household;
  const ids = { householdId, feedId: feed.id };
  const secret = await store.get(secretKey(householdId, feed.id), { consistent: true });
  let link: string;
  try {
    if (!secret) throw new Error('no secret');
    link = decryptLink(key, secret as never, { householdId, feedId: feed.id });
  } catch {
    // The key was lost or changed: the person pastes the link again.
    logFeedFetch({ ...ids, outcome: 'secret', userCode: 'link_needed', bytes: 0, events: 0, skipped: 0, ms: 0 });
    return recordFailure(store, householdId, feed, 'link_needed', 'secret', nowMs);
  }

  const read = await readLink(deps, link, timezone, nowMs, ids);
  if (!read.ok) return recordFailure(store, householdId, feed, read.code, read.internal, nowMs);

  const snapshotId = deps.newId();
  await store.transact(chunkOps(householdId, feed.id, snapshotId, read, timezone, nowMs));
  try {
    await store.transact([
      { update: feedKey(householdId, feed.id), set: { ...fresh(read, nowMs), snapshotId }, ifEquals: { snapshotId: feed.snapshotId } },
      { update: feedIndexKey(householdId, feed.id), set: { nextFetchAt: nowMs + HOUR_MS } },
    ]);
  } catch (error) {
    // The feed was removed or replaced while it was being read: this snapshot is nobody's.
    await deleteChunks(store, householdId, feed.id, feed.snapshotId);
    if (error instanceof ConditionFailedError) return { outcome: 'gone' };
    throw error;
  }
  await deleteChunks(store, householdId, feed.id, snapshotId);
  return { outcome: 'updated' };
}

// Claims a feed for one fetch: the time of the attempt is swapped only if nobody else changed it, so two runs never fetch one feed.
export async function claimFeed(store: Store, householdId: string, feed: Feed, nowMs: number): Promise<boolean> {
  try {
    await store.patch(feedKey(householdId, feed.id), { lastAttemptAt: nowMs }, { mustExist: true, ifEquals: { lastAttemptAt: feed.lastAttemptAt } });
    return true;
  } catch (error) {
    if (error instanceof ConditionFailedError) return false;
    throw error;
  }
}

export function isDue(feed: Feed, nowMs: number): boolean {
  return feed.consecutiveFailures < MANUAL_ONLY_AFTER && feed.nextFetchAt <= nowMs;
}

export async function refreshFeedNow(
  store: Store, deps: FeedDeps, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<FeedWriteOutcome> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ id: string }>(store, householdId, input.mutationId);
  if (replayed) return { fresh: false, id };
  const feed = await ownFeed(store, ctx, id);
  const key = await requireKey(deps);
  if (nowMs - feed.lastAttemptAt < REFRESH_NOW_SPACING_MS || !(await claimFeed(store, householdId, feed, nowMs))) throw new TaskError('slow_down', 429);

  const refreshed = await refreshStoredFeed(store, deps, { householdId, timezone: ctx.household.timezone }, feed, key, nowMs);
  if (refreshed.outcome === 'gone') throw new TaskError('not_found', 404);
  const written = await withWriteRecord(store, householdId, input.mutationId, [], { id }, nowSeconds(nowMs));
  if (written.fresh) logFeedWrite(householdId, id, 'refresh');
  return { fresh: written.fresh, id };
}

// ---- Imported occurrences ----

const dayCount = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

// The occurrences of every feed the caller may see, in a window of at most 62 days. A busy-only feed's occurrences reach the other
// person as a start, an end and "Busy" (a free one not at all); the title never leaves the server.
export async function readImported(store: Store, ctx: HouseholdContext, fromDay: string, toDay: string, nowMs: number = Date.now()): Promise<ImportedData> {
  if (!isRealDate(fromDay)) throw new TaskError('invalid', 400, { field: 'from' });
  if (!isRealDate(toDay) || toDay < fromDay || dayCount(fromDay, toDay) > MAX_IMPORTED_DAYS) throw new TaskError('invalid', 400, { field: 'to' });

  const zone = ctx.household.timezone;
  const feeds = await feedRows(store, ctx);
  const occurrences: ImportedView[] = [];
  for (const feed of feeds) {
    const read = await readSnapshot(store, ctx.householdId, feed.id, fromDay, toDay, nowSeconds(nowMs));
    const owner = nameOf(ctx, feed.ownerId);
    const showTitles = feed.ownerId === ctx.userId || feed.share === 'details';
    for (const row of read?.rows ?? []) {
      const inWindow = row.allDay ? row.startOn! <= toDay && row.endOn! >= fromDay : dayInZone(row.startMs!, zone) >= fromDay && dayInZone(row.startMs!, zone) <= toDay;
      if (!inWindow || (!showTitles && row.free)) continue;
      const view: ImportedView = { feedId: feed.id, owner, allDay: row.allDay };
      if (row.allDay) Object.assign(view, { startOn: row.startOn, endOn: row.endOn });
      else Object.assign(view, { startMs: row.startMs, endMs: row.endMs });
      if (showTitles) view.title = row.title;
      else view.busy = true;
      if (row.free) view.free = true;
      if (row.approx) view.approx = true;
      occurrences.push(view);
    }
  }
  const sorted = occurrences.sort((a, b) => (a.startMs ?? Date.parse(`${a.startOn}T00:00:00Z`)) - (b.startMs ?? Date.parse(`${b.startOn}T00:00:00Z`)));
  return { occurrences: sorted, feeds: feeds.map(feed => viewOf(ctx, feed)), serverTime: nowMs };
}

