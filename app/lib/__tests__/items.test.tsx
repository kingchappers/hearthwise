import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ShoppingItem } from '../../../src/shopping/types';
import type { Task } from '../../../src/tasks/types';
import { deletedEntries } from '../deleted';
import type { ItemsData } from '../itemOverlay';

const request = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));

import { ITEMS_KEY, sortItems, useItems } from '../items';
import { noteMutationSettled } from '../queries';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: 'i1', text: 'Milk', ticked: false, fieldTimes: { text: 1 }, updatedAt: 1, ...over });
const served = (items: ShoppingItem[] = [item()]): ItemsData => ({ items, serverTime: NOW });

describe('sortItems', () => {
  it('puts unticked items first and ticked ones last, each by name, and leaves out deleted ones', () => {
    const sorted = sortItems([
      item({ id: 'a', text: 'Bread', ticked: true }), item({ id: 'b', text: 'Eggs' }), item({ id: 'c', text: 'Apples' }),
      item({ id: 'd', text: 'Cheese', ticked: true }), item({ id: 'e', text: 'Gone', deletedAt: 5 }),
    ]);
    expect(sorted.map(entry => entry.text)).toEqual(['Apples', 'Eggs', 'Bread', 'Cheese']);
  });
});

describe('deletedEntries', () => {
  const task = (id: string, deletedAt?: number): Task => ({
    id, title: id, fieldTimes: {}, assignee: 'either', repeat: { type: 'none' }, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {}, status: 'open',
    createdBy: 'u', updatedAt: 1, ...(deletedAt === undefined ? {} : { deletedAt }),
  });

  it('groups deleted tasks and deleted items, each newest first, leaving out what is not deleted', () => {
    const groups = deletedEntries([task('t1', 100), task('t2', 300), task('t3')], [item({ id: 'i1', deletedAt: 200 }), item({ id: 'i2', deletedAt: 400 }), item({ id: 'i3' })]);
    expect(groups.tasks.map(entry => entry.id)).toEqual(['t2', 't1']);
    expect(groups.items.map(entry => entry.id)).toEqual(['i2', 'i1']);
  });
});

describe('useItems', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset().mockResolvedValue(served());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('loads the items', async () => {
    const { result } = renderHook(() => useItems(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('/api/hh/items');
  });

  it('keeps a pending tick on screen when a refetch without it comes back', async () => {
    const { result } = renderHook(() => useItems(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      new MutationObserver(client, { mutationKey: ['household', 'itemTick'], mutationFn: () => new Promise(() => undefined) })
        .mutate({ mutationId: 'm1', at: NOW, by: 'auth0|me', itemId: 'i1', done: true } as never);
    });
    await waitFor(() => expect(result.current.items[0].ticked).toBe(true));
    await act(async () => { await client.refetchQueries({ queryKey: ITEMS_KEY }); });
    expect(result.current.items[0].ticked).toBe(true);
  });

  it('discards a response whose request started before a household write settled', async () => {
    const { result } = renderHook(() => useItems(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let release!: (data: ItemsData) => void;
    request.mockImplementationOnce(() => new Promise<ItemsData>(resolve => { release = resolve; }));
    const refetching = act(async () => { await client.refetchQueries({ queryKey: ITEMS_KEY }); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    noteMutationSettled();
    release(served([item({ text: 'From before the write' })]));
    await refetching;
    expect(result.current.items[0].text).toBe('Milk');
  });

  it('shows the error state when the first load fails', async () => {
    request.mockReset().mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useItems(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.items).toEqual([]);
  });
});
