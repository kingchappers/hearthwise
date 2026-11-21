// Pure rules for projects: step order, who holds a step, and the limits. Shared by the server and the app's overlay.

export const POSITION_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export const MAX_POSITION = 64;
export const MAX_PROJECTS = 60;
export const MAX_STEPS = 40;
export const MAX_MATERIALS = 60;

// Ids sit inside sort keys that use `#` as a separator, so an id may never hold one.
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type PositionResult = { ok: true; position: string } | { ok: false };

const BASE = POSITION_ALPHABET.length;

function digit(text: string, index: number): number {
  return POSITION_ALPHABET.indexOf(text[index] ?? POSITION_ALPHABET[0]);
}

// A position that sorts strictly between `before` and `after` (either may be absent, for the ends). It never ends in the
// first character, so there is always room after it. When no position of at most MAX_POSITION characters fits, including
// equal or inverted neighbours, it says so and the caller refuses the move.
export function positionBetween(before: string | undefined, after: string | undefined): PositionResult {
  const low = before ?? '';
  if (after !== undefined && low >= after) return { ok: false };
  let result = '';
  let bounded = after !== undefined;
  for (let i = 0; result.length < MAX_POSITION; i += 1) {
    const lo = digit(low, i);
    const hi = bounded ? digit(after as string, i) : BASE;
    if (lo === hi) {
      result += POSITION_ALPHABET[lo];
    } else if (hi - lo > 1) {
      result += POSITION_ALPHABET[Math.floor((lo + hi) / 2)];
      return { ok: true, position: result };
    } else {
      result += POSITION_ALPHABET[lo];
      bounded = false;
    }
  }
  return { ok: false };
}

// Position, then id, so two steps that share a position still show in one order on both phones.
export function compareSteps(a: { id: string; position: string }, b: { id: string; position: string }): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

// The person holding a step or project, or none. A holder who is no longer a member reads as no holder.
export function holderOf(record: { takenBy?: string }, members: { userId: string }[]): string | undefined {
  if (record.takenBy === undefined) return undefined;
  return members.some(member => member.userId === record.takenBy) ? record.takenBy : undefined;
}
