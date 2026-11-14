import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/household';
import type { Task } from '../../tasks/types';
import { digestFor, inWindow, nudgesFor } from '../select';

const roster = { members: [{ userId: 'a' }, { userId: 'b' }] };
const on = (hour: number) => ({ ...DEFAULT_SETTINGS, digest: { on: true, hour }, dueNudges: { on: true, hour } });
const member = (settings = on(19)) => ({ userId: 'a', settings });
const task = (id: string, assignee: string, dueOn: string | undefined, over: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, fieldTimes: {}, assignee, repeat: { type: 'none' }, cycleSeq: 1, ruleVersion: 1, checklist: [],
  checklistState: {}, status: 'open', createdBy: 'a', updatedAt: 0, dueOn, ...over,
});
const today = { date: '2026-11-13', hour: 19 };

describe('inWindow', () => {
  it('is the chosen hour and up to two hours after, never past midnight', () => {
    expect([18, 19, 20, 21, 22].map(hour => inWindow(19, hour))).toEqual([false, true, true, true, false]);
    expect([21, 22, 23, 0, 1].map(hour => inWindow(22, hour))).toEqual([false, true, true, false, false]);
    expect([22, 23, 0, 1].map(hour => inWindow(23, hour))).toEqual([false, true, false, false]);
  });
});

describe('digestFor', () => {
  it('lists open tasks that are the member\'s, either, or both, due today or earlier', () => {
    const tasks = [task('1', 'a', '2026-11-13'), task('2', 'either', '2026-11-10'), task('3', 'both', '2026-11-13'), task('4', 'b', '2026-11-13'), task('5', 'a', '2026-11-14'), task('6', 'a', undefined)];
    const digest = digestFor(member(), tasks, roster, today)!;
    expect(digest.body).toContain('Task 1');
    expect(digest.body).toContain('Task 2');
    expect(digest.body).toContain('Task 3');
    expect(digest.body).not.toContain('Task 4');
    expect(digest.body).not.toContain('Task 5');
    expect(digest.body).not.toContain('Task 6');
    expect(digest.tag).toBe('digest-2026-11-13');
  });

  it('uses the effective assignee: an agreed swap moves the task', () => {
    const swapped = task('1', 'b', '2026-11-13', { overrideAssignee: 'a', overrideCycle: 1 });
    expect(digestFor(member(), [swapped], roster, today)).toBeDefined();
    const away = task('2', 'a', '2026-11-13', { overrideAssignee: 'b', overrideCycle: 1 });
    expect(digestFor(member(), [away], roster, today)).toBeUndefined();
  });

  it('is nothing when the digest is off, the hour is outside the window, or nothing is due', () => {
    const tasks = [task('1', 'a', '2026-11-13')];
    expect(digestFor(member({ ...on(19), digest: { on: false, hour: 19 } }), tasks, roster, today)).toBeUndefined();
    expect(digestFor(member(), tasks, roster, { date: '2026-11-13', hour: 17 })).toBeUndefined();
    expect(digestFor(member(), [task('1', 'a', '2026-11-14')], roster, today)).toBeUndefined();
  });

  it('skips done and deleted tasks', () => {
    const tasks = [task('1', 'a', '2026-11-13', { status: 'done' }), task('2', 'a', '2026-11-13', { deletedAt: 5 })];
    expect(digestFor(member(), tasks, roster, today)).toBeUndefined();
  });

  it('uses neutral wording', () => {
    const body = digestFor(member(), [task('1', 'a', '2026-11-01')], roster, today)!;
    expect(`${body.title} ${body.body}`).not.toMatch(/overdue|missed|streak/i);
  });
});

describe('nudgesFor', () => {
  it('is one nudge per task due today for the member, tagged by task and day', () => {
    const tasks = [task('1', 'a', '2026-11-13'), task('2', 'either', '2026-11-13'), task('3', 'b', '2026-11-13'), task('4', 'a', '2026-11-10')];
    const nudges = nudgesFor(member(on(8)), tasks, roster, { date: '2026-11-13', hour: 9 });
    expect(nudges.map(n => n.tag).sort()).toEqual(['nudge-1-2026-11-13', 'nudge-2-2026-11-13']);
  });

  it('is none when nudges are off or the hour is outside the window', () => {
    const tasks = [task('1', 'a', '2026-11-13')];
    expect(nudgesFor(member({ ...on(8), dueNudges: { on: false, hour: 8 } }), tasks, roster, { date: '2026-11-13', hour: 8 })).toEqual([]);
    expect(nudgesFor(member(on(8)), tasks, roster, { date: '2026-11-13', hour: 12 })).toEqual([]);
  });
});
