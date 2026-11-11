import { describe, expect, it } from 'vitest';
import { isQuietHour, localMoment, sendHour, type DeliverySettings } from '../select';

function settings(over: Partial<DeliverySettings> = {}): DeliverySettings {
  return { hour: 8, quietStart: null, quietEnd: null, timeZone: 'Europe/London', ...over };
}

describe('localMoment', () => {
  it('gives the date and hour in the person\'s own time zone', () => {
    const now = new Date('2026-10-01T23:30:00Z');
    expect(localMoment(now, 'Europe/London')).toEqual({ date: '2026-10-02', hour: 0 });
    expect(localMoment(now, 'America/New_York')).toEqual({ date: '2026-10-01', hour: 19 });
    expect(localMoment(now, 'Asia/Tokyo')).toEqual({ date: '2026-10-02', hour: 8 });
  });

  it('reports midnight as hour 0, never 24', () => {
    expect(localMoment(new Date('2026-01-15T00:10:00Z'), 'UTC').hour).toBe(0);
  });

  it('follows the clocks going back', () => {
    expect(localMoment(new Date('2026-10-25T00:30:00Z'), 'Europe/London').hour).toBe(1);
    expect(localMoment(new Date('2026-10-25T01:30:00Z'), 'Europe/London').hour).toBe(1);
  });
});

describe('quiet hours', () => {
  it('covers the hours from the start up to, not including, the end', () => {
    expect(isQuietHour(13, 13, 17)).toBe(true);
    expect(isQuietHour(16, 13, 17)).toBe(true);
    expect(isQuietHour(17, 13, 17)).toBe(false);
    expect(isQuietHour(12, 13, 17)).toBe(false);
  });

  it('runs past midnight when the start is after the end', () => {
    expect(isQuietHour(22, 22, 7)).toBe(true);
    expect(isQuietHour(23, 22, 7)).toBe(true);
    expect(isQuietHour(0, 22, 7)).toBe(true);
    expect(isQuietHour(6, 22, 7)).toBe(true);
    expect(isQuietHour(7, 22, 7)).toBe(false);
    expect(isQuietHour(21, 22, 7)).toBe(false);
  });

  it('means none when there are none, or the start and end are the same', () => {
    expect(isQuietHour(3, null, null)).toBe(false);
    expect(isQuietHour(3, 5, 5)).toBe(false);
  });
});

describe('sendHour', () => {
  it('is the chosen hour when it is not a quiet hour', () => {
    expect(sendHour(settings({ hour: 8, quietStart: 22, quietEnd: 7 }))).toBe(8);
  });

  it('waits until the quiet hours end when the chosen hour falls inside them', () => {
    expect(sendHour(settings({ hour: 6, quietStart: 22, quietEnd: 9 }))).toBe(9);
  });
});
