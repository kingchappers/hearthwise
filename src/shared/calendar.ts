import type { Schedule } from '../calendar/types';
import { addDays, occurrencesBetween } from './schedule';

// One appearance of an event on one date. `on` is the day it starts: an overnight event belongs to that day.
export interface Occurrence {
  on: string;
  // The last day it covers (inclusive). For a timed event, the day its end falls on, on the wall clock.
  endOn: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
}

// An all-day span of 31 days started up to 30 days earlier can still be running; an overnight event started the day before.
const LOOK_BACK_ALL_DAY = 31;
const LOOK_BACK_OVERNIGHT = 1;
const MAX_OCCURRENCES = 500;

const pad = (n: number): string => String(n).padStart(2, '0');
const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// The end of a timed occurrence is its start plus the length on the wall clock. It is not adjusted when the clocks change.
export function wallEnd(on: string, startTime: string, durationMin: number): { endOn: string; endTime: string } {
  const end = minutesOf(startTime) + durationMin;
  return { endOn: addDays(on, Math.floor(end / 1440)), endTime: `${pad(Math.floor((end % 1440) / 60))}:${pad(end % 60)}` };
}

function build(schedule: Schedule, on: string): Occurrence {
  if (schedule.allDay) {
    const span = schedule.endOn === undefined ? 0 : daysBetween(schedule.startOn, schedule.endOn);
    return { on, endOn: addDays(on, span), allDay: true };
  }
  const startTime = schedule.startTime ?? '00:00';
  return { on, startTime, allDay: false, ...wallEnd(on, startTime, schedule.durationMin ?? 0) };
}

function daysBetween(from: string, to: string): number {
  let days = 0;
  for (let day = from; day < to && days <= 400; day = addDays(day, 1)) days += 1;
  return days;
}

// The occurrences that touch the window `from` to `to` (both included): skipped days and the repeat's end date are applied, and an
// item that started before the window but is still running is found. At most 500.
export function occurrencesOf(schedule: Schedule, from: string, to: string): Occurrence[] {
  const lookBack = schedule.allDay ? LOOK_BACK_ALL_DAY : LOOK_BACK_OVERNIGHT;
  const searchFrom = addDays(from, -lookBack);
  const starts = schedule.repeat.type === 'fixed'
    ? occurrencesBetween(schedule.repeat, searchFrom, to, MAX_OCCURRENCES).dates
    : [schedule.startOn].filter(day => day >= searchFrom && day <= to);

  const found: Occurrence[] = [];
  for (const day of starts) {
    if (schedule.repeatEndsOn !== undefined && day > schedule.repeatEndsOn) continue;
    if (schedule.skipOn.includes(day)) continue;
    const occurrence = build(schedule, day);
    if (occurrence.endOn < from) continue;
    // A timed event that ends exactly at midnight does not reach the next day.
    if (!occurrence.allDay && occurrence.endOn === from && occurrence.on < from && occurrence.endTime === '00:00') continue;
    found.push(occurrence);
    if (found.length >= MAX_OCCURRENCES) break;
  }
  return found;
}
