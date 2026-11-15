import type { Repeat } from '../shared/schedule';

export type EventKind = 'event' | 'block';
export const EVENT_KINDS: EventKind[] = ['event', 'block'];

// A reminder a person asked for: elapsed minutes before the start, or (blocks only) at the end.
export interface Reminder {
  from: 'start' | 'end';
  minutes: number;
}

// One person's reminders on one event. `savedAt` is the server time of the save: nothing is sent for an instant before it.
export interface ReminderEntry {
  savedAt: number;
  list: Reminder[];
}

// Wall-clock fields in the household zone: the date, and for a timed event the start and the length in wall-clock minutes. They
// change together, as one group.
export interface Schedule {
  startOn: string;
  allDay: boolean;
  startTime?: string;
  durationMin?: number;
  // All-day only, inclusive.
  endOn?: string;
  repeat: Repeat;
  repeatEndsOn?: string;
  skipOn: string[];
}

export interface People {
  // A user id, or 'both'.
  who: string;
  private: boolean;
}

export interface EventFieldTimes {
  title?: number;
  place?: number;
  notes?: number;
  schedule?: number;
  people?: number;
}

export interface CalendarEvent extends Schedule, People {
  id: string;
  kind: EventKind;
  title: string;
  place?: string;
  notes?: string;
  // By user id. Written only by the reminders route, and only for the caller.
  reminders: Record<string, ReminderEntry>;
  fieldTimes: EventFieldTimes;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
  deletedAt?: number;
  deletedBy?: string;
  // Epoch seconds, when the store may purge it.
  expiresAt?: number;
}

// What the person who may see an event gets: all of it, with only their own reminders.
export type EventView = CalendarEvent & { busy?: undefined };

// What the other person gets for a private event: where it falls and that the creator is busy. No text and no kind.
export interface BusyView extends Pick<Schedule, 'startOn' | 'allDay' | 'startTime' | 'durationMin' | 'endOn' | 'repeat' | 'repeatEndsOn' | 'skipOn'> {
  id: string;
  busy: true;
  // The creator's display name.
  owner: string;
}

export type EventOrBusy = EventView | BusyView;

export interface EventsData {
  events: EventOrBusy[];
  deleted: EventView[];
  serverTime: number;
}

export interface Stamped<T> {
  value: T;
  at: number;
}

// The body of PUT /api/hh/calendar/{id}. A create carries `kind` and the title, schedule and people groups; an edit carries any
// group, each with the client time it was set.
export interface EventWrite {
  kind?: EventKind;
  title?: Stamped<string>;
  place?: Stamped<string>;
  notes?: Stamped<string>;
  schedule?: Stamped<Schedule>;
  people?: Stamped<People>;
}

export interface EventPutInput extends EventWrite {
  mutationId: string;
  clientAt?: number;
}
