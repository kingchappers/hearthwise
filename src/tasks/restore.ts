import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import type { HouseholdContext } from '../household/types';
import { ConditionFailedError } from '../store';
import type { Key, Store } from '../store';
import { restoreEventEntry } from '../calendar/events';
import type { EventRestoreBatch } from '../calendar/events';
import { restoreMoneyEntry } from '../money/entries';
import type { RestoreBatch } from '../money/entries';
import { recipeKey } from '../meals/keys';
import type { RestoreEntry } from '../shared/taskValidation';
import { countLiveRecipes, RECIPE_LIMIT } from '../meals/recipes';
import { itemKey, taskKey } from './keys';
import { needsProposal, otherMemberId } from './ownership';
import { restoreChange, toTask } from './record';

export type RestoreStatus = 'restored' | 'noop' | 'proposal_required' | 'invalid' | 'not_found' | 'recipe_limit' | 'needs_two' | 'pair_changed' | 'money_limit' | 'entry_changed' | 'event_limit';

export interface RestoreResult {
  id: string;
  status: RestoreStatus;
  // Who to ask, when the task is theirs and a restore needs a proposal.
  toUserId?: string;
}

// Either member may restore any shopping item or recipe. The update applies only to the deletion it saw, so restoring twice does nothing.
async function restoreRecord(store: Store, key: Key, nowMs: number): Promise<RestoreStatus> {
  const item = await store.get(key, { consistent: true });
  if (!item) return 'not_found';
  if (item.deletedAt === undefined) return 'noop';
  try {
    await store.transact([{
      update: key,
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
  store: Store, ctx: HouseholdContext, input: { entries: RestoreEntry[]; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ results: RestoreResult[] }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ results: RestoreResult[] }>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  const results: RestoreResult[] = [];
  let liveRecipes: number | undefined;
  const moneyBatch: RestoreBatch = {};
  const eventBatch: EventRestoreBatch = {};
  for (const entry of input.entries) {
    if (entry.kind === 'money') {
      results.push({ id: entry.id, status: await restoreMoneyEntry(store, ctx, entry, moneyBatch, nowMs) });
      continue;
    }
    if (entry.kind === 'event') {
      results.push({ id: entry.id, status: await restoreEventEntry(store, ctx, entry, eventBatch, nowMs) });
      continue;
    }
    if (entry.kind === 'item') {
      results.push({ id: entry.id, status: await restoreRecord(store, itemKey(householdId, entry.id), nowMs) });
      continue;
    }
    if (entry.kind === 'recipe') {
      // A restore makes a recipe live, so it is held to the same 200 as a create, counting the restores made earlier in this batch.
      liveRecipes ??= await countLiveRecipes(store, householdId);
      if (liveRecipes >= RECIPE_LIMIT) {
        results.push({ id: entry.id, status: 'recipe_limit' });
        continue;
      }
      const status = await restoreRecord(store, recipeKey(householdId, entry.id), nowMs);
      if (status === 'restored') liveRecipes += 1;
      results.push({ id: entry.id, status });
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
