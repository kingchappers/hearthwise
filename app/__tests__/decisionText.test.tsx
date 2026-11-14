import { describe, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

vi.mock('~/lib/auth', () => ({ useAuth: () => ({ mode: 'auth0', isAuthenticated: false, isLoading: true, user: undefined, login: vi.fn(), logout: vi.fn() }) }));
vi.mock('~/lib/household', () => ({
  useCreateHousehold: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAcceptInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { name: 'Home', timezone: 'UTC', createdBy: 'a', createdAt: '', memberCount: 1 }, members: [{ userId: 'a', displayName: 'Ann', joinedAt: '' }], me: { userId: 'a', displayName: 'Ann', joinedAt: '', settings: {} } } }),
  useCreateInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInvites: () => ({ data: [] }),
  useRemoveMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMe: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('~/lib/items', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/items')>()), useItems: () => ({ status: 'ready', items: [], refetch: vi.fn() }) }));
vi.mock('~/hooks/useItemActions', () => ({ useItemActions: () => ({ add: vi.fn(), tick: vi.fn(), edit: vi.fn(), remove: vi.fn(), clearTicked: vi.fn(), restore: vi.fn() }) }));
vi.mock('~/lib/queries', () => ({ useTasks: () => ({ status: 'ready', tasks: [], proposals: [], today: '2026-11-13', refetch: vi.fn() }) }));
vi.mock('~/hooks/useTaskActions', () => ({ useTaskActions: () => ({ me: { userId: 'u1', displayName: 'Sam' }, members: [], caller: { userId: 'u1', members: [] }, today: '2026-11-13', needsAsk: () => false }) }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { SignedOutPanel } from '~/components/layout/SignedOutPanel';
import Today from '~/routes/_index';
import Shopping from '~/routes/shopping';
import Settings from '~/routes/settings';
import Welcome from '~/routes/welcome';
import Join from '~/routes/join';
import Deleted from '~/routes/deleted';
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

describe('welcome', () => {
  it('shows the invite prompt and the household hints at a readable size', () => {
    renderIn(<Welcome />);
    expectReadable(screen.getByText('Waiting for an invite? Open the link your partner sent you.'));
    expectReadable(screen.getByText('How you will appear to your partner.'));
    expectReadable(screen.getByText('Used for dates and reminders. It is set from this device.'));
  });
});

describe('join', () => {
  it('says what is happening at a readable size', () => {
    renderIn(<Join />);
    expectReadable(screen.getByText("This invite link doesn't look right. Ask your partner for a new link."));
  });
});

describe('members in settings', () => {
  it('shows the invite and member text at a readable size', () => {
    renderIn(<Settings />);
    expectReadable(screen.getByText('Share the link with your partner. It works once and expires in 7 days.'));
    expectReadable(screen.getByText('How you will appear to your partner.'));
  });
});

describe('tasks', () => {
  it('shows the Deleted hints and the empty states at a readable size', () => {
    const { unmount } = renderIn(<Settings />);
    expectReadable(screen.getByText('Deleted tasks stay for 30 days, and can be restored.'));
    unmount();
    renderIn(<Deleted />);
    expectReadable(screen.getByText('Deleted tasks stay here for 30 days.'));
    expectReadable(screen.getByText('Nothing has been deleted.'));
  });
});
