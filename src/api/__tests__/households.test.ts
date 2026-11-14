import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { MemoryStore } from '../../store/memory';
import { setStore } from '../../store';
import { createRouter, type Router } from '../router';
import { registerHouseholdRoutes } from '../households';

let router: Router;

function event(method: string, path: string, body?: unknown, query?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    requestContext: { http: { method } },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: 'hearth.example.com' },
    queryStringParameters: query ?? {},
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

// Every write carries a mutation id. `call` adds one unless the body already has one (or is not an object), so each test
// reads as before; `callRaw` sends exactly what it is given, for the tests about the id itself.
let sequence = 0;
const nextMutationId = (): string => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;

async function callRaw(userId: string, method: string, path: string, body?: unknown, query?: Record<string, string>) {
  const res = await router.dispatch(event(method, path, body, query), userId);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
}

async function call(userId: string, method: string, path: string, body?: unknown, query?: Record<string, string>) {
  const isWrite = method !== 'GET';
  const plain = body === undefined || (typeof body === 'object' && body !== null && !Array.isArray(body));
  const withId = isWrite && plain && !(body && 'mutationId' in (body as object)) ? { ...(body as object | undefined), mutationId: nextMutationId() } : body;
  return callRaw(userId, method, path, withId, query);
}

const create = { name: 'Home', displayName: 'Sam', timezone: 'Europe/London' };

beforeEach(() => {
  setStore(new MemoryStore());
  router = createRouter();
  registerHouseholdRoutes(router);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  setStore(undefined);
  vi.restoreAllMocks();
});

describe('POST /api/households', () => {
  it('creates a household for a person who has none', async () => {
    const res = await call('auth0|u1', 'POST', '/api/households', create);
    expect(res.status).toBe(201);
    expect(res.json.householdId).toEqual(expect.any(String));
  });

  it('answers 409 already_member for someone who belongs to one', async () => {
    await call('auth0|u1', 'POST', '/api/households', create);
    const res = await call('auth0|u1', 'POST', '/api/households', { ...create, name: 'Second' });
    expect(res).toEqual({ status: 409, json: { error: 'already_member' } });
  });

  it.each([
    ['a missing name', { displayName: 'Sam', timezone: 'Europe/London' }, 'name'],
    ['an over-long name', { ...create, name: 'x'.repeat(61) }, 'name'],
    ['a missing display name', { name: 'Home', timezone: 'Europe/London' }, 'displayName'],
    ['an empty display name', { ...create, displayName: '  ' }, 'displayName'],
    ['an unknown time zone', { ...create, timezone: 'Mars/Olympus' }, 'timezone'],
    ['a bad mutation id', { ...create, mutationId: 'nope' }, 'mutationId'],
  ])('rejects %s with 400 naming the field', async (_name, body, field) => {
    const res = await call('auth0|u1', 'POST', '/api/households', body);
    expect(res).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it.each(['not json', '[]', '"text"', 'null'])('rejects the body %j as invalid', async body => {
    const res = await call('auth0|u1', 'POST', '/api/households', body);
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: 'invalid', field: 'body' });
  });

  it('accepts a mutation id that is a UUID', async () => {
    const res = await call('auth0|u1', 'POST', '/api/households', { ...create, mutationId: '0190a2b4-7c3e-7f10-9a11-2b3c4d5e6f70' });
    expect(res.status).toBe(201);
  });

  it('raises one household_created alert in the log, with no name', async () => {
    await call('auth0|u1', 'POST', '/api/households', create);
    const lines = vi.mocked(console.log).mock.calls.map(call => String(call[0])).filter(line => line.includes('security_event'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('household_created');
    expect(lines[0]).not.toMatch(/Home|Sam/);
  });
});

describe('GET /api/hh', () => {
  it('is 403 no_household before the person has a household', async () => {
    expect(await call('auth0|u1', 'GET', '/api/hh')).toEqual({ status: 403, json: { error: 'no_household' } });
  });

  it('returns the household, the members and the caller with their settings', async () => {
    await call('auth0|u1', 'POST', '/api/households', create);
    const { status, json } = await call('auth0|u1', 'GET', '/api/hh');
    expect(status).toBe(200);
    expect(json.household).toMatchObject({ name: 'Home', timezone: 'Europe/London', createdBy: 'auth0|u1', memberCount: 1 });
    expect(json.members).toEqual([{ userId: 'auth0|u1', displayName: 'Sam', joinedAt: expect.any(String) }]);
    expect(json.me).toMatchObject({ userId: 'auth0|u1', displayName: 'Sam', settings: { defaultView: 'list' } });
  });

  it('ignores a household id in the query, and returns the caller\'s own household', async () => {
    const a = await call('auth0|a', 'POST', '/api/households', { ...create, name: 'A home' });
    const b = await call('auth0|b', 'POST', '/api/households', { ...create, name: 'B home' });
    const res = await call('auth0|a', 'GET', '/api/hh', undefined, { householdId: b.json.householdId, hid: b.json.householdId });
    expect(res.json.household.name).toBe('A home');
    expect(a.json.householdId).not.toBe(b.json.householdId);
  });

  it('never shows one household to a member of another', async () => {
    await call('auth0|a', 'POST', '/api/households', { ...create, name: 'A home' });
    await call('auth0|b', 'POST', '/api/households', { ...create, name: 'B home', displayName: 'Bea' });
    const res = await call('auth0|b', 'GET', '/api/hh');
    expect(JSON.stringify(res.json)).not.toContain('A home');
  });
});

describe('PATCH /api/hh/members/me', () => {
  beforeEach(async () => { await call('auth0|u1', 'POST', '/api/households', create); });

  it('is 403 no_household for a person without one', async () => {
    expect(await call('auth0|stranger', 'PATCH', '/api/hh/members/me', { displayName: 'X' })).toEqual({ status: 403, json: { error: 'no_household' } });
  });

  it('changes and keeps the display name and settings', async () => {
    const res = await call('auth0|u1', 'PATCH', '/api/hh/members/me', { displayName: 'Samuel', settings: { digest: { on: true, hour: 20 }, defaultView: 'next' } });
    expect(res.status).toBe(200);
    expect(res.json.me).toMatchObject({ displayName: 'Samuel', settings: { digest: { on: true, hour: 20 }, defaultView: 'next' } });
    const after = await call('auth0|u1', 'GET', '/api/hh');
    expect(after.json.me.settings.digest).toEqual({ on: true, hour: 20 });
    expect(after.json.members[0].displayName).toBe('Samuel');
  });

  it.each([
    ['an hour of 24', { settings: { digest: { hour: 24 } } }, 'settings.digest.hour'],
    ['an unknown default view', { settings: { defaultView: 'grid' } }, 'settings.defaultView'],
    ['an unknown key', { role: 'admin' }, 'role'],
    ['a household id in the body', { householdId: 'other', displayName: 'X' }, 'householdId'],
    ['an empty patch', {}, 'body'],
    ['a bad mutation id', { displayName: 'X', mutationId: 'nope' }, 'mutationId'],
  ])('rejects %s', async (_name, body, field) => {
    expect(await call('auth0|u1', 'PATCH', '/api/hh/members/me', body)).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('accepts an optional mutation id that is a UUID and ignores it', async () => {
    const res = await call('auth0|u1', 'PATCH', '/api/hh/members/me', { displayName: 'Samuel', mutationId: '0190a2b4-7c3e-7f10-9a11-2b3c4d5e6f70' });
    expect(res.status).toBe(200);
  });

  it('leaves the other member\'s settings alone', async () => {
    const store = new MemoryStore();
    setStore(store);
    router = createRouter();
    registerHouseholdRoutes(router);
    await call('auth0|u1', 'POST', '/api/households', create);
    const { householdId } = (await store.get({ PK: 'USER#auth0|u1', SK: 'MEMBERSHIP' }))!;
    const other = { PK: `HH#${householdId}`, SK: 'MEMBER#auth0|u2', displayName: 'Alex', joinedAt: '2026-11-13T11:00:00.000Z', settings: { defaultView: 'next' } };
    await store.put(other);
    await call('auth0|u1', 'PATCH', '/api/hh/members/me', { settings: { defaultView: 'list', digest: { on: true } } });
    expect(await store.get({ PK: other.PK, SK: other.SK })).toEqual(other);
  });
});

// ---- invites, joining and removing a member ----

const tokenOf = (link: string): string => link.split('#')[1];

async function household(userId: string, over: Record<string, unknown> = {}) {
  return call(userId, 'POST', '/api/households', { ...create, ...over });
}

describe('invites', () => {
  beforeEach(async () => { await household('auth0|a'); });

  it('creates a link with the token in the fragment, so it never reaches a server log', async () => {
    const res = await call('auth0|a', 'POST', '/api/hh/invites');
    expect(res.status).toBe(201);
    expect(res.json.link).toMatch(/^https:\/\/hearth\.example\.com\/join#[A-Za-z0-9_-]{43}$/);
    expect(res.json.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.json.expiresAt).toBe(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
  });

  it('builds the link from APP_ORIGIN when it is set, and uses http for localhost', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://hearthwise.scgrid.xyz/');
    expect((await call('auth0|a', 'POST', '/api/hh/invites')).json.link).toMatch(/^https:\/\/hearthwise\.scgrid\.xyz\/join#/);
    vi.unstubAllEnvs();
    const local = { ...event('POST', '/api/hh/invites', { mutationId: nextMutationId() }), headers: { host: 'localhost:8080' } } as APIGatewayProxyEventV2;
    expect(JSON.parse((await router.dispatch(local, 'auth0|a')).body).link).toMatch(/^http:\/\/localhost:8080\/join#/);
  });

  it('is 403 no_household for someone without a household', async () => {
    expect(await call('auth0|stranger', 'POST', '/api/hh/invites')).toEqual({ status: 403, json: { error: 'no_household' } });
  });

  it('lists open invites without any token or link, and revokes one', async () => {
    const made = await call('auth0|a', 'POST', '/api/hh/invites');
    const list = await call('auth0|a', 'GET', '/api/hh/invites');
    expect(list.json).toEqual({ invites: [{ hash: made.json.hash, createdBy: 'auth0|a', expiresAt: made.json.expiresAt }] });
    expect(JSON.stringify(list.json)).not.toContain(tokenOf(made.json.link));

    expect((await call('auth0|a', 'DELETE', `/api/hh/invites/${made.json.hash}`)).status).toBe(204);
    expect((await call('auth0|a', 'GET', '/api/hh/invites')).json).toEqual({ invites: [] });
  });

  it('answers 404 for a hash of the wrong shape, one that never existed, and another household\'s', async () => {
    await household('auth0|b', { name: 'Theirs' });
    const theirs = await call('auth0|b', 'POST', '/api/hh/invites');
    for (const hash of ['nope', 'f'.repeat(64), 'F'.repeat(64), theirs.json.hash]) {
      expect((await call('auth0|a', 'DELETE', `/api/hh/invites/${hash}`)).status).toBe(404);
    }
    expect((await call('auth0|b', 'GET', '/api/hh/invites')).json.invites).toHaveLength(1);
  });
});

describe('POST /api/invites/accept', () => {
  let token: string;
  beforeEach(async () => {
    await household('auth0|a');
    token = tokenOf((await call('auth0|a', 'POST', '/api/hh/invites')).json.link);
  });

  it('CUJ 1: the second person joins the first person\'s household, and both see both members', async () => {
    const res = await call('auth0|b', 'POST', '/api/invites/accept', { token, displayName: 'Bea' });
    expect(res.status).toBe(200);
    const [a, b] = [await call('auth0|a', 'GET', '/api/hh'), await call('auth0|b', 'GET', '/api/hh')];
    expect(a.json.household.name).toBe(b.json.household.name);
    expect(a.json.members.map((m: { displayName: string }) => m.displayName).sort()).toEqual(['Bea', 'Sam']);
    expect(b.json.household.memberCount).toBe(2);
  });

  it('CUJ 10: an expired invite answers 410 invite_expired and creates nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const res = await call('auth0|b', 'POST', '/api/invites/accept', { token, displayName: 'Bea' });
    vi.useRealTimers();
    expect(res).toEqual({ status: 410, json: { error: 'invite_expired' } });
    expect((await call('auth0|b', 'GET', '/api/hh')).status).toBe(403);
  });

  it('answers 410 on a second use of the same link', async () => {
    await call('auth0|b', 'POST', '/api/invites/accept', { token, displayName: 'Bea' });
    expect((await call('auth0|c', 'POST', '/api/invites/accept', { token, displayName: 'Cat' })).status).toBe(410);
  });

  it('answers 200 to the same person retrying', async () => {
    await call('auth0|b', 'POST', '/api/invites/accept', { token, displayName: 'Bea' });
    expect((await call('auth0|b', 'POST', '/api/invites/accept', { token, displayName: 'Bea' })).status).toBe(200);
  });

  it.each([
    ['empty', ''], ['42 characters', 'A'.repeat(42)], ['44 characters', 'A'.repeat(44)], ['a plus sign', 'A'.repeat(42) + '+'],
    ['10 KB of text', 'A'.repeat(10_240)], ['a number', 123], ['null', null], ['an object', { a: 1 }],
  ])('answers 410 for a token that is %s, without looking anything up', async (_name, bad) => {
    const store = new MemoryStore();
    setStore(store);
    const get = vi.spyOn(store, 'get');
    const res = await call('auth0|b', 'POST', '/api/invites/accept', { token: bad, displayName: 'Bea' });
    expect(res).toEqual({ status: 410, json: { error: 'invite_expired' } });
    expect(get).not.toHaveBeenCalled();
  });

  it('answers 410 when there is no token at all', async () => {
    expect((await call('auth0|b', 'POST', '/api/invites/accept', { displayName: 'Bea' })).status).toBe(410);
  });

  it.each([
    ['no display name', {}, 'displayName'],
    ['an empty display name', { displayName: ' ' }, 'displayName'],
    ['a confirmMove that is not a boolean', { displayName: 'Bea', confirmMove: 'yes' }, 'confirmMove'],
    ['a bad mutation id', { displayName: 'Bea', mutationId: 'nope' }, 'mutationId'],
  ])('rejects %s with 400', async (_name, extra, field) => {
    expect(await call('auth0|b', 'POST', '/api/invites/accept', { token, ...extra })).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('rejects a body that is not an object', async () => {
    expect((await call('auth0|b', 'POST', '/api/invites/accept', 'not json')).json).toEqual({ error: 'invalid', field: 'body' });
  });

  it('CUJ 11: asks someone with an empty household to confirm, then moves them', async () => {
    await household('auth0|b', { name: 'Theirs', displayName: 'Bea' });
    const first = await call('auth0|b', 'POST', '/api/invites/accept', { token, displayName: 'Bea' });
    expect(first).toEqual({ status: 409, json: { error: 'already_member', canMove: true } });
    expect((await call('auth0|b', 'GET', '/api/hh')).json.household.name).toBe('Theirs');

    const moved = await call('auth0|b', 'POST', '/api/invites/accept', { token, displayName: 'Bea', confirmMove: true });
    expect(moved.status).toBe(200);
    expect((await call('auth0|b', 'GET', '/api/hh')).json.household.name).toBe('Home');
  });

  it('answers a member of another household with canMove false when theirs has things in it', async () => {
    const store = new MemoryStore();
    setStore(store);
    router = createRouter();
    registerHouseholdRoutes(router);
    await household('auth0|a');
    const link = (await call('auth0|a', 'POST', '/api/hh/invites')).json.link;
    const made = await household('auth0|b', { name: 'Theirs' });
    await store.put({ PK: `HH#${made.json.householdId}`, SK: 'TASK#t1', title: 'Hoover' });
    const res = await call('auth0|b', 'POST', '/api/invites/accept', { token: tokenOf(link), displayName: 'Bea', confirmMove: true });
    expect(res).toEqual({ status: 409, json: { error: 'already_member', canMove: false } });
  });
});

describe('DELETE /api/hh/members/{userId}', () => {
  beforeEach(async () => {
    await household('auth0|a');
    const link = (await call('auth0|a', 'POST', '/api/hh/invites')).json.link;
    await call('auth0|b', 'POST', '/api/invites/accept', { token: tokenOf(link), displayName: 'Bea' });
  });

  it('removes the other member when the creator asks, with the id percent-encoded as a browser sends it', async () => {
    const res = await call('auth0|a', 'DELETE', `/api/hh/members/${encodeURIComponent('auth0|b')}`);
    expect(res.status).toBe(204);
    expect((await call('auth0|b', 'GET', '/api/hh')).status).toBe(403);
    expect((await call('auth0|a', 'GET', '/api/hh')).json.household.memberCount).toBe(1);
  });

  it('answers 403 forbidden to the other member, and to the creator removing themselves', async () => {
    expect((await call('auth0|b', 'DELETE', `/api/hh/members/${encodeURIComponent('auth0|a')}`)).json).toEqual({ error: 'forbidden' });
    expect((await call('auth0|a', 'DELETE', `/api/hh/members/${encodeURIComponent('auth0|a')}`)).status).toBe(403);
  });

  it('answers 404 for someone who is not a member, and 400 for a malformed escape', async () => {
    expect((await call('auth0|a', 'DELETE', `/api/hh/members/${encodeURIComponent('auth0|stranger')}`)).status).toBe(404);
    expect(await call('auth0|a', 'DELETE', '/api/hh/members/%E0%A4%A')).toEqual({ status: 400, json: { error: 'invalid', field: 'path' } });
    expect((await call('auth0|a', 'GET', '/api/hh')).json.household.memberCount).toBe(2);
  });

  it('is 403 no_household for someone without a household', async () => {
    expect((await call('auth0|stranger', 'DELETE', '/api/hh/members/x')).json).toEqual({ error: 'no_household' });
  });
});


describe('the mutation id on household writes', () => {
  it('is required: every write route answers 400 naming mutationId without one', async () => {
    await call('auth0|u1', 'POST', '/api/households', create);
    const hash = 'a'.repeat(64);
    const cases: [string, string, unknown][] = [
      ['POST', '/api/households', create],
      ['PATCH', '/api/hh/members/me', { displayName: 'Samuel' }],
      ['POST', '/api/hh/invites', {}],
      ['DELETE', `/api/hh/invites/${hash}`, {}],
      ['DELETE', '/api/hh/members/auth0%7Cu2', {}],
      ['POST', '/api/invites/accept', { token: 'A'.repeat(43), displayName: 'Bea' }],
    ];
    for (const [method, path, body] of cases) {
      expect(await callRaw('auth0|u1', method, path, body), `${method} ${path}`).toEqual({ status: 400, json: { error: 'invalid', field: 'mutationId' } });
    }
  });

  it('must be a UUID', async () => {
    await call('auth0|u1', 'POST', '/api/households', create);
    expect(await callRaw('auth0|u1', 'POST', '/api/hh/invites', { mutationId: 'nope' })).toEqual({ status: 400, json: { error: 'invalid', field: 'mutationId' } });
  });

  it('is accepted with a body-less write that carries only the id', async () => {
    await call('auth0|u1', 'POST', '/api/households', create);
    expect((await callRaw('auth0|u1', 'POST', '/api/hh/invites', { mutationId: nextMutationId() })).status).toBe(201);
  });
});
