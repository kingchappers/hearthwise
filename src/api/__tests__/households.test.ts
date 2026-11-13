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

async function call(userId: string, method: string, path: string, body?: unknown, query?: Record<string, string>) {
  const res = await router.dispatch(event(method, path, body, query), userId);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
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

  it('accepts an optional mutation id that is a UUID', async () => {
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
