import { clampTime, THIRTY_DAYS_SECONDS } from '../tasks/record';
import type { ItemWrite, ShoppingItem, WriteResult } from './types';

const forward = (existing: ShoppingItem | undefined, serverNow: number): number => Math.max(serverNow, (existing?.updatedAt ?? 0) + 1);

// Writes the fields of `write` onto `item` that are newer than what it holds. True when anything changed.
function applyFields(item: ShoppingItem, write: ItemWrite, userId: string, serverNow: number): boolean {
  let changed = false;
  const newer = (field: 'text' | 'quantity' | 'ticked', at: number): boolean => at > (item.fieldTimes[field] ?? 0);

  if (write.text) {
    const at = clampTime(write.text.at, serverNow);
    if (newer('text', at)) {
      item.text = write.text.value;
      item.fieldTimes.text = at;
      changed = true;
    }
  }
  if (write.quantity) {
    const at = clampTime(write.quantity.at, serverNow);
    if (newer('quantity', at)) {
      if (write.quantity.value === '') delete item.quantity;
      else item.quantity = write.quantity.value;
      item.fieldTimes.quantity = at;
      changed = true;
    }
  }
  if (write.ticked) {
    const at = clampTime(write.ticked.at, serverNow);
    if (newer('ticked', at)) {
      item.ticked = write.ticked.value;
      if (write.ticked.value) item.tickedBy = userId;
      else delete item.tickedBy;
      item.fieldTimes.ticked = at;
      changed = true;
    }
  }
  return changed;
}

// What a write does to an item. Pure: the caller stores the result. A tombstone is final for edits.
export function applyItemWrite(existing: ShoppingItem | undefined, id: string, write: ItemWrite, userId: string, serverNow: number): { result: WriteResult; item?: ShoppingItem } {
  if (existing?.deletedAt !== undefined) return { result: 'gone' };

  if (!existing) {
    // A create needs its text.
    if (!write.text) return { result: 'noop' };
    const item: ShoppingItem = { id, text: '', ticked: false, fieldTimes: {}, updatedAt: serverNow };
    applyFields(item, write, userId, serverNow);
    return { result: 'created', item };
  }

  const item = structuredClone(existing);
  if (!applyFields(item, write, userId, serverNow)) return { result: 'noop', item: existing };
  item.updatedAt = forward(existing, serverNow);
  return { result: 'applied', item };
}

// A delete, optionally as part of "clear ticked": then it applies only if the item is still ticked, and was not ticked again after
// the time the clearing phone saw.
export function applyItemDelete(existing: ShoppingItem | undefined, userId: string, serverNow: number, ifTickedAt?: number): { result: WriteResult; item?: ShoppingItem } {
  if (!existing || existing.deletedAt !== undefined) return { result: 'noop', item: existing };
  if (ifTickedAt !== undefined && (!existing.ticked || (existing.fieldTimes.ticked ?? 0) > ifTickedAt)) return { result: 'skipped', item: existing };
  const item: ShoppingItem = {
    ...structuredClone(existing),
    deletedAt: serverNow,
    deletedBy: userId,
    expiresAt: Math.floor(serverNow / 1000) + THIRTY_DAYS_SECONDS,
    updatedAt: forward(existing, serverNow),
  };
  return { result: 'applied', item };
}
