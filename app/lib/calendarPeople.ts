import { BOTH } from '../../src/shared/timeline';

export interface Person {
  userId: string;
  displayName: string;
}

// How one item is marked. The first and second member (in user id order, so both phones agree whoever is looking) each have a mark
// of their own, both of you have a mark made of the two, and anything else (a task for anyone, the dinner) has none.
export type Mark = 'first' | 'second' | 'both' | 'none';

export function markOf(who: string, members: Person[]): Mark {
  if (who === BOTH) return 'both';
  const ordered = [...members].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const index = ordered.findIndex(member => member.displayName === who);
  return index === 0 ? 'first' : index === 1 ? 'second' : 'none';
}

// The first letter of a name, for the badge. The name itself is always written out beside it.
export const initialOf = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '';

// Colours are the brand's: terracotta and honey. Each is also told apart by shape (round and square), so colour is never the only sign.
export const MARK_FILL: Record<'first' | 'second', { background: string; color: string }> = {
  first: { background: 'var(--mantine-color-hearth-6)', color: '#fff' },
  second: { background: 'var(--mantine-color-honey-4)', color: '#2A1E18' },
};
