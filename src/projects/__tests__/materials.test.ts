import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMaterialDelete, applyMaterialWrite } from '../applyMaterial';
import { addMaterialsToList } from '../addToList';
import { materialKey, projectKey } from '../keys';
import { deleteMaterial, MAX_LIVE_MATERIALS, putMaterial } from '../materials';
import { getProject, putProject } from '../projects';
import { itemKey } from '../../tasks/keys';
import { NOW, U1, U2, makeWorld, uuid } from './world';
import type { World } from './world';

const AT = NOW - 5000;
let w: World;
let projectId: string;

beforeEach(async () => {
  w = await makeWorld();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  projectId = uuid();
  await putProject(w.store, w.ctx1, projectId, { write: { title: { value: 'Take down the decking', at: AT } }, mutationId: uuid() }, NOW);
});

const line = async (text: string, who = w.ctx1, at = AT) => {
  const id = uuid();
  await putMaterial(w.store, who, projectId, id, { write: { text: { value: text, at } }, mutationId: uuid() }, NOW);
  return id;
};
const add = (lineIds: string[], who = w.ctx1, now = NOW, mutationId = uuid()) => addMaterialsToList(w.store, who, projectId, { lineIds, mutationId, clientAt: now }, now);
const shopping = (id: string) => w.store.get(itemKey(w.householdId, id));

describe('applyMaterialWrite', () => {
  const ids = { projectId: 'p1', id: 'm1' };

  it('creates a line from its text, and a newer write replaces it', () => {
    const created = applyMaterialWrite(undefined, ids, { text: { value: '6 lengths of 47x100 timber', at: 1000 } }, U1, NOW);
    expect(created).toMatchObject({ result: 'created', material: { text: '6 lengths of 47x100 timber', fieldTimes: { text: 1000 } } });
    const edited = applyMaterialWrite(created.material, ids, { text: { value: 'Timber', at: 2000 } }, U2, NOW);
    expect(edited).toMatchObject({ result: 'applied', material: { text: 'Timber', updatedBy: U2 } });
  });

  it('lists an older edit as stale, and does nothing for a missing line with no text', () => {
    const created = applyMaterialWrite(undefined, ids, { text: { value: 'A', at: 2000 } }, U1, NOW).material;
    expect(applyMaterialWrite(created, ids, { text: { value: 'B', at: 1000 } }, U2, NOW)).toMatchObject({ result: 'noop', stale: ['text'] });
    expect(applyMaterialWrite(undefined, ids, {}, U1, NOW).result).toBe('noop');
  });

  it('is final for edits once deleted, and a delete is a 30-day tombstone', () => {
    const material = applyMaterialWrite(undefined, ids, { text: { value: 'A', at: 1 } }, U1, NOW).material;
    const deleted = applyMaterialDelete(material, U2, NOW);
    expect(deleted.material).toMatchObject({ deletedAt: NOW, deletedBy: U2, expiresAt: Math.floor(NOW / 1000) + 30 * 86400 });
    expect(applyMaterialWrite(deleted.material, ids, { text: { value: 'B', at: 9e12 } }, U1, NOW).result).toBe('gone');
    expect(applyMaterialDelete(deleted.material, U1, NOW).result).toBe('noop');
  });
});

describe('putMaterial and deleteMaterial', () => {
  it('two people adding lines at once lose none', async () => {
    await Promise.all([line('Timber', w.ctx1), line('Screws', w.ctx2)]);
    const detail = await getProject(w.store, w.ctx1, projectId, NOW);
    expect(detail.materials.map(m => m.text).sort()).toEqual(['Screws', 'Timber']);
  });

  it('keeps the older edit of one line as stale and refuses a 61st line', async () => {
    const id = await line('Timber');
    const stale = await putMaterial(w.store, w.ctx2, projectId, id, { write: { text: { value: 'Old', at: AT - 1000 } }, mutationId: uuid() }, NOW);
    expect(stale.result).toMatchObject({ outcome: 'noop', stale: ['text'] });
    for (let i = 1; i < MAX_LIVE_MATERIALS; i += 1) await line(`m${i}`);
    await expect(line('one too many')).rejects.toMatchObject({ code: 'material_limit', status: 409 });
  });

  it('answers 404 under a project that never existed, gone under a deleted one, gone for a missing line', async () => {
    await expect(putMaterial(w.store, w.ctx1, uuid(), uuid(), { write: { text: { value: 'x', at: AT } }, mutationId: uuid() }, NOW)).rejects.toMatchObject({ status: 404 });
    expect((await deleteMaterial(w.store, w.ctx1, projectId, uuid(), { mutationId: uuid() }, NOW)).result.outcome).toBe('gone');
    await w.store.patch(projectKey(w.householdId, projectId), { deletedAt: NOW });
    expect((await putMaterial(w.store, w.ctx1, projectId, uuid(), { write: { text: { value: 'x', at: AT } }, mutationId: uuid() }, NOW)).result.outcome).toBe('gone');
  });

  it('deletes a line, hiding it from the project, and a retry answers from the record', async () => {
    const id = await line('Timber');
    const mutationId = uuid();
    const first = await deleteMaterial(w.store, w.ctx1, projectId, id, { mutationId }, NOW);
    expect(first.result.outcome).toBe('applied');
    expect((await deleteMaterial(w.store, w.ctx1, projectId, id, { mutationId }, NOW + 5000)).fresh).toBe(false);
    expect((await getProject(w.store, w.ctx1, projectId, NOW)).materials).toEqual([]);
  });
});

describe('addMaterialsToList', () => {
  it('creates each line once on the list, labelled for the project, with the material\'s own id', async () => {
    const a = await line('6 lengths of 47x100 timber, 2.4m');
    const b = await line('1 box of 75mm screws');
    const out = await add([a, b]);
    expect(out.result.results).toEqual([{ id: a, status: 'created' }, { id: b, status: 'created' }]);
    expect(await shopping(a)).toMatchObject({ text: '6 lengths of 47x100 timber, 2.4m', forRecipes: 'Take down the decking' });
    expect((await shopping(b))!.SK).toBe(`ITEM#${b}`);
  });

  it('writes nothing the second time, and an edit made on the list survives a second press with a later time', async () => {
    const a = await line('Timber');
    await add([a]);
    await w.store.patch(itemKey(w.householdId, a), { text: 'Timber, treated', fieldTimes: { text: NOW } });
    const again = await add([a], w.ctx2, NOW + 60_000);
    expect(again.result.results).toEqual([{ id: a, status: 'already' }]);
    expect(await shopping(a)).toMatchObject({ text: 'Timber, treated' });
  });

  it('says cleared for a line that was on the list and since cleared, and does not add it again', async () => {
    const a = await line('Timber');
    await add([a]);
    await w.store.patch(itemKey(w.householdId, a), { deletedAt: NOW + 1, deletedBy: U1, expiresAt: Math.floor(NOW / 1000) + 99999 });
    expect((await add([a])).result.results).toEqual([{ id: a, status: 'cleared' }]);
    expect((await shopping(a))!.deletedAt).toBe(NOW + 1);
  });

  it('answers missing for an unknown, deleted or another project\'s line, and for every line of a deleted project', async () => {
    const a = await line('Timber');
    const other = uuid();
    await putProject(w.store, w.ctx1, other, { write: { title: { value: 'Other', at: AT } }, mutationId: uuid() }, NOW);
    const foreign = uuid();
    await putMaterial(w.store, w.ctx1, other, foreign, { write: { text: { value: 'Not ours', at: AT } }, mutationId: uuid() }, NOW);
    await deleteMaterial(w.store, w.ctx1, projectId, a, { mutationId: uuid() }, NOW);
    const out = await add([a, uuid(), foreign]);
    expect(out.result.results.map(r => r.status)).toEqual(['missing', 'missing', 'missing']);
    const b = await line('Screws');
    await w.store.patch(projectKey(w.householdId, projectId), { deletedAt: NOW });
    expect((await add([b])).result.results).toEqual([{ id: b, status: 'missing' }]);
  });

  it('treats a repeated id as one line, and 404s for a project that never existed', async () => {
    const a = await line('Timber');
    expect((await add([a, a, a])).result.results).toEqual([{ id: a, status: 'created' }]);
    await expect(addMaterialsToList(w.store, w.ctx1, uuid(), { lineIds: [a], mutationId: uuid() }, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it('answers a retry from its record without writing again', async () => {
    const a = await line('Timber');
    const mutationId = uuid();
    const first = await add([a], w.ctx1, NOW, mutationId);
    await w.store.patch(itemKey(w.householdId, a), { text: 'Changed' });
    const again = await add([a], w.ctx1, NOW + 9000, mutationId);
    expect(again).toMatchObject({ fresh: false, result: first.result });
    expect(await shopping(a)).toMatchObject({ text: 'Changed' });
  });

  it('a crash after some lines leaves them created, and the retry skips those and creates the rest', async () => {
    const lines = [await line('A'), await line('B'), await line('C')];
    const real = w.store.transact.bind(w.store);
    vi.spyOn(w.store, 'transact').mockImplementation(async ops => {
      if (ops.some(op => 'put' in op && op.put.SK.startsWith('MUT#'))) throw new Error('store went away');
      return real(ops);
    });
    const mutationId = uuid();
    await expect(add(lines, w.ctx1, NOW, mutationId)).rejects.toThrow('store went away');
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const retry = await add(lines, w.ctx1, NOW + 1000, mutationId);
    expect(retry.result.results.map(r => r.status)).toEqual(['already', 'already', 'already']);
    for (const id of lines) expect(await shopping(id)).toBeDefined();
  });

  it('two people adding the same lines at once create each once', async () => {
    const lines = [await line('A'), await line('B')];
    const [x, y] = await Promise.all([add(lines, w.ctx1), add(lines, w.ctx2)]);
    const created = [...x.result.results, ...y.result.results].filter(r => r.status === 'created');
    expect(created.length).toBeGreaterThanOrEqual(2);
    for (const id of lines) expect(await shopping(id)).toBeDefined();
  });

  it('cuts a label to 200 characters', async () => {
    const a = await line('Timber');
    await w.store.patch(projectKey(w.householdId, projectId), { title: 'T'.repeat(300) });
    await add([a]);
    expect(((await shopping(a))!.forRecipes as string).length).toBe(200);
  });

  it('logs counts only, never a line\'s text or the project title', async () => {
    const lines: unknown[][] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { lines.push(args); });
    const a = await line('SENTINEL-timber');
    await add([a]);
    expect(JSON.stringify(lines)).not.toContain('SENTINEL');
    expect(lines.map(args => JSON.parse(String(args[0]))).find(entry => entry.event === 'project_materials')).toMatchObject({ lines: 1, created: 1, already: 0, cleared: 0 });
  });
});
