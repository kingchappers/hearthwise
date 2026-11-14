import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';

const calls = vi.hoisted(() => [] as string[]);
const logout = vi.hoisted(() => vi.fn());
vi.mock('~/lib/auth', () => ({ useAuth: () => ({ logout }) }));
vi.mock('~/lib/householdRuntime', () => ({ useHouseholdRuntime: () => ({ runtime: { seal: vi.fn() }, restored: true, cacheUserId: 'auth0|me' }) }));
vi.mock('~/lib/persistedCache', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/persistedCache')>()),
  signOutCleanup: vi.fn(async () => { calls.push('cleanup'); }),
}));

import { cancelSignOut, requestSignOut } from '../signOut';
import { SignOutDialog } from '../../components/layout/SignOutDialog';

let client: QueryClient;
const queue = (id: string) => new MutationObserver(client, { mutationKey: ['household', 'itemTick'], mutationFn: () => new Promise(() => undefined) }).mutate({ mutationId: id } as never);
const renderDialog = () => render(<MantineProvider env="test"><QueryClientProvider client={client}><SignOutDialog /></QueryClientProvider></MantineProvider>);

beforeEach(() => {
  client = new QueryClient();
  calls.length = 0;
  logout.mockReset().mockImplementation(async () => { calls.push('logout'); });
  cancelSignOut();
});

describe('signing out', () => {
  it('signs out at once when nothing is waiting to be saved, clearing the cache first', async () => {
    renderDialog();
    act(() => requestSignOut());
    await waitFor(() => expect(calls).toEqual(['cleanup', 'logout']));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks first when changes are waiting, and says how many would be lost', async () => {
    renderDialog();
    act(() => { void queue('m1'); void queue('m2'); void queue('m3'); });
    act(() => requestSignOut());
    const dialog = await screen.findByRole('dialog', { name: 'Sign out?' });
    expect(dialog).toHaveTextContent("3 changes haven't been saved yet");
    expect(calls).toEqual([]);
  });

  it('says it in the singular for one change', async () => {
    renderDialog();
    act(() => { void queue('m1'); });
    act(() => requestSignOut());
    expect(await screen.findByRole('dialog')).toHaveTextContent("1 change hasn't been saved yet");
  });

  it('does nothing on Stay signed in', async () => {
    renderDialog();
    act(() => { void queue('m1'); });
    act(() => requestSignOut());
    await userEvent.click(await screen.findByRole('button', { name: 'Stay signed in' }));
    expect(calls).toEqual([]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('clears the cache and then signs out once confirmed', async () => {
    renderDialog();
    act(() => { void queue('m1'); });
    act(() => requestSignOut());
    await userEvent.click(await screen.findByRole('button', { name: /Sign out and lose/ }));
    await waitFor(() => expect(calls).toEqual(['cleanup', 'logout']));
  });

  it('has no small buttons', async () => {
    renderDialog();
    act(() => { void queue('m1'); });
    act(() => requestSignOut());
    await screen.findByRole('dialog');
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});
