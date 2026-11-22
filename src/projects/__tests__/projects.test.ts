import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProject, getProjectsList, putProject, MAX_LIVE_PROJECTS } from '../projects';
import { putStep } from '../steps';
import { materialKey, projectKey } from '../keys';
import { NOW, makeWorld, uuid } from './world';
import type { World } from './world';
import { TaskError } from '../../tasks/types';

let w: World;
beforeEach(async () => { w = await makeWorld(); vi.spyOn(console, 'log').mockImplementation(() => undefined); });

const AT = NOW - 5000;
const newProject = async (title = 'Decking', who = w.ctx1) => {
  const id = uuid();
  const { result } = await putProject(w.store, who, id, { write: { title: { value: title, at: AT } }, mutationId: uuid() }, NOW);
  return { id, project: result.project! };
};
const newStep = async (projectId: string, text: string, position: string, who = w.ctx1) => {
  const id = uuid();
  await putStep(w.store, who, projectId, id, { write: { text: { value: text, at: AT }, position: { value: position, at: AT } }, mutationId: uuid() }, NOW);
  return id;
};

describe('putProject', () => {
  it('creates a project with only a title', async () => {
    const { project } = await newProject();
    expect(project).toMatchObject({ title: 'Decking', status: 'active', createdBy: 'auth0|u1' });
  });

  it('answers a retry from the write record and writes nothing more', async () => {
    const id = uuid();
    const mutationId = uuid();
    const first = await putProject(w.store, w.ctx1, id, { write: { title: { value: 'A', at: AT } }, mutationId }, NOW);
    const again = await putProject(w.store, w.ctx1, id, { write: { title: { value: 'A', at: AT } }, mutationId }, NOW + 5000);
    expect(first.fresh).toBe(true);
    expect(again).toMatchObject({ fresh: false, result: first.result });
  });

  it('applies a newer edit and reports an older one as stale', async () => {
    const { id } = await newProject();
    const newer = await putProject(w.store, w.ctx2, id, { write: { title: { value: 'Garden room', at: AT + 2000 } }, mutationId: uuid() }, NOW);
    expect(newer.result).toMatchObject({ outcome: 'applied', stale: [] });
    const older = await putProject(w.store, w.ctx1, id, { write: { title: { value: 'Shed', at: AT + 1000 } }, mutationId: uuid() }, NOW);
    expect(older.result).toMatchObject({ outcome: 'noop', stale: ['title'] });
    expect(older.result.project?.title).toBe('Garden room');
  });

  it('answers 404 for an edit of a project that never existed', async () => {
    await expect(putProject(w.store, w.ctx1, uuid(), { write: { notes: { value: 'x', at: AT } }, mutationId: uuid() }, NOW))
      .rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('answers gone, with a 200, for a write to a deleted project', async () => {
    const { id } = await newProject();
    await w.store.patch(projectKey(w.householdId, id), { deletedAt: NOW, deletedBy: 'auth0|u1' });
    const out = await putProject(w.store, w.ctx1, id, { write: { title: { value: 'Back', at: AT + 9000 } }, mutationId: uuid() }, NOW);
    expect(out.result.outcome).toBe('gone');
  });

  it('refuses a new project over the limit and still lets an edit through', async () => {
    const { id } = await newProject('First');
    for (let i = 1; i < MAX_LIVE_PROJECTS; i += 1) await w.store.put({ ...projectKey(w.householdId, uuid()), title: 'p', status: 'active', fieldTimes: {}, updatedAt: 1 });
    await expect(newProject('One too many')).rejects.toBeInstanceOf(TaskError);
    await expect(newProject('One too many')).rejects.toMatchObject({ code: 'project_limit', status: 409 });
    const edit = await putProject(w.store, w.ctx1, id, { write: { notes: { value: 'ok', at: AT } }, mutationId: uuid() }, NOW);
    expect(edit.result.outcome).toBe('applied');
  });
});

describe('getProjectsList', () => {
  it('lists active projects with derived step counts, and none when counts are off', async () => {
    const { id } = await newProject();
    const a = await newStep(id, 'Clear', 'i');
    await newStep(id, 'Lift', 'j');
    await w.store.patch({ PK: `HH#${w.householdId}`, SK: `PSTEP#${id}#${a}` }, { state: 'done' });
    const list = await getProjectsList(w.store, w.ctx1, { counts: true }, NOW);
    expect(list.projects).toHaveLength(1);
    expect(list.projects[0]).toMatchObject({ id, counts: { steps: 2, done: 1, materials: 0, held: {} } });
    const light = await getProjectsList(w.store, w.ctx1, { counts: false }, NOW);
    expect('counts' in light.projects[0]).toBe(false);
  });

  it('does not count deleted steps, and keeps finished projects in the list', async () => {
    const { id } = await newProject();
    const s = await newStep(id, 'Clear', 'i');
    await w.store.patch({ PK: `HH#${w.householdId}`, SK: `PSTEP#${id}#${s}` }, { deletedAt: NOW });
    const list = await getProjectsList(w.store, w.ctx1, { counts: true }, NOW);
    expect(list.projects[0].counts).toEqual({ steps: 0, done: 0, materials: 0, held: {} });
  });

  it('counts the steps not done that each person holds, and not done ones or ones nobody holds', async () => {
    const { id } = await newProject();
    const a = await newStep(id, 'A', 'i');
    const b = await newStep(id, 'B', 'j');
    const c = await newStep(id, 'C', 'k');
    await newStep(id, 'D', 'l');
    const at = (stepId: string) => ({ PK: `HH#${w.householdId}`, SK: `PSTEP#${id}#${stepId}` });
    await w.store.patch(at(a), { takenBy: 'auth0|u2', takenAt: 1 });
    await w.store.patch(at(b), { takenBy: 'auth0|u2', takenAt: 1 });
    await w.store.patch(at(c), { takenBy: 'auth0|u2', takenAt: 1, state: 'done' });
    const counts = (await getProjectsList(w.store, w.ctx1, { counts: true }, NOW)).projects[0].counts;
    expect(counts).toMatchObject({ steps: 4, done: 1, held: { 'auth0|u2': 2 } });
  });

  it('counts live materials too, and not deleted ones', async () => {
    const { id } = await newProject();
    await w.store.put({ ...materialKey(w.householdId, id, 'm1'), text: 'Timber', fieldTimes: {}, updatedAt: 1 });
    await w.store.put({ ...materialKey(w.householdId, id, 'm2'), text: 'Gone', fieldTimes: {}, updatedAt: 1, deletedAt: 5 });
    expect((await getProjectsList(w.store, w.ctx1, { counts: true }, NOW)).projects[0].counts).toMatchObject({ materials: 1 });
  });

  it('lists the 50 newest deleted projects from the last 30 days', async () => {
    const { id } = await newProject();
    await w.store.patch(projectKey(w.householdId, id), { deletedAt: NOW - 1000, deletedBy: 'auth0|u2' });
    const old = uuid();
    await w.store.put({ ...projectKey(w.householdId, old), title: 'Old', status: 'active', fieldTimes: {}, updatedAt: 1, deletedAt: NOW - 40 * 86_400_000 });
    const list = await getProjectsList(w.store, w.ctx1, { counts: true }, NOW);
    expect(list.projects).toHaveLength(0);
    expect(list.deleted.map(p => p.id)).toEqual([id]);
  });

  it('reads no step item when counts are off', async () => {
    await newProject();
    const spy = vi.spyOn(w.store, 'query');
    await getProjectsList(w.store, w.ctx1, { counts: false }, NOW);
    expect(spy.mock.calls.filter(call => call[1]?.skPrefix === 'PSTEP#')).toHaveLength(0);
  });
});

describe('getProject', () => {
  it('returns the project with its live steps in order, ties by id, and no materials yet', async () => {
    const { id } = await newProject();
    const b = await newStep(id, 'Second', 'j');
    const a = await newStep(id, 'First', 'i');
    const detail = await getProject(w.store, w.ctx1, id, NOW);
    expect(detail.project.id).toBe(id);
    expect(detail.steps.map(s => s.id)).toEqual([a, b]);
    expect(detail.materials).toEqual([]);
  });

  it('answers a deleted project with its tombstone and no children', async () => {
    const { id } = await newProject();
    await newStep(id, 'Clear', 'i');
    await w.store.patch(projectKey(w.householdId, id), { deletedAt: NOW });
    const detail = await getProject(w.store, w.ctx1, id, NOW);
    expect(detail.project.deletedAt).toBe(NOW);
    expect(detail.steps).toEqual([]);
  });

  it('answers 404 for a project that never existed', async () => {
    await expect(getProject(w.store, w.ctx1, uuid(), NOW)).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});
