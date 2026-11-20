import { loadHousehold } from '../household/guard';
import type { Store } from '../store';
import { purgeNonMemberData } from './cleanup';
import { claimFeed, isDue, refreshStoredFeed, toFeed } from './feeds';
import type { FeedDeps } from './feeds';
import { getFeedDeps } from './feedRuntime';
import { CALFEEDS, CALREM, feedIndexKey, feedKey, parseFeedIndexSk } from './keys';
import type { Feed } from './types';

// The hourly job, called from the push Lambda's hourly run and from the container's hourly tick. It finds feeds through the CALFEEDS
// index (by key, never a scan), claims each due one before fetching it, works through them oldest first four at a time, and starts
// no new feed once less than 30 seconds of its time remain (the worst case for one feed is 15 s of fetch plus 5 s of parse). A failure
// for one feed never stops the rest. It also finishes any removal of a leaving member's data that the removal route did not.

export const REFRESH_CONCURRENCY = 4;
export const STOP_MARGIN_MS = 30_000;

export interface RefreshSummary {
  feeds: number;
  due: number;
  refreshed: number;
  failed: number;
  // Feeds that were removed or replaced while they were being fetched.
  gone: number;
  // Index items with no household or no feed behind them, deleted.
  orphans: number;
  // Households whose non-member data was looked at.
  swept: number;
  skippedForTime: number;
  keyMissing: boolean;
  ms: number;
}

interface Due {
  household: { householdId: string; timezone: string };
  feed: Feed;
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'Error');

// `deadlineMs` is the clock time (epoch ms) by which the work must be over: the Lambda's time left added to now. The container has no
// deadline and passes Infinity. `clock` reads the real time, which moves while feeds are fetched.
export async function runCalendarRefresh(
  store: Store, now: Date, deadlineMs: number, deps: FeedDeps = getFeedDeps(), clock: () => number = Date.now,
): Promise<void> {
  const started = clock();
  const summary: RefreshSummary = { feeds: 0, due: 0, refreshed: 0, failed: 0, gone: 0, orphans: 0, swept: 0, skippedForTime: 0, keyMissing: false, ms: 0 };
  const households = new Set<string>();
  try {
    const due = await collectDue(store, now.getTime(), summary, households);
    summary.due = due.length;
    await refreshDue(store, deps, due, now.getTime(), deadlineMs, clock, summary);
    await sweep(store, households, deadlineMs, clock, summary);
  } catch (error) {
    console.error(`Calendar refresh failed: ${errorName(error)}`);
  }
  summary.ms = clock() - started;
  console.log(JSON.stringify({ event: 'calendar_refresh', ...summary }));
}

async function collectDue(store: Store, nowMs: number, summary: RefreshSummary, households: Set<string>): Promise<Due[]> {
  const loaded = new Map<string, Awaited<ReturnType<typeof loadHousehold>>>();
  const due: Due[] = [];
  for (const row of await store.query(CALFEEDS)) {
    const ids = parseFeedIndexSk(row.SK);
    if (!ids) continue;
    summary.feeds += 1;
    try {
      if (!loaded.has(ids.householdId)) loaded.set(ids.householdId, await loadHousehold(store, ids.householdId));
      const household = loaded.get(ids.householdId);
      const raw = household ? await store.get(feedKey(ids.householdId, ids.feedId), { consistent: true }) : undefined;
      if (!household || !raw) {
        await store.delete(feedIndexKey(ids.householdId, ids.feedId));
        summary.orphans += 1;
        continue;
      }
      households.add(ids.householdId);
      const feed = toFeed(raw);
      // A feed whose owner has left is hidden everywhere already; the sweep below deletes it.
      if (!household.members.some(member => member.userId === feed.ownerId)) continue;
      if (isDue(feed, nowMs)) due.push({ household: { householdId: ids.householdId, timezone: household.household.timezone }, feed });
    } catch (error) {
      console.error(`Calendar refresh could not read a feed: ${errorName(error)}`);
    }
  }
  return due.sort((a, b) => a.feed.nextFetchAt - b.feed.nextFetchAt || (a.feed.id < b.feed.id ? -1 : 1));
}

async function refreshDue(
  store: Store, deps: FeedDeps, due: Due[], nowMs: number, deadlineMs: number, clock: () => number, summary: RefreshSummary,
): Promise<void> {
  if (due.length === 0) return;
  const key = await deps.loadKey().catch(() => undefined);
  if (!key) {
    summary.keyMissing = true;
    return;
  }
  const queue = [...due];
  const work = async (): Promise<void> => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      if (deadlineMs - clock() < STOP_MARGIN_MS) {
        summary.skippedForTime += 1 + queue.length;
        queue.length = 0;
        return;
      }
      try {
        if (!(await claimFeed(store, next.household.householdId, next.feed, nowMs))) continue;
        const result = await refreshStoredFeed(store, deps, next.household, next.feed, key, nowMs);
        if (result.outcome === 'updated') summary.refreshed += 1;
        else if (result.outcome === 'failed') summary.failed += 1;
        else summary.gone += 1;
      } catch (error) {
        summary.failed += 1;
        console.error(`Calendar refresh failed for a feed: ${errorName(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, queue.length) }, work));
}

// Finishes what a member's removal left: for each household that has feeds or reminders, what belongs to non-members is deleted.
async function sweep(store: Store, households: Set<string>, deadlineMs: number, clock: () => number, summary: RefreshSummary): Promise<void> {
  for (const row of await store.query(CALREM, { attributes: ['SK'] })) households.add(row.SK);
  for (const householdId of households) {
    if (deadlineMs - clock() < STOP_MARGIN_MS) return;
    await purgeNonMemberData(store, householdId);
    summary.swept += 1;
  }
}
