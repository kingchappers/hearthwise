import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import { HELD_PREFIX } from '../../push/notifyOther';
import { setSender } from '../../push/registry';
import { saveSubscription } from '../../push/subscriptions';
import type { PushPayload, PushSender } from '../../push/sender';
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
let sent: { endpoint: string; payload: PushPayload }[];
const sender: PushSender = { send: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); return { status: 201 }; } };
const AT = NOW - 1000;

function event(method: string, path: string, body?: unknown): APIGatewayProxyEventV2 {
  return {
    rawPath: path, requestContext: { http: { method } }, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { host: 'hearth.example.com' }, queryStringParameters: {}, isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
async function call(userId: string, method: string, path: string, body?: unknown) {
  const res = await router.dispatch(event(method, path, body), userId);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
}
const mut = (body: Record<string, unknown> = {}): Record<string, unknown> => ({ mutationId: uuid(), ...body });
const task = (over: Record<string, unknown> = {}) => mut({ id: uuid(), title: 'Hoover', assignee: 'either', repeat: { type: 'none' }, ...over });

beforeEach(async () => {
  n = 0;
  sent = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setStore(new MemoryStore());
  setSender(sender);
  router = createRouter();
  registerHouseholdRoutes(router);
  registerTaskRoutes(router);
  registerItemRoutes(router);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  householdId = (await call(U1, 'POST', '/api/households', mut({ name: 'Home', displayName: 'Sam', timezone: 'Europe/London' }))).json.householdId;
  await getStore().put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await getStore().put({ ...membershipKey(U2), householdId });
  for (const user of [U1, U2]) await saveSubscription(getStore(), user, { endpoint: `https://push.example/${user}`, p256dh: 'p', auth: 'a', createdAt: NOW });
});
afterEach(() => { setStore(undefined); setSender(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Let them know on a task', () => {
  it('sends the other member one push before the response returns, and never the person who made the change', async () => {
    const res = await call(U1, 'POST', '/api/hh/tasks', task({ notify: true, clientAt: AT }));
    expect(res.status).toBe(201);
    expect(sent.map(s => s.endpoint)).toEqual([`https://push.example/${U2}`]);
    expect(sent[0].payload).toMatchObject({ title: 'Sam added a task', body: 'Hoover' });
    expect(sent[0].payload.tag).toMatch(/^notify-/);
  });

  it.each([['missing', {}], ['false', { notify: false }]])('sends nothing when notify is %s', async (_name, extra) => {
    await call(U1, 'POST', '/api/hh/tasks', task({ ...extra, clientAt: AT }));
    expect(sent).toEqual([]);
  });

  it('sends nothing when the write fails: 403 (needs their say), 409, 410', async () => {
    expect((await call(U1, 'POST', '/api/hh/tasks', task({ assignee: U2, notify: true, clientAt: AT }))).status).toBe(403);
    const created = task();
    const id = created.id as string;
    await call(U1, 'POST', '/api/hh/tasks', created);
    await getStore().patch({ PK: hhPk(householdId), SK: `TASK#${id}` }, { cycleSeq: 3 });
    expect((await call(U1, 'POST', `/api/hh/tasks/${id}/complete`, mut({ cycleSeq: 2, completedAt: AT, notify: true, clientAt: AT }))).status).toBe(409);
    expect((await call(U1, 'DELETE', `/api/hh/tasks/${id}`, mut({ baseRuleVersion: 1 }))).status).toBe(200);
    expect((await call(U1, 'POST', `/api/hh/tasks/${id}/complete`, mut({ cycleSeq: 3, completedAt: AT, notify: true, clientAt: AT }))).status).toBe(410);
    expect(sent).toEqual([]);
  });

  it('pushes once for a retried write with the same mutation id', async () => {
    const body = task({ notify: true, clientAt: AT });
    await call(U1, 'POST', '/api/hh/tasks', body);
    expect((await call(U1, 'POST', '/api/hh/tasks', body)).status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('sends nothing for a write whose clientAt is more than 30 minutes old', async () => {
    await call(U1, 'POST', '/api/hh/tasks', task({ notify: true, clientAt: NOW - 31 * 60 * 1000 }));
    expect(sent).toEqual([]);
  });

  it('does not fail the request when the push service hangs, and answers within about two seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    setSender({ send: () => new Promise(() => undefined) });
    const pending = call(U1, 'POST', '/api/hh/tasks', task({ notify: true, clientAt: AT }));
    await vi.advanceTimersByTimeAsync(2100);
    expect((await pending).status).toBe(201);
  });

  it('says who did a task, and a held completion goes when it is undone', async () => {
    await getStore().patch({ PK: hhPk(householdId), SK: memberSk(U2) }, { settings: { ...DEFAULT_SETTINGS, quietHours: { start: 8, end: 12 } } });
    const created = task({ repeat: { type: 'after', days: 1 } });
    const id = created.id as string;
    await call(U1, 'POST', '/api/hh/tasks', created);
    const done = await call(U1, 'POST', `/api/hh/tasks/${id}/complete`, mut({ cycleSeq: 1, completedAt: AT, notify: true, clientAt: AT }));
    expect(done.status).toBe(200);
    expect(sent).toEqual([]);
    expect(await getStore().query(hhPk(householdId), { skPrefix: HELD_PREFIX })).toHaveLength(1);
    await call(U1, 'DELETE', `/api/hh/tasks/${id}/completions/1`, mut());
    expect(await getStore().query(hhPk(householdId), { skPrefix: HELD_PREFIX })).toEqual([]);
  });

  it('sends a completion at once when the other member is not in quiet hours', async () => {
    const created = task();
    await call(U1, 'POST', '/api/hh/tasks', created);
    await call(U1, 'POST', `/api/hh/tasks/${created.id}/complete`, mut({ cycleSeq: 1, completedAt: AT, notify: true, clientAt: AT }));
    expect(sent[0].payload.title).toBe('Sam did Hoover');
  });
});

describe('Let them know on the shopping list', () => {
  it('says what was ticked off', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/items/${id}`, mut({ text: 'Milk', textAt: AT }));
    await call(U1, 'PUT', `/api/hh/items/${id}`, mut({ ticked: true, tickedAt: AT, notify: true, clientAt: AT }));
    expect(sent[0].payload).toMatchObject({ title: 'Sam ticked off an item', body: 'Milk' });
  });

  it('sends one combined push for a batch', async () => {
    const writes = ['A', 'B', 'C'].map(text => ({ id: uuid(), text, textAt: AT }));
    const res = await call(U1, 'POST', '/api/hh/items/batch', mut({ writes, notify: true, clientAt: AT }));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ title: 'Sam updated the shopping list', body: '3 items added to the shopping list' });
  });

  it('sends nothing when a delete does not say notify', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/items/${id}`, mut({ text: 'Milk', textAt: AT }));
    await call(U1, 'DELETE', `/api/hh/items/${id}`, mut());
    expect(sent).toEqual([]);
  });
});
