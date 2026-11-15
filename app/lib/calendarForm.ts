// The add and edit form's rules, pure: what a person typed becomes the groups the server takes, or the words that say what to fix.
import type { EventKind, EventView, People, Schedule } from '../../src/calendar/types';
import { MAX_ALL_DAY_DAYS, MAX_NOTES, MAX_PLACE, MAX_TITLE } from '../../src/shared/calendarValidation';
import { addDays, isRealDate } from '../../src/shared/schedule';
import type { Repeat } from '../../src/shared/schedule';

export interface EventForm {
  kind: EventKind;
  title: string;
  place: string;
  notes: string;
  // A user id, or 'both'.
  who: string;
  private: boolean;
  // YYYY-MM-DD.
  startOn: string;
  allDay: boolean;
  // All-day only: the last day of an event that lasts more than a day, or '' for one day.
  lastDay: string;
  // HH:MM.
  startTime: string;
  // What was typed, in minutes.
  durationMin: string;
  repeat: Repeat;
  // '' for a repeat with no end.
  repeatEndsOn: string;
  skipOn: string[];
}

export const blankForm = (day: string): EventForm => ({
  kind: 'event', title: '', place: '', notes: '', who: 'both', private: false, startOn: day, allDay: false, lastDay: '', startTime: '09:00', durationMin: '60',
  repeat: { type: 'none' }, repeatEndsOn: '', skipOn: [],
});

export const formFromEvent = (event: EventView): EventForm => ({
  kind: event.kind, title: event.title, place: event.place ?? '', notes: event.notes ?? '', who: event.who, private: event.private, startOn: event.startOn,
  allDay: event.allDay, lastDay: event.endOn ?? '', startTime: event.startTime ?? '09:00', durationMin: String(event.durationMin ?? 60),
  repeat: structuredClone(event.repeat), repeatEndsOn: event.repeatEndsOn ?? '', skipOn: [...event.skipOn],
});

export interface Evaluated {
  valid: boolean;
  errors: { title?: string; place?: string; notes?: string; startOn?: string; startTime?: string; durationMin?: string; lastDay?: string; repeatEndsOn?: string };
  // The trimmed words.
  title: string;
  place: string;
  notes: string;
  // Only when the schedule and people parts are valid.
  schedule?: Schedule;
  people?: People;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const length = (text: string): number => Array.from(text).length;

function repeatOf(form: EventForm): Repeat {
  // The event's own date is the one the rule starts from.
  return form.repeat.type === 'fixed' ? { ...form.repeat, startOn: form.startOn } : { type: 'none' };
}

export function evaluateForm(form: EventForm, me: string): Evaluated {
  const errors: Evaluated['errors'] = {};
  const title = form.title.trim();
  const place = form.place.trim();
  const notes = form.notes.trim();
  if (title === '') errors.title = 'Add a title.';
  else if (length(title) > MAX_TITLE) errors.title = `Keep the title to ${MAX_TITLE} characters.`;
  if (length(place) > MAX_PLACE) errors.place = `Keep the place to ${MAX_PLACE} characters.`;
  if (length(notes) > MAX_NOTES) errors.notes = `Keep the notes to ${MAX_NOTES} characters.`;

  const dateOk = isRealDate(form.startOn);
  if (!dateOk) errors.startOn = 'Choose a date.';

  const schedule: Schedule = { startOn: form.startOn, allDay: form.allDay, repeat: repeatOf(form), skipOn: [...form.skipOn] };
  if (form.allDay) {
    if (form.lastDay !== '') {
      if (!isRealDate(form.lastDay) || (dateOk && (form.lastDay <= form.startOn || form.lastDay > addDays(form.startOn, MAX_ALL_DAY_DAYS - 1)))) {
        errors.lastDay = 'The last day must be after the first day, and within 31 days.';
      } else schedule.endOn = form.lastDay;
    }
  } else {
    const minutes = Number(form.durationMin);
    if (!TIME.test(form.startTime)) errors.startTime = 'Choose a start time.';
    if (form.durationMin.trim() === '' || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) errors.durationMin = 'The length must be from 1 to 1,440 minutes.';
    else {
      schedule.startTime = form.startTime;
      schedule.durationMin = minutes;
    }
  }

  if (schedule.repeat.type === 'fixed' && form.repeatEndsOn !== '') {
    if (!isRealDate(form.repeatEndsOn) || (dateOk && form.repeatEndsOn < form.startOn)) errors.repeatEndsOn = 'The repeat cannot end before it starts.';
    else schedule.repeatEndsOn = form.repeatEndsOn;
  }

  const valid = Object.keys(errors).length === 0;
  const people: People = { who: form.private ? me : form.who, private: form.private };
  return { valid, errors, title, place, notes, ...(valid ? { schedule, people } : {}) };
}

export interface EventChanges {
  title?: string;
  place?: string;
  notes?: string;
  schedule?: Schedule;
  people?: People;
}

const SCHEDULE_FIELDS = ['startOn', 'allDay', 'startTime', 'durationMin', 'endOn', 'repeat', 'repeatEndsOn', 'skipOn'] as const;

// The same fields in the same order, so two equal schedules compare equal as text.
const canonical = (schedule: Schedule): string => JSON.stringify(SCHEDULE_FIELDS.map(field => schedule[field] ?? null));

const scheduleOf = (event: EventView): Schedule => ({
  startOn: event.startOn, allDay: event.allDay, repeat: event.repeat, skipOn: event.skipOn,
  ...(event.startTime === undefined ? {} : { startTime: event.startTime }),
  ...(event.durationMin === undefined ? {} : { durationMin: event.durationMin }),
  ...(event.endOn === undefined ? {} : { endOn: event.endOn }),
  ...(event.repeatEndsOn === undefined ? {} : { repeatEndsOn: event.repeatEndsOn }),
});

// What changed from the event the form was opened on: only the groups that differ. A form that is not valid changes nothing.
export function changesFrom(event: EventView, result: Evaluated, _me: string): EventChanges {
  if (!result.valid || !result.schedule || !result.people) return {};
  const changes: EventChanges = {};
  if (result.title !== event.title) changes.title = result.title;
  if (result.place !== (event.place ?? '')) changes.place = result.place;
  if (result.notes !== (event.notes ?? '')) changes.notes = result.notes;
  if (canonical(result.schedule) !== canonical(scheduleOf(event))) changes.schedule = result.schedule;
  if (result.people.who !== event.who || result.people.private !== event.private) changes.people = result.people;
  return changes;
}
