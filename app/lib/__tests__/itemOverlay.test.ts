import { describe, expect, it } from 'vitest';
import type { ShoppingItem } from '../../../src/shopping/types';
import { applyPendingItems } from '../itemOverlay';
import type { ItemsData } from '../itemOverlay';

const ME = 'auth0|me';
const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: 'i1', text: 'Milk', ticked: false, fieldTimes: { text: 100 }, updatedAt: 100, ...over });
const data = (items: ShoppingItem[] = [item()]): ItemsData => ({ items, serverTime: 1 });
const common = { mutationId: 'm1', at: 500, by: ME };
const pending = (kind: string, variables: object) => ({ mutationKey: ['household', kind] as const, variables: { ...common, ...variables } });
const after = (kind: string, variables: object, from = data()): ItemsData => applyPendingItems(from, [pending(kind, variables)]);
const one = (result: ItemsData, id = 'i1'): ShoppingItem => result.items.find(candidate => candidate.id === id)!;

describe('applyPendingItems', () => {
  it('leaves the data alone with nothing pending, and never changes its input', () => {
    const input = data();
    const snapshot = structuredClone(input);
    expect(applyPendingItems(input, [])).toEqual(input);
    after('itemTick', { itemId: 'i1', done: true }, input);
    expect(input).toEqual(snapshot);
  });

  it('shows an item being added, once', () => {
    const added = after('itemAdd', { item: { id: 'i2', text: 'Eggs', quantity: '6' } });
    expect(one(added, 'i2')).toMatchObject({ text: 'Eggs', quantity: '6', ticked: false });
    expect(applyPendingItems(added, [pending('itemAdd', { item: { id: 'i2', text: 'Eggs' } })]).items).toHaveLength(2);
  });

  it('shows a tick with who ticked it, and an untick', () => {
    const ticked = after('itemTick', { itemId: 'i1', done: true });
    expect(one(ticked)).toMatchObject({ ticked: true, tickedBy: ME });
    expect(one(applyPendingItems(ticked, [{ mutationKey: ['household', 'itemTick'], variables: { ...common, at: 600, itemId: 'i1', done: false } }])).ticked).toBe(false);
  });

  it('does not let an older tick override a newer one', () => {
    const newer = data([item({ ticked: true, tickedBy: 'auth0|them', fieldTimes: { text: 100, ticked: 900 } })]);
    expect(one(after('itemTick', { itemId: 'i1', done: false }, newer)).ticked).toBe(true);
  });

  it('shows an edit of the text and the quantity', () => {
    expect(one(after('itemEdit', { itemId: 'i1', text: 'Oat milk', quantity: '2' }))).toMatchObject({ text: 'Oat milk', quantity: '2' });
  });

  it('shows a delete as a tombstone and a restore as its removal', () => {
    const deleted = after('itemDelete', { itemId: 'i1' });
    expect(one(deleted)).toMatchObject({ deletedAt: 500, deletedBy: ME });
    const restored = applyPendingItems(deleted, [pending('itemRestore', { itemIds: ['i1'] })]);
    expect(one(restored).deletedAt).toBeUndefined();
    expect(one(restored).expiresAt).toBeUndefined();
  });

  it('shows clear ticked deleting only the ticked items the phone saw', () => {
    const items = data([item({ id: 'a', ticked: true, fieldTimes: { ticked: 300 } }), item({ id: 'b' }), item({ id: 'c', ticked: true, fieldTimes: { ticked: 800 } })]);
    const result = after('itemClear', { entries: [{ id: 'a', ifTickedAt: 300 }, { id: 'b', ifTickedAt: 300 }, { id: 'c', ifTickedAt: 300 }] }, items);
    expect(one(result, 'a').deletedAt).toBe(500);
    expect(one(result, 'b').deletedAt).toBeUndefined();
    expect(one(result, 'c').deletedAt).toBeUndefined();
  });

  it('ignores task mutations, and mutations for an item that is not there', () => {
    expect(applyPendingItems(data(), [pending('complete', { taskId: 't' }), pending('itemDelete', { itemId: 'missing' })])).toEqual(data());
  });
});
