import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import { RECIPE_LIMIT } from '../../meals/recipes';
import { recipeKey } from '../../meals/keys';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { getStore, setStore } from '../../store';
import { MemoryStore } from '../../store/memory';
import { registerHouseholdRoutes } from '../households';
import { registerMealRoutes } from '../meals';
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
const AT = NOW - 1000;

beforeEach(async () => {
  n = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setStore(new MemoryStore());
  router = createRouter();
  registerHouseholdRoutes(router);
  registerMealRoutes(router);
  registerTaskRoutes(router);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  householdId = (await call(U1, 'POST', '/api/households', mut({ name: 'Home', displayName: 'Sam', timezone: 'Europe/London' }))).json.householdId;
  await getStore().put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await getStore().put({ ...membershipKey(U2), householdId });
});
afterEach(() => { setStore(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('who may call', () => {
  const some = uuid();
  it.each([['GET', '/api/hh/recipes'], ['PUT', `/api/hh/recipes/${some}`], ['DELETE', `/api/hh/recipes/${some}`]])(
    '%s %s answers 403 no_household to someone with no household', async (method, path) => {
      expect(await call('auth0|nobody', method, path)).toEqual({ status: 403, json: { error: 'no_household' } });
    },
  );

  it('does not show or reach another household\'s recipes', async () => {
    await call('auth0|u3', 'POST', '/api/households', mut({ name: 'Other', displayName: 'Z', timezone: 'UTC' }));
    const id = uuid();
    expect((await call('auth0|u3', 'PUT', `/api/hh/recipes/${id}`, mut({ title: 'Theirs', titleAt: AT }))).status).toBe(200);
    expect((await call(U1, 'DELETE', `/api/hh/recipes/${id}`, mut())).status).toBe(404);
    expect((await call(U1, 'GET', '/api/hh/recipes')).json.recipes).toEqual([]);
  });
});

describe('PUT /api/hh/recipes/{id}', () => {
  it('creates and then changes a recipe, both with 200', async () => {
    const id = uuid();
    const created = await call(U1, 'PUT', `/api/hh/recipes/${id}`, mut({ title: 'Chilli', titleAt: AT, servings: 4, servingsAt: AT }));
    expect(created.status).toBe(200);
    expect(created.json.recipe).toMatchObject({ id, title: 'Chilli', servings: 4 });
    const edited = await call(U2, 'PUT', `/api/hh/recipes/${id}`, mut({ steps: ['Chop'], stepsAt: AT + 10 }));
    expect(edited.status).toBe(200);
    expect(edited.json.recipe).toMatchObject({ title: 'Chilli', steps: ['Chop'], updatedBy: U2 });
    expect((await call(U1, 'GET', '/api/hh/recipes')).json.recipes).toHaveLength(1);
  });

  it.each([
    ['a title over 120 characters', () => mut({ title: 'x'.repeat(121), titleAt: AT }), 'title'],
    ['a missing time', () => mut({ title: 'Chilli' }), 'titleAt'],
    ['an unknown key', () => mut({ title: 'Chilli', titleAt: AT, photo: 'x' }), 'photo'],
    ['a missing mutation id', () => ({ title: 'Chilli', titleAt: AT }), 'mutationId'],
    ['an empty put', () => mut(), 'body'],
    ['31 ingredient lines', () => mut({ ingredients: Array.from({ length: 31 }, () => 'x'), ingredientsAt: AT }), 'ingredients'],
  ])('rejects %s with 400 naming the field', async (_name, body, field) => {
    expect(await call(U1, 'PUT', `/api/hh/recipes/${uuid()}`, body())).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('answers 400 when a create has no title', async () => {
    expect((await call(U1, 'PUT', `/api/hh/recipes/${uuid()}`, mut({ steps: ['x'], stepsAt: AT }))).status).toBe(400);
  });

  it('answers 404 for an id that is not a UUID', async () => {
    expect((await call(U1, 'PUT', '/api/hh/recipes/not-a-uuid', mut({ title: 'x', titleAt: AT }))).status).toBe(404);
  });

  it('answers 410 for a deleted recipe', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/recipes/${id}`, mut({ title: 'Chilli', titleAt: AT }));
    await call(U1, 'DELETE', `/api/hh/recipes/${id}`, mut());
    expect((await call(U1, 'PUT', `/api/hh/recipes/${id}`, mut({ title: 'Back', titleAt: NOW + 1 }))).status).toBe(410);
  });

  it('answers 409 recipe_limit at 200 live recipes', async () => {
    for (let i = 0; i < RECIPE_LIMIT; i += 1) await getStore().put({ ...recipeKey(householdId, uuid()), title: `R${i}`, updatedAt: 1 });
    expect(await call(U1, 'PUT', `/api/hh/recipes/${uuid()}`, mut({ title: 'Over', titleAt: AT }))).toEqual({ status: 409, json: { error: 'recipe_limit' } });
  });

  it('answers a repeat of the same mutation from its record', async () => {
    const id = uuid();
    const body = mut({ title: 'Chilli', titleAt: AT });
    const first = await call(U1, 'PUT', `/api/hh/recipes/${id}`, body);
    const again = await call(U1, 'PUT', `/api/hh/recipes/${id}`, { ...body, title: 'Changed', titleAt: AT + 100 });
    expect(again).toEqual(first);
  });
});

describe('DELETE /api/hh/recipes/{id}', () => {
  it('deletes with 200, answers 404 for a missing id, and lists the tombstone', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/recipes/${id}`, mut({ title: 'Chilli', titleAt: AT }));
    const deleted = await call(U2, 'DELETE', `/api/hh/recipes/${id}`, mut());
    expect(deleted.status).toBe(200);
    expect(deleted.json.recipe).toMatchObject({ deletedBy: U2 });
    expect((await call(U1, 'DELETE', `/api/hh/recipes/${uuid()}`, mut())).status).toBe(404);
    expect((await call(U1, 'GET', '/api/hh/recipes')).json.recipes[0]).toMatchObject({ id, deletedBy: U2 });
  });
});

describe('POST /api/hh/restore with kind recipe', () => {
  it('brings a deleted recipe back, and restoring twice does nothing', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/recipes/${id}`, mut({ title: 'Chilli', titleAt: AT }));
    await call(U1, 'DELETE', `/api/hh/recipes/${id}`, mut());
    const first = await call(U2, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'recipe', id }] }));
    expect(first.json.results).toEqual([{ id, status: 'restored' }]);
    const second = await call(U2, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'recipe', id }] }));
    expect(second.json.results).toEqual([{ id, status: 'noop' }]);
    expect((await call(U1, 'GET', '/api/hh/recipes')).json.recipes[0].deletedAt).toBeUndefined();
  });
});
