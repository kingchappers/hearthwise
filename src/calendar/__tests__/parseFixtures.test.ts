import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCore, type ParseWindow, type ParsedOccurrence } from '../parseCore';

// Files shaped like the four providers write them, made by hand (no network). Each carries a VTIMEZONE and provider-only
// properties that must be ignored.
const NOW = Date.UTC(2026, 5, 15);
const WINDOW: ParseWindow = { from: NOW - 14 * 86_400_000, to: NOW + 120 * 86_400_000, now: NOW, zone: 'Europe/London' };
const read = (name: string): ReturnType<typeof parseCore> => parseCore(readFileSync(join(__dirname, 'fixtures', name), 'utf8'), WINDOW);
const occurrences = (name: string): ParsedOccurrence[] => {
  const result = read(name);
  if (!result.ok) throw new Error(`parse failed: ${result.internal}`);
  return result.occurrences;
};
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16) + 'Z';
const timed = (list: ParsedOccurrence[], title: string): string[] => list.flatMap(o => (!o.allDay && o.title === title ? [iso(o.startMs)] : []));

describe('Google-shaped file', () => {
  const list = occurrences('google.ics');

  it('expands the weekly stand-up at 09:30 London, less the EXDATE, with the override moved', () => {
    expect(timed(list, 'Team stand-up').slice(0, 5)).toEqual(['2026-06-01T08:30Z', '2026-06-08T08:30Z', '2026-06-15T08:30Z', '2026-06-22T08:30Z', '2026-07-13T08:30Z']);
    expect(timed(list, 'Team stand-up (later)')).toEqual(['2026-07-06T09:30Z']);
    expect(timed(list, 'Team stand-up')).not.toContain('2026-06-29T08:30Z');
    expect(timed(list, 'Team stand-up')).not.toContain('2026-07-06T08:30Z');
  });

  it('keeps the yearly all-day birthday on its date, marked free', () => {
    expect(list.filter(o => o.title === "Alex's birthday")).toEqual([{ allDay: true, startOn: '2026-06-20', endOn: '2026-06-20', title: "Alex's birthday", free: true }]);
  });

  it('drops the cancelled event and keeps the one-off', () => {
    expect(list.some(o => o.title.startsWith('Dentist'))).toBe(false);
    expect(timed(list, 'Quarterly review')).toEqual(['2026-07-03T14:00Z']);
  });

  it('stores nothing but title and times', () => {
    expect(JSON.stringify(list)).not.toMatch(/meet\.google|Meeting room|Agenda/);
  });
});

describe('Outlook-shaped file', () => {
  const result = read('outlook.ics');
  const list = occurrences('outlook.ics');

  it('reads a Windows zone name', () => {
    expect(timed(list, 'Call with Berlin office')).toEqual(['2026-07-01T12:00Z']);
  });

  it('expands a fortnightly rule with a universal-time UNTIL', () => {
    expect(timed(list, 'Fortnightly planning').slice(0, 3)).toEqual(['2026-06-08T10:00Z', '2026-06-22T10:00Z', '2026-07-06T10:00Z']);
  });

  it('turns the exclusive end of an all-day event inclusive, and marks it free', () => {
    expect(list.filter(o => o.title === 'Annual leave')).toEqual([{ allDay: true, startOn: '2026-07-13', endOn: '2026-07-20', title: 'Annual leave', free: true }]);
  });

  it('reads an unknown zone in the household zone and counts it', () => {
    expect(list.find(o => o.title === 'Supplier visit')).toMatchObject({ startMs: Date.UTC(2026, 6, 8, 8), approx: true });
    expect(result.ok && result.counts.approx).toBe(1);
  });
});

describe('Apple-shaped file', () => {
  const list = occurrences('apple.ics');

  it('reads a timed event, ignoring its alarms and location', () => {
    const swim = list.find(o => o.title === 'Swimming lesson');
    expect(swim).toMatchObject({ allDay: false, startMs: Date.UTC(2026, 5, 18, 17, 30), endMs: Date.UTC(2026, 5, 18, 18, 30) });
    expect(JSON.stringify(list)).not.toMatch(/Pool|Reminder|geo:/);
  });

  it('reads a multi-day all-day event', () => {
    expect(list.find(o => o.title === 'Camping')).toEqual({ allDay: true, startOn: '2026-08-30', endOn: '2026-08-31', title: 'Camping', free: true });
  });

  it('follows a daily rule that began months ago up to its COUNT', () => {
    const vitamins = timed(list, 'Take the vitamins');
    expect(vitamins).toHaveLength(134);
    expect(vitamins[0]).toBe('2026-06-01T07:00Z');
  });
});

describe('Proton-shaped file', () => {
  const list = occurrences('proton.ics');

  it('reads zoned, universal, floating and all-day events', () => {
    expect(timed(list, 'Pick up the parcel')).toEqual(['2026-06-16T15:00Z']);
    expect(timed(list, 'Market')).toEqual(['2026-06-20T08:00Z', '2026-06-27T08:00Z', '2026-07-04T08:00Z']);
    expect(timed(list, 'Floating coffee')).toEqual(['2026-07-18T09:00Z']);
    expect(list.find(o => o.title === 'Anniversary')).toMatchObject({ allDay: true, startOn: '2026-07-04', endOn: '2026-07-04' });
  });
});
