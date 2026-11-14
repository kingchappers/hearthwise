import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { resetTestStore, useTestStore } from '../../store/testing';
import type { SqliteStore } from '../../store/sqlite';
import { createFirstAccount, createSession } from '../localData';
import { createLocalProvider } from '../local';
import { initAuth, setAuth } from '..';
import { handler } from '../../../api-handler';

let store: SqliteStore;
const now = () => Math.floor(Date.now() / 1000);

function event(over: { method?: string; cookie?: string; origin?: string } = {}): APIGatewayProxyEventV2 {
  return {
    rawPath: '/api/categories',
    headers: { host: 'hearth.example.com', ...(over.origin ? { origin: over.origin } : {}) },
    cookies: over.cookie ? [over.cookie] : undefined,
    requestContext: { routeKey: 'GET /x', http: { method: over.method ?? 'GET' } },
  } as unknown as APIGatewayProxyEventV2;
}

beforeEach(() => {
  store = useTestStore();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  resetTestStore();
  setAuth(undefined);
  vi.restoreAllMocks();
});

describe('createLocalProvider', () => {
  it('logs the setup code exactly once when there is no account, and never when there is', async () => {
    const log = vi.mocked(console.log);
    await createLocalProvider({ STORE: 'sqlite', SQLITE_PATH: ':memory:' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toMatch(/setup code/i);

    log.mockClear();
    await createFirstAccount(store, { email: 'me@example.com', password: 'a long enough password', displayName: 'Sam' });
    await createLocalProvider({ STORE: 'sqlite', SQLITE_PATH: ':memory:' });
    expect(log).not.toHaveBeenCalled();
  });

  it('authenticates a live session cookie', async () => {
    const provider = await createLocalProvider({});
    const token = await createSession(store, { userId: 'local|u1', email: 'me@example.com' }, now());
    expect(await provider.authenticate(event({ cookie: `__Host-hearthwise_session=${token}` }))).toEqual({ userId: 'local|u1' });
  });

  it.each([
    ['no cookie', undefined],
    ['an unknown cookie', '__Host-hearthwise_session=bogus'],
  ])('answers 401 for %s', async (_label, cookie) => {
    const provider = await createLocalProvider({});
    const result = await provider.authenticate(event({ cookie }));
    expect('rejection' in result && result.rejection.statusCode).toBe(401);
  });

  it('answers 403 for a state-changing request from another origin, even with a valid cookie', async () => {
    const provider = await createLocalProvider({});
    const token = await createSession(store, { userId: 'local|u1', email: 'me@example.com' }, now());
    const result = await provider.authenticate(event({ method: 'DELETE', cookie: `__Host-hearthwise_session=${token}`, origin: 'https://evil.example.com' }));
    expect('rejection' in result && result.rejection.statusCode).toBe(403);
  });

  it('refuses a POST without an Origin header, at handler level', async () => {
    setAuth(await createLocalProvider({}));
    const token = await createSession(store, { userId: 'local|u1', email: 'me@example.com' }, now());
    const send = (method: string, path: string) => handler({
      rawPath: path,
      headers: { host: 'hearth.example.com' },
      cookies: [`__Host-hearthwise_session=${token}`],
      body: '{}',
      requestContext: { routeKey: 'ANY /api/{proxy+}', http: { method, sourceIp: '198.51.100.9' } },
    } as unknown as APIGatewayProxyEventV2, {} as never, () => {}) as Promise<{ statusCode: number }>;
    expect((await send('POST', '/api/health')).statusCode).toBe(403);
    // GET is a safe method, so the provider's Origin check does not apply to it; the session still does.
    expect((await send('GET', '/api/health')).statusCode).toBe(200);
  });

  it('ignores a plain hearthwise_session cookie while cookies are Secure', async () => {
    const provider = await createLocalProvider({});
    const token = await createSession(store, { userId: 'local|u1', email: 'me@example.com' }, now());
    const result = await provider.authenticate(event({ cookie: `hearthwise_session=${token}` }));
    expect('rejection' in result && result.rejection.statusCode).toBe(401);
  });

  it('uses the plain name when COOKIE_SECURE=false', async () => {
    const provider = await createLocalProvider({ COOKIE_SECURE: 'false' });
    const token = await createSession(store, { userId: 'local|u1', email: 'me@example.com' }, now());
    expect(await provider.authenticate(event({ cookie: `hearthwise_session=${token}` }))).toEqual({ userId: 'local|u1' });
    const hosted = await provider.authenticate(event({ cookie: `__Host-hearthwise_session=${token}` }));
    expect('rejection' in hosted && hosted.rejection.statusCode).toBe(401);
  });

  it('checks Origin against APP_ORIGIN, not the Host header, for state-changing requests', async () => {
    const provider = await createLocalProvider({ APP_ORIGIN: 'https://hearth.example.com' });
    const token = await createSession(store, { userId: 'local|u1', email: 'me@example.com' }, now());
    const cookie = `__Host-hearthwise_session=${token}`;
    const ok = await provider.authenticate(event({ method: 'DELETE', cookie, origin: 'https://hearth.example.com' }));
    expect(ok).toEqual({ userId: 'local|u1' });
    const bad = await provider.authenticate(event({ method: 'DELETE', cookie, origin: 'https://hearth.example.com.evil.test' }));
    expect('rejection' in bad && bad.rejection.statusCode).toBe(403);
  });

  it('is what initAuth loads for AUTH_MODE=local', async () => {
    const provider = await initAuth({ AUTH_MODE: 'local' });
    expect(typeof provider.handlePublic).toBe('function');
  });
});

function publicEvent(method: string, path: string, body?: unknown): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { host: 'hearth.example.com', origin: 'https://hearth.example.com' },
    requestContext: { routeKey: `${method} ${path}`, http: { method } },
  } as unknown as APIGatewayProxyEventV2;
}

const makeHooks = () => ({ announce: vi.fn(), retire: vi.fn() });

describe('createLocalProvider code hooks', () => {
  it('hands the first-run code to the hooks instead of logging it', async () => {
    const hooks = makeHooks();
    await createLocalProvider({}, { hooks });
    expect(hooks.announce).toHaveBeenCalledTimes(1);
    expect(hooks.announce).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9_-]{12}$/), 'setup');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('announces nothing when an account exists', async () => {
    await createFirstAccount(store, { email: 'me@example.com', password: 'a long enough password', displayName: 'Sam' });
    const hooks = makeHooks();
    await createLocalProvider({}, { hooks });
    expect(hooks.announce).not.toHaveBeenCalled();
  });

  it('ignores a recovery flag from an older caller: an existing account is never given a code', async () => {
    await createFirstAccount(store, { email: 'me@example.com', password: 'a long enough password', displayName: 'Sam' });
    const hooks = makeHooks();
    await createLocalProvider({}, { hooks, recovery: true } as never);
    expect(hooks.announce).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('keeps every session when the provider starts: nothing signs people out', async () => {
    const account = await createFirstAccount(store, { email: 'me@example.com', password: 'a long enough password', displayName: 'Sam' });
    const token = await createSession(store, account, now());
    const provider = await createLocalProvider({}, { hooks: makeHooks() });
    expect(await provider.authenticate(event({ cookie: `__Host-hearthwise_session=${token}` }))).toEqual({ userId: account.userId });
  });

  it('tells the hooks when the code is used', async () => {
    const hooks = makeHooks();
    const provider = await createLocalProvider({}, { hooks });
    const code = hooks.announce.mock.calls[0][0] as string;
    const res = await provider.handlePublic!(publicEvent('POST', '/api/auth/setup', { code, email: 'me@example.com', password: 'a perfectly fine password', displayName: 'Sam' }));
    expect(res?.statusCode).toBe(200);
    expect(hooks.retire).toHaveBeenCalledTimes(1);
  });
});
