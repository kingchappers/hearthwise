import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

vi.mock('~/lib/queries', () => ({ useTasks: () => ({ status: 'ready', tasks: [], proposals: [], today: '2026-11-13', refetch: vi.fn() }) }));
vi.mock('~/lib/household', () => ({ useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'UTC' }, members: [], me: { userId: 'u1', displayName: 'Sam', settings: { defaultView: 'list' } } } }) }));
vi.mock('~/hooks/useTaskActions', () => ({ useTaskActions: () => ({ me: { userId: 'u1', displayName: 'Sam' }, members: [], caller: { userId: 'u1', members: [] }, today: '2026-11-13', needsAsk: () => false }) }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import Today, { meta as todayMeta } from '../_index';
import Shopping, { meta as shoppingMeta } from '../shopping';

function renderPage(page: React.ReactNode) {
  return render(<MantineProvider><MemoryRouter>{page}</MemoryRouter></MantineProvider>);
}

describe('Today', () => {
  it('says there is nothing yet when there are no tasks', () => {
    renderPage(<Today />);
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('is titled Today', () => {
    expect(todayMeta({} as never)).toEqual([{ title: 'Today – Hearthwise' }]);
  });
});

describe('Shopping', () => {
  it('is an empty page until the list arrives in step 4, so the navigation never leads nowhere', () => {
    renderPage(<Shopping />);
    expect(screen.getByRole('heading', { level: 1, name: 'Shopping' })).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('is titled Shopping', () => {
    expect(shoppingMeta({} as never)).toEqual([{ title: 'Shopping – Hearthwise' }]);
  });
});
