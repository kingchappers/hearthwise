import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseRecord, takeRecord } from '../holds';
import { deleteProjectTree } from '../children';
import { putProject } from '../projects';
import { deleteStep, putStep } from '../steps';
import { NOW, makeWorld, uuid } from './world';
import type { World } from './world';

const SENTINEL = 'SENTINEL-garden-room-5527';
let w: World;
let lines: unknown[][];

beforeEach(async () => {
  w = await makeWorld();
  lines = [];
  for (const channel of ['log', 'warn', 'error', 'info'] as const) vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => { lines.push(args); });
});
afterEach(() => vi.restoreAllMocks());

describe('project logs', () => {
  it('hold ids, kinds and outcomes only, whatever the title, step or note says', async () => {
    const AT = NOW - 1000;
    const projectId = uuid();
    const stepId = uuid();
    await putProject(w.store, w.ctx1, projectId, { write: { title: { value: SENTINEL, at: AT }, notes: { value: `${SENTINEL}-n`, at: AT } }, mutationId: uuid() }, NOW);
    await putStep(w.store, w.ctx1, projectId, stepId, { write: { text: { value: SENTINEL, at: AT }, position: { value: 'i', at: AT }, note: { value: SENTINEL, at: AT } }, mutationId: uuid() }, NOW);
    const target = { kind: 'step' as const, projectId, id: stepId };
    await takeRecord(w.store, w.ctx1, target, { mutationId: uuid() }, NOW);
    await takeRecord(w.store, w.ctx2, target, { mutationId: uuid() }, NOW);
    await releaseRecord(w.store, w.ctx2, target, { mutationId: uuid() }, NOW);
    await deleteStep(w.store, w.ctx1, projectId, stepId, { mutationId: uuid() }, NOW);
    await deleteProjectTree(w.store, w.ctx1, projectId, { mutationId: uuid() }, NOW);

    expect(JSON.stringify(lines)).not.toContain('SENTINEL');
    const events = lines.map(args => JSON.parse(String(args[0])));
    expect(events.map(e => e.event).filter((v, i, a) => a.indexOf(v) === i).sort()).toEqual(['project_take', 'project_write']);
    expect(events.filter(e => e.event === 'project_take').map(e => e.outcome)).toEqual(['taken', 'held_by_other', 'released']);
    for (const entry of events) expect(Object.keys(entry).sort()).toEqual(expect.arrayContaining(['event', 'householdId']));
  });

  it('writes one line for a fresh write and none for a replay', async () => {
    const id = uuid();
    const mutationId = uuid();
    await putProject(w.store, w.ctx1, id, { write: { title: { value: 'A', at: NOW - 1000 } }, mutationId }, NOW);
    await putProject(w.store, w.ctx1, id, { write: { title: { value: 'A', at: NOW - 1000 } }, mutationId }, NOW);
    expect(lines).toHaveLength(1);
  });
});
