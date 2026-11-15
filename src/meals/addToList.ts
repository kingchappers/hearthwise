import { withWriteRecord, replayOf } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import type { HouseholdContext } from '../household/types';
import type { AddDay, AddLine } from '../shared/mealValidation';
import { writeEntry } from '../shopping/items';
import type { ItemWrite } from '../shopping/types';
import { ConditionFailedError } from '../store';
import type { Store } from '../store';
import { clampTime } from '../tasks/record';
import { sameMeal } from './applyPlan';
import { planKey } from './keys';
import { toPlanDay } from './plan';

export interface AddToListInput {
  days: AddDay[];
  lines: AddLine[];
  mutationId: string;
  clientAt?: number;
}

// Each shopping line is its own transaction on a distinct id, so ten can run at once without interacting.
const PARALLEL = 10;

function writeFor(line: AddLine, at: number): ItemWrite {
  return {
    text: { value: line.text, at },
    ...(line.quantity === undefined ? {} : { quantity: { value: line.quantity, at } }),
    ...(line.forRecipes === undefined ? {} : { forRecipes: line.forRecipes }),
  };
}

// Marks a plan day "On the list", but only if its dinner is still the one the client added: a marker is never written on a dinner that
// was not the one added. A missing or expired day, a different dinner and a lost race are all skipped, not errors.
async function markDay(store: Store, ctx: HouseholdContext, day: AddDay, nowMs: number): Promise<boolean> {
  const raw = await store.get(planKey(ctx.householdId, day.day), { consistent: true });
  if (!raw) return false;
  const existing = toPlanDay(raw);
  if (existing.expiresAt * 1000 <= nowMs) return false;
  const { day: _day, ...listed } = day;
  if (!sameMeal(existing.meal, listed)) return false;
  try {
    await store.transact([{
      update: planKey(ctx.householdId, day.day),
      set: { addedAt: nowMs, addedBy: ctx.userId, updatedAt: Math.max(nowMs, existing.updatedAt + 1) },
      ifEquals: { updatedAt: raw.updatedAt },
    }]);
    return true;
  } catch (error) {
    if (!(error instanceof ConditionFailedError)) throw error;
    return false;
  }
}

// Adds the review's shopping lines to the list and marks the days that were added. It is not one transaction, so a crash can leave
// some lines created and no record; a retry finds them as no-ops, creates the rest, sets the markers again (harmless) and writes the
// record. Two runs at once are safe to repeat for the same reason: the lines they create have the same ids.
export async function addPlanToList(
  store: Store, ctx: HouseholdContext, input: AddToListInput, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ results: { id: string; status: string }[] }>> {
  const replayed = await replayOf<{ results: { id: string; status: string }[] }>(store, ctx.householdId, input.mutationId);
  if (replayed) return replayed;

  const at = clampTime(input.clientAt ?? nowMs, nowMs);
  const results: { id: string; status: string }[] = [];
  for (let start = 0; start < input.lines.length; start += PARALLEL) {
    const batch = input.lines.slice(start, start + PARALLEL);
    const statuses = await Promise.all(batch.map(line => writeEntry(store, ctx, { id: line.id, write: writeFor(line, at) }, nowMs)));
    batch.forEach((line, index) => results.push({ id: line.id, status: statuses[index] }));
  }

  let marked = 0;
  for (const day of input.days) if (await markDay(store, ctx, day, nowMs)) marked += 1;

  const outcome = await withWriteRecord(store, ctx.householdId, input.mutationId, [], { results }, Math.floor(nowMs / 1000));
  // One line for each add, with counts only: never the text of a recipe or a shopping line.
  if (outcome.fresh) {
    console.log(JSON.stringify({
      event: 'plan_add', householdId: ctx.householdId, mutationId: input.mutationId, days: input.days.length, lines: input.lines.length,
      created: results.filter(entry => entry.status === 'created').length, skipped: input.days.length - marked,
    }));
  }
  return outcome;
}
