import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearDropped, recordDropped } from '~/lib/dropped';
import { PendingWritesBanner } from '../PendingWritesBanner';

let client: QueryClient;

function renderBanner() {
  return render(<MantineProvider env="test"><QueryClientProvider client={client}><PendingWritesBanner /></QueryClientProvider></MantineProvider>);
}
const queue = (id: string) => new MutationObserver(client, { mutationKey: ['household', 'itemTick'], mutationFn: () => new Promise(() => undefined) }).mutate({ mutationId: id } as never);

beforeEach(() => {
  client = new QueryClient();
  clearDropped();
});

describe('PendingWritesBanner', () => {
  it('shows nothing when nothing is waiting and nothing was refused', () => {
    renderBanner();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says how many changes are waiting to be saved, in the singular and the plural', async () => {
    renderBanner();
    act(() => { void queue('m1'); });
    expect(await screen.findByText('1 change waiting to be saved')).toBeInTheDocument();
    act(() => { void queue('m2'); });
    expect(await screen.findByText('2 changes waiting to be saved')).toBeInTheDocument();
  });

  it('lists each change that could not be saved, and dismisses it', async () => {
    renderBanner();
    act(() => recordDropped({ id: 'a', message: 'This changed on another phone. Please check it and try again.' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This changed on another phone');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers Ask when the change needs the other person\'s say, and sends the ask', async () => {
    const ask = vi.fn();
    renderBanner();
    act(() => recordDropped({ id: 'a', message: 'That change needs their say. Ask them instead.', ask }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('never says overdue, missed or streak, and has no small buttons', async () => {
    renderBanner();
    act(() => { void queue('m1'); recordDropped({ id: 'a', message: 'x', ask: () => undefined }); });
    await screen.findByText('1 change waiting to be saved');
    expect(document.body.textContent).not.toMatch(/overdue|missed|streak/i);
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});
