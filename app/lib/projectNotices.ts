// What the app keeps on this device when a person's edit was replaced by a newer one, or a step they tried to take was already taken:
// their own words, so they can copy them. One JSON object in localStorage for each person (cleared at sign-out), at most 50, one for
// each record and field. Every read and write is inside try/catch: blocked storage must never break a page.
import { useSyncExternalStore } from 'react';
import { projectNoticesKey, readObject, writeObject } from './deviceKeys';

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
