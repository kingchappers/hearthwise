import { clampTime, THIRTY_DAYS_SECONDS } from '../tasks/record';
import type { PlannedValue, Project, ProjectFieldTimes, ProjectOutcome, ProjectStatus, ProjectWrite } from './types';

const forward = (existing: Project | undefined, serverNow: number): number => Math.max(serverNow, (existing?.updatedAt ?? 0) + 1);

export interface ProjectApplied {
  result: ProjectOutcome;
  project?: Project;
  // Fields whose write was older than what is stored, and which would have changed something.
  stale: string[];
}

const FIELDS: (keyof ProjectWrite & keyof ProjectFieldTimes)[] = ['title', 'notes', 'status', 'ordered', 'planned', 'estimate', 'spent'];

const plannedOf = (project: Project): { plannedOn: string | null; plannedEndOn: string | null } => ({ plannedOn: project.plannedOn ?? null, plannedEndOn: project.plannedEndOn ?? null });

// Writes the fields of `write` onto `project` that are newer than what it holds.
function applyFields(project: Project, write: ProjectWrite, userId: string, serverNow: number): { changed: boolean; stale: string[] } {
  let changed = false;
  const stale: string[] = [];
  for (const field of FIELDS) {
    const entry = write[field];
    if (!entry) continue;
    const at = clampTime(entry.at, serverNow);
    const value = entry.value;
    if (at <= (project.fieldTimes[field] ?? 0)) {
      const stored = field === 'ordered' ? project.ordered ?? false : field === 'notes' ? project.notes ?? null : field === 'estimate' ? project.estimatePence ?? null : field === 'spent' ? project.spentPence ?? null : field === 'planned' ? JSON.stringify(plannedOf(project)) : project[field];
      const incoming = field === 'planned' ? JSON.stringify({ plannedOn: (value as PlannedValue).plannedOn, plannedEndOn: (value as PlannedValue).plannedEndOn ?? null }) : value;
      if (stored !== incoming) stale.push(field);
      continue;
    }
    if (field === 'notes') {
      if (value === null) delete project.notes;
      else project.notes = value as string;
    } else if (field === 'estimate' || field === 'spent') {
      // Each figure is its own field with its own time. `costBy` says who last changed either, and has no time of its own.
      const name = field === 'estimate' ? 'estimatePence' : 'spentPence';
      if (value === null) delete project[name];
      else project[name] = value as number;
      project.costBy = userId;
    } else if (field === 'planned') {
      // The two days change together: a clear (no start) takes the end with it, and a start with no end leaves no end.
      const planned = value as PlannedValue;
      delete project.plannedOn;
      delete project.plannedEndOn;
      if (planned.plannedOn !== null) {
        project.plannedOn = planned.plannedOn;
        if (planned.plannedEndOn !== undefined && planned.plannedEndOn !== null) project.plannedEndOn = planned.plannedEndOn;
      }
    } else if (field === 'ordered') {
      if (value === true) project.ordered = true;
      else delete project.ordered;
    } else if (field === 'title') project.title = value as string;
    else project.status = value as ProjectStatus;
    project.fieldTimes[field] = at;
    changed = true;
  }
  // With neither figure left there is nothing for "last changed by" to say.
  if (project.estimatePence === undefined && project.spentPence === undefined) delete project.costBy;
  return { changed, stale };
}

// What a write does to a project. Pure: the caller stores the result. A tombstone is final for edits.
export function applyProjectWrite(existing: Project | undefined, id: string, write: ProjectWrite, userId: string, serverNow: number): ProjectApplied {
  if (existing?.deletedAt !== undefined) return { result: 'gone', stale: [] };

  if (!existing) {
    // A create needs its title.
    if (!write.title) return { result: 'noop', stale: [] };
    const project: Project = {
      id, title: '', status: 'active', fieldTimes: {}, createdBy: userId, createdAt: serverNow, updatedAt: serverNow, updatedBy: userId,
    };
    applyFields(project, write, userId, serverNow);
    return { result: 'created', project, stale: [] };
  }

  const project = structuredClone(existing);
  const { changed, stale } = applyFields(project, write, userId, serverNow);
  if (!changed) return { result: 'noop', project: existing, stale };
  project.updatedAt = forward(existing, serverNow);
  project.updatedBy = userId;
  return { result: 'applied', project, stale };
}

export function applyProjectDelete(existing: Project | undefined, userId: string, serverNow: number): ProjectApplied {
  if (!existing || existing.deletedAt !== undefined) return { result: 'noop', project: existing, stale: [] };
  const project: Project = {
    ...structuredClone(existing),
    deletedAt: serverNow,
    deletedBy: userId,
    expiresAt: Math.floor(serverNow / 1000) + THIRTY_DAYS_SECONDS,
    updatedAt: forward(existing, serverNow),
  };
  return { result: 'applied', project, stale: [] };
}
