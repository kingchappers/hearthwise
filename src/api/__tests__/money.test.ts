import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import { moneyKey } from '../../money/keys';
import { setSender } from '../../push/registry';
import { saveSubscription } from '../../push/subscriptions';
import type { PushPayload, PushSender } from '../../push/sender';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { getStore, setStore } from '../../store';
import { MemoryStore } from '../../store/memory';
import { registerHouseholdRoutes } from '../households';
import { registerMoneyRoutes } from '../money';
import { createRouter, type Router } from '../router';
import { registerTaskRoutes } from '../tasks';

const NOW = Date.parse('2026-11-15T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const AT = NOW - 1000;
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
let router: Router;
let householdId: string;
let sent: { endpoint: string; payload: PushPayload }[];
let logs: string[];
const sender: PushSender = { send: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); return { status: 201 }; } };

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
const expenseBody = (over: Record<string, unknown> = {}): Record<string, unknown> => mut({
  kind: 'expense', paidBy: U1, amountPence: 6340, sharePence: 3170, description: 'Weekly shop', descriptionAt: AT, on: '2026-11-14', onAt: AT, ...over,
});
const loanBody = (over: Record<string, unknown> = {}): Record<string, unknown> => expenseBody({ kind: 'loan', amountPence: 5000, sharePence: 5000, description: 'Rent shortfall', ...over });
const create = async (user: string, body: Record<string, unknown>) => {
  const id = uuid();
  const res = await call(user, 'PUT', `/api/hh/money/${id}`, body);
  return { id, ...res };
};
const agree = (user: string, id: string, version: number, over: Record<string, unknown> = {}) => call(user, 'POST', `/api/hh/money/${id}/respond`, mut({ response: 'agree', version, ...over }));

beforeEach(async () => {
  n = 0;
  sent = [];
  logs = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setStore(new MemoryStore());
  setSender(sender);
  router = createRouter();
  registerHouseholdRoutes(router);
  registerMoneyRoutes(router);
  registerTaskRoutes(router);
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => { logs.push(String(line)); });
  householdId = (await call(U1, 'POST', '/api/households', mut({ name: 'Home', displayName: 'Sam', timezone: 'Europe/London' }))).json.householdId;
  await getStore().put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await getStore().put({ ...membershipKey(U2), householdId });
  for (const user of [U1, U2]) await saveSubscription(getStore(), user, { endpoint: `https://fcm.googleapis.com/fcm/send/${user}`, p256dh: 'p', auth: 'a', createdAt: NOW });
  logs.length = 0;
});
afterEach(() => { setStore(undefined); setSender(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('who may call', () => {
  const some = uuid();
  it.each([
    ['GET', '/api/hh/money'], ['PUT', `/api/hh/money/${some}`], ['POST', `/api/hh/money/${some}/respond`], ['POST', `/api/hh/money/${some}/change`],
    ['POST', `/api/hh/money/${some}/change/respond`], ['POST', `/api/hh/money/${some}/change/withdraw`], ['DELETE', `/api/hh/money/${some}`],
  ])('%s %s answers 403 no_household to someone with no household', async (method, path) => {
    expect(await call('auth0|nobody', method, path)).toEqual({ status: 403, json: { error: 'no_household' } });
  });

  it('does not show or reach another household\'s entries', async () => {
    const other = (await call('auth0|u3', 'POST', '/api/households', mut({ name: 'Other', displayName: 'Z', timezone: 'UTC' }))).json.householdId;
    const theirs = '00000000-0000-4000-8000-0000000000ff';
    await getStore().put({ PK: hhPk(other), SK: `MONEY#${theirs}`, kind: 'loan', paidBy: 'auth0|u3', createdBy: 'auth0|u3', proposedBy: 'auth0|u3', amountPence: 1, sharePence: 1, status: 'waiting', version: 1, createdAt: 1, updatedAt: 1 });
    expect((await call(U1, 'GET', '/api/hh/money')).json.entries).toEqual([]);
    expect((await call('auth0|u3', 'GET', '/api/hh/money')).json.entries).toHaveLength(1);
    expect((await call(U1, 'POST', `/api/hh/money/${theirs}/respond`, mut({ response: 'agree', version: 1 }))).status).toBe(404);
    expect((await call(U1, 'DELETE', `/api/hh/money/${theirs}`, mut())).status).toBe(404);
  });
});

describe('PUT /api/hh/money/{id}', () => {
  it('creates an entry with 200 and { entry }, waiting for the other person', async () => {
    const made = await create(U1, expenseBody());
    expect(made.status).toBe(200);
    expect(made.json.entry).toMatchObject({ id: made.id, kind: 'expense', status: 'waiting', version: 1, proposedBy: U1 });
  });

  it('edits the description of an agreed entry without agreement', async () => {
    const made = await create(U1, loanBody());
    await agree(U2, made.id, 1);
    const edited = await call(U2, 'PUT', `/api/hh/money/${made.id}`, mut({ description: 'Rent', descriptionAt: AT + 50 }));
    expect(edited.status).toBe(200);
    expect(edited.json.entry).toMatchObject({ description: 'Rent', status: 'agreed' });
  });

  it.each([
    ['a fractional penny', () => expenseBody({ amountPence: 12.5 }), 'amountPence'],
    ['a share above the amount', () => expenseBody({ sharePence: 6341 }), 'sharePence'],
    ['an empty description', () => expenseBody({ description: '' }), 'description'],
    ['an unknown key', () => expenseBody({ colour: 'red' }), 'colour'],
    ['a missing mutation id', () => { const body = expenseBody(); delete body.mutationId; return body; }, 'mutationId'],
  ])('rejects %s with 400 naming the field', async (_name, body, field) => {
    expect(await call(U1, 'PUT', `/api/hh/money/${uuid()}`, body())).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('rejects a body that is not an object', async () => {
    expect(await call(U1, 'PUT', `/api/hh/money/${uuid()}`, '[1]')).toEqual({ status: 400, json: { error: 'invalid', field: 'body' } });
  });

  it('answers 404 for an id that is not a UUID', async () => {
    expect((await call(U1, 'PUT', '/api/hh/money/nope', expenseBody())).status).toBe(404);
    expect((await call(U1, 'DELETE', '/api/hh/money/nope', mut())).status).toBe(404);
  });

  it('answers a repeat of the same mutation from its record', async () => {
    const id = uuid();
    const body = expenseBody();
    const first = await call(U1, 'PUT', `/api/hh/money/${id}`, body);
    const again = await call(U1, 'PUT', `/api/hh/money/${id}`, { ...body, amountPence: 100, sharePence: 50 });
    expect(again).toEqual(first);
  });

  it('answers 409 entry_changed with the current entry for a stale money edit', async () => {
    const made = await create(U1, expenseBody());
    await call(U1, 'PUT', `/api/hh/money/${made.id}`, mut({ description: 'x', descriptionAt: AT + 1 }));
    const stale = await call(U1, 'PUT', `/api/hh/money/${made.id}`, mut({ paidBy: U1, amountPence: 100, sharePence: 50, baseVersion: 1 }));
    expect(stale.status).toBe(409);
    expect(stale.json).toMatchObject({ error: 'entry_changed', entry: { id: made.id, version: 2 } });
  });

  it('answers 409 needs_agreement for a money edit of an agreed entry', async () => {
    const made = await create(U1, loanBody());
    await agree(U2, made.id, 1);
    const res = await call(U1, 'PUT', `/api/hh/money/${made.id}`, mut({ paidBy: U1, amountPence: 100, sharePence: 100, baseVersion: 2 }));
    expect(res).toEqual({ status: 409, json: { error: 'needs_agreement' } });
  });

  it('answers 409 needs_two with one member, and 409 pair_changed when the pair changed', async () => {
    await call(U1, 'PUT', `/api/hh/money/${uuid()}`, expenseBody({ paidBy: U2 }));
    await getStore().delete({ PK: hhPk(householdId), SK: memberSk(U2) });
    expect((await call(U1, 'PUT', `/api/hh/money/${uuid()}`, expenseBody())).json).toEqual({ error: 'needs_two' });
    await getStore().put({ PK: hhPk(householdId), SK: memberSk('auth0|u3'), displayName: 'Kim', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-14T11:00:00.000Z' });
    await getStore().put({ ...membershipKey('auth0|u3'), householdId });
    expect((await call(U1, 'PUT', `/api/hh/money/${uuid()}`, expenseBody())).json).toEqual({ error: 'pair_changed' });
    expect((await call(U1, 'GET', '/api/hh/money')).json.entries).toHaveLength(1);
  });

  it('answers 409 money_limit at 2,000 live entries', async () => {
    for (let i = 0; i < 2000; i += 1) {
      await getStore().put({ ...moneyKey(householdId, `fill-${i}`), kind: 'expense', paidBy: U1, createdBy: U1, proposedBy: U1, amountPence: 1, sharePence: 0, status: 'agreed', version: 1, createdAt: 1, updatedAt: 1, description: 'x', on: '2026-11-14' });
    }
    expect((await call(U1, 'PUT', `/api/hh/money/${uuid()}`, expenseBody())).json).toEqual({ error: 'money_limit' });
  });
});

describe('respond, change, withdraw and delete', () => {
  it('walks a loan from waiting to agreed and through a change request', async () => {
    const made = await create(U1, loanBody());
    const agreed = await agree(U2, made.id, 1);
    expect(agreed.json.entry).toMatchObject({ status: 'agreed', agreedBy: U2, version: 2 });

    const requestId = uuid();
    const asked = await call(U1, 'POST', `/api/hh/money/${made.id}/change`, { mutationId: requestId, version: 2, money: { paidBy: U1, amountPence: 3000, sharePence: 3000 } });
    expect(asked.json.entry.pendingChange).toMatchObject({ id: requestId, by: U1 });
    const answered = await call(U2, 'POST', `/api/hh/money/${made.id}/change/respond`, mut({ response: 'agree', requestId }));
    expect(answered.json.entry).toMatchObject({ amountPence: 3000, version: 3 });
    expect(answered.json.entry.pendingChange).toBeUndefined();
  });

  it('withdraws a request', async () => {
    const made = await create(U1, loanBody());
    await agree(U2, made.id, 1);
    const requestId = uuid();
    await call(U1, 'POST', `/api/hh/money/${made.id}/change`, { mutationId: requestId, version: 2, delete: true });
    const res = await call(U1, 'POST', `/api/hh/money/${made.id}/change/withdraw`, mut({ requestId }));
    expect(res.status).toBe(200);
    expect(res.json.entry.pendingChange).toBeUndefined();
  });

  it('deletes a waiting entry for the proposer only', async () => {
    const made = await create(U1, expenseBody());
    expect((await call(U2, 'DELETE', `/api/hh/money/${made.id}`, mut())).json).toEqual({ error: 'forbidden' });
    const res = await call(U1, 'DELETE', `/api/hh/money/${made.id}`, mut());
    expect(res.status).toBe(200);
    expect(res.json.entry.deletedBy).toBe(U1);
    expect((await call(U1, 'PUT', `/api/hh/money/${made.id}`, mut({ description: 'x', descriptionAt: AT }))).status).toBe(410);
  });

  it.each([
    ['respond', { response: 'maybe', version: 1 }, 'response'],
    ['change', { version: 1 }, 'money'],
    ['change/respond', { response: 'agree' }, 'requestId'],
    ['change/withdraw', {}, 'requestId'],
  ])('rejects a bad %s body naming the field', async (path, body, field) => {
    expect(await call(U1, 'POST', `/api/hh/money/${uuid()}/${path}`, mut(body))).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('answers 404 for an entry that is not there', async () => {
    expect((await agree(U1, uuid(), 1)).status).toBe(404);
  });
});

describe('GET /api/hh/money', () => {
  it('lists the entries with the server time, and is not cached', async () => {
    const made = await create(U1, expenseBody());
    const res = await router.dispatch(event('GET', '/api/hh/money'), U2);
    expect(res.headers?.['Cache-Control']).toMatch(/no-store/);
    expect(JSON.parse(res.body!)).toMatchObject({ entries: [{ id: made.id }], serverTime: NOW });
  });
});

describe('notifications', () => {
  const recipientOnly = (): void => expect(sent.map(item => item.endpoint)).toEqual([`https://fcm.googleapis.com/fcm/send/${U2}`]);

  it('sends nothing unless asked', async () => {
    await create(U1, expenseBody());
    expect(sent).toEqual([]);
  });

  it('tells the other person about a new entry, with no amount, description or name of the loan', async () => {
    await create(U1, loanBody({ notify: true, clientAt: AT }));
    recipientOnly();
    expect(sent[0].payload).toMatchObject({ title: 'Sam added a money entry', url: '/money' });
    expect(JSON.stringify(sent[0].payload)).not.toMatch(/Rent|shortfall|50|5000/);
  });

  it('sends once for a retry', async () => {
    const id = uuid();
    const body = loanBody({ notify: true, clientAt: AT });
    await call(U1, 'PUT', `/api/hh/money/${id}`, body);
    await call(U1, 'PUT', `/api/hh/money/${id}`, body);
    expect(sent).toHaveLength(1);
  });

  it('does not send for a request made more than 30 minutes ago', async () => {
    await create(U1, loanBody({ notify: true, clientAt: NOW - 31 * 60 * 1000 }));
    expect(sent).toEqual([]);
  });

  it('sends "replied" for a response and "asked" for a request, a request response and a withdrawal', async () => {
    const made = await create(U1, loanBody());
    await agree(U2, made.id, 1, { notify: true, clientAt: AT });
    const requestId = uuid();
    await call(U1, 'POST', `/api/hh/money/${made.id}/change`, { mutationId: requestId, version: 2, delete: true, notify: true, clientAt: AT });
    await call(U2, 'POST', `/api/hh/money/${made.id}/change/respond`, mut({ response: 'decline', requestId, notify: true, clientAt: AT }));
    const second = uuid();
    await call(U1, 'POST', `/api/hh/money/${made.id}/change`, { mutationId: second, version: 2, delete: true });
    await call(U1, 'POST', `/api/hh/money/${made.id}/change/withdraw`, mut({ requestId: second, notify: true, clientAt: AT }));
    expect(sent.map(item => item.payload.title)).toEqual([
      'Alex replied to a money entry', 'Sam asked about a money entry', 'Alex replied to a money entry', 'Sam asked about a money entry',
    ]);
    for (const item of sent) expect(item.payload.url).toBe('/money');
  });

  it('sends nothing for an edit or a delete of a waiting entry, even when asked', async () => {
    const made = await create(U1, expenseBody());
    await call(U1, 'PUT', `/api/hh/money/${made.id}`, mut({ description: 'x', descriptionAt: AT, notify: true, clientAt: AT }));
    await call(U1, 'DELETE', `/api/hh/money/${made.id}`, mut({ notify: true, clientAt: AT }));
    expect(sent).toEqual([]);
  });
});

describe('logging', () => {
  const lines = (event: string): Record<string, unknown>[] => logs.map(line => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return {}; } }).filter(line => line.event === event);

  it('logs one money_write line per fresh write, with ids, enums and pence only', async () => {
    const id = uuid();
    const body = expenseBody();
    await call(U1, 'PUT', `/api/hh/money/${id}`, body);
    await call(U1, 'PUT', `/api/hh/money/${id}`, body);
    expect(lines('money_write')).toEqual([{
      event: 'money_write', householdId, mutationId: body.mutationId, action: 'create', kind: 'expense', amountPence: 6340, sharePence: 3170, status: 'waiting',
    }]);
  });

  it('logs a refusal with its code', async () => {
    const made = await create(U1, loanBody());
    const body = mut({ response: 'agree', version: 9 });
    await call(U2, 'POST', `/api/hh/money/${made.id}/respond`, body);
    expect(lines('money_reject')).toEqual([{ event: 'money_reject', householdId, mutationId: body.mutationId, reason: 'entry_changed' }]);
  });

  it('never lets a description or a name reach the log', async () => {
    const made = await create(U1, expenseBody({ description: 'Secret birthday present', notify: true, clientAt: AT }));
    await agree(U2, made.id, 1);
    await call(U1, 'PUT', `/api/hh/money/${made.id}`, mut({ description: 'Another secret', descriptionAt: AT + 5 }));
    await call(U1, 'POST', `/api/hh/money/${made.id}/change`, mut({ version: 2, delete: true }));
    await agree(U1, made.id, 1);
    const everything = logs.join('\n');
    expect(everything).not.toMatch(/secret|present|Sam|Alex|Weekly/i);
    expect(lines('money_write').length).toBeGreaterThan(2);
  });
});
