import { describe, expect, it } from 'vitest';
import { relativeDayText, withRelative } from '../relativeTime';

describe('relativeDayText', () => {
  it('says today, tomorrow and in N days for a day still to come', () => {
    expect(relativeDayText('2026-11-21', '2026-11-21')).toBe('today');
    expect(relativeDayText('2026-11-22', '2026-11-21')).toBe('tomorrow');
    expect(relativeDayText('2026-11-24', '2026-11-21')).toBe('in 3 days');
  });

  it('says nothing for a day that has passed, since a count of days gone by reads as lateness', () => {
    expect(relativeDayText('2026-11-20', '2026-11-21')).toBeUndefined();
    expect(relativeDayText('2026-01-01', '2026-11-21')).toBeUndefined();
  });

  it('says nothing for a day more than 60 days off, where it stops being useful', () => {
    expect(relativeDayText('2027-01-20', '2026-11-21')).toBe('in 60 days');
    expect(relativeDayText('2027-01-21', '2026-11-21')).toBeUndefined();
  });

  it('counts days across a clock change and a month end', () => {
    expect(relativeDayText('2026-10-26', '2026-10-24')).toBe('in 2 days');
    expect(relativeDayText('2026-12-01', '2026-11-29')).toBe('in 2 days');
  });
});

describe('withRelative', () => {
  it('adds it after the exact text only when the person asked, and the exact text stays', () => {
    expect(withRelative('Sat 5 Dec', '2026-12-05', '2026-12-03', true)).toBe('Sat 5 Dec (in 2 days)');
    expect(withRelative('Sat 5 Dec', '2026-12-05', '2026-12-03', false)).toBe('Sat 5 Dec');
  });

  it('leaves the text alone for a past day or no day', () => {
    expect(withRelative('Wed 18 Nov', '2026-11-18', '2026-11-21', true)).toBe('Wed 18 Nov');
    expect(withRelative('Whenever', undefined, '2026-11-21', true)).toBe('Whenever');
  });
});
