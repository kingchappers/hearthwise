import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectKey, stepKey } from '../keys';
import { putProject } from '../projects';
import { deleteStep, MAX_LIVE_STEPS, putStep } from '../steps';
import { takeRecord } from '../holds';
import type { StepWrite } from '../types';
import { NOW, U1, U2, makeWorld, uuid } from './world';
import type { World } from './world';

let w: World;
let projectId: string;
const AT = NOW - 5000;

beforeEach(async () => {
  w = await makeWorld();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  projectId = uuid();
  await putProject(w.store, w.ctx1, projectId, { write: { title: { value: 'Decking', at: AT } }, mutationId: uuid() }, NOW);
});

const put = (stepId: string, write: StepWrite, who = w.ctx1, now = NOW, mutationId = uuid()) => putStep(w.store, who, projectId, stepId, { write, mutationId }, now);
const create = async (text = 'Lift', position = 'i') => {
  const id = uuid();
  await put(id, { text: { value: text, at: AT }, position: { value: position, at: AT } });
  return id;
};
const stored = (id: string) => w.store.get(stepKey(w.householdId, projectId, id));

describe('putStep', () => {
  it('creates a step, and answers a retry from the write record', async () => {
    const id = uuid();
    const mutationId = uuid();
    const first = await put(id, { text: { value: 'Lift', at: AT }, position: { value: 'i', at: AT } }, w.ctx1, NOW, mutationId);
    expect(first.result).toMatchObject({ outcome: 'created', step: { text: 'Lift', state: 'todo' } });
    const again = await put(id, { text: { value: 'Lift', at: AT }, position: { value: 'i', at: AT } }, w.ctx1, NOW + 9000, mutationId);
    expect(again.fresh).toBe(false);
  });

  it('keeps two edits to different fields, and lists the older edit of one field as stale', async () => {
    const id = await create();
    await put(id, { position: { value: 'k', at: AT + 3000 } }, w.ctx2);
    const text = await put(id, { text: { value: 'Alex', at: AT + 4000 } }, w.ctx2);
    const stale = await put(id, { text: { value: 'Sam', at: AT + 2000 } }, w.ctx1);
    expect(text.result.outcome).toBe('applied');
    expect(stale.result).toMatchObject({ outcome: 'noop', stale: ['text'] });
    expect(await stored(id)).toMatchObject({ text: 'Alex', position: 'k' });
  });

  it('answers 404 under a project that never existed, and gone under a deleted one, without writing', async () => {
    await expect(putStep(w.store, w.ctx1, uuid(), uuid(), { write: { text: { value: 'x', at: AT }, position: { value: 'i', at: AT } }, mutationId: uuid() }, NOW))
      .rejects.toMatchObject({ status: 404 });
    await w.store.patch(projectKey(w.householdId, projectId), { deletedAt: NOW });
    const id = uuid();
    const out = await put(id, { text: { value: 'x', at: AT }, position: { value: 'i', at: AT } });
    expect(out.result.outcome).toBe('gone');
    expect(await stored(id)).toBeUndefined();
  });

  it('answers gone for an edit of a step that is not there or is deleted', async () => {
    expect((await put(uuid(), { note: { value: 'x', at: AT } })).result.outcome).toBe('gone');
    const id = await create();
    await deleteStep(w.store, w.ctx1, projectId, id, { mutationId: uuid() }, NOW);
    expect((await put(id, { text: { value: 'Back', at: AT + 9000 } })).result.outcome).toBe('gone');
  });

  it('refuses a 41st live step but not an edit, and does not count a deleted step', async () => {
    const first = await create('first', 'a');
    for (let i = 1; i < MAX_LIVE_STEPS; i += 1) await create(`s${i}`, `b${String(i).padStart(2, '0')}`);
    await expect(create('over', 'z')).rejects.toMatchObject({ code: 'step_limit', status: 409 });
    expect((await put(first, { note: { value: 'ok', at: AT } })).result.outcome).toBe('applied');
    await deleteStep(w.store, w.ctx1, projectId, first, { mutationId: uuid() }, NOW);
    await expect(create('fits now', 'z')).resolves.toBeTruthy();
  });

  it('done clears the holder, and a take that lands before the write is not wiped silently', async () => {
    const id = await create();
    await takeRecord(w.store, w.ctx2, { kind: 'step', projectId, id }, { mutationId: uuid() }, NOW);
    await put(id, { state: { value: 'done', at: AT + 1000 } });
    expect(await stored(id)).toMatchObject({ state: 'done', doneBy: U1 });
    expect((await stored(id))!.takenBy).toBeUndefined();
  });

  it('when a take lands between the read and a Done, the Done re-reads and still ends done with no holder', async () => {
    const id = await create();
    const real = w.store.get.bind(w.store);
    let fired = false;
    vi.spyOn(w.store, 'get').mockImplementation(async (key, opts) => {
      const item = await real(key, opts);
      if (!fired && key.SK === `PSTEP#${projectId}#${id}`) {
        fired = true;
        await takeRecord(w.store, w.ctx2, { kind: 'step', projectId, id }, { mutationId: uuid() }, NOW);
      }
      return item;
    });
    const out = await put(id, { state: { value: 'done', at: AT + 1000 } });
    expect(out.result.outcome).toBe('applied');
    expect(await stored(id)).toMatchObject({ state: 'done' });
    expect((await stored(id))!.takenBy).toBeUndefined();
  });

  it('does not touch a hold when other fields are edited', async () => {
    const id = await create();
    await takeRecord(w.store, w.ctx2, { kind: 'step', projectId, id }, { mutationId: uuid() }, NOW);
    await put(id, { text: { value: 'New', at: AT + 1000 } });
    expect(await stored(id)).toMatchObject({ takenBy: U2, text: 'New' });
  });
});

describe('deleteStep', () => {
  it('tombstones a step, is a noop twice, and says gone for a missing one', async () => {
    const id = await create();
    const first = await deleteStep(w.store, w.ctx1, projectId, id, { mutationId: uuid() }, NOW);
    expect(first.result.outcome).toBe('applied');
    expect(await stored(id)).toMatchObject({ deletedAt: NOW, deletedBy: U1, expiresAt: Math.floor(NOW / 1000) + 30 * 86400 });
    expect((await deleteStep(w.store, w.ctx1, projectId, id, { mutationId: uuid() }, NOW)).result.outcome).toBe('noop');
    expect((await deleteStep(w.store, w.ctx1, projectId, uuid(), { mutationId: uuid() }, NOW)).result.outcome).toBe('gone');
  });
});
