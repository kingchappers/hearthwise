import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../../store/memory';
import { feedKey, secretKey, snapKey } from '../keys';
import { chunkOccurrences, readSnapshot, snapshotOps, SNAP_TTL_SECONDS } from '../snapshots';
import type { ParsedOccurrence } from '../parseCore';

const HID = 'h1';
const FEED = 'f1';
const ZONE = 'Europe/London';
const at = (iso: string): number => Date.parse(iso);
const NOW_S = Date.parse('2026-11-16T09:00:00Z') / 1000;

const timed = (start: string, end: string, title = 'T', over: Partial<Extract<ParsedOccurrence, { allDay: false }>> = {}): ParsedOccurrence =>
  ({ allDay: false, startMs: at(start), endMs: at(end), title, free: false, approx: false, ...over });
const allDay = (startOn: string, endOn: string, title = 'D', free = false): ParsedOccurrence => ({ allDay: true, startOn, endOn, title, free });

describe('chunkOccurrences', () => {
  it('puts each occurrence in the month it starts, read in the household zone', () => {
    const chunks = chunkOccurrences([
      timed('2026-11-30T23:30:00Z', '2026-12-01T00:30:00Z', 'late'), // 23:30 UTC on 30 Nov is 23:30 in London: November
      timed('2026-06-30T23:30:00Z', '2026-07-01T00:30:00Z', 'summer'), // 00:30 on 1 July in London: July
      allDay('2026-12-24', '2026-12-26', 'xmas'),
    ], ZONE);
    expect([...chunks.keys()].sort()).toEqual(['2026-07', '2026-11', '2026-12']);
    expect(chunks.get('2026-11')).toEqual([[at('2026-11-30T23:30:00Z'), at('2026-12-01T00:30:00Z'), 0, 'late']]);
    expect(chunks.get('2026-12')).toEqual([['2026-12-24', '2026-12-26', 1, 'xmas']]);
  });

  it('writes the flags: all-day 1, free 2, approximate 4', () => {
    const chunks = chunkOccurrences([
      timed('2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z', 'a', { free: true, approx: true }),
      allDay('2026-11-17', '2026-11-17', 'b', true),
    ], ZONE);
    expect(chunks.get('2026-11')).toEqual([[at('2026-11-16T10:00:00Z'), at('2026-11-16T11:00:00Z'), 6, 'a'], ['2026-11-17', '2026-11-17', 3, 'b']]);
  });
});

describe('snapshots in a store', () => {
  let store: MemoryStore;
  beforeEach(() => { store = new MemoryStore(); });

  const feedItem = (snapshotId: string) => ({ ...feedKey(HID, FEED), snapshotId, ownerId: 'u1' });
  const write = async (snapshotId: string, occurrences: ParsedOccurrence[], now = at('2026-11-16T09:00:00Z')): Promise<void> => {
    const ops = snapshotOps(HID, FEED, snapshotId, chunkOccurrences(occurrences, ZONE), Math.floor(now / 1000) + SNAP_TTL_SECONDS);
    await store.transact(ops);
  };

  it('keeps a chunk for 150 days', async () => {
    await write('s1', [timed('2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z')]);
    const row = await store.get(snapKey(HID, FEED, 's1', '2026-11'));
    expect(row?.expiresAt).toBe(Math.floor(at('2026-11-16T09:00:00Z') / 1000) + 150 * 86400);
  });

  it('reads the months a window touches, from the snapshot the feed names, and nothing from another snapshot', async () => {
    await store.put(feedItem('s2'));
    await write('s1', [timed('2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z', 'old')]);
    await write('s2', [timed('2026-11-16T12:00:00Z', '2026-11-16T13:00:00Z', 'new'), timed('2026-12-02T12:00:00Z', '2026-12-02T13:00:00Z', 'dec')]);
    const read = await readSnapshot(store, HID, FEED, '2026-11-10', '2026-12-10', NOW_S);
    expect(read?.rows.map(row => row.title).sort()).toEqual(['dec', 'new']);
  });

  it('reads the month before the window too, so an all-day event that started earlier is found', async () => {
    await store.put(feedItem('s1'));
    await write('s1', [allDay('2026-10-28', '2026-11-03', 'trip')]);
    const read = await readSnapshot(store, HID, FEED, '2026-11-01', '2026-11-30', NOW_S);
    expect(read?.rows.map(row => row.title)).toEqual(['trip']);
  });

  it('ignores a chunk whose expiry has passed, because the store may lag', async () => {
    await store.put(feedItem('s1'));
    await write('s1', [timed('2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z')], at('2026-01-01T00:00:00Z'));
    const read = await readSnapshot(store, HID, FEED, '2026-11-10', '2026-11-20', NOW_S);
    expect(read?.rows).toEqual([]);
  });

  it('reads again when the feed moved to a new snapshot while it read, so a half-written refresh is never seen', async () => {
    await store.put(feedItem('s1'));
    await write('s1', [timed('2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z', 'old')]);
    await write('s2', [timed('2026-11-16T12:00:00Z', '2026-11-16T13:00:00Z', 'new')]);
    const real = store.get.bind(store);
    let switched = false;
    store.get = async (key, opts) => {
      const result = await real(key, opts);
      if (!switched && key.SK === snapKey(HID, FEED, 's1', '2026-11').SK) {
        switched = true;
        await store.patch(feedKey(HID, FEED), { snapshotId: 's2' });
      }
      return result;
    };
    const read = await readSnapshot(store, HID, FEED, '2026-11-10', '2026-11-20', NOW_S);
    expect(read?.rows.map(row => row.title)).toEqual(['new']);
  });

  it('gives nothing for a feed that does not exist', async () => {
    expect(await readSnapshot(store, HID, 'nope', '2026-11-10', '2026-11-20', 0)).toBeUndefined();
  });

  it('has a key for the secret that no feed read returns', () => {
    expect(secretKey(HID, FEED)).toEqual({ PK: 'HH#h1', SK: 'CALSECRET#f1' });
  });
});
