import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../apiError';
import { HOUSEHOLD_KEY } from '../household';
import { describeFailure, projectMutationKeys, registerMutations } from '../mutations';
import { projectNoticesKey } from '../deviceKeys';
import { readNotices } from '../projectNotices';
import { shouldRetry } from '../retryRules';

const AT = 1_800_000_000_000;
const common = { mutationId: '00000000-0000-4000-8000-000000000001', at: AT, by: 'u1' };
let request: ReturnType<typeof vi.fn<(endpoint: string, options?: RequestInit) => Promise<unknown>>>;
let report: ReturnType<typeof vi.fn<(message: string, options?: { ask?: () => void }) => void>>;
let client: QueryClient;

const defaults = (kind: keyof typeof projectMutationKeys) => client.getMutationDefaults(projectMutationKeys[kind]);
const run = (kind: keyof typeof projectMutationKeys, vars: object) => (defaults(kind).mutationFn as (v: unknown) => Promise<unknown>)({ ...common, ...vars });

beforeEach(() => {
  window.localStorage.clear();
  request = vi.fn(async (): Promise<unknown> => ({}));
  report = vi.fn();
  client = new QueryClient();
  client.setQueryData(HOUSEHOLD_KEY, { household: {}, me: { userId: 'u1' }, members: [{ userId: 'u1', displayName: 'Sam' }, { userId: 'u2', displayName: 'Alex' }] });
  registerMutations(client, request, () => ({ tasks: [], proposals: [], serverTime: 0 }), report);
});

describe('the project runners', () => {
  it('sends a project edit with each changed field and its time, and null to clear', async () => {
    await run('putProject', { projectId: 'p1', changes: { title: 'New', notes: null } });
    expect(request).toHaveBeenCalledWith('/api/hh/projects/p1', { method: 'PUT', body: JSON.stringify({ mutationId: common.mutationId, clientAt: AT, title: 'New', titleAt: AT, notes: null, notesAt: AT }) });
  });

  it('sends the planned day as two days under one time, and a clear as null', async () => {
    await run('putProject', { projectId: 'p1', changes: { planned: { plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' } } });
    expect(JSON.parse(String(request.mock.calls.at(-1)![1]?.body))).toEqual({ mutationId: common.mutationId, clientAt: AT, plannedOn: '2026-12-05', plannedEndOn: '2026-12-06', plannedAt: AT });
    await run('putProject', { projectId: 'p1', changes: { planned: { plannedOn: null } } });
    expect(JSON.parse(String(request.mock.calls.at(-1)![1]?.body))).toEqual({ mutationId: common.mutationId, clientAt: AT, plannedOn: null, plannedAt: AT });
  });

  it('sends each figure with its own time, and a clear as null', async () => {
    await run('putProject', { projectId: 'p1', changes: { estimatePence: 400000, spentPence: null } });
    expect(JSON.parse(String(request.mock.calls.at(-1)![1]?.body))).toEqual({ mutationId: common.mutationId, clientAt: AT, estimatePence: 400000, estimateAt: AT, spentPence: null, spentAt: AT });
  });

  it('sends a step write, a delete and a take or release to the step routes', async () => {
    await run('putStep', { projectId: 'p1', stepId: 's1', changes: { state: 'done' } });
    expect(request).toHaveBeenLastCalledWith('/api/hh/projects/p1/steps/s1', expect.objectContaining({ method: 'PUT' }));
    await run('deleteStep', { projectId: 'p1', stepId: 's1' });
    expect(request).toHaveBeenLastCalledWith('/api/hh/projects/p1/steps/s1', expect.objectContaining({ method: 'DELETE' }));
    await run('takeStep', { projectId: 'p1', stepId: 's1' });
    expect(request).toHaveBeenLastCalledWith('/api/hh/projects/p1/steps/s1/take', expect.objectContaining({ method: 'POST' }));
    await run('releaseStep', { projectId: 'p1', stepId: 's1' });
    expect(request).toHaveBeenLastCalledWith('/api/hh/projects/p1/steps/s1/release', expect.objectContaining({ method: 'POST' }));
    await run('takeProject', { projectId: 'p1' });
    expect(request).toHaveBeenLastCalledWith('/api/hh/projects/p1/take', expect.objectContaining({ method: 'POST' }));
  });

  it('sends a restore with the deletion it saw, as a project entry', async () => {
    await run('restoreProject', { entries: [{ id: 'p1', deletedAt: 5 }] });
    const [path, options] = request.mock.calls.at(-1)!;
    expect(path).toBe('/api/hh/restore');
    expect(JSON.parse(String(options?.body)).entries).toEqual([{ kind: 'project', id: 'p1', deletedAt: 5 }]);
  });
});

describe('the material runners', () => {
  it('sends a line with its time, a delete, and the lines to copy', async () => {
    await run('putMaterial', { projectId: 'p1', lineId: 'm1', text: 'Timber' });
    expect(request).toHaveBeenLastCalledWith('/api/hh/projects/p1/materials/m1', { method: 'PUT', body: JSON.stringify({ mutationId: common.mutationId, clientAt: AT, text: 'Timber', textAt: AT }) });
    await run('deleteMaterial', { projectId: 'p1', lineId: 'm1' });
    expect(request).toHaveBeenLastCalledWith('/api/hh/projects/p1/materials/m1', expect.objectContaining({ method: 'DELETE' }));
    await run('materialsToList', { projectId: 'p1', lineIds: ['m1', 'm2'] });
    const [path, options] = request.mock.calls.at(-1)!;
    expect(path).toBe('/api/hh/projects/p1/materials/add-to-list');
    expect(JSON.parse(String(options?.body)).lineIds).toEqual(['m1', 'm2']);
  });

  it('refreshes the shopping list as well when the copy settles', () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    defaults('materialsToList').onSettled!(undefined, null, {} as never, undefined as never, undefined as never);
    expect(spy.mock.calls.map(call => JSON.stringify(call[0]?.queryKey))).toEqual(expect.arrayContaining(['["items"]', '["projects"]']));
  });
});

describe('the project notices', () => {
  const settle = (kind: keyof typeof projectMutationKeys, vars: object, data: unknown) => defaults(kind).onSuccess!(data, { ...common, ...vars } as never, undefined, undefined as never);

  it('saves the person\'s own words when an edit was replaced, from the answer after a replay', () => {
    settle('putStep', { projectId: 'p1', stepId: 's1', changes: { text: 'Sam wording', position: 'k' } }, { outcome: 'noop', stale: ['text', 'position'] });
    const notices = readNotices('u1');
    expect(notices.map(notice => [notice.field, notice.text])).toEqual([['text', 'Sam wording'], ['position', 'A move to another place in the list']]);
    expect(window.localStorage.getItem(projectNoticesKey('u1'))).not.toBeNull();
  });

  it('keeps a replaced planned day in words', () => {
    settle('putProject', { projectId: 'p1', changes: { planned: { plannedOn: '2026-12-05' } } }, { outcome: 'noop', stale: ['planned'] });
    expect(readNotices('u1')[0]).toMatchObject({ recordId: 'p1', field: 'planned', text: 'Planned for Saturday 5 December' });
  });

  it('keeps a replaced figure as pounds', () => {
    settle('putProject', { projectId: 'p1', changes: { spentPence: 125000 } }, { outcome: 'noop', stale: ['spent'] });
    expect(readNotices('u1')[0]).toMatchObject({ field: 'spent', text: '£1,250.00' });
  });

  it('names the step in the message when it is known, and says nothing was changed', () => {
    client.setQueryData(['project', 'p1'], { project: { title: 'Decking' }, steps: [{ id: 's1', text: 'Check the joists' }] });
    settle('takeStep', { projectId: 'p1', stepId: 's1' }, { outcome: 'held_by_other', step: { takenBy: 'u2' } });
    expect(readNotices('u1')[0].text).toBe('Alex already has "Check the joists". Nothing was changed.');
  });

  it('says how many lines went to Shopping, and how many were already there', () => {
    settle('materialsToList', { projectId: 'p1', lineIds: ['a', 'b', 'c'] }, { results: [{ id: 'a', status: 'created' }, { id: 'b', status: 'created' }, { id: 'c', status: 'already' }] });
    expect(readNotices('u1')[0].text).toBe('Added 2 lines to Shopping. 1 was already there.');
  });

  it('saves "{name} already has this" when a take was refused and the step is not known', () => {
    settle('takeStep', { projectId: 'p1', stepId: 's1' }, { outcome: 'held_by_other', step: { takenBy: 'u2' } });
    expect(readNotices('u1')[0]).toMatchObject({ kind: 'taken', recordId: 's1', text: 'Alex already has this' });
  });

  it('keeps a replaced line\'s words, and says "Already on the list" when every line was already there', () => {
    settle('putMaterial', { projectId: 'p1', lineId: 'm1', text: 'Sam line' }, { outcome: 'noop', stale: ['text'] });
    settle('materialsToList', { projectId: 'p1', lineIds: ['m1'] }, { results: [{ id: 'm1', status: 'already' }] });
    expect(readNotices('u1').map(notice => notice.text)).toEqual(['Sam line', 'Already on the list']);
  });

  it('says what the press did when it created lines, next to the button that was pressed', () => {
    settle('materialsToList', { projectId: 'p1', lineIds: ['m1'] }, { results: [{ id: 'm1', status: 'created' }] });
    expect(readNotices('u1')[0]).toMatchObject({ field: 'list', text: 'Added 1 line to Shopping.' });
  });

  it('saves nothing for a write that was not replaced', () => {
    settle('putStep', { projectId: 'p1', stepId: 's1', changes: { text: 'x' } }, { outcome: 'applied', stale: [] });
    settle('takeStep', { projectId: 'p1', stepId: 's1' }, { outcome: 'taken' });
    expect(readNotices('u1')).toEqual([]);
  });

  it('says a household at the project limit was reached, when a restore is refused', () => {
    defaults('restoreProject').onSuccess!({ results: [{ id: 'p1', status: 'project_limit' }] }, { ...common, entries: [] } as never, undefined, undefined as never);
    expect(report).toHaveBeenCalledWith(expect.stringContaining('This household has reached 60 projects.'));
  });
});

describe('remembering what was saved', () => {
  const settle = (kind: keyof typeof projectMutationKeys, vars: object, data: unknown) => defaults(kind).onSuccess!(data, { ...common, ...vars } as never, undefined, undefined as never);

  it('remembers the words of a step or project that landed, so a later replacement by the other person can be caught', () => {
    settle('putStep', { projectId: 'p1', stepId: 's1', changes: { text: 'Sam wording', note: null, position: 'k' } }, { outcome: 'applied', stale: [] });
    settle('putProject', { projectId: 'p1', changes: { title: 'Decking' } }, { outcome: 'applied', stale: [] });
    const saved = JSON.parse(window.localStorage.getItem('hearthwise.projectSaved.u1') ?? '{}');
    expect(saved.s1.text).toMatchObject({ value: 'Sam wording', at: AT });
    expect(saved.s1.note).toMatchObject({ value: '' });
    expect(saved.s1.position).toBeUndefined();
    expect(saved.p1.title.value).toBe('Decking');
  });

  it('does not remember a field whose write lost, which already has its own notice', () => {
    settle('putStep', { projectId: 'p1', stepId: 's1', changes: { text: 'Older' } }, { outcome: 'noop', stale: ['text'] });
    expect(window.localStorage.getItem('hearthwise.projectSaved.u1')).toBeNull();
  });
});

describe('refusals', () => {
  it('describes the two limits in plain words', () => {
    expect(describeFailure(new ApiError(409, 'Conflict', 'project_limit'), 'putProject')).toBe('This household has reached 60 projects.');
    expect(describeFailure(new ApiError(409, 'Conflict', 'step_limit'), 'putStep')).toBe('This project has reached 40 steps.');
  });

  it('reports a refused write once and does not retry it, as a 4xx is final', () => {
    const error = new ApiError(409, 'Conflict', 'step_limit');
    expect(shouldRetry(0, error)).toBe(false);
    defaults('putStep').onError!(error, { ...common, projectId: 'p1', stepId: 's1', changes: {} } as never, undefined as never, undefined as never);
    expect(report).toHaveBeenCalledWith(expect.stringContaining('This project has reached 40 steps.'));
  });

  it('retries a network failure for ever', () => {
    expect(shouldRetry(50, new TypeError('Failed to fetch'))).toBe(true);
  });
});
