// What the app keeps on this device when a person's edit was replaced by a newer one, or a step they tried to take was already taken:
// their own words, so they can copy them. One JSON object in localStorage for each person (cleared at sign-out), at most 50, one for
// each record and field. Every read and write is inside try/catch: blocked storage must never break a page.
import { useSyncExternalStore } from 'react';
import { projectNoticesKey, projectSavedKey, readObject, writeObject } from './deviceKeys';

export interface ProjectNotice {
  id: string;
  kind: 'replaced' | 'taken';
  projectId: string;
  // The step, or the project itself when the edit was to the project.
  recordId: string;
  field?: string;
  // The person's own words (or value, in words), or the message for a refused take.
  text: string;
  at: number;
}

export const MAX_NOTICES = 50;
const listeners = new Set<() => void>();

export function readNotices(userId: string): ProjectNotice[] {
  const stored = readObject(projectNoticesKey(userId)).notices;
  return Array.isArray(stored) ? stored as ProjectNotice[] : [];
}

function save(userId: string, notices: ProjectNotice[]): void {
  writeObject(projectNoticesKey(userId), { notices });
  for (const listener of listeners) listener();
}

// A newer notice for the same record and field replaces the older one; past the cap the oldest go first.
export function addNotice(userId: string, notice: Omit<ProjectNotice, 'id'>): void {
  const kept = readNotices(userId).filter(existing => !(existing.recordId === notice.recordId && existing.field === notice.field && existing.kind === notice.kind));
  const next = [...kept, { ...notice, id: `${notice.kind}:${notice.recordId}:${notice.field ?? ''}:${notice.at}` }];
  save(userId, next.slice(-MAX_NOTICES));
}

export function dismissNotice(userId: string, id: string): void {
  save(userId, readNotices(userId).filter(notice => notice.id !== id));
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

// The notices for one project, as a stable array until something changes.
let cache: { userId: string; raw: string; value: ProjectNotice[] } | undefined;
function snapshot(userId: string): ProjectNotice[] {
  const raw = JSON.stringify(readNotices(userId));
  if (cache?.userId !== userId || cache.raw !== raw) cache = { userId, raw, value: JSON.parse(raw) as ProjectNotice[] };
  return cache.value;
}

export function useProjectNotices(userId: string, projectId: string): ProjectNotice[] {
  const all = useSyncExternalStore(subscribe, () => snapshot(userId), () => []);
  return all.filter(notice => notice.projectId === projectId);
}

// What this person last saved into a text field of a step or project, kept on this device. It is how the person is told when the OTHER
// person's newer edit later replaces it: the server only tells a writer when its own write was the older one, so a write that landed
// first and was replaced afterwards would otherwise be lost without a word. One entry for each record and field, dropped after a week.
interface Saved { value: string; at: number }
const SAVED_MAX_AGE_MS = 7 * 86_400_000;

function readSavedAll(userId: string): Record<string, Record<string, Saved>> {
  const all = readObject(projectSavedKey(userId));
  return all as Record<string, Record<string, Saved>>;
}

export function rememberSaved(userId: string, recordId: string, field: string, value: string, at: number): void {
  if (userId === '') return;
  const all = readSavedAll(userId);
  all[recordId] = { ...(all[recordId] ?? {}), [field]: { value, at } };
  writeObject(projectSavedKey(userId), all);
}

interface Checked {
  id: string;
  fieldTimes: Partial<Record<string, number>>;
  updatedBy: string;
  // The current words of each field a person can type into, as the server has them ('' when empty).
  values: Record<string, string>;
}

// Compares what the server now holds with what this person last saved. Where the other person's newer edit replaced it, a "kept words"
// notice is made with this person's own words; where the server holds the same words, or the entry is old, it is forgotten.
export function detectReplaced(userId: string, projectId: string, records: Checked[], now: number = Date.now()): void {
  if (userId === '' || records.length === 0) return;
  const all = readSavedAll(userId);
  let changed = false;
  for (const record of records) {
    const saved = all[record.id];
    if (!saved) continue;
    for (const [field, entry] of Object.entries(saved)) {
      const serverTime = record.fieldTimes[field] ?? 0;
      const replaced = record.values[field] !== entry.value && serverTime > entry.at;
      if (replaced && record.updatedBy !== userId) addNotice(userId, { kind: 'replaced', projectId, recordId: record.id, field, text: entry.value, at: now });
      // Kept while the server still holds these words (a later replacement is still to come), until it is replaced or a week old.
      if (replaced || now - entry.at > SAVED_MAX_AGE_MS) {
        delete saved[field];
        changed = true;
      }
    }
    if (Object.keys(saved).length === 0) delete all[record.id];
  }
  if (changed) writeObject(projectSavedKey(userId), all);
}
