import type { Item, Key, TxOp } from '../store';
import { PROJECT_PREFIX, STEP_PREFIX } from './keys';
import type { Project, Step } from './types';

export function toProject(raw: Item): Project {
  const project: Project = {
    id: raw.SK.slice(PROJECT_PREFIX.length),
    title: String(raw.title),
    status: raw.status === 'finished' ? 'finished' : 'active',
    fieldTimes: structuredClone((raw.fieldTimes as Project['fieldTimes'] | undefined) ?? {}),
    createdBy: String(raw.createdBy ?? ''),
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt),
    updatedBy: String(raw.updatedBy ?? ''),
  };
  if (typeof raw.notes === 'string') project.notes = raw.notes;
  if (typeof raw.plannedOn === 'string') project.plannedOn = raw.plannedOn;
  if (typeof raw.plannedEndOn === 'string') project.plannedEndOn = raw.plannedEndOn;
  if (typeof raw.estimatePence === 'number') project.estimatePence = raw.estimatePence;
  if (typeof raw.spentPence === 'number') project.spentPence = raw.spentPence;
  if (typeof raw.costBy === 'string') project.costBy = raw.costBy;
  if (typeof raw.takenBy === 'string') project.takenBy = raw.takenBy;
  if (typeof raw.takenAt === 'number') project.takenAt = raw.takenAt;
  if (typeof raw.deletedAt === 'number') project.deletedAt = raw.deletedAt;
  if (typeof raw.deletedBy === 'string') project.deletedBy = raw.deletedBy;
  if (typeof raw.expiresAt === 'number') project.expiresAt = raw.expiresAt;
  return project;
}

export function toStep(raw: Item): Step {
  const [projectId, ...rest] = raw.SK.slice(STEP_PREFIX.length).split('#');
  const step: Step = {
    id: rest.join('#'),
    projectId,
    text: String(raw.text),
    state: raw.state === 'done' ? 'done' : 'todo',
    position: String(raw.position ?? ''),
    fieldTimes: structuredClone((raw.fieldTimes as Step['fieldTimes'] | undefined) ?? {}),
    createdBy: String(raw.createdBy ?? ''),
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt),
    updatedBy: String(raw.updatedBy ?? ''),
  };
  if (typeof raw.note === 'string') step.note = raw.note;
  if (typeof raw.takenBy === 'string') step.takenBy = raw.takenBy;
  if (typeof raw.takenAt === 'number') step.takenAt = raw.takenAt;
  if (typeof raw.doneBy === 'string') step.doneBy = raw.doneBy;
  if (typeof raw.doneAt === 'number') step.doneAt = raw.doneAt;
  if (typeof raw.deletedAt === 'number') step.deletedAt = raw.deletedAt;
  if (typeof raw.deletedBy === 'string') step.deletedBy = raw.deletedBy;
  if (typeof raw.expiresAt === 'number') step.expiresAt = raw.expiresAt;
  return step;
}


// The stored form: the same fields, with the keys, and nothing set to undefined. The ids are in the key, not the item.
export function toRecord(key: Key, record: object): Item {
  const { id: _id, projectId: _projectId, ...fields } = record as Record<string, unknown>;
  const stored: Item = { ...key, ...fields };
  for (const name of Object.keys(stored)) if (stored[name] === undefined) delete stored[name];
  return stored;
}

// The update that turns what is stored into `next`: the attributes that changed, and the ones that went away. It applies only to
// the version that was read and only to a record that is not deleted. `extra` adds conditions, such as the holder that was read.
export function updateFor(key: Key, existing: Item, next: object, extra: { ifEquals?: Record<string, unknown>; ifMissing?: string[] } = {}): TxOp {
  const after = toRecord(key, next);
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(after)) {
    if (name !== 'PK' && name !== 'SK' && JSON.stringify(value) !== JSON.stringify(existing[name])) set[name] = value;
  }
  const remove = Object.keys(existing).filter(name => name !== 'PK' && name !== 'SK' && !(name in after));
  return {
    update: key, set, remove,
    ifEquals: { updatedAt: existing.updatedAt, ...extra.ifEquals },
    ifMissing: ['deletedAt', ...(extra.ifMissing ?? [])],
  };
}

// The condition that pins a hold: the holder that was read, or still none.
export function holdCondition(existing: Item): { ifEquals?: Record<string, unknown>; ifMissing?: string[] } {
  return existing.takenBy === undefined ? { ifMissing: ['takenBy'] } : { ifEquals: { takenBy: existing.takenBy } };
}
