import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { clearSessionEnded, markSessionEnded } from '~/lib/session';
import { SESSION_LIFETIME_TEXT } from '~/lib/sessionLifetime';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  error: undefined as (Error & { error?: string }) | undefined,
  loginWithRedirect: vi.fn(),
}));
vi.mock('@auth0/auth0-react', () => ({
  Auth0Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth0: () => auth,
}));
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
  clearSessionEnded();
  auth.isAuthenticated = true;
  auth.isLoading = false;
  auth.error = undefined;
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

describe('public pages', () => {
  it('start with none: step 2 adds /join', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/about')).toBe(false);
    expect(isPublicPath('/join')).toBe(false);
  });
});
