import { addDays, dayInZone } from '../shared/schedule';
import type { Item, Store, TxOp } from '../store';
import { feedKey, snapKey } from './keys';
import type { ParsedOccurrence } from './parseCore';

// A feed's occurrences, kept apart from the feed item so a read of the feed list stays small. One chunk for each month that has
// occurrences (an occurrence is in the month it starts, in the household zone).

export const SNAP_TTL_SECONDS = 150 * 24 * 60 * 60;
const ALL_DAY = 1;
const FREE = 2;
const APPROX = 4;
const LOOK_BACK_DAYS = 31;
const READ_ATTEMPTS = 3;

// [startMs, endMs, flags, title] or, for an all-day item, [startOn, endOn (inclusive), flags, title].
export type SnapItem = [number | string, number | string, number, string];

export interface SnapRow {
  allDay: boolean;
  startMs?: number;
  endMs?: number;
  startOn?: string;
  endOn?: string;
  title: string;
  free: boolean;
  approx: boolean;
}

export const monthOf = (day: string): string => day.slice(0, 7);

export function chunkOccurrences(occurrences: readonly ParsedOccurrence[], zone: string): Map<string, SnapItem[]> {
  const chunks = new Map<string, SnapItem[]>();
  for (const occurrence of occurrences) {
    const month = monthOf(occurrence.allDay ? occurrence.startOn : dayInZone(occurrence.startMs, zone));
    const flags = (occurrence.allDay ? ALL_DAY : 0) | (occurrence.free ? FREE : 0) | (!occurrence.allDay && occurrence.approx ? APPROX : 0);
    const item: SnapItem = occurrence.allDay
      ? [occurrence.startOn, occurrence.endOn, flags, occurrence.title]
      : [occurrence.startMs, occurrence.endMs, flags, occurrence.title];
    chunks.set(month, [...(chunks.get(month) ?? []), item]);
  }
  return chunks;
}

export function snapshotOps(householdId: string, feedId: string, snapshotId: string, chunks: ReadonlyMap<string, SnapItem[]>, expiresAt: number): TxOp[] {
  return [...chunks].map(([month, items]) => ({ put: { ...snapKey(householdId, feedId, snapshotId, month), items, expiresAt } }));
}

function toRow(item: SnapItem): SnapRow {
  const [start, end, flags, title] = item;
  const common = { title: String(title), free: (flags & FREE) !== 0, approx: (flags & APPROX) !== 0 };
  if ((flags & ALL_DAY) !== 0) return { allDay: true, startOn: String(start), endOn: String(end), ...common };
  return { allDay: false, startMs: Number(start), endMs: Number(end), ...common };
}

function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const months: string[] = [];
  let [year, month] = fromMonth.split('-').map(Number);
  const [lastYear, lastMonth] = toMonth.split('-').map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return months;
}

// The rows of the months a window of days touches, plus the month before it, so an all-day item that began earlier is found. They are
// read from the snapshot the feed names; if the feed moved to another snapshot meanwhile, they are read again. Undefined when there
// is no such feed.
export async function readSnapshot(
  store: Store, householdId: string, feedId: string, fromDay: string, toDay: string, nowSeconds: number,
): Promise<{ feed: Item; rows: SnapRow[] } | undefined> {
  const months = monthsBetween(monthOf(addDays(fromDay, -LOOK_BACK_DAYS)), monthOf(toDay));
  for (let attempt = 0; ; attempt += 1) {
    const feed = await store.get(feedKey(householdId, feedId), { consistent: true });
    if (!feed) return undefined;
    const snapshotId = String(feed.snapshotId ?? '');
    const rows: SnapRow[] = [];
    for (const month of months) {
      const chunk = await store.get(snapKey(householdId, feedId, snapshotId, month), { consistent: true });
      if (!chunk || (typeof chunk.expiresAt === 'number' && chunk.expiresAt <= nowSeconds) || !Array.isArray(chunk.items)) continue;
      rows.push(...(chunk.items as SnapItem[]).map(toRow));
    }
    const after = await store.get(feedKey(householdId, feedId), { consistent: true });
    if (after?.snapshotId === feed.snapshotId) return { feed, rows };
    if (!after) return undefined;
    if (attempt + 1 >= READ_ATTEMPTS) return { feed: after, rows: [] };
  }
}
