import { positionBetween } from '../../src/shared/projectRules';
import { addDays, isRealDate } from '../../src/shared/schedule';
import { parsePounds } from '../../src/shared/money';
import type { PlannedChange } from './mutations';
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

// A list pasted from another app brings its bullets and numbers ("- ", "* ", "1. ", "2) ", "[ ] "). They are not part of the words, and
// a number would read as a second order beside the list's own.
const LIST_MARKER = /^(?:(?:[-*\u2022]|\d+[.)])(?:\s+|$)|\[[ xX]?\]\s*)+/;
export const splitLines = (text: string): string[] => text.split(/\r?\n/).map(line => line.trim().replace(LIST_MARKER, '').trim()).filter(line => line !== '');

// What the planned-day fields say, as a change, or the reason it cannot be saved. An empty start is a clear; an end with no start is
// refused; an end must be on or after the start and at most 13 days after it (a span of 14 days).
export function plannedChange(start: string, end: string): { ok: true; change: PlannedChange } | { ok: false; field: 'start' | 'end' } {
  if (start === '') return end === '' ? { ok: true, change: { plannedOn: null } } : { ok: false, field: 'start' };
  if (!isRealDate(start)) return { ok: false, field: 'start' };
  if (end === '') return { ok: true, change: { plannedOn: start, plannedEndOn: null } };
  if (!isRealDate(end) || end < start || end > addDays(start, 13)) return { ok: false, field: 'end' };
  return { ok: true, change: { plannedOn: start, plannedEndOn: end } };
}

// What a cost field says, as a change from what is stored. Empty, or 0, clears the figure (the server accepts only 1 pence or more, or
// null). `unchanged` when the field says what is already stored, so an untouched figure cannot replace the other person's edit of it.
export type CostResult = { ok: true; value: number | null } | { ok: true; unchanged: true } | { ok: false; message: string };

export function costChange(text: string, stored: number | undefined): CostResult {
  const typed = text.trim();
  if (typed === '' || /^£?0*(\.0*)?$/.test(typed)) return stored === undefined ? { ok: true, unchanged: true } : { ok: true, value: null };
  const parsed = parsePounds(typed);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return parsed.pence === stored ? { ok: true, unchanged: true } : { ok: true, value: parsed.pence };
}

// A stored figure as the field shows it: pounds with pence, no symbol.
export const costFieldText = (pence: number | undefined): string => (pence === undefined ? '' : (pence / 100).toFixed(2));
