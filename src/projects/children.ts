import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { ConditionFailedError } from '../store';
import type { Key, Store, TxOp } from '../store';
import { TaskError } from '../tasks/types';
import { applyProjectDelete } from './applyProject';
import { materialPrefixFor, projectKey, stepPrefixFor } from './keys';
import { logProjectWrite } from './log';
import { toProject, updateFor } from './records';
import type { ProjectAnswer } from './projects';

export const BATCH = 25;

interface Child {
  key: Key;
  deletedAt?: unknown;
  expiresAt?: unknown;
}

// Every step and material of a project, with only what the batches need.
async function childrenOf(store: Store, householdId: string, projectId: string): Promise<Child[]> {
  const options = (skPrefix: string) => ({ skPrefix, attributes: ['SK', 'deletedAt', 'expiresAt'] });
  const [steps, materials] = await Promise.all([
    store.query(hhPk(householdId), options(stepPrefixFor(projectId))),
    store.query(hhPk(householdId), options(materialPrefixFor(projectId))),
  ]);
  return [...steps, ...materials].map(row => ({ key: { PK: row.PK ?? hhPk(householdId), SK: row.SK }, deletedAt: row.deletedAt, expiresAt: row.expiresAt }));
}

async function inBatches(store: Store, ops: TxOp[]): Promise<void> {
  for (let start = 0; start < ops.length; start += BATCH) await store.transact(ops.slice(start, start + BATCH));
}

// Delete a project: the tombstone first, so everything under it is hidden at once; then the project's 30-day expiry on every live
// child, in batches; then the write record. A retry runs the same steps again, and on a project that is already deleted it carries
// on to give expiry to any child that has none, so an interrupted delete is finished by asking again.
export async function deleteProjectTree(
  store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<ProjectAnswer>> {
  const { householdId } = ctx;
  const replayed = await replayOf<ProjectAnswer>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const key = projectKey(householdId, id);

  let result: ProjectAnswer['outcome'] = 'noop';
  let raw = await store.get(key, { consistent: true });
  if (!raw) throw new TaskError('not_found', 404);
  if (raw.deletedAt === undefined) {
    const applied = applyProjectDelete(toProject(raw), ctx.userId, nowMs);
    try {
      await store.transact([updateFor(key, raw, applied.project!)]);
      result = 'applied';
    } catch (error) {
      // Edited or deleted since it was read: the read below says which.
      if (!(error instanceof ConditionFailedError)) throw error;
    }
    raw = await store.get(key, { consistent: true });
    if (!raw || raw.deletedAt === undefined) throw new TaskError('conflict', 409);
  }

  const expiresAt = Number(raw.expiresAt);
  const pending = (await childrenOf(store, householdId, id)).filter(child => child.deletedAt === undefined && child.expiresAt !== expiresAt);
  await inBatches(store, pending.map(child => ({ update: child.key, set: { expiresAt } })));

  const project = toProject(raw);
  const outcome = await withWriteRecord<ProjectAnswer>(store, householdId, input.mutationId, [], { project, outcome: result, stale: [] }, Math.floor(nowMs / 1000));
  if (outcome.fresh) logProjectWrite(householdId, 'project', 'delete', result);
  return outcome;
}

export type TreeRestoreStatus = 'restored' | 'noop' | 'not_found';

// Restore applies only to the deletion it saw. The children's expiry is removed first and the tombstone last, so a restore that stops
// part-way leaves the project deleted and the person can try again. A child with its own `deletedAt` is left alone.
export async function restoreProjectTree(
  store: Store, ctx: HouseholdContext, id: string, seenDeletedAt: number, nowMs: number = Date.now(),
): Promise<TreeRestoreStatus> {
  const { householdId } = ctx;
  const key = projectKey(householdId, id);
  const raw = await store.get(key, { consistent: true });
  if (!raw) return 'not_found';
  if (raw.deletedAt === undefined || raw.deletedAt !== seenDeletedAt) return 'noop';

  const marked = (await childrenOf(store, householdId, id)).filter(child => child.deletedAt === undefined && child.expiresAt !== undefined);
  await inBatches(store, marked.map(child => ({ update: child.key, remove: ['expiresAt'] })));
  try {
    await store.transact([{
      update: key,
      set: { updatedAt: Math.max(nowMs, Number(raw.updatedAt) + 1) },
      remove: ['deletedAt', 'deletedBy', 'expiresAt'],
      ifEquals: { deletedAt: seenDeletedAt },
    }]);
    return 'restored';
  } catch (error) {
    if (!(error instanceof ConditionFailedError)) throw error;
    return 'noop';
  }
}
