import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { getStore, setStore } from '../../store';
import { MemoryStore } from '../../store/memory';
import { registerHouseholdRoutes } from '../households';
import { createRouter, type Router } from '../router';
import { registerTaskRoutes } from '../tasks';

const NOW = Date.parse('2026-11-13T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
let router: Router;
let householdId: string;

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

const mut = (body: Record<string, unknown> = {}): Record<string, unknown> => ({ mutationId: uuid(), ...body });
const newTask = (over: Record<string, unknown> = {}): Record<string, unknown> & { id: string } => mut({ id: uuid(), title: 'Hoover', assignee: 'either', repeat: { type: 'after', days: 1 }, dueOn: '2026-11-12', ...over }) as Record<string, unknown> & { id: string };

beforeEach(async () => {
  n = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setStore(new MemoryStore());
  router = createRouter();
  registerHouseholdRoutes(router);
  registerTaskRoutes(router);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const made = await call(U1, 'POST', '/api/households', mut({ name: 'Home', displayName: 'Sam', timezone: 'Europe/London' }));
  householdId = made.json.householdId;
  const store = getStore();
  await store.put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey(U2), householdId });
});
afterEach(() => {
  setStore(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('who may call', () => {
  const some = uuid();
  it.each([
    ['GET', '/api/hh/tasks', undefined],
    ['POST', '/api/hh/tasks', undefined],
    ['PATCH', `/api/hh/tasks/${some}`, undefined],
    ['DELETE', `/api/hh/tasks/${some}`, undefined],
    ['POST', `/api/hh/tasks/${some}/complete`, undefined],
    ['DELETE', `/api/hh/tasks/${some}/completions/1`, undefined],
    ['GET', `/api/hh/tasks/${some}/history`, undefined],
    ['POST', '/api/hh/proposals', undefined],
    ['POST', `/api/hh/proposals/${some}/accept`, undefined],
    ['POST', `/api/hh/proposals/${some}/decline`, undefined],
    ['POST', `/api/hh/proposals/${some}/withdraw`, undefined],
    ['POST', '/api/hh/restore', undefined],
  ])('%s %s answers 403 no_household to someone with no household', async (method, path, body) => {
    const res = await call('auth0|nobody', method, path, body);
    expect(res).toEqual({ status: 403, json: { error: 'no_household' } });
  });

  it('answers 404 for another household\'s task, whatever the verb', async () => {
    await call('auth0|u3', 'POST', '/api/households', mut({ name: 'Other', displayName: 'Z', timezone: 'UTC' }));
    const theirs = newTask();
    expect((await call('auth0|u3', 'POST', '/api/hh/tasks', theirs)).status).toBe(201);
    const id = theirs.id as string;
    expect((await call(U1, 'PATCH', `/api/hh/tasks/${id}`, mut({ title: 'x', titleAt: NOW }))).status).toBe(404);
    expect((await call(U1, 'DELETE', `/api/hh/tasks/${id}`, mut({ baseRuleVersion: 1 }))).status).toBe(404);
    expect((await call(U1, 'POST', `/api/hh/tasks/${id}/complete`, mut({ cycleSeq: 1, completedAt: NOW }))).status).toBe(404);
    expect((await call(U1, 'GET', `/api/hh/tasks/${id}/history`)).status).toBe(404);
  });

  it('ignores a household id in the query: the tasks are the caller\'s own', async () => {
    await call(U1, 'POST', '/api/hh/tasks', newTask({ title: 'Mine' }));
    await call('auth0|u3', 'POST', '/api/households', mut({ name: 'Other', displayName: 'Z', timezone: 'UTC' }));
    await call('auth0|u3', 'POST', '/api/hh/tasks', newTask({ title: 'Theirs' }));
    const res = await call(U1, 'GET', '/api/hh/tasks', undefined, { householdId: 'other' });
    expect(res.json.tasks.map((t: { title: string }) => t.title)).toEqual(['Mine']);
  });
});

describe('garbage input', () => {
  const base = () => newTask();
  it.each([
    ['a task id that is not a UUID', () => ({ ...base(), id: 'x' }), 'id'],
    ['a 10 KB title', () => ({ ...base(), title: 'x'.repeat(10_240) }), 'title'],
    ['31 checklist steps', () => ({ ...base(), checklist: Array.from({ length: 31 }, () => ({ id: uuid(), text: 'a' })) }), 'checklist'],
    ['repeat.every 0', () => ({ ...base(), repeat: { type: 'fixed', every: 0, unit: 'day', startOn: '2026-11-01' } }), 'repeat.every'],
    ['an impossible date', () => ({ ...base(), dueOn: '2026-02-30' }), 'dueOn'],
    ['an unknown key', () => ({ ...base(), colour: 'red' }), 'colour'],
    ['a missing mutation id', () => ({ ...base(), mutationId: undefined }), 'mutationId'],
  ])('rejects %s on create with 400 naming the field', async (_name, body, field) => {
    expect(await call(U1, 'POST', '/api/hh/tasks', body())).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('rejects an unknown PATCH key and an empty PATCH', async () => {
    const task = newTask();
    await call(U1, 'POST', '/api/hh/tasks', task);
    expect((await call(U1, 'PATCH', `/api/hh/tasks/${task.id}`, mut({ role: 'admin', title: 'x', titleAt: NOW }))).json).toEqual({ error: 'invalid', field: 'role' });
    expect((await call(U1, 'PATCH', `/api/hh/tasks/${task.id}`, mut())).json).toEqual({ error: 'invalid', field: 'body' });
  });

  it('rejects a body that is not an object', async () => {
    for (const body of ['not json', '[]', 'null']) {
      expect(await call(U1, 'POST', '/api/hh/tasks', body)).toEqual({ status: 400, json: { error: 'invalid', field: 'body' } });
    }
  });

  it('answers 404 for a path id that is not a UUID, and 400 for a malformed escape', async () => {
    expect((await call(U1, 'PATCH', '/api/hh/tasks/not-a-uuid', mut({ title: 'x', titleAt: NOW }))).status).toBe(404);
    expect((await call(U1, 'DELETE', `/api/hh/tasks/${uuid()}/completions/abc`, mut())).status).toBe(404);
    expect(await call(U1, 'GET', '/api/hh/tasks/%E0%A4%A/history')).toEqual({ status: 400, json: { error: 'invalid', field: 'path' } });
  });
});

describe('the task flow', () => {
  it('creates, lists, completes, undoes, deletes and restores', async () => {
    const task = newTask();
    const created = await call(U1, 'POST', '/api/hh/tasks', task);
    expect(created.status).toBe(201);
    expect(created.json.task).toMatchObject({ id: task.id, cycleSeq: 1, dueOn: '2026-11-12' });

    const listed = await call(U2, 'GET', '/api/hh/tasks');
    expect(listed.json).toMatchObject({ serverTime: NOW, proposals: [] });
    expect(listed.json.tasks).toHaveLength(1);

    const done = await call(U2, 'POST', `/api/hh/tasks/${task.id}/complete`, mut({ cycleSeq: 1, completedAt: NOW }));
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ cycleSeq: 1, task: { cycleSeq: 2, dueOn: '2026-11-14' } });

    const undone = await call(U2, 'DELETE', `/api/hh/tasks/${task.id}/completions/1`, mut());
    expect(undone.json.task).toMatchObject({ cycleSeq: 1, dueOn: '2026-11-12' });

    const deleted = await call(U1, 'DELETE', `/api/hh/tasks/${task.id}`, mut({ baseRuleVersion: 1 }));
    expect(deleted.json.task).toMatchObject({ deletedBy: U1, ruleVersion: 2 });
    expect((await call(U1, 'GET', '/api/hh/tasks')).json.tasks[0].deletedAt).toBeDefined();
    expect((await call(U1, 'PATCH', `/api/hh/tasks/${task.id}`, mut({ title: 'x', titleAt: NOW + 1 }))).status).toBe(410);

    const restored = await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'task', id: task.id }] }));
    expect(restored.json.results).toEqual([{ id: task.id, status: 'restored' }]);
  });

  it('answers a retried completion with the same body, and does not complete the next cycle', async () => {
    const task = newTask();
    await call(U1, 'POST', '/api/hh/tasks', task);
    const body = mut({ cycleSeq: 1, completedAt: NOW });
    const first = await call(U1, 'POST', `/api/hh/tasks/${task.id}/complete`, body);
    const retry = await call(U1, 'POST', `/api/hh/tasks/${task.id}/complete`, body);
    expect(retry).toEqual(first);
    expect((await call(U1, 'GET', '/api/hh/tasks')).json.tasks[0].cycleSeq).toBe(2);
  });

  it('answers 409 with the current task for a completion of an out-of-date cycle', async () => {
    const task = newTask();
    await call(U1, 'POST', '/api/hh/tasks', task);
    // The phone last saw cycle 2, but the task is now at cycle 3 and cycle 2 has no completion record.
    await getStore().patch({ PK: hhPk(householdId), SK: `TASK#${task.id}` }, { cycleSeq: 3 });
    const res = await call(U2, 'POST', `/api/hh/tasks/${task.id}/complete`, mut({ cycleSeq: 2, completedAt: NOW }));
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ error: 'conflict', task: { id: task.id, cycleSeq: 3 } });
  });

  it('answers 403 proposal_required, naming who to ask, for the other member\'s task', async () => {
    const task = newTask();
    await call(U1, 'POST', '/api/hh/tasks', task);
    await call(U1, 'PATCH', `/api/hh/tasks/${task.id}`, mut({ assignee: U1, baseRuleVersion: 1 }));
    const res = await call(U2, 'DELETE', `/api/hh/tasks/${task.id}`, mut({ baseRuleVersion: 2 }));
    expect(res).toEqual({ status: 403, json: { error: 'proposal_required', toUserId: U1 } });
  });

  it('runs a proposal from creation to acceptance', async () => {
    const task = newTask({ assignee: 'either' });
    await call(U1, 'POST', '/api/hh/tasks', task);
    const proposalId = uuid();
    const made = await call(U1, 'POST', '/api/hh/proposals', mut({ id: proposalId, taskId: task.id, baseRuleVersion: 1, change: { kind: 'edit', set: { assignee: U2 } } }));
    expect(made.status).toBe(201);
    expect((await call(U2, 'GET', '/api/hh/tasks')).json.proposals.map((p: { id: string }) => p.id)).toEqual([proposalId]);
    expect((await call(U1, 'POST', `/api/hh/proposals/${proposalId}/accept`, mut())).status).toBe(403);
    const accepted = await call(U2, 'POST', `/api/hh/proposals/${proposalId}/accept`, mut());
    expect(accepted.json).toMatchObject({ proposal: { status: 'accepted' }, task: { assignee: U2, ruleVersion: 2 } });
  });

  it('lists a completion with everyone who did it', async () => {
    const task = newTask();
    await call(U1, 'POST', '/api/hh/tasks', task);
    await call(U1, 'POST', `/api/hh/tasks/${task.id}/complete`, mut({ cycleSeq: 1, completedAt: NOW }));
    await call(U2, 'POST', `/api/hh/tasks/${task.id}/complete`, mut({ cycleSeq: 1, completedAt: NOW + 1000 }));
    const history = await call(U1, 'GET', `/api/hh/tasks/${task.id}/history`);
    expect(history.json.completions[0].by).toEqual([{ userId: U1, at: NOW }, { userId: U2, at: NOW + 1000 }]);
  });
});
