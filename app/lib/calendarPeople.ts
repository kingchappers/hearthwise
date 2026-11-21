import { MARK_COLOURS } from '../../src/shared/household';
import type { MarkColour } from '../../src/shared/household';
import { BOTH } from '../../src/shared/timeline';

export interface Person {
  userId: string;
  displayName: string;
  // The colour the person chose for their items. None until they do.
  colour?: MarkColour;
}

// How one item is marked. The first and second member (in user id order, so both phones agree whoever is looking) each have a place
// of their own, both of you have a mark made of the two, and anything else (a task for anyone, the dinner) has none.
export type Mark = 'first' | 'second' | 'both' | 'none';

export const orderedMembers = (members: Person[]): Person[] => [...members].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

export function markOf(who: string, members: Person[]): Mark {
  if (who === BOTH) return 'both';
  const index = orderedMembers(members).findIndex(member => member.displayName === who);
  return index === 0 ? 'first' : index === 1 ? 'second' : 'none';
}

// The colour a person's items carry: the one they chose, or else their place's own (terracotta, then yellow), moving on to the next
// brand colour if the other person chose it. Two people may both choose one colour; the shape and the name still tell them apart.
export function colourOfMember(member: Person, members: Person[]): MarkColour {
  const chosen = members.find(candidate => candidate.userId === member.userId)?.colour ?? member.colour;
  if (chosen !== undefined) return chosen;
  const ordered = orderedMembers(members);
  const place = Math.max(0, ordered.findIndex(candidate => candidate.userId === member.userId));
  const own = MARK_COLOURS[place % MARK_COLOURS.length];
  const taken = ordered.filter(candidate => candidate.userId !== member.userId).map(candidate => candidate.colour);
  return [own, ...MARK_COLOURS.filter(colour => colour !== own)].find(colour => !taken.includes(colour)) ?? own;
}

// The first letter of a name, for the badge. The name itself is always written out beside it.
export const initialOf = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '';

export const COLOUR_NAMES: Record<MarkColour, string> = { hearth: 'Terracotta', honey: 'Yellow', sage: 'Green' };

// The brand's own shades: terracotta 6 and sage 6 carry white (6.8:1 and 6.4:1), the yellow fill carries Ink (9.5:1).
export const COLOUR_FILL: Record<MarkColour, { background: string; color: string }> = {
  hearth: { background: 'var(--mantine-color-hearth-6)', color: '#fff' },
  honey: { background: 'var(--mantine-color-honey-4)', color: '#2A1E18' },
  sage: { background: 'var(--mantine-color-sage-6)', color: '#fff' },
};
