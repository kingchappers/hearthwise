import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { computeTotal } from '../../shared/ledger';
import { ConditionFailedError } from '../../store';
import { MemoryStore } from '../../store/memory';
import { askChange, respondChange, withdrawChange } from '../changes';
import { putMoney, respondMoney } from '../entries';
import { moneyKey } from '../keys';
import type { MoneyChange, MoneyEntry, MoneyKind } from '../types';

const NOW = Date.parse('2026-11-15T10:00:00.000Z');
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

// CUJ 6: Sam's £63.40 expense with an equal split, agreed by Alex.
const agreed = async (kind: MoneyKind = 'expense', amountPence = 6340, extra: Partial<MoneyChange> = {}): Promise<MoneyEntry> => {
  const id = uuid();
  const money = { paidBy: U1, amountPence, sharePence: kind === 'expense' ? Math.floor(amountPence / 2) : amountPence, ...extra };
  await putMoney(store, ctx1, id, { kind, money, description: { value: 'Weekly shop', at: NOW - 100 }, on: { value: '2026-11-14', at: NOW - 100 }, mutationId: uuid() }, NOW);
  return (await respondMoney(store, ctx2, id, { response: 'agree', version: 1, mutationId: uuid() }, NOW + 1000)).result.entry;
};
const ask = (entry: MoneyEntry, over: Partial<{ money: MoneyChange; delete: true; version: number }> = {}, who = ctx1, mutationId = uuid(), now = NOW + 2000) =>
  askChange(store, who, entry.id, { version: entry.version, ...(over.money || over.delete ? {} : { delete: true as const }), ...over, mutationId }, now);
const newMoney: MoneyChange = { paidBy: U1, amountPence: 3640, sharePence: 1820 };
const raw = async (id: string) => (await store.get(moneyKey(householdId, id)))!;

describe('askChange', () => {
  it('stores a money request on the entry, which keeps counting at its current figure', async () => {
    const entry = await agreed();
    const requestId = uuid();
    const asked = (await ask(entry, { money: newMoney }, ctx1, requestId)).result.entry;
    expect(asked.pendingChange).toEqual({ id: requestId, by: U1, at: NOW + 2000, money: newMoney });
    expect(asked).toMatchObject({ status: 'agreed', amountPence: 6340, version: entry.version });
    expect(computeTotal([asked], U1, U2)).toEqual({ direction: 'toMe', pence: 3170 });
  });

  it('stores a delete request', async () => {
    const entry = await agreed();
    const asked = (await ask(entry)).result.entry;
    expect(asked.pendingChange).toMatchObject({ by: U1, delete: true });
    expect(asked.pendingChange?.money).toBeUndefined();
  });

  it('lets either member ask', async () => {
    const entry = await agreed();
    expect((await ask(entry, { money: { ...newMoney } }, ctx2)).result.entry.pendingChange?.by).toBe(U2);
  });

  it('refuses a request while one is pending', async () => {
    const entry = await agreed();
    await ask(entry, { money: newMoney });
    await expect(ask(entry, { delete: true })).rejects.toMatchObject({ code: 'entry_changed', status: 409 });
  });

  it('refuses a stale version, and an entry that is not agreed', async () => {
    const entry = await agreed();
    await expect(ask(entry, { delete: true, version: entry.version + 1 })).rejects.toMatchObject({ code: 'entry_changed' });
    const id = uuid();
    await putMoney(store, ctx1, id, { kind: 'loan', money: { paidBy: U1, amountPence: 100, sharePence: 100 }, description: { value: 'x', at: NOW }, on: { value: '2026-11-14', at: NOW }, mutationId: uuid() }, NOW);
    await expect(askChange(store, ctx1, id, { version: 1, delete: true, mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'entry_changed' });
  });

  it('refuses figures that break the entry\'s kind, and a payer who is not a member', async () => {
    const loan = await agreed('loan', 5000);
    await expect(ask(loan, { money: { paidBy: U1, amountPence: 5000, sharePence: 100 } })).rejects.toMatchObject({ code: 'invalid', extra: { field: 'money.sharePence' } });
    const entry = await agreed();
    await expect(ask(entry, { money: { ...newMoney, paidBy: 'auth0|x' } })).rejects.toMatchObject({ code: 'invalid', extra: { field: 'money.paidBy' } });
  });

  it('answers 404 for an entry that is not there and a retry from the record', async () => {
    await expect(askChange(store, ctx1, uuid(), { version: 1, delete: true, mutationId: uuid() })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    const entry = await agreed();
    const mutationId = uuid();
    const first = await ask(entry, { money: newMoney }, ctx1, mutationId);
    const again = await ask(entry, { money: newMoney }, ctx1, mutationId, NOW + 9000);
    expect(again).toEqual({ fresh: false, result: first.result });
  });
});

describe('respondChange', () => {
  it('CUJ 6: agreeing replaces the money, raises the version and removes the request', async () => {
    const entry = await agreed();
    const requestId = uuid();
    await ask(entry, { money: newMoney }, ctx1, requestId);
    const result = (await respondChange(store, ctx2, entry.id, { response: 'agree', requestId, mutationId: uuid() }, NOW + 3000)).result.entry;
    expect(result).toMatchObject({ amountPence: 3640, sharePence: 1820, version: entry.version + 1, status: 'agreed' });
    expect(result.pendingChange).toBeUndefined();
    expect(Object.keys(await raw(entry.id))).not.toContain('pendingChange');
    expect(computeTotal([result], U1, U2)).toEqual({ direction: 'toMe', pence: 1820 });
  });

  it('removes a loanId a new figure leaves out', async () => {
    const loan = await agreed('loan', 5000);
    const id = uuid();
    await putMoney(store, ctx2, id, { kind: 'payment', money: { paidBy: U2, amountPence: 2000, sharePence: 2000, loanId: loan.id }, description: { value: 'x', at: NOW }, on: { value: '2026-11-14', at: NOW }, mutationId: uuid() }, NOW);
    const payment = (await respondMoney(store, ctx1, id, { response: 'agree', version: 1, mutationId: uuid() }, NOW + 1)).result.entry;
    const requestId = uuid();
    await askChange(store, ctx2, id, { version: payment.version, money: { paidBy: U2, amountPence: 2000, sharePence: 2000 }, mutationId: requestId }, NOW + 2);
    const result = (await respondChange(store, ctx1, id, { response: 'agree', requestId, mutationId: uuid() }, NOW + 3)).result.entry;
    expect(result.loanId).toBeUndefined();
    expect(Object.keys(await raw(id))).not.toContain('loanId');
  });

  it('agreeing a delete request deletes the entry and clears the request', async () => {
    const entry = await agreed();
    const requestId = uuid();
    await ask(entry, { delete: true }, ctx1, requestId);
    const result = (await respondChange(store, ctx2, entry.id, { response: 'agree', requestId, mutationId: uuid() }, NOW + 3000)).result.entry;
    expect(result).toMatchObject({ deletedAt: NOW + 3000, deletedBy: U2 });
    expect(result.pendingChange).toBeUndefined();
  });

  it('declining only removes the request', async () => {
    const entry = await agreed();
    const requestId = uuid();
    await ask(entry, { money: newMoney }, ctx1, requestId);
    const result = (await respondChange(store, ctx2, entry.id, { response: 'decline', requestId, mutationId: uuid() }, NOW + 3000)).result.entry;
    expect(result).toMatchObject({ amountPence: 6340, sharePence: 3170, version: entry.version, status: 'agreed' });
    expect(result.pendingChange).toBeUndefined();
  });

  it('refuses the member who asked, a stale request id, and an entry with no request', async () => {
    const entry = await agreed();
    const requestId = uuid();
    await expect(respondChange(store, ctx2, entry.id, { response: 'agree', requestId, mutationId: uuid() })).rejects.toMatchObject({ code: 'entry_changed', status: 409 });
    await ask(entry, { money: newMoney }, ctx1, requestId);
    await expect(respondChange(store, ctx1, entry.id, { response: 'agree', requestId, mutationId: uuid() })).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    await expect(respondChange(store, ctx2, entry.id, { response: 'agree', requestId: uuid(), mutationId: uuid() })).rejects.toMatchObject({ code: 'entry_changed' });
  });

  it('does not let a queued agreement apply to a request made after the one the person saw', async () => {
    const entry = await agreed();
    const first = uuid();
    await ask(entry, { money: newMoney }, ctx1, first);
    await withdrawChange(store, ctx1, entry.id, { requestId: first, mutationId: uuid() }, NOW + 2500);
    await ask(entry, { delete: true }, ctx1, uuid(), NOW + 2600);
    await expect(respondChange(store, ctx2, entry.id, { response: 'agree', requestId: first, mutationId: uuid() })).rejects.toMatchObject({ code: 'entry_changed' });
    expect((await raw(entry.id)).deletedAt).toBeUndefined();
  });

  it('retries after a lost race', async () => {
    const entry = await agreed();
    const requestId = uuid();
    await ask(entry, { money: newMoney }, ctx1, requestId);
    const real = store.transact.bind(store);
    let failed = false;
    vi.spyOn(store, 'transact').mockImplementation(async ops => {
      if (!failed) {
        failed = true;
        await store.patch(moneyKey(householdId, entry.id), { updatedAt: NOW + 9000 });
        throw new ConditionFailedError(0);
      }
      return real(ops);
    });
    expect((await respondChange(store, ctx2, entry.id, { response: 'agree', requestId, mutationId: uuid() }, NOW + 10_000)).result.entry.amountPence).toBe(3640);
  });
});

describe('withdrawChange', () => {
  it('lets the member who asked take the request back', async () => {
    const entry = await agreed();
    const requestId = uuid();
    await ask(entry, { money: newMoney }, ctx1, requestId);
    const result = (await withdrawChange(store, ctx1, entry.id, { requestId, mutationId: uuid() }, NOW + 3000)).result.entry;
    expect(result.pendingChange).toBeUndefined();
    expect(result.amountPence).toBe(6340);
  });

  it('refuses the other member and a stale request id', async () => {
    const entry = await agreed();
    const requestId = uuid();
    await ask(entry, { money: newMoney }, ctx1, requestId);
    await expect(withdrawChange(store, ctx2, entry.id, { requestId, mutationId: uuid() })).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    await expect(withdrawChange(store, ctx1, entry.id, { requestId: uuid(), mutationId: uuid() })).rejects.toMatchObject({ code: 'entry_changed' });
  });
});

describe('while a request is pending', () => {
  it('lets either member change the description and date but not the money or status', async () => {
    const entry = await agreed();
    await ask(entry, { money: newMoney });
    const edited = (await putMoney(store, ctx2, entry.id, { description: { value: 'Groceries', at: NOW + 50 }, on: { value: '2026-11-10', at: NOW + 50 }, mutationId: uuid() }, NOW + 5000)).result.entry;
    expect(edited).toMatchObject({ description: 'Groceries', on: '2026-11-10', status: 'agreed', version: entry.version });
    expect(edited.pendingChange).toBeDefined();
    await expect(putMoney(store, ctx1, entry.id, { money: newMoney, baseVersion: entry.version, mutationId: uuid() }, NOW + 6000)).rejects.toMatchObject({ code: 'needs_agreement' });
  });
});
