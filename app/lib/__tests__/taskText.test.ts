import { describe, expect, it } from 'vitest';
import type { Task } from '../../../src/tasks/types';
import { assigneeLabel, dueLabel, formatDay, memberName, repeatLabel } from '../taskText';

const roster = [{ userId: 'u1', displayName: 'Sam' }, { userId: 'u2', displayName: 'Alex' }];
const task = (over: Partial<Task> = {}): Task => ({
  id: 't', title: 'T', fieldTimes: {}, assignee: 'either', repeat: { type: 'none' }, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {},
  status: 'open', createdBy: 'u1', updatedAt: 1, ...over,
});

describe('formatDay', () => {
  it('reads a date as a short weekday, day and month', () => {
    expect(formatDay('2026-11-12')).toMatch(/Thu,? 12 Nov/);
  });
});

describe('dueLabel', () => {
  it('says Due for today and earlier (never anything harsher), and just the date for later', () => {
    expect(dueLabel(task({ dueOn: '2026-11-13' }), '2026-11-13')).toBe('Due today');
    expect(dueLabel(task({ dueOn: '2026-11-12' }), '2026-11-13')).toMatch(/^Due · Thu,? 12 Nov$/);
    expect(dueLabel(task({ dueOn: '2026-11-14' }), '2026-11-13')).toMatch(/^Sat,? 14 Nov$/);
    expect(dueLabel(task(), '2026-11-13')).toBeUndefined();
  });

  it('never uses overdue, missed or late', () => {
    for (const dueOn of ['2020-01-01', '2026-11-12']) expect(dueLabel(task({ dueOn }), '2026-11-13')).not.toMatch(/overdue|missed|late|behind/i);
  });
});

describe('assigneeLabel', () => {
  it('reads You, a name, Together and Anyone', () => {
    expect(assigneeLabel(task({ assignee: 'u1' }), roster, 'u1')).toBe('You');
    expect(assigneeLabel(task({ assignee: 'u2' }), roster, 'u1')).toBe('Alex');
    expect(assigneeLabel(task({ assignee: 'both' }), roster, 'u1')).toBe('Together');
    expect(assigneeLabel(task({ assignee: 'either' }), roster, 'u1')).toBe('Anyone');
  });

  it('follows a swap for this cycle, and reads a person who left as Anyone', () => {
    expect(assigneeLabel(task({ assignee: 'u2', overrideAssignee: 'u1', overrideCycle: 1 }), roster, 'u1')).toBe('You (this time)');
    expect(assigneeLabel(task({ assignee: 'gone' }), roster, 'u1')).toBe('Anyone');
    expect(assigneeLabel(task({ assignee: 'both' }), [roster[0]], 'u1')).toBe('Anyone');
  });
});

describe('memberName', () => {
  it('is the display name, or Former member for someone who left', () => {
    expect(memberName(roster, 'u2')).toBe('Alex');
    expect(memberName(roster, 'gone')).toBe('Former member');
  });
});

describe('repeatLabel', () => {
  it('describes each kind of repeat in plain words', () => {
    expect(repeatLabel({ type: 'none' })).toBe("Doesn't repeat");
    expect(repeatLabel({ type: 'after', days: 1 })).toBe('1 day after it is done');
    expect(repeatLabel({ type: 'after', days: 7 })).toBe('7 days after it is done');
    expect(repeatLabel({ type: 'fixed', every: 1, unit: 'day', startOn: '2026-11-01' })).toBe('Every day');
    expect(repeatLabel({ type: 'fixed', every: 3, unit: 'day', startOn: '2026-11-01' })).toBe('Every 3 days');
    expect(repeatLabel({ type: 'fixed', every: 1, unit: 'week', weekdays: ['sun'], startOn: '2026-11-01' })).toBe('Every week on Sun');
    expect(repeatLabel({ type: 'fixed', every: 2, unit: 'week', weekdays: ['mon', 'thu'], startOn: '2026-11-01' })).toBe('Every 2 weeks on Mon, Thu');
    expect(repeatLabel({ type: 'fixed', every: 1, unit: 'month', dayOfMonth: 31, startOn: '2026-01-31' })).toBe('Every month on the 31st');
  });
});
