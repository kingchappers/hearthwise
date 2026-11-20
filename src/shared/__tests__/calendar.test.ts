import { describe, expect, it } from 'vitest';
import type { Schedule } from '../../calendar/types';
import { occurrencesOf } from '../calendar';

const timed = (extra: Partial<Schedule> = {}): Schedule => ({ startOn: '2026-03-02', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' }, skipOn: [], ...extra });
const daily = (extra: Partial<Schedule> = {}): Schedule => timed({ repeat: { type: 'fixed', every: 1, unit: 'day', startOn: '2026-03-02' }, ...extra });

describe('occurrencesOf', () => {
  it('gives a one-off event on its day and not outside the window', () => {
    expect(occurrencesOf(timed(), '2026-03-01', '2026-03-03')).toEqual([{ on: '2026-03-02', endOn: '2026-03-02', allDay: false, startTime: '10:30', endTime: '11:15' }]);
    expect(occurrencesOf(timed(), '2026-03-03', '2026-03-09')).toEqual([]);
    expect(occurrencesOf(timed(), '2026-02-20', '2026-03-01')).toEqual([]);
  });

  it('expands a repeat inside the window', () => {
    expect(occurrencesOf(daily(), '2026-03-01', '2026-03-05').map(o => o.on)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']);
  });

  it('leaves out skipped days', () => {
    expect(occurrencesOf(daily({ skipOn: ['2026-03-03'] }), '2026-03-02', '2026-03-04').map(o => o.on)).toEqual(['2026-03-02', '2026-03-04']);
  });

  it('stops at the end date, which is included', () => {
    expect(occurrencesOf(daily({ repeatEndsOn: '2026-03-04' }), '2026-03-02', '2026-03-10').map(o => o.on)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);
  });

  it('shows an all-day span on every day it covers, found from its start before the window', () => {
    const span = { startOn: '2026-03-02', allDay: true, endOn: '2026-03-05', repeat: { type: 'none' as const }, skipOn: [] };
    const found = occurrencesOf(span, '2026-03-04', '2026-03-04');
    expect(found).toEqual([{ on: '2026-03-02', endOn: '2026-03-05', allDay: true }]);
  });

  it('gives an all-day event with no end date one day', () => {
    expect(occurrencesOf({ startOn: '2026-03-02', allDay: true, repeat: { type: 'none' }, skipOn: [] }, '2026-03-02', '2026-03-02')).toEqual([{ on: '2026-03-02', endOn: '2026-03-02', allDay: true }]);
  });

  it('keeps an overnight block on the day it starts, with its end the next day', () => {
    const night = daily({ startTime: '23:00', durationMin: 480 });
    const found = occurrencesOf(night, '2026-03-03', '2026-03-03');
    expect(found.map(o => [o.on, o.endOn, o.endTime])).toEqual([['2026-03-02', '2026-03-03', '07:00'], ['2026-03-03', '2026-03-04', '07:00']]);
  });

  it('finds an overnight occurrence that started the day before the window', () => {
    const night = timed({ startOn: '2026-03-02', startTime: '23:00', durationMin: 480 });
    expect(occurrencesOf(night, '2026-03-03', '2026-03-03').map(o => o.on)).toEqual(['2026-03-02']);
    expect(occurrencesOf(night, '2026-03-04', '2026-03-04')).toEqual([]);
  });

  it('ends on the wall clock whatever the clocks do: 23:00 for 480 minutes ends 07:00 on the clock-change night', () => {
    const night = timed({ startOn: '2026-03-28', startTime: '23:00', durationMin: 480 });
    expect(occurrencesOf(night, '2026-03-28', '2026-03-28')[0].endTime).toBe('07:00');
  });

  it('a one-day look-back does not drag in an event that ended at midnight', () => {
    const lateEnd = timed({ startOn: '2026-03-02', startTime: '22:00', durationMin: 120 });
    expect(occurrencesOf(lateEnd, '2026-03-03', '2026-03-03')).toEqual([]);
  });

  it('is the same whatever order skip dates are listed in', () => {
    const a = occurrencesOf(daily({ skipOn: ['2026-03-03', '2026-03-05'] }), '2026-03-02', '2026-03-08');
    const b = occurrencesOf(daily({ skipOn: ['2026-03-05', '2026-03-03'] }), '2026-03-02', '2026-03-08');
    expect(a).toEqual(b);
  });

  it('never gives more than 500 occurrences however wide the window', () => {
    expect(occurrencesOf(daily(), '2026-03-01', '2036-03-01').length).toBeLessThanOrEqual(500);
  });
});
