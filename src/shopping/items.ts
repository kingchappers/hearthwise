import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { ConditionFailedError } from '../store';
import type { Item as StoreItem, Store, TxOp } from '../store';
import { itemKey, ITEM_PREFIX } from '../tasks/keys';
import { DAY_MS } from '../tasks/record';
import { TaskError } from '../tasks/types';
import { applyItemDelete, applyItemWrite } from './apply';
import type { BatchEntry, ItemWrite, ShoppingItem, WriteResult } from './types';

const MAX_ATTEMPTS = 3;
const THIRTY_DAYS_MS = 30 * DAY_MS;

export function toShoppingItem(raw: StoreItem): ShoppingItem {
  const item: ShoppingItem = {
    id: raw.SK.slice(ITEM_PREFIX.length),
    text: String(raw.text),
    ticked: raw.ticked === true,
    fieldTimes: structuredClone((raw.fieldTimes as ShoppingItem['fieldTimes'] | undefined) ?? {}),
    updatedAt: Number(raw.updatedAt),
  };
  if (typeof raw.quantity === 'string') item.quantity = raw.quantity;
  if (typeof raw.tickedBy === 'string') item.tickedBy = raw.tickedBy;
  if (typeof raw.deletedAt === 'number') item.deletedAt = raw.deletedAt;
  if (typeof raw.deletedBy === 'string') item.deletedBy = raw.deletedBy;
  if (typeof raw.expiresAt === 'number') item.expiresAt = raw.expiresAt;
  return item;
}

// The stored form: the same fields, with the keys, and nothing set to undefined.
function toRecord(householdId: string, item: ShoppingItem): StoreItem {
  const { id, ...fields } = item;
  const record: StoreItem = { ...itemKey(householdId, id), ...fields };
  for (const name of Object.keys(record)) if (record[name] === undefined) delete record[name];
  return record;
}

// The update that turns what is stored into `next`: the attributes that changed, and the ones that went away.
function updateFor(householdId: string, existing: StoreItem, next: ShoppingItem): TxOp {
  const after = toRecord(householdId, next);
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(after)) {
    if (name !== 'PK' && name !== 'SK' && JSON.stringify(value) !== JSON.stringify(existing[name])) set[name] = value;
  }
  const remove = Object.keys(existing).filter(name => name !== 'PK' && name !== 'SK' && !(name in after));
  return { update: itemKey(householdId, next.id), set, remove, ifEquals: { updatedAt: existing.updatedAt }, ifMissing: ['deletedAt'] };
}

interface Planned {
  result: WriteResult;
  item?: ShoppingItem;
  ops: TxOp[];
}

// What one entry would write, from what is stored right now.
function plan(householdId: string, raw: StoreItem | undefined, id: string, userId: string, nowMs: number, change: { write: ItemWrite } | { delete: true; ifTickedAt?: number }): Planned {
  const existing = raw ? toShoppingItem(raw) : undefined;
  const outcome = 'delete' in change
    ? applyItemDelete(existing, userId, nowMs, change.ifTickedAt)
    : applyItemWrite(existing, id, change.write, userId, nowMs);
  if (outcome.result === 'created' && outcome.item) return { ...outcome, ops: [{ put: toRecord(householdId, outcome.item), ifAbsent: true }] };
  // A tombstone's own delete is a change to a live item, so it is an update too; a repeat delete is a no-op with nothing to write.
  if (outcome.result === 'applied' && outcome.item && raw) return { ...outcome, ops: [updateFor(householdId, raw, outcome.item)] };
  return { ...outcome, ops: [] };
}

const lostRace = (error: unknown, index: number): boolean => error instanceof ConditionFailedError && error.failedIndex === index;

export async function putItem(
  store: Store, ctx: HouseholdContext, id: string, input: { write: ItemWrite; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ item: ShoppingItem }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ item: ShoppingItem }>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(itemKey(householdId, id), { consistent: true });
    const planned = plan(householdId, raw, id, ctx.userId, nowMs, { write: input.write });
    if (planned.result === 'gone') throw new TaskError('gone', 410);
    // A write to an item that is not there is a create, and a create needs its text.
    if (!raw && planned.result === 'noop') throw new TaskError('invalid', 400, { field: 'text' });
    const item = planned.item ?? toShoppingItem(raw!);
    try {
      return await withWriteRecord(store, householdId, input.mutationId, planned.ops, { item }, Math.floor(nowMs / 1000));
    } catch (error) {
      if (planned.ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

export async function deleteItem(
  store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ item: ShoppingItem }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ item: ShoppingItem }>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(itemKey(householdId, id), { consistent: true });
    if (!raw) throw new TaskError('not_found', 404);
    const planned = plan(householdId, raw, id, ctx.userId, nowMs, { delete: true });
    const item = planned.item ?? toShoppingItem(raw);
    try {
      return await withWriteRecord(store, householdId, input.mutationId, planned.ops, { item }, Math.floor(nowMs / 1000));
    } catch (error) {
      if (planned.ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

// One entry of a batch, in its own transaction. It is conditional on what it read, so running it again is safe.
async function writeEntry(store: Store, ctx: HouseholdContext, entry: Exclude<BatchEntry, { invalid: string }>, nowMs: number): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(itemKey(ctx.householdId, entry.id), { consistent: true });
    const planned = plan(ctx.householdId, raw, entry.id, ctx.userId, nowMs, 'delete' in entry ? entry : { write: entry.write });
    if (planned.ops.length === 0) return planned.result;
    try {
      await store.transact(planned.ops);
      return planned.result;
    } catch (error) {
      if (!(error instanceof ConditionFailedError)) throw error;
    }
  }
  return 'skipped';
}

export async function batchItems(
  store: Store, ctx: HouseholdContext, input: { entries: BatchEntry[]; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ results: { id: string; status: string }[] }>> {
  const replayed = await replayOf<{ results: { id: string; status: string }[] }>(store, ctx.householdId, input.mutationId);
  if (replayed) return replayed;

  const results: { id: string; status: string }[] = [];
  for (const entry of input.entries) {
    results.push({ id: entry.id, status: 'invalid' in entry ? 'invalid' : await writeEntry(store, ctx, entry, nowMs) });
  }
  return withWriteRecord(store, ctx.householdId, input.mutationId, [], { results }, Math.floor(nowMs / 1000));
}

// Open items, and tombstones from the last 30 days so clients can drop them.
export async function listItems(store: Store, ctx: HouseholdContext, nowMs: number = Date.now()): Promise<{ items: ShoppingItem[]; serverTime: number }> {
  const raws = await store.query(hhPk(ctx.householdId), { skPrefix: ITEM_PREFIX });
  const items = raws.map(toShoppingItem).filter(item => item.deletedAt === undefined || item.deletedAt >= nowMs - THIRTY_DAYS_MS);
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { items, serverTime: nowMs };
}
