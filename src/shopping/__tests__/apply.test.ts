import { describe, expect, it } from 'vitest';
import { applyItemDelete, applyItemWrite } from '../apply';
import type { ShoppingItem } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const ME = 'auth0|me';
const ID = '00000000-0000-4000-8000-000000000001';

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: ID, text: 'Milk', ticked: false, fieldTimes: { text: 100 }, updatedAt: 100, ...over });

describe('applyItemWrite: creating', () => {
  it('creates an item from its fields, with field times', () => {
    const { result, item: created } = applyItemWrite(undefined, ID, { text: { value: 'Milk', at: 500 }, quantity: { value: '2 litres', at: 500 } }, ME, NOW);
    expect(result).toBe('created');
    expect(created).toMatchObject({ id: ID, text: 'Milk', quantity: '2 litres', ticked: false, fieldTimes: { text: 500, quantity: 500 }, updatedAt: NOW });
  });

  it('creates an item that arrives already ticked, recording who ticked it', () => {
    const { item: created } = applyItemWrite(undefined, ID, { text: { value: 'Milk', at: 500 }, ticked: { value: true, at: 600 } }, ME, NOW);
    expect(created).toMatchObject({ ticked: true, tickedBy: ME, fieldTimes: { ticked: 600 } });
  });

  it('does nothing for a write to a missing item that has no text', () => {
    expect(applyItemWrite(undefined, ID, { ticked: { value: true, at: 5 } }, ME, NOW)).toEqual({ result: 'noop' });
  });
});

describe('applyItemWrite: updating', () => {
  it('lets an older untick lose to a newer tick', () => {
    const ticked = item({ ticked: true, tickedBy: ME, fieldTimes: { text: 100, ticked: 300 } });
    const { result, item: after } = applyItemWrite(ticked, ID, { ticked: { value: false, at: 200 } }, ME, NOW);
    expect(result).toBe('noop');
    expect(after).toEqual(ticked);
  });

  it('applies a newer untick and forgets who ticked', () => {
    const ticked = item({ ticked: true, tickedBy: ME, fieldTimes: { text: 100, ticked: 300 } });
    const { result, item: after } = applyItemWrite(ticked, ID, { ticked: { value: false, at: 400 } }, 'auth0|them', NOW);
    expect(result).toBe('applied');
    expect(after).toMatchObject({ ticked: false, fieldTimes: { ticked: 400 } });
    expect(after!.tickedBy).toBeUndefined();
  });

  it('ignores an edit with an older text time, and applies a newer one', () => {
    expect(applyItemWrite(item(), ID, { text: { value: 'Old', at: 50 } }, ME, NOW).result).toBe('noop');
    const { item: after } = applyItemWrite(item(), ID, { text: { value: 'Oat milk', at: 150 } }, ME, NOW);
    expect(after).toMatchObject({ text: 'Oat milk', fieldTimes: { text: 150 } });
  });

  it('settles each field on its own: a newer quantity and an older text in one write', () => {
    const { item: after } = applyItemWrite(item({ fieldTimes: { text: 100 } }), ID, { text: { value: 'Old', at: 50 }, quantity: { value: '3', at: 60 } }, ME, NOW);
    expect(after).toMatchObject({ text: 'Milk', quantity: '3' });
  });

  it('removes the quantity when it is set to empty', () => {
    const { item: after } = applyItemWrite(item({ quantity: '2', fieldTimes: { text: 100, quantity: 100 } }), ID, { quantity: { value: '', at: 200 } }, ME, NOW);
    expect(after!.quantity).toBeUndefined();
    expect(after!.fieldTimes.quantity).toBe(200);
  });

  it('clamps a time an hour ahead to server time', () => {
    const { item: after } = applyItemWrite(item(), ID, { text: { value: 'Later', at: NOW + 3_600_000 } }, ME, NOW);
    expect(after!.fieldTimes.text).toBe(NOW);
  });

  it('moves updatedAt forward even for a second write in the same millisecond', () => {
    const { item: after } = applyItemWrite(item({ updatedAt: NOW }), ID, { text: { value: 'Again', at: 200 } }, ME, NOW);
    expect(after!.updatedAt).toBe(NOW + 1);
  });

  it('answers gone for a tombstone and changes nothing', () => {
    const deleted = item({ deletedAt: 5, deletedBy: ME });
    expect(applyItemWrite(deleted, ID, { text: { value: 'Zombie', at: 999 } }, ME, NOW)).toEqual({ result: 'gone' });
  });
});

describe('applyItemDelete', () => {
  it('tombstones an item, who did it, and expires it in 30 days', () => {
    const { result, item: after } = applyItemDelete(item(), ME, NOW);
    expect(result).toBe('applied');
    expect(after).toMatchObject({ deletedAt: NOW, deletedBy: ME, expiresAt: Math.floor(NOW / 1000) + 30 * 86_400 });
  });

  it('does nothing for a tombstone or a missing item', () => {
    expect(applyItemDelete(item({ deletedAt: 5, deletedBy: ME }), ME, NOW).result).toBe('noop');
    expect(applyItemDelete(undefined, ME, NOW).result).toBe('noop');
  });

  describe('as part of clear ticked', () => {
    const ticked = (at: number) => item({ ticked: true, tickedBy: ME, fieldTimes: { text: 100, ticked: at } });

    it('deletes an item still ticked at the time the clearing phone saw', () => {
      expect(applyItemDelete(ticked(300), ME, NOW, 300).result).toBe('applied');
      expect(applyItemDelete(ticked(300), ME, NOW, 400).result).toBe('applied');
    });

    it('skips an item that was unticked, or ticked again after the phone saw it', () => {
      expect(applyItemDelete(item(), ME, NOW, 300).result).toBe('skipped');
      expect(applyItemDelete(ticked(500), ME, NOW, 300).result).toBe('skipped');
    });

    it('does nothing for one already deleted', () => {
      expect(applyItemDelete({ ...ticked(300), deletedAt: 5 }, ME, NOW, 300).result).toBe('noop');
    });
  });
});
