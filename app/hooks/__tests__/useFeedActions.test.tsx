import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '~/lib/apiError';

const request = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));

import { useFeedActions } from '../useFeedActions';

const LINK = 'https://calendar.google.com/calendar/ical/SENTINEL-SECRET/basic.ics';
const ID = '11111111-1111-4111-8111-111111111111';

describe('useFeedActions', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    request.mockReset().mockResolvedValue({ feed: { id: ID } });
  });
  afterEach(() => vi.restoreAllMocks());

  it('adds a feed with one POST carrying the link in the body only, then reads the windows again', async () => {
    const refetch = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useFeedActions(), { wrapper });
    await act(async () => { await result.current.add({ id: ID, link: LINK, label: 'Work', share: 'busy' }); });
    expect(request).toHaveBeenCalledTimes(1);
    const [path, options] = request.mock.calls[0] as [string, { method: string; body: string }];
    expect(path).toBe('/api/hh/calendar/feeds');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ id: ID, link: LINK, label: 'Work', share: 'busy' });
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['calendar-imported'] });
  });

  it('keeps no link in the cache once it is done, so no saved copy can hold one', async () => {
    const { result } = renderHook(() => useFeedActions(), { wrapper });
    await act(async () => { await result.current.add({ id: ID, link: LINK, label: 'Work', share: 'busy' }); });
    expect(JSON.stringify(client.getMutationCache().getAll().map(mutation => mutation.state))).not.toContain('SENTINEL');
  });

  it('answers a refusal in the design\'s words and never repeats the code or the link', async () => {
    request.mockRejectedValue(new ApiError(422, 'Unprocessable', 'feed_failed', { detail: 'not_supported' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useFeedActions(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.add>> | undefined;
    await act(async () => { outcome = await result.current.add({ id: ID, link: LINK, label: 'Work', share: 'busy' }); });
    expect(outcome).toEqual({ ok: false, message: 'We can read links from Google, Outlook, Apple and Proton calendars.' });
    expect(JSON.stringify(outcome)).not.toContain('SENTINEL');
  });

  it('says something kind when the server cannot be reached', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useFeedActions(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.refresh>> | undefined;
    await act(async () => { outcome = await result.current.refresh(ID); });
    expect(outcome).toEqual({ ok: false, message: 'We could not do that. Please try again.' });
  });

  it('replaces, renames, changes visibility, refreshes and removes by the feed\'s own path, each with one mutation id', async () => {
    const { result } = renderHook(() => useFeedActions(), { wrapper });
    await act(async () => {
      await result.current.replace(ID, LINK);
      await result.current.edit(ID, { label: 'Rota', share: 'details' });
      await result.current.refresh(ID);
      await result.current.remove(ID);
    });
    const calls = request.mock.calls as [string, { method: string; body: string }][];
    expect(calls.map(([path, options]) => `${options.method} ${path}`)).toEqual([
      `POST /api/hh/calendar/feeds/${ID}/replace`, `PATCH /api/hh/calendar/feeds/${ID}`, `POST /api/hh/calendar/feeds/${ID}/refresh`, `DELETE /api/hh/calendar/feeds/${ID}`,
    ]);
    expect(Object.keys(JSON.parse(calls[0][1].body)).sort()).toEqual(['link', 'replaceId']);
    expect(JSON.parse(calls[1][1].body)).toMatchObject({ label: 'Rota', share: 'details' });
    for (const [, options] of calls.slice(1)) expect(JSON.parse(options.body).mutationId).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
  });
});
