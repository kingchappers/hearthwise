import { describe, expect, it } from 'vitest';
import {
  compareSteps, holderOf, ID_PATTERN, MAX_POSITION, MAX_PROJECTS, MAX_STEPS, positionBetween, POSITION_ALPHABET,
} from '../projectRules';

// A small seeded generator, so the property tests are repeatable without a new dependency.
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomPosition(next: () => number): string {
  const length = 1 + Math.floor(next() * 5);
  let text = '';
  for (let i = 0; i < length; i += 1) text += POSITION_ALPHABET[Math.floor(next() * POSITION_ALPHABET.length)];
  return text.replace(/0+$/, '') || 'i';
}

function mustFit(before: string | undefined, after: string | undefined): string {
  const result = positionBetween(before, after);
  if (!result.ok) throw new Error(`no room between ${before} and ${after}`);
  return result.position;
}

describe('positionBetween', () => {
  it('gives a first position when there are no neighbours', () => {
    expect(mustFit(undefined, undefined).length).toBeGreaterThan(0);
  });

  it('sorts strictly between any two ordered positions', () => {
    const next = seeded(7);
    for (let i = 0; i < 500; i += 1) {
      const [low, high] = [randomPosition(next), randomPosition(next)].sort();
      if (low === high) continue;
      const result = mustFit(low, high);
      expect(result > low && result < high).toBe(true);
      expect(result.length).toBeLessThanOrEqual(MAX_POSITION);
      expect(result.endsWith('0')).toBe(false);
    }
  });

  it('sorts before the first and after the last', () => {
    const next = seeded(11);
    for (let i = 0; i < 200; i += 1) {
      const position = randomPosition(next);
      expect(mustFit(undefined, position) < position).toBe(true);
      expect(mustFit(position, undefined) > position).toBe(true);
    }
  });

  it('keeps every character inside the alphabet', () => {
    const result = mustFit('1', '2');
    for (const char of result) expect(POSITION_ALPHABET).toContain(char);
  });

  it.each([
    ['equal', 'abc', 'abc'],
    ['inverted', 'b', 'a'],
    ['a prefix after its extension', 'a1', 'a'],
  ])('says there is no room for %s neighbours', (_name, before, after) => {
    expect(positionBetween(before, after)).toEqual({ ok: false });
  });

  it('says there is no room when the only position is longer than the cap', () => {
    // Repeated moves into one gap grow the position by about one character in five or six: it must stop at the cap.
    let low = 'a';
    const high = 'b';
    let refused = false;
    for (let i = 0; i < 400 && !refused; i += 1) {
      const result = positionBetween(low, high);
      if (!result.ok) {
        refused = true;
        break;
      }
      expect(result.position.length).toBeLessThanOrEqual(MAX_POSITION);
      low = result.position;
    }
    expect(refused).toBe(true);
  });
});

describe('compareSteps', () => {
  it('sorts by position, then by id', () => {
    const steps = [
      { id: 'c', position: 'b' }, { id: 'b', position: 'a' }, { id: 'a', position: 'b' },
    ];
    expect(steps.sort(compareSteps).map(step => step.id)).toEqual(['b', 'a', 'c']);
  });

  it('gives one order however the steps arrive', () => {
    const steps = [
      { id: 'x', position: 'm' }, { id: 'y', position: 'm' }, { id: 'z', position: 'a' }, { id: 'w', position: 'm' },
    ];
    const forward = [...steps].sort(compareSteps).map(step => step.id);
    const backward = [...steps].reverse().sort(compareSteps).map(step => step.id);
    expect(backward).toEqual(forward);
  });
});

describe('holderOf', () => {
  const members = [{ userId: 'sam' }, { userId: 'alex' }];

  it('names a current member who holds the record', () => {
    expect(holderOf({ takenBy: 'alex' }, members)).toBe('alex');
  });

  it('reads a holder who has left as no holder', () => {
    expect(holderOf({ takenBy: 'gone' }, members)).toBeUndefined();
  });

  it('reads a record with no holder as none', () => {
    expect(holderOf({}, members)).toBeUndefined();
  });
});

describe('limits and ids', () => {
  it('exports the limits the design states', () => {
    expect(MAX_PROJECTS).toBe(60);
    expect(MAX_STEPS).toBe(40);
    expect(MAX_POSITION).toBe(64);
  });

  it.each(['a', 'Abc_9-z', 'a'.repeat(64)])('accepts the id %s', id => {
    expect(ID_PATTERN.test(id)).toBe(true);
  });

  it.each(['', 'a#b', 'a b', 'a/b', 'a'.repeat(65)])('refuses the id %j', id => {
    expect(ID_PATTERN.test(id)).toBe(false);
  });
});
