import { hhPk, MEMBER_PREFIX } from '../household/keys';
import type { Item, Store } from '../store';
import { ConditionFailedError } from '../store';
import { removeFeedItems, toFeed } from './feeds';
import { EVENT_PREFIX, FEED_PREFIX } from './keys';
import type { CalendarEvent } from './types';

// The most items one run looks at, so a household with a long history cannot make it unbounded. The hourly sweep finishes the rest.
const MAX_ITEMS = 1000;

export interface PurgeResult {
  deleted: number;
  trimmed: number;
  // Feeds removed whole: the feed, its secret, its snapshot chunks and its index item.
  feeds: number;
  failed: number;
}

// Removes what belongs to people who are no longer members (by the current member records): their feeds, their private events (deleted ones too), and their entries in the
// reminders of every event. Shared events they made stay. Each item is its own write, so one failure never stops the rest; reads
// hide this data until it is gone. It never throws and logs no text, only the error name.
export async function purgeNonMemberData(store: Store, householdId: string, removedUserId?: string): Promise<PurgeResult> {
  const result: PurgeResult = { deleted: 0, trimmed: 0, feeds: 0, failed: 0 };
  try {
    // Who is a member is read here, after any removal has committed, never taken from an earlier read. The removed user is always a
    // non-member, because a query that is not strongly consistent may still list them just after the removal.
    const members = await store.query(hhPk(householdId), { skPrefix: MEMBER_PREFIX, attributes: ['SK'] });
    const memberIds = new Set(members.map(row => row.SK.slice(MEMBER_PREFIX.length)));
    if (removedUserId !== undefined) memberIds.delete(removedUserId);
    // Feeds first: they hold the most, and a feed's link is the most sensitive thing a person leaves behind.
    const feeds = await store.query(hhPk(householdId), { skPrefix: FEED_PREFIX, attributes: ['SK', 'ownerId'] });
    for (const feed of feeds.map(toFeed).filter(candidate => !memberIds.has(candidate.ownerId))) await purgeFeed(store, householdId, feed.id, result);
    const rows = (await store.query(hhPk(householdId), { skPrefix: EVENT_PREFIX })).slice(0, MAX_ITEMS);
    for (const row of rows) await purgeRow(store, row, memberIds, result, householdId);
  } catch (error) {
    result.failed += 1;
    logFailure(householdId, error);
  }
  return result;
}

function logFailure(householdId: string, error: unknown): void {
  console.error(`Calendar cleanup failed (household ${householdId}): ${error instanceof Error ? error.name : 'Error'}`);
}

async function purgeFeed(store: Store, householdId: string, feedId: string, result: PurgeResult): Promise<void> {
  try {
    await removeFeedItems(store, householdId, feedId);
    result.feeds += 1;
  } catch (error) {
    result.failed += 1;
    logFailure(householdId, error);
  }
}

async function purgeRow(store: Store, row: Item, memberIds: ReadonlySet<string>, result: PurgeResult, householdId: string): Promise<void> {
  try {
    if (row.private === true && !memberIds.has(String(row.createdBy))) {
      await store.delete({ PK: row.PK, SK: row.SK });
      result.deleted += 1;
      return;
    }
    const reminders = (row.reminders as CalendarEvent['reminders'] | undefined) ?? {};
    const kept = Object.fromEntries(Object.entries(reminders).filter(([userId]) => memberIds.has(userId)));
    if (Object.keys(kept).length === Object.keys(reminders).length) return;
    await store.transact([{
      update: { PK: row.PK, SK: row.SK },
      ...(Object.keys(kept).length === 0 ? { remove: ['reminders'] } : { set: { reminders: kept } }),
      ifEquals: { updatedAt: row.updatedAt },
    }]);
    result.trimmed += 1;
  } catch (error) {
    result.failed += 1;
    // A write that landed in between is picked up by the next sweep.
    if (!(error instanceof ConditionFailedError)) logFailure(householdId, error);
  }
}
