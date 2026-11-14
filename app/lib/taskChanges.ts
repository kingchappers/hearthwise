// Turns what a person changed on the task sheet into the mutations to run. Title, notes and checklist always apply directly. A change
// to who has a task, or when, applies directly on one's own task and is asked (a proposal) on the other member's.
import type { Repeat } from '../../src/shared/schedule';
import { needsProposal } from '../../src/tasks/ownership';
import type { Caller } from '../../src/tasks/ownership';
import type { Change, ChecklistStep, Task } from '../../src/tasks/types';

export interface TaskChanges {
  title?: string;
  notes?: string;
  checklist?: ChecklistStep[];
  assignee?: string;
  repeat?: Repeat;
  // With a repeat change this is the suggested date for the new rule.
  dueOn?: string;
}

export type SaveStep =
  | { kind: 'edit'; taskId: string; title?: string; notes?: string; checklist?: ChecklistStep[] }
  | { kind: 'schedule'; taskId: string; assignee?: string; repeat?: Repeat; dueOn?: string }
  | { kind: 'propose'; id: string; taskId: string; change: Change; baseRuleVersionHint: number; baseCycleSeqHint: number };

export interface SavePlan {
  steps: SaveStep[];
  needsAsk: boolean;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function planSave(task: Task, changes: TaskChanges, caller: Caller): SavePlan {
  const steps: SaveStep[] = [];

  const edit: Extract<SaveStep, { kind: 'edit' }> = { kind: 'edit', taskId: task.id };
  if (changes.title !== undefined && changes.title !== task.title) edit.title = changes.title;
  if (changes.notes !== undefined && changes.notes !== (task.notes ?? '')) edit.notes = changes.notes;
  if (changes.checklist !== undefined && !same(changes.checklist, task.checklist)) edit.checklist = changes.checklist;
  if (edit.title !== undefined || edit.notes !== undefined || edit.checklist !== undefined) steps.push(edit);

  const direct: TaskChanges = {};
  const ask: TaskChanges = {};
  if (changes.assignee !== undefined && changes.assignee !== task.assignee) {
    (needsProposal('assignee', task, caller, { assignee: changes.assignee }) ? ask : direct).assignee = changes.assignee;
  }
  const repeatChanged = changes.repeat !== undefined && !same(changes.repeat, task.repeat);
  const dueChanged = changes.dueOn !== undefined && (repeatChanged || changes.dueOn !== task.dueOn);
  if (repeatChanged || dueChanged) {
    const target = needsProposal('schedule', task, caller) ? ask : direct;
    if (repeatChanged) target.repeat = changes.repeat;
    if (dueChanged) target.dueOn = changes.dueOn;
  }

  if (Object.keys(direct).length > 0) steps.push({ kind: 'schedule', taskId: task.id, ...direct });
  if (Object.keys(ask).length > 0) {
    steps.push({
      kind: 'propose', id: crypto.randomUUID(), taskId: task.id, change: { kind: 'edit', set: ask },
      baseRuleVersionHint: task.ruleVersion, baseCycleSeqHint: task.cycleSeq,
    });
  }
  return { steps, needsAsk: Object.keys(ask).length > 0 };
}
