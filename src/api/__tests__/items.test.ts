import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { getStore, setStore } from '../../store';
import { MemoryStore } from '../../store/memory';
import { registerHouseholdRoutes } from '../households';
import { registerItemRoutes } from '../items';
import { createRouter, type Router } from '../router';
import { registerTaskRoutes } from '../tasks';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
let router: Router;
let householdId: string;

function event(method: string, path: string, body?: unknown): APIGatewayProxyEventV2 {
  return {
    rawPath: path, requestContext: { http: { method } }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: 'hearth.example.com' }, queryStringParameters: {}, isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
async function call(userId: string, method: string, path: string, body?: unknown) {
  const res = await router.dispatch(event(method, path, body), userId);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
}
const mut = (body: Record<string, unknown> = {}): Record<string, unknown> => ({ mutationId: uuid(), ...body });

beforeEach(async () => {
  n = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setStore(new MemoryStore());
  router = createRouter();
  registerHouseholdRoutes(router);
  registerItemRoutes(router);
  // Restore is one route for tasks and items.
  registerTaskRoutes(router);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  householdId = (await call(U1, 'POST', '/api/households', mut({ name: 'Home', displayName: 'Sam', timezone: 'Europe/London' }))).json.householdId;
  await getStore().put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await getStore().put({ ...membershipKey(U2), householdId });
});
afterEach(() => { setStore(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });

const AT = NOW - 1000;

describe('who may call', () => {
  const some = uuid();
  it.each([['GET', '/api/hh/items'], ['PUT', `/api/hh/items/${some}`], ['DELETE', `/api/hh/items/${some}`], ['POST', '/api/hh/items/batch']])(
    '%s %s answers 403 no_household to someone with no household', async (method, path) => {
      expect(await call('auth0|nobody', method, path)).toEqual({ status: 403, json: { error: 'no_household' } });
    },
  );

  it('answers 404 for another household\'s item', async () => {
    await call('auth0|u3', 'POST', '/api/households', mut({ name: 'Other', displayName: 'Z', timezone: 'UTC' }));
    const id = uuid();
    expect((await call('auth0|u3', 'PUT', `/api/hh/items/${id}`, mut({ text: 'Theirs', textAt: AT }))).status).toBe(200);
    expect((await call(U1, 'DELETE', `/api/hh/items/${id}`, mut())).status).toBe(404);
    expect((await call(U1, 'GET', '/api/hh/items')).json.items).toEqual([]);
  });
});

describe('garbage input', () => {
  it.each([
    ['a 10 KB text', () => mut({ text: 'x'.repeat(10_240), textAt: AT }), 'text'],
    ['a missing time', () => mut({ text: 'Milk' }), 'textAt'],
    ['an unknown key', () => mut({ text: 'Milk', textAt: AT, colour: 'red' }), 'colour'],
    ['a missing mutation id', () => ({ text: 'Milk', textAt: AT }), 'mutationId'],
    ['an empty put', () => mut(), 'body'],
  ])('rejects %s with 400 naming the field', async (_name, body, field) => {
    expect(await call(U1, 'PUT', `/api/hh/items/${uuid()}`, body())).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('answers 404 for an id that is not a UUID, 400 for a malformed escape, and 400 for a body that is not an object', async () => {
    expect((await call(U1, 'PUT', '/api/hh/items/not-a-uuid', mut({ text: 'x', textAt: AT }))).status).toBe(404);
    expect(await call(U1, 'DELETE', '/api/hh/items/%E0%A4%A', mut())).toEqual({ status: 400, json: { error: 'invalid', field: 'path' } });
    expect(await call(U1, 'PUT', `/api/hh/items/${uuid()}`, '[]')).toEqual({ status: 400, json: { error: 'invalid', field: 'body' } });
  });

  it('refuses a batch of 0 or 101 entries and one with an unknown key, and reports a bad entry without failing', async () => {
    const entry = () => ({ id: uuid(), text: 'x', textAt: AT });
    expect((await call(U1, 'POST', '/api/hh/items/batch', mut({ writes: [] }))).json.field).toBe('writes');
    expect((await call(U1, 'POST', '/api/hh/items/batch', mut({ writes: Array.from({ length: 101 }, entry) }))).json.field).toBe('writes');
    expect((await call(U1, 'POST', '/api/hh/items/batch', mut({ writes: [entry()], extra: 1 }))).json.field).toBe('extra');
    const mixed = await call(U1, 'POST', '/api/hh/items/batch', mut({ writes: [entry(), { id: 'nope', text: 'x', textAt: AT }] }));
    expect(mixed.status).toBe(200);
    expect(mixed.json.results.map((r: { status: string }) => r.status)).toEqual(['created', 'invalid']);
  });
});

describe('the shopping flow', () => {
  it('adds, ticks, lists, clears ticked and restores', async () => {
    const [milk, eggs] = [uuid(), uuid()];
    expect((await call(U1, 'PUT', `/api/hh/items/${milk}`, mut({ text: 'Milk', textAt: AT, quantity: '2', quantityAt: AT }))).json.item).toMatchObject({ text: 'Milk', quantity: '2', ticked: false });
    await call(U2, 'PUT', `/api/hh/items/${eggs}`, mut({ text: 'Eggs', textAt: AT }));
    const ticked = await call(U2, 'PUT', `/api/hh/items/${milk}`, mut({ ticked: true, tickedAt: NOW - 500 }));
    expect(ticked.json.item).toMatchObject({ ticked: true, tickedBy: U2 });

    const listed = await call(U1, 'GET', '/api/hh/items');
    expect(listed.json).toMatchObject({ serverTime: NOW });
    expect(listed.json.items).toHaveLength(2);

    const cleared = await call(U1, 'POST', '/api/hh/items/batch', mut({ writes: [{ id: milk, delete: true, ifTickedAt: NOW - 500 }, { id: eggs, delete: true, ifTickedAt: NOW - 500 }] }));
    expect(cleared.json.results).toEqual([{ id: milk, status: 'applied' }, { id: eggs, status: 'skipped' }]);
    expect((await call(U1, 'PUT', `/api/hh/items/${milk}`, mut({ text: 'x', textAt: NOW }))).status).toBe(410);

    const restored = await call(U2, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'item', id: milk }] }));
    expect(restored.json.results).toEqual([{ id: milk, status: 'restored' }]);
  });

  it('answers a retried write with the same body, and a retried delete after a restore leaves it restored', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/items/${id}`, mut({ text: 'Milk', textAt: AT }));
    const del = mut();
    const first = await call(U1, 'DELETE', `/api/hh/items/${id}`, del);
    await call(U2, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'item', id }] }));
    expect(await call(U1, 'DELETE', `/api/hh/items/${id}`, del)).toEqual(first);
    expect((await call(U1, 'GET', '/api/hh/items')).json.items[0].deletedAt).toBeUndefined();
  });
});
