import { beforeEach, describe, expect, it } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import type { Task } from '../../../src/tasks/types';
import type { TasksData } from '../overlay';
import { TASKS_KEY } from '../queries';
import { dataForMutation } from '../pending';

const ME = 'auth0|me';
const task = (): Task => ({
  id: 't1', title: 'Hoover', fieldTimes: {}, assignee: 'either', repeat: { type: 'after', days: 1 }, dueOn: '2026-11-12', cycleSeq: 1, ruleVersion: 1,
  checklist: [], checklistState: {}, status: 'open', createdBy: ME, updatedAt: 1,
});

let client: QueryClient;
const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';

// Writes queued in the household scope are all "pending", the ones behind the running one included. They never reach the server
// first, so a write must not read versions that include them.
function queue(kind: 'schedule' | 'complete', variables: Record<string, unknown>): void {
  new MutationObserver(client, { mutationKey: ['household', kind], scope: { id: 'household' }, mutationFn: () => new Promise(() => undefined) })
    .mutate({ at: 1, by: ME, ...variables } as never);
}
const cycleOf = (data: TasksData): number => data.tasks[0].cycleSeq;

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData<TasksData>(TASKS_KEY, { tasks: [task()], proposals: [], serverTime: 1 });
});

describe('dataForMutation', () => {
  it('leaves out a write that was queued after the running one', () => {
    queue('schedule', { mutationId: FIRST, taskId: 't1', dueOn: '2026-11-20' });
    queue('complete', { mutationId: SECOND, taskId: 't1', cycleSeq: 1, nextDueOn: '2026-11-14' });
    expect(cycleOf(dataForMutation(client, FIRST))).toBe(1);
  });

  it('counts a write that was queued before the running one', () => {
    queue('complete', { mutationId: FIRST, taskId: 't1', cycleSeq: 1, nextDueOn: '2026-11-14' });
    queue('schedule', { mutationId: SECOND, taskId: 't1', dueOn: '2026-11-20' });
    expect(cycleOf(dataForMutation(client, SECOND))).toBe(2);
  });

  it('never counts the running write itself', () => {
    queue('complete', { mutationId: FIRST, taskId: 't1', cycleSeq: 1, nextDueOn: '2026-11-14' });
    expect(cycleOf(dataForMutation(client, FIRST))).toBe(1);
  });

  it('counts every pending write when asked about none in particular', () => {
    queue('complete', { mutationId: FIRST, taskId: 't1', cycleSeq: 1, nextDueOn: '2026-11-14' });
    expect(cycleOf(dataForMutation(client))).toBe(2);
  });

  it('is empty when nothing is cached yet', () => {
    expect(dataForMutation(new QueryClient(), FIRST).tasks).toEqual([]);
  });
});
