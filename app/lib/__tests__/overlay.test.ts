import { describe, expect, it } from 'vitest';
import type { Proposal, Task } from '../../../src/tasks/types';
import type { TasksData } from '../overlay';
import { applyPending } from '../overlay';
import type { MutationKind } from '../mutations';

const ME = 'auth0|me';
const THEM = 'auth0|them';
const base = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Hoover', fieldTimes: { title: 100 }, assignee: 'either', repeat: { type: 'after', days: 1 }, dueOn: '2026-11-12', cycleSeq: 1,
  ruleVersion: 1, checklist: [{ id: 's1', text: 'Stairs' }], checklistState: {}, status: 'open', createdBy: ME, updatedAt: 1, ...over,
});
const proposal = (over: Partial<Proposal> = {}): Proposal => ({ id: 'p1', taskId: 't1', fromUserId: THEM, toUserId: ME, change: { kind: 'swap' }, baseRuleVersion: 1, baseCycleSeq: 1, status: 'pending', createdAt: 1, ...over });
const data = (tasks: Task[] = [base()], proposals: Proposal[] = []): TasksData => ({ tasks, proposals, serverTime: 1 });
const common = { mutationId: 'm1', at: 500, by: ME };
const pending = (kind: MutationKind, variables: object) => ({ mutationKey: ['household', kind] as const, variables: { ...common, ...variables } });
const after = (kind: MutationKind, variables: object, from = data()): TasksData => applyPending(from, [pending(kind, variables)]);
const one = (result: TasksData, id = 't1'): Task => result.tasks.find(t => t.id === id)!;

describe('applyPending', () => {
  it('leaves the server data alone when nothing is pending, and never changes its input', () => {
    const input = data();
    const snapshot = structuredClone(input);
    expect(applyPending(input, [])).toEqual(input);
    after('delete', { taskId: 't1' }, input);
    expect(input).toEqual(snapshot);
  });

  it('shows a task that is being created, as cycle 1 and open', () => {
    const result = after('create', { task: { id: 't2', title: 'Bins', assignee: 'either', repeat: { type: 'none' } } });
    expect(one(result, 't2')).toMatchObject({ title: 'Bins', cycleSeq: 1, ruleVersion: 1, status: 'open', createdBy: ME, checklistState: {} });
  });

  it('shows a newer edit of a field and ignores an older one', () => {
    expect(one(after('edit', { taskId: 't1', title: 'Vacuum' })).title).toBe('Vacuum');
    expect(one(applyPending(data(), [{ mutationKey: ['household', 'edit'], variables: { ...common, at: 50, taskId: 't1', title: 'Old' } }])).title).toBe('Hoover');
  });

  it('shows a tick in the current cycle and not one from another cycle', () => {
    expect(one(after('tick', { taskId: 't1', cycleSeq: 1, stepId: 's1', done: true })).checklistState).toEqual({ s1: { done: true, at: 500 } });
    expect(one(after('tick', { taskId: 't1', cycleSeq: 0, stepId: 's1', done: true })).checklistState).toEqual({});
  });

  it('shows a date, repeat or assignee change, and a repeat change clears a swap', () => {
    const swapped = data([base({ overrideAssignee: THEM, overrideCycle: 1 })]);
    expect(one(after('schedule', { taskId: 't1', dueOn: '2026-11-20' }, swapped))).toMatchObject({ dueOn: '2026-11-20', overrideAssignee: THEM });
    const repeat = one(after('schedule', { taskId: 't1', repeat: { type: 'after', days: 4 }, dueOn: '2026-11-21' }, swapped));
    expect(repeat).toMatchObject({ repeat: { type: 'after', days: 4 }, dueOn: '2026-11-21' });
    expect(repeat.overrideAssignee).toBeUndefined();
    expect(one(after('schedule', { taskId: 't1', assignee: ME })).assignee).toBe(ME);
  });

  it('shows a delete as a tombstone and a restore as its removal', () => {
    const deleted = after('delete', { taskId: 't1' });
    expect(one(deleted)).toMatchObject({ deletedAt: 500, deletedBy: ME });
    expect(one(applyPending(deleted, [pending('restore', { taskId: 't1' })])).deletedAt).toBeUndefined();
  });

  it('shows a completion moving the date, clearing ticks and swaps, and a done to-do', () => {
    const ticked = data([base({ checklistState: { s1: { done: true, at: 1 } }, overrideAssignee: THEM, overrideCycle: 1 })]);
    const result = one(after('complete', { taskId: 't1', cycleSeq: 1, nextDueOn: '2026-11-14' }, ticked));
    expect(result).toMatchObject({ cycleSeq: 2, dueOn: '2026-11-14', checklistState: {} });
    expect(result.overrideAssignee).toBeUndefined();
    const todo = one(after('complete', { taskId: 't1', cycleSeq: 1, nextDueOn: null }, data([base({ repeat: { type: 'none' } })])));
    expect(todo).toMatchObject({ status: 'done', doneAt: 500, cycleSeq: 2, dueOn: '2026-11-12' });
  });

  it('does not complete a cycle the task has already moved past', () => {
    expect(one(after('complete', { taskId: 't1', cycleSeq: 0, nextDueOn: '2026-11-14' })).cycleSeq).toBe(1);
  });

  it('shows an undo putting the previous cycle back', () => {
    const completed = after('complete', { taskId: 't1', cycleSeq: 1, nextDueOn: '2026-11-14' });
    const undone = applyPending(completed, [pending('uncomplete', { taskId: 't1', cycleSeq: 1, previous: { dueOn: '2026-11-12', checklistState: {} } })]);
    expect(one(undone)).toMatchObject({ cycleSeq: 1, dueOn: '2026-11-12', status: 'open' });
  });

  it('shows a new proposal as pending, and each resolution', () => {
    const made = after('propose', { id: 'p9', taskId: 't1', change: { kind: 'delete' }, baseRuleVersionHint: 1 });
    expect(made.proposals.find(p => p.id === 'p9')).toMatchObject({ status: 'pending', fromUserId: ME });
    const from = data([base({ assignee: THEM })], [proposal()]);
    expect(after('decline', { id: 'p1' }, from).proposals[0].status).toBe('declined');
    expect(after('withdraw', { id: 'p1' }, from).proposals[0].status).toBe('withdrawn');
    const accepted = after('accept', { id: 'p1' }, from);
    expect(accepted.proposals[0].status).toBe('accepted');
    expect(one(accepted)).toMatchObject({ overrideAssignee: THEM, overrideCycle: 1 });
  });

  it('applies several pending changes in order, and skips ones for a task that is not there', () => {
    const result = applyPending(data(), [
      pending('edit', { taskId: 't1', title: 'First' }),
      { mutationKey: ['household', 'edit'], variables: { ...common, at: 600, taskId: 't1', title: 'Second' } },
      pending('delete', { taskId: 'missing' }),
    ]);
    expect(one(result).title).toBe('Second');
    expect(result.tasks).toHaveLength(1);
  });
});
