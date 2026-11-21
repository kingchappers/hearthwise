import { clampTime, THIRTY_DAYS_SECONDS } from '../tasks/record';
import type { Material, MaterialWrite, ProjectOutcome } from './types';

const forward = (existing: Material | undefined, serverNow: number): number => Math.max(serverNow, (existing?.updatedAt ?? 0) + 1);

export interface MaterialApplied {
  result: ProjectOutcome;
  material?: Material;
  stale: string[];
}

// What a write does to a material line. Pure: the caller stores the result. A line is only its text, newest write wins, and a
// tombstone is final for edits.
export function applyMaterialWrite(
  existing: Material | undefined, ids: { projectId: string; id: string }, write: MaterialWrite, userId: string, serverNow: number,
): MaterialApplied {
  if (existing?.deletedAt !== undefined) return { result: 'gone', stale: [] };
  if (!write.text) return { result: 'noop', ...(existing ? { material: existing } : {}), stale: [] };
  const at = clampTime(write.text.at, serverNow);

  if (!existing) {
    const material: Material = {
      ...ids, text: write.text.value, fieldTimes: { text: at }, createdBy: userId, createdAt: serverNow, updatedAt: serverNow, updatedBy: userId,
    };
    return { result: 'created', material, stale: [] };
  }
  if (at <= (existing.fieldTimes.text ?? 0)) return { result: 'noop', material: existing, stale: existing.text === write.text.value ? [] : ['text'] };
  const material: Material = { ...structuredClone(existing), text: write.text.value, fieldTimes: { text: at }, updatedAt: forward(existing, serverNow), updatedBy: userId };
  return { result: 'applied', material, stale: [] };
}

export function applyMaterialDelete(existing: Material | undefined, userId: string, serverNow: number): MaterialApplied {
  if (!existing || existing.deletedAt !== undefined) return { result: 'noop', ...(existing ? { material: existing } : {}), stale: [] };
  const material: Material = {
    ...structuredClone(existing), deletedAt: serverNow, deletedBy: userId, expiresAt: Math.floor(serverNow / 1000) + THIRTY_DAYS_SECONDS, updatedAt: forward(existing, serverNow),
  };
  return { result: 'applied', material, stale: [] };
}
