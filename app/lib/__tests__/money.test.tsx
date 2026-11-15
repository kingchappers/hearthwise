import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MoneyData, MoneyEntry } from '../../../src/money/types';
import { computeTotal } from '../../../src/shared/ledger';

const request = vi.hoisted(() => vi.fn());
const household = vi.hoisted(() => ({ members: [] as { userId: string; displayName: string }[] }));
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));
vi.mock('../household', async importOriginal => ({
  ...(await importOriginal<typeof import('../household')>()),
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'Europe/London' }, members: household.members, me: { userId: 'u-sam', displayName: 'Sam' } } }),
}));

import { MONEY_KEY } from '../moneyKeys';
import { moneyMutationKeys } from '../moneyKeys';
import { noteMutationSettled } from '../queries';
import { duplicatePayment, ledgerPair, openLoansFor, sectionsFor, useMoney } from '../money';

const SAM = 'u-sam';
const ALEX = 'u-alex';
const NOW = Date.parse('2026-11-15T10:00:00.000Z');
let seq = 0;
const entry = (over: Partial<MoneyEntry> = {}): MoneyEntry => {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, kind: 'expense', paidBy: SAM, amountPence: 6340, sharePence: 3170, description: 'Weekly shop', on: '2026-11-15',
    fieldTimes: {}, status: 'agreed', version: 2, createdBy: SAM, createdAt: seq, proposedBy: SAM, agreedAt: 2, agreedBy: ALEX, updatedAt: 2, updatedBy: ALEX, ...over,
  };
};
const served = (...entries: MoneyEntry[]): MoneyData => ({ entries, serverTime: NOW });
const pair = [{ userId: SAM, displayName: 'Sam' }, { userId: ALEX, displayName: 'Alex' }];

describe('ledgerPair', () => {
  it('names the other member, and allows writes for two members who are all in the ledger', () => {
    expect(ledgerPair([entry()], SAM, pair)).toEqual({ otherId: ALEX, otherName: 'Alex', canWrite: true });
  });

  it('with an empty ledger takes the other member of the household', () => {
    expect(ledgerPair([], SAM, pair)).toEqual({ otherId: ALEX, otherName: 'Alex', canWrite: true });
  });

  it('shows Former member, and no writes, when the other person has left', () => {
    expect(ledgerPair([entry()], SAM, [pair[0]])).toEqual({ otherId: ALEX, otherName: 'Former member', canWrite: false });
  });

  it('allows no writes for a household of one with an empty ledger, and names nobody', () => {
    expect(ledgerPair([], SAM, [pair[0]])).toEqual({ otherId: undefined, otherName: 'Former member', canWrite: false });
  });

  it('allows no writes when a new person has joined an old ledger, and shows the old person as a former member', () => {
    const joined = [pair[0], { userId: 'u-new', displayName: 'Pat' }];
    expect(ledgerPair([entry()], SAM, joined)).toEqual({ otherId: ALEX, otherName: 'Former member', canWrite: false });
  });
});

describe('sectionsFor', () => {
  const view = (entries: MoneyEntry[], settled: string[] = [], showSettled = false) => sectionsFor(entries, SAM, new Set(settled), showSettled);

  it('puts what the other person added under Waiting for you, and what you added under Waiting for them', () => {
    const theirs = entry({ status: 'waiting', proposedBy: ALEX, paidBy: ALEX, agreedBy: undefined, agreedAt: undefined });
    const mine = entry({ status: 'waiting', agreedBy: undefined, agreedAt: undefined });
    const result = view([theirs, mine]);
    expect(result.waitingForMe).toEqual([theirs]);
    expect(result.waitingForOther).toEqual([mine]);
    expect(result.entries).toEqual([]);
  });

  it('counts a change request as waiting for the person who did not ask, and keeps the agreed entry in its own list too', () => {
    const asked = entry({ pendingChange: { id: 'r', by: ALEX, at: 1, delete: true } });
    expect(view([asked]).waitingForMe).toEqual([asked]);
    expect(view([asked]).entries).toEqual([asked]);
    const mineAsked = entry({ pendingChange: { id: 'r', by: SAM, at: 1, delete: true } });
    expect(view([mineAsked]).waitingForOther).toEqual([mineAsked]);
  });

  it('puts your declined entries under Needs another look, and the ones you declined in the entries', () => {
    const mine = entry({ status: 'declined', agreedBy: undefined, agreedAt: undefined });
    const theirs = entry({ status: 'declined', proposedBy: ALEX, paidBy: ALEX, agreedBy: undefined, agreedAt: undefined });
    const result = view([mine, theirs]);
    expect(result.needsLook).toEqual([mine]);
    expect(result.entries).toEqual([theirs]);
  });

  it('lists agreed loans apart, with progress shown up to the loan\'s amount and paid back marked', () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000, description: 'Rent shortfall' });
    const over = entry({ kind: 'payment', paidBy: ALEX, amountPence: 6000, sharePence: 6000, loanId: loan.id });
    const result = view([loan, over], [], true);
    expect(result.loans).toEqual([{ loan, progress: 5000, paidBack: true }]);
    expect(result.entries).toEqual([over]);
  });

  it('hides settled entries, and shows them with Show settled', () => {
    const old = entry({ on: '2026-10-01' });
    const fresh = entry({ on: '2026-11-15' });
    expect(view([old, fresh], [old.id]).entries).toEqual([fresh]);
    expect(view([old, fresh], [old.id], true).entries).toEqual([fresh, old]);
    expect(view([old, fresh], [old.id]).hidden).toBe(1);
    expect(view([old, fresh], [old.id], true).hidden).toBe(0);
  });

  it('hides a paid-back loan as settled, and shows it with Show settled', () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 });
    const result = view([loan], [loan.id]);
    expect(result.loans).toEqual([]);
    expect(result.hidden).toBe(1);
    expect(view([loan], [loan.id], true).loans).toHaveLength(1);
  });

  it('orders entries newest first by date, then by when they were added', () => {
    const a = entry({ on: '2026-11-10', createdAt: 5 });
    const b = entry({ on: '2026-11-12', createdAt: 1 });
    const c = entry({ on: '2026-11-12', createdAt: 9 });
    expect(view([a, b, c]).entries).toEqual([c, b, a]);
  });

  it('leaves deleted entries out of every list', () => {
    expect(view([entry({ deletedAt: 5, deletedBy: SAM })])).toMatchObject({ waitingForMe: [], waitingForOther: [], needsLook: [], loans: [], entries: [] });
  });
});

describe('openLoansFor', () => {
  it('lists agreed, live loans the sender borrowed that are not yet paid back', () => {
    const open = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 });
    const paid = entry({ kind: 'loan', amountPence: 1000, sharePence: 1000 });
    const payment = entry({ kind: 'payment', paidBy: ALEX, amountPence: 1000, sharePence: 1000, loanId: paid.id });
    const waiting = entry({ kind: 'loan', status: 'waiting', amountPence: 5000, sharePence: 5000 });
    const theirs = entry({ kind: 'loan', paidBy: ALEX, amountPence: 5000, sharePence: 5000 });
    const deleted = entry({ kind: 'loan', deletedAt: 3, amountPence: 5000, sharePence: 5000 });
    const all = [open, paid, payment, waiting, theirs, deleted, entry()];
    expect(openLoansFor(all, ALEX).map(loan => loan.id)).toEqual([open.id]);
    expect(openLoansFor(all, SAM).map(loan => loan.id)).toEqual([theirs.id]);
  });
});

describe('duplicatePayment', () => {
  const payment = (over: Partial<MoneyEntry> = {}) => entry({ kind: 'payment', paidBy: ALEX, amountPence: 2000, sharePence: 2000, ...over });

  it('finds a live payment with the same sender, amount and date, whatever its state', () => {
    for (const status of ['waiting', 'agreed', 'declined'] as const) {
      const existing = payment({ status });
      expect(duplicatePayment([existing], { paidBy: ALEX, amountPence: 2000, on: '2026-11-15' })).toEqual(existing);
    }
  });

  it('finds nothing for a different sender, amount, date or kind, or a deleted payment', () => {
    const list = [payment({ deletedAt: 5 }), payment({ paidBy: SAM }), payment({ amountPence: 2001 }), payment({ on: '2026-11-14' }), entry({ amountPence: 2000, paidBy: ALEX })];
    expect(duplicatePayment(list, { paidBy: ALEX, amountPence: 2000, on: '2026-11-15' })).toBeUndefined();
  });

  it('does not match the entry being edited', () => {
    const existing = payment();
    expect(duplicatePayment([existing], { paidBy: ALEX, amountPence: 2000, on: '2026-11-15' }, existing.id)).toBeUndefined();
  });
});

describe('useMoney', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    household.members = pair;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset().mockResolvedValue(served(entry()));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('loads the entries, and works out the total, the loans and the settled set from them', async () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 });
    request.mockResolvedValue(served(loan, entry()));
    const { result } = renderHook(() => useMoney(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(request).toHaveBeenCalledWith('/api/hh/money');
    expect(result.current.total).toEqual({ direction: 'toMe', pence: 8170 });
    expect(result.current.loans).toEqual([{ loan, progress: 0, paidBack: false }]);
    expect(result.current.other).toEqual({ userId: ALEX, name: 'Alex' });
    expect(result.current.canWrite).toBe(true);
    expect(result.current.me).toBe(SAM);
    expect(result.current.people).toEqual({ meId: SAM, meName: 'Sam', otherId: ALEX, otherName: 'Alex' });
    expect(result.current.unsaved).toBe(0);
  });

  it('reports an error when the first load fails', async () => {
    request.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useMoney(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('counts the pending money writes as unsaved changes, names their entries, and moves the total with them', async () => {
    const waiting = entry({ status: 'waiting', version: 1, proposedBy: ALEX, paidBy: ALEX, agreedBy: undefined, agreedAt: undefined });
    request.mockResolvedValue(served(waiting));
    const { result } = renderHook(() => useMoney(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.total.direction).toBe('square');
    act(() => {
      new MutationObserver(client, { mutationKey: moneyMutationKeys.moneyRespond, mutationFn: () => new Promise(() => undefined) })
        .mutate({ mutationId: 'm1', at: NOW, by: SAM, entryId: waiting.id, response: 'agree', version: 1 } as never);
      new MutationObserver(client, { mutationKey: ['household', 'itemTick'], mutationFn: () => new Promise(() => undefined) }).mutate({ mutationId: 'm2' } as never);
    });
    await waitFor(() => expect(result.current.unsaved).toBe(1));
    expect(result.current.unsavedIds.has(waiting.id)).toBe(true);
    expect(result.current.total).toEqual(computeTotal([{ ...waiting, status: 'agreed' }], SAM, ALEX));
    expect(result.current.total.direction).toBe('fromMe');
  });

  it('keeps a pending write on screen when a refetch without it comes back', async () => {
    const { result } = renderHook(() => useMoney(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const id = result.current.entries[0].id;
    act(() => {
      new MutationObserver(client, { mutationKey: moneyMutationKeys.moneyEdit, mutationFn: () => new Promise(() => undefined) })
        .mutate({ mutationId: 'm1', at: NOW, by: SAM, entryId: id, description: 'Shop' } as never);
    });
    await waitFor(() => expect(result.current.entries[0].description).toBe('Shop'));
    await act(async () => { await client.refetchQueries({ queryKey: MONEY_KEY }); });
    expect(result.current.entries[0].description).toBe('Shop');
  });

  it('discards a response whose request started before a household write settled', async () => {
    const { result } = renderHook(() => useMoney(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let release!: (data: MoneyData) => void;
    request.mockImplementationOnce(() => new Promise<MoneyData>(resolve => { release = resolve; }));
    const refetching = act(async () => { await client.refetchQueries({ queryKey: MONEY_KEY }); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    noteMutationSettled();
    release(served());
    await refetching;
    expect(result.current.entries).toHaveLength(1);
  });

  it('shows Former member for an other person who has left, and allows no writes', async () => {
    household.members = [pair[0]];
    const { result } = renderHook(() => useMoney(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.other).toEqual({ userId: ALEX, name: 'Former member' });
    expect(result.current.canWrite).toBe(false);
    expect(result.current.total).toEqual({ direction: 'toMe', pence: 3170 });
  });
});
