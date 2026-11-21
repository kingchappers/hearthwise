import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import type { HouseholdContext } from '../household/types';
import { holderOf } from '../shared/projectRules';
import { ConditionFailedError } from '../store';
import type { Item, Key, Store, TxOp } from '../store';
import { TaskError } from '../tasks/types';
import { projectKey, stepKey } from './keys';
import { logProjectTake } from './log';
import type { TakeOutcome } from './log';
import { toProject, toStep } from './records';
import { liveParent } from './steps';
import type { Project, Step } from './types';

// Who holds a step or a project is decided here and nowhere else. First to reach the server holds it, and every answer is a 200
// with an outcome: a 4xx would be final in the app's retry rules, and the overlay would go on showing a hold that never was.
export type HoldTarget = { kind: 'project'; id: string } | { kind: 'step'; projectId: string; id: string };

export interface HoldAnswer {
  project?: Project;
  step?: Step;
  outcome: TakeOutcome;
}

const MAX_ATTEMPTS = 5;
const lostRace = (error: unknown): boolean => error instanceof ConditionFailedError && error.failedIndex === 0;

const keyOf = (householdId: string, target: HoldTarget): Key =>
  (target.kind === 'project' ? projectKey(householdId, target.id) : stepKey(householdId, target.projectId, target.id));

const recordOf = (target: HoldTarget, raw: Item): Omit<HoldAnswer, 'outcome'> => (target.kind === 'project' ? { project: toProject(raw) } : { step: toStep(raw) });

async function answer(
  store: Store, ctx: HouseholdContext, target: HoldTarget, mutationId: string, nowMs: number, ops: TxOp[], result: HoldAnswer,
): Promise<WriteOutcome<HoldAnswer>> {
  const done = await withWriteRecord(store, ctx.householdId, mutationId, ops, result, Math.floor(nowMs / 1000));
  if (done.fresh) logProjectTake(ctx.householdId, target.kind, result.outcome);
  return done;
}

// What a take or release finds: the stored record, or the outcome that says it is not there. A project that never existed is a 404.
async function find(store: Store, ctx: HouseholdContext, target: HoldTarget): Promise<{ raw: Item } | { gone: true }> {
  if (target.kind === 'step' && !(await liveParent(store, ctx.householdId, target.projectId))) return { gone: true };
  const raw = await store.get(keyOf(ctx.householdId, target), { consistent: true });
  if (!raw) {
    if (target.kind === 'project') throw new TaskError('not_found', 404);
    return { gone: true };
  }
  return raw.deletedAt === undefined ? { raw } : { gone: true };
}

export async function takeRecord(
  store: Store, ctx: HouseholdContext, target: HoldTarget, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<HoldAnswer>> {
  const replayed = await replayOf<HoldAnswer>(store, ctx.householdId, input.mutationId);
  if (replayed) return replayed;
  const key = keyOf(ctx.householdId, target);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const found = await find(store, ctx, target);
    if ('gone' in found) return answer(store, ctx, target, input.mutationId, nowMs, [], { outcome: 'gone' });
    const { raw } = found;
    if (target.kind === 'step' && raw.state === 'done') return answer(store, ctx, target, input.mutationId, nowMs, [], { ...recordOf(target, raw), outcome: 'done' });

    const holder = holderOf({ takenBy: raw.takenBy as string | undefined }, ctx.members);
    if (holder === ctx.userId) return answer(store, ctx, target, input.mutationId, nowMs, [], { ...recordOf(target, raw), outcome: 'already_yours' });
    if (holder !== undefined) return answer(store, ctx, target, input.mutationId, nowMs, [], { ...recordOf(target, raw), outcome: 'held_by_other' });

    // Free, or held by someone who has left: the update applies only while the hold is still what was read.
    const op: TxOp = {
      update: key,
      set: { takenBy: ctx.userId, takenAt: nowMs },
      ifMissing: raw.takenBy === undefined ? ['takenBy', 'deletedAt'] : ['deletedAt'],
      ifEquals: {
        ...(raw.takenBy === undefined ? {} : { takenBy: raw.takenBy }),
        ...(target.kind === 'step' ? { state: 'todo' } : {}),
      },
    };
    const taken = recordOf(target, { ...raw, takenBy: ctx.userId, takenAt: nowMs });
    try {
      return await answer(store, ctx, target, input.mutationId, nowMs, [op], { ...taken, outcome: 'taken' });
    } catch (error) {
      if (lostRace(error)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

export async function releaseRecord(
  store: Store, ctx: HouseholdContext, target: HoldTarget, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<HoldAnswer>> {
  const replayed = await replayOf<HoldAnswer>(store, ctx.householdId, input.mutationId);
  if (replayed) return replayed;
  const key = keyOf(ctx.householdId, target);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const found = await find(store, ctx, target);
    if ('gone' in found) return answer(store, ctx, target, input.mutationId, nowMs, [], { outcome: 'gone' });
    const { raw } = found;
    // Either person may release, including a hold left by someone who has gone. A release of nothing is `not_held`.
    if (raw.takenBy === undefined) return answer(store, ctx, target, input.mutationId, nowMs, [], { ...recordOf(target, raw), outcome: 'not_held' });

    const op: TxOp = { update: key, remove: ['takenBy', 'takenAt'], ifEquals: { takenBy: raw.takenBy }, ifMissing: ['deletedAt'] };
    const { takenBy: _by, takenAt: _at, ...free } = raw;
    try {
      return await answer(store, ctx, target, input.mutationId, nowMs, [op], { ...recordOf(target, free as Item), outcome: 'released' });
    } catch (error) {
      if (lostRace(error)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}
