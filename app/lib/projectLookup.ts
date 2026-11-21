import type { Step } from '../../src/projects/types';

export type ProjectLookup = 'found' | 'deleted' | 'checking' | 'gone';

// Whether a project or step is there. The client never decides "gone" from absence alone: the list may not have loaded, or may predate
// something the other phone made. Only a tombstone from the server says deleted; a record missing from an answer that did arrive after
// this page opened says gone. This copies the rule of `recipeLookup.ts` for projects and steps; it does not generalise it.
export function lookupState<T extends { id: string; deletedAt?: number }>(id: string, records: T[] | undefined, fetchedAt: number | undefined): ProjectLookup {
  const found = records?.find(record => record.id === id);
  if (found) return found.deletedAt === undefined ? 'found' : 'deleted';
  return records !== undefined && fetchedAt !== undefined ? 'gone' : 'checking';
}

export const stepLookup = (id: string, steps: Step[] | undefined, fetchedAt: number | undefined): ProjectLookup => lookupState(id, steps, fetchedAt);
