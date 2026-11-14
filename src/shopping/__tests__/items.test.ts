import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { itemKey } from '../../tasks/keys';
import { restoreEntries } from '../../tasks/restore';
import { batchItems, deleteItem, listItems, putItem } from '../items';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const DAY = 86_400_000;
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
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

const add = async (text = 'Milk', at = NOW - 5000, who = ctx1, extra: Record<string, unknown> = {}) => {
  const id = uuid();
  const { result } = await putItem(store, who, id, { mutationId: uuid(), write: { text: { value: text, at }, ...extra } }, NOW);
  return result.item;
};
const tick = (id: string, value: boolean, at: number, who = ctx1, now = NOW) =>
  putItem(store, who, id, { mutationId: uuid(), write: { ticked: { value, at } } }, now);
const raw = async (id: string) => (await store.get(itemKey(householdId, id)))!;
const batch = (entries: Parameters<typeof batchItems>[2]['entries'], mutationId = uuid(), who = ctx1, now = NOW) => batchItems(store, who, { entries, mutationId }, now);

describe('putItem', () => {
  it('creates an item, and a repeat of the same create changes nothing', async () => {
    const created = await add('Milk', NOW - 100);
    expect(created).toMatchObject({ text: 'Milk', ticked: false, fieldTimes: { text: NOW - 100 } });
    const again = await putItem(store, ctx1, created.id, { mutationId: uuid(), write: { text: { value: 'Milk', at: NOW - 100 } } }, NOW + 9);
    expect(again.result.item).toEqual(created);
  });

  it('refuses to create an item with no text', async () => {
    await expect(putItem(store, ctx1, uuid(), { mutationId: uuid(), write: { ticked: { value: true, at: NOW } } }, NOW))
      .rejects.toMatchObject({ code: 'invalid', status: 400, extra: { field: 'text' } });
  });

  it('lets an older untick lose to a newer tick', async () => {
    const item = await add();
    await tick(item.id, true, NOW - 1000);
    await tick(item.id, false, NOW - 2000, ctx2);
    expect(await raw(item.id)).toMatchObject({ ticked: true, tickedBy: U1 });
  });

  it('clamps a timestamp an hour ahead to server time', async () => {
    const item = await add();
    await tick(item.id, true, NOW + 3_600_000);
    expect((await raw(item.id)).fieldTimes).toMatchObject({ ticked: NOW });
  });

  it('answers 410 for an edit to a deleted item, and does not bring it back', async () => {
    const item = await add();
    await deleteItem(store, ctx1, item.id, { mutationId: uuid() }, NOW);
    await expect(tick(item.id, true, NOW + 1)).rejects.toMatchObject({ code: 'gone', status: 410 });
    expect((await raw(item.id)).deletedAt).toBe(NOW);
    expect((await raw(item.id)).ticked).toBe(false);
  });

  it('answers a retried write from its record', async () => {
    const item = await add();
    const mutationId = uuid();
    const first = await putItem(store, ctx1, item.id, { mutationId, write: { text: { value: 'Oat milk', at: NOW - 10 } } }, NOW);
    const retry = await putItem(store, ctx1, item.id, { mutationId, write: { text: { value: 'Different', at: NOW + 99 } } }, NOW + 5000);
    expect(retry.fresh).toBe(false);
    expect(retry.result).toEqual(first.result);
  });
});

describe('deleteItem', () => {
  it('turns an item into a tombstone for 30 days, and does nothing twice', async () => {
    const item = await add();
    const { result } = await deleteItem(store, ctx2, item.id, { mutationId: uuid() }, NOW);
    expect(result.item).toMatchObject({ deletedAt: NOW, deletedBy: U2, expiresAt: Math.floor(NOW / 1000) + 30 * 86_400 });
    const again = await deleteItem(store, ctx1, item.id, { mutationId: uuid() }, NOW + 1000);
    expect(again.result.item.deletedBy).toBe(U2);
  });

  it('is not found for an item that is not there', async () => {
    await expect(deleteItem(store, ctx1, uuid(), { mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('leaves an item restored when a delete is retried after the restore', async () => {
    const item = await add();
    const mutationId = uuid();
    const first = await deleteItem(store, ctx1, item.id, { mutationId }, NOW);
    await restoreEntries(store, ctx2, { entries: [{ kind: 'item', id: item.id }], mutationId: uuid() }, NOW + 1000);
    const retry = await deleteItem(store, ctx1, item.id, { mutationId }, NOW + 5000);
    expect(retry.fresh).toBe(false);
    expect(retry.result).toEqual(first.result);
    expect((await raw(item.id)).deletedAt).toBeUndefined();
  });
});

describe('batchItems: clear ticked', () => {
  it('tombstones only ticked items, and skips one unticked or ticked again after the clearing phone saw it', async () => {
    const a = await add('A');
    const b = await add('B');
    const c = await add('C');
    await tick(a.id, true, NOW - 3000);
    await tick(c.id, true, NOW - 3000);
    // The clearing phone saw A and C ticked at NOW - 3000, and B ticked too. Meanwhile B was never ticked, and C was ticked again.
    await tick(c.id, false, NOW - 2000, ctx2);
    await tick(c.id, true, NOW - 1000, ctx2);
    const { result } = await batch([a, b, c].map(item => ({ id: item.id, delete: true as const, ifTickedAt: NOW - 3000 })));
    expect(result.results).toEqual([{ id: a.id, status: 'applied' }, { id: b.id, status: 'skipped' }, { id: c.id, status: 'skipped' }]);
    expect((await raw(a.id)).deletedAt).toBe(NOW);
    expect((await raw(b.id)).deletedAt).toBeUndefined();
    expect((await raw(c.id)).deletedAt).toBeUndefined();
  });

  it('reports an invalid entry and carries on with the rest', async () => {
    const a = await add('A');
    const { result } = await batch([{ id: 'nope', invalid: 'writes[0].id' }, { id: a.id, delete: true }]);
    expect(result.results).toEqual([{ id: 'nope', status: 'invalid' }, { id: a.id, status: 'applied' }]);
  });
});

describe('batchItems: retries', () => {
  it('ends with each item written once when a batch is interrupted after some entries and run again', async () => {
    const ids = [uuid(), uuid(), uuid(), uuid()];
    const entries = ids.map((id, index) => ({ id, write: { text: { value: `Item ${index}`, at: NOW - 100 } } }));
    await batch(entries.slice(0, 2));
    const { result } = await batch(entries);
    expect(result.results.map(entry => entry.status)).toEqual(['noop', 'noop', 'created', 'created']);
    expect((await listItems(store, ctx1, NOW)).items).toHaveLength(4);
  });

  it('answers a retried batch from its record', async () => {
    const id = uuid();
    const mutationId = uuid();
    const first = await batch([{ id, write: { text: { value: 'Milk', at: NOW - 5 } } }], mutationId);
    await deleteItem(store, ctx1, id, { mutationId: uuid() }, NOW + 1);
    const retry = await batch([{ id, write: { text: { value: 'Milk', at: NOW - 5 } } }], mutationId, ctx1, NOW + 2);
    expect(retry.fresh).toBe(false);
    expect(retry.result).toEqual(first.result);
  });
});

describe('CUJ 5: shopping with no signal', () => {
  it('settles two phones\' writes that arrive out of order, and a replayed create', async () => {
    // Sam, in the shop with no signal, adds and ticks; Alex, at home, adds one and unticks the milk a little earlier.
    const milk = uuid();
    const eggs = uuid();
    const put = (id: string, who: HouseholdContext, write: object, now: number) => putItem(store, who, id, { mutationId: uuid(), write }, now);
    await put(milk, ctx1, { text: { value: 'Milk', at: 1_000 + NOW - DAY } }, NOW);
    await put(eggs, ctx1, { text: { value: 'Eggs', at: 1_100 + NOW - DAY } }, NOW);
    // Alex's older untick of the milk arrives AFTER Sam's tick.
    await put(milk, ctx1, { ticked: { value: true, at: NOW - 2000 } }, NOW);
    await put(milk, ctx2, { ticked: { value: false, at: NOW - 3000 } }, NOW + 10);
    // A replayed create of the eggs (same id, a new mutation, an older text time) changes nothing.
    await put(eggs, ctx1, { text: { value: 'Eggs', at: 1_100 + NOW - DAY } }, NOW + 20);
    await put(eggs, ctx2, { ticked: { value: true, at: NOW - 1500 } }, NOW + 30);

    const { items } = await listItems(store, ctx2, NOW + 40);
    expect(items.find(item => item.id === milk)).toMatchObject({ ticked: true, tickedBy: U1 });
    expect(items.find(item => item.id === eggs)).toMatchObject({ ticked: true, tickedBy: U2, text: 'Eggs' });
    expect(items).toHaveLength(2);
  });
});

describe('CUJ 9: restoring a shopping item', () => {
  it('lets the other member restore an item one member deleted, and it shows in both lists', async () => {
    const item = await add('Batteries');
    await deleteItem(store, ctx1, item.id, { mutationId: uuid() }, NOW);
    expect((await listItems(store, ctx2, NOW)).items[0].deletedAt).toBeDefined();
    const { result } = await restoreEntries(store, ctx2, { entries: [{ kind: 'item', id: item.id }], mutationId: uuid() }, NOW + 1000);
    expect(result.results).toEqual([{ id: item.id, status: 'restored' }]);
    for (const who of [ctx1, ctx2]) {
      const listed = (await listItems(store, who, NOW + 2000)).items[0];
      expect(listed).toMatchObject({ text: 'Batteries' });
      expect(listed.deletedAt).toBeUndefined();
      expect(listed.expiresAt).toBeUndefined();
    }
  });

  it('does nothing restoring an item that is not deleted, and says not found for an unknown one', async () => {
    const item = await add();
    const { result } = await restoreEntries(store, ctx1, { entries: [{ kind: 'item', id: item.id }, { kind: 'item', id: uuid() }], mutationId: uuid() }, NOW);
    expect(result.results.map(entry => entry.status)).toEqual(['noop', 'not_found']);
  });
});

describe('listItems', () => {
  it('returns items and tombstones from the last 30 days, not older, and not another household\'s', async () => {
    const recent = await add('Recent');
    const old = await add('Old');
    await store.patch(itemKey(householdId, recent.id), { deletedAt: NOW - 29 * DAY, deletedBy: U1 });
    await store.patch(itemKey(householdId, old.id), { deletedAt: NOW - 31 * DAY, deletedBy: U1 });
    await createHousehold(store, { userId: 'auth0|x', name: 'Other', timezone: 'UTC', displayName: 'X', nowMs: NOW }, vi.fn());
    await add('Theirs', NOW - 10, (await loadContext(store, 'auth0|x'))!);
    const { items, serverTime } = await listItems(store, ctx1, NOW);
    expect(items.map(item => item.text)).toEqual(['Recent']);
    expect(serverTime).toBe(NOW);
  });
});
