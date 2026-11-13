import { describe, expect, it } from 'vitest';
import { clampClientTime, isCalendarDate, isValidTimeZone } from '../dates';

const FIVE_MINUTES = 5 * 60 * 1000;
const NOW = Date.parse('2026-11-11T12:00:00Z');

describe('clampClientTime', () => {
  it('caps a timestamp an hour ahead at server time plus five minutes', () => {
    expect(clampClientTime(NOW + 3_600_000, NOW)).toBe(NOW + FIVE_MINUTES);
  });

  it('leaves a timestamp in the past alone', () => {
    expect(clampClientTime(NOW - 1000, NOW)).toBe(NOW - 1000);
  });

  it('leaves a timestamp exactly five minutes ahead alone', () => {
    expect(clampClientTime(NOW + FIVE_MINUTES, NOW)).toBe(NOW + FIVE_MINUTES);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('throws a RangeError for %s', value => {
    expect(() => clampClientTime(value, NOW)).toThrow(RangeError);
  });
});

describe('isValidTimeZone', () => {
  it('accepts an IANA zone name', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
  });

  it.each(['Mars/Olympus', '', 'Europe/' + 'x'.repeat(80), 42, undefined, null])('rejects %s', value => {
    expect(isValidTimeZone(value)).toBe(false);
  });
});

describe('isCalendarDate', () => {
  it('accepts a real date', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
  });

  it('rejects a date that rolls over into the next month', () => {
    expect(isCalendarDate('2026-02-31')).toBe(false);
  });

  it('rejects text that is not YYYY-MM-DD', () => {
    expect(isCalendarDate('2026-2-3')).toBe(false);
    expect(isCalendarDate(20261111)).toBe(false);
  });
});
