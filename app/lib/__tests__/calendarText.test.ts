import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../../../src/shared/timeline';
import {
  calendarFailureText, dayHeading, nextText, NOT_SAVED, nowText, NOTHING_MORE, privateText, repeatText, timeRange, zoneNote,
} from '../calendarText';

const item = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  key: 'k', type: 'event', label: 'Dentist', who: 'Alex', forViewer: false, allDay: false, on: '2026-11-19', startTime: '10:30', endOn: '2026-11-19', endTime: '11:15', endsNextDay: false, ...over,
});

describe('timeRange', () => {
  it('reads a start to an end, and says when the end is on the next day', () => {
    expect(timeRange(item())).toBe('10:30 to 11:15');
    expect(timeRange(item({ startTime: '23:00', endTime: '07:00', endOn: '2026-11-20', endsNextDay: true }))).toBe('23:00 to 07:00 (next day)');
  });

  it('says All day for an item with no times', () => {
    expect(timeRange(item({ allDay: true, startTime: undefined, endTime: undefined }))).toBe('All day');
  });
});

describe('nowText and nextText', () => {
  it('says what is on and until when, or that nothing is', () => {
    expect(nowText(item({ label: 'Wind down', startTime: '21:30', endTime: '22:00' }))).toBe('Now: Wind down, until 22:00');
    expect(nowText(item({ label: 'Sleep', endTime: '07:00', endsNextDay: true }))).toBe('Now: Sleep, until 07:00 (next day)');
    expect(nowText(undefined)).toBe('Now: nothing on');
  });

  it('says what is next and when, naming the other person but not the viewer or both', () => {
    expect(nextText(item({ label: 'Wind down', who: 'Sam', forViewer: true, startTime: '21:30' }))).toBe('Next: Wind down at 21:30');
    expect(nextText(item({ label: 'Walk', who: 'Both', forViewer: true, startTime: '08:00' }))).toBe('Next: Walk at 08:00');
    expect(nextText(item())).toBe('Next: Dentist, Alex, at 10:30');
    expect(nextText(item({ label: 'Busy', who: 'Alex', type: 'busy' }))).toBe('Next: Busy, Alex, at 10:30');
    expect(nextText(undefined)).toBe(NOTHING_MORE);
    expect(NOTHING_MORE).toBe('Nothing more today');
  });
});

describe('the one-line words', () => {
  it('names the private rule once, with the other person\'s name', () => {
    expect(privateText('Alex')).toBe('Only you can see the details. Alex sees that you are busy.');
  });

  it('says Not saved yet', () => {
    expect(NOT_SAVED).toBe('Not saved yet');
  });

  it('says which zone the times are shown in', () => {
    expect(zoneNote('Europe/London')).toBe('Times are shown in Europe/London');
  });

  it('heads a day with its name, and says Today for today', () => {
    expect(dayHeading('2026-11-16', '2026-11-16')).toBe('Today, Mon 16 Nov');
    expect(dayHeading('2026-11-17', '2026-11-16')).toBe('Tue 17 Nov');
  });

  it('says how an event repeats, and when it ends', () => {
    expect(repeatText({ type: 'none' })).toBeUndefined();
    expect(repeatText({ type: 'fixed', every: 1, unit: 'week', weekdays: ['mon', 'fri'], startOn: '2026-11-16' })).toBe('Every week on Mon, Fri');
    expect(repeatText({ type: 'fixed', every: 1, unit: 'day', startOn: '2026-11-16' }, '2026-12-31')).toBe('Every day, until Thu 31 Dec');
  });

  it('keeps the failure words the registry uses', () => {
    expect(calendarFailureText('private')).toBe('Not saved: this event is now private.');
    expect(calendarFailureText('something_else')).toBeUndefined();
  });
});
