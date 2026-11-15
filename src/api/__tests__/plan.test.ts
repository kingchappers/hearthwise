import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import { setSender } from '../../push/registry';
import { saveSubscription } from '../../push/subscriptions';
import type { PushPayload, PushSender } from '../../push/sender';
import { planChanged } from '../../push/events';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { getStore, setStore } from '../../store';
import { MemoryStore } from '../../store/memory';
import { registerHouseholdRoutes } from '../households';
import { registerItemRoutes } from '../items';
import { registerMealRoutes } from '../meals';
import { createRouter, type Router } from '../router';

// 10:00 UTC on Saturday 14 November 2026: the 14th in London.
const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const AT = NOW - 1000;
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
let router: Router;
let householdId: string;
let sent: { endpoint: string; payload: PushPayload }[];
const sender: PushSender = { send: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); return { status: 201 }; } };

function event(method: string, path: string, body?: unknown, query: Record<string, string> = {}): APIGatewayProxyEventV2 {
  return {
    rawPath: path, requestContext: { http: { method } }, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { host: 'hearth.example.com' }, queryStringParameters: query, isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
async function call(userId: string, method: string, path: string, body?: unknown, query?: Record<string, string>) {
  const res = await router.dispatch(event(method, path, body, query), userId);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
}
const mut = (body: Record<string, unknown> = {}): Record<string, unknown> => ({ mutationId: uuid(), ...body });
const recipeId = '11111111-1111-4111-8111-111111111111';
const meal = { recipeId, title: 'Chilli', servings: 4 };

beforeEach(async () => {
  n = 0;
  sent = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setStore(new MemoryStore());
  setSender(sender);
  router = createRouter();
  registerHouseholdRoutes(router);
  registerMealRoutes(router);
  registerItemRoutes(router);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  householdId = (await call(U1, 'POST', '/api/households', mut({ name: 'Home', displayName: 'Sam', timezone: 'Europe/London' }))).json.householdId;
  await getStore().put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await getStore().put({ ...membershipKey(U2), householdId });
  for (const user of [U1, U2]) await saveSubscription(getStore(), user, { endpoint: `https://fcm.googleapis.com/fcm/send/${user}`, p256dh: 'p', auth: 'a', createdAt: NOW });
});
afterEach(() => { setStore(undefined); setSender(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('who may call', () => {
  it.each([['GET', '/api/hh/plan'], ['PUT', '/api/hh/plan/2026-11-16']])('%s %s answers 403 no_household to someone with no household', async (method, path) => {
    expect(await call('auth0|nobody', method, path)).toEqual({ status: 403, json: { error: 'no_household' } });
  });

  it('does not show another household\'s plan', async () => {
    await call('auth0|u3', 'POST', '/api/households', mut({ name: 'Other', displayName: 'Z', timezone: 'UTC' }));
    await call('auth0|u3', 'PUT', '/api/hh/plan/2026-11-16', mut({ meal: { title: 'Theirs' }, mealAt: AT }));
    expect((await call(U1, 'GET', '/api/hh/plan')).json.days).toEqual([]);
  });
});

describe('PUT /api/hh/plan/{day}', () => {
  it('sets a day with 200, and a plain-name dinner needs no recipe', async () => {
    const set = await call(U1, 'PUT', '/api/hh/plan/2026-11-16', mut({ meal, mealAt: AT }));
    expect(set.status).toBe(200);
    expect(set.json.day).toMatchObject({ day: '2026-11-16', meal, updatedBy: U1 });
    expect((await call(U2, 'PUT', '/api/hh/plan/2026-11-17', mut({ meal: { title: 'Takeaway' }, mealAt: AT }))).status).toBe(200);
  });

  it('clears a day with a null meal', async () => {
    await call(U1, 'PUT', '/api/hh/plan/2026-11-16', mut({ meal, mealAt: AT }));
    const cleared = await call(U1, 'PUT', '/api/hh/plan/2026-11-16', mut({ meal: null, mealAt: AT + 10 }));
    expect(cleared.status).toBe(200);
    expect(cleared.json.day.meal).toBeUndefined();
  });

  it.each([
    ['a title over 120 characters', () => mut({ meal: { title: 'x'.repeat(121) }, mealAt: AT }), 'meal.title'],
    ['servings with no recipe', () => mut({ meal: { title: 'A', servings: 2 }, mealAt: AT }), 'meal.servings'],
    ['a missing time', () => mut({ meal: { title: 'A' } }), 'mealAt'],
    ['a missing meal', () => mut({ mealAt: AT }), 'meal'],
    ['an unknown key', () => mut({ meal: { title: 'A' }, mealAt: AT, colour: 'red' }), 'colour'],
    ['a missing mutation id', () => ({ meal: { title: 'A' }, mealAt: AT }), 'mutationId'],
  ])('rejects %s with 400 naming the field', async (_name, body, field) => {
    expect(await call(U1, 'PUT', '/api/hh/plan/2026-11-16', body())).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('answers 404 for a day that is not a real date, and 400 for a real day out of range', async () => {
    expect((await call(U1, 'PUT', '/api/hh/plan/not-a-date', mut({ meal, mealAt: AT }))).status).toBe(404);
    expect((await call(U1, 'PUT', '/api/hh/plan/2026-02-30', mut({ meal, mealAt: AT }))).status).toBe(404);
    expect(await call(U1, 'PUT', '/api/hh/plan/2026-10-30', mut({ meal, mealAt: AT }))).toEqual({ status: 400, json: { error: 'invalid', field: 'day' } });
    expect(await call(U1, 'PUT', '/api/hh/plan/2027-01-14', mut({ meal, mealAt: AT }))).toEqual({ status: 400, json: { error: 'invalid', field: 'day' } });
  });

  it('answers a repeat of the same mutation from its record', async () => {
    const body = mut({ meal, mealAt: AT });
    const first = await call(U1, 'PUT', '/api/hh/plan/2026-11-16', body);
    const again = await call(U1, 'PUT', '/api/hh/plan/2026-11-16', { ...body, meal: { title: 'Changed' }, mealAt: AT + 100 });
    expect(again).toEqual(first);
  });
});

describe('GET /api/hh/plan', () => {
  it('returns days from 14 days before today by default, in date order, with the server time', async () => {
    await call(U1, 'PUT', '/api/hh/plan/2026-11-18', mut({ meal: { title: 'B' }, mealAt: AT }));
    await call(U1, 'PUT', '/api/hh/plan/2026-10-31', mut({ meal: { title: 'A' }, mealAt: AT }));
    const res = await call(U1, 'GET', '/api/hh/plan');
    expect(res.json.days.map((day: { day: string }) => day.day)).toEqual(['2026-10-31', '2026-11-18']);
    expect(res.json.serverTime).toBe(NOW);
  });

  it('takes a from date, and answers 400 for one that is not a real date', async () => {
    await call(U1, 'PUT', '/api/hh/plan/2026-11-16', mut({ meal, mealAt: AT }));
    await call(U1, 'PUT', '/api/hh/plan/2026-11-18', mut({ meal, mealAt: AT }));
    const res = await call(U1, 'GET', '/api/hh/plan', undefined, { from: '2026-11-17' });
    expect(res.json.days.map((day: { day: string }) => day.day)).toEqual(['2026-11-18']);
    expect(await call(U1, 'GET', '/api/hh/plan', undefined, { from: 'tomorrow' })).toEqual({ status: 400, json: { error: 'invalid', field: 'from' } });
  });
});

describe('Let them know on a plan change', () => {
  it('sends the other member a push naming the day and the dinner, and opens the plan', async () => {
    const res = await call(U1, 'PUT', '/api/hh/plan/2026-11-20', mut({ meal: { title: 'Curry' }, mealAt: AT, notify: true, clientAt: AT }));
    expect(res.status).toBe(200);
    expect(sent.map(entry => entry.endpoint)).toEqual([`https://fcm.googleapis.com/fcm/send/${U2}`]);
    expect(sent[0].payload).toMatchObject({ title: 'Sam changed the plan', body: 'Friday 20: Curry', url: '/plan' });
  });

  it('says a day was cleared', async () => {
    await call(U1, 'PUT', '/api/hh/plan/2026-11-20', mut({ meal: { title: 'Curry' }, mealAt: AT }));
    await call(U1, 'PUT', '/api/hh/plan/2026-11-20', mut({ meal: null, mealAt: AT + 10, notify: true, clientAt: AT }));
    expect(sent[0].payload.body).toBe('Cleared Friday 20');
  });

  it('sends nothing unless it was asked, nor for a write replayed more than 30 minutes late, and once for a retry', async () => {
    await call(U1, 'PUT', '/api/hh/plan/2026-11-20', mut({ meal: { title: 'A' }, mealAt: AT }));
    await call(U1, 'PUT', '/api/hh/plan/2026-11-21', mut({ meal: { title: 'B' }, mealAt: AT, notify: true, clientAt: NOW - 31 * 60 * 1000 }));
    expect(sent).toEqual([]);
    const body = mut({ meal: { title: 'C' }, mealAt: AT, notify: true, clientAt: AT });
    await call(U1, 'PUT', '/api/hh/plan/2026-11-22', body);
    await call(U1, 'PUT', '/api/hh/plan/2026-11-22', body);
    expect(sent).toHaveLength(1);
  });
});

describe('planChanged', () => {
  it('words a set and a clear, with the plan as the place to go', () => {
    expect(planChanged('Sam', 'Friday 20', 'Curry', 'm1')).toMatchObject({ type: 'plan.changed', title: 'Sam changed the plan', body: 'Friday 20: Curry', url: '/plan', mutationId: 'm1' });
    expect(planChanged('Sam', 'Friday 20', undefined, 'm1').body).toBe('Cleared Friday 20');
  });
});

describe('POST /api/hh/plan/add-to-list', () => {
  const lineId = (index: number): string => `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`;
  const line = (index: number, extra: Record<string, unknown> = {}) => ({ id: lineId(index), text: `item ${index}`, ...extra });
  const addBody = (over: Record<string, unknown> = {}) => mut({ days: [{ day: '2026-11-16', ...meal }], lines: [line(1, { quantity: '3', forRecipes: 'Chilli' }), line(2)], ...over });
  const shopping = async () => (await call(U1, 'GET', '/api/hh/items')).json.items as { id: string; text: string; forRecipes?: string }[];

  it('answers 403 no_household to someone with no household', async () => {
    expect(await call('auth0|nobody', 'POST', '/api/hh/plan/add-to-list', addBody())).toEqual({ status: 403, json: { error: 'no_household' } });
  });

  it('creates the shopping lines, marks the day, and answers with each id and status', async () => {
    await call(U1, 'PUT', '/api/hh/plan/2026-11-16', mut({ meal, mealAt: AT }));
    const res = await call(U2, 'POST', '/api/hh/plan/add-to-list', addBody());
    expect(res.status).toBe(200);
    expect(res.json.results).toEqual([{ id: lineId(1), status: 'created' }, { id: lineId(2), status: 'created' }]);
    expect((await shopping()).find(item => item.id === lineId(1))).toMatchObject({ text: 'item 1', forRecipes: 'Chilli' });
    expect((await call(U1, 'GET', '/api/hh/plan')).json.days[0]).toMatchObject({ addedBy: U2 });
  });

  it('answers a repeat of the same mutation from its record, without making more lines', async () => {
    await call(U1, 'PUT', '/api/hh/plan/2026-11-16', mut({ meal, mealAt: AT }));
    const body = addBody();
    const first = await call(U1, 'POST', '/api/hh/plan/add-to-list', body);
    const again = await call(U1, 'POST', '/api/hh/plan/add-to-list', { ...body, lines: [line(9)] });
    expect(again).toEqual(first);
    expect(await shopping()).toHaveLength(2);
  });

  it.each([
    ['a text over 200 characters', () => addBody({ lines: [line(1), line(2, { text: 'x'.repeat(201) })] }), 'lines[1].text'],
    ['a recipe label over 200 characters', () => addBody({ lines: [line(1, { forRecipes: 'x'.repeat(201) })] }), 'lines[0].forRecipes'],
    ['a line id that is not a UUID', () => addBody({ lines: [{ id: 'nope', text: 'a' }] }), 'lines[0].id'],
    ['a day that is not a real date', () => addBody({ days: [{ day: '2026-02-30', title: 'A' }] }), 'days[0].day'],
    ['a day listed twice', () => addBody({ days: [{ day: '2026-11-16', title: 'A' }, { day: '2026-11-16', title: 'B' }] }), 'days'],
    ['a line id listed twice', () => addBody({ lines: [line(1), line(1)] }), 'lines'],
    ['no lines', () => addBody({ lines: [] }), 'lines'],
    ['an unknown key', () => addBody({ colour: 'red' }), 'colour'],
  ])('rejects %s with 400 naming the field, and writes nothing', async (_name, body, field) => {
    expect(await call(U1, 'POST', '/api/hh/plan/add-to-list', body())).toEqual({ status: 400, json: { error: 'invalid', field } });
    expect(await shopping()).toEqual([]);
  });

  it('takes 100 lines, and refuses 101', async () => {
    await call(U1, 'PUT', '/api/hh/plan/2026-11-16', mut({ meal, mealAt: AT }));
    const lines = (count: number) => Array.from({ length: count }, (_, index) => line(index + 1));
    expect((await call(U1, 'POST', '/api/hh/plan/add-to-list', addBody({ lines: lines(100) }))).status).toBe(200);
    expect(await call(U1, 'POST', '/api/hh/plan/add-to-list', addBody({ lines: lines(101) }))).toEqual({ status: 400, json: { error: 'invalid', field: 'lines' } });
  });

  it('sends the other person one push saying how many items were added, and opens the shopping list', async () => {
    const body = addBody({ notify: true, clientAt: AT });
    await call(U1, 'POST', '/api/hh/plan/add-to-list', body);
    await call(U1, 'POST', '/api/hh/plan/add-to-list', body);
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe(`https://fcm.googleapis.com/fcm/send/${U2}`);
    expect(sent[0].payload).toMatchObject({ title: 'Sam updated the shopping list', body: '2 items added to the shopping list', url: '/shopping' });
  });

  it('sends nothing unless it was asked', async () => {
    await call(U1, 'POST', '/api/hh/plan/add-to-list', addBody());
    expect(sent).toEqual([]);
  });

  it('keeps the shopping routes for existing items: they still refuse forRecipes', async () => {
    expect(await call(U1, 'PUT', `/api/hh/items/${uuid()}`, mut({ text: 'x', textAt: AT, forRecipes: 'Chilli' }))).toEqual({ status: 400, json: { error: 'invalid', field: 'forRecipes' } });
  });
});
