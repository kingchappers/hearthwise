import { describe, expect, it } from 'vitest';
import type { MoneyData, MoneyEntry } from '../../../src/money/types';
import { computeTotal } from '../../../src/shared/ledger';
import { applyPendingMoney } from '../moneyOverlay';
import { moneyMutationKeys } from '../moneyKeys';
import type { MoneyMutationKind } from '../moneyKeys';

const SAM = 'u-sam';
const ALEX = 'u-alex';
const AT = 1_800_000_000_000;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const entry = (over: Partial<MoneyEntry> = {}): MoneyEntry => ({
  id: A, kind: 'expense', paidBy: SAM, amountPence: 6340, sharePence: 3170, description: 'Weekly shop', on: '2026-11-15', fieldTimes: { description: 1, on: 1 },
  status: 'agreed', version: 2, createdBy: SAM, createdAt: 1, proposedBy: SAM, agreedAt: 2, agreedBy: ALEX, updatedAt: 2, updatedBy: ALEX, ...over,
});
const data = (...entries: MoneyEntry[]): MoneyData => ({ entries, serverTime: 0 });
const pend = (kind: MoneyMutationKind, by: string, variables: object, at = AT) =>
  ({ mutationKey: moneyMutationKeys[kind], variables: { mutationId: B, at, by, ...variables } });
const only = (result: MoneyData): MoneyEntry => result.entries[0];

describe('applyPendingMoney', () => {
  it('adds an entry as waiting, and shows it once only if the add is queued twice', () => {
    const add = pend('moneyAdd', SAM, { entry: { id: B, kind: 'loan', paidBy: SAM, amountPence: 5000, sharePence: 5000, description: 'Rent shortfall', on: '2026-11-15' } });
    const result = applyPendingMoney(data(), [add, add]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ id: B, status: 'waiting', version: 1, createdBy: SAM, proposedBy: SAM, description: 'Rent shortfall' });
  });

  it('adds an expense with no share as agreed at once, so the total moves with no agreement', () => {
    const add = pend('moneyAdd', SAM, { entry: { id: B, kind: 'expense', paidBy: SAM, amountPence: 1000, sharePence: 0, description: 'Mine', on: '2026-11-15' } });
    expect(only(applyPendingMoney(data(), [add])).status).toBe('agreed');
  });

  it('edits a waiting entry that is the caller\'s: new money, a higher version, back to waiting', () => {
    const waiting = entry({ status: 'declined', version: 3, proposedBy: SAM, agreedBy: undefined, agreedAt: undefined });
    const edit = pend('moneyEdit', SAM, { entryId: A, money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 }, baseVersion: 3 });
    expect(only(applyPendingMoney(data(waiting), [edit]))).toMatchObject({ amountPence: 3640, sharePence: 1820, status: 'waiting', version: 4 });
  });

  it('changes the description of an agreed entry without moving its version, and loses to a newer description', () => {
    const edit = pend('moneyEdit', ALEX, { entryId: A, description: 'Shop' });
    expect(only(applyPendingMoney(data(entry()), [edit]))).toMatchObject({ description: 'Shop', version: 2 });
    const newer = entry({ fieldTimes: { description: AT + 5, on: 1 } });
    expect(only(applyPendingMoney(data(newer), [edit])).description).toBe('Weekly shop');
  });

  it('leaves an entry alone when the write would be refused', () => {
    const stale = pend('moneyEdit', SAM, { entryId: A, money: { paidBy: SAM, amountPence: 100, sharePence: 50 }, baseVersion: 1 });
    const waiting = entry({ status: 'waiting', version: 3 });
    expect(applyPendingMoney(data(waiting), [stale])).toEqual(data(waiting));
  });

  it('agrees to a waiting entry, and the total moves', () => {
    const waiting = entry({ status: 'waiting', version: 1, agreedBy: undefined, agreedAt: undefined });
    const agree = pend('moneyRespond', ALEX, { entryId: A, response: 'agree', version: 1 });
    const result = applyPendingMoney(data(waiting), [agree]);
    expect(only(result)).toMatchObject({ status: 'agreed', agreedBy: ALEX, version: 2 });
    expect(computeTotal(result.entries, SAM, ALEX)).toEqual({ direction: 'toMe', pence: 3170 });
    expect(computeTotal(waiting && [waiting], SAM, ALEX)).toEqual({ direction: 'square', pence: 0 });
  });

  it('declines a waiting entry', () => {
    const waiting = entry({ status: 'waiting', version: 1 });
    expect(only(applyPendingMoney(data(waiting), [pend('moneyRespond', ALEX, { entryId: A, response: 'decline', version: 1 })])).status).toBe('declined');
  });

  it('asks for a change, which names itself by the write\'s id and leaves the figures alone', () => {
    const ask = pend('moneyChange', SAM, { entryId: A, version: 2, money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } });
    const result = only(applyPendingMoney(data(entry()), [ask]));
    expect(result.pendingChange).toMatchObject({ id: B, by: SAM, money: { amountPence: 3640 } });
    expect(result.amountPence).toBe(6340);
  });

  it('applies an agreed change request, answered by the other person, in order', () => {
    const ask = pend('moneyChange', SAM, { entryId: A, version: 2, money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } });
    const answer = pend('moneyChangeRespond', ALEX, { entryId: A, response: 'agree', requestId: B });
    const result = only(applyPendingMoney(data(entry()), [ask, answer]));
    expect(result).toMatchObject({ amountPence: 3640, sharePence: 1820, version: 3 });
    expect(result.pendingChange).toBeUndefined();
  });

  it('takes a request back, and deletes through an agreed delete request', () => {
    const ask = pend('moneyChange', SAM, { entryId: A, version: 2, delete: true });
    expect(only(applyPendingMoney(data(entry()), [ask, pend('moneyChangeWithdraw', SAM, { entryId: A, requestId: B })])).pendingChange).toBeUndefined();
    const gone = only(applyPendingMoney(data(entry()), [ask, pend('moneyChangeRespond', ALEX, { entryId: A, response: 'agree', requestId: B })]));
    expect(gone.deletedAt).toBe(AT);
  });

  it('deletes the caller\'s waiting entry, and an agreed one only through a request', () => {
    const waiting = entry({ status: 'waiting', version: 1, proposedBy: SAM });
    expect(only(applyPendingMoney(data(waiting), [pend('moneyDelete', SAM, { entryId: A })])).deletedAt).toBe(AT);
    expect(only(applyPendingMoney(data(entry()), [pend('moneyDelete', SAM, { entryId: A })])).deletedAt).toBeUndefined();
  });

  it('restores a deleted entry as waiting for the other person, only for the deletion that was seen', () => {
    const deleted = entry({ deletedAt: 55, deletedBy: SAM });
    const result = only(applyPendingMoney(data(deleted), [pend('moneyRestore', ALEX, { entries: [{ id: A, deletedAt: 55 }] })]));
    expect(result).toMatchObject({ status: 'waiting', proposedBy: ALEX, version: 3 });
    expect(result.deletedAt).toBeUndefined();
    expect(only(applyPendingMoney(data(deleted), [pend('moneyRestore', ALEX, { entries: [{ id: A, deletedAt: 44 }] })])).deletedAt).toBe(55);
  });

  it('ignores a write for an entry that is not there, and writes of other kinds', () => {
    const start = data(entry());
    const result = applyPendingMoney(start, [
      pend('moneyRespond', ALEX, { entryId: B, response: 'agree', version: 1 }),
      { mutationKey: ['household', 'itemTick'], variables: { itemId: 'x' } },
      { mutationKey: undefined, variables: {} },
    ]);
    expect(result).toEqual(start);
  });

  it('does not change the data it was given', () => {
    const start = data(entry({ status: 'waiting', version: 1 }));
    const copy = structuredClone(start);
    applyPendingMoney(start, [pend('moneyRespond', ALEX, { entryId: A, response: 'agree', version: 1 })]);
    expect(start).toEqual(copy);
  });

  it('gives the total the server would give for the same entries', () => {
    const waiting = entry({ status: 'waiting', version: 1, agreedBy: undefined, agreedAt: undefined });
    const overlaid = applyPendingMoney(data(waiting), [pend('moneyRespond', ALEX, { entryId: A, response: 'agree', version: 1 })]);
    const served = [{ ...waiting, status: 'agreed' as const, version: 2, agreedBy: ALEX, agreedAt: AT }];
    expect(computeTotal(overlaid.entries, SAM, ALEX)).toEqual(computeTotal(served, SAM, ALEX));
  });
});
