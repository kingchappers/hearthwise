import { describe, expect, it } from 'vitest';
import { matchesMissing, planUpdate } from '../patch';

const key = { PK: 'HH#h1', SK: 'TASK#t1' };

describe('planUpdate', () => {
  it('rejects an update that sets and removes nothing once undefined values are dropped', () => {
    expect(() => planUpdate({ update: key, set: { a: undefined } })).toThrow(/needs at least one/);
  });

  it('rejects an update with no set and no remove', () => {
    expect(() => planUpdate({ update: key, ifEquals: { a: 1 } })).toThrow(/needs at least one/);
  });

  it('rejects an attribute named in both set and remove', () => {
    expect(() => planUpdate({ update: key, set: { a: 1 }, remove: ['a'] })).toThrow(/both set and remove/);
  });

  it('rejects setting a key attribute', () => {
    expect(() => planUpdate({ update: key, set: { PK: 'x' } })).toThrow(/key attribute/);
  });

  it('rejects removing a key attribute', () => {
    expect(() => planUpdate({ update: key, remove: ['SK'] })).toThrow(/key attribute/);
  });

  it('rejects an ifEquals entry whose value is undefined', () => {
    expect(() => planUpdate({ update: key, set: { a: 1 }, ifEquals: { b: undefined } })).toThrow(/use ifMissing/);
  });

  it.each([['an object', { a: 1 }], ['an array', [1, 2]]])('rejects an ifEquals value that is %s, because the stores compare it differently', (_name, value) => {
    expect(() => planUpdate({ update: key, set: { a: 1 }, ifEquals: { b: value } })).toThrow(/scalar/);
  });

  it('accepts a string, number, boolean or null in ifEquals', () => {
    const plan = planUpdate({ update: key, set: { a: 1 }, ifEquals: { s: 'x', n: 2, b: true, z: null } });
    expect(plan.ifEquals).toEqual([['s', 'x'], ['n', 2], ['b', true], ['z', null]]);
  });

  it('requires the item to exist unless told otherwise', () => {
    expect(planUpdate({ update: key, set: { a: 1 } }).mustExist).toBe(true);
    expect(planUpdate({ update: key, set: { a: 1 }, mustExist: false }).mustExist).toBe(false);
  });

  it('drops undefined set values from the plan', () => {
    const plan = planUpdate({ update: key, set: { a: undefined, b: 1 }, remove: ['c'], ifMissing: ['d'], ifEquals: { e: 2 } });
    expect(plan).toEqual({ set: [['b', 1]], remove: ['c'], ifEquals: [['e', 2]], ifMissing: ['d'], mustExist: true });
  });
});

describe('matchesMissing', () => {
  it('is satisfied by an absent attribute and a missing item', () => {
    expect(matchesMissing({ a: 1 }, ['b'])).toBe(true);
    expect(matchesMissing(undefined, ['b'])).toBe(true);
  });

  it('is not satisfied by a present attribute', () => {
    expect(matchesMissing({ a: 1 }, ['a'])).toBe(false);
  });

  it('is not satisfied by a stored null', () => {
    expect(matchesMissing({ a: null }, ['a'])).toBe(false);
  });
});
