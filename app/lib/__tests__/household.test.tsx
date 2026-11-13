import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '../apiError';

const request = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));

import { useAcceptInvite, useCreateHousehold, useCreateInvite, useHousehold, useRemoveMember, useRevokeInvite, useUpdateMe } from '../household';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 1 }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOUSEHOLD = {
  household: { name: 'Home', timezone: 'Europe/London', createdBy: 'a', createdAt: '2026-11-13T00:00:00Z', memberCount: 1 },
  members: [{ userId: 'a', displayName: 'Ann', joinedAt: '2026-11-13T00:00:00Z' }],
  me: { userId: 'a', displayName: 'Ann', joinedAt: '2026-11-13T00:00:00Z', settings: {} },
};

beforeEach(() => {
  request.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useHousehold', () => {
  it('is loading until the server answers', () => {
    request.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHousehold(), { wrapper });
    expect(result.current.status).toBe('loading');
  });

  it('is ready with the household when the server answers 200', async () => {
    request.mockResolvedValue(HOUSEHOLD);
    const { result } = renderHook(() => useHousehold(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data?.household.name).toBe('Home');
    expect(request).toHaveBeenCalledWith('/api/hh');
  });

  it('is none when the server answers 403 no_household, without retrying', async () => {
    request.mockRejectedValue(new ApiError(403, 'Forbidden', 'no_household'));
    const { result } = renderHook(() => useHousehold(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('is error, never none, when the network fails, so nobody is sent to create a second household', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useHousehold(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('is error for a 403 that is not no_household', async () => {
    request.mockRejectedValue(new ApiError(403, 'Forbidden', 'forbidden'));
    const { result } = renderHook(() => useHousehold(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});

describe('the household mutations', () => {
  it('send a fresh mutation id each time', async () => {
    request.mockResolvedValue({ householdId: 'h' });
    const { result } = renderHook(() => useCreateHousehold(), { wrapper });
    await result.current.mutateAsync({ name: 'A', displayName: 'B', timezone: 'UTC' });
    await result.current.mutateAsync({ name: 'A', displayName: 'B', timezone: 'UTC' });
    const ids = request.mock.calls.map(call => JSON.parse(call[1].body).mutationId);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('create posts the typed values', async () => {
    request.mockResolvedValue({ householdId: 'h' });
    const { result } = renderHook(() => useCreateHousehold(), { wrapper });
    await result.current.mutateAsync({ name: 'Home', displayName: 'Ann', timezone: 'Europe/London' });
    const [path, init] = request.mock.calls[0];
    expect(path).toBe('/api/households');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Home', displayName: 'Ann', timezone: 'Europe/London', mutationId: expect.stringMatching(UUID) });
  });

  it('accept posts the token, the name and the move confirmation', async () => {
    request.mockResolvedValue({ householdId: 'h' });
    const { result } = renderHook(() => useAcceptInvite(), { wrapper });
    await result.current.mutateAsync({ token: 'T'.repeat(43), displayName: 'Bea', confirmMove: true });
    const [path, init] = request.mock.calls[0];
    expect(path).toBe('/api/invites/accept');
    expect(JSON.parse(init.body)).toEqual({ token: 'T'.repeat(43), displayName: 'Bea', confirmMove: true, mutationId: expect.stringMatching(UUID) });
  });

  it('create-invite returns the link once', async () => {
    request.mockResolvedValue({ link: 'https://x/join#t', expiresAt: 1, hash: 'h' });
    const { result } = renderHook(() => useCreateInvite(), { wrapper });
    const created = await result.current.mutateAsync();
    expect(created.link).toBe('https://x/join#t');
    const [path, init] = request.mock.calls[0];
    expect(path).toBe('/api/hh/invites');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ mutationId: expect.stringMatching(UUID) });
  });

  it('revoke deletes the invite by its hash', async () => {
    request.mockResolvedValue(null);
    const { result } = renderHook(() => useRevokeInvite(), { wrapper });
    await result.current.mutateAsync('f'.repeat(64));
    const [path, init] = request.mock.calls[0];
    expect(path).toBe(`/api/hh/invites/${'f'.repeat(64)}`);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ mutationId: expect.stringMatching(UUID) });
  });

  it('remove encodes the member id', async () => {
    request.mockResolvedValue(null);
    const { result } = renderHook(() => useRemoveMember(), { wrapper });
    await result.current.mutateAsync('auth0|abc');
    const [path, init] = request.mock.calls[0];
    expect(path).toBe('/api/hh/members/auth0%7Cabc');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ mutationId: expect.stringMatching(UUID) });
  });

  it('update-me patches /members/me', async () => {
    request.mockResolvedValue({ me: {} });
    const { result } = renderHook(() => useUpdateMe(), { wrapper });
    await result.current.mutateAsync({ displayName: 'Ann B' });
    const [path, init] = request.mock.calls[0];
    expect(path).toBe('/api/hh/members/me');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ displayName: 'Ann B', mutationId: expect.stringMatching(UUID) });
  });
});

describe('after joining', () => {
  it('has the household loaded by the time accept returns, even though nothing was watching it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    // The person had no household, and left the page that watched this query (the join page is outside the gate).
    let calls = 0;
    const queryFn = async () => {
      calls += 1;
      if (calls === 1) throw new ApiError(403, 'Forbidden', 'no_household');
      return HOUSEHOLD;
    };
    await client.prefetchQuery({ queryKey: ['household'], queryFn });
    expect(client.getQueryState(['household'])?.status).toBe('error');
    request.mockImplementation(async (path: string) => (path === '/api/hh' ? HOUSEHOLD : { householdId: 'h' }));

    const { result } = renderHook(() => useAcceptInvite(), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await result.current.mutateAsync({ token: 'T'.repeat(43), displayName: 'Bea' });

    expect(client.getQueryState(['household'])?.status).toBe('success');
  });
});
