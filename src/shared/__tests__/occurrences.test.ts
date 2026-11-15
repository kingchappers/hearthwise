import { describe, expect, it } from 'vitest';
import { addDays, occurrencesBetween, occursOn } from '../schedule';
import type { Repeat } from '../schedule';

const DAILY: Repeat = { type: 'fixed', every: 1, unit: 'day', startOn: '2026-03-01' };
const MONTH_31: Repeat = { type: 'fixed', every: 1, unit: 'month', dayOfMonth: 31, startOn: '2026-01-31' };

describe('occursOn', () => {
  it('is exported and tests one day against a fixed rule', () => {
    expect(occursOn(DAILY, '2026-03-05')).toBe(true);
    expect(occursOn({ ...DAILY, every: 2 }, '2026-03-02')).toBe(false);
  });
});

describe('occurrencesBetween', () => {
  it('lists the dates a rule gives, ends included', () => {
    expect(occurrencesBetween({ ...DAILY, every: 2 }, '2026-03-01', '2026-03-07', 500)).toEqual({ dates: ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07'], truncated: false });
  });

  it('starts at the rule start, not before it', () => {
    expect(occurrencesBetween(DAILY, '2026-02-27', '2026-03-02', 500).dates).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('uses the last day of a shorter month for day 31', () => {
    expect(occurrencesBetween(MONTH_31, '2026-02-01', '2026-04-30', 500).dates).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('cuts at the limit and says so', () => {
    const result = occurrencesBetween(DAILY, '2026-03-01', '2026-06-01', 10);
    expect(result.dates).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it('is not truncated when it fits the limit exactly', () => {
    expect(occurrencesBetween(DAILY, '2026-03-01', '2026-03-10', 10).truncated).toBe(false);
  });

  it('never goes past 500 dates, whatever limit is asked for', () => {
    const result = occurrencesBetween(DAILY, '2026-03-01', '2030-03-01', 10_000);
    expect(result.dates.length).toBeLessThanOrEqual(500);
    expect(result.truncated).toBe(true);
  });

  it('looks at no more than 400 days of the window', () => {
    const result = occurrencesBetween(DAILY, '2026-03-01', '2030-03-01', 500);
    expect(result.dates[result.dates.length - 1] <= addDays('2026-03-01', 399)).toBe(true);
  });

  it('gives nothing for a rule that does not repeat', () => {
    expect(occurrencesBetween({ type: 'none' }, '2026-03-01', '2026-03-10', 500)).toEqual({ dates: [], truncated: false });
    expect(occurrencesBetween({ type: 'after', days: 3 }, '2026-03-01', '2026-03-10', 500)).toEqual({ dates: [], truncated: false });
  });

  it('gives nothing when the window is backwards', () => {
    expect(occurrencesBetween(DAILY, '2026-03-10', '2026-03-01', 500).dates).toEqual([]);
  });

  it('agrees with occursOn on every day of a year for several rules', () => {
    const rules: Repeat[] = [
      DAILY,
      { type: 'fixed', every: 3, unit: 'day', startOn: '2026-02-10' },
      { type: 'fixed', every: 2, unit: 'week', weekdays: ['mon', 'thu'], startOn: '2026-01-05' },
      { type: 'fixed', every: 5, unit: 'month', startOn: '2026-01-29' },
      MONTH_31,
    ];
    for (const rule of rules) {
      if (rule.type !== 'fixed') continue;
      const expected: string[] = [];
      for (let day = '2026-01-01'; day <= '2026-12-31'; day = addDays(day, 1)) if (occursOn(rule, day)) expected.push(day);
      const got = occurrencesBetween(rule, '2026-01-01', '2026-12-31', 500).dates;
      expect(got).toEqual(expected.slice(0, got.length));
      expect(got.length).toBe(Math.min(expected.length, 500));
    }
  });
});
