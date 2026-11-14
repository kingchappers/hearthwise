import { describe, expect, it } from 'vitest';
import type { Task } from '../../../src/tasks/types';
import { planSave } from '../taskChanges';

const ME = 'u1';
const THEM = 'u2';
const caller = { userId: ME, members: [{ userId: ME }, { userId: THEM }] };
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Hoover', fieldTimes: {}, assignee: ME, repeat: { type: 'after', days: 1 }, dueOn: '2026-11-13', cycleSeq: 4, ruleVersion: 6,
  checklist: [], checklistState: {}, status: 'open', createdBy: ME, updatedAt: 1, ...over,
});
const after3 = { type: 'after' as const, days: 3 };

describe('planSave', () => {
  it('is nothing for no changes', () => {
    expect(planSave(task(), {}, caller)).toEqual({ steps: [], needsAsk: false });
  });

  it('applies title, notes and checklist edits directly, even on the other member\'s task', () => {
    const plan = planSave(task({ assignee: THEM }), { title: 'Vacuum', notes: 'n' }, caller);
    expect(plan).toEqual({ steps: [{ kind: 'edit', taskId: 't1', title: 'Vacuum', notes: 'n' }], needsAsk: false });
  });

  it('applies a schedule change to one\'s own task directly, as one schedule step', () => {
    const plan = planSave(task(), { repeat: after3, dueOn: '2026-11-14' }, caller);
    expect(plan).toEqual({ steps: [{ kind: 'schedule', taskId: 't1', repeat: after3, dueOn: '2026-11-14' }], needsAsk: false });
  });

  it('asks, with one edit proposal, for a schedule change to the other member\'s task', () => {
    const plan = planSave(task({ assignee: THEM }), { repeat: after3, dueOn: '2026-11-14' }, caller);
    expect(plan.needsAsk).toBe(true);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ kind: 'propose', taskId: 't1', change: { kind: 'edit', set: { repeat: after3, dueOn: '2026-11-14' } }, baseRuleVersionHint: 6 });
  });

  it('asks for a date change on a both task, and sends the cycle it was about', () => {
    const plan = planSave(task({ assignee: 'both' }), { dueOn: '2026-11-20' }, caller);
    expect(plan.steps[0]).toMatchObject({ kind: 'propose', change: { kind: 'edit', set: { dueOn: '2026-11-20' } }, baseCycleSeqHint: 4 });
  });

  it('asks for giving one\'s own task to the other member, but not for taking an either task', () => {
    expect(planSave(task(), { assignee: THEM }, caller)).toMatchObject({ needsAsk: true, steps: [{ kind: 'propose', change: { kind: 'edit', set: { assignee: THEM } } }] });
    expect(planSave(task({ assignee: 'either' }), { assignee: ME }, caller)).toEqual({ steps: [{ kind: 'schedule', taskId: 't1', assignee: ME }], needsAsk: false });
  });

  it('splits a mixed save: what is direct is applied, what needs a say is asked', () => {
    const plan = planSave(task(), { title: 'New', assignee: THEM, dueOn: '2026-11-20' }, caller);
    expect(plan.needsAsk).toBe(true);
    expect(plan.steps.map(step => step.kind)).toEqual(['edit', 'schedule', 'propose']);
    expect(plan.steps[1]).toMatchObject({ kind: 'schedule', dueOn: '2026-11-20' });
    expect(plan.steps[2]).toMatchObject({ kind: 'propose', change: { kind: 'edit', set: { assignee: THEM } } });
  });

  it('applies everything directly in a one-member household', () => {
    const solo = { userId: ME, members: [{ userId: ME }] };
    expect(planSave(task({ assignee: 'both' }), { dueOn: '2026-11-20' }, solo).needsAsk).toBe(false);
  });

  it('ignores a change to the value the task already has', () => {
    expect(planSave(task(), { assignee: ME, dueOn: '2026-11-13' }, caller)).toEqual({ steps: [], needsAsk: false });
  });
});
