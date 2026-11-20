import { describe, expect, it } from 'vitest';
import { zonedInstant } from '../zoned';

const iso = (ms: number): string => new Date(ms).toISOString();

describe('zonedInstant', () => {
  it('reads an ordinary winter time in London as the same UTC time', () => {
    expect(iso(zonedInstant('2026-01-15', '09:30', 'Europe/London'))).toBe('2026-01-15T09:30:00.000Z');
  });

  it('reads an ordinary summer time in London an hour earlier in UTC', () => {
    expect(iso(zonedInstant('2026-07-15', '09:30', 'Europe/London'))).toBe('2026-07-15T08:30:00.000Z');
  });

  it('gives the first moment after the gap for a time that does not exist (29 March 2026, 01:30)', () => {
    expect(iso(zonedInstant('2026-03-29', '01:30', 'Europe/London'))).toBe('2026-03-29T01:00:00.000Z');
  });

  it('gives the first moment after the gap for the first minute of it, and the last', () => {
    expect(iso(zonedInstant('2026-03-29', '01:00', 'Europe/London'))).toBe('2026-03-29T01:00:00.000Z');
    expect(iso(zonedInstant('2026-03-29', '01:59', 'Europe/London'))).toBe('2026-03-29T01:00:00.000Z');
  });

  it('reads 02:00 on the day the clocks go forward as British Summer Time', () => {
    expect(iso(zonedInstant('2026-03-29', '02:00', 'Europe/London'))).toBe('2026-03-29T01:00:00.000Z');
  });

  it('gives the first of the two for a time that happens twice (25 October 2026, 01:30)', () => {
    expect(iso(zonedInstant('2026-10-25', '01:30', 'Europe/London'))).toBe('2026-10-25T00:30:00.000Z');
  });

  it('reads the hour after the repeated one normally', () => {
    expect(iso(zonedInstant('2026-10-25', '02:00', 'Europe/London'))).toBe('2026-10-25T02:00:00.000Z');
    expect(iso(zonedInstant('2026-10-25', '00:30', 'Europe/London'))).toBe('2026-10-24T23:30:00.000Z');
  });

  it('works in a zone with no daylight saving', () => {
    expect(iso(zonedInstant('2026-03-29', '01:30', 'Asia/Kolkata'))).toBe('2026-03-28T20:00:00.000Z');
    expect(iso(zonedInstant('2026-10-25', '01:30', 'UTC'))).toBe('2026-10-25T01:30:00.000Z');
  });

  it('works west of Greenwich on its own change days', () => {
    expect(iso(zonedInstant('2026-03-08', '02:30', 'America/New_York'))).toBe('2026-03-08T07:00:00.000Z');
    expect(iso(zonedInstant('2026-11-01', '01:30', 'America/New_York'))).toBe('2026-11-01T05:30:00.000Z');
  });

  it('handles a half-hour offset and a southern-hemisphere change', () => {
    expect(iso(zonedInstant('2026-04-05', '02:30', 'Australia/Sydney'))).toBe('2026-04-04T15:30:00.000Z');
    expect(iso(zonedInstant('2026-10-04', '02:30', 'Australia/Sydney'))).toBe('2026-10-03T16:00:00.000Z');
  });
});
