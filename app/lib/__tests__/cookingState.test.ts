import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookingDay, readCooking, startAgain, tickLine, writeServings } from '../cookingState';

const ME = 'auth0|a';
const THEM = 'auth0|b';
// Local times, because the cooking day is the phone's own.
const at = (day: number, hour: number, minute = 0): (() => number) => () => new Date(2026, 10, day, hour, minute).getTime();

beforeEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe('cookingDay', () => {
  it('is the local date, and the hours before 4am count as the day before', () => {
    expect(cookingDay(at(14, 12)())).toBe('2026-11-14');
    expect(cookingDay(at(14, 23, 59)())).toBe('2026-11-14');
    expect(cookingDay(at(15, 0, 30)())).toBe('2026-11-14');
    expect(cookingDay(at(15, 3, 59)())).toBe('2026-11-14');
    expect(cookingDay(at(15, 4)())).toBe('2026-11-15');
  });
});

describe('cooking ticks', () => {
  it('survive a remount: they read back from the device', () => {
    tickLine(ME, 'r1', 'ingredients', 0, true, 4, at(14, 18));
    tickLine(ME, 'r1', 'ingredients', 2, true, 4, at(14, 18));
    tickLine(ME, 'r1', 'steps', 1, true, 4, at(14, 18));
    expect(readCooking(ME, 'r1', at(14, 19))).toEqual({ day: '2026-11-14', ingredients: [0, 2], steps: [1], servings: 4 });
  });

  it('can be unticked', () => {
    tickLine(ME, 'r1', 'steps', 1, true, 4, at(14, 18));
    tickLine(ME, 'r1', 'steps', 1, false, 4, at(14, 18));
    expect(readCooking(ME, 'r1', at(14, 18))?.steps).toEqual([]);
  });

  it('reset on a new day, and are kept at 1am so cooking past midnight keeps them', () => {
    tickLine(ME, 'r1', 'steps', 0, true, 2, at(14, 20));
    expect(readCooking(ME, 'r1', at(15, 1))?.steps).toEqual([0]);
    expect(readCooking(ME, 'r1', at(15, 4))).toBeUndefined();
    expect(readCooking(ME, 'r1', at(16, 12))).toBeUndefined();
  });

  it('start a fresh entry when the stored one is from another day', () => {
    tickLine(ME, 'r1', 'steps', 0, true, 2, at(14, 20));
    tickLine(ME, 'r1', 'steps', 3, true, 2, at(16, 12));
    expect(readCooking(ME, 'r1', at(16, 12))).toEqual({ day: '2026-11-16', ingredients: [], steps: [3], servings: 2 });
  });

  it('are separate for each recipe and each person', () => {
    tickLine(ME, 'r1', 'steps', 0, true, 2, at(14, 18));
    tickLine(THEM, 'r1', 'steps', 5, true, 2, at(14, 18));
    tickLine(ME, 'r2', 'steps', 7, true, 2, at(14, 18));
    expect(readCooking(ME, 'r1', at(14, 18))?.steps).toEqual([0]);
    expect(readCooking(THEM, 'r1', at(14, 18))?.steps).toEqual([5]);
    expect(readCooking(ME, 'r2', at(14, 18))?.steps).toEqual([7]);
  });
});

describe('servings', () => {
  it('are remembered for today, so a servings value stored today wins over the link', () => {
    writeServings(ME, 'r1', 6, at(14, 18));
    expect(readCooking(ME, 'r1', at(14, 19))?.servings).toBe(6);
  });

  it('keep the ticks when the servings change', () => {
    tickLine(ME, 'r1', 'ingredients', 1, true, 2, at(14, 18));
    writeServings(ME, 'r1', 4, at(14, 18));
    expect(readCooking(ME, 'r1', at(14, 18))).toEqual({ day: '2026-11-14', ingredients: [1], steps: [], servings: 4 });
  });

  it('start again clears the ticks only, and puts the servings back', () => {
    tickLine(ME, 'r1', 'ingredients', 1, true, 2, at(14, 18));
    tickLine(ME, 'r1', 'steps', 0, true, 2, at(14, 18));
    writeServings(ME, 'r1', 8, at(14, 18));
    startAgain(ME, 'r1', 3, at(14, 18));
    expect(readCooking(ME, 'r1', at(14, 18))).toEqual({ day: '2026-11-14', ingredients: [], steps: [], servings: 3 });
  });
});

describe('when storage is not available', () => {
  it('never throws, and reads as nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(() => tickLine(ME, 'r1', 'steps', 0, true, 2, at(14, 18))).not.toThrow();
    expect(() => writeServings(ME, 'r1', 3, at(14, 18))).not.toThrow();
    expect(() => startAgain(ME, 'r1', 2, at(14, 18))).not.toThrow();
    expect(readCooking(ME, 'r1', at(14, 18))).toBeUndefined();
  });

  it('reads as nothing when the stored value is not a cooking entry', () => {
    window.localStorage.setItem(`hearthwise.cooking.${ME}`, JSON.stringify({ r1: { day: 5 }, r2: 'x' }));
    expect(readCooking(ME, 'r1', at(14, 18))).toBeUndefined();
    expect(readCooking(ME, 'r2', at(14, 18))).toBeUndefined();
  });
});
