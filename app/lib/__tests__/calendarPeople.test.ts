import { describe, expect, it } from 'vitest';
import { colourOfMember, initialOf, markOf } from '../calendarPeople';
import type { Person } from '../calendarPeople';

const alex: Person = { userId: 'u-alex', displayName: 'Alex' };
const sam: Person = { userId: 'u-sam', displayName: 'Sam' };

describe('markOf', () => {
  it('orders people by user id, so both phones give the same person the same place', () => {
    expect(markOf('Alex', [sam, alex])).toBe('first');
    expect(markOf('Sam', [alex, sam])).toBe('second');
    expect(markOf('Both', [alex, sam])).toBe('both');
    expect(markOf('Anyone', [alex, sam])).toBe('none');
    expect(markOf('', [alex, sam])).toBe('none');
  });
});

describe('colourOfMember', () => {
  it('gives terracotta to the first and yellow to the second when nobody has chosen', () => {
    expect(colourOfMember(alex, [alex, sam])).toBe('hearth');
    expect(colourOfMember(sam, [alex, sam])).toBe('honey');
  });

  it('gives a person the colour they chose', () => {
    expect(colourOfMember(alex, [{ ...alex, colour: 'sage' }, sam])).toBe('sage');
    expect(colourOfMember(sam, [alex, { ...sam, colour: 'hearth' }])).toBe('hearth');
  });

  it('keeps a person who has not chosen away from the colour the other chose', () => {
    expect(colourOfMember(sam, [{ ...alex, colour: 'honey' }, sam])).toBe('hearth');
    expect(colourOfMember(alex, [alex, { ...sam, colour: 'hearth' }])).toBe('honey');
    expect(colourOfMember(alex, [alex, { ...sam, colour: 'hearth' }])).not.toBe('hearth');
  });

  it('lets both people choose the same colour: the shape and the name still tell them apart', () => {
    const both = [{ ...alex, colour: 'sage' as const }, { ...sam, colour: 'sage' as const }];
    expect(colourOfMember(both[0], both)).toBe('sage');
    expect(colourOfMember(both[1], both)).toBe('sage');
  });
});

describe('initialOf', () => {
  it('is the first letter, in capitals', () => {
    expect(initialOf(' alex')).toBe('A');
    expect(initialOf('Émile')).toBe('É');
    expect(initialOf('')).toBe('');
  });
});
