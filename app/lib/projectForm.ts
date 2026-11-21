import { positionBetween } from '../../src/shared/projectRules';
import { compareSteps } from '../../src/shared/projectRules';

type Placed = { id: string; position: string };

export type Move = { type: 'up' | 'down'; id: string } | { type: 'end' };

// The position for a move, worked out from the steps as the person sees them (the overlaid list). `undefined` means there is no room
// for it and the move is refused; nothing is written.
export function positionFor(steps: Placed[], move: Move): string | undefined {
  const ordered = [...steps].sort(compareSteps);
  if (move.type === 'end') {
    const result = positionBetween(ordered.at(-1)?.position, undefined);
    return result.ok ? result.position : undefined;
  }
  const index = ordered.findIndex(step => step.id === move.id);
  if (index < 0) return undefined;
  // Up goes between the two steps above; down between the two below. The first cannot go up and the last cannot go down.
  const [before, after] = move.type === 'up' ? [ordered[index - 2], ordered[index - 1]] : [ordered[index + 1], ordered[index + 2]];
  if (move.type === 'up' && index === 0) return undefined;
  if (move.type === 'down' && index === ordered.length - 1) return undefined;
  const result = positionBetween(before?.position, after?.position);
  return result.ok ? result.position : undefined;
}

// Several pasted lines become several steps, each placed after the one before. Blank lines are dropped. `undefined` when one has no room.
export function positionsForLines(steps: Placed[], lines: string[]): { text: string; position: string }[] | undefined {
  const out: { text: string; position: string }[] = [];
  let last = [...steps].sort(compareSteps).at(-1)?.position;
  for (const text of lines.map(line => line.trim()).filter(line => line !== '')) {
    const result = positionBetween(last, undefined);
    if (!result.ok) return undefined;
    out.push({ text, position: result.position });
    last = result.position;
  }
  return out;
}

export const splitLines = (text: string): string[] => text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
