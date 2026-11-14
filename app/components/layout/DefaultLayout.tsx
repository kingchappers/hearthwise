import { useEffect, useState } from 'react';
import { AppShell, Flex, Text, NavLink, Group, Loader, Paper } from '@mantine/core';
import { useAuth } from '~/lib/auth';
import Authentication from "../authentication/Authentication";
import { AuthProvider } from "../authentication/AuthProvider";
import { ColorSchemeToggle } from './ColorSchemeToggle';
import { Logo, Mark } from './Logo';
import { IconHome, IconSettings, IconShoppingCart } from '@tabler/icons-react';
import { Navigate, NavLink as RouterNavLink, useLocation } from 'react-router';
import { SignedOutPanel } from './SignedOutPanel';
import { LoadError } from './LoadError';
import { PendingWritesBanner } from './PendingWritesBanner';
import { SignOutDialog } from './SignOutDialog';
import { UpdateNotice } from './UpdateNotice';
import { RegisterMutations } from './RegisterMutations';
import { useHousehold } from '~/lib/household';
import { peekInviteToken } from '~/lib/inviteToken';
import { useHouseholdRuntime } from '~/lib/householdRuntime';
import { clearUserCache, readStoredUser, storeUser } from '~/lib/persistedCache';
import { isSessionEndedError, useSessionEnded } from '~/lib/session';
import { clearSignInErrorFromAddress, consumeSignInStarted, readSignInError } from '~/lib/signInError';
import type { SignInError } from '~/lib/signInError';

// The same three places on every device.
export const NAV_ITEMS = [
  { to: '/', label: 'Today', Icon: IconHome },
  { to: '/shopping', label: 'Shopping', Icon: IconShoppingCart },
  { to: '/settings', label: 'Settings', Icon: IconSettings },
];

function isNavItemActive(pathname: string, to: string) {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

// Pages anyone can read without signing in. Keep this short: everything else waits for a session. /join is how an invited
// person arrives, signed in or not.
export const PUBLIC_PATHS: readonly string[] = ['/join'];

export function isPublicPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return PUBLIC_PATHS.includes(path);
}

// An active tab is bold and has a bar above it, so it is not told apart by colour alone.
function TabLink({ to, label, Icon, active }: { to: string; label: string; Icon: typeof IconHome; active: boolean }) {
  return (
    <RouterNavLink to={to} style={{ textDecoration: 'none', minWidth: 0, minHeight: 44, flex: '1 1 0' }} aria-label={label}>
      <Group gap={2} justify="center" style={{ flexDirection: 'column' }}>
        <span
          aria-hidden
          style={{ height: 3, width: 24, borderRadius: 2, background: active ? 'currentColor' : 'transparent' }}
        />
        <Icon size={22} stroke={active ? 2.4 : 1.6} />
        <Text size="xs" fw={active ? 700 : 400} className="tab-label">{label}</Text>
      </Group>
    </RouterNavLink>
  );
}

function BottomTabs() {
  const { pathname } = useLocation();

  return (
    <Paper
      component="nav"
      aria-label="Primary"
      withBorder
      hiddenFrom="sm"
      // The height is shared with the page padding, scroll padding and toasts (see app.css).
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        height: 'var(--tab-bar-height)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <Group justify="space-around" align="center" wrap="nowrap" gap={0} h="100%" px={4}>
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <TabLink key={to} to={to} label={label} Icon={Icon} active={isNavItemActive(pathname, to)} />
        ))}
      </Group>
    </Paper>
  );
}

function SidebarNav() {
  const { pathname } = useLocation();
  return (
    <>
      {NAV_ITEMS.map(({ to, label, Icon }) => {
        const active = isNavItemActive(pathname, to);
        return (
          <NavLink
            key={to}
            component={RouterNavLink}
            to={to}
            label={label}
            active={active}
            leftSection={<Icon size={16} stroke={1.5} />}
            // Bold with a yellow bar at the edge, in addition to the highlight; the bar is a fill, so it never carries the meaning alone.
            styles={{ label: { fontWeight: active ? 700 : 400 } }}
            style={{ borderLeft: `3px solid ${active ? 'var(--mantine-color-honey-4)' : 'transparent'}`, minHeight: 44 }}
          />
        );
      })}
    </>
  );
}

type SessionState = 'loading' | 'signedIn' | 'signedOut' | 'sessionEnded';

function useSessionState(): SessionState {
  const { isAuthenticated, isLoading, error } = useAuth();
  const tokenRenewalFailed = useSessionEnded();
  const [hadSession, setHadSession] = useState(false);
  if (isAuthenticated && !hadSession) setHadSession(true);

  if (isLoading) return 'loading';
  if (tokenRenewalFailed) return 'sessionEnded';
  if (isAuthenticated) return 'signedIn';
  if (hadSession || isSessionEndedError(error)) return 'sessionEnded';
  return 'signedOut';
}

// Everything behind sign-in needs a household. Someone without one is sent to /join (an invite is waiting) or /welcome; someone
// with one has no use for /welcome. A failure to load is not "no household": it gets a retry, never the create form.
function HouseholdGate({ children }: { children: React.ReactNode }) {
  const household = useHousehold();
  const { pathname } = useLocation();

  if (household.status === 'loading') {
    return (
      <Group justify="center" py="xl" role="status" aria-label="Checking your household">
        <Loader />
      </Group>
    );
  }
  if (household.status === 'error') return <LoadError thing="household" onRetry={household.refetch} />;
  if (household.status === 'none') {
    if (pathname === '/welcome') return <>{children}</>;
    return <Navigate to={peekInviteToken() ? '/join' : '/welcome'} replace />;
  }
  if (pathname === '/welcome') return <Navigate to="/" replace />;
  // Household writes are registered once there is a household to write to.
  return <><RegisterMutations /><PendingWritesBanner />{children}</>;
}

// A failed Auth0 sign-in lands on the page with the reason in the address. Read it once, then take it out of the address,
// so a reload does not show it again and it is not left in history. The reason is shown only if this tab started a sign-in:
// a link someone else made, with their own words in error_description, is dropped without being shown.
function useSignInError(): SignInError | undefined {
  const [found] = useState(() => {
    if (typeof window === 'undefined') return undefined;
    const error = readSignInError(window.location.search);
    return { error, expected: error ? consumeSignInStarted() : false };
  });
  useEffect(() => {
    if (found?.error) clearSignInErrorFromAddress();
  }, [found]);
  return found?.expected ? found.error : undefined;
}

function MainContent({ session, signInError, children }: { session: SessionState; signInError?: SignInError; children: React.ReactNode }) {
  const { pathname } = useLocation();
  if (isPublicPath(pathname)) return <>{children}</>;
  if (session === 'loading') {
    return (
      <Group justify="center" py="xl" role="status" aria-label="Checking your session">
        <Loader />
      </Group>
    );
  }
  if (session === 'signedIn') return <HouseholdGate>{children}</HouseholdGate>;
  return <SignedOutPanel sessionEnded={session === 'sessionEnded'} signInError={signInError} />;
}

function LayoutShell({ children }: { children: React.ReactNode }) {
  const session = useSessionState();
  const { isAuthenticated, user, launching } = useAuth();
  const { runtime } = useHouseholdRuntime();
  // Remember who is signed in, so their saved cache can be opened at the next launch before sign-in has finished.
  useEffect(() => {
    if (!isAuthenticated || !user?.sub) return;
    // Someone else was signed in here before: their saved lists and waiting writes are deleted, not left on the device.
    const previous = readStoredUser();
    if (previous && previous !== user.sub) {
      // Sealed first, so a save already under way for them cannot land after the delete and bring their cache back.
      runtime.seal();
      void clearUserCache(previous).catch(error => console.error('Could not clear the previous person\'s cache:', error));
    }
    storeUser(user.sub);
  }, [isAuthenticated, user?.sub]);
  const signInError = useSignInError();

  return (
    <>
    <a className="skip-link" href="#main">Skip to main content</a>
    <AppShell
      padding="md"
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: true, desktop: false } }}
    >
      <AppShell.Header>
        <Flex h="100%" px="md" justify="space-between" align="center">
          <Logo height={36} className="app-wordmark" />
          <span className="app-mark"><Mark size={36} alt="Hearthwise" /></span>
          <Group gap="xs" wrap="nowrap">
            <ColorSchemeToggle />
            <Authentication />
          </Group>
        </Flex>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <SidebarNav />
      </AppShell.Navbar>

      {/* Clears the phone tab bar, which is fixed to the bottom of the screen. */}
      <AppShell.Main id="main" tabIndex={-1} style={{ outline: 'none', paddingBottom: 'calc(var(--tab-bar-height) + var(--mantine-spacing-xl))' }}>
        <UpdateNotice />
        {launching && <Text size="sm" role="status">Signing in…</Text>}
        <MainContent session={session} signInError={signInError}>{children}</MainContent>
        <SignOutDialog />
      </AppShell.Main>
      <BottomTabs />
    </AppShell>
    </>
  );
}

export function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LayoutShell>{children}</LayoutShell>
    </AuthProvider>
  );
}
