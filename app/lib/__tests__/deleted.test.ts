import { describe, expect, it } from 'vitest';
import type { Task } from '../../../src/tasks/types';
import { deletedTasks } from '../deleted';

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, fieldTimes: {}, assignee: 'either', repeat: { type: 'none' }, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {},
  status: 'open', createdBy: 'u1', updatedAt: 1, ...over,
});

describe('deletedTasks', () => {
  it('lists only deleted tasks, newest deletion first', () => {
    const rows = deletedTasks([task('open'), task('old', { deletedAt: 100 }), task('new', { deletedAt: 300 }), task('mid', { deletedAt: 200 })]);
    expect(rows.map(row => row.id)).toEqual(['new', 'mid', 'old']);
  });

  it('is empty when nothing is deleted', () => {
    expect(deletedTasks([task('a'), task('b')])).toEqual([]);
  });
});
