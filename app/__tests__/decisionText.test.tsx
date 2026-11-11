import { describe, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

vi.mock('~/lib/auth', () => ({ useAuth: () => ({ login: vi.fn(), logout: vi.fn() }) }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { SignedOutPanel } from '~/components/layout/SignedOutPanel';
import Today from '~/routes/_index';
import Shopping from '~/routes/shopping';
import Settings from '~/routes/settings';
import { SESSION_LIFETIME_TEXT } from '~/lib/sessionLifetime';
import { expectReadable } from '~/test-utils/readableText';

// Text that helps a person decide, or find their place, must not be tiny or dimmed.
// Dimmed styling says "you can skip this", so people do. Later steps add their own rows and cards here.

function renderIn(ui: React.ReactNode) {
  return render(<MantineProvider><MemoryRouter>{ui}</MemoryRouter></MantineProvider>);
}

describe('signing in', () => {
  it('shows what the person needs to do next at a readable size', () => {
    renderIn(<SignedOutPanel sessionEnded={false} />);
    expectReadable(screen.getByText('Your data is safe. Sign in to see it.'));
    expectReadable(screen.getByText(SESSION_LIFETIME_TEXT));
  });
});

describe('empty pages', () => {
  it.each([['Today', <Today key="t" />, 'Chores and to-dos you add will show up here.'], ['Shopping', <Shopping key="s" />, 'The household shopping list will be here.']])(
    'say what will appear on %s at a readable size',
    (_name, page, hint) => {
      renderIn(page);
      expectReadable(screen.getByText('Nothing here yet.'));
      expectReadable(screen.getByText(hint));
    },
  );
});

describe('settings', () => {
  it('says where display settings are saved at a readable size', () => {
    renderIn(<Settings />);
    expectReadable(screen.getByText('Display settings are saved on this device.'));
  });
});
