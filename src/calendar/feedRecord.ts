import type { Item } from '../store';
import { FEED_PREFIX } from './keys';
import type { Feed, FeedStatus } from './types';

// A stored feed item as a Feed. Kept apart from feeds.ts so the store command line tool can read feeds without loading the fetcher.
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
