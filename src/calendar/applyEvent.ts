import { clampTime, DAY_MS, THIRTY_DAYS_SECONDS } from '../tasks/record';
import { MAX_REMINDERS_PER_EVENT } from '../shared/calendarValidation';
import type { CalendarEvent, EventFieldTimes, EventWrite, Reminder, Schedule } from './types';

// The write rules for an event. Pure: the caller stores the result.
//   created, applied  the event changed (`event` is the new one)
//   noop              nothing changed (`event` is the one that was read, when there was one)
//   gone              the event is deleted, and a tombstone is final for edits
//   private           the event is private and the caller is not its creator, or tried to change what only its creator may
//   invalid, limit    reminders only: not allowed on this event, or more than 3
export type EventResult = 'created' | 'applied' | 'noop' | 'gone' | 'private' | 'invalid' | 'limit';

export interface EventOutcome {
  result: EventResult;
  event?: CalendarEvent;
}

// A one-off event is kept for a year of history after it ends, and a little over.
const ONE_OFF_KEPT_DAYS = 400;

const forward = (existing: CalendarEvent | undefined, serverNow: number): number => Math.max(serverNow, (existing?.updatedAt ?? 0) + 1);

// Epoch seconds, or undefined for an event that repeats (it has no end).
export function expiryOf(schedule: Schedule): number | undefined {
  if (schedule.repeat.type === 'fixed') return undefined;
  const lastDay = schedule.endOn ?? schedule.startOn;
  return Math.floor((Date.parse(`${lastDay}T00:00:00Z`) + ONE_OFF_KEPT_DAYS * DAY_MS) / 1000);
}

const SCHEDULE_FIELDS = ['startTime', 'durationMin', 'endOn', 'repeatEndsOn'] as const;

function setSchedule(event: CalendarEvent, schedule: Schedule): void {
  event.startOn = schedule.startOn;
  event.allDay = schedule.allDay;
  event.repeat = structuredClone(schedule.repeat);
  event.skipOn = [...schedule.skipOn];
  for (const field of SCHEDULE_FIELDS) {
    const value = schedule[field];
    if (value === undefined) delete event[field];
    else Object.assign(event, { [field]: value });
  }
  const expiresAt = expiryOf(schedule);
  if (event.deletedAt !== undefined) return;
  if (expiresAt === undefined) delete event.expiresAt;
  else event.expiresAt = expiresAt;
}

const withoutOthers = (reminders: CalendarEvent['reminders'], userId: string): CalendarEvent['reminders'] =>
  (reminders[userId] === undefined ? {} : { [userId]: reminders[userId] });

// Writes the groups of `write` onto `event` that are newer than what it holds. True when anything changed. A private event is
// held to its creator (`who`), and making it private takes every other member's reminders off in the same write.
function applyGroups(event: CalendarEvent, write: EventWrite, serverNow: number): boolean {
  let changed = false;
  const stamp = (group: keyof EventFieldTimes, at: number): boolean => {
    const time = clampTime(at, serverNow);
    if (time <= (event.fieldTimes[group] ?? 0)) return false;
    event.fieldTimes[group] = time;
    changed = true;
    return true;
  };

  if (write.title && stamp('title', write.title.at)) event.title = write.title.value;
  for (const name of ['place', 'notes'] as const) {
    const entry = write[name];
    if (!entry || !stamp(name, entry.at)) continue;
    if (entry.value === '') delete event[name];
    else event[name] = entry.value;
  }
  if (write.schedule && stamp('schedule', write.schedule.at)) setSchedule(event, write.schedule.value);
  if (write.people && stamp('people', write.people.at)) {
    const { who, private: isPrivate } = write.people.value;
    event.private = isPrivate;
    event.who = isPrivate ? event.createdBy : who;
    if (isPrivate) event.reminders = withoutOthers(event.reminders, event.createdBy);
  }
  return changed;
}

// What only the creator may do to a private event, and the one thing only the creator may do to any event: set or clear `private`.
function forbidden(existing: CalendarEvent, write: EventWrite, userId: string): boolean {
  if (userId === existing.createdBy) return false;
  if (existing.private) return true;
  return write.people !== undefined && write.people.value.private !== existing.private;
}

export function applyEventWrite(existing: CalendarEvent | undefined, id: string, write: EventWrite, userId: string, serverNow: number): EventOutcome {
  if (existing?.deletedAt !== undefined) return { result: 'gone' };
  if (existing && forbidden(existing, write, userId)) return { result: 'private' };

  if (!existing) {
    if (!write.kind || !write.title || !write.schedule || !write.people) return { result: 'noop' };
    const event: CalendarEvent = {
      id, kind: write.kind, title: '', who: 'both', private: false, startOn: write.schedule.value.startOn, allDay: false, repeat: { type: 'none' }, skipOn: [],
      reminders: {}, fieldTimes: {}, createdBy: userId, createdAt: serverNow, updatedAt: serverNow, updatedBy: userId,
    };
    applyGroups(event, write, serverNow);
    return { result: 'created', event };
  }

  const event = structuredClone(existing);
  if (!applyGroups(event, write, serverNow)) return { result: 'noop', event: existing };
  event.updatedAt = forward(existing, serverNow);
  event.updatedBy = userId;
  return { result: 'applied', event };
}

export function applyEventDelete(existing: CalendarEvent, userId: string, serverNow: number): EventOutcome {
  if (existing.deletedAt !== undefined) return { result: 'noop', event: existing };
  if (existing.private && userId !== existing.createdBy) return { result: 'private' };
  return {
    result: 'applied',
    event: {
      ...structuredClone(existing), deletedAt: serverNow, deletedBy: userId,
      expiresAt: Math.floor(serverNow / 1000) + THIRTY_DAYS_SECONDS, updatedAt: forward(existing, serverNow),
    },
  };
}

// Takes the tombstone off. A one-off event gets its expiry back from its date, so it is still purged in time.
export function applyEventRestore(existing: CalendarEvent, userId: string, serverNow: number): EventOutcome {
  if (existing.deletedAt === undefined) return { result: 'noop', event: existing };
  if (existing.private && userId !== existing.createdBy) return { result: 'private' };
  const event = structuredClone(existing);
  delete event.deletedAt;
  delete event.deletedBy;
  delete event.expiresAt;
  const expiresAt = expiryOf(event);
  if (expiresAt !== undefined) event.expiresAt = expiresAt;
  event.updatedAt = forward(existing, serverNow);
  return { result: 'applied', event };
}

// Sets the caller's own reminders. They are never part of a group, so two people's edits cannot overwrite each other. An empty
// list removes the caller's entry.
export function applyReminders(existing: CalendarEvent, userId: string, list: Reminder[], serverNow: number): EventOutcome {
  if (existing.deletedAt !== undefined) return { result: 'gone' };
  if (existing.private && userId !== existing.createdBy) return { result: 'private' };
  if (list.length > MAX_REMINDERS_PER_EVENT) return { result: 'limit' };
  if (list.length > 0 && existing.allDay) return { result: 'invalid' };
  if (list.some(reminder => reminder.from === 'end') && existing.kind !== 'block') return { result: 'invalid' };

  if (list.length === 0 && existing.reminders[userId] === undefined) return { result: 'noop', event: existing };
  const event = structuredClone(existing);
  if (list.length === 0) delete event.reminders[userId];
  else event.reminders[userId] = { savedAt: serverNow, list: list.map(reminder => ({ ...reminder })) };
  event.updatedAt = forward(existing, serverNow);
  event.updatedBy = userId;
  return { result: 'applied', event };
}
