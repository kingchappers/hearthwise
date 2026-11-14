import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { ShoppingItem } from '../../../src/shopping/types';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';

const state = vi.hoisted(() => ({
  items: { status: 'ready', items: [] as ShoppingItem[], refetch: vi.fn() },
  actions: undefined as unknown,
}));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/items', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/items')>()), useItems: () => state.items }));
vi.mock('~/hooks/useItemActions', () => ({ useItemActions: () => state.actions }));

import Shopping, { meta } from '../shopping';

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: `i-${Math.random()}`, text: 'Milk', ticked: false, fieldTimes: { text: 1, ticked: 7 }, updatedAt: 1, ...over });
const makeActions = () => ({ add: vi.fn(), tick: vi.fn(), edit: vi.fn(), remove: vi.fn(), clearTicked: vi.fn(), restore: vi.fn() });
const actions = () => state.actions as ReturnType<typeof makeActions>;
const renderPage = () => render(<MantineProvider env="test"><MemoryRouter><Shopping /></MemoryRouter></MantineProvider>);

beforeEach(() => {
  state.items = { status: 'ready', items: [], refetch: vi.fn() };
  state.actions = makeActions();
});

describe('Shopping', () => {
  it('is titled Shopping and says what will appear when empty', () => {
    expect(meta({} as never)).toEqual([{ title: 'Shopping – Hearthwise' }]);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Shopping' })).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getByText('The household shopping list will be here.')).toBeInTheDocument();
  });

  it('adds an item, ticks and deletes one', async () => {
    const milk = item({ text: 'Milk' });
    state.items.items = [milk];
    renderPage();
    await userEvent.type(screen.getByLabelText('Add an item'), 'Eggs{Enter}');
    expect(actions().add).toHaveBeenCalledWith('Eggs', undefined);
    await userEvent.click(screen.getByRole('checkbox', { name: /Milk/ }));
    expect(actions().tick).toHaveBeenCalledWith(milk, true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete: Milk' }));
    expect(actions().remove).toHaveBeenCalledWith(milk);
  });

  it('offers Clear ticked only when something is ticked, and sends the ticked items', async () => {
    const bread = item({ text: 'Bread', ticked: true });
    state.items.items = [item({ text: 'Milk' })];
    const { unmount } = renderPage();
    expect(screen.queryByRole('button', { name: /Clear ticked/ })).not.toBeInTheDocument();
    unmount();
    state.items.items = [item({ text: 'Milk' }), bread];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Clear ticked (1)' }));
    expect(actions().clearTicked).toHaveBeenCalledWith([bread]);
  });

  it('shows a loading indicator, and a retry when the list cannot be loaded', async () => {
    state.items.status = 'loading';
    const { unmount } = renderPage();
    expect(screen.getByRole('status', { name: 'Loading the shopping list' })).toBeInTheDocument();
    unmount();
    state.items.status = 'error';
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.items.refetch).toHaveBeenCalledTimes(1);
  });

  it('has sound headings and no unlabelled controls', async () => {
    state.items.items = [item({ text: 'Milk' }), item({ text: 'Bread', ticked: true })];
    const { container } = renderPage();
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });
});
