import { describe, expect, it } from 'vitest';
import { addDays, dayInZone, firstOnOrAfter, isDue, isRealDate, nextDueOn } from '../schedule';
import type { Repeat } from '../schedule';

// 2026-03-01 is a Sunday.
const SUNDAYS: Repeat = { type: 'fixed', every: 1, unit: 'week', weekdays: ['sun'], startOn: '2026-03-01' };
const DAILY: Repeat = { type: 'fixed', every: 1, unit: 'day', startOn: '2026-03-01' };

describe('nextDueOn: after', () => {
  it('counts from the completion day when done late', () => {
    expect(nextDueOn({ type: 'after', days: 7 }, '2026-03-02', '2026-03-05')).toBe('2026-03-12');
  });

  it('moves past the cycle when completed the day before it is due (after 1)', () => {
    expect(nextDueOn({ type: 'after', days: 1 }, '2026-03-10', '2026-03-09')).toBe('2026-03-11');
  });

  it('counts from the completion day when done on the due day', () => {
    expect(nextDueOn({ type: 'after', days: 3 }, '2026-03-10', '2026-03-10')).toBe('2026-03-13');
  });

  it('counts from the completion day when the task had no date', () => {
    expect(nextDueOn({ type: 'after', days: 2 }, undefined, '2026-03-10')).toBe('2026-03-12');
  });

  it('a late hoover (after 1) is next due the day after it was done', () => {
    expect(nextDueOn({ type: 'after', days: 1 }, '2026-03-01', '2026-03-05')).toBe('2026-03-06');
  });
});

describe('nextDueOn: fixed', () => {
  it('moves an every-Sunday chore done on the Friday before to the Sunday after the cycle\'s Sunday', () => {
    expect(nextDueOn(SUNDAYS, '2026-03-08', '2026-03-06')).toBe('2026-03-15');
  });

  it('moves an every-Sunday chore done on a Wednesday to the next Sunday after the cycle\'s Sunday (CUJ 3)', () => {
    expect(nextDueOn(SUNDAYS, '2026-03-08', '2026-03-11')).toBe('2026-03-15');
  });

  it('does not pile up a backlog when completed weeks late', () => {
    expect(nextDueOn(SUNDAYS, '2026-03-08', '2026-03-30')).toBe('2026-04-05');
  });

  it('moves a daily fixed chore completed late to tomorrow', () => {
    expect(nextDueOn(DAILY, '2026-03-03', '2026-03-06')).toBe('2026-03-07');
  });

  it('moves a daily fixed chore completed on time to the next day', () => {
    expect(nextDueOn(DAILY, '2026-03-03', '2026-03-03')).toBe('2026-03-04');
  });
});

describe('nextDueOn: none', () => {
  it('has no next date', () => {
    expect(nextDueOn({ type: 'none' }, '2026-03-03', '2026-03-03')).toBeNull();
  });
});

describe('firstOnOrAfter', () => {
  it('returns the day itself when it matches', () => {
    expect(firstOnOrAfter(SUNDAYS, '2026-03-08')).toBe('2026-03-08');
  });

  it('returns the day itself for an after rule and for none', () => {
    expect(firstOnOrAfter({ type: 'after', days: 5 }, '2026-03-04')).toBe('2026-03-04');
    expect(firstOnOrAfter({ type: 'none' }, '2026-03-04')).toBe('2026-03-04');
  });

  it('never goes before startOn', () => {
    expect(firstOnOrAfter(SUNDAYS, '2026-02-01')).toBe('2026-03-01');
  });

  it('counts every N days from startOn', () => {
    const everyThree: Repeat = { type: 'fixed', every: 3, unit: 'day', startOn: '2026-03-01' };
    expect(firstOnOrAfter(everyThree, '2026-03-02')).toBe('2026-03-04');
    expect(firstOnOrAfter(everyThree, '2026-03-05')).toBe('2026-03-07');
  });

  it('counts every other week from the week containing startOn (weeks start Monday), on the listed weekdays', () => {
    // startOn is Wednesday 2026-03-04; its week is the week of Monday 2026-03-02.
    const rule: Repeat = { type: 'fixed', every: 2, unit: 'week', weekdays: ['mon', 'thu'], startOn: '2026-03-04' };
    expect(firstOnOrAfter(rule, '2026-03-04')).toBe('2026-03-05');
    expect(firstOnOrAfter(rule, '2026-03-06')).toBe('2026-03-16');
    expect(firstOnOrAfter(rule, '2026-03-17')).toBe('2026-03-19');
  });

  it('defaults a weekly rule with no weekdays to the weekday of startOn', () => {
    const rule: Repeat = { type: 'fixed', every: 1, unit: 'week', startOn: '2026-03-04' };
    expect(firstOnOrAfter(rule, '2026-03-05')).toBe('2026-03-11');
  });

  it('puts the 31st on the last day of February, and on the 29th in a leap year', () => {
    const rule: Repeat = { type: 'fixed', every: 1, unit: 'month', dayOfMonth: 31, startOn: '2026-01-31' };
    expect(firstOnOrAfter(rule, '2026-02-01')).toBe('2026-02-28');
    expect(firstOnOrAfter(rule, '2026-03-01')).toBe('2026-03-31');
    const leap: Repeat = { type: 'fixed', every: 1, unit: 'month', dayOfMonth: 31, startOn: '2028-01-31' };
    expect(firstOnOrAfter(leap, '2028-02-01')).toBe('2028-02-29');
  });

  it('uses the day of startOn for a monthly rule with no dayOfMonth', () => {
    const rule: Repeat = { type: 'fixed', every: 1, unit: 'month', startOn: '2026-01-31' };
    expect(firstOnOrAfter(rule, '2026-02-01')).toBe('2026-02-28');
    expect(firstOnOrAfter(rule, '2026-03-01')).toBe('2026-03-31');
  });

  it('counts every N months from the month of startOn', () => {
    const rule: Repeat = { type: 'fixed', every: 2, unit: 'month', startOn: '2026-01-15' };
    expect(firstOnOrAfter(rule, '2026-01-16')).toBe('2026-03-15');
  });
});

describe('dates only', () => {
  it('adds exactly one day across the spring-forward and fall-back days', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('adds across month and year ends, and subtracts', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('reads the household\'s day, not UTC\'s', () => {
    const instant = Date.UTC(2026, 5, 30, 23, 30);
    expect(dayInZone(instant, 'Europe/London')).toBe('2026-07-01');
    expect(dayInZone(instant, 'UTC')).toBe('2026-06-30');
  });

  it('reads the right day on the spring-forward day', () => {
    expect(dayInZone(Date.UTC(2026, 2, 29, 0, 30), 'Europe/London')).toBe('2026-03-29');
    expect(dayInZone(Date.UTC(2026, 2, 29, 23, 30), 'Europe/London')).toBe('2026-03-30');
  });
});

describe('isRealDate', () => {
  it('accepts real dates and refuses impossible or badly formed ones', () => {
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2026-2-3')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
});

describe('isDue', () => {
  it('is true for an open task due today or earlier, false for later, undated or done', () => {
    expect(isDue({ dueOn: '2026-03-05', status: 'open' }, '2026-03-05')).toBe(true);
    expect(isDue({ dueOn: '2026-03-01', status: 'open' }, '2026-03-05')).toBe(true);
    expect(isDue({ dueOn: '2026-03-06', status: 'open' }, '2026-03-05')).toBe(false);
    expect(isDue({ status: 'open' }, '2026-03-05')).toBe(false);
    expect(isDue({ dueOn: '2026-03-01', status: 'done' }, '2026-03-05')).toBe(false);
  });
});
