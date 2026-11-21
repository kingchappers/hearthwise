import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { MAX_MATERIALS } from '../shared/projectRules';
import { ConditionFailedError } from '../store';
import type { Store, TxOp } from '../store';
import { TaskError } from '../tasks/types';
import { applyMaterialDelete, applyMaterialWrite } from './applyMaterial';
import { materialKey, materialPrefixFor } from './keys';
import { logProjectWrite } from './log';
import { toMaterial, toRecord, updateFor } from './records';
import { liveParent } from './steps';
import type { Material, MaterialWrite, ProjectOutcome } from './types';

export const MAX_LIVE_MATERIALS = MAX_MATERIALS;
const MAX_ATTEMPTS = 3;

export interface MaterialAnswer {
  material?: Material;
  outcome: ProjectOutcome;
  stale: string[];
}

export async function countLiveMaterials(store: Store, householdId: string, projectId: string): Promise<number> {
  const rows = await store.query(hhPk(householdId), { skPrefix: materialPrefixFor(projectId), attributes: ['SK', 'deletedAt'] });
  return rows.filter(row => row.deletedAt === undefined).length;
}

const lostRace = (error: unknown): boolean => error instanceof ConditionFailedError && error.failedIndex === 0;

async function goneUnderDeletedParent(store: Store, householdId: string, mutationId: string, nowMs: number): Promise<WriteOutcome<MaterialAnswer>> {
  const outcome = await withWriteRecord<MaterialAnswer>(store, householdId, mutationId, [], { outcome: 'gone', stale: [] }, Math.floor(nowMs / 1000));
  if (outcome.fresh) logProjectWrite(householdId, 'material', 'put', 'gone');
  return outcome;
}

export async function putMaterial(
  store: Store, ctx: HouseholdContext, projectId: string, lineId: string, input: { write: MaterialWrite; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<MaterialAnswer>> {
  const { householdId } = ctx;
  const replayed = await replayOf<MaterialAnswer>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const key = materialKey(householdId, projectId, lineId);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (!(await liveParent(store, householdId, projectId))) return goneUnderDeletedParent(store, householdId, input.mutationId, nowMs);
    const raw = await store.get(key, { consistent: true });
    const existing = raw ? toMaterial(raw) : undefined;
    const applied = applyMaterialWrite(existing, { projectId, id: lineId }, input.write, ctx.userId, nowMs);
    if (!raw && applied.result === 'created' && (await countLiveMaterials(store, householdId, projectId)) >= MAX_LIVE_MATERIALS) throw new TaskError('material_limit', 409);

    const material = applied.material ?? existing;
    const answer: MaterialAnswer = { ...(material ? { material } : {}), outcome: applied.result, stale: applied.stale };
    let ops: TxOp[] = [];
    if (applied.result === 'created' && applied.material) ops = [{ put: toRecord(key, applied.material), ifAbsent: true }];
    if (applied.result === 'applied' && applied.material && raw) ops = [updateFor(key, raw, applied.material)];
    try {
      const done = await withWriteRecord(store, householdId, input.mutationId, ops, answer, Math.floor(nowMs / 1000));
      if (done.fresh) logProjectWrite(householdId, 'material', 'put', applied.result);
      return done;
    } catch (error) {
      if (ops.length > 0 && lostRace(error)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

export async function deleteMaterial(
  store: Store, ctx: HouseholdContext, projectId: string, lineId: string, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<MaterialAnswer>> {
  const { householdId } = ctx;
  const replayed = await replayOf<MaterialAnswer>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const key = materialKey(householdId, projectId, lineId);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (!(await liveParent(store, householdId, projectId))) return goneUnderDeletedParent(store, householdId, input.mutationId, nowMs);
    const raw = await store.get(key, { consistent: true });
    const applied = applyMaterialDelete(raw ? toMaterial(raw) : undefined, ctx.userId, nowMs);
    const outcome: ProjectOutcome = !raw ? 'gone' : applied.result;
    const answer: MaterialAnswer = { ...(applied.material ? { material: applied.material } : {}), outcome, stale: [] };
    const ops: TxOp[] = applied.result === 'applied' && applied.material && raw ? [updateFor(key, raw, applied.material)] : [];
    try {
      const done = await withWriteRecord(store, householdId, input.mutationId, ops, answer, Math.floor(nowMs / 1000));
      if (done.fresh) logProjectWrite(householdId, 'material', 'delete', outcome);
      return done;
    } catch (error) {
      if (ops.length > 0 && lostRace(error)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}
