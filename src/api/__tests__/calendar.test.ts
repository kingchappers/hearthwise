import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { eventKey, calremKey } from '../../calendar/keys';
import { EVENT_LIMIT } from '../../calendar/events';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import { HELD_PREFIX } from '../../push/notifyOther';
import { setSender } from '../../push/registry';
import type { PushPayload, PushSender } from '../../push/sender';
import { saveSubscription } from '../../push/subscriptions';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { getStore, setStore } from '../../store';
import { MemoryStore } from '../../store/memory';
import { registerCalendarRoutes } from '../calendar';
import { registerHouseholdRoutes } from '../households';
import { createRouter, type Router } from '../router';
import { registerTaskRoutes } from '../tasks';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const SECRET = 'SENTINEL-counselling';
const AT = NOW - 1000;
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
let router: Router;
let householdId: string;
let sent: { endpoint: string; payload: PushPayload }[];
let logged: unknown[][];
const sender: PushSender = { send: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); return { status: 201 }; } };

function event(method: string, path: string, body?: unknown): APIGatewayProxyEventV2 {
  return {
    rawPath: path, requestContext: { http: { method } }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: 'hearth.example.com' }, queryStringParameters: {}, isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
async function call(userId: string, method: string, path: string, body?: unknown) {
  const res = await router.dispatch(event(method, path, body), userId);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined, text: res.body ?? '' };
}
const mut = (body: Record<string, unknown> = {}): Record<string, unknown> => ({ mutationId: uuid(), ...body });
const body = (extra: Record<string, unknown> = {}): Record<string, unknown> => mut({
  kind: 'event', title: 'Dentist', titleAt: AT, startOn: '2026-12-02', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' }, scheduleAt: AT,
  who: 'both', private: false, peopleAt: AT, ...extra,
});
const privateBody = (extra: Record<string, unknown> = {}) => body({ title: SECRET, place: `${SECRET}-place`, placeAt: AT, notes: `${SECRET}-notes`, notesAt: AT, who: U1, private: true, ...extra });

beforeEach(async () => {
  n = 0;
  sent = [];
  logged = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setStore(new MemoryStore());
  setSender(sender);
  router = createRouter();
  registerHouseholdRoutes(router);
  registerTaskRoutes(router);
  registerCalendarRoutes(router);
  for (const channel of ['log', 'error', 'warn', 'info'] as const) vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => { logged.push(args); });
  householdId = (await call(U1, 'POST', '/api/households', mut({ name: 'Home', displayName: 'Sam', timezone: 'Europe/London' }))).json.householdId;
  await getStore().put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await getStore().put({ ...membershipKey(U2), householdId });
  for (const user of [U1, U2]) await saveSubscription(getStore(), user, { endpoint: `https://fcm.googleapis.com/fcm/send/${user}`, p256dh: 'p', auth: 'a', createdAt: NOW });
});
afterEach(() => { setStore(undefined); setSender(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('who may call', () => {
  const some = uuid();
  it.each([['GET', '/api/hh/calendar'], ['PUT', `/api/hh/calendar/${some}`], ['DELETE', `/api/hh/calendar/${some}`], ['PUT', `/api/hh/calendar/${some}/reminders`]])(
    '%s %s answers 403 no_household to someone with no household', async (method, path) => {
      expect(await call('auth0|nobody', method, path)).toEqual({ status: 403, json: { error: 'no_household' }, text: JSON.stringify({ error: 'no_household' }) });
    },
  );

  it('does not show or reach another household\'s events', async () => {
    await call('auth0|u3', 'POST', '/api/households', mut({ name: 'Other', displayName: 'Z', timezone: 'UTC' }));
    const id = uuid();
    expect((await call('auth0|u3', 'PUT', `/api/hh/calendar/${id}`, body())).status).toBe(200);
    expect((await call(U1, 'DELETE', `/api/hh/calendar/${id}`, mut())).status).toBe(404);
    expect((await call(U1, 'GET', '/api/hh/calendar')).json.events).toEqual([]);
  });

  it('answers 404 for an id that is not a UUID, before anything is read', async () => {
    expect((await call(U1, 'PUT', '/api/hh/calendar/not-a-uuid', body())).status).toBe(404);
    expect((await call(U1, 'DELETE', '/api/hh/calendar/not-a-uuid', mut())).status).toBe(404);
    expect((await call(U1, 'PUT', '/api/hh/calendar/not-a-uuid/reminders', mut({ list: [] }))).status).toBe(404);
  });
});

describe('PUT /api/hh/calendar/{id}', () => {
  it('creates and then changes an event, both with 200, and answers with the event', async () => {
    const id = uuid();
    const created = await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    expect(created.status).toBe(200);
    expect(created.json.event).toMatchObject({ id, title: 'Dentist', who: 'both', private: false, startTime: '10:30', createdBy: U1 });
    const edited = await call(U2, 'PUT', `/api/hh/calendar/${id}`, mut({ place: 'Surgery', placeAt: AT + 10 }));
    expect(edited.status).toBe(200);
    expect(edited.json.event).toMatchObject({ title: 'Dentist', place: 'Surgery', updatedBy: U2 });
    expect((await call(U1, 'GET', '/api/hh/calendar')).json.events).toHaveLength(1);
  });

  it('answers a retry with the same answer and writes nothing', async () => {
    const id = uuid();
    const request = body();
    const first = await call(U1, 'PUT', `/api/hh/calendar/${id}`, request);
    const stored = await getStore().get(eventKey(householdId, id));
    const again = await call(U1, 'PUT', `/api/hh/calendar/${id}`, request);
    expect(again.json).toEqual(first.json);
    expect(await getStore().get(eventKey(householdId, id))).toEqual(stored);
  });

  it.each([
    ['no body', undefined, 'mutationId'],
    ['not JSON', 'not json', 'body'],
    ['no mutation id', { kind: 'event' }, 'mutationId'],
    ['an unknown key', body({ colour: 'blue' }), 'colour'],
    ['a repeat counted from completion', body({ repeat: { type: 'after', days: 2 } }), 'repeat.type'],
    ['either as who', body({ who: 'either' }), 'who'],
    ['a title that is too long', body({ title: 'x'.repeat(81) }), 'title'],
  ])('answers 400 invalid for %s', async (_name, request, field) => {
    const res = await call(U1, 'PUT', `/api/hh/calendar/${uuid()}`, request);
    expect(res).toMatchObject({ status: 400, json: { error: 'invalid', field } });
  });

  it('answers 400 for a who who is not a member, 404 for an edit of nothing, 410 for a deleted event', async () => {
    expect(await call(U1, 'PUT', `/api/hh/calendar/${uuid()}`, body({ who: 'auth0|stranger' }))).toMatchObject({ status: 400, json: { error: 'invalid', field: 'who' } });
    expect(await call(U1, 'PUT', `/api/hh/calendar/${uuid()}`, mut({ title: 'x', titleAt: AT }))).toMatchObject({ status: 404, json: { error: 'not_found' } });
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    await call(U1, 'DELETE', `/api/hh/calendar/${id}`, mut());
    expect(await call(U1, 'PUT', `/api/hh/calendar/${id}`, mut({ title: 'x', titleAt: AT + 5 }))).toMatchObject({ status: 410, json: { error: 'gone' } });
  });

  it('answers 409 event_limit at 500 live events', async () => {
    for (let i = 0; i < EVENT_LIMIT; i += 1) {
      await getStore().put({ ...eventKey(householdId, `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`), title: 'x', createdBy: U1, private: false });
    }
    expect(await call(U1, 'PUT', `/api/hh/calendar/${uuid()}`, body())).toMatchObject({ status: 409, json: { error: 'event_limit' } });
  });

  it('does not log the title, place or notes of any write', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, privateBody());
    await call(U2, 'PUT', `/api/hh/calendar/${id}`, mut({ title: 'Stolen', titleAt: NOW }));
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain('SENTINEL');
    expect(JSON.stringify(logged)).not.toContain('Stolen');
    expect(JSON.stringify(logged)).not.toContain('Dentist');
  });
});

describe('a private event', () => {
  let id: string;
  beforeEach(async () => {
    id = uuid();
    expect((await call(U1, 'PUT', `/api/hh/calendar/${id}`, privateBody())).status).toBe(200);
  });

  it('shows the creator everything and the other person only that Sam is busy, from every read', async () => {
    expect((await call(U1, 'GET', '/api/hh/calendar')).json.events[0]).toMatchObject({ title: SECRET, place: `${SECRET}-place`, notes: `${SECRET}-notes`, private: true });
    const other = await call(U2, 'GET', '/api/hh/calendar');
    expect(other.json.events).toEqual([expect.objectContaining({ id, busy: true, owner: 'Sam', startOn: '2026-12-02', startTime: '10:30', durationMin: 45 })]);
    expect(other.text).not.toContain('SENTINEL');
  });

  it('answers 403 private to the other person on every write, also on a replay, and changes nothing', async () => {
    const edit = mut({ title: 'Mine now', titleAt: NOW });
    expect(await call(U2, 'PUT', `/api/hh/calendar/${id}`, edit)).toMatchObject({ status: 403, json: { error: 'private' } });
    expect(await call(U2, 'PUT', `/api/hh/calendar/${id}`, edit)).toMatchObject({ status: 403, json: { error: 'private' } });
    expect(await call(U2, 'DELETE', `/api/hh/calendar/${id}`, mut())).toMatchObject({ status: 403, json: { error: 'private' } });
    expect(await call(U2, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: [{ from: 'start', minutes: 5 }] }))).toMatchObject({ status: 403, json: { error: 'private' } });
    expect((await call(U1, 'GET', '/api/hh/calendar')).json.events[0].title).toBe(SECRET);
  });

  it('never carries its text in a response to the other person, including refusals', async () => {
    const answers = [
      await call(U2, 'GET', '/api/hh/calendar'),
      await call(U2, 'PUT', `/api/hh/calendar/${id}`, mut({ title: 'x', titleAt: NOW })),
      await call(U2, 'DELETE', `/api/hh/calendar/${id}`, mut()),
      await call(U2, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: [] })),
      await call(U2, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'event', id, deletedAt: 1 }] })),
    ];
    expect(answers.map(answer => answer.text).join('')).not.toContain('SENTINEL');
  });

  it('sends the other person no push, whatever was ticked, and holds nothing for them', async () => {
    await call(U1, 'PUT', `/api/hh/calendar/${uuid()}`, privateBody({ notify: true, clientAt: AT }));
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, mut({ place: 'Elsewhere', placeAt: AT + 50, notify: true, clientAt: AT }));
    expect(sent).toEqual([]);
    expect((await getStore().query(hhPk(householdId), { skPrefix: HELD_PREFIX }))).toEqual([]);
  });

  it('sends no push when an event is made private in the same edit, and none after', async () => {
    const shared = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${shared}`, body());
    await call(U1, 'PUT', `/api/hh/calendar/${shared}`, mut({ who: U1, private: true, peopleAt: AT + 50, notify: true, clientAt: AT }));
    expect(sent).toEqual([]);
  });

  it('keeps the text out of the logs and every push', async () => {
    await call(U1, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: [{ from: 'start', minutes: 30 }] }));
    await call(U2, 'PUT', `/api/hh/calendar/${id}`, mut({ title: 'x', titleAt: NOW }));
    expect(JSON.stringify(logged)).not.toContain('SENTINEL');
    expect(JSON.stringify(sent)).not.toContain('SENTINEL');
  });

  it('lets only the creator delete it, and lists the tombstone only for them', async () => {
    expect((await call(U1, 'DELETE', `/api/hh/calendar/${id}`, mut())).status).toBe(200);
    expect((await call(U2, 'GET', '/api/hh/calendar')).json).toMatchObject({ events: [], deleted: [] });
    expect((await call(U1, 'GET', '/api/hh/calendar')).json.deleted.map((e: { id: string }) => e.id)).toEqual([id]);
  });
});

describe('Let them know on an event', () => {
  it('tells the other person that an event was added, with no title', async () => {
    const res = await call(U1, 'PUT', `/api/hh/calendar/${uuid()}`, body({ notify: true, clientAt: AT }));
    expect(res.status).toBe(200);
    expect(sent.map(s => s.endpoint)).toEqual([`https://fcm.googleapis.com/fcm/send/${U2}`]);
    expect(sent[0].payload).toMatchObject({ title: 'Sam added an event', url: '/plan/calendar' });
    expect(JSON.stringify(sent)).not.toContain('Dentist');
  });

  it('tells the other person that an event changed, with no title', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    await call(U2, 'PUT', `/api/hh/calendar/${id}`, mut({ title: 'Hygienist', titleAt: AT + 100, notify: true, clientAt: AT }));
    expect(sent.map(s => s.endpoint)).toEqual([`https://fcm.googleapis.com/fcm/send/${U1}`]);
    expect(sent[0].payload).toMatchObject({ title: 'Alex changed an event', url: '/plan/calendar' });
    expect(JSON.stringify(sent)).not.toContain('Hygienist');
  });

  it.each([['missing', {}], ['false', { notify: false }]])('sends nothing when notify is %s', async (_name, extra) => {
    await call(U1, 'PUT', `/api/hh/calendar/${uuid()}`, body({ ...extra, clientAt: AT }));
    expect(sent).toEqual([]);
  });

  it('sends nothing for a retry, or for an older write that changed nothing', async () => {
    const id = uuid();
    const request = body({ notify: true, clientAt: AT });
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, request);
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, request);
    await call(U2, 'PUT', `/api/hh/calendar/${id}`, mut({ title: 'Old', titleAt: AT - 5000, notify: true, clientAt: AT }));
    expect(sent).toHaveLength(1);
  });

  it('sends nothing for a delete or a reminder save', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    await call(U1, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: [{ from: 'start', minutes: 5 }], notify: true, clientAt: AT }));
    await call(U1, 'DELETE', `/api/hh/calendar/${id}`, mut({ notify: true, clientAt: AT }));
    expect(sent).toEqual([]);
  });
});

describe('PUT /api/hh/calendar/{id}/reminders', () => {
  it('saves the caller\'s own reminders, the household\'s CALREM item, and answers with only the caller\'s', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    const mine = await call(U1, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: [{ from: 'start', minutes: 30 }] }));
    expect(mine.status).toBe(200);
    expect(mine.json.event.reminders).toEqual({ [U1]: { savedAt: NOW, list: [{ from: 'start', minutes: 30 }] } });
    expect(await getStore().get(calremKey(householdId))).toMatchObject({ updatedAt: NOW });
    const theirs = await call(U2, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: [{ from: 'start', minutes: 5 }] }));
    expect(Object.keys(theirs.json.event.reminders)).toEqual([U2]);
    expect(theirs.text).not.toContain('"minutes":30');
  });

  it('answers the refusals with their codes', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    const four = [0, 5, 10, 15].map(minutes => ({ from: 'start', minutes }));
    expect(await call(U1, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: four }))).toMatchObject({ status: 409, json: { error: 'reminder_limit' } });
    expect(await call(U1, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: [{ from: 'end', minutes: 0 }] }))).toMatchObject({ status: 400, json: { error: 'invalid' } });
    expect(await call(U1, 'PUT', `/api/hh/calendar/${id}/reminders`, mut({ list: 'x' }))).toMatchObject({ status: 400, json: { error: 'invalid', field: 'list' } });
    expect(await call(U1, 'PUT', `/api/hh/calendar/${uuid()}/reminders`, mut({ list: [] }))).toMatchObject({ status: 404 });
  });
});

describe('DELETE /api/hh/calendar/{id} and restore', () => {
  it('deletes, lists it as deleted, and restores it through the restore route', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    const deleted = await call(U2, 'DELETE', `/api/hh/calendar/${id}`, mut());
    expect(deleted.json.event).toMatchObject({ id, deletedAt: NOW, deletedBy: U2 });
    const listed = (await call(U1, 'GET', '/api/hh/calendar')).json;
    expect(listed.events).toEqual([]);
    expect(listed.deleted[0]).toMatchObject({ id, deletedAt: NOW });
    const restored = await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'event', id, deletedAt: NOW }] }));
    expect(restored.json.results).toEqual([{ id, status: 'restored' }]);
    expect(logged.map(line => String(line[0])).some(line => line.includes('"calendar_write"') && line.includes('"action":"restore"'))).toBe(true);
    expect((await call(U1, 'GET', '/api/hh/calendar')).json.events.map((e: { id: string }) => e.id)).toEqual([id]);
  });

  it('restoring with a stale deletion time answers entry_changed, and a second restore noop', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    await call(U1, 'DELETE', `/api/hh/calendar/${id}`, mut());
    expect((await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'event', id, deletedAt: NOW - 5 }] }))).json.results[0].status).toBe('entry_changed');
    expect((await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'event', id, deletedAt: NOW }] }))).json.results[0].status).toBe('restored');
    expect((await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'event', id, deletedAt: NOW }] }))).json.results[0].status).toBe('noop');
  });

  it('answers event_limit for a restore that would pass 500 live events', async () => {
    const id = uuid();
    await call(U1, 'PUT', `/api/hh/calendar/${id}`, body());
    await call(U1, 'DELETE', `/api/hh/calendar/${id}`, mut());
    for (let i = 0; i < EVENT_LIMIT; i += 1) {
      await getStore().put({ ...eventKey(householdId, `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`), title: 'x', createdBy: U1, private: false });
    }
    expect((await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'event', id, deletedAt: NOW }] }))).json.results).toEqual([{ id, status: 'event_limit' }]);
  });
});
