import { beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseRecord, takeRecord } from '../holds';
import type { HoldTarget } from '../holds';
import { projectKey, stepKey } from '../keys';
import { putProject } from '../projects';
import { putStep } from '../steps';
import { NOW, U1, U2, makeWorld, uuid } from './world';
import type { World } from './world';

let w: World;
let projectId: string;
let stepId: string;
let step: HoldTarget;
let project: HoldTarget;
const AT = NOW - 5000;

beforeEach(async () => {
  w = await makeWorld();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  projectId = uuid();
  stepId = uuid();
  await putProject(w.store, w.ctx1, projectId, { write: { title: { value: 'Decking', at: AT } }, mutationId: uuid() }, NOW);
  await putStep(w.store, w.ctx1, projectId, stepId, { write: { text: { value: 'Lift', at: AT }, position: { value: 'i', at: AT } }, mutationId: uuid() }, NOW);
  step = { kind: 'step', projectId, id: stepId };
  project = { kind: 'project', id: projectId };
});

const take = (who: World['ctx1'], target = step, now = NOW) => takeRecord(w.store, who, target, { mutationId: uuid() }, now);
const release = (who: World['ctx1'], target = step) => releaseRecord(w.store, who, target, { mutationId: uuid() }, NOW);
const stored = (target: HoldTarget) => w.store.get(target.kind === 'step' ? stepKey(w.householdId, projectId, stepId) : projectKey(w.householdId, projectId));

// Runs `change` just after the next read of the step, so it lands between a route's read and its write.
function afterNextRead(change: () => Promise<unknown>): void {
  const real = w.store.get.bind(w.store);
  let fired = false;
  vi.spyOn(w.store, 'get').mockImplementation(async (key, opts) => {
    const item = await real(key, opts);
    if (!fired && key.SK === `PSTEP#${projectId}#${stepId}`) { fired = true; await change(); }
    return item;
  });
}

describe('take', () => {
  it('gives a free step to the caller', async () => {
    const out = await take(w.ctx1);
    expect(out.result.outcome).toBe('taken');
    expect(await stored(step)).toMatchObject({ takenBy: U1, takenAt: NOW });
  });

  it('does not move the step, change its position or its state', async () => {
    const before = await stored(step);
    await take(w.ctx1);
    expect(await stored(step)).toMatchObject({ position: before!.position, state: 'todo', updatedAt: before!.updatedAt });
  });

  it('tells the same person already_yours and changes nothing', async () => {
    await take(w.ctx1);
    expect((await take(w.ctx1, step, NOW + 9000)).result.outcome).toBe('already_yours');
    expect(await stored(step)).toMatchObject({ takenAt: NOW });
  });

  it('tells the second person held_by_other, with the record showing the holder', async () => {
    await take(w.ctx1);
    const out = await take(w.ctx2);
    expect(out.result.outcome).toBe('held_by_other');
    expect(out.result.step?.takenBy).toBe(U1);
  });

  it('gives two takes made together to one person only', async () => {
    const results = await Promise.all([take(w.ctx1), take(w.ctx2)]);
    expect(results.map(r => r.result.outcome).sort()).toEqual(['held_by_other', 'taken']);
    const holder = (await stored(step))!.takenBy;
    expect([U1, U2]).toContain(holder);
  });

  it('answers done for a done step', async () => {
    await putStep(w.store, w.ctx1, projectId, stepId, { write: { state: { value: 'done', at: AT + 1000 } }, mutationId: uuid() }, NOW);
    expect((await take(w.ctx2)).result.outcome).toBe('done');
    expect((await stored(step))!.takenBy).toBeUndefined();
  });

  it('answers gone for a deleted step, a missing step and a step under a deleted project, all with a 200', async () => {
    await w.store.patch(stepKey(w.householdId, projectId, stepId), { deletedAt: NOW });
    expect((await take(w.ctx1)).result.outcome).toBe('gone');
    expect((await take(w.ctx1, { kind: 'step', projectId, id: uuid() })).result.outcome).toBe('gone');
    await w.store.patch(projectKey(w.householdId, projectId), { deletedAt: NOW });
    expect((await take(w.ctx1)).result.outcome).toBe('gone');
    expect((await take(w.ctx1, project)).result.outcome).toBe('gone');
  });

  it('answers 404 for a project that never existed', async () => {
    await expect(take(w.ctx1, { kind: 'project', id: uuid() })).rejects.toMatchObject({ status: 404 });
    await expect(take(w.ctx1, { kind: 'step', projectId: uuid(), id: uuid() })).rejects.toMatchObject({ status: 404 });
  });

  it('replaces the hold of someone who has left, and does not block anyone', async () => {
    await w.store.patch(stepKey(w.householdId, projectId, stepId), { takenBy: 'auth0|gone', takenAt: 5 });
    expect((await take(w.ctx2)).result.outcome).toBe('taken');
    expect(await stored(step)).toMatchObject({ takenBy: U2 });
  });

  it('answers a retry of a refused take the same, even after a release', async () => {
    await take(w.ctx1);
    const mutationId = uuid();
    const first = await takeRecord(w.store, w.ctx2, step, { mutationId }, NOW);
    await release(w.ctx1);
    const again = await takeRecord(w.store, w.ctx2, step, { mutationId }, NOW + 1000);
    expect(first.result.outcome).toBe('held_by_other');
    expect(again).toMatchObject({ fresh: false, result: { outcome: 'held_by_other' } });
    expect((await stored(step))!.takenBy).toBeUndefined();
  });

  it('takes a whole project separately from its steps', async () => {
    await take(w.ctx1, project);
    expect(await stored(project)).toMatchObject({ takenBy: U1 });
    expect((await stored(step))!.takenBy).toBeUndefined();
    expect((await take(w.ctx2, project)).result.outcome).toBe('held_by_other');
  });

  it('loses to a delete that lands between the read and the write', async () => {
    afterNextRead(() => w.store.patch(stepKey(w.householdId, projectId, stepId), { deletedAt: NOW }));
    expect((await take(w.ctx1)).result.outcome).toBe('gone');
    expect((await stored(step))!.takenBy).toBeUndefined();
  });

  it('loses to a done that lands between the read and the write', async () => {
    afterNextRead(() => putStep(w.store, w.ctx2, projectId, stepId, { write: { state: { value: 'done', at: AT + 1000 } }, mutationId: uuid() }, NOW));
    expect((await take(w.ctx1)).result.outcome).toBe('done');
    expect((await stored(step))!.takenBy).toBeUndefined();
  });
});

describe('release', () => {
  it('frees a held step for either person, and says nothing was held when it was not', async () => {
    await take(w.ctx1);
    expect((await release(w.ctx2)).result.outcome).toBe('released');
    expect((await stored(step))!.takenBy).toBeUndefined();
    expect((await release(w.ctx2)).result.outcome).toBe('not_held');
  });

  it('frees a hold left by someone who has gone', async () => {
    await w.store.patch(stepKey(w.householdId, projectId, stepId), { takenBy: 'auth0|gone', takenAt: 5 });
    expect((await release(w.ctx1)).result.outcome).toBe('released');
  });

  it('answers gone for a deleted record, and 404 for a project that never existed', async () => {
    await w.store.patch(stepKey(w.householdId, projectId, stepId), { deletedAt: NOW });
    expect((await release(w.ctx1)).result.outcome).toBe('gone');
    await expect(release(w.ctx1, { kind: 'project', id: uuid() })).rejects.toMatchObject({ status: 404 });
  });
});

describe('a reason left when taking a step', () => {
  const takeBecause = (who: World['ctx1'], because: string, target = step) => takeRecord(w.store, who, target, { mutationId: uuid(), because }, NOW);

  it('is kept with the hold and comes back on the step', async () => {
    const out = await takeBecause(w.ctx1, 'I have the drill');
    expect(out.result.outcome).toBe('taken');
    expect(out.result.step?.takenNote).toBe('I have the drill');
    expect((await stored(step))?.takenNote).toBe('I have the drill');
  });

  it('goes when the step is given back, and a plain take after leaves none', async () => {
    await takeBecause(w.ctx1, 'I have the drill');
    await release(w.ctx1);
    expect('takenNote' in (await stored(step))!).toBe(false);
    await take(w.ctx2);
    expect('takenNote' in (await stored(step))!).toBe(false);
  });

  it('does not replace the hold or the reason of the person who got there first', async () => {
    await takeBecause(w.ctx1, 'Mine');
    const second = await takeBecause(w.ctx2, 'No, mine');
    expect(second.result.outcome).toBe('held_by_other');
    expect((await stored(step))?.takenNote).toBe('Mine');
  });

  it('is never logged', async () => {
    const log = vi.spyOn(console, 'log');
    await takeBecause(w.ctx1, 'Private reason words');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Private reason words');
  });

  it('is not stored on a project, which has no reasons', async () => {
    await takeBecause(w.ctx1, 'Whole thing', project);
    expect('takenNote' in (await stored(project))!).toBe(false);
  });
});
