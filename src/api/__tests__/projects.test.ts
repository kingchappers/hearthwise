import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import { projectKey } from '../../projects/keys';
import { MAX_LIVE_PROJECTS } from '../../projects/projects';
import { MAX_LIVE_STEPS } from '../../projects/steps';
import { setSender } from '../../push/registry';
import type { PushPayload, PushSender } from '../../push/sender';
import { saveSubscription } from '../../push/subscriptions';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { getStore, setStore } from '../../store';
import { MemoryStore } from '../../store/memory';
import { registerHouseholdRoutes } from '../households';
import { registerProjectRoutes } from '../projects';
import { createRouter, type Router } from '../router';
import { registerTaskRoutes } from '../tasks';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const AT = NOW - 1000;
const SENTINEL = 'SENTINEL-joists-8841';
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
let router: Router;
let householdId: string;
let sent: { endpoint: string; payload: PushPayload }[];
let logged: unknown[][];
const sender: PushSender = { send: async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); return { status: 201 }; } };

function event(method: string, path: string, body?: unknown, query = ''): APIGatewayProxyEventV2 {
  return {
    rawPath: path, requestContext: { http: { method } }, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { host: 'hearth.example.com' }, queryStringParameters: Object.fromEntries(new URLSearchParams(query)), isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
async function call(userId: string, method: string, path: string, body?: unknown, query = '') {
  const res = await router.dispatch(event(method, path, body, query), userId);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined, text: res.body ?? '' };
}
const mut = (body: Record<string, unknown> = {}): Record<string, unknown> => ({ mutationId: uuid(), ...body });
const P = '/api/hh/projects';
const newProject = async (title = 'Decking', who = U1) => {
  const id = uuid();
  const res = await call(who, 'PUT', `${P}/${id}`, mut({ title, titleAt: AT }));
  return { id, res };
};
const newStep = async (projectId: string, text = 'Lift', position = 'i', who = U1) => {
  const id = uuid();
  const res = await call(who, 'PUT', `${P}/${projectId}/steps/${id}`, mut({ text, textAt: AT, position, positionAt: AT }));
  return { id, res };
};

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
  registerProjectRoutes(router);
  for (const channel of ['log', 'error', 'warn', 'info'] as const) vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => { logged.push(args); });
  householdId = (await call(U1, 'POST', '/api/households', mut({ name: 'Home', displayName: 'Sam', timezone: 'Europe/London' }))).json.householdId;
  await getStore().put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await getStore().put({ ...membershipKey(U2), householdId });
  for (const user of [U1, U2]) await saveSubscription(getStore(), user, { endpoint: `https://fcm.googleapis.com/fcm/send/${user}`, p256dh: 'p', auth: 'a', createdAt: NOW });
});
afterEach(() => { setStore(undefined); setSender(undefined); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('who may call', () => {
  it('answers a person with no household 404 on every project route', async () => {
    const id = uuid();
    for (const [method, path] of [['GET', P], ['GET', `${P}/${id}`], ['PUT', `${P}/${id}`], ['DELETE', `${P}/${id}`], ['POST', `${P}/${id}/take`]] as const) {
      expect((await call('auth0|stranger', method, path, mut({ title: 'x', titleAt: AT }))).status).toBeGreaterThanOrEqual(400);
    }
  });

  it('answers 404 for an id that is not a UUID', async () => {
    expect((await call(U1, 'GET', `${P}/not-an-id`)).status).toBe(404);
    expect((await call(U1, 'PUT', `${P}/${uuid()}/steps/nope`, mut({ text: 'x', textAt: AT, position: 'i', positionAt: AT }))).status).toBe(404);
  });
});

describe('projects', () => {
  it('creates and lists a project, and both people see it', async () => {
    const { id, res } = await newProject();
    expect(res).toMatchObject({ status: 200, json: { outcome: 'created', project: { title: 'Decking' } } });
    const theirs = await call(U2, 'GET', P);
    expect(theirs.json.projects.map((p: { id: string }) => p.id)).toEqual([id]);
    expect(theirs.json.projects[0].counts).toEqual({ steps: 0, done: 0, materials: 0, held: {} });
  });

  it('leaves the counts out when asked for the light read', async () => {
    await newProject();
    const light = await call(U1, 'GET', P, undefined, 'counts=0');
    expect('counts' in light.json.projects[0]).toBe(false);
  });

  it('answers a retry with the same answer', async () => {
    const id = uuid();
    const body = mut({ title: 'Decking', titleAt: AT });
    const first = await call(U1, 'PUT', `${P}/${id}`, body);
    const again = await call(U1, 'PUT', `${P}/${id}`, body);
    expect(again.json).toEqual(first.json);
  });

  it('refuses unknown keys and an empty write with 400', async () => {
    const id = uuid();
    expect((await call(U1, 'PUT', `${P}/${id}`, mut({ title: 'x', titleAt: AT, colour: 'red' }))).json).toEqual({ error: 'invalid', field: 'colour' });
    expect((await call(U1, 'PUT', `${P}/${id}`, mut())).json).toEqual({ error: 'invalid', field: 'body' });
    expect((await call(U1, 'PUT', `${P}/${id}`, { title: 'x', titleAt: AT })).json).toEqual({ error: 'invalid', field: 'mutationId' });
  });

  it('answers 404 for a project that never existed, and a 200 outcome for everything under one that does', async () => {
    expect((await call(U1, 'GET', `${P}/${uuid()}`)).status).toBe(404);
    expect((await call(U1, 'PUT', `${P}/${uuid()}`, mut({ notes: 'x', notesAt: AT }))).status).toBe(404);
    expect((await call(U1, 'POST', `${P}/${uuid()}/take`, mut())).status).toBe(404);
    const { id } = await newProject();
    const gone = await call(U1, 'PUT', `${P}/${id}/steps/${uuid()}`, mut({ note: 'x', noteAt: AT }));
    expect(gone).toMatchObject({ status: 200, json: { outcome: 'gone' } });
  });

  it('refuses a 61st project with 409 project_limit', async () => {
    for (let i = 0; i < MAX_LIVE_PROJECTS; i += 1) {
      await getStore().put({ ...projectKey(householdId, uuid()), title: 'p', status: 'active', fieldTimes: {}, updatedAt: 1 });
    }
    const { res } = await newProject('Over');
    expect(res).toMatchObject({ status: 409, json: { error: 'project_limit' } });
  });

  it('deletes a project, shows it as deleted with no children, and restores it with its steps', async () => {
    const { id } = await newProject();
    const step = await newStep(id);
    const del = await call(U2, 'DELETE', `${P}/${id}`, mut());
    expect(del).toMatchObject({ status: 200, json: { outcome: 'applied' } });
    const deletedAt = del.json.project.deletedAt;
    const detail = await call(U1, 'GET', `${P}/${id}`);
    expect(detail.json).toMatchObject({ project: { deletedAt }, steps: [] });
    expect((await call(U1, 'GET', P)).json.deleted.map((p: { id: string }) => p.id)).toEqual([id]);

    const restored = await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'project', id, deletedAt }] }));
    expect(restored.json.results).toEqual([{ id, status: 'restored' }]);
    expect((await call(U1, 'GET', `${P}/${id}`)).json.steps.map((s: { id: string }) => s.id)).toEqual([step.id]);
  });

  it('answers project_limit on a restore that would pass 60', async () => {
    const { id } = await newProject();
    const del = await call(U1, 'DELETE', `${P}/${id}`, mut());
    for (let i = 0; i < MAX_LIVE_PROJECTS; i += 1) await getStore().put({ ...projectKey(householdId, uuid()), title: 'p', status: 'active', fieldTimes: {}, updatedAt: 1 });
    const restored = await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'project', id, deletedAt: del.json.project.deletedAt }] }));
    expect(restored.json.results).toEqual([{ id, status: 'project_limit' }]);
  });

  it('needs the deletedAt the person saw to restore a project', async () => {
    const { id } = await newProject();
    expect((await call(U1, 'POST', '/api/hh/restore', mut({ entries: [{ kind: 'project', id }] }))).status).toBe(400);
  });
});

describe('steps', () => {
  it('creates steps, lists them in order with a tie broken by id, and edits and deletes one', async () => {
    const { id } = await newProject();
    const b = await newStep(id, 'Second', 'j');
    const a = await newStep(id, 'First', 'i');
    const detail = await call(U2, 'GET', `${P}/${id}`);
    expect(detail.json.steps.map((s: { id: string }) => s.id)).toEqual([a.id, b.id]);
    expect(detail.json.materials).toEqual([]);

    const edit = await call(U2, 'PUT', `${P}/${id}/steps/${a.id}`, mut({ text: 'Reworded', textAt: AT + 10 }));
    expect(edit.json).toMatchObject({ outcome: 'applied', stale: [], step: { text: 'Reworded' } });
    const stale = await call(U1, 'PUT', `${P}/${id}/steps/${a.id}`, mut({ text: 'Older', textAt: AT + 5 }));
    expect(stale.json).toMatchObject({ outcome: 'noop', stale: ['text'] });

    const del = await call(U1, 'DELETE', `${P}/${id}/steps/${a.id}`, mut());
    expect(del.json.outcome).toBe('applied');
    expect((await call(U1, 'GET', `${P}/${id}`)).json.steps.map((s: { id: string }) => s.id)).toEqual([b.id]);
  });

  it('refuses a 41st step with 409 step_limit', async () => {
    const { id } = await newProject();
    for (let i = 0; i < MAX_LIVE_STEPS; i += 1) await newStep(id, `s${i}`, `b${String(i).padStart(2, '0')}`);
    expect((await newStep(id, 'over', 'z')).res).toMatchObject({ status: 409, json: { error: 'step_limit' } });
  });

  it('answers a write under a deleted project gone, with a 200', async () => {
    const { id } = await newProject();
    await call(U1, 'DELETE', `${P}/${id}`, mut());
    expect((await newStep(id)).res).toMatchObject({ status: 200, json: { outcome: 'gone' } });
  });
});

describe('taking', () => {
  it('gives a step to the first caller, tells the second, and lets either release', async () => {
    const { id } = await newProject();
    const step = await newStep(id);
    const take = `${P}/${id}/steps/${step.id}/take`;
    expect((await call(U1, 'POST', take, mut())).json).toMatchObject({ outcome: 'taken', step: { takenBy: U1 } });
    expect((await call(U1, 'POST', take, mut())).json.outcome).toBe('already_yours');
    expect((await call(U2, 'POST', take, mut())).json).toMatchObject({ outcome: 'held_by_other', step: { takenBy: U1 } });
    expect((await call(U2, 'POST', `${P}/${id}/steps/${step.id}/release`, mut())).json.outcome).toBe('released');
    expect((await call(U2, 'POST', `${P}/${id}/steps/${step.id}/release`, mut())).json.outcome).toBe('not_held');
    expect((await call(U2, 'POST', take, mut())).json.outcome).toBe('taken');
  });

  it('takes a whole project, and refuses a body with anything in it but the envelope', async () => {
    const { id } = await newProject();
    expect((await call(U1, 'POST', `${P}/${id}/take`, mut())).json).toMatchObject({ outcome: 'taken', project: { takenBy: U1 } });
    expect((await call(U2, 'POST', `${P}/${id}/take`, mut({ takenBy: U2 }))).json).toEqual({ error: 'invalid', field: 'takenBy' });
  });

  it('answers a done step done, and a missing step gone, never a 4xx', async () => {
    const { id } = await newProject();
    const step = await newStep(id);
    await call(U1, 'PUT', `${P}/${id}/steps/${step.id}`, mut({ state: 'done', stateAt: AT + 10 }));
    expect((await call(U2, 'POST', `${P}/${id}/steps/${step.id}/take`, mut())).json.outcome).toBe('done');
    expect((await call(U2, 'POST', `${P}/${id}/steps/${uuid()}/take`, mut())).json.outcome).toBe('gone');
  });
});

describe('costs', () => {
  it('sets, changes and clears each figure on its own, shows who changed last, and refuses 0', async () => {
    const { id } = await newProject();
    const est = await call(U1, 'PUT', `${P}/${id}`, mut({ estimatePence: 400000, estimateAt: AT }));
    expect(est.json).toMatchObject({ outcome: 'applied', project: { estimatePence: 400000, costBy: U1 } });
    const spent = await call(U2, 'PUT', `${P}/${id}`, mut({ spentPence: 125000, spentAt: AT }));
    expect(spent.json.project).toMatchObject({ estimatePence: 400000, spentPence: 125000, costBy: U2 });
    expect((await call(U1, 'PUT', `${P}/${id}`, mut({ spentPence: 0, spentAt: AT + 5 }))).json).toEqual({ error: 'invalid', field: 'spentPence' });
    const older = await call(U1, 'PUT', `${P}/${id}`, mut({ spentPence: 90000, spentAt: AT - 50 }));
    expect(older.json).toMatchObject({ outcome: 'noop', stale: ['spent'] });
    const cleared = await call(U1, 'PUT', `${P}/${id}`, mut({ spentPence: null, spentAt: AT + 10 }));
    expect(cleared.json.project.spentPence).toBeUndefined();
    expect((await call(U2, 'GET', `${P}/${id}`)).json.project).toMatchObject({ estimatePence: 400000 });
  });

  it('never writes a MONEY# item, and never puts a figure in a log or a push', async () => {
    const { id } = await newProject(SENTINEL);
    await call(U1, 'PUT', `${P}/${id}`, mut({ spentPence: 8374651, spentAt: AT, estimatePence: 9274651, estimateAt: AT, notify: true, clientAt: AT }));
    expect(await getStore().query(hhPk(householdId), { skPrefix: 'MONEY#' })).toEqual([]);
    expect(JSON.stringify(logged)).not.toMatch(/8374651|9274651|SENTINEL/);
    expect(JSON.stringify(sent)).not.toMatch(/8374651|9274651|SENTINEL/);
  });
});

describe('the planned day', () => {
  it('sets, changes and clears a planned day that both people see, and refuses a bad span with 400', async () => {
    const { id } = await newProject();
    const set = await call(U1, 'PUT', `${P}/${id}`, mut({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06', plannedAt: AT }));
    expect(set.json).toMatchObject({ outcome: 'applied', project: { plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' } });
    expect((await call(U2, 'GET', P, undefined, 'counts=0')).json.projects[0]).toMatchObject({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' });
    expect((await call(U1, 'PUT', `${P}/${id}`, mut({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-30', plannedAt: AT + 5 }))).json).toEqual({ error: 'invalid', field: 'plannedEndOn' });
    const older = await call(U2, 'PUT', `${P}/${id}`, mut({ plannedOn: '2026-12-20', plannedAt: AT - 50 }));
    expect(older.json).toMatchObject({ outcome: 'noop', stale: ['planned'] });
    const cleared = await call(U1, 'PUT', `${P}/${id}`, mut({ plannedOn: null, plannedAt: AT + 10 }));
    expect(cleared.json.project.plannedOn).toBeUndefined();
  });
});

describe('materials', () => {
  const line = async (projectId: string, text = '1 box of 75mm screws', who = U1) => {
    const id = uuid();
    const res = await call(who, 'PUT', `${P}/${projectId}/materials/${id}`, mut({ text, textAt: AT }));
    return { id, res };
  };

  it('creates lines both people see, edits and deletes one, and returns them in the project', async () => {
    const { id: projectId } = await newProject();
    const a = await line(projectId, 'Timber');
    const b = await line(projectId, 'Screws', U2);
    expect(a.res).toMatchObject({ status: 200, json: { outcome: 'created', material: { text: 'Timber' } } });
    expect((await call(U2, 'GET', `${P}/${projectId}`)).json.materials.map((m: { text: string }) => m.text)).toEqual(['Timber', 'Screws']);
    expect((await call(U1, 'PUT', `${P}/${projectId}/materials/${a.id}`, mut({ text: 'Older', textAt: AT - 500 }))).json).toMatchObject({ outcome: 'noop', stale: ['text'] });
    expect((await call(U1, 'DELETE', `${P}/${projectId}/materials/${b.id}`, mut())).json.outcome).toBe('applied');
    expect((await call(U1, 'GET', `${P}/${projectId}`)).json.materials).toHaveLength(1);
  });

  it('refuses unknown keys, and a 61st line with 409 material_limit', async () => {
    const { id: projectId } = await newProject();
    expect((await call(U1, 'PUT', `${P}/${projectId}/materials/${uuid()}`, mut({ text: 'x', textAt: AT, qty: 2 }))).json).toEqual({ error: 'invalid', field: 'qty' });
    for (let i = 0; i < 60; i += 1) await line(projectId, `m${i}`);
    expect((await line(projectId, 'over')).res).toMatchObject({ status: 409, json: { error: 'material_limit' } });
  });

  it('copies lines to the shopping list once, with the project\'s label, and says already the second time', async () => {
    const { id: projectId } = await newProject('Garden room');
    const a = await line(projectId, 'Timber');
    const first = await call(U1, 'POST', `${P}/${projectId}/materials/add-to-list`, mut({ lineIds: [a.id] }));
    expect(first.json.results).toEqual([{ id: a.id, status: 'created' }]);
    const items = (await getStore().query(hhPk(householdId), { skPrefix: 'ITEM#' }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ text: 'Timber', forRecipes: 'Garden room' });
    const second = await call(U2, 'POST', `${P}/${projectId}/materials/add-to-list`, mut({ lineIds: [a.id] }));
    expect(second.json.results).toEqual([{ id: a.id, status: 'already' }]);
  });

  it('answers 400 for no lines, 404 for a project that never existed, and 200 missing for an unknown line', async () => {
    const { id: projectId } = await newProject();
    expect((await call(U1, 'POST', `${P}/${projectId}/materials/add-to-list`, mut({ lineIds: [] }))).json).toEqual({ error: 'invalid', field: 'lineIds' });
    expect((await call(U1, 'POST', `${P}/${uuid()}/materials/add-to-list`, mut({ lineIds: [uuid()] }))).status).toBe(404);
    expect((await call(U1, 'POST', `${P}/${projectId}/materials/add-to-list`, mut({ lineIds: [uuid()] }))).json.results[0].status).toBe('missing');
  });

  it('never puts a line\'s text or the title in a log or a push, and an add sends a counts-only push', async () => {
    const { id: projectId } = await newProject(SENTINEL);
    const a = await line(projectId, `${SENTINEL}-timber`);
    await call(U1, 'PUT', `${P}/${projectId}/materials/${uuid()}`, mut({ text: `${SENTINEL}-screws`, textAt: AT, notify: true, clientAt: AT }));
    await call(U1, 'POST', `${P}/${projectId}/materials/add-to-list`, mut({ lineIds: [a.id], notify: true, clientAt: AT }));
    expect(JSON.stringify(logged)).not.toContain('SENTINEL');
    expect(JSON.stringify(sent)).not.toContain('SENTINEL');
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe('what the pushes say', () => {
  const tick = { notify: true, clientAt: AT };
  const last = () => sent.at(-1)!.payload.title;

  it('says the kind of change: a step added, taken, given back, changed, a project finished, reopened or deleted, a materials list changed', async () => {
    const { id } = await newProject();
    sent.length = 0;
    const stepId = uuid();
    await call(U1, 'PUT', `${P}/${id}/steps/${stepId}`, mut({ text: 'Lift', textAt: AT, position: 'i', positionAt: AT, ...tick }));
    expect(last()).toBe('Sam added a step');
    await call(U1, 'PUT', `${P}/${id}/steps/${stepId}`, mut({ note: 'x', noteAt: AT + 5, ...tick }));
    expect(last()).toBe('Sam changed a step');
    await call(U1, 'POST', `${P}/${id}/steps/${stepId}/take`, mut(tick));
    expect(last()).toBe('Sam took a step');
    await call(U1, 'POST', `${P}/${id}/steps/${stepId}/release`, mut(tick));
    expect(last()).toBe('Sam gave a step back');
    await call(U1, 'POST', `${P}/${id}/take`, mut(tick));
    expect(last()).toBe('Sam took a project');
    await call(U1, 'POST', `${P}/${id}/release`, mut(tick));
    expect(last()).toBe('Sam gave a project back');
    await call(U1, 'PUT', `${P}/${id}/materials/${uuid()}`, mut({ text: 'Timber', textAt: AT, ...tick }));
    expect(last()).toBe('Sam changed a materials list');
    await call(U1, 'PUT', `${P}/${id}`, mut({ status: 'finished', statusAt: AT + 10, ...tick }));
    expect(last()).toBe('Sam marked a project as finished');
    await call(U1, 'PUT', `${P}/${id}`, mut({ status: 'active', statusAt: AT + 20, ...tick }));
    expect(last()).toBe('Sam reopened a project');
    await call(U1, 'DELETE', `${P}/${id}`, mut(tick));
    expect(last()).toBe('Sam deleted a project');
  });
});

describe('what leaves the app', () => {
  it('never puts a title, step, note or figure in a log line or a push', async () => {
    const { id } = await newProject(SENTINEL);
    const step = await newStep(id, `${SENTINEL}-step`);
    await call(U1, 'PUT', `${P}/${id}/steps/${step.id}`, mut({ note: `${SENTINEL}-note`, noteAt: AT + 5, notify: true, clientAt: AT }));
    await call(U1, 'POST', `${P}/${id}/steps/${step.id}/take`, mut({ notify: true, clientAt: AT }));
    await call(U1, 'PUT', `${P}/${id}`, mut({ notes: `${SENTINEL}-notes`, notesAt: AT + 5, notify: true, clientAt: AT }));
    await call(U1, 'DELETE', `${P}/${id}`, mut({ notify: true, clientAt: AT }));
    expect(JSON.stringify(logged)).not.toContain('SENTINEL');
    expect(JSON.stringify(sent)).not.toContain('SENTINEL');
    expect(sent.length).toBeGreaterThan(0);
  });

  it('sends the other person a fixed push only when the tick was on, and projectAdded for a create', async () => {
    await newProject();
    expect(sent).toHaveLength(0);
    const id = uuid();
    await call(U1, 'PUT', `${P}/${id}`, mut({ title: 'Garden room', titleAt: AT, notify: true, clientAt: AT }));
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toContain(U2);
    expect(sent[0].payload).toMatchObject({ title: 'Sam added a project', body: 'Open Hearthwise, then Plan, then Projects to see it.', url: `/plan/projects/${id}` });
    await call(U1, 'PUT', `${P}/${id}`, mut({ notes: 'x', notesAt: AT + 5, notify: true, clientAt: AT }));
    expect(sent[1].payload.title).toBe('Sam changed a project');
  });

  it('sends nothing for a write that changed nothing', async () => {
    const { id } = await newProject();
    await call(U1, 'POST', `${P}/${id}/take`, mut());
    await call(U2, 'POST', `${P}/${id}/take`, mut({ notify: true, clientAt: AT }));
    expect(sent).toHaveLength(0);
  });
});
