import { err } from '../api/http';
import { initStore } from '../store';
import { originAllowed, readSessionCookie } from './cookies';
import { isSetupOpen, readSession } from './localData';
import { handleAuthRoute } from './routes';
import type { AuthRouteContext } from './routes';
import { SetupCode } from './setupCode';
import type { AuthProvider } from './types';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

// The container shows the code through these hooks (a boxed log block plus a file). Without hooks the code is one log line.
export interface CodeHooks {
  announce(code: string, kind: 'setup'): void;
  // The code was used or is dead: remove any copy of it.
  retire(): void;
}

export interface LocalProviderOptions {
  hooks?: CodeHooks;
}

function logCode(code: string): void {
  // The one place a secret is logged, and only so the person who deployed the instance can read it.
  console.log(`First-run setup: open the app and enter this setup code to create your account: ${code}`);
}

// Starting the provider never signs anyone out and never reopens setup. The one-time code exists only while the first account
// does not, and a forgotten password is reset from the command line (`store-cli reset-password <email>`), not from the app.
export async function createLocalProvider(env: NodeJS.ProcessEnv, options: LocalProviderOptions = {}): Promise<AuthProvider> {
  const store = await initStore(env);
  const { hooks } = options;

  const setupCode = (await isSetupOpen(store)) ? SetupCode.generate() : undefined;
  if (setupCode) {
    if (hooks) hooks.announce(setupCode.reveal(), 'setup');
    else logCode(setupCode.reveal());
  }

  const secureCookie = env.COOKIE_SECURE !== 'false';
  const appOrigin = env.APP_ORIGIN || undefined;
  const ctx: AuthRouteContext = {
    store, setupCode, onCodeUsed: hooks ? () => hooks.retire() : undefined, secureCookie, appOrigin, nowSeconds,
  };

  return {
    mode: 'local',
    handlePublic: event => handleAuthRoute(event, ctx),

    async authenticate(event) {
      if (!originAllowed(event, appOrigin)) return { rejection: err(403, 'Forbidden') };
      const session = await readSession(store, readSessionCookie(event, secureCookie), nowSeconds());
      if (!session) return { rejection: err(401, 'Unauthorized') };
      return { userId: session.userId };
    },
  };
}
