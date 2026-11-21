import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { MAX_STEPS } from '../shared/projectRules';
import { ConditionFailedError } from '../store';
import type { Store, TxOp } from '../store';
import { TaskError } from '../tasks/types';
import { applyStepDelete, applyStepWrite } from './applyStep';
import { projectKey, stepKey, stepPrefixFor } from './keys';
import { logProjectWrite } from './log';
import { holdCondition, toRecord, toStep, updateFor } from './records';
import type { ProjectOutcome, Step, StepWrite } from './types';

export const MAX_LIVE_STEPS = MAX_STEPS;
const MAX_ATTEMPTS = 3;

export interface StepAnswer {
  step?: Step;
  outcome: ProjectOutcome;
  stale: string[];
}

export async function countLiveSteps(store: Store, householdId: string, projectId: string): Promise<number> {
  const rows = await store.query(hhPk(householdId), { skPrefix: stepPrefixFor(projectId), attributes: ['SK', 'deletedAt'] });
  return rows.filter(row => row.deletedAt === undefined).length;
}

const lostRace = (error: unknown, index: number): boolean => error instanceof ConditionFailedError && error.failedIndex === index;

// Whether the project a step belongs to is live. 404 for a project id that never existed; false for one that is deleted.
export async function liveParent(store: Store, householdId: string, projectId: string): Promise<boolean> {
  const project = await store.get(projectKey(householdId, projectId), { consistent: true });
  if (!project) throw new TaskError('not_found', 404);
  return project.deletedAt === undefined;
}

// The answer for a write under a deleted project: nothing is written, and the record keeps a retry answering the same.
async function goneUnderDeletedParent(store: Store, householdId: string, mutationId: string, nowMs: number): Promise<WriteOutcome<StepAnswer>> {
  const outcome = await withWriteRecord<StepAnswer>(store, householdId, mutationId, [], { outcome: 'gone', stale: [] }, Math.floor(nowMs / 1000));
  if (outcome.fresh) logProjectWrite(householdId, 'step', 'put', 'gone');
  return outcome;
}

export async function putStep(
  store: Store, ctx: HouseholdContext, projectId: string, stepId: string, input: { write: StepWrite; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<StepAnswer>> {
  const { householdId } = ctx;
  const replayed = await replayOf<StepAnswer>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const key = stepKey(householdId, projectId, stepId);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (!(await liveParent(store, householdId, projectId))) return goneUnderDeletedParent(store, householdId, input.mutationId, nowMs);
    const raw = await store.get(key, { consistent: true });
    const existing = raw ? toStep(raw) : undefined;
    const applied = applyStepWrite(existing, { projectId, id: stepId }, input.write, ctx.userId, nowMs);
    if (!raw && applied.result === 'created' && (await countLiveSteps(store, householdId, projectId)) >= MAX_LIVE_STEPS) throw new TaskError('step_limit', 409);

    // A write to a step that is not there and is not a create has nothing to land on.
    const outcome: ProjectOutcome = !raw && applied.result === 'noop' ? 'gone' : applied.result;
    const step = applied.step ?? existing;
    const answer: StepAnswer = { ...(step ? { step } : {}), outcome, stale: applied.stale };
    let ops: TxOp[] = [];
    if (applied.result === 'created' && applied.step) ops = [{ put: toRecord(key, applied.step), ifAbsent: true }];
    // The hold is pinned too, so a take that lands between the read and this write is neither wiped by Done nor left on a done step.
    if (applied.result === 'applied' && applied.step && raw) ops = [updateFor(key, raw, applied.step, holdCondition(raw))];
    try {
      const done = await withWriteRecord(store, householdId, input.mutationId, ops, answer, Math.floor(nowMs / 1000));
      if (done.fresh) logProjectWrite(householdId, 'step', 'put', outcome);
      return done;
    } catch (error) {
      if (ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

export async function deleteStep(
  store: Store, ctx: HouseholdContext, projectId: string, stepId: string, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<StepAnswer>> {
  const { householdId } = ctx;
  const replayed = await replayOf<StepAnswer>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const key = stepKey(householdId, projectId, stepId);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (!(await liveParent(store, householdId, projectId))) return goneUnderDeletedParent(store, householdId, input.mutationId, nowMs);
    const raw = await store.get(key, { consistent: true });
    const applied = applyStepDelete(raw ? toStep(raw) : undefined, ctx.userId, nowMs);
    const outcome: ProjectOutcome = !raw ? 'gone' : applied.result;
    const answer: StepAnswer = { ...(applied.step ? { step: applied.step } : {}), outcome, stale: [] };
    const ops: TxOp[] = applied.result === 'applied' && applied.step && raw ? [updateFor(key, raw, applied.step, holdCondition(raw))] : [];
    try {
      const done = await withWriteRecord(store, householdId, input.mutationId, ops, answer, Math.floor(nowMs / 1000));
      if (done.fresh) logProjectWrite(householdId, 'step', 'delete', outcome);
      return done;
    } catch (error) {
      if (ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}
