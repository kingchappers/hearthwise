import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Task } from '../../../src/tasks/types';
import type { TasksData } from '../overlay';

const request = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { name: 'Home', timezone: 'Europe/London', createdBy: 'a', createdAt: '', memberCount: 2 }, members: [], me: { userId: 'auth0|me' } } }),
}));

import { noteMutationSettled, TASKS_KEY, useTasks } from '../queries';

const NOW = Date.parse('2026-11-13T10:00:00.000Z');
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Hoover', fieldTimes: {}, assignee: 'either', repeat: { type: 'after', days: 1 }, dueOn: '2026-11-12', cycleSeq: 1, ruleVersion: 1,
  checklist: [{ id: 's1', text: 'Stairs' }], checklistState: {}, status: 'open', createdBy: 'auth0|me', updatedAt: 1, ...over,
});
const served = (tasks: Task[] = [task()]): TasksData => ({ tasks, proposals: [], serverTime: NOW });

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  // Only the clock: Testing Library's waitFor and TanStack's own scheduling need the real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  request.mockReset().mockResolvedValue(served());
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const pendingTick = () => {
  const observer = new MutationObserver(client, { mutationKey: ['household', 'tick'], mutationFn: () => new Promise(() => undefined) });
  observer.mutate({ mutationId: 'm1', at: NOW, by: 'auth0|me', taskId: 't1', cycleSeq: 1, stepId: 's1', done: true } as never);
};

describe('useTasks', () => {
  it('loads the tasks and works out today in the household\'s zone', async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.today).toBe('2026-11-13');
    expect(request).toHaveBeenCalledWith('/api/hh/tasks');
  });

  it('keeps a pending tick on screen when a refetch that does not include it comes back', async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => pendingTick());
    await waitFor(() => expect(result.current.tasks[0].checklistState.s1?.done).toBe(true));
    await act(async () => { await client.refetchQueries({ queryKey: TASKS_KEY }); });
    expect(result.current.tasks[0].checklistState.s1?.done).toBe(true);
  });

  it('goes on polling every 10 seconds while a write is pending', async () => {
    // This one needs the interval under its control; the others do not.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    renderHook(() => useTasks(), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(request).toHaveBeenCalledTimes(1);
    act(() => pendingTick());
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('discards a response whose request started before a household write settled', async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let release!: (data: TasksData) => void;
    request.mockImplementationOnce(() => new Promise<TasksData>(resolve => { release = resolve; }));
    const refetching = act(async () => { await client.refetchQueries({ queryKey: TASKS_KEY }); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    noteMutationSettled();
    release(served([task({ title: 'From before the write' })]));
    await refetching;

    expect(result.current.tasks[0].title).toBe('Hoover');
  });

  it('shows the error state, with nothing, when the first load fails', async () => {
    request.mockReset().mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.tasks).toEqual([]);
  });
});
