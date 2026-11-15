import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MoneyEntry } from '../../../src/money/types';

const calls = vi.hoisted(() => [] as { kind: string; vars: Record<string, unknown> }[]);
const show = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@mantine/notifications', () => ({ notifications: { show, hide: vi.fn() } }));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'Europe/London' }, members: [], me: { userId: 'u-sam', displayName: 'Sam', joinedAt: '', settings: {} } } }),
}));
vi.mock('~/lib/letThemKnow', () => ({ notifyFields: () => ({ notify: true }) }));
vi.mock('~/lib/mutations', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/mutations')>()),
  useMoneyMutation: (kind: string) => ({ mutate: (vars: Record<string, unknown>) => { calls.push({ kind, vars }); } }),
}));

import { useMoneyActions } from '../useMoneyActions';

const entry = (over: Partial<MoneyEntry> = {}): MoneyEntry => ({
  id: 'e1', kind: 'expense', paidBy: 'u-sam', amountPence: 6340, sharePence: 3170, description: 'Weekly shop', on: '2026-11-15', fieldTimes: {}, status: 'agreed',
  version: 4, createdBy: 'u-sam', createdAt: 1, proposedBy: 'u-sam', agreedAt: 2, agreedBy: 'u-alex', updatedAt: 2, updatedBy: 'u-alex', ...over,
});
const money = { paidBy: 'u-sam', amountPence: 3640, sharePence: 1820 };

beforeEach(() => { calls.length = 0; show.mockClear(); navigate.mockClear(); });

describe('useMoneyActions', () => {
  it('adds with the id and mutation id the sheet made when it opened, so a second tap is the same write', () => {
    const { result } = renderHook(() => useMoneyActions());
    const input = { id: 'new-id', mutationId: 'sheet-mutation', kind: 'loan' as const, description: 'Rent', on: '2026-11-15', money: { paidBy: 'u-sam', amountPence: 5000, sharePence: 5000 } };
    result.current.add(input);
    result.current.add(input);
    expect(calls).toHaveLength(2);
    expect(calls[0].kind).toBe('moneyAdd');
    expect(calls[0].vars).toMatchObject({ mutationId: 'sheet-mutation', by: 'u-sam', notify: true, entry: { id: 'new-id', kind: 'loan', description: 'Rent', on: '2026-11-15', paidBy: 'u-sam', amountPence: 5000 } });
    expect(calls[1].vars.mutationId).toBe('sheet-mutation');
    expect(calls[0].vars.at).toBeTypeOf('number');
  });

  it('edits with the version the person saw, and sends nothing when nothing changed', () => {
    const { result } = renderHook(() => useMoneyActions());
    result.current.edit(entry({ status: 'waiting', version: 2 }), { money, description: 'Shop' });
    expect(calls[0]).toMatchObject({ kind: 'moneyEdit', vars: { entryId: 'e1', money, baseVersion: 2, description: 'Shop' } });
    result.current.edit(entry(), { description: 'Only words' });
    expect(calls[1].vars).toMatchObject({ entryId: 'e1', description: 'Only words' });
    expect(calls[1].vars.baseVersion).toBeUndefined();
    result.current.edit(entry(), {});
    expect(calls).toHaveLength(2);
  });

  it('responds with the version the person saw', () => {
    const { result } = renderHook(() => useMoneyActions());
    result.current.respond(entry({ status: 'waiting', version: 3 }), 'decline');
    expect(calls[0]).toMatchObject({ kind: 'moneyRespond', vars: { entryId: 'e1', response: 'decline', version: 3, notify: true } });
  });

  it('asks for a change or a delete against the version seen', () => {
    const { result } = renderHook(() => useMoneyActions());
    result.current.askChange(entry(), { money });
    result.current.askChange(entry(), { delete: true });
    expect(calls[0]).toMatchObject({ kind: 'moneyChange', vars: { entryId: 'e1', version: 4, money } });
    expect(calls[1]).toMatchObject({ kind: 'moneyChange', vars: { entryId: 'e1', version: 4, delete: true } });
  });

  it('answers or withdraws a request by its id', () => {
    const { result } = renderHook(() => useMoneyActions());
    const asked = entry({ pendingChange: { id: 'req-1', by: 'u-alex', at: 1, delete: true } });
    result.current.respondChange(asked, 'agree');
    result.current.withdrawChange(asked);
    expect(calls[0]).toMatchObject({ kind: 'moneyChangeRespond', vars: { entryId: 'e1', response: 'agree', requestId: 'req-1' } });
    expect(calls[1]).toMatchObject({ kind: 'moneyChangeWithdraw', vars: { entryId: 'e1', requestId: 'req-1' } });
  });

  it('does nothing for a response or a withdrawal when there is no request', () => {
    const { result } = renderHook(() => useMoneyActions());
    result.current.respondChange(entry(), 'agree');
    result.current.withdrawChange(entry());
    expect(calls).toEqual([]);
  });

  it('deletes, says so, and goes back to the list', () => {
    const { result } = renderHook(() => useMoneyActions());
    result.current.remove(entry({ status: 'waiting' }));
    expect(calls[0]).toMatchObject({ kind: 'moneyDelete', vars: { entryId: 'e1' } });
    expect(show.mock.calls.at(-1)![0].message).toBe('Deleted: Weekly shop');
    expect(navigate).toHaveBeenCalledWith('/money');
  });

  it('restores with the deletion it saw', () => {
    const { result } = renderHook(() => useMoneyActions());
    result.current.restore(entry({ deletedAt: 77 }));
    expect(calls[0]).toMatchObject({ kind: 'moneyRestore', vars: { entries: [{ id: 'e1', deletedAt: 77 }] } });
    expect(show.mock.calls.at(-1)![0].message).toBe('Restored: Weekly shop. It waits for the other person to agree.');
  });

  it('does not restore an entry that is not deleted', () => {
    const { result } = renderHook(() => useMoneyActions());
    result.current.restore(entry());
    expect(calls).toEqual([]);
  });
});
