import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { compareSteps, MAX_PROJECTS } from '../shared/projectRules';
import { ConditionFailedError } from '../store';
import type { Item, Store, TxOp } from '../store';
import { DAY_MS } from '../tasks/record';
import { TaskError } from '../tasks/types';
import { applyProjectWrite } from './applyProject';
import { MATERIAL_PREFIX, materialPrefixFor, PROJECT_PREFIX, projectKey, STEP_PREFIX, stepPrefixFor } from './keys';
import { logProjectWrite } from './log';
import { toMaterial, toProject, toRecord, toStep, updateFor } from './records';
import type { Material, Project, ProjectOutcome, ProjectWrite, Step } from './types';

export const MAX_LIVE_PROJECTS = MAX_PROJECTS;
export const DELETED_LISTED = 50;
const MAX_ATTEMPTS = 3;
const THIRTY_DAYS_MS = 30 * DAY_MS;

export interface ProjectAnswer {
  project?: Project;
  outcome: ProjectOutcome;
  stale: string[];
}

export interface StepCounts {
  steps: number;
  done: number;
  materials: number;
}

export type ListedProject = Project & { counts?: StepCounts };

// Live projects only: the query reads the sort key and `deletedAt`, so it does not pull every project's text.
export async function countLiveProjects(store: Store, householdId: string): Promise<number> {
  const rows = await store.query(hhPk(householdId), { skPrefix: PROJECT_PREFIX, attributes: ['SK', 'deletedAt'] });
  return rows.filter(row => row.deletedAt === undefined).length;
}

const lostRace = (error: unknown, index: number): boolean => error instanceof ConditionFailedError && error.failedIndex === index;

export async function putProject(
  store: Store, ctx: HouseholdContext, id: string, input: { write: ProjectWrite; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<ProjectAnswer>> {
  const { householdId } = ctx;
  const replayed = await replayOf<ProjectAnswer>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(projectKey(householdId, id), { consistent: true });
    const existing = raw ? toProject(raw) : undefined;
    // An edit of a project id that never existed is a record that is not there, so it is a 404, not an outcome.
    if (!raw && !input.write.title) throw new TaskError('not_found', 404);
    const applied = applyProjectWrite(existing, id, input.write, ctx.userId, nowMs);
    if (!raw && (await countLiveProjects(store, householdId)) >= MAX_LIVE_PROJECTS) throw new TaskError('project_limit', 409);

    const project = applied.project ?? existing;
    const answer: ProjectAnswer = { ...(project ? { project } : {}), outcome: applied.result, stale: applied.stale };
    let ops: TxOp[] = [];
    if (applied.result === 'created' && applied.project) ops = [{ put: toRecord(projectKey(householdId, id), applied.project), ifAbsent: true }];
    if (applied.result === 'applied' && applied.project && raw) ops = [updateFor(projectKey(householdId, id), raw, applied.project)];
    try {
      const outcome = await withWriteRecord(store, householdId, input.mutationId, ops, answer, Math.floor(nowMs / 1000));
      if (outcome.fresh) logProjectWrite(householdId, 'project', 'put', answer.outcome);
      return outcome;
    } catch (error) {
      if (ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

// Live steps, done steps and live materials for each project. Only the sort key, the state and `deletedAt` are read, never any text.
async function stepCounts(store: Store, householdId: string): Promise<Map<string, StepCounts>> {
  const [steps, materials]: Item[][] = await Promise.all([
    store.query(hhPk(householdId), { skPrefix: STEP_PREFIX, attributes: ['SK', 'state', 'deletedAt'] }),
    store.query(hhPk(householdId), { skPrefix: MATERIAL_PREFIX, attributes: ['SK', 'deletedAt'] }),
  ]);
  const counts = new Map<string, StepCounts>();
  const entry = (projectId: string): StepCounts => {
    const found = counts.get(projectId) ?? { steps: 0, done: 0, materials: 0 };
    counts.set(projectId, found);
    return found;
  };
  for (const row of steps) {
    if (row.deletedAt !== undefined) continue;
    const found = entry(row.SK.slice(STEP_PREFIX.length).split('#')[0]);
    found.steps += 1;
    if (row.state === 'done') found.done += 1;
  }
  for (const row of materials) {
    if (row.deletedAt === undefined) entry(row.SK.slice(MATERIAL_PREFIX.length).split('#')[0]).materials += 1;
  }
  return counts;
}

// Every live project, and the 50 most recently deleted ones from the last 30 days. With `counts` the active and the listed deleted
// projects carry their step counts; without it no step is read at all (Today and the calendar use that).
export async function getProjectsList(
  store: Store, ctx: HouseholdContext, options: { counts: boolean }, nowMs: number = Date.now(),
): Promise<{ projects: ListedProject[]; deleted: ListedProject[]; serverTime: number }> {
  const all = (await store.query(hhPk(ctx.householdId), { skPrefix: PROJECT_PREFIX })).map(toProject);
  const live = all.filter(project => project.deletedAt === undefined).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const deleted = all
    .filter(project => project.deletedAt !== undefined && project.deletedAt >= nowMs - THIRTY_DAYS_MS)
    .sort((a, b) => b.deletedAt! - a.deletedAt!)
    .slice(0, DELETED_LISTED);
  if (!options.counts) return { projects: live, deleted, serverTime: nowMs };

  const counts = await stepCounts(store, ctx.householdId);
  const withCounts = (project: Project): ListedProject => ({ ...project, counts: counts.get(project.id) ?? { steps: 0, done: 0, materials: 0 } });
  return {
    projects: live.map(project => (project.status === 'active' ? withCounts(project) : project)),
    deleted: deleted.map(withCounts),
    serverTime: nowMs,
  };
}

// One project with its live steps in order. A deleted project answers with its tombstone and no children.
export async function getProject(
  store: Store, ctx: HouseholdContext, id: string, nowMs: number = Date.now(),
): Promise<{ project: Project; steps: Step[]; materials: Material[]; serverTime: number }> {
  const raw = await store.get(projectKey(ctx.householdId, id), { consistent: true });
  if (!raw) throw new TaskError('not_found', 404);
  const project = toProject(raw);
  if (project.deletedAt !== undefined) return { project, steps: [], materials: [], serverTime: nowMs };
  const [stepRows, materialRows] = await Promise.all([
    store.query(hhPk(ctx.householdId), { skPrefix: stepPrefixFor(id) }),
    store.query(hhPk(ctx.householdId), { skPrefix: materialPrefixFor(id) }),
  ]);
  const steps = stepRows.map(toStep).filter(step => step.deletedAt === undefined).sort(compareSteps);
  // Material lines have no order of their own: they are shown in the order they were added.
  const materials = materialRows.map(toMaterial).filter(material => material.deletedAt === undefined).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  return { project, steps, materials, serverTime: nowMs };
}
