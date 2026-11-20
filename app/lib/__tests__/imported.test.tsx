import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import type { ImportedData } from '../../../src/calendar/types';

const request = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));
vi.mock('../household', async importOriginal => ({
  ...(await importOriginal<typeof import('../household')>()),
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'Europe/London' }, members: [], me: { userId: 'u-sam', displayName: 'Sam' } } }),
}));

import { importedWindow, useImported } from '../imported';

const NOW = Date.parse('2026-11-18T10:00:00.000Z');
const served: ImportedData = {
  occurrences: [{ feedId: 'f1', owner: 'Sam', title: 'Standup', allDay: false, startMs: NOW, endMs: NOW + 1_800_000 }],
  feeds: [{ id: 'f1', label: 'Work', owner: 'Sam', mine: true, share: 'busy', status: 'ok', fetchedAt: NOW - 60_000, host: 'calendar.google.com' }],
  serverTime: NOW,
};

describe('importedWindow', () => {
  it('is 42 days, from the Monday before the day, minus a week, so a week of browsing reads one window', () => {
    expect(importedWindow('2026-11-18')).toEqual({ from: '2026-11-09', to: '2026-12-20' });
    expect(importedWindow('2026-11-16')).toEqual(importedWindow('2026-11-22'));
  });
});

describe('useImported', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset().mockResolvedValue(served);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('reads the window for the day from the imported route', async () => {
    const { result } = renderHook(() => useImported('2026-11-18'), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(request).toHaveBeenCalledWith('/api/hh/calendar/imported?from=2026-11-09&to=2026-12-20');
    expect(result.current.occurrences).toHaveLength(1);
    expect(result.current.feeds.map(feed => feed.id)).toEqual(['f1']);
    expect(result.current.updatedAt).toBe(NOW);
  });

  it('says the day is saved while its window is, and not when it is outside every saved window', async () => {
    const { result, rerender } = renderHook(({ day }) => useImported(day), { wrapper, initialProps: { day: '2026-11-18' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.covers('2026-12-20')).toBe(true);
    expect(result.current.covers('2026-12-21')).toBe(false);
    request.mockRejectedValue(new Error('offline'));
    rerender({ day: '2027-03-01' });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.occurrences).toEqual([]);
    expect(result.current.covers('2027-03-01')).toBe(false);
  });

  it('keeps showing the last window when a refresh fails', async () => {
    const { result } = renderHook(() => useImported('2026-11-18'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    request.mockRejectedValue(new Error('offline'));
    await client.refetchQueries();
    expect(result.current.status).toBe('ready');
    expect(result.current.occurrences).toHaveLength(1);
  });

  it('saves a window with no link in it: a feed is added online only, so its link never reaches the cache', async () => {
    const { result } = renderHook(() => useImported('2026-11-18'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(JSON.stringify(dehydrate(client))).not.toMatch(/https?:|webcal:|ical|\.ics/i);
  });
});
