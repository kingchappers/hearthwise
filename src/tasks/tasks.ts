import type { HouseholdContext } from '../household/types';
import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { dayInZone, firstOnOrAfter } from '../shared/schedule';
import { ConditionFailedError } from '../store';
import type { Item, Store, TxOp } from '../store';
import { hhPk } from '../household/keys';
import { taskKey, TASK_PREFIX } from './keys';
import { applyChange, clampTime, DAY_MS, THIRTY_DAYS_SECONDS, toTask } from './record';
import { TaskError } from './types';
import type { CreateTaskInput, PatchTaskInput, Task } from './types';

export { TaskError } from './types';

// A write that loses a race to another write to the same task is read again and re-applied, this many times.
const MAX_ATTEMPTS = 3;
const SEVEN_DAYS_MS = 7 * DAY_MS;
const THIRTY_DAYS_MS = 30 * DAY_MS;

async function loadItem(store: Store, householdId: string, taskId: string): Promise<Item> {
  const item = await store.get(taskKey(householdId, taskId), { consistent: true });
  if (!item) throw new TaskError('not_found', 404);
  return item;
}

async function loadLiveItem(store: Store, householdId: string, taskId: string): Promise<Item> {
  const item = await loadItem(store, householdId, taskId);
  // A tombstone is final for edits: only a restore brings the task back.
  if (item.deletedAt !== undefined) throw new TaskError('gone', 410);
  return item;
}

export async function createTask(store: Store, ctx: HouseholdContext, input: CreateTaskInput, nowMs: number = Date.now()): Promise<WriteOutcome<{ task: Task }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ task: Task }>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  // The same task id again is a replay of this create, by another route: the task is already there, unchanged.
  const existing = await store.get(taskKey(householdId, input.id), { consistent: true });
  if (existing) return { fresh: false, result: { task: toTask(existing) } };

  const at = clampTime(input.clientAt ?? nowMs, nowMs);
  const today = dayInZone(nowMs, ctx.household.timezone);
  const dueOn = input.dueOn ?? (input.repeat.type === 'none' ? undefined : firstOnOrAfter(input.repeat, today));
  const fieldTimes: Task['fieldTimes'] = { title: at };
  if (input.notes !== undefined) fieldTimes.notes = at;
  if (input.checklist !== undefined) fieldTimes.checklist = at;

  const item: Item = {
    ...taskKey(householdId, input.id),
    title: input.title,
    fieldTimes,
    assignee: input.assignee,
    repeat: input.repeat,
    cycleSeq: 1,
    ruleVersion: 1,
    checklist: input.checklist ?? [],
    checklistState: {},
    status: 'open',
    createdBy: ctx.userId,
    updatedAt: nowMs,
  };
  if (input.notes !== undefined) item.notes = input.notes;
  if (dueOn !== undefined) item.dueOn = dueOn;

  try {
    return await withWriteRecord(store, householdId, input.mutationId, [{ put: item, ifAbsent: true }], { task: toTask(item) }, Math.floor(nowMs / 1000));
  } catch (error) {
    if (!(error instanceof ConditionFailedError) || error.failedIndex !== 0) throw error;
    // Another request made this task in the meantime.
    return { fresh: false, result: { task: toTask(await loadItem(store, householdId, input.id)) } };
  }
}

interface Change {
  set: Record<string, unknown>;
  remove: string[];
}

function conflict(): TaskError {
  return new TaskError('conflict', 409);
}

// What a patch changes, as an update. Undefined when there is nothing to change (a replayed old edit, a tick from an earlier cycle).
function planPatch(task: Task, input: PatchTaskInput, nowMs: number, today: string): Change | undefined {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];

  const fieldTimes = { ...task.fieldTimes };
  let timesChanged = false;
  for (const field of ['title', 'notes', 'checklist'] as const) {
    const edit = input[field];
    if (!edit) continue;
    const at = clampTime(edit.at, nowMs);
    if (at <= (task.fieldTimes[field] ?? 0)) continue;
    set[field] = edit.value;
    fieldTimes[field] = at;
    timesChanged = true;
  }
  if (timesChanged) set.fieldTimes = fieldTimes;

  // A tick belongs to the cycle it was made in. One from an earlier cycle is dropped, so it cannot tick the next one.
  if (input.ticks && input.ticks.cycleSeq === task.cycleSeq && task.status === 'open') {
    const known = new Set(((set.checklist as Task['checklist'] | undefined) ?? task.checklist).map(step => step.id));
    const state = { ...task.checklistState };
    let ticked = false;
    for (const [stepId, tick] of Object.entries(input.ticks.steps)) {
      if (!known.has(stepId)) continue;
      const at = clampTime(tick.at, nowMs);
      if (at <= (state[stepId]?.at ?? 0)) continue;
      state[stepId] = { done: tick.done, at };
      ticked = true;
    }
    if (ticked) set.checklistState = state;
  }

  let ruleChanged = false;
  if (input.assignee) {
    if (input.assignee.baseRuleVersion !== task.ruleVersion) throw conflict();
    if (input.assignee.value !== task.assignee) {
      set.assignee = input.assignee.value;
      ruleChanged = true;
    }
  }
  if (input.repeat) {
    if (input.repeat.baseRuleVersion !== task.ruleVersion) throw conflict();
    const rule = input.repeat.value;
    const suggested = input.repeat.dueOn;
    // The suggestion is used if it is today or later; otherwise the rule's first date from today, so a completion that landed
    // meanwhile cannot make the change fail.
    let dueOn: string | undefined;
    if (rule.type === 'none') dueOn = suggested ?? task.dueOn;
    else dueOn = suggested !== undefined && suggested >= today ? suggested : firstOnOrAfter(rule, today);
    set.repeat = rule;
    if (dueOn !== undefined) set.dueOn = dueOn;
    // A swap belongs to one cycle of the old rule.
    if (task.overrideAssignee !== undefined) remove.push('overrideAssignee');
    if (task.overrideCycle !== undefined) remove.push('overrideCycle');
    ruleChanged = true;
  } else if (input.dueOn) {
    if (input.dueOn.baseRuleVersion !== task.ruleVersion || input.dueOn.baseCycleSeq !== task.cycleSeq) throw conflict();
    set.dueOn = input.dueOn.value;
  }
  if (ruleChanged) set.ruleVersion = task.ruleVersion + 1;

  return Object.keys(set).length === 0 && remove.length === 0 ? undefined : { set, remove };
}

export async function patchTask(store: Store, ctx: HouseholdContext, taskId: string, input: PatchTaskInput, nowMs: number = Date.now()): Promise<WriteOutcome<{ task: Task }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ task: Task }>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const today = dayInZone(nowMs, ctx.household.timezone);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const item = await loadLiveItem(store, householdId, taskId);
    const change = planPatch(toTask(item), input, nowMs, today);

    const ops: TxOp[] = [];
    let next = item;
    if (change) {
      // Always moves forward, so a second write in the same millisecond still changes the token the next write checks.
      const set = { ...change.set, updatedAt: Math.max(nowMs, Number(item.updatedAt) + 1) };
      ops.push({ update: taskKey(householdId, taskId), set, remove: change.remove, ifEquals: { updatedAt: item.updatedAt }, ifMissing: ['deletedAt'] });
      next = applyChange(item, set, change.remove);
    }
    try {
      return await withWriteRecord(store, householdId, input.mutationId, ops, { task: toTask(next) }, Math.floor(nowMs / 1000));
    } catch (error) {
      if (error instanceof ConditionFailedError && ops.length > 0 && error.failedIndex === 0) continue;
      throw error;
    }
  }
  throw conflict();
}

export async function deleteTask(
  store: Store, ctx: HouseholdContext, taskId: string, input: { baseRuleVersion: number; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ task: Task }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ task: Task }>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const item = await loadItem(store, householdId, taskId);
    // Deleting a tombstone again does nothing.
    if (item.deletedAt !== undefined) {
      return withWriteRecord(store, householdId, input.mutationId, [], { task: toTask(item) }, Math.floor(nowMs / 1000));
    }
    // The version the phone saw must still be current, so a delete cannot cross a restore or a change of assignee.
    if (Number(item.ruleVersion) !== input.baseRuleVersion) throw conflict();

    const set = {
      deletedAt: nowMs,
      deletedBy: ctx.userId,
      expiresAt: Math.floor(nowMs / 1000) + THIRTY_DAYS_SECONDS,
      ruleVersion: input.baseRuleVersion + 1,
      updatedAt: Math.max(nowMs, Number(item.updatedAt) + 1),
    };
    const op: TxOp = { update: taskKey(householdId, taskId), set, ifEquals: { ruleVersion: input.baseRuleVersion }, ifMissing: ['deletedAt'] };
    try {
      return await withWriteRecord(store, householdId, input.mutationId, [op], { task: toTask(applyChange(item, set)) }, Math.floor(nowMs / 1000));
    } catch (error) {
      if (error instanceof ConditionFailedError && error.failedIndex === 0) continue;
      throw error;
    }
  }
  throw conflict();
}

// Open tasks, tombstones from the last 30 days (so clients can drop them), and to-dos done in the last 7 days.
export async function listTasks(store: Store, ctx: HouseholdContext, nowMs: number = Date.now()): Promise<{ tasks: Task[]; serverTime: number }> {
  const items = await store.query(hhPk(ctx.householdId), { skPrefix: TASK_PREFIX });
  const tasks = items.map(toTask).filter(task => {
    if (task.deletedAt !== undefined) return task.deletedAt >= nowMs - THIRTY_DAYS_MS;
    if (task.status === 'done') return task.doneAt !== undefined && task.doneAt >= nowMs - SEVEN_DAYS_MS;
    return true;
  });
  tasks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { tasks, serverTime: nowMs };
}
