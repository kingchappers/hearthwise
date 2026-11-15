import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../apiError';
import { HOUSEHOLD_KEY } from '../household';
import { describeFailure, moneyMutationKeys, registerMutations } from '../mutations';
import { MONEY_KEY } from '../moneyKeys';
import type { MoneyMutationKind } from '../mutations';

const ME = 'auth0|me';
const ID = '11111111-1111-4111-8111-111111111111';
const MUTATION = 'aaaaaaaa-0000-4000-8000-000000000001';
const AT = 1_800_000_000_000;

let client: QueryClient;
let request: ReturnType<typeof vi.fn>;
let report: ReturnType<typeof vi.fn<(message: string, options?: { ask?: () => void }) => void>>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  request = vi.fn().mockResolvedValue({});
  report = vi.fn<(message: string, options?: { ask?: () => void }) => void>();
  registerMutations(client, request as never, () => ({ tasks: [], proposals: [], serverTime: 0 }), report);
});

const run = (kind: MoneyMutationKind, variables: Record<string, unknown>) =>
  new MutationObserver(client, { mutationKey: moneyMutationKeys[kind] }).mutate({ mutationId: MUTATION, at: AT, by: ME, ...variables } as never);
const call = () => request.mock.calls.at(-1) as [string, { method: string; body: string }];
const body = () => JSON.parse(call()[1].body);

describe('the money mutations', () => {
  it('are registered with the household scope and a function, one per kind, with their own query key', () => {
    expect(Object.keys(moneyMutationKeys).sort()).toEqual(
      ['moneyAdd', 'moneyChange', 'moneyChangeRespond', 'moneyChangeWithdraw', 'moneyDelete', 'moneyEdit', 'moneyRespond', 'moneyRestore'],
    );
    for (const key of Object.values(moneyMutationKeys)) {
      const defaults = client.getMutationDefaults(key);
      expect(defaults.mutationFn).toBeTypeOf('function');
      expect(defaults.scope).toEqual({ id: 'household' });
    }
    expect(MONEY_KEY).toEqual(['money']);
  });

  it('moneyAdd puts the whole entry with the times of the description and the date', async () => {
    await run('moneyAdd', { entry: { id: ID, kind: 'expense', paidBy: ME, amountPence: 6340, sharePence: 3170, description: 'Weekly shop', on: '2026-11-15' } });
    expect(call()[0]).toBe(`/api/hh/money/${ID}`);
    expect(call()[1].method).toBe('PUT');
    expect(body()).toEqual({
      mutationId: MUTATION, clientAt: AT, kind: 'expense', paidBy: ME, amountPence: 6340, sharePence: 3170,
      description: 'Weekly shop', descriptionAt: AT, on: '2026-11-15', onAt: AT,
    });
  });

  it('moneyAdd sends loanId for a payment and leaves it out otherwise', async () => {
    await run('moneyAdd', { entry: { id: ID, kind: 'payment', paidBy: ME, amountPence: 2000, sharePence: 2000, loanId: MUTATION, description: 'Payment', on: '2026-11-15' } });
    expect(body().loanId).toBe(MUTATION);
  });

  it('moneyEdit sends the money group with its base version, and the description and date with their times, only when set', async () => {
    await run('moneyEdit', { entryId: ID, money: { paidBy: ME, amountPence: 100, sharePence: 50 }, baseVersion: 3, description: 'Shop' });
    expect(call()[0]).toBe(`/api/hh/money/${ID}`);
    expect(call()[1].method).toBe('PUT');
    expect(body()).toEqual({ mutationId: MUTATION, clientAt: AT, paidBy: ME, amountPence: 100, sharePence: 50, baseVersion: 3, description: 'Shop', descriptionAt: AT });
    await run('moneyEdit', { entryId: ID, on: '2026-11-14' });
    expect(body()).toEqual({ mutationId: MUTATION, clientAt: AT, on: '2026-11-14', onAt: AT });
  });

  it('moneyRespond, moneyChange, moneyChangeRespond, moneyChangeWithdraw and moneyDelete use their routes', async () => {
    await run('moneyRespond', { entryId: ID, response: 'agree', version: 2 });
    expect([call()[0], call()[1].method, body()]).toEqual([`/api/hh/money/${ID}/respond`, 'POST', { mutationId: MUTATION, clientAt: AT, response: 'agree', version: 2 }]);
    await run('moneyChange', { entryId: ID, version: 4, money: { paidBy: ME, amountPence: 100, sharePence: 50 } });
    expect([call()[0], body()]).toEqual([`/api/hh/money/${ID}/change`, { mutationId: MUTATION, clientAt: AT, version: 4, money: { paidBy: ME, amountPence: 100, sharePence: 50 } }]);
    await run('moneyChange', { entryId: ID, version: 4, delete: true });
    expect(body()).toEqual({ mutationId: MUTATION, clientAt: AT, version: 4, delete: true });
    await run('moneyChangeRespond', { entryId: ID, response: 'decline', requestId: MUTATION });
    expect([call()[0], body()]).toEqual([`/api/hh/money/${ID}/change/respond`, { mutationId: MUTATION, clientAt: AT, response: 'decline', requestId: MUTATION }]);
    await run('moneyChangeWithdraw', { entryId: ID, requestId: MUTATION });
    expect([call()[0], body()]).toEqual([`/api/hh/money/${ID}/change/withdraw`, { mutationId: MUTATION, clientAt: AT, requestId: MUTATION }]);
    await run('moneyDelete', { entryId: ID });
    expect([call()[0], call()[1].method, body()]).toEqual([`/api/hh/money/${ID}`, 'DELETE', { mutationId: MUTATION, clientAt: AT }]);
  });

  it('moneyRestore names each entry with the deletion the person saw', async () => {
    await run('moneyRestore', { entries: [{ id: ID, deletedAt: 55 }] });
    expect([call()[0], body()]).toEqual(['/api/hh/restore', { mutationId: MUTATION, clientAt: AT, entries: [{ kind: 'money', id: ID, deletedAt: 55 }] }]);
  });

  it('carry notify only when the person asked', async () => {
    await run('moneyDelete', { entryId: ID, notify: true });
    expect(body().notify).toBe(true);
    await run('moneyDelete', { entryId: ID });
    expect(body().notify).toBeUndefined();
  });

  it('refresh the money list when they settle', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    await run('moneyDelete', { entryId: ID });
    expect(spy).toHaveBeenCalledWith({ queryKey: MONEY_KEY });
  });
});

describe('what the person is told when a money write is refused', () => {
  beforeEach(() => {
    client.setQueryData(HOUSEHOLD_KEY, { household: {}, members: [{ userId: 'u2', displayName: 'Alex' }], me: { userId: ME } });
  });

  it.each([
    ['entry_changed', 409, 'That entry changed. Please look at it again.'],
    ['needs_agreement', 409, 'Ask Alex to agree to this change.'],
    ['needs_two', 409, 'Adding or agreeing needs the two people this ledger is between.'],
    ['pair_changed', 409, 'Adding or agreeing needs the two people this ledger is between.'],
    ['money_limit', 409, 'This household has reached 2,000 entries.'],
  ])('says the right thing for %s, before the generic 409 text', async (code, status, text) => {
    request.mockRejectedValue(new ApiError(status, 'Conflict', code));
    await run('moneyDelete', { entryId: ID }).catch(() => undefined);
    expect(report).toHaveBeenCalledWith(text);
  });

  it('describeFailure gives the same words without a name, and does not change other kinds', () => {
    expect(describeFailure(new ApiError(409, 'Conflict', 'needs_agreement'), 'moneyChange')).toBe('Ask them to agree to this change.');
    expect(describeFailure(new ApiError(409, 'Conflict', 'needs_agreement'), 'moneyChange', 'Sam')).toBe('Ask Sam to agree to this change.');
    expect(describeFailure(new ApiError(409, 'Conflict'), 'moneyChange')).toBe('This changed on another phone. Please check it and try again.');
    expect(describeFailure(new ApiError(410, 'Gone', 'gone'), 'moneyDelete')).toBe('That was deleted on another phone.');
  });

  it('tells the person when a restore was not made, from the answer', async () => {
    request.mockResolvedValue({ results: [{ id: ID, status: 'entry_changed' }] });
    await run('moneyRestore', { entries: [{ id: ID, deletedAt: 55 }] });
    expect(report).toHaveBeenCalledWith('That entry changed. Please look at it again.');
  });

  it('says nothing about a restore that was made or was already done', async () => {
    request.mockResolvedValue({ results: [{ id: ID, status: 'restored' }, { id: 'b', status: 'noop' }] });
    await run('moneyRestore', { entries: [{ id: ID, deletedAt: 55 }] });
    expect(report).not.toHaveBeenCalled();
  });
});
