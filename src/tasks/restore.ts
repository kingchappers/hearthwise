import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import type { HouseholdContext } from '../household/types';
import { ConditionFailedError } from '../store';
import type { Store } from '../store';
import { itemKey, taskKey } from './keys';
import { needsProposal, otherMemberId } from './ownership';
import { restoreChange, toTask } from './record';

export type RestoreStatus = 'restored' | 'noop' | 'proposal_required' | 'invalid' | 'not_found';

export interface RestoreResult {
  id: string;
  status: RestoreStatus;
  // Who to ask, when the task is theirs and a restore needs a proposal.
  toUserId?: string;
}

// Either member may restore any shopping item. The update applies only to the deletion it saw, so restoring twice does nothing.
async function restoreItem(store: Store, householdId: string, id: string, nowMs: number): Promise<RestoreStatus> {
  const item = await store.get(itemKey(householdId, id), { consistent: true });
  if (!item) return 'not_found';
  if (item.deletedAt === undefined) return 'noop';
  try {
    await store.transact([{
      update: itemKey(householdId, id),
      set: { updatedAt: Math.max(nowMs, Number(item.updatedAt) + 1) },
      remove: ['deletedAt', 'deletedBy', 'expiresAt'],
      ifEquals: { deletedAt: item.deletedAt },
    }]);
    return 'restored';
  } catch (error) {
    if (!(error instanceof ConditionFailedError)) throw error;
    return 'noop';
  }
}

// Each entry is its own transaction, applied only to the deletion it saw, so restoring twice does nothing and a restore can never
// undo a later delete. One write record holds all the results, so a retried batch answers the same.
export async function restoreEntries(
  store: Store, ctx: HouseholdContext, input: { entries: { kind: 'task' | 'item'; id: string }[]; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ results: RestoreResult[] }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ results: RestoreResult[] }>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  const results: RestoreResult[] = [];
  for (const entry of input.entries) {
    if (entry.kind === 'item') {
      results.push({ id: entry.id, status: await restoreItem(store, householdId, entry.id, nowMs) });
      continue;
    }
    const item = await store.get(taskKey(householdId, entry.id), { consistent: true });
    if (!item) {
      results.push({ id: entry.id, status: 'not_found' });
    } else if (item.deletedAt === undefined) {
      results.push({ id: entry.id, status: 'noop' });
    } else if (needsProposal('restore', toTask(item), ctx)) {
      results.push({ id: entry.id, status: 'proposal_required', toUserId: otherMemberId(ctx) });
    } else {
      const { set, remove } = restoreChange(item, nowMs);
      try {
        await store.transact([{ update: taskKey(householdId, entry.id), set, remove, ifEquals: { deletedAt: item.deletedAt } }]);
        results.push({ id: entry.id, status: 'restored' });
      } catch (error) {
        if (!(error instanceof ConditionFailedError)) throw error;
        // Restored (or deleted again) since it was read: it is not the deletion this entry saw.
        results.push({ id: entry.id, status: 'noop' });
      }
    }
  }
  return withWriteRecord(store, householdId, input.mutationId, [], { results }, Math.floor(nowMs / 1000));
}
