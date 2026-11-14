import { describe, expect, it } from 'vitest';
import type { Task } from '../../../src/tasks/types';
import { comingSunday, effectiveAssignee, groupTasks, nextThing } from '../tasks';

const VIEWER = 'auth0|me';
const OTHER = 'auth0|them';
const MEMBERS = [{ userId: VIEWER }, { userId: OTHER }];
let n = 0;

const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: `Task ${n}`, fieldTimes: {}, assignee: 'either', repeat: { type: 'after', days: 1 }, cycleSeq: 1, ruleVersion: 1,
  checklist: [], checklistState: {}, status: 'open', createdBy: VIEWER, updatedAt: 1, ...over,
});
const ids = (tasks: Task[]): string[] => tasks.map(t => t.id);

// 2026-11-13 is a Friday, so the coming Sunday is the 15th.
describe('comingSunday', () => {
  it('is the Sunday of the same Monday-to-Sunday week', () => {
    expect(comingSunday('2026-11-13')).toBe('2026-11-15');
    expect(comingSunday('2026-11-16')).toBe('2026-11-22');
    expect(comingSunday('2026-11-15')).toBe('2026-11-15');
    expect(comingSunday('2026-11-09')).toBe('2026-11-15');
  });
});

describe('groupTasks', () => {
  const today = '2026-11-13';

  it('puts tasks due today or earlier in Today, up to Sunday in This week, then Later, and undated in Whenever', () => {
    const past = task({ dueOn: '2026-11-01' });
    const now = task({ dueOn: '2026-11-13' });
    const tomorrow = task({ dueOn: '2026-11-14' });
    const sunday = task({ dueOn: '2026-11-15' });
    const monday = task({ dueOn: '2026-11-16' });
    const undated = task({ repeat: { type: 'none' } });
    const groups = groupTasks([monday, undated, sunday, tomorrow, now, past], today);
    expect(ids(groups.today)).toEqual([past.id, now.id]);
    expect(ids(groups.week)).toEqual([tomorrow.id, sunday.id]);
    expect(ids(groups.later)).toEqual([monday.id]);
    expect(ids(groups.whenever)).toEqual([undated.id]);
  });

  it('counts a Sunday as the end of its own week, so the next day is Later', () => {
    const monday = task({ dueOn: '2026-11-16' });
    expect(ids(groupTasks([monday], '2026-11-15').later)).toEqual([monday.id]);
    expect(ids(groupTasks([monday], '2026-11-16').today)).toEqual([monday.id]);
  });

  it('orders a group by date and then title', () => {
    const b = task({ dueOn: '2026-11-13', title: 'B' });
    const a = task({ dueOn: '2026-11-13', title: 'A' });
    const earlier = task({ dueOn: '2026-11-12', title: 'Z' });
    expect(ids(groupTasks([b, a, earlier], today).today)).toEqual([earlier.id, a.id, b.id]);
  });

  it('leaves out deleted tasks and done to-dos', () => {
    const open = task({ dueOn: '2026-11-13' });
    const deleted = task({ dueOn: '2026-11-13', deletedAt: 5 });
    const done = task({ repeat: { type: 'none' }, status: 'done', doneAt: 5 });
    const groups = groupTasks([open, deleted, done], today);
    expect(Object.values(groups).flat().map(t => t.id)).toEqual([open.id]);
  });
});

describe('effectiveAssignee', () => {
  it('follows a swap only while its cycle is current, and reads a person who left as either', () => {
    const swapped = task({ assignee: OTHER, overrideAssignee: VIEWER, overrideCycle: 1, cycleSeq: 1 });
    expect(effectiveAssignee(swapped, { members: MEMBERS })).toBe(VIEWER);
    expect(effectiveAssignee({ ...swapped, cycleSeq: 2 }, { members: MEMBERS })).toBe(OTHER);
    expect(effectiveAssignee(task({ assignee: 'auth0|gone' }), { members: MEMBERS })).toBe('either');
    expect(effectiveAssignee(task({ assignee: 'both' }), { members: [{ userId: VIEWER }] })).toBe('either');
  });
});

describe('nextThing', () => {
  const today = '2026-11-13';
  const next = (tasks: Task[], skipped: string[] = []) => nextThing(tasks, VIEWER, today, { members: MEMBERS }, skipped);

  it('is the earliest due task assigned to the viewer, either or both', () => {
    const later = task({ dueOn: '2026-11-13', title: 'B' });
    const earlier = task({ dueOn: '2026-11-12', assignee: 'both' });
    expect(next([later, earlier])?.id).toBe(earlier.id);
  });

  it('prefers the viewer\'s own task to an either or both task due the same day, then orders by title', () => {
    const either = task({ dueOn: '2026-11-13', title: 'A' });
    const mine = task({ dueOn: '2026-11-13', title: 'Z', assignee: VIEWER });
    expect(next([either, mine])?.id).toBe(mine.id);
    const b = task({ dueOn: '2026-11-13', title: 'B' });
    expect(next([b, either])?.id).toBe(either.id);
  });

  it('never offers the other member\'s task, unless a swap gave it to the viewer for this cycle', () => {
    const theirs = task({ dueOn: '2026-11-13', assignee: OTHER });
    expect(next([theirs])).toBeUndefined();
    const swapped = task({ dueOn: '2026-11-13', assignee: OTHER, overrideAssignee: VIEWER, overrideCycle: 1 });
    expect(next([theirs, swapped])?.id).toBe(swapped.id);
  });

  it('offers an undated to-do only when nothing dated is due', () => {
    const undated = task({ repeat: { type: 'none' } });
    const due = task({ dueOn: '2026-11-13' });
    const future = task({ dueOn: '2026-12-01' });
    expect(next([undated, due])?.id).toBe(due.id);
    expect(next([undated, future])?.id).toBe(undated.id);
    expect(next([future])?.id).toBe(future.id);
  });

  it('skips tasks set aside with Not now, and ignores deleted and done ones', () => {
    const a = task({ dueOn: '2026-11-12' });
    const b = task({ dueOn: '2026-11-13' });
    expect(next([a, b], [a.id])?.id).toBe(b.id);
    expect(next([a, b], [a.id, b.id])).toBeUndefined();
    expect(next([task({ dueOn: '2026-11-12', deletedAt: 1 }), task({ repeat: { type: 'none' }, status: 'done' })])).toBeUndefined();
  });
});
