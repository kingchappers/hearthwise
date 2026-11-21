import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import type { HouseholdContext } from '../household/types';
import { MAX_FOR_RECIPES_LENGTH } from '../shared/mealValidation';
import { writeEntry } from '../shopping/items';
import { itemKey } from '../tasks/keys';
import type { Store } from '../store';
import { clampTime } from '../tasks/record';
import { materialKey, projectKey } from './keys';
import { logProjectMaterials } from './log';
import { toMaterial, toProject } from './records';
import { TaskError } from '../tasks/types';

// Each line is its own transaction on a distinct shopping item id (the material's own id), so ten can run at once without interacting.
const PARALLEL = 10;

export type AddStatus = 'created' | 'already' | 'cleared' | 'missing';
export interface AddResults { results: { id: string; status: AddStatus }[] }

async function addOne(store: Store, ctx: HouseholdContext, projectId: string, title: string, lineId: string, at: number, nowMs: number): Promise<AddStatus> {
  const raw = await store.get(materialKey(ctx.householdId, projectId, lineId), { consistent: true });
  if (!raw) return 'missing';
  const material = toMaterial(raw);
  if (material.deletedAt !== undefined) return 'missing';
  // An item that exists is skipped, never written: a second press cannot undo an edit made to the line on the list. A deleted one (kept
  // for 30 days) is reported as cleared, and is not added again until its record has expired.
  const existing = await store.get(itemKey(ctx.householdId, lineId), { consistent: true });
  if (existing) return existing.deletedAt === undefined ? 'already' : 'cleared';
  const result = await writeEntry(store, ctx, {
    id: lineId, write: { text: { value: material.text, at }, forRecipes: Array.from(title).slice(0, MAX_FOR_RECIPES_LENGTH).join('') },
  }, nowMs);
  return result === 'created' ? 'created' : result === 'gone' ? 'cleared' : 'already';
}

// Copies the project's material lines onto the shopping list, each labelled for the project. At-least-once, like the plan's add: no
// transaction across lines, and the write record last, so a crash leaves some lines created and no record, and a retry skips those
// and creates the rest.
export async function addMaterialsToList(
  store: Store, ctx: HouseholdContext, projectId: string, input: { lineIds: string[]; mutationId: string; clientAt?: number }, nowMs: number = Date.now(),
): Promise<WriteOutcome<AddResults>> {
  const { householdId } = ctx;
  const replayed = await replayOf<AddResults>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  const rawProject = await store.get(projectKey(householdId, projectId), { consistent: true });
  if (!rawProject) throw new TaskError('not_found', 404);
  const project = toProject(rawProject);

  // A repeated id is one line.
  const ids = [...new Set(input.lineIds)];
  const at = clampTime(input.clientAt ?? nowMs, nowMs);
  const results: AddResults['results'] = [];
  for (let start = 0; start < ids.length; start += PARALLEL) {
    const batch = ids.slice(start, start + PARALLEL);
    const statuses = await Promise.all(batch.map(async (id): Promise<AddStatus> =>
      (project.deletedAt === undefined ? addOne(store, ctx, projectId, project.title, id, at, nowMs) : 'missing')));
    batch.forEach((id, index) => results.push({ id, status: statuses[index] }));
  }

  const outcome = await withWriteRecord<AddResults>(store, householdId, input.mutationId, [], { results }, Math.floor(nowMs / 1000));
  if (outcome.fresh) {
    const count = (status: AddStatus): number => results.filter(entry => entry.status === status).length;
    logProjectMaterials(householdId, { lines: ids.length, created: count('created'), already: count('already'), cleared: count('cleared') });
  }
  return outcome;
}
