import { EVENT_KINDS } from '../calendar/types';
import type { EventKind, EventPutInput, EventWrite, People, Reminder, Schedule } from '../calendar/types';
import { addDays } from './schedule';
import { ENVELOPE_KEYS, parseClientTime, parseDay, parseEnvelope, parseMutationBody, parseRepeat, parseStamped } from './taskValidation';
import { bad, good, trimmedText, unknownKey } from './validation';
import type { Parsed } from './validation';

export const MAX_TITLE = 80;
export const MAX_PLACE = 80;
export const MAX_NOTES = 500;
export const MAX_SKIP_DAYS = 50;
export const MAX_ALL_DAY_DAYS = 31;
export const MAX_REMINDERS_PER_EVENT = 3;
// The list is held to this much before it is looked at; the count of 3 is a refusal the server gives (409 `reminder_limit`).
const MAX_REMINDERS_SENT = 20;
const MAX_USER_ID = 128;
const MAX_MINUTES_BEFORE = 1440;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const SCHEDULE_KEYS = ['startOn', 'allDay', 'startTime', 'durationMin', 'endOn', 'repeat', 'repeatEndsOn', 'skipOn'];
const PEOPLE_KEYS = ['who', 'private'];
const PUT_KEYS = ['kind', 'title', 'titleAt', 'place', 'placeAt', 'notes', 'notesAt', 'scheduleAt', 'peopleAt', ...SCHEDULE_KEYS, ...PEOPLE_KEYS, ...ENVELOPE_KEYS];

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

// A key that is absent or undefined is not there: a JSON body cannot hold undefined, and a hand-made one may.
const has = (body: Record<string, unknown>, key: string): boolean => body[key] !== undefined;

function parseTitle(value: unknown): Parsed<string> {
  return trimmedText(value, MAX_TITLE, 'title');
}

// A place or notes may be cleared, so an empty string is allowed.
function parseOptionalText(max: number, field: string): (value: unknown) => Parsed<string> {
  return value => {
    if (typeof value !== 'string') return bad(field);
    const text = value.trim();
    return Array.from(text).length <= max ? good(text) : bad(field);
  };
}

function parseSchedule(body: Record<string, unknown>): Parsed<Schedule> {
  if (typeof body.startOn !== 'string') return bad('startOn');
  const startOn = parseDay(body.startOn, 'startOn');
  if (!startOn.ok) return startOn;
  if (typeof body.allDay !== 'boolean') return bad('allDay');

  const schedule: Schedule = { startOn: startOn.value, allDay: body.allDay, repeat: { type: 'none' }, skipOn: [] };

  if (body.allDay) {
    if (has(body, 'startTime')) return bad('startTime');
    if (has(body, 'durationMin')) return bad('durationMin');
    if (has(body, 'endOn')) {
      const endOn = parseDay(body.endOn, 'endOn');
      if (!endOn.ok) return endOn;
      if (endOn.value < startOn.value || endOn.value > addDays(startOn.value, MAX_ALL_DAY_DAYS - 1)) return bad('endOn');
      schedule.endOn = endOn.value;
    }
  } else {
    if (typeof body.startTime !== 'string' || !TIME.test(body.startTime)) return bad('startTime');
    if (!isInt(body.durationMin) || body.durationMin < 1 || body.durationMin > 1440) return bad('durationMin');
    if (has(body, 'endOn')) return bad('endOn');
    schedule.startTime = body.startTime;
    schedule.durationMin = body.durationMin;
  }

  if (has(body, 'repeat')) {
    const repeat = parseRepeat(body.repeat);
    if (!repeat.ok) return repeat;
    if (repeat.value.type === 'after') return bad('repeat.type');
    // The event's own date is the authoritative one, so the rule must agree with it.
    if (repeat.value.type === 'fixed' && repeat.value.startOn !== startOn.value) return bad('repeat.startOn');
    schedule.repeat = repeat.value;
  }

  if (has(body, 'repeatEndsOn')) {
    const endsOn = parseDay(body.repeatEndsOn, 'repeatEndsOn');
    if (!endsOn.ok) return endsOn;
    if (schedule.repeat.type !== 'fixed' || endsOn.value < startOn.value) return bad('repeatEndsOn');
    schedule.repeatEndsOn = endsOn.value;
  }

  if (has(body, 'skipOn')) {
    const days = body.skipOn;
    if (!Array.isArray(days) || days.length > MAX_SKIP_DAYS) return bad('skipOn');
    const parsed: string[] = [];
    for (const day of days) {
      const real = parseDay(day, 'skipOn');
      if (!real.ok || parsed.includes(real.value)) return bad('skipOn');
      parsed.push(real.value);
    }
    schedule.skipOn = parsed;
  }
  return good(schedule);
}

function parseWho(value: unknown): Parsed<string> {
  // Either person's id or 'both'. `either` is for tasks: an event cannot be nobody's.
  const plain = typeof value === 'string' && value.length >= 1 && value.length <= MAX_USER_ID && !/[\u0000-\u001f]/.test(value) && value !== 'either';
  return plain ? good(value) : bad('who');
}

function parsePeople(body: Record<string, unknown>): Parsed<People> {
  const who = parseWho(body.who);
  if (!who.ok) return who;
  if (typeof body.private !== 'boolean') return bad('private');
  return good({ who: who.value, private: body.private });
}

// A create sends `kind` and the title, schedule and people groups. An edit sends any group, each with the client time it was set.
export function parseEventPut(body: Record<string, unknown>): Parsed<EventPutInput> {
  const extra = unknownKey(body, PUT_KEYS, '');
  if (extra) return bad(extra);
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  const { mutationId, clientAt } = envelope.value;

  const write: EventWrite = {};
  const creating = has(body, 'kind');
  if (creating) {
    if (!EVENT_KINDS.includes(body.kind as EventKind)) return bad('kind');
    write.kind = body.kind as EventKind;
    if (!has(body, 'title')) return bad('title');
    for (const name of [...SCHEDULE_KEYS.slice(0, 2), ...PEOPLE_KEYS]) if (!has(body, name)) return bad(name);
  }

  if (has(body, 'title') || has(body, 'titleAt')) {
    const title = parseStamped(body, 'title', parseTitle);
    if (!title.ok) return title;
    if (title.value) write.title = title.value;
  }
  for (const [name, max] of [['place', MAX_PLACE], ['notes', MAX_NOTES]] as const) {
    if (!has(body, name) && !has(body, `${name}At`)) continue;
    const stamped = parseStamped(body, name, parseOptionalText(max, name));
    if (!stamped.ok) return stamped;
    if (stamped.value) write[name] = stamped.value;
  }

  const scheduleSent = SCHEDULE_KEYS.some(key => has(body, key)) || has(body, 'scheduleAt');
  if (scheduleSent) {
    const schedule = parseSchedule(body);
    if (!schedule.ok) return schedule;
    const at = parseClientTime(body.scheduleAt, 'scheduleAt');
    if (!at.ok) return at;
    write.schedule = { value: schedule.value, at: at.value };
  }

  const peopleSent = PEOPLE_KEYS.some(key => has(body, key)) || has(body, 'peopleAt');
  if (peopleSent) {
    const people = parsePeople(body);
    if (!people.ok) return people;
    const at = parseClientTime(body.peopleAt, 'peopleAt');
    if (!at.ok) return at;
    write.people = { value: people.value, at: at.value };
  }

  if (creating && (!write.title || !write.schedule || !write.people)) return bad(!write.title ? 'titleAt' : !write.schedule ? 'scheduleAt' : 'peopleAt');
  return good({ ...write, mutationId, ...(clientAt === undefined ? {} : { clientAt }) });
}

export const parseEventDelete = parseMutationBody;

export function parseReminderList(value: unknown): Parsed<Reminder[]> {
  if (!Array.isArray(value) || value.length > MAX_REMINDERS_SENT) return bad('list');
  const list: Reminder[] = [];
  for (const [index, raw] of value.entries()) {
    const at = `list[${index}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad(at);
    const entry = raw as Record<string, unknown>;
    const problem = unknownKey(entry, ['from', 'minutes'], at);
    if (problem) return bad(problem);
    if (entry.from !== 'start' && entry.from !== 'end') return bad(`${at}.from`);
    if (!isInt(entry.minutes) || entry.minutes < 0 || entry.minutes > MAX_MINUTES_BEFORE) return bad(`${at}.minutes`);
    // The prompt at the end of a block has no minutes: it is sent at the end.
    if (entry.from === 'end' && entry.minutes !== 0) return bad(`${at}.minutes`);
    if (list.some(other => other.from === entry.from && other.minutes === entry.minutes)) return bad(at);
    list.push({ from: entry.from, minutes: entry.minutes });
  }
  return good(list);
}

export function parseRemindersPut(body: Record<string, unknown>): Parsed<{ list: Reminder[]; mutationId: string }> {
  const extra = unknownKey(body, ['list', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  const list = parseReminderList(body.list);
  return list.ok ? good({ list: list.value, mutationId: envelope.value.mutationId }) : list;
}
