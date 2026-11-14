import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, useLocation } from 'react-router';
import { clearSessionEnded, markSessionEnded } from '~/lib/session';
import { markSignInStarted } from '~/lib/signInError';
import { SESSION_LIFETIME_TEXT } from '~/lib/sessionLifetime';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  error: undefined as (Error & { error?: string }) | undefined,
  user: undefined as { sub: string } | undefined,
  loginWithRedirect: vi.fn(),
}));
vi.mock('@auth0/auth0-react', () => ({
  Auth0Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth0: () => auth,
}));
const household = vi.hoisted(() => ({ current: { status: 'ready', refetch: () => {} } as { status: string; refetch: () => void } }));
vi.mock('~/lib/household', () => ({ useHousehold: () => household.current }));
vi.mock('../RegisterMutations', () => ({ RegisterMutations: () => null }));
vi.mock('../PendingWritesBanner', () => ({ PendingWritesBanner: () => null }));
vi.mock('../../authentication/Authentication', () => ({ default: () => null }));
vi.mock('../../authentication/AuthProvider', () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { DefaultLayout, isPublicPath } from '../DefaultLayout';

function renderLayout(children: React.ReactNode = <p>page</p>, url: string = '/') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[url]}>
        <DefaultLayout>{children}</DefaultLayout>
      </MemoryRouter>
    </MantineProvider>,
  );
}

function authError(code: string): Error & { error: string } {
  return Object.assign(new Error(`${code}: raw provider detail`), { error: code });
}

beforeEach(() => {
  household.current = { status: 'ready', refetch: vi.fn() };
  clearSessionEnded();
  auth.isAuthenticated = true;
  auth.isLoading = false;
  auth.error = undefined;
  auth.user = undefined;
  auth.loginWithRedirect.mockClear();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('DefaultLayout navigation', () => {
  it('has Today, Shopping and Settings in the tab bar, and nothing else', () => {
    renderLayout();
    const tabBar = screen.getByRole('navigation', { name: 'Primary' });
    const names = within(tabBar).getAllByRole('link').map(link => link.getAttribute('aria-label'));
    expect(names).toEqual(['Today', 'Shopping', 'Settings']);
    expect(within(tabBar).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the same three destinations in the sidebar, each with its own address', () => {
    renderLayout();
    const addresses: Record<string, string> = { Today: '/', Shopping: '/shopping', Settings: '/settings' };
    for (const [name, href] of Object.entries(addresses)) {
      const links = screen.getAllByRole('link', { name });
      expect(links).toHaveLength(2);
      links.forEach(link => expect(link).toHaveAttribute('href', href));
    }
  });

  it('shows the current page by more than colour: aria-current, a bar and a bold label', () => {
    renderLayout(<p>page</p>, '/shopping');
    const tabBar = screen.getByRole('navigation', { name: 'Primary' });
    const shopping = within(tabBar).getByRole('link', { name: 'Shopping' });
    const today = within(tabBar).getByRole('link', { name: 'Today' });

    expect(shopping).toHaveAttribute('aria-current', 'page');
    expect(today).not.toHaveAttribute('aria-current');
    expect((shopping.querySelector('span[aria-hidden]') as HTMLElement).style.background).toBe('currentcolor');
    expect((today.querySelector('span[aria-hidden]') as HTMLElement).style.background).toBe('transparent');
  });

  it('keeps Today current only on the home page', () => {
    renderLayout(<p>page</p>, '/settings');
    const tabBar = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(tabBar).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current');
    expect(within(tabBar).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the page clear of the fixed tab bar', () => {
    const { container } = renderLayout();
    const main = container.querySelector('main') as HTMLElement;
    expect(main.style.paddingBottom).toContain('var(--tab-bar-height)');
    expect(screen.getByRole('navigation', { name: 'Primary' }).style.height).toBe('var(--tab-bar-height)');
  });

  it('starts with a skip link to the main content', () => {
    renderLayout();
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')).not.toBeNull();
    expect(skip.compareDocumentPosition(screen.getByRole('main')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the page to a signed-in person', () => {
    renderLayout(<p>page content</p>);
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});

describe('DefaultLayout ended session', () => {
  it('replaces the page when a request finds the session can no longer be renewed', () => {
    markSessionEnded();
    renderLayout(<p>private content</p>);
    expect(screen.getByRole('heading', { name: 'Your session has ended' })).toBeInTheDocument();
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
  });
});

describe('DefaultLayout signed out', () => {
  beforeEach(() => { auth.isAuthenticated = false; });

  it('replaces the page with a signed-out panel', () => {
    renderLayout(<p>private content</p>);
    expect(screen.getByRole('heading', { name: "You're signed out" })).toBeInTheDocument();
    expect(screen.getByText('Your data is safe. Sign in to see it.')).toBeInTheDocument();
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
  });

  it("says how long you stay signed in, and makes the panel the page's one h1", () => {
    renderLayout();
    expect(screen.getByText(SESSION_LIFETIME_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: "You're signed out" })).toBeInTheDocument();
  });

  it('starts sign-in from the panel button', async () => {
    renderLayout();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(auth.loginWithRedirect).toHaveBeenCalled();
  });

  it('has no link to a page that does not exist', () => {
    renderLayout();
    expect(screen.queryByRole('link', { name: 'See what it looks like' })).not.toBeInTheDocument();
  });

  it('says the session has ended when Auth0 needs a new sign-in', () => {
    auth.error = authError('login_required');
    renderLayout();
    expect(screen.getByRole('heading', { name: 'Your session has ended' })).toBeInTheDocument();
    expect(screen.getByText('Your data is safe. Sign in to see it.')).toBeInTheDocument();
    expect(screen.queryByText(/raw provider detail/)).not.toBeInTheDocument();
  });

  it('says the session has ended when a signed-in session goes away', () => {
    auth.isAuthenticated = true;
    const { rerender } = renderLayout();
    auth.isAuthenticated = false;
    act(() => {
      rerender(
        <MantineProvider>
          <MemoryRouter>
            <DefaultLayout><p>page</p></DefaultLayout>
          </MemoryRouter>
        </MantineProvider>,
      );
    });
    expect(screen.getByRole('heading', { name: 'Your session has ended' })).toBeInTheDocument();
  });

  it('shows a loading indicator instead of the page while the session is checked', () => {
    auth.isLoading = true;
    renderLayout(<p>private content</p>);
    expect(screen.getByRole('status', { name: 'Checking your session' })).toBeInTheDocument();
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "You're signed out" })).not.toBeInTheDocument();
  });
});

describe('DefaultLayout after a failed Auth0 sign-in', () => {
  const FAILED = '/?error=invalid_request&error_description=Client%20%22x%22%20is%20not%20authorized%20to%20access%20resource%20server%20%22https%3A%2F%2Fhearthwise-api%22.&state=abc&keep=1';

  beforeEach(() => {
    auth.isAuthenticated = false;
    window.history.replaceState(null, '', FAILED);
  });

  it('shows the reason and the docs hint, then takes the error out of the address', async () => {
    markSignInStarted();
    renderLayout();
    expect(screen.getByRole('alert')).toHaveTextContent('is not authorized to access resource server');
    expect(screen.getByRole('alert')).toHaveTextContent('See docs/AUTH0.md');
    await vi.waitFor(() => expect(window.location.search).toBe('?keep=1'));
  });

  it('ignores an error in the address when this tab never started a sign-in, but still removes it', async () => {
    renderLayout();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/not authorized/)).not.toBeInTheDocument();
    await vi.waitFor(() => expect(window.location.search).toBe('?keep=1'));
  });

  it('leaves the panel unchanged when the address has no error', () => {
    window.history.replaceState(null, '', '/');
    renderLayout();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "You're signed out" })).toBeInTheDocument();
  });

  it('still starts sign-in from the button', async () => {
    renderLayout();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(auth.loginWithRedirect).toHaveBeenCalled();
  });
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderAt(url: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[url]}>
        <DefaultLayout><p>page</p></DefaultLayout>
        <Where />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('remembering who is signed in', () => {
  it('keeps the signed-in person\'s id on the device, so their saved cache opens at the next launch', () => {
    auth.user = { sub: 'auth0|me' };
    renderLayout();
    expect(window.localStorage.getItem('hearthwise-user')).toBe('auth0|me');
  });

  it('keeps nothing for someone who is not signed in', () => {
    auth.isAuthenticated = false;
    auth.user = { sub: 'auth0|me' };
    renderLayout();
    expect(window.localStorage.getItem('hearthwise-user')).toBeNull();
  });
});

describe('the household gate', () => {
  it('sends a signed-in person with no household and no invite to /welcome', () => {
    household.current = { status: 'none', refetch: vi.fn() };
    renderAt('/');
    expect(screen.getByTestId('where')).toHaveTextContent('/welcome');
  });

  it('sends them to /join instead when an invite is waiting', () => {
    window.localStorage.setItem('hearthwise-invite', JSON.stringify({ token: 'A'.repeat(43), expiresAt: Date.now() + 60_000 }));
    household.current = { status: 'none', refetch: vi.fn() };
    renderAt('/settings');
    expect(screen.getByTestId('where')).toHaveTextContent('/join');
  });

  it('lets someone with no household stay on /welcome', () => {
    household.current = { status: 'none', refetch: vi.fn() };
    renderAt('/welcome');
    expect(screen.getByTestId('where')).toHaveTextContent('/welcome');
    expect(screen.getByText('page')).toBeInTheDocument();
  });

  it('sends someone with a household away from /welcome to /', () => {
    renderAt('/welcome');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it('shows the page to someone with a household', () => {
    renderAt('/settings');
    expect(screen.getByText('page')).toBeInTheDocument();
  });

  it('shows a retry, never the welcome page, when the household cannot be loaded', async () => {
    const refetch = vi.fn();
    household.current = { status: 'error', refetch };
    renderAt('/');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    expect(screen.queryByText('page')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a loading indicator while the household loads', () => {
    household.current = { status: 'loading', refetch: vi.fn() };
    renderAt('/');
    expect(screen.getByRole('status', { name: 'Checking your household' })).toBeInTheDocument();
  });

  it('shows /join to a signed-out person, with no sign-in panel', () => {
    auth.isAuthenticated = false;
    renderAt('/join');
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "You're signed out" })).not.toBeInTheDocument();
  });

  it('does not check for a household while signed out', () => {
    auth.isAuthenticated = false;
    household.current = { status: 'none', refetch: vi.fn() };
    renderAt('/');
    expect(screen.getByRole('heading', { name: "You're signed out" })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });
});

describe('public pages', () => {
  it('are only /join', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/about')).toBe(false);
    expect(isPublicPath('/welcome')).toBe(false);
    expect(isPublicPath('/join')).toBe(true);
    expect(isPublicPath('/join/')).toBe(true);
  });
});
