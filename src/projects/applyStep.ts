import type { Energy } from '../shared/energy';
import { clampTime, THIRTY_DAYS_SECONDS } from '../tasks/record';
import type { ProjectOutcome, Step, StepFieldTimes, StepState, StepWrite } from './types';

const forward = (existing: Step | undefined, serverNow: number): number => Math.max(serverNow, (existing?.updatedAt ?? 0) + 1);

export interface StepApplied {
  result: ProjectOutcome;
  step?: Step;
  stale: string[];
}

const FIELDS: (keyof StepWrite & keyof StepFieldTimes)[] = ['text', 'note', 'energy', 'state', 'position'];

function storedValue(step: Step, field: keyof StepWrite): unknown {
  return field === 'note' || field === 'energy' ? step[field] ?? null : step[field];
}

// Writes the fields of `write` onto `step` that are newer than what it holds. Done clears the hold and records who and when;
// todo clears that record again. An edit of any other field never touches a hold.
function applyFields(step: Step, write: StepWrite, userId: string, serverNow: number): { changed: boolean; stale: string[] } {
  let changed = false;
  const stale: string[] = [];
  for (const field of FIELDS) {
    const entry = write[field];
    if (!entry) continue;
    const at = clampTime(entry.at, serverNow);
    const value = entry.value;
    if (at <= (step.fieldTimes[field] ?? 0)) {
      if (storedValue(step, field) !== value) stale.push(field);
      continue;
    }
    if (field === 'note') {
      if (value === null) delete step.note;
      else step.note = value as string;
    } else if (field === 'energy') {
      if (value === null) delete step.energy;
      else step.energy = value as Energy;
    } else if (field === 'text') step.text = value as string;
    else if (field === 'position') step.position = value as string;
    else {
      step.state = value as StepState;
      if (step.state === 'done') {
        delete step.takenBy;
        delete step.takenAt;
        step.doneBy = userId;
        step.doneAt = at;
      } else {
        delete step.doneBy;
        delete step.doneAt;
      }
    }
    step.fieldTimes[field] = at;
    changed = true;
  }
  return { changed, stale };
}

// What a write does to a step. Pure: the caller stores the result. A tombstone is final for edits.
export function applyStepWrite(
  existing: Step | undefined, ids: { projectId: string; id: string }, write: StepWrite, userId: string, serverNow: number,
): StepApplied {
  if (existing?.deletedAt !== undefined) return { result: 'gone', stale: [] };

  if (!existing) {
    // A create needs its text and its position.
    if (!write.text || !write.position) return { result: 'noop', stale: [] };
    const step: Step = {
      ...ids, text: '', state: 'todo', position: '', fieldTimes: {}, createdBy: userId, createdAt: serverNow, updatedAt: serverNow, updatedBy: userId,
    };
    applyFields(step, write, userId, serverNow);
    return { result: 'created', step, stale: [] };
  }

  const step = structuredClone(existing);
  const { changed, stale } = applyFields(step, write, userId, serverNow);
  if (!changed) return { result: 'noop', step: existing, stale };
  step.updatedAt = forward(existing, serverNow);
  step.updatedBy = userId;
  return { result: 'applied', step, stale };
}

export function applyStepDelete(existing: Step | undefined, userId: string, serverNow: number): StepApplied {
  if (!existing || existing.deletedAt !== undefined) return { result: 'noop', step: existing, stale: [] };
  const step: Step = {
    ...structuredClone(existing),
    deletedAt: serverNow,
    deletedBy: userId,
    expiresAt: Math.floor(serverNow / 1000) + THIRTY_DAYS_SECONDS,
    updatedAt: forward(existing, serverNow),
  };
  return { result: 'applied', step, stale: [] };
}
