import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { computeTotal } from '../../shared/ledger';
import { ConditionFailedError } from '../../store';
import { MemoryStore } from '../../store/memory';
import { createEntry } from '../applyEntry';
import { deleteMoney, listMoney, MONEY_LIMIT, putMoney, respondMoney } from '../entries';
import { moneyKey } from '../keys';
import type { MoneyChange, MoneyEntry, MoneyKind, MoneyPutInput } from '../types';

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

const unit = (kind: MoneyKind, over: Partial<MoneyChange> = {}): MoneyChange => {
  const amountPence = over.amountPence ?? 6340;
  return { paidBy: U1, amountPence, sharePence: kind === 'expense' ? Math.floor(amountPence / 2) : amountPence, ...over };
};
const createInput = (kind: MoneyKind, over: Partial<MoneyChange> = {}, extra: Partial<MoneyPutInput> = {}): MoneyPutInput => ({
  kind, money: unit(kind, over), description: { value: 'Weekly shop', at: NOW - 1000 }, on: { value: '2026-11-14', at: NOW - 1000 }, mutationId: uuid(), ...extra,
});
const put = (id: string, input: MoneyPutInput, who = ctx1, now = NOW) => putMoney(store, who, id, input, now);
const make = async (kind: MoneyKind = 'expense', over: Partial<MoneyChange> = {}, who = ctx1, now = NOW): Promise<MoneyEntry> => {
  const id = uuid();
  return (await put(id, createInput(kind, over), who, now)).result.entry;
};
const respond = (id: string, response: 'agree' | 'decline', version: number, who = ctx2, now = NOW + 1000) =>
  respondMoney(store, who, id, { response, version, mutationId: uuid() }, now);
const agreed = async (kind: MoneyKind = 'expense', over: Partial<MoneyChange> = {}): Promise<MoneyEntry> => {
  const entry = await make(kind, over);
  return (await respond(entry.id, 'agree', entry.version)).result.entry;
};
const raw = async (id: string) => (await store.get(moneyKey(householdId, id)))!;

describe('createEntry (pure)', () => {
  it('refuses a share that breaks the kind\'s rule', () => {
    expect(createEntry('e', { kind: 'loan', money: { paidBy: U1, amountPence: 100, sharePence: 50 }, description: { value: 'x', at: 1 }, on: { value: '2026-11-14', at: 1 } }, U1, NOW))
      .toMatchObject({ ok: false, code: 'invalid', status: 400, extra: { field: 'sharePence' } });
  });
});

describe('putMoney: create', () => {
  it('creates an expense as waiting, with the caller as creator and proposer', async () => {
    const entry = await make('expense');
    expect(entry).toMatchObject({
      kind: 'expense', paidBy: U1, amountPence: 6340, sharePence: 3170, description: 'Weekly shop', on: '2026-11-14', status: 'waiting', version: 1,
      createdBy: U1, proposedBy: U1, createdAt: NOW, updatedAt: NOW, updatedBy: U1, fieldTimes: { description: NOW - 1000, on: NOW - 1000 },
    });
    expect(entry.agreedAt).toBeUndefined();
  });

  it('agrees an expense with a zero share at once, with no agreedBy', async () => {
    const entry = await make('expense', { sharePence: 0 });
    expect(entry).toMatchObject({ status: 'agreed', agreedAt: NOW });
    expect(entry.agreedBy).toBeUndefined();
  });

  it.each(['loan', 'payment'] as const)('always makes a %s wait', async kind => {
    expect((await make(kind)).status).toBe('waiting');
  });

  it('never stores an unset attribute', async () => {
    const entry = await make('expense');
    const stored = await raw(entry.id);
    expect(Object.keys(stored)).not.toContain('loanId');
    expect(Object.keys(stored)).not.toContain('agreedAt');
    expect(Object.values(stored)).not.toContain(undefined);
    expect(Object.values(stored)).not.toContain(null);
  });

  it('answers a retry with the first result and writes nothing', async () => {
    const id = uuid();
    const input = createInput('loan');
    const first = await put(id, input);
    const stored = await raw(id);
    const again = await put(id, input, ctx1, NOW + 5000);
    expect(first.fresh).toBe(true);
    expect(again).toEqual({ fresh: false, result: first.result });
    expect(await raw(id)).toEqual(stored);
  });

  it('refuses a create over an entry that already exists, with the entry', async () => {
    const entry = await make();
    await expect(put(entry.id, createInput('expense'))).rejects.toMatchObject({ code: 'entry_changed', status: 409, extra: { entry } });
  });

  it('refuses an edit of an entry that is not there', async () => {
    await expect(put(uuid(), { description: { value: 'x', at: NOW }, mutationId: uuid() })).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('clamps a client time far in the future', async () => {
    const id = uuid();
    const entry = (await put(id, createInput('expense', {}, { description: { value: 'x', at: NOW + 86_400_000 } }))).result.entry;
    expect(entry.fieldTimes.description).toBe(NOW);
  });

  it('refuses a payer who is not a member', async () => {
    await expect(put(uuid(), createInput('expense', { paidBy: 'auth0|stranger' }))).rejects.toMatchObject({ code: 'invalid', status: 400, extra: { field: 'paidBy' } });
  });

  it('lets the second member pay', async () => {
    expect((await make('expense', { paidBy: U2 })).paidBy).toBe(U2);
  });
});

describe('putMoney: loans on payments', () => {
  it('names an agreed, live loan', async () => {
    const loan = await agreed('loan', { paidBy: U1 });
    const payment = await make('payment', { paidBy: U2, amountPence: 2000, loanId: loan.id }, ctx2);
    expect(payment.loanId).toBe(loan.id);
  });

  it.each(['waiting', 'declined', 'deleted', 'missing', 'not a loan', 'lender'])('refuses a payment naming a loan that is %s', async state => {
    let loanId = uuid();
    let paidBy = U2;
    if (state !== 'missing') {
      const kind: MoneyKind = state === 'not a loan' ? 'expense' : 'loan';
      const entry = await make(kind, { amountPence: 5000, sharePence: kind === 'loan' ? 5000 : 1000 });
      loanId = entry.id;
      if (state === 'declined') await respond(entry.id, 'decline', entry.version);
      if (state === 'deleted') await deleteMoney(store, ctx1, entry.id, { mutationId: uuid() }, NOW);
      if (state === 'not a loan' || state === 'lender') {
        const ok = await respond(entry.id, 'agree', entry.version);
        expect(ok.result.entry.status).toBe('agreed');
      }
      if (state === 'lender') paidBy = U1;
    }
    await expect(put(uuid(), createInput('payment', { paidBy, amountPence: 100, loanId }), ctx2)).rejects.toMatchObject({ code: 'invalid', extra: { field: 'loanId' } });
  });
});

describe('putMoney: edit', () => {
  it('lets the proposer edit a waiting entry, raising the version', async () => {
    const entry = await make();
    const edited = (await put(entry.id, { money: unit('expense', { amountPence: 3640, sharePence: 1820 }), baseVersion: 1, mutationId: uuid() }, ctx1, NOW + 10)).result.entry;
    expect(edited).toMatchObject({ amountPence: 3640, sharePence: 1820, version: 2, status: 'waiting', updatedAt: NOW + 10 });
  });

  it('raises the version for a description edit of a waiting entry too', async () => {
    const entry = await make();
    const edited = (await put(entry.id, { description: { value: 'Shop', at: NOW }, mutationId: uuid() }, ctx1, NOW + 10)).result.entry;
    expect(edited).toMatchObject({ description: 'Shop', version: 2 });
  });

  it('puts a declined entry back to waiting on any save', async () => {
    const entry = await make();
    await respond(entry.id, 'decline', 1);
    const edited = (await put(entry.id, { description: { value: 'Shop', at: NOW }, mutationId: uuid() }, ctx1, NOW + 10)).result.entry;
    expect(edited).toMatchObject({ status: 'waiting', version: 3 });
  });

  it('agrees an entry whose edit makes the share zero', async () => {
    const entry = await make();
    const edited = (await put(entry.id, { money: unit('expense', { sharePence: 0 }), baseVersion: 1, mutationId: uuid() }, ctx1, NOW + 10)).result.entry;
    expect(edited).toMatchObject({ status: 'agreed', agreedAt: NOW + 10 });
    expect(edited.agreedBy).toBeUndefined();
  });

  it('refuses the other member editing a waiting entry', async () => {
    const entry = await make();
    await expect(put(entry.id, { description: { value: 'Shop', at: NOW }, mutationId: uuid() }, ctx2)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('refuses a stale base version with the current entry', async () => {
    const entry = await make();
    await put(entry.id, { description: { value: 'Shop', at: NOW }, mutationId: uuid() });
    const current = (await listMoney(store, ctx1, NOW)).entries[0];
    await expect(put(entry.id, { money: unit('expense'), baseVersion: 1, mutationId: uuid() })).rejects.toMatchObject({ code: 'entry_changed', status: 409, extra: { entry: current } });
  });

  it('refuses a money edit of an agreed entry, and leaves it as it was', async () => {
    const entry = await agreed();
    const before = await raw(entry.id);
    await expect(put(entry.id, { money: unit('expense', { amountPence: 100, sharePence: 50 }), baseVersion: entry.version, mutationId: uuid() })).rejects.toMatchObject({ code: 'needs_agreement', status: 409 });
    expect(await raw(entry.id)).toEqual(before);
  });

  it('lets either member change an agreed entry\'s description or date without raising the version', async () => {
    const entry = await agreed();
    const byOther = (await put(entry.id, { description: { value: 'Groceries', at: NOW + 5 }, mutationId: uuid() }, ctx2, NOW + 5000)).result.entry;
    expect(byOther).toMatchObject({ description: 'Groceries', version: entry.version, status: 'agreed', updatedBy: U2 });
    const byProposer = (await put(entry.id, { on: { value: '2026-11-13', at: NOW + 6 }, mutationId: uuid() }, ctx1, NOW + 6000)).result.entry;
    expect(byProposer).toMatchObject({ on: '2026-11-13', version: entry.version });
  });

  it('keeps the newer of two description writes', async () => {
    const entry = await agreed();
    await put(entry.id, { description: { value: 'Newer', at: NOW + 50 }, mutationId: uuid() }, ctx1, NOW + 5000);
    const second = await put(entry.id, { description: { value: 'Older', at: NOW + 10 }, mutationId: uuid() }, ctx2, NOW + 6000);
    expect(second.result.entry.description).toBe('Newer');
  });

  it('refuses a payer who is not a member on a money edit', async () => {
    const entry = await make();
    await expect(put(entry.id, { money: unit('expense', { paidBy: 'auth0|x' }), baseVersion: 1, mutationId: uuid() })).rejects.toMatchObject({ code: 'invalid', extra: { field: 'paidBy' } });
  });

  it('refuses a loanId on an expense edit', async () => {
    const entry = await make();
    await expect(put(entry.id, { money: { ...unit('expense'), loanId: uuid() }, baseVersion: 1, mutationId: uuid() })).rejects.toMatchObject({ code: 'invalid', extra: { field: 'loanId' } });
  });
});

describe('respondMoney', () => {
  it('lets the responder agree: the entry counts and the version rises', async () => {
    const entry = await make('loan', { amountPence: 5000 });
    const result = (await respond(entry.id, 'agree', 1)).result.entry;
    expect(result).toMatchObject({ status: 'agreed', agreedBy: U2, agreedAt: NOW + 1000, version: 2 });
    expect(computeTotal([result], U1, U2)).toEqual({ direction: 'toMe', pence: 5000 });
  });

  it('lets the responder decline, and the entry stays but does not count', async () => {
    const entry = await make();
    const result = (await respond(entry.id, 'decline', 1)).result.entry;
    expect(result).toMatchObject({ status: 'declined', version: 2 });
    expect(computeTotal([result], U1, U2).direction).toBe('square');
  });

  it('refuses the proposer answering their own entry', async () => {
    const entry = await make();
    await expect(respond(entry.id, 'agree', 1, ctx1)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('refuses an agreement to a version that was edited since', async () => {
    const entry = await make();
    await put(entry.id, { description: { value: 'Shop', at: NOW }, mutationId: uuid() });
    await expect(respond(entry.id, 'agree', 1)).rejects.toMatchObject({ code: 'entry_changed', status: 409 });
    expect((await raw(entry.id)).status).toBe('waiting');
  });

  it('refuses a second answer, and an answer to a restored entry it did not see', async () => {
    const entry = await make();
    await respond(entry.id, 'agree', 1);
    await expect(respond(entry.id, 'agree', 1)).rejects.toMatchObject({ code: 'entry_changed' });
  });

  it('answers a retry of the same response from the record', async () => {
    const entry = await make();
    const mutationId = uuid();
    const first = await respondMoney(store, ctx2, entry.id, { response: 'agree', version: 1, mutationId }, NOW + 1000);
    const again = await respondMoney(store, ctx2, entry.id, { response: 'agree', version: 1, mutationId }, NOW + 2000);
    expect(again).toEqual({ fresh: false, result: first.result });
  });

  it('answers 404 for an entry that is not there', async () => {
    await expect(respond(uuid(), 'agree', 1)).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});

describe('deleteMoney', () => {
  it('lets the proposer delete a waiting entry, which then shows only as deleted', async () => {
    const entry = await make();
    const result = (await deleteMoney(store, ctx1, entry.id, { mutationId: uuid() }, NOW + 10)).result.entry;
    expect(result).toMatchObject({ deletedAt: NOW + 10, deletedBy: U1 });
  });

  it('lets the proposer delete a declined entry', async () => {
    const entry = await make();
    await respond(entry.id, 'decline', 1);
    expect((await deleteMoney(store, ctx1, entry.id, { mutationId: uuid() }, NOW + 10)).result.entry.deletedAt).toBe(NOW + 10);
  });

  it('refuses the other member, and refuses an agreed entry', async () => {
    const entry = await make();
    await expect(deleteMoney(store, ctx2, entry.id, { mutationId: uuid() })).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    const done = await agreed();
    await expect(deleteMoney(store, ctx1, done.id, { mutationId: uuid() })).rejects.toMatchObject({ code: 'needs_agreement', status: 409 });
  });

  it('answers gone for every write on a deleted entry', async () => {
    const entry = await make();
    await deleteMoney(store, ctx1, entry.id, { mutationId: uuid() }, NOW + 10);
    await expect(put(entry.id, { description: { value: 'x', at: NOW }, mutationId: uuid() })).rejects.toMatchObject({ code: 'gone', status: 410 });
    await expect(respond(entry.id, 'agree', 1)).rejects.toMatchObject({ code: 'gone', status: 410 });
    await expect(deleteMoney(store, ctx1, entry.id, { mutationId: uuid() })).rejects.toMatchObject({ code: 'gone', status: 410 });
  });

  it('answers 404 for an entry that is not there', async () => {
    await expect(deleteMoney(store, ctx1, uuid(), { mutationId: uuid() })).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});

describe('the pair', () => {
  it('refuses every write with one member (needs_two) and writes nothing', async () => {
    const entry = await make();
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    const alone = (await loadContext(store, U1))!;
    await expect(put(uuid(), createInput('expense'), alone)).rejects.toMatchObject({ code: 'needs_two', status: 409 });
    await expect(put(entry.id, { description: { value: 'x', at: NOW }, mutationId: uuid() }, alone)).rejects.toMatchObject({ code: 'needs_two' });
    await expect(deleteMoney(store, alone, entry.id, { mutationId: uuid() })).rejects.toMatchObject({ code: 'needs_two' });
    expect(await store.query(hhPk(householdId), { skPrefix: 'MONEY#' })).toHaveLength(1);
  });

  it('refuses a write when someone in the ledger is no longer a member (pair_changed), but still lists it', async () => {
    const entry = await agreed();
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    await store.put({ PK: hhPk(householdId), SK: memberSk('auth0|u3'), displayName: 'Kim', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-14T11:00:00.000Z' });
    await store.put({ ...membershipKey('auth0|u3'), householdId });
    const kim = (await loadContext(store, 'auth0|u3'))!;
    const sam = (await loadContext(store, U1))!;
    await expect(put(uuid(), createInput('expense'), sam)).rejects.toMatchObject({ code: 'pair_changed', status: 409 });
    await expect(put(entry.id, { description: { value: 'x', at: NOW }, mutationId: uuid() }, kim)).rejects.toMatchObject({ code: 'pair_changed' });
    expect((await listMoney(store, kim, NOW)).entries).toHaveLength(1);
  });

  it('lists with one member', async () => {
    await make();
    await store.delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    expect((await listMoney(store, (await loadContext(store, U1))!, NOW)).entries).toHaveLength(1);
  });
});

describe('the live-entry limit', () => {
  const fill = async (count: number, deleted = 0): Promise<void> => {
    for (let i = 0; i < count + deleted; i += 1) {
      const entry = createEntry(`id-${i}`, { kind: 'expense', money: { paidBy: U1, amountPence: 100, sharePence: 50 }, description: { value: 'x', at: 1 }, on: { value: '2026-11-14', at: 1 } }, U1, NOW);
      if (!entry.ok) throw new Error('fixture');
      const { id, ...fields } = { ...entry.entry, ...(i < deleted ? { deletedAt: 5, deletedBy: U1 } : {}) };
      await store.put({ ...moneyKey(householdId, id), ...fields });
    }
  };

  it('refuses the 2,001st live entry with 409 money_limit', async () => {
    await fill(MONEY_LIMIT);
    await expect(put(uuid(), createInput('expense'))).rejects.toMatchObject({ code: 'money_limit', status: 409 });
  });

  it('does not count deleted entries', async () => {
    await fill(MONEY_LIMIT - 1, 20);
    expect((await make()).status).toBe('waiting');
  });
});

describe('listMoney', () => {
  it('lists every live entry and only the 50 newest deleted ones', async () => {
    const live = await make();
    for (let i = 0; i < 52; i += 1) {
      const entry = await make();
      await deleteMoney(store, ctx1, entry.id, { mutationId: uuid() }, NOW + 1000 + i);
    }
    const { entries, serverTime } = await listMoney(store, ctx2, NOW + 99_999);
    const deleted = entries.filter(entry => entry.deletedAt !== undefined);
    expect(serverTime).toBe(NOW + 99_999);
    expect(entries.filter(entry => entry.deletedAt === undefined).map(entry => entry.id)).toEqual([live.id]);
    expect(deleted).toHaveLength(50);
    expect(Math.min(...deleted.map(entry => entry.deletedAt!))).toBe(NOW + 1002);
  });
});

describe('a lost race', () => {
  it('retries and then applies', async () => {
    const entry = await make();
    const real = store.transact.bind(store);
    let failed = false;
    vi.spyOn(store, 'transact').mockImplementation(async ops => {
      if (!failed) {
        failed = true;
        await store.patch(moneyKey(householdId, entry.id), { updatedAt: NOW + 1, description: 'Someone else' });
        throw new ConditionFailedError(0);
      }
      return real(ops);
    });
    const result = (await respond(entry.id, 'agree', 1)).result.entry;
    expect(result.status).toBe('agreed');
  });

  it('answers 409 conflict after three lost races', async () => {
    const entry = await make();
    vi.spyOn(store, 'transact').mockRejectedValue(new ConditionFailedError(0));
    await expect(respond(entry.id, 'agree', 1)).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });
});
