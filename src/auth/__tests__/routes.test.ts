import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { createInvite } from '../../household/invites';
import { MemoryStore } from '../../store/memory';
import { handleAuthRoute } from '../routes';
import type { AuthRouteContext } from '../routes';
import { SetupCode } from '../setupCode';
import { createFirstAccount, createSession, getAccountByEmail, hashToken, isSetupOpen, throttleRemaining } from '../localData';

const PASSWORD = 'a perfectly fine password';
let store: MemoryStore;
let setupCode: SetupCode;
let now: number;
let ctx: AuthRouteContext;

function post(path: string, body: unknown, over: { cookie?: string; origin?: string | null } = {}): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { host: 'hearth.example.com' };
  if (over.origin !== null) headers.origin = over.origin ?? 'https://hearth.example.com';
  return {
    rawPath: path,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
    cookies: over.cookie ? [over.cookie] : undefined,
    requestContext: { routeKey: `POST ${path}`, http: { method: 'POST', sourceIp: '203.0.113.9' } },
  } as unknown as APIGatewayProxyEventV2;
}

function get(path: string, cookie?: string): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    headers: { host: 'hearth.example.com' },
    cookies: cookie ? [cookie] : undefined,
    requestContext: { routeKey: `GET ${path}`, http: { method: 'GET', sourceIp: '203.0.113.9' } },
  } as unknown as APIGatewayProxyEventV2;
}

const send = async (event: APIGatewayProxyEventV2) => (await handleAuthRoute(event, ctx))!;
const cookieValue = (res: { cookies?: string[] } | undefined): string => (res?.cookies?.[0] ?? '').split(';')[0];
const json = (res: { body: string }) => JSON.parse(res.body);

beforeEach(() => {
  store = new MemoryStore();
  setupCode = SetupCode.generate();
  now = 1_800_000_000;
  ctx = { store, setupCode, secureCookie: true, nowSeconds: () => now };
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const setupBody = (over: Record<string, unknown> = {}) => ({ code: setupCode.reveal(), email: 'Me@Example.com', password: PASSWORD, displayName: 'Sam', ...over });
const account = (email = 'me@example.com') => createFirstAccount(store, { email, password: PASSWORD, displayName: 'Sam', nowMs: now * 1000 });

// A further account, written the way an invited sign-up writes one (first-run setup is closed after the first).
async function secondAccount(email: string, userId = `local|${email}`) {
  const { hashPassword } = await import('../password');
  const created = { userId, email, displayName: 'Bea', ...(await hashPassword(PASSWORD)), createdAt: new Date().toISOString() };
  await store.put({ PK: `AUTH#ACCOUNT#${email}`, SK: 'PROFILE', ...created });
  return created;
}

describe('routes that do not belong to auth', () => {
  it('return undefined, so the normal pipeline handles them', async () => {
    expect(await handleAuthRoute(get('/api/categories'), ctx)).toBeUndefined();
    expect(await handleAuthRoute(get('/api/auth/nope'), ctx)).toBeUndefined();
    expect(await handleAuthRoute(get('/api/auth/recover'), ctx)).toBeUndefined();
  });
});

describe('GET /api/auth/status', () => {
  it('says setup is required until the first account exists, and says nothing about recovery', async () => {
    expect(json(await send(get('/api/auth/status')))).toEqual({ setupRequired: true });
    await account();
    expect(json(await send(get('/api/auth/status')))).toEqual({ setupRequired: false });
  });
});

describe('POST /api/auth/setup', () => {
  it('creates the account, starts a session, and sets a hardened cookie', async () => {
    const res = await send(post('/api/auth/setup', setupBody()));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ email: 'me@example.com', displayName: 'Sam' });
    expect(res.cookies![0]).toMatch(/HttpOnly.*SameSite=Strict/);
    expect((await getAccountByEmail(store, 'me@example.com'))?.displayName).toBe('Sam');
  });

  it('refuses a wrong code and creates nothing', async () => {
    const res = await send(post('/api/auth/setup', setupBody({ code: 'wrong' })));
    expect(res.statusCode).toBe(403);
    expect(await isSetupOpen(store)).toBe(true);
  });

  it('is closed for good once an account exists, for another email too', async () => {
    const secondAttempt = setupBody({ email: 'x@example.com' });
    await send(post('/api/auth/setup', setupBody()));
    const again = await send(post('/api/auth/setup', secondAttempt));
    expect(again.statusCode).toBe(409);
    expect(await getAccountByEmail(store, 'x@example.com')).toBeUndefined();
  });

  it('makes exactly one account when two setups race', async () => {
    const [a, b] = await Promise.all([
      send(post('/api/auth/setup', setupBody({ email: 'a@example.com' }))),
      send(post('/api/auth/setup', setupBody({ email: 'b@example.com' }))),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
  });

  it.each([
    ['a short password', { password: 'short' }, 'password'],
    ['a 10,000-character password', { password: 'x'.repeat(10_000) }, 'password'],
    ['a missing email', { email: undefined }, 'email'],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['an email with a hash in it', { email: 'a#b@example.com' }, 'email'],
    ['a 300-character email', { email: `${'a'.repeat(300)}@example.com` }, 'email'],
    ['no display name', { displayName: undefined }, 'displayName'],
    ['a blank display name', { displayName: '   ' }, 'displayName'],
    ['a 41-character display name', { displayName: 'x'.repeat(41) }, 'displayName'],
  ])('rejects %s with 400 naming the field, and creates nothing', async (_label, over, field) => {
    const res = await send(post('/api/auth/setup', setupBody(over)));
    expect(res.statusCode).toBe(400);
    expect(json(res)).toMatchObject({ error: 'invalid', field, message: expect.any(String) });
    expect(await isSetupOpen(store)).toBe(true);
  });

  it('rejects a body that is not a JSON object', async () => {
    expect((await send(post('/api/auth/setup', '[1,2]'))).statusCode).toBe(400);
    expect((await send(post('/api/auth/setup', '{oops'))).statusCode).toBe(400);
  });

  it('refuses a request from another origin, or with none', async () => {
    expect((await send(post('/api/auth/setup', setupBody(), { origin: 'https://evil.example.com' }))).statusCode).toBe(403);
    expect((await send(post('/api/auth/setup', setupBody(), { origin: null }))).statusCode).toBe(403);
    expect(await isSetupOpen(store)).toBe(true);
  });

  it('discards the setup code after use', async () => {
    const code = setupCode.reveal();
    await send(post('/api/auth/setup', setupBody()));
    expect(setupCode.matches(code)).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => { await account(); });

  it('signs in with the right credentials, whatever the email case or spacing', async () => {
    const res = await send(post('/api/auth/login', { email: '  ME@example.com ', password: PASSWORD }));
    expect(res.statusCode).toBe(200);
    expect(cookieValue(res)).toMatch(/^__Host-hearthwise_session=.+/);
    expect(json(res)).toMatchObject({ email: 'me@example.com', displayName: 'Sam' });
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const wrongPassword = await send(post('/api/auth/login', { email: 'me@example.com', password: 'not the password' }));
    const wrongEmail = await send(post('/api/auth/login', { email: 'who@example.com', password: PASSWORD }));
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongEmail.statusCode).toBe(401);
    expect(wrongPassword.body).toBe(wrongEmail.body);
    expect(wrongPassword.cookies).toBeUndefined();
  });

  it('lets two accounts sign in separately', async () => {
    await secondAccount('bea@example.com');
    const a = await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }));
    const b = await send(post('/api/auth/login', { email: 'bea@example.com', password: PASSWORD }));
    expect(json(a).userId).not.toBe(json(b).userId);
  });

  it('throttles one email after repeated failures, even for the right password, then recovers', async () => {
    for (let i = 0; i < 4; i += 1) await send(post('/api/auth/login', { email: 'me@example.com', password: 'wrong wrong wrong' }));
    const blocked = await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }));
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBe('1');
    now += 1;
    expect((await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }))).statusCode).toBe(200);
  });

  it('never lets one email\'s throttle lock another', async () => {
    await secondAccount('bea@example.com');
    for (let i = 0; i < 6; i += 1) await send(post('/api/auth/login', { email: 'me@example.com', password: 'wrong wrong wrong' }));
    expect((await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }))).statusCode).toBe(429);
    expect((await send(post('/api/auth/login', { email: 'bea@example.com', password: PASSWORD }))).statusCode).toBe(200);
  });

  it('clears the throttle on success, for that email', async () => {
    await send(post('/api/auth/login', { email: 'me@example.com', password: 'wrong wrong wrong' }));
    await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }));
    expect(await throttleRemaining(store, 'me@example.com', now)).toBe(0);
    expect(await store.get({ PK: 'AUTH#THROTTLE#me@example.com', SK: 'LOGIN' })).toBeUndefined();
  });

  it('holds the throttle under a burst of simultaneous wrong passwords', async () => {
    const burst = await Promise.all(Array.from({ length: 8 }, () => send(post('/api/auth/login', { email: 'me@example.com', password: 'wrong wrong wrong' }))));
    const codes = burst.map(res => res.statusCode);
    expect(codes.filter(code => code === 429).length).toBeGreaterThanOrEqual(1);
    expect(codes.filter(code => code === 401).length).toBeLessThanOrEqual(4);
    expect(await throttleRemaining(store, 'me@example.com', now)).toBeGreaterThan(0);
  });

  it('refuses an over-long password without hashing it', async () => {
    expect((await send(post('/api/auth/login', { email: 'me@example.com', password: 'x'.repeat(10_000) }))).statusCode).toBe(401);
  });

  it.each([
    ['255 characters', `${'a'.repeat(243)}@example.com`],
    ['a hash', 'a#b@example.com'],
    ['a NUL', 'a\0b@example.com'],
    ['no at sign', 'plain'],
  ])('answers 401 for an email with %s, and writes no throttle row', async (_name, email) => {
    const res = await send(post('/api/auth/login', { email, password: PASSWORD }));
    expect(res.statusCode).toBe(401);
    expect(json(res)).toEqual({ error: 'Invalid email or password' });
    expect(await store.query(`AUTH#THROTTLE#${email.trim().toLowerCase()}`)).toEqual([]);
  });

  it('treats a stored record that cannot be verified as a failed login, not a 500, and logs a fixed message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await store.patch({ PK: 'AUTH#ACCOUNT#me@example.com', SK: 'PROFILE' }, { N: 3 }, { mustExist: true });
    const res = await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }));
    expect(res.statusCode).toBe(401);
    expect(res.cookies).toBeUndefined();
    expect(error).toHaveBeenCalledWith('Stored account password record could not be verified:', expect.any(String));
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain('me@example.com');
  });

  it('does not deadlock later logins after the corrupt-record path', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const key = { PK: 'AUTH#ACCOUNT#me@example.com', SK: 'PROFILE' };
    await store.patch(key, { N: 3 }, { mustExist: true });
    await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }));
    await store.patch(key, { N: 2 ** 15 }, { mustExist: true });
    now += 60;
    expect((await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }))).statusCode).toBe(200);
  });

  it('refuses a request from another origin', async () => {
    expect((await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD }, { origin: 'https://evil.example.com' }))).statusCode).toBe(403);
  });
});

describe('POST /api/auth/signup-with-invite', () => {
  let token: string;
  let inviter: { userId: string };

  beforeEach(async () => {
    inviter = await account();
    await createHousehold(store, { userId: inviter.userId, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: now * 1000 }, vi.fn());
    ({ token } = await createInvite(store, (await loadContext(store, inviter.userId))!, now * 1000));
  });

  const signup = (over: Record<string, unknown> = {}, opts?: { origin?: string | null }) =>
    send(post('/api/auth/signup-with-invite', { token, email: 'Bea@Example.com', password: PASSWORD, displayName: 'Bea', ...over }, opts));

  it('CUJ 1: creates the account in the inviter\'s household and signs it in', async () => {
    const res = await signup();
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ email: 'bea@example.com', displayName: 'Bea' });
    const me = await send(get('/api/auth/me', cookieValue(res)));
    expect(me.statusCode).toBe(200);
    const created = await getAccountByEmail(store, 'bea@example.com');
    expect((await loadContext(store, created!.userId))?.members.map(member => member.displayName).sort()).toEqual(['Bea', 'Sam']);
  });

  it('works only once for a link', async () => {
    await signup();
    const second = await signup({ email: 'cat@example.com' });
    expect(second.statusCode).toBe(410);
    expect(await getAccountByEmail(store, 'cat@example.com')).toBeUndefined();
  });

  it('answers 409 email_taken for an email that already has an account, and does not use up the invite', async () => {
    const taken = await signup({ email: 'ME@example.com' });
    expect(taken.statusCode).toBe(409);
    expect(json(taken)).toEqual({ error: 'email_taken' });
    expect(taken.cookies).toBeUndefined();
    expect((await signup()).statusCode).toBe(200);
  });

  it('answers 410 for an expired link and creates no account', async () => {
    now += 8 * 24 * 60 * 60;
    const res = await signup();
    expect(res.statusCode).toBe(410);
    expect(json(res)).toEqual({ error: 'invite_expired' });
    expect(await getAccountByEmail(store, 'bea@example.com')).toBeUndefined();
  });

  it.each([
    ['empty', ''], ['42 characters', 'A'.repeat(42)], ['44 characters', 'A'.repeat(44)], ['10 KB', 'A'.repeat(10_240)], ['a number', 5], ['null', null],
  ])('answers 410 for a token that is %s, without hashing the password', async (_name, bad) => {
    const res = await signup({ token: bad });
    expect(res.statusCode).toBe(410);
    expect(await getAccountByEmail(store, 'bea@example.com')).toBeUndefined();
  });

  it('answers 410 when there is no token', async () => {
    expect((await signup({ token: undefined })).statusCode).toBe(410);
  });

  it.each([
    ['a short password', { password: 'short' }, 'password'],
    ['an invalid email', { email: 'nope' }, 'email'],
    ['an email with a hash', { email: 'a#b@example.com' }, 'email'],
    ['no display name', { displayName: '' }, 'displayName'],
  ])('rejects %s with 400 naming the field', async (_name, over, field) => {
    const res = await signup(over);
    expect(res.statusCode).toBe(400);
    expect(json(res)).toMatchObject({ error: 'invalid', field });
  });

  it('refuses a request from another origin', async () => {
    expect((await signup({}, { origin: 'https://evil.example.com' })).statusCode).toBe(403);
    expect(await getAccountByEmail(store, 'bea@example.com')).toBeUndefined();
  });

  it('is a POST route like the others: a GET is not handled here', async () => {
    expect(await handleAuthRoute(get('/api/auth/signup-with-invite'), ctx)).toBeUndefined();
  });
});

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  async function signIn(): Promise<string> {
    await account();
    return cookieValue(await send(post('/api/auth/login', { email: 'me@example.com', password: PASSWORD })));
  }

  it('says who is signed in, with their display name', async () => {
    const res = await send(get('/api/auth/me', await signIn()));
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({ email: 'me@example.com', displayName: 'Sam', userId: expect.stringMatching(/^local\|/) });
  });

  it('answers 401 with no cookie or an unknown one', async () => {
    await signIn();
    expect((await send(get('/api/auth/me'))).statusCode).toBe(401);
    expect((await send(get('/api/auth/me', '__Host-hearthwise_session=bogus'))).statusCode).toBe(401);
  });

  it('answers 401 when the session\'s account no longer exists', async () => {
    const cookie = await signIn();
    await store.delete({ PK: 'AUTH#ACCOUNT#me@example.com', SK: 'PROFILE' });
    expect((await send(get('/api/auth/me', cookie))).statusCode).toBe(401);
  });

  it('ends the session on logout and clears the cookie', async () => {
    const cookie = await signIn();
    const out = await send(post('/api/auth/logout', {}, { cookie }));
    expect(out.cookies![0]).toContain('Max-Age=0');
    expect((await send(get('/api/auth/me', cookie))).statusCode).toBe(401);
  });

  it('keeps the session when logout comes from another origin', async () => {
    const cookie = await signIn();
    expect((await send(post('/api/auth/logout', {}, { cookie, origin: 'https://evil.example.com' }))).statusCode).toBe(403);
    expect((await send(get('/api/auth/me', cookie))).statusCode).toBe(200);
  });

  it('answers 401 once the session has expired', async () => {
    const cookie = await signIn();
    now += 31 * 24 * 60 * 60;
    expect((await send(get('/api/auth/me', cookie))).statusCode).toBe(401);
  });
});

describe('what reaches the logs and the database', () => {
  it('never logs the password, the cookie, the setup code or an invite token', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined));
    const secretPassword = 'the-secret-password-123';
    const code = setupCode.reveal();
    const setup = await send(post('/api/auth/setup', setupBody({ password: secretPassword })));
    await send(post('/api/auth/login', { email: 'me@example.com', password: 'wrong wrong wrong' }));
    await send(post('/api/auth/login', { email: 'me@example.com', password: secretPassword }));
    const owner = (await getAccountByEmail(store, 'me@example.com'))!;
    await createHousehold(store, { userId: owner.userId, name: 'Home', timezone: 'Europe/London', displayName: 'Sam' }, vi.fn());
    const { token } = await createInvite(store, (await loadContext(store, owner.userId))!);
    await send(post('/api/auth/signup-with-invite', { token, email: 'bea@example.com', password: secretPassword, displayName: 'Bea' }));

    const logged = JSON.stringify(spies.flatMap(spy => spy.mock.calls));
    for (const secret of [secretPassword, code, token, cookieValue(setup), cookieValue(setup).split('=')[1]]) expect(logged).not.toContain(secret);
    expect(logged).not.toContain('bea@example.com');
  });

  it('stores only the hash of the cookie value', async () => {
    const res = await send(post('/api/auth/setup', setupBody()));
    const token = cookieValue(res).split('=')[1];
    const rows = await store.query('AUTH#SESSIONS');
    expect(rows.map(row => row.SK)).toContain(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe('sessions across accounts', () => {
  it('keeps one account\'s session valid when another signs out', async () => {
    const a = await account();
    const b = await secondAccount('bea@example.com', 'local|second');
    const tokenA = await createSession(store, a, now);
    const tokenB = await createSession(store, b, now);
    await send(post('/api/auth/logout', {}, { cookie: `__Host-hearthwise_session=${tokenB}` }));
    expect((await send(get('/api/auth/me', `__Host-hearthwise_session=${tokenA}`))).statusCode).toBe(200);
  });
});
