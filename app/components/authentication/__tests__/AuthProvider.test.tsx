import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const mockGetRuntimeConfig = vi.hoisted(() => vi.fn());
const mockPeekRuntimeConfig = vi.hoisted(() => vi.fn());
vi.mock('~/lib/runtimeConfig', () => ({ getRuntimeConfig: mockGetRuntimeConfig, peekRuntimeConfig: mockPeekRuntimeConfig }));
vi.mock('@auth0/auth0-react', () => ({
  Auth0Provider: ({ children, domain }: { children: React.ReactNode; domain: string }) => <div data-testid="auth0" data-domain={domain}>{children}</div>,
  useAuth0: () => ({}),
}));
vi.mock('../LocalAuthProvider', () => ({ LocalAuthProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="local">{children}</div> }));

import { AuthProvider } from '../AuthProvider';
import { useAuth } from '~/lib/auth';
import { clearStoredUser, storeUser } from '~/lib/persistedCache';

function renderProvider() {
  return render(<MantineProvider env="test"><AuthProvider><span>app</span></AuthProvider></MantineProvider>);
}

beforeEach(() => {
  clearStoredUser();
  mockGetRuntimeConfig.mockReset();
  mockPeekRuntimeConfig.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('AuthProvider', () => {
  it('wraps the app in Auth0 with the configured values', async () => {
    mockGetRuntimeConfig.mockResolvedValue({ auth: 'auth0', domain: 't.example.com', clientId: 'cid', audience: 'aud' });
    renderProvider();
    expect(await screen.findByTestId('auth0')).toHaveAttribute('data-domain', 't.example.com');
    expect(screen.getByText('app')).toBeInTheDocument();
  });

  it('uses the local provider in local mode', async () => {
    mockGetRuntimeConfig.mockResolvedValue({ auth: 'local' });
    renderProvider();
    expect(await screen.findByTestId('local')).toBeInTheDocument();
  });

  it('shows a clear error, and no app, when the config cannot be loaded', async () => {
    mockGetRuntimeConfig.mockRejectedValue(new Error('config.json could not be loaded (404)'));
    renderProvider();
    expect(await screen.findByText(/could not start/i)).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('renders the app at once when the config is already known', () => {
    mockPeekRuntimeConfig.mockReturnValue({ auth: 'local' });
    renderProvider();
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(mockGetRuntimeConfig).not.toHaveBeenCalled();
  });
});

function AuthProbe() {
  const auth = useAuth();
  return <p data-testid="auth">{`${auth.isAuthenticated}|${auth.launching}|${auth.user?.sub}`}</p>;
}

describe('AuthProvider at a launch with no signal', () => {
  it('renders the app for a person who signed in before, while the config cannot be loaded, instead of an error', async () => {
    storeUser('auth0|me');
    mockGetRuntimeConfig.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<MantineProvider env="test"><AuthProvider><AuthProbe /></AuthProvider></MantineProvider>);
    expect(await screen.findByTestId('auth')).toHaveTextContent('true|true|auth0|me');
    expect(screen.queryByText(/could not start/i)).not.toBeInTheDocument();
  });

  it('renders the app straight away for that person while the config is still loading', () => {
    storeUser('auth0|me');
    mockGetRuntimeConfig.mockReturnValue(new Promise(() => undefined));
    render(<MantineProvider env="test"><AuthProvider><AuthProbe /></AuthProvider></MantineProvider>);
    expect(screen.getByTestId('auth')).toHaveTextContent('true|true|auth0|me');
  });

  it('cannot send a request while launching: the token is a sign-in that has not happened yet', async () => {
    storeUser('auth0|me');
    mockGetRuntimeConfig.mockReturnValue(new Promise(() => undefined));
    let getToken: () => Promise<string | undefined> = async () => undefined;
    function Capture() { getToken = useAuth().getToken; return null; }
    render(<MantineProvider env="test"><AuthProvider><Capture /></AuthProvider></MantineProvider>);
    await expect(getToken()).rejects.toMatchObject({ error: 'login_required' });
  });

  it('still shows the error when nobody has signed in on this device', async () => {
    mockGetRuntimeConfig.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<MantineProvider env="test"><AuthProvider><AuthProbe /></AuthProvider></MantineProvider>);
    expect(await screen.findByText(/could not start/i)).toBeInTheDocument();
  });

  it('hands over to the real provider once the config loads', async () => {
    storeUser('auth0|me');
    mockGetRuntimeConfig.mockResolvedValue({ auth: 'auth0', domain: 't.example.com', clientId: 'cid', audience: 'aud' });
    render(<MantineProvider env="test"><AuthProvider><span>app</span></AuthProvider></MantineProvider>);
    expect(await screen.findByTestId('auth0')).toBeInTheDocument();
  });
});
