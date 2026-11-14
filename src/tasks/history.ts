import type { HouseholdContext } from '../household/types';
import type { Store } from '../store';
import { doneTaskPrefix, editTaskPrefix, taskKey } from './keys';
import { TaskError } from './types';

export interface CompletionHistory {
  cycleSeq: number;
  cycleDueOn?: string;
  // Everyone who did that cycle, earliest first.
  by: { userId: string; at: number }[];
  together: boolean;
}

export interface EditHistory {
  byUserId: string;
  fields: string[];
  at: number;
}

const BY = 'by_';

// Completions (newest cycle first, everyone who did each) and the other member's direct edits (newest first).
export async function taskHistory(store: Store, ctx: HouseholdContext, taskId: string): Promise<{ completions: CompletionHistory[]; edits: EditHistory[] }> {
  if (!(await store.get(taskKey(ctx.householdId, taskId)))) throw new TaskError('not_found', 404);

  const donePrefix = doneTaskPrefix(taskId);
  const [dones, edits] = await Promise.all([
    store.query(`HH#${ctx.householdId}`, { skPrefix: donePrefix }),
    store.query(`HH#${ctx.householdId}`, { skPrefix: editTaskPrefix(taskId) }),
  ]);

  const completions = dones.map((done): CompletionHistory => {
    const by = Object.keys(done)
      .filter(name => name.startsWith(BY))
      .map(name => ({ userId: name.slice(BY.length), at: Number(done[name]) }))
      .sort((a, b) => a.at - b.at);
    const completion: CompletionHistory = { cycleSeq: Number(done.SK.slice(donePrefix.length)), by, together: done.together === true };
    if (typeof done.cycleDueOn === 'string') completion.cycleDueOn = done.cycleDueOn;
    return completion;
  }).sort((a, b) => b.cycleSeq - a.cycleSeq);

  const editsNewestFirst = edits
    .map((edit): EditHistory => ({ byUserId: String(edit.byUserId), fields: edit.fields as string[], at: Number(edit.SK.slice(editTaskPrefix(taskId).length)) }))
    .sort((a, b) => b.at - a.at);

  return { completions, edits: editsNewestFirst };
}
