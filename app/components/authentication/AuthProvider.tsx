import { useEffect, useState } from 'react';
import { Auth0Provider } from '@auth0/auth0-react';
import { Center, Loader, Text } from '@mantine/core';
import { LocalAuthContext } from '~/lib/auth';
import type { AuthState } from '~/lib/auth';
import { readStoredUser } from '~/lib/persistedCache';
import { getRuntimeConfig, peekRuntimeConfig } from '~/lib/runtimeConfig';
import type { RuntimeConfig } from '~/lib/runtimeConfig';
import { LocalAuthProvider } from './LocalAuthProvider';

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; config: RuntimeConfig };

// What a person who signed in before sees while the app is still working out whether they still are: their saved lists, with
// writes waiting. Nothing can be sent yet, because a token is exactly what is missing.
function launchingState(userId: string): AuthState {
  return {
    mode: 'auth0',
    isAuthenticated: true,
    isLoading: false,
    launching: true,
    user: { sub: userId },
    login: () => undefined,
    logout: () => undefined,
    getToken: () => Promise.reject(Object.assign(new Error('Signing in'), { error: 'login_required' })),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>(() => {
    // Every route mounts its own layout; once the config is known there is nothing to wait for.
    const config = peekRuntimeConfig();
    return config ? { status: 'ready', config } : { status: 'loading' };
  });

  useEffect(() => {
    if (loaded.status === 'ready') return;
    let cancelled = false;
    getRuntimeConfig().then(
      config => { if (!cancelled) setLoaded({ status: 'ready', config }); },
      (error: unknown) => {
        console.error('Could not load the app configuration:', error);
        if (!cancelled) setLoaded({ status: 'error' });
      },
    );
    return () => { cancelled = true; };
  }, []);

  // Someone who signed in before sees their saved lists straight away, with no signal or while the settings load, instead of a
  // loading or error screen.
  const storedUser = loaded.status === 'ready' ? undefined : readStoredUser();
  if (storedUser) return <LocalAuthContext.Provider value={launchingState(storedUser)}>{children}</LocalAuthContext.Provider>;

  if (loaded.status === 'loading') {
    return <Center mih="100vh"><Loader aria-label="Starting the app" /></Center>;
  }
  if (loaded.status === 'error') {
    return <Center mih="100vh" p="md"><Text>The app could not start because its configuration did not load. Check your connection and reload.</Text></Center>;
  }

  const { config } = loaded;
  if (config.auth === 'local') return <LocalAuthProvider>{children}</LocalAuthProvider>;

  return (
    <Auth0Provider
      domain={config.domain}
      clientId={config.clientId}
      // The default in-memory cache forces a silent-auth iframe on every reload,
      // which browsers block as a third-party cookie. Persist instead and renew
      // with a rotating refresh token.
      cacheLocation="localstorage"
      useRefreshTokens
      useRefreshTokensFallback={false}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: config.audience,
        scope: 'openid profile email offline_access',
      }}
    >
      {children}
    </Auth0Provider>
  );
}
