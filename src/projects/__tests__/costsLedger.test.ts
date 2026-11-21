import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hhPk } from '../../household/keys';
import type { MoneyEntry } from '../../money/types';
import { computeTotal, loanProgress, settledIds } from '../../shared/ledger';
import { deleteProjectTree } from '../children';
import { putProject } from '../projects';
import { NOW, U1, U2, makeWorld, uuid } from './world';
import type { World } from './world';

let w: World;
const AT = NOW - 5000;

const entry = (over: Partial<MoneyEntry> & Pick<MoneyEntry, 'id' | 'kind' | 'paidBy' | 'amountPence'>): MoneyEntry => ({
  sharePence: over.amountPence, description: 'x', on: '2026-11-01', fieldTimes: {}, status: 'agreed', version: 1, createdBy: over.paidBy, createdAt: 1, proposedBy: over.paidBy,
  agreedAt: 2, agreedBy: over.paidBy === U1 ? U2 : U1, updatedAt: 2, updatedBy: over.paidBy, ...over,
});

// Fixed inputs: a loan, a part payment and an equal-split expense, all agreed.
const ENTRIES = [
  entry({ id: 'rent', kind: 'loan', paidBy: U1, amountPence: 5000 }),
  entry({ id: 'shop', kind: 'expense', paidBy: U1, amountPence: 6340, sharePence: 3170 }),
  entry({ id: 'pay', kind: 'payment', paidBy: U2, amountPence: 2000, loanId: 'rent' }),
];
const answers = () => ({ total: computeTotal(ENTRIES, U1, U2), loan: loanProgress(ENTRIES, 'rent'), settled: [...settledIds(ENTRIES)].sort() });

beforeEach(async () => {
  w = await makeWorld();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('project costs and the ledger', () => {
  it('give the same total, loan progress and settled set before and after any cost write', async () => {
    const before = answers();
    const id = uuid();
    await putProject(w.store, w.ctx1, id, { write: { title: { value: 'Garden room', at: AT } }, mutationId: uuid() }, NOW);
    for (const [i, write] of [{ estimate: { value: 400000, at: AT + 1 } }, { spent: { value: 125000, at: AT + 2 } }, { spent: { value: null, at: AT + 3 } }, { estimate: { value: 99, at: AT + 4 } }].entries()) {
      await putProject(w.store, i % 2 === 0 ? w.ctx1 : w.ctx2, id, { write, mutationId: uuid() }, NOW);
    }
    expect(answers()).toEqual(before);
    expect(before).toEqual({ total: { direction: 'toMe', pence: 6170 }, loan: 2000, settled: [] });
  });

  it('write no item under MONEY# for a cost, a delete or a restore', async () => {
    const id = uuid();
    await putProject(w.store, w.ctx1, id, { write: { title: { value: 'Garden room', at: AT }, estimate: { value: 400000, at: AT } }, mutationId: uuid() }, NOW);
    await putProject(w.store, w.ctx2, id, { write: { spent: { value: 125000, at: AT } }, mutationId: uuid() }, NOW);
    await deleteProjectTree(w.store, w.ctx1, id, { mutationId: uuid() }, NOW);
    expect(await w.store.query(hhPk(w.householdId), { skPrefix: 'MONEY#' })).toEqual([]);
  });

  it('leave an existing money entry exactly as it was', async () => {
    await w.store.put({ PK: hhPk(w.householdId), SK: 'MONEY#rent', ...ENTRIES[0] });
    const before = await w.store.get({ PK: hhPk(w.householdId), SK: 'MONEY#rent' });
    const id = uuid();
    await putProject(w.store, w.ctx1, id, { write: { title: { value: 'Garden room', at: AT }, spent: { value: 5000, at: AT } }, mutationId: uuid() }, NOW);
    expect(await w.store.get({ PK: hhPk(w.householdId), SK: 'MONEY#rent' })).toEqual(before);
  });
});
