import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProjectTree, restoreProjectTree } from '../children';
import { materialKey, projectKey, stepKey } from '../keys';
import { putProject } from '../projects';
import { putStep } from '../steps';
import { NOW, makeWorld, uuid } from './world';
import type { World } from './world';

let w: World;
let projectId: string;
const AT = NOW - 5000;
const THIRTY = 30 * 86400;

beforeEach(async () => {
  w = await makeWorld();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  projectId = uuid();
  await putProject(w.store, w.ctx1, projectId, { write: { title: { value: 'Decking', at: AT } }, mutationId: uuid() }, NOW);
});

const addStep = async (position: string): Promise<string> => {
  const id = uuid();
  await putStep(w.store, w.ctx1, projectId, id, { write: { text: { value: 's', at: AT }, position: { value: position, at: AT } }, mutationId: uuid() }, NOW);
  return id;
};
// Children bypass the 40-step limit, for the batch tests.
const rawChild = async (key: ReturnType<typeof stepKey>, extra: Record<string, unknown> = {}) => w.store.put({ ...key, text: 'x', state: 'todo', position: 'a', fieldTimes: {}, updatedAt: 1, ...extra });
const del = (id = projectId, now = NOW) => deleteProjectTree(w.store, w.ctx1, id, { mutationId: uuid() }, now);
const get = (key: ReturnType<typeof stepKey>) => w.store.get(key);

describe('deleteProjectTree', () => {
  it('tombstones the project and gives every live child the same expiry', async () => {
    const step = await addStep('i');
    await rawChild(materialKey(w.householdId, projectId, uuid()));
    const out = await del();
    expect(out.result.outcome).toBe('applied');
    const expiresAt = Math.floor(NOW / 1000) + THIRTY;
    expect(await get(projectKey(w.householdId, projectId))).toMatchObject({ deletedAt: NOW, deletedBy: 'auth0|u1', expiresAt });
    expect(await get(stepKey(w.householdId, projectId, step))).toMatchObject({ expiresAt });
    const children = await w.store.query(`HH#${w.householdId}`, { skPrefix: 'PMAT#' });
    expect(children.every(c => c.expiresAt === expiresAt)).toBe(true);
  });

  it('leaves a child that has its own deletedAt alone', async () => {
    const step = await addStep('i');
    await w.store.patch(stepKey(w.householdId, projectId, step), { deletedAt: 5, expiresAt: 99 });
    await del();
    expect(await get(stepKey(w.householdId, projectId, step))).toMatchObject({ deletedAt: 5, expiresAt: 99 });
  });

  it('does not touch another project that shares the first characters of its id', async () => {
    const other = projectId + '0';
    await w.store.put({ ...projectKey(w.householdId, other), title: 'Other', status: 'active', fieldTimes: {}, updatedAt: 1 });
    await rawChild(stepKey(w.householdId, other, 'x1'));
    await del();
    expect((await get(stepKey(w.householdId, other, 'x1')))!.expiresAt).toBeUndefined();
  });

  it('handles a project of 100 children in batches of 25', async () => {
    for (let i = 0; i < 100; i += 1) await rawChild(stepKey(w.householdId, projectId, `c${i}`));
    const spy = vi.spyOn(w.store, 'transact');
    await del();
    const sizes = spy.mock.calls.map(call => call[0].length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(26);
    const steps = await w.store.query(`HH#${w.householdId}`, { skPrefix: `PSTEP#${projectId}#` });
    expect(steps.every(s => s.expiresAt !== undefined)).toBe(true);
  });

  it('finishes a half-done delete when it is asked again, and the retry answers from its record', async () => {
    for (let i = 0; i < 60; i += 1) await rawChild(stepKey(w.householdId, projectId, `c${i}`));
    const real = w.store.transact.bind(w.store);
    let calls = 0;
    vi.spyOn(w.store, 'transact').mockImplementation(async ops => {
      calls += 1;
      // The tombstone is call 1, the first batch call 2; the second batch fails.
      if (calls === 3) throw new Error('store went away');
      return real(ops);
    });
    await expect(del()).rejects.toThrow('store went away');
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const mutationId = uuid();
    const again = await deleteProjectTree(w.store, w.ctx2, projectId, { mutationId }, NOW + 1000);
    expect(again.result.outcome).toBe('noop');
    const steps = await w.store.query(`HH#${w.householdId}`, { skPrefix: `PSTEP#${projectId}#` });
    expect(steps.every(s => s.expiresAt === Math.floor(NOW / 1000) + THIRTY)).toBe(true);
    const replay = await deleteProjectTree(w.store, w.ctx2, projectId, { mutationId }, NOW + 9000);
    expect(replay.fresh).toBe(false);
  });

  it('answers 404 for a project that never existed', async () => {
    await expect(del(uuid())).rejects.toMatchObject({ status: 404 });
  });
});

describe('restoreProjectTree', () => {
  it('removes the children\'s expiry and then the tombstone, only for the deletion it saw', async () => {
    const step = await addStep('i');
    await del();
    expect(await restoreProjectTree(w.store, w.ctx2, projectId, NOW + 1, NOW)).toBe('noop');
    expect(await restoreProjectTree(w.store, w.ctx2, projectId, NOW, NOW + 5000)).toBe('restored');
    expect((await get(stepKey(w.householdId, projectId, step)))!.expiresAt).toBeUndefined();
    const project = await get(projectKey(w.householdId, projectId));
    expect(project!.deletedAt).toBeUndefined();
    expect(project!.expiresAt).toBeUndefined();
    expect(await restoreProjectTree(w.store, w.ctx2, projectId, NOW, NOW + 6000)).toBe('noop');
  });

  it('leaves the project deleted when a batch fails, so the person can try again', async () => {
    for (let i = 0; i < 60; i += 1) await rawChild(stepKey(w.householdId, projectId, `c${i}`));
    await del();
    const real = w.store.transact.bind(w.store);
    let calls = 0;
    vi.spyOn(w.store, 'transact').mockImplementation(async ops => {
      calls += 1;
      if (calls === 2) throw new Error('store went away');
      return real(ops);
    });
    await expect(restoreProjectTree(w.store, w.ctx1, projectId, NOW, NOW + 5000)).rejects.toThrow();
    expect((await get(projectKey(w.householdId, projectId)))!.deletedAt).toBe(NOW);
    vi.restoreAllMocks();
    expect(await restoreProjectTree(w.store, w.ctx1, projectId, NOW, NOW + 6000)).toBe('restored');
  });

  it('leaves a child with its own deletedAt alone, and brings a step written after the delete back live', async () => {
    const gone = await addStep('i');
    await w.store.patch(stepKey(w.householdId, projectId, gone), { deletedAt: 5, expiresAt: 99 });
    await del();
    await rawChild(stepKey(w.householdId, projectId, 'late'));
    await restoreProjectTree(w.store, w.ctx1, projectId, NOW, NOW + 5000);
    expect(await get(stepKey(w.householdId, projectId, gone))).toMatchObject({ deletedAt: 5, expiresAt: 99 });
    expect((await get(stepKey(w.householdId, projectId, 'late')))!.expiresAt).toBeUndefined();
  });

  it('answers not_found for a project that is not there, and noop for one that is live', async () => {
    expect(await restoreProjectTree(w.store, w.ctx1, uuid(), 1, NOW)).toBe('not_found');
    expect(await restoreProjectTree(w.store, w.ctx1, projectId, 1, NOW)).toBe('noop');
  });
});
