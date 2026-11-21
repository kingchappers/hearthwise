import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BusyView, EventsData, EventView, ImportedData } from '../../../src/calendar/types';

const request = vi.hoisted(() => vi.fn());
const tasks = vi.hoisted(() => ({ value: { status: 'ready', tasks: [] as object[], proposals: [], today: '2026-11-15', refetch: vi.fn() } }));
const plan = vi.hoisted(() => ({ value: { status: 'ready', days: [] as object[], today: '2026-11-15', recipes: undefined, recipesCheckedAt: undefined, refetch: vi.fn() } }));
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));
vi.mock('../household', async importOriginal => ({
  ...(await importOriginal<typeof import('../household')>()),
  useHousehold: () => ({
    status: 'ready', refetch: vi.fn(),
    data: { household: { timezone: 'Europe/London' }, members: [{ userId: 'u-sam', displayName: 'Sam' }, { userId: 'u-alex', displayName: 'Alex' }], me: { userId: 'u-sam', displayName: 'Sam' } },
  }),
}));
vi.mock('../queries', async importOriginal => ({ ...(await importOriginal<typeof import('../queries')>()), useTasks: () => tasks.value }));
vi.mock('../plan', async importOriginal => ({ ...(await importOriginal<typeof import('../plan')>()), usePlan: () => plan.value }));

import { CALENDAR_KEY, calendarMutationKeys } from '../calendarKeys';
import { noteMutationSettled } from '../queries';
import { useCalendar, useTimelineSources } from '../calendar';

const SAM = 'u-sam';
const NOW = Date.parse('2026-11-15T10:00:00.000Z');
const NONE = { type: 'none' as const };
const event = (id: string, over: Partial<EventView> = {}): EventView => ({
  id, kind: 'event', title: id, who: 'both', private: false, startOn: '2026-11-16', allDay: false, startTime: '10:00', durationMin: 60, repeat: NONE, skipOn: [],
  reminders: {}, fieldTimes: {}, createdBy: SAM, createdAt: 1, updatedAt: 1, updatedBy: SAM, ...over,
});
const served = (events: EventsData['events'], deleted: EventView[] = []): EventsData => ({ events, deleted, serverTime: NOW });

describe('useCalendar', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset().mockResolvedValue(served([event('a')]));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('loads the events from the calendar route, with who and when in the household zone', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(request).toHaveBeenCalledWith('/api/hh/calendar');
    expect(result.current.events.map(item => item.id)).toEqual(['a']);
    expect(result.current.me).toBe(SAM);
    expect(result.current.timezone).toBe('Europe/London');
    expect(result.current.members).toHaveLength(2);
    expect(result.current.today).toBe('2026-11-15');
    expect(result.current.unsaved).toBe(0);
  });

  it('reports an error when the first load fails', async () => {
    request.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('lays a pending write over the list, counts it as unsaved and names its event', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      new MutationObserver(client, { mutationKey: calendarMutationKeys.editEvent, mutationFn: () => new Promise(() => undefined) })
        .mutate({ mutationId: 'm1', at: NOW, by: SAM, eventId: 'a', title: 'Renamed' } as never);
      new MutationObserver(client, { mutationKey: ['household', 'itemTick'], mutationFn: () => new Promise(() => undefined) }).mutate({ mutationId: 'm2' } as never);
    });
    await waitFor(() => expect(result.current.unsaved).toBe(1));
    expect(result.current.events[0]).toMatchObject({ title: 'Renamed' });
    expect(result.current.serverEvents[0]).toMatchObject({ title: 'a' });
    expect(result.current.unsavedIds.has('a')).toBe(true);
  });

  it('names the events a pending add and a pending restore are about', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      new MutationObserver(client, { mutationKey: calendarMutationKeys.createEvent, mutationFn: () => new Promise(() => undefined) }).mutate({
        mutationId: 'm1', at: NOW, by: SAM,
        event: { id: 'new', kind: 'event', title: 'Walk', schedule: { startOn: '2026-11-16', allDay: true, repeat: NONE, skipOn: [] }, people: { who: 'both', private: false } },
      } as never);
      new MutationObserver(client, { mutationKey: calendarMutationKeys.eventRestore, mutationFn: () => new Promise(() => undefined) })
        .mutate({ mutationId: 'm2', at: NOW, by: SAM, entries: [{ id: 'old', deletedAt: 5 }] } as never);
    });
    await waitFor(() => expect(result.current.unsaved).toBe(2));
    expect([...result.current.unsavedIds].sort()).toEqual(['new', 'old']);
  });

  it('keeps a pending write on screen when a refetch without it comes back', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      new MutationObserver(client, { mutationKey: calendarMutationKeys.editEvent, mutationFn: () => new Promise(() => undefined) })
        .mutate({ mutationId: 'm1', at: NOW, by: SAM, eventId: 'a', title: 'Renamed' } as never);
    });
    await waitFor(() => expect(result.current.events[0].busy === true ? '' : (result.current.events[0] as EventView).title).toBe('Renamed'));
    await act(async () => { await client.refetchQueries({ queryKey: CALENDAR_KEY }); });
    expect((result.current.events[0] as EventView).title).toBe('Renamed');
  });

  it('discards a response whose request started before a household write settled', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let release!: (data: EventsData) => void;
    request.mockImplementationOnce(() => new Promise<EventsData>(resolve => { release = resolve; }));
    const refetching = act(async () => { await client.refetchQueries({ queryKey: CALENDAR_KEY }); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    noteMutationSettled();
    release(served([]));
    await refetching;
    expect(result.current.events).toHaveLength(1);
  });
});

describe('useTimelineSources', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const busy: BusyView = { id: 'p', busy: true, owner: 'Alex', startOn: '2026-11-16', allDay: false, startTime: '17:00', durationMin: 60, repeat: NONE, skipOn: [] };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset().mockResolvedValue(served([event('a'), busy]));
  });
  afterEach(() => vi.useRealTimers());

  it('gives each day its events, the tasks and the dinner for it, with the recipe\'s own title', async () => {
    plan.value = {
      ...plan.value,
      days: [{ day: '2026-11-16', meal: { title: 'Chilli' }, fieldTimes: {}, updatedAt: 1, updatedBy: SAM }],
    };
    tasks.value = { ...tasks.value, tasks: [{ id: 't', title: 'Bins', fieldTimes: {}, assignee: SAM, repeat: NONE, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {}, status: 'open', createdBy: SAM, updatedAt: 1, dueOn: '2026-11-16' }] };
    const { result } = renderHook(() => useTimelineSources(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const inputs = result.current.inputsFor('2026-11-16');
    expect(inputs.events.map(item => item.id)).toEqual(['a', 'p']);
    expect(inputs.tasks).toHaveLength(1);
    expect(inputs.dinner).toEqual({ title: 'Chilli' });
    expect(result.current.inputsFor('2026-11-17').dinner).toBeUndefined();
  });

  it('gives the timeline the household\'s projects from the light read, so no step counts are polled', async () => {
    const project = { id: 'p1', title: 'Take down the decking', status: 'active', plannedOn: '2026-11-16', fieldTimes: {}, createdBy: SAM, createdAt: 1, updatedAt: 1, updatedBy: SAM };
    request.mockImplementation(async (path: string) => (path.startsWith('/api/hh/projects') ? { projects: [project], deleted: [], serverTime: NOW } : served([event('a')])));
    const { result } = renderHook(() => useTimelineSources(), { wrapper });
    await waitFor(() => expect(result.current.inputsFor('2026-11-16').projects).toHaveLength(1));
    expect(result.current.inputsFor('2026-11-16').projects?.[0]).toMatchObject({ id: 'p1', plannedOn: '2026-11-16' });
    expect(request).toHaveBeenCalledWith('/api/hh/projects?counts=0');
    expect(request).not.toHaveBeenCalledWith('/api/hh/projects');
  });

  it('is loading while the calendar loads, and an error when it cannot', async () => {
    request.mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useTimelineSources(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  const IMPORTED: ImportedData = {
    occurrences: [{ feedId: 'f1', owner: 'Sam', title: 'Standup', allDay: false, startMs: NOW, endMs: NOW + 1_800_000 }],
    feeds: [{ id: 'f1', label: 'Work', owner: 'Sam', mine: true, share: 'busy', status: 'ok', fetchedAt: NOW }],
    serverTime: NOW,
  };
  const route = (imported: () => Promise<unknown>) => request.mockImplementation(async (path: string) => (path.includes('/imported') ? imported() : served([event('a')])));

  it('gives the timeline the imported items of the day\'s window, their feeds and the household zone', async () => {
    route(async () => IMPORTED);
    const { result } = renderHook(() => useTimelineSources('2026-11-15'), { wrapper });
    await waitFor(() => expect(result.current.imported.status).toBe('ready'));
    const inputs = result.current.inputsFor('2026-11-15');
    expect(inputs.imported).toHaveLength(1);
    expect(inputs.feeds?.map(feed => feed.id)).toEqual(['f1']);
    expect(inputs.timezone).toBe('Europe/London');
    expect(request).toHaveBeenCalledWith('/api/hh/calendar/imported?from=2026-11-02&to=2026-12-13');
  });

  it('shows the events whatever the imported window does: it is never a reason to hide them', async () => {
    route(async () => { throw new Error('down'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useTimelineSources('2026-11-15'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.imported.status).toBe('error'));
    expect(result.current.status).toBe('ready');
    expect(result.current.inputsFor('2026-11-16').events).toHaveLength(1);
  });
});
