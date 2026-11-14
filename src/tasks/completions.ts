import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import type { HouseholdContext } from '../household/types';
import { dayInZone, nextDueOn } from '../shared/schedule';
import { ConditionFailedError } from '../store';
import type { Item, Store, TxOp } from '../store';
import { doneKey, taskKey } from './keys';
import { applyChange, clampTime, THIRTY_DAYS_SECONDS, toTask } from './record';
import { TaskError } from './types';
import type { Task } from './types';

const MAX_ATTEMPTS = 3;
const FOUR_HUNDRED_DAYS_SECONDS = 400 * 24 * 60 * 60;
const BY = 'by_';

export interface CompleteResult {
  task: Task;
  // The cycle that was completed, which the undo toast needs.
  cycleSeq: number;
}

const conflict = (extra: Record<string, unknown> = {}): TaskError => new TaskError('conflict', 409, extra);
const forward = (item: Item, nowMs: number): number => Math.max(nowMs, Number(item.updatedAt) + 1);

async function loadLive(store: Store, householdId: string, taskId: string): Promise<Item> {
  const item = await store.get(taskKey(householdId, taskId), { consistent: true });
  if (!item) throw new TaskError('not_found', 404);
  if (item.deletedAt !== undefined) throw new TaskError('gone', 410);
  return item;
}

// A write that lost a race to another write rethrows a failed condition. Those mean "read again and re-apply"; anything else is real.
const lostRace = (error: unknown): boolean => error instanceof ConditionFailedError;

// The cycle was already completed by someone. This person's tap is recorded beside theirs, and the date does not move again.
// The task's token is touched too, so an undo that read the record before this landed cannot also delete it (a delete cannot
// carry a condition on the record itself).
async function alsoDid(
  store: Store, ctx: HouseholdContext, item: Item, done: Item, cycleSeq: number, input: { completedAt: number; mutationId: string }, nowMs: number,
): Promise<WriteOutcome<CompleteResult> | undefined> {
  const mine = `${BY}${ctx.userId}`;
  const nowSeconds = Math.floor(nowMs / 1000);
  if (done[mine] !== undefined) {
    return withWriteRecord(store, ctx.householdId, input.mutationId, [], { task: toTask(item), cycleSeq }, nowSeconds);
  }
  const touch = { updatedAt: forward(item, nowMs) };
  const ops: TxOp[] = [
    { update: doneKey(ctx.householdId, toTask(item).id, cycleSeq), set: { [mine]: input.completedAt }, ifMissing: [mine] },
    { update: taskKey(ctx.householdId, toTask(item).id), set: touch, ifEquals: { updatedAt: item.updatedAt }, ifMissing: ['deletedAt'] },
  ];
  try {
    return await withWriteRecord(store, ctx.householdId, input.mutationId, ops, { task: toTask(applyChange(item, touch)), cycleSeq }, nowSeconds);
  } catch (error) {
    if (lostRace(error)) return undefined;
    throw error;
  }
}

async function completeCurrent(
  store: Store, ctx: HouseholdContext, item: Item, input: { completedAt: number; mutationId: string }, nowMs: number,
): Promise<WriteOutcome<CompleteResult> | undefined> {
  const task = toTask(item);
  const cycle = task.cycleSeq;
  const nowSeconds = Math.floor(nowMs / 1000);
  const isTodo = task.repeat.type === 'none';
  const day = dayInZone(input.completedAt, ctx.household.timezone);
  const next = isTodo ? null : nextDueOn(task.repeat, task.dueOn, day);

  const done: Item = {
    ...doneKey(ctx.householdId, task.id, cycle),
    [`${BY}${ctx.userId}`]: input.completedAt,
    checklistState: structuredClone(task.checklistState),
    expiresAt: nowSeconds + FOUR_HUNDRED_DAYS_SECONDS,
  };
  if (task.dueOn !== undefined) done.cycleDueOn = task.dueOn;
  // A both task in a one-member household is just an either task.
  if (task.assignee === 'both' && ctx.members.length > 1) done.together = true;
  if (task.overrideAssignee !== undefined) {
    done.clearedOverride = task.overrideCycle === undefined
      ? { overrideAssignee: task.overrideAssignee }
      : { overrideAssignee: task.overrideAssignee, overrideCycle: task.overrideCycle };
  }
  if (next !== null) done.setDueOn = next;

  const set: Record<string, unknown> = { cycleSeq: cycle + 1, checklistState: {}, updatedAt: forward(item, nowMs) };
  if (isTodo) {
    set.status = 'done';
    set.doneAt = input.completedAt;
    set.expiresAt = Math.floor(input.completedAt / 1000) + THIRTY_DAYS_SECONDS;
  } else if (next !== null) {
    set.dueOn = next;
  }
  const remove = (['overrideAssignee', 'overrideCycle'] as const).filter(name => item[name] !== undefined);

  const ops: TxOp[] = [
    { put: done, ifAbsent: true },
    { update: taskKey(ctx.householdId, task.id), set, remove, ifEquals: { cycleSeq: cycle, updatedAt: item.updatedAt }, ifMissing: ['deletedAt'] },
  ];
  try {
    return await withWriteRecord(store, ctx.householdId, input.mutationId, ops, { task: toTask(applyChange(item, set, remove)), cycleSeq: cycle }, nowSeconds);
  } catch (error) {
    if (lostRace(error)) return undefined;
    throw error;
  }
}

export async function completeCycle(
  store: Store, ctx: HouseholdContext, taskId: string, input: { cycleSeq: number; completedAt: number; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<CompleteResult>> {
  const replayed = await replayOf<CompleteResult>(store, ctx.householdId, input.mutationId);
  if (replayed) return replayed;
  const completedAt = clampTime(input.completedAt, nowMs);
  const stamped = { completedAt, mutationId: input.mutationId };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const item = await loadLive(store, ctx.householdId, taskId);
    const task = toTask(item);

    if (input.cycleSeq <= task.cycleSeq) {
      const done = await store.get(doneKey(ctx.householdId, taskId, input.cycleSeq), { consistent: true });
      if (done) {
        const outcome = await alsoDid(store, ctx, item, done, input.cycleSeq, stamped, nowMs);
        if (outcome) return outcome;
        continue;
      }
      // The phone's copy is out of date: it should refresh and show the person what changed.
      if (input.cycleSeq < task.cycleSeq) throw conflict({ task });
    }
    // The current cycle, or (a higher number) one the phone saw before it was undone: either way the person did the chore.
    const outcome = await completeCurrent(store, ctx, item, stamped, nowMs);
    if (outcome) return outcome;
  }
  throw conflict();
}

export async function undoCompletion(
  store: Store, ctx: HouseholdContext, taskId: string, cycleSeq: number, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ task: Task }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ task: Task }>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const nowSeconds = Math.floor(nowMs / 1000);
  const mine = `${BY}${ctx.userId}`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const item = await loadLive(store, householdId, taskId);
    const task = toTask(item);
    const done = await store.get(doneKey(householdId, taskId, cycleSeq), { consistent: true });

    // Nothing of the caller's to take back (a retried undo, or someone else's completion).
    if (!done || done[mine] === undefined) {
      return withWriteRecord(store, householdId, input.mutationId, [], { task }, nowSeconds);
    }

    const othersDidIt = Object.keys(done).some(name => name.startsWith(BY) && name !== mine);
    let ops: TxOp[];
    let next = item;

    if (othersDidIt) {
      // The chore was done, so the cycle stays done and the date stays put: only the caller's own mark goes.
      ops = [{ update: doneKey(householdId, taskId, cycleSeq), remove: [mine], ifEquals: { [mine]: done[mine] } }];
    } else {
      const isTodo = task.repeat.type === 'none';
      const asCompletionLeftIt = isTodo ? task.status === 'done' : task.dueOn === done.setDueOn;
      // Only while the task is still as the completion left it, and no swap was agreed for the cycle after it.
      if (task.cycleSeq !== cycleSeq + 1 || !asCompletionLeftIt) throw conflict({ task });
      if (task.overrideCycle !== undefined && task.overrideCycle === task.cycleSeq) throw conflict({ task });

      const set: Record<string, unknown> = {
        cycleSeq,
        checklistState: structuredClone((done.checklistState as Task['checklistState'] | undefined) ?? {}),
        updatedAt: forward(item, nowMs),
      };
      const remove: string[] = [];
      if (done.cycleDueOn !== undefined) set.dueOn = done.cycleDueOn;
      const cleared = done.clearedOverride as { overrideAssignee: string; overrideCycle?: number } | undefined;
      if (cleared) {
        set.overrideAssignee = cleared.overrideAssignee;
        if (cleared.overrideCycle !== undefined) set.overrideCycle = cleared.overrideCycle;
      }
      if (isTodo) {
        set.status = 'open';
        remove.push('doneAt', 'expiresAt');
      }
      ops = [
        { update: taskKey(householdId, taskId), set, remove, ifEquals: { cycleSeq: cycleSeq + 1, updatedAt: item.updatedAt }, ifMissing: ['deletedAt'] },
        { delete: doneKey(householdId, taskId, cycleSeq), ifPresent: true },
      ];
      next = applyChange(item, set, remove);
    }

    try {
      return await withWriteRecord(store, householdId, input.mutationId, ops, { task: toTask(next) }, nowSeconds);
    } catch (error) {
      if (lostRace(error)) continue;
      throw error;
    }
  }
  throw conflict();
}
