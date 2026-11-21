import { describe, expect, it } from 'vitest';
import { costChange, costFieldText, plannedChange, positionFor, positionsForLines, splitLines } from '../projectForm';

const steps = [{ id: 'a', position: 'i' }, { id: 'b', position: 'j' }, { id: 'c', position: 'k' }];

describe('positionFor', () => {
  it('moves a step up between the two above it, and down between the two below', () => {
    const up = positionFor(steps, { type: 'up', id: 'c' }) as string;
    expect(up > 'i' && up < 'j').toBe(true);
    const down = positionFor(steps, { type: 'down', id: 'a' }) as string;
    expect(down > 'j' && down < 'k').toBe(true);
  });

  it('moves the second step to the top, and the second last to the bottom', () => {
    expect((positionFor(steps, { type: 'up', id: 'b' }) as string) < 'i').toBe(true);
    expect((positionFor(steps, { type: 'down', id: 'b' }) as string) > 'k').toBe(true);
  });

  it('cannot move the first up or the last down, or a step that is not there', () => {
    expect(positionFor(steps, { type: 'up', id: 'a' })).toBeUndefined();
    expect(positionFor(steps, { type: 'down', id: 'c' })).toBeUndefined();
    expect(positionFor(steps, { type: 'up', id: 'zzz' })).toBeUndefined();
  });

  it('places a new step after the last, or first in an empty list', () => {
    expect((positionFor(steps, { type: 'end' }) as string) > 'k').toBe(true);
    expect(positionFor([], { type: 'end' })).toBeTruthy();
  });

  it('says there is no room when the neighbours leave none', () => {
    expect(positionFor([{ id: 'a', position: 'i' }, { id: 'b', position: 'i' }, { id: 'c', position: 'i' }], { type: 'up', id: 'c' })).toBeUndefined();
  });

  it('works from the order the person sees, ties by id', () => {
    const tied = [{ id: 'b', position: 'i' }, { id: 'a', position: 'i' }, { id: 'c', position: 'k' }];
    expect(positionFor(tied, { type: 'end' })).toBeTruthy();
  });
});

describe('positionsForLines', () => {
  it('gives each pasted line a position after the one before, in order, dropping blanks', () => {
    const placed = positionsForLines(steps, ['  One ', '', 'Two', 'Three'])!;
    expect(placed.map(entry => entry.text)).toEqual(['One', 'Two', 'Three']);
    const positions = placed.map(entry => entry.position);
    expect([...positions].sort()).toEqual(positions);
    expect(positions[0] > 'k').toBe(true);
  });

  it('is undefined when there is no room', () => {
    const full = [{ id: 'a', position: 'z'.repeat(64) }];
    expect(positionsForLines(full, ['x'])).toBeUndefined();
  });
});

describe('splitLines', () => {
  it('splits on newlines of either kind and trims', () => {
    expect(splitLines('a\r\n b \n\n c')).toEqual(['a', 'b', 'c']);
  });
});

describe('plannedChange', () => {
  it('reads a start, a start and an end, and an empty start as a clear', () => {
    expect(plannedChange('2026-12-05', '')).toEqual({ ok: true, change: { plannedOn: '2026-12-05', plannedEndOn: null } });
    expect(plannedChange('2026-12-05', '2026-12-06')).toEqual({ ok: true, change: { plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' } });
    expect(plannedChange('', '')).toEqual({ ok: true, change: { plannedOn: null } });
  });

  it('refuses an end with no start, an end before the start, and one more than 13 days after', () => {
    expect(plannedChange('', '2026-12-06')).toEqual({ ok: false, field: 'start' });
    expect(plannedChange('2026-12-05', '2026-12-04')).toEqual({ ok: false, field: 'end' });
    expect(plannedChange('2026-12-05', '2026-12-19')).toEqual({ ok: false, field: 'end' });
    expect(plannedChange('2026-12-05', '2026-12-18').ok).toBe(true);
  });

  it('refuses a day that is not real', () => {
    expect(plannedChange('2026-02-30', '')).toEqual({ ok: false, field: 'start' });
  });
});

describe('costChange', () => {
  it('reads pounds as whole pence', () => {
    expect(costChange('4000', undefined)).toEqual({ ok: true, value: 400000 });
    expect(costChange('£1,250.50', 100)).toEqual({ ok: true, value: 125050 });
  });

  it('turns empty and 0 into a clear, or no change when nothing is stored', () => {
    for (const typed of ['', '  ', '0', '0.00', '£0']) {
      expect(costChange(typed, 5000)).toEqual({ ok: true, value: null });
      expect(costChange(typed, undefined)).toEqual({ ok: true, unchanged: true });
    }
  });

  it('is unchanged when the field says what is stored, so an untouched figure sends nothing', () => {
    expect(costChange('12.50', 1250)).toEqual({ ok: true, unchanged: true });
    expect(costChange(costFieldText(125000), 125000)).toEqual({ ok: true, unchanged: true });
  });

  it('refuses text, a negative, too many decimals and a figure over the largest, in plain words', () => {
    for (const typed of ['abc', '-5', '12.505', '1,000,001', '1000000.01']) {
      const result = costChange(typed, undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('shows a stored figure with pence and no symbol, and an empty field for none', () => {
    expect(costFieldText(400000)).toBe('4000.00');
    expect(costFieldText(undefined)).toBe('');
  });
});
