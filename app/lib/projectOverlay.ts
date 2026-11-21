// The pending project mutations shown on top of the server's data. Pure, and it reuses the server's own write rules, so a pending edit
// loses to a newer one on screen exactly as it will on the server. The cached data itself is only changed by a refetch.
import { applyProjectDelete, applyProjectWrite } from '../../src/projects/applyProject';
import { applyStepDelete, applyStepWrite } from '../../src/projects/applyStep';
import type { ListedProject, ProjectsListData } from './projects';
import { applyMaterialDelete, applyMaterialWrite } from '../../src/projects/applyMaterial';
import type { Material, Project, ProjectWrite, Step, StepWrite } from '../../src/projects/types';
import { compareSteps } from '../../src/shared/projectRules';
import { projectMutationKeys } from './mutations';
import type { ProjectChanges, ProjectMutationKind, ProjectMutationVars, StepChanges } from './mutations';
import type { PendingMutation } from './overlay';

export interface ProjectDetailData {
  project: Project;
  steps: Step[];
  materials: Material[];
  serverTime: number;
}

const stamp = <T extends object>(changes: T, at: number): Record<string, { value: unknown; at: number }> => {
  const write: Record<string, { value: unknown; at: number }> = {};
  for (const [field, value] of Object.entries(changes)) if (value !== undefined) write[field] = { value, at };
  return write;
};
// The figures are `estimatePence` and `spentPence` in a change and `estimate` and `spent` in a write.
function projectWrite(changes: ProjectChanges, at: number): ProjectWrite {
  const { estimatePence, spentPence, ...rest } = changes;
  return stamp({ ...rest, estimate: estimatePence, spent: spentPence }, at) as ProjectWrite;
}
const stepWrite = (changes: StepChanges, at: number): StepWrite => stamp(changes, at) as StepWrite;

// A take shows the record as the caller's when it is free and not done; a release frees it.
function taken<T extends { takenBy?: string; takenAt?: number; state?: string }>(record: T, by: string, at: number): T {
  if (record.state === 'done' || (record.takenBy !== undefined && record.takenBy !== by)) return record;
  return { ...record, takenBy: by, takenAt: at };
}
function released<T extends { takenBy?: string; takenAt?: number }>(record: T): T {
  const copy = { ...record };
  delete copy.takenBy;
  delete copy.takenAt;
  return copy;
}

const kindOf = (mutationKey: readonly unknown[] | undefined): ProjectMutationKind | undefined => {
  if (!mutationKey || mutationKey[0] !== 'household') return undefined;
  return (Object.keys(projectMutationKeys) as ProjectMutationKind[]).find(kind => kind === mutationKey[1]);
};

type Vars<K extends ProjectMutationKind> = ProjectMutationVars[K];

function changeListed(list: ProjectsListData, id: string, change: (project: ListedProject) => ListedProject): ProjectsListData {
  const mapped = (rows: ListedProject[]) => rows.map(project => (project.id === id ? change(project) : project));
  return { ...list, projects: mapped(list.projects), deleted: mapped(list.deleted) };
}

// What the Projects list shows: a created project, an edited one, a deleted one moved to the deleted rows, a restored one moved back.
function overlayList(list: ProjectsListData, kind: ProjectMutationKind, vars: ProjectMutationVars[ProjectMutationKind]): ProjectsListData {
  if (kind === 'putProject') {
    const v = vars as Vars<'putProject'>;
    const existing = [...list.projects, ...list.deleted].find(project => project.id === v.projectId);
    const { project } = applyProjectWrite(existing, v.projectId, projectWrite(v.changes, v.at), v.by, v.at);
    if (!project) return list;
    if (!existing) return { ...list, projects: [...list.projects, project] };
    return changeListed(list, v.projectId, listed => ({ ...project, ...(listed.counts ? { counts: listed.counts } : {}) }));
  }
  if (kind === 'deleteProject') {
    const v = vars as Vars<'deleteProject'>;
    const found = list.projects.find(project => project.id === v.projectId);
    const { project } = applyProjectDelete(found, v.by, v.at);
    if (!found || !project) return list;
    return { ...list, projects: list.projects.filter(row => row.id !== v.projectId), deleted: [{ ...project, ...(found.counts ? { counts: found.counts } : {}) }, ...list.deleted] };
  }
  if (kind === 'restoreProject') {
    const v = vars as Vars<'restoreProject'>;
    let next = list;
    for (const { id } of v.entries) {
      const found = next.deleted.find(project => project.id === id);
      if (!found) continue;
      const restored: ListedProject = { ...found };
      delete restored.deletedAt;
      delete restored.deletedBy;
      delete restored.expiresAt;
      next = { ...next, projects: [...next.projects, restored], deleted: next.deleted.filter(row => row.id !== id) };
    }
    return next;
  }
  if (kind === 'takeProject') {
    const v = vars as Vars<'takeProject'>;
    return changeListed(list, v.projectId, project => taken(project, v.by, v.at));
  }
  if (kind === 'releaseProject') return changeListed(list, (vars as Vars<'releaseProject'>).projectId, released);
  return list;
}

const sorted = (steps: Step[]): Step[] => [...steps].sort(compareSteps);

// What one project's page shows, for the pending writes that are about that project.
function overlayDetail(data: ProjectDetailData, kind: ProjectMutationKind, vars: ProjectMutationVars[ProjectMutationKind]): ProjectDetailData {
  const projectId = (vars as { projectId?: string }).projectId;
  if (kind === 'restoreProject') return data;
  if (projectId !== data.project.id) return data;
  if (data.project.deletedAt !== undefined && kind !== 'putStep') return data;
  const changeStep = (stepId: string, change: (step: Step) => Step | undefined): ProjectDetailData =>
    ({ ...data, steps: sorted(data.steps.flatMap(step => (step.id === stepId ? change(step) ?? [] : [step]))) });

  switch (kind) {
    case 'putProject': {
      const v = vars as Vars<'putProject'>;
      const { project } = applyProjectWrite(data.project, v.projectId, projectWrite(v.changes, v.at), v.by, v.at);
      return project ? { ...data, project } : data;
    }
    case 'deleteProject': {
      const { project } = applyProjectDelete(data.project, (vars as Vars<'deleteProject'>).by, (vars as Vars<'deleteProject'>).at);
      return project ? { ...data, project, steps: [], materials: [] } : data;
    }
    case 'takeProject': return { ...data, project: taken(data.project, (vars as Vars<'takeProject'>).by, (vars as Vars<'takeProject'>).at) };
    case 'releaseProject': return { ...data, project: released(data.project) };
    case 'putStep': {
      const v = vars as Vars<'putStep'>;
      const existing = data.steps.find(step => step.id === v.stepId);
      const { step } = applyStepWrite(existing, { projectId: v.projectId, id: v.stepId }, stepWrite(v.changes, v.at), v.by, v.at);
      if (!step) return data;
      return { ...data, steps: sorted(existing ? data.steps.map(row => (row.id === v.stepId ? step : row)) : [...data.steps, step]) };
    }
    case 'putMaterial': {
      const v = vars as Vars<'putMaterial'>;
      const existing = data.materials.find(row => row.id === v.lineId);
      const { material } = applyMaterialWrite(existing, { projectId: v.projectId, id: v.lineId }, { text: { value: v.text, at: v.at } }, v.by, v.at);
      if (!material) return data;
      return { ...data, materials: existing ? data.materials.map(row => (row.id === v.lineId ? material : row)) : [...data.materials, material] };
    }
    case 'deleteMaterial': {
      const v = vars as Vars<'deleteMaterial'>;
      const { material } = applyMaterialDelete(data.materials.find(row => row.id === v.lineId), v.by, v.at);
      return material ? { ...data, materials: data.materials.filter(row => row.id !== v.lineId) } : data;
    }
    case 'deleteStep': return changeStep((vars as Vars<'deleteStep'>).stepId, () => undefined);
    case 'takeStep': return changeStep((vars as Vars<'takeStep'>).stepId, step => taken(step, (vars as Vars<'takeStep'>).by, (vars as Vars<'takeStep'>).at));
    case 'releaseStep': return changeStep((vars as Vars<'releaseStep'>).stepId, released);
    default: return data;
  }
}

export function applyPendingProjectsList(data: ProjectsListData, pending: PendingMutation[]): ProjectsListData {
  return pending.reduce((current, mutation) => {
    const kind = kindOf(mutation.mutationKey);
    return kind && mutation.variables ? overlayList(current, kind, mutation.variables as ProjectMutationVars[ProjectMutationKind]) : current;
  }, data);
}

export function applyPendingProjectDetail(data: ProjectDetailData, pending: PendingMutation[]): ProjectDetailData {
  return pending.reduce((current, mutation) => {
    const kind = kindOf(mutation.mutationKey);
    return kind && mutation.variables ? overlayDetail(current, kind, mutation.variables as ProjectMutationVars[ProjectMutationKind]) : current;
  }, data);
}
