import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import type { Task } from '../../../src/tasks/types';
import { ApiError } from '../apiError';
import type { TasksData } from '../overlay';
import { mutationKeys, planCreate, registerMutations } from '../mutations';
import type { MutationKind } from '../mutations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ME = 'auth0|me';
const THEM = 'auth0|them';
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Hoover', fieldTimes: {}, assignee: 'either', repeat: { type: 'after', days: 1 }, dueOn: '2026-11-12', cycleSeq: 3, ruleVersion: 7,
  checklist: [], checklistState: {}, status: 'open', createdBy: ME, updatedAt: 1, ...over,
});

let client: QueryClient;
let request: ReturnType<typeof vi.fn>;
let report: ReturnType<typeof vi.fn<(message: string) => void>>;
let current: TasksData;
let excluded: (string | undefined)[];

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  request = vi.fn().mockResolvedValue({});
  report = vi.fn<(message: string) => void>();
  current = { tasks: [task()], proposals: [], serverTime: 1 };
  excluded = [];
  registerMutations(client, request as never, exceptId => { excluded.push(exceptId); return current; }, report);
});

const run = (kind: MutationKind, variables: Record<string, unknown>) =>
  new MutationObserver(client, { mutationKey: mutationKeys[kind] }).mutate({ mutationId: 'a'.repeat(8) + '-0000-4000-8000-000000000001', at: 1_800_000_000_000, by: ME, ...variables } as never);
const call = () => request.mock.calls.at(-1) as [string, { method: string; body: string }];
const body = () => JSON.parse(call()[1].body);

describe('the mutation registry', () => {
  it('registers every kind with the household scope, so household writes run one at a time, in order', () => {
    const kinds: MutationKind[] = ['create', 'edit', 'schedule', 'delete', 'complete', 'uncomplete', 'tick', 'restore', 'propose', 'accept', 'decline', 'withdraw'];
    for (const kind of kinds) {
      const defaults = client.getMutationDefaults(mutationKeys[kind]);
      expect(defaults.mutationFn, kind).toBeTypeOf('function');
      expect(defaults.scope, kind).toEqual({ id: 'household' });
    }
  });
});

describe('what each mutation sends', () => {
  it('create posts the task with the mutation id and the client time', async () => {
    await run('create', { task: { id: 't9', title: 'Bins', assignee: 'either', repeat: { type: 'none' } } });
    expect(call()[0]).toBe('/api/hh/tasks');
    expect(call()[1].method).toBe('POST');
    expect(body()).toMatchObject({ id: 't9', title: 'Bins', assignee: 'either', repeat: { type: 'none' }, clientAt: 1_800_000_000_000 });
    expect(body().mutationId).toMatch(UUID);
  });

  it('edit patches only the named fields, each with its time', async () => {
    await run('edit', { taskId: 't1', title: 'Vacuum' });
    expect(call()[0]).toBe('/api/hh/tasks/t1');
    expect(call()[1].method).toBe('PATCH');
    expect(body()).toMatchObject({ title: 'Vacuum', titleAt: 1_800_000_000_000 });
    expect(body().notes).toBeUndefined();
  });

  it('tick patches one step for the cycle that was shown', async () => {
    await run('tick', { taskId: 't1', cycleSeq: 3, stepId: 's1', done: true });
    expect(body().ticks).toEqual({ cycleSeq: 3, steps: { s1: { done: true, at: 1_800_000_000_000 } } });
  });

  it('schedule reads the base versions when it runs, from data that leaves out this mutation itself', async () => {
    await run('schedule', { taskId: 't1', dueOn: '2026-11-20' });
    expect(body()).toMatchObject({ dueOn: '2026-11-20', baseRuleVersion: 7, baseCycleSeq: 3 });
    expect(excluded.at(-1)).toMatch(UUID);
  });

  it('schedule with a repeat change sends the rule, the suggested date and the rule version', async () => {
    await run('schedule', { taskId: 't1', repeat: { type: 'after', days: 4 }, dueOn: '2026-11-21' });
    expect(body()).toMatchObject({ repeat: { type: 'after', days: 4 }, dueOn: '2026-11-21', baseRuleVersion: 7 });
    expect(body().baseCycleSeq).toBeUndefined();
  });

  it('delete sends the rule version it finds when it runs', async () => {
    await run('delete', { taskId: 't1' });
    expect(call()[0]).toBe('/api/hh/tasks/t1');
    expect(call()[1].method).toBe('DELETE');
    expect(body().baseRuleVersion).toBe(7);
  });

  it('complete sends the cycle that was shown and the time of the tap', async () => {
    await run('complete', { taskId: 't1', cycleSeq: 3, nextDueOn: '2026-11-14' });
    expect(call()[0]).toBe('/api/hh/tasks/t1/complete');
    expect(body()).toMatchObject({ cycleSeq: 3, completedAt: 1_800_000_000_000 });
  });

  it('uncomplete deletes that cycle\'s completion', async () => {
    await run('uncomplete', { taskId: 't1', cycleSeq: 3, previous: { checklistState: {} } });
    expect(call()[0]).toBe('/api/hh/tasks/t1/completions/3');
    expect(call()[1].method).toBe('DELETE');
  });

  it('restore posts one entry', async () => {
    await run('restore', { taskId: 't1' });
    expect(call()[0]).toBe('/api/hh/restore');
    expect(body().entries).toEqual([{ kind: 'task', id: 't1' }]);
  });

  it('propose reads the rule version when it runs, and falls back to the hint for a task not in the data yet', async () => {
    await run('propose', { id: 'p1', taskId: 't1', change: { kind: 'delete' }, baseRuleVersionHint: 1 });
    expect(body()).toMatchObject({ id: 'p1', taskId: 't1', change: { kind: 'delete' }, baseRuleVersion: 7 });
    current = { tasks: [], proposals: [], serverTime: 1 };
    await run('propose', { id: 'p2', taskId: 'new', change: { kind: 'edit', set: { assignee: THEM } }, baseRuleVersionHint: 1 });
    expect(body().baseRuleVersion).toBe(1);
  });

  it('propose sends the cycle only for a change about one cycle', async () => {
    await run('propose', { id: 'p1', taskId: 't1', change: { kind: 'swap' }, baseRuleVersionHint: 1 });
    expect(body().baseCycleSeq).toBe(3);
    await run('propose', { id: 'p2', taskId: 't1', change: { kind: 'delete' }, baseRuleVersionHint: 1 });
    expect(body().baseCycleSeq).toBeUndefined();
  });

  it.each([['accept'], ['decline'], ['withdraw']] as const)('%s posts to that proposal', async kind => {
    await run(kind, { id: 'p1' });
    expect(call()[0]).toBe(`/api/hh/proposals/p1/${kind}`);
    expect(body().mutationId).toMatch(UUID);
  });
});

describe('when a write fails', () => {
  it('drops a 409 or 410 and says what happened, in plain words', async () => {
    request.mockRejectedValueOnce(new ApiError(409, 'Conflict', 'conflict'));
    await expect(run('complete', { taskId: 't1', cycleSeq: 3, nextDueOn: null })).rejects.toBeInstanceOf(ApiError);
    expect(report).toHaveBeenCalledWith(expect.stringMatching(/changed on another phone/i));
    request.mockRejectedValueOnce(new ApiError(410, 'Gone', 'gone'));
    await expect(run('edit', { taskId: 't1', title: 'x' })).rejects.toBeInstanceOf(ApiError);
    expect(report).toHaveBeenLastCalledWith(expect.stringMatching(/was deleted/i));
  });

  it('says a change needs the other person\'s say, on proposal_required', async () => {
    request.mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'proposal_required'));
    await expect(run('delete', { taskId: 't1' })).rejects.toBeInstanceOf(ApiError);
    expect(report).toHaveBeenCalledWith(expect.stringMatching(/needs their say/i));
  });

  it('says the change could not be saved for any other 4xx, and says nothing for a network failure', async () => {
    request.mockRejectedValueOnce(new ApiError(400, 'Bad Request', 'invalid'));
    await expect(run('edit', { taskId: 't1', title: 'x' })).rejects.toBeInstanceOf(ApiError);
    expect(report).toHaveBeenCalledWith(expect.stringMatching(/couldn't save/i));
    report.mockClear();
    request.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(run('edit', { taskId: 't1', title: 'x' })).rejects.toThrow('Failed to fetch');
    expect(report).not.toHaveBeenCalled();
  });
});

describe('planCreate', () => {
  const input = { id: 't9', title: 'Bins', repeat: { type: 'none' as const } };

  it('is one create for a task for oneself or for either', () => {
    expect(planCreate({ ...input, assignee: ME }, { userId: ME, members: [{ userId: ME }, { userId: THEM }] })).toEqual([{ kind: 'create', task: { ...input, assignee: ME } }]);
    expect(planCreate({ ...input, assignee: 'either' }, { userId: ME, members: [{ userId: ME }, { userId: THEM }] })).toHaveLength(1);
  });

  it('is a create as either, then an edit proposal that sets the assignee, for the other member or for both', () => {
    for (const assignee of [THEM, 'both']) {
      const [first, second] = planCreate({ ...input, assignee }, { userId: ME, members: [{ userId: ME }, { userId: THEM }] });
      expect(first).toEqual({ kind: 'create', task: { ...input, assignee: 'either' } });
      expect(second).toMatchObject({ kind: 'propose', taskId: 't9', change: { kind: 'edit', set: { assignee } }, baseRuleVersionHint: 1 });
      expect((second as { id: string }).id).toMatch(UUID);
    }
  });

  it('is one create when both is only either, in a one-member household', () => {
    expect(planCreate({ ...input, assignee: 'both' }, { userId: ME, members: [{ userId: ME }] })).toHaveLength(1);
  });
});
