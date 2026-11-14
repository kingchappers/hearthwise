import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, useLocation } from 'react-router';
import { ApiError } from '~/lib/apiError';

const TOKEN = 'A'.repeat(43);
const auth = vi.hoisted(() => ({
  mode: 'auth0' as 'auth0' | 'local',
  isAuthenticated: false,
  isLoading: false,
  user: { name: 'Bea' } as { name?: string } | undefined,
  login: vi.fn(),
}));
vi.mock('~/lib/auth', () => ({ useAuth: () => auth }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const accept = vi.hoisted(() => vi.fn());
vi.mock('~/lib/household', () => ({ useAcceptInvite: () => ({ mutateAsync: accept, isPending: false }) }));
const signup = vi.hoisted(() => vi.fn());
vi.mock('~/lib/localAuth', () => ({ signupWithInvite: signup, loginLocal: vi.fn(), setupLocal: vi.fn() }));

import Join from '../join';

function Probe() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.hash}`}</p>;
}

function renderJoin(entry = `/join#${TOKEN}`) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[entry]}>
        <Join />
        <Probe />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  auth.mode = 'auth0';
  auth.isAuthenticated = false;
  auth.isLoading = false;
  auth.user = { name: 'Bea' };
  auth.login.mockReset();
  accept.mockReset().mockResolvedValue({ householdId: 'h' });
  signup.mockReset().mockResolvedValue(undefined);
});

describe('Join in Auth0 mode', () => {
  it('stores the token, then removes the hash from the address', async () => {
    renderJoin();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/join$/));
    expect(window.localStorage.getItem('hearthwise-invite')).toContain(TOKEN);
  });

  it('starts sign-in when signed out', async () => {
    renderJoin();
    await waitFor(() => expect(auth.login).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('keeps using the stored token after sign-in brings the person back without a hash', async () => {
    auth.isAuthenticated = true;
    window.localStorage.setItem('hearthwise-invite', JSON.stringify({ token: TOKEN, expiresAt: Date.now() + 60_000 }));
    const user = userEvent.setup();
    renderJoin('/join');
    await user.click(screen.getByRole('button', { name: 'Join household' }));
    expect(accept).toHaveBeenCalledWith({ token: TOKEN, displayName: 'Bea' });
  });

  it('joins when signed in, clears the token and goes to Today', async () => {
    auth.isAuthenticated = true;
    const user = userEvent.setup();
    renderJoin();
    await user.click(await screen.findByRole('button', { name: 'Join household' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    expect(window.localStorage.getItem('hearthwise-invite')).toBeNull();
  });

  it('says the invite has expired (CUJ 10) and clears the token', async () => {
    auth.isAuthenticated = true;
    accept.mockRejectedValue(new ApiError(410, 'Gone', 'invite_expired'));
    const user = userEvent.setup();
    renderJoin();
    await user.click(await screen.findByRole('button', { name: 'Join household' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite has expired. Ask your partner for a new link.');
    expect(window.localStorage.getItem('hearthwise-invite')).toBeNull();
  });

  it('asks before moving out of an empty household (CUJ 11), then resends with confirmMove', async () => {
    auth.isAuthenticated = true;
    accept.mockRejectedValueOnce(Object.assign(new ApiError(409, 'Conflict', 'already_member'), { canMove: true }));
    const user = userEvent.setup();
    renderJoin();
    await user.click(await screen.findByRole('button', { name: 'Join household' }));
    expect(await screen.findByText("Move to your partner's household? Your current household is empty and will be removed.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move to their household' }));
    expect(accept).toHaveBeenLastCalledWith({ token: TOKEN, displayName: 'Bea', confirmMove: true });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  it('explains a household with things in it, and does not offer to move', async () => {
    auth.isAuthenticated = true;
    accept.mockRejectedValue(Object.assign(new ApiError(409, 'Conflict', 'already_member'), { canMove: false }));
    const user = userEvent.setup();
    renderJoin();
    await user.click(await screen.findByRole('button', { name: 'Join household' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You're already in a household that has things in it");
    expect(screen.queryByRole('button', { name: 'Move to their household' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('hearthwise-invite')).toBeNull();
  });

  it('says so, and offers no join, when the address has no usable token', () => {
    auth.isAuthenticated = true;
    renderJoin('/join#short');
    expect(screen.getByRole('alert')).toHaveTextContent("This invite link doesn't look right. Ask your partner for a new link.");
    expect(screen.queryByRole('button', { name: 'Join household' })).not.toBeInTheDocument();
  });
});

describe('Join in local mode', () => {
  beforeEach(() => { auth.mode = 'local'; });

  it('shows the invite sign-up form without a setup code, and never starts Auth0 sign-in', () => {
    renderJoin();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Setup code')).not.toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('lets someone who already has an account sign in instead', async () => {
    const user = userEvent.setup();
    renderJoin();
    await user.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }));
    expect(auth.login).toHaveBeenCalledTimes(1);
  });

  it('signs up with the token, clears it and goes to Today', async () => {
    const user = userEvent.setup();
    renderJoin();
    await user.type(screen.getByLabelText('Email'), 'bea@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Bea');
    await user.type(screen.getByLabelText('Password'), 'a long enough password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(signup).toHaveBeenCalledWith({ token: TOKEN, email: 'bea@example.com', password: 'a long enough password', displayName: 'Bea' });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    expect(window.localStorage.getItem('hearthwise-invite')).toBeNull();
  });

  it('clears the token when sign-up fails too, and shows the reason', async () => {
    signup.mockRejectedValue(new Error('This invite has expired. Ask your partner for a new link.'));
    const user = userEvent.setup();
    renderJoin();
    await user.type(screen.getByLabelText('Email'), 'bea@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Bea');
    await user.type(screen.getByLabelText('Password'), 'a long enough password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite has expired');
    expect(window.localStorage.getItem('hearthwise-invite')).toBeNull();
  });
});
