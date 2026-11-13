import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import Today, { meta as todayMeta } from '../_index';
import Shopping, { meta as shoppingMeta } from '../shopping';

function renderPage(page: React.ReactNode) {
  return render(<MantineProvider><MemoryRouter>{page}</MemoryRouter></MantineProvider>);
}

describe('Today', () => {
  it('is an empty page until tasks arrive in step 3', () => {
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
