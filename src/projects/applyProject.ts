import { clampTime, THIRTY_DAYS_SECONDS } from '../tasks/record';
import type { Project, ProjectFieldTimes, ProjectOutcome, ProjectStatus, ProjectWrite } from './types';

const forward = (existing: Project | undefined, serverNow: number): number => Math.max(serverNow, (existing?.updatedAt ?? 0) + 1);

export interface ProjectApplied {
  result: ProjectOutcome;
  project?: Project;
  // Fields whose write was older than what is stored, and which would have changed something.
  stale: string[];
}

const FIELDS: (keyof ProjectWrite & keyof ProjectFieldTimes)[] = ['title', 'notes', 'status'];

// Writes the fields of `write` onto `project` that are newer than what it holds.
function applyFields(project: Project, write: ProjectWrite, serverNow: number): { changed: boolean; stale: string[] } {
  let changed = false;
  const stale: string[] = [];
  for (const field of FIELDS) {
    const entry = write[field];
    if (!entry) continue;
    const at = clampTime(entry.at, serverNow);
    const value = entry.value;
    if (at <= (project.fieldTimes[field] ?? 0)) {
      const stored = field === 'notes' ? project.notes ?? null : project[field];
      if (stored !== value) stale.push(field);
      continue;
    }
    if (field === 'notes') {
      if (value === null) delete project.notes;
      else project.notes = value as string;
    } else if (field === 'title') project.title = value as string;
    else project.status = value as ProjectStatus;
    project.fieldTimes[field] = at;
    changed = true;
  }
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
    applyFields(project, write, serverNow);
    return { result: 'created', project, stale: [] };
  }

  const project = structuredClone(existing);
  const { changed, stale } = applyFields(project, write, serverNow);
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
