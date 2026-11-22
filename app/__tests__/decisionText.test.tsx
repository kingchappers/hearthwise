import { describe, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
vi.mock('~/lib/recipes', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/recipes')>()), useRecipes: () => ({ status: 'ready', recipes: [], dataUpdatedAt: 1, refetch: vi.fn() }) }));
vi.mock('~/hooks/useRecipeActions', () => ({ useRecipeActions: () => ({ add: vi.fn(), edit: vi.fn(), remove: vi.fn(), restore: vi.fn(), duplicate: vi.fn() }) }));
vi.mock('~/lib/plan', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/plan')>()), usePlan: () => ({ status: 'ready', days: [], today: '2026-11-13', recipes: [], recipesCheckedAt: undefined, refetch: vi.fn() }) }));
vi.mock('~/hooks/usePlanActions', () => ({ usePlanActions: () => ({ set: vi.fn(), clear: vi.fn() }) }));
vi.mock('~/lib/queries', () => ({ useTasks: () => ({ status: 'ready', tasks: [], proposals: [], today: '2026-11-13', refetch: vi.fn() }) }));
vi.mock('~/hooks/useTaskActions', () => ({ useTaskActions: () => ({ me: { userId: 'u1', displayName: 'Sam' }, members: [], caller: { userId: 'u1', members: [] }, today: '2026-11-13', needsAsk: () => false }) }));
vi.mock('~/lib/money', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/money')>()),
  useMoney: () => ({
    status: 'ready', entries: [], serverEntries: [], me: 'a', people: { meId: 'a', meName: 'Ann', otherId: 'b', otherName: 'Bo' }, other: { userId: 'b', name: 'Bo' }, canWrite: false,
    total: { direction: 'square', pence: 0 }, loans: [], settled: new Set(), unsaved: 1, unsavedIds: new Set(), dataUpdatedAt: 1, refetch: vi.fn(),
  }),
}));
vi.mock('~/hooks/useMoneyActions', () => ({ useChangeNotices: vi.fn(), useMoneyActions: () => ({ add: vi.fn(), edit: vi.fn(), respond: vi.fn(), askChange: vi.fn(), respondChange: vi.fn(), withdrawChange: vi.fn(), remove: vi.fn(), restore: vi.fn() }) }));
vi.mock('~/lib/calendar', () => ({
  useCalendar: () => ({ status: 'ready', deleted: [], unsavedIds: new Set(), refetch: vi.fn() }),
  useTimelineSources: () => ({
    status: 'ready',
    calendar: { status: 'ready', events: [], me: 'a', members: [{ userId: 'a', displayName: 'Ann' }, { userId: 'b', displayName: 'Bo' }], timezone: 'Asia/Tokyo', today: '2026-11-13', unsaved: 1, unsavedIds: new Set(), refetch: vi.fn() },
    imported: { status: 'ready', feeds: [], covers: () => true },
    inputsFor: () => ({ events: [], tasks: [], members: [] }),
  }),
}));
vi.mock('~/hooks/useFeedActions', () => ({ useFeedActions: () => ({ add: vi.fn(), replace: vi.fn(), edit: vi.fn(), refresh: vi.fn(), remove: vi.fn() }) }));
vi.mock('~/lib/projects', () => ({ useProjects: () => ({ status: 'ready', projects: [], deleted: [], me: 'a', members: [], unsavedIds: new Set<string>() }) }));
vi.mock('~/hooks/useProjectActions', () => ({ useProjectActions: () => ({ restoreProject: vi.fn() }) }));
vi.mock('~/hooks/useCalendarActions', () => ({ useCalendarActions: () => ({ me: 'a', add: vi.fn(), edit: vi.fn(), skipDay: vi.fn(), remove: vi.fn(), setReminders: vi.fn(), restore: vi.fn() }) }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { SignedOutPanel } from '~/components/layout/SignedOutPanel';
import Today from '~/routes/_index';
import Shopping from '~/routes/shopping';
import Settings from '~/routes/settings';
import Welcome from '~/routes/welcome';
import Join from '~/routes/join';
import Deleted from '~/routes/deleted';
import Money from '~/routes/money._index';
import CalendarPage from '~/routes/plan.calendar';
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
    expectReadable(screen.getByText('These are saved on this device.'));
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
    expectReadable(screen.getByText('Deleted things stay for 30 days, and can be restored.'));
    unmount();
    renderIn(<Deleted />);
    expectReadable(screen.getByText('Deleted tasks, shopping items and recipes stay here for 30 days.'));
    expectReadable(screen.getByText('Nothing has been deleted.'));
  });
});

describe('money', () => {
  it('shows what will appear, the read-only note and the unsaved line at a readable size', () => {
    renderIn(<Money />);
    expectReadable(screen.getByText('No money entries yet. Add one when you share a cost or lend money.'));
    expectReadable(screen.getByText('1 change not saved yet'));
    expectReadable(screen.getByText('Adding or agreeing needs the two people this ledger is between.'));
  });

  it('shows the Deleted hint for money at a readable size', () => {
    renderIn(<Deleted />);
    expectReadable(screen.getByText('Deleted money entries stay until you restore them.'));
  });
});

describe('calendar', () => {
  it('shows what is on, the unsaved line, the zone note and the Deleted hint at a readable size', () => {
    renderIn(<CalendarPage />);
    expectReadable(screen.getByText('Nothing on'));
    expectReadable(screen.getByText('1 change not saved yet'));
    expectReadable(screen.getByText(/Times are shown in Asia\/Tokyo/));
  });

  it('shows the Calendars sheet\'s words at a readable size', async () => {
    renderIn(<CalendarPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Calendars' }));
    expectReadable(screen.getByText('No calendars added yet'));
    await userEvent.click(screen.getByRole('button', { name: 'Add a calendar' }));
    expectReadable(screen.getByText(/In Google Calendar:/));
  });

  it('shows the Now and next lines at a readable size', () => {
    renderIn(<Today />);
    expectReadable(screen.getByText('Now: nothing on'));
    expectReadable(screen.getByText('Nothing more today'));
  });

  it('shows the Deleted hint for events at a readable size', () => {
    renderIn(<Deleted />);
    expectReadable(screen.getByText('Deleted events stay here for 30 days.'));
  });
});
