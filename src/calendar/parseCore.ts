import ICAL from 'ical.js';
import { addDays, dayInZone, isRealDate } from '../shared/schedule';
import { zonedInstant, zonedWall } from '../shared/zoned';
import { expandRule, type DayRule, type Frequency } from './expandRule';
import { windowsZoneToIana } from './windowsZones';

// Reads the text of a calendar file into the occurrences that fall in a window. A plain function: the worker calls it, and the unit
// tests call it directly. The text is hostile: every bound here is a limit on what a file can make us do.

export const MAX_INPUT_CHARS = 2 * 1024 * 1024;
export const MAX_EVENTS = 3000;
export const MAX_OCCURRENCES = 2000;
export const MAX_TITLE = 120;
// A property line longer than this (after unfolding) is dropped: nothing we read is that long.
const MAX_LINE = 64 * 1024;
const MAX_SPAN_DAYS = 366;
// Steps of the repeat iterator (and RDATE values) for one event, and for the whole file.
const MAX_EVENT_STEPS = 1000;
const MAX_FILE_STEPS = 20_000;
const DEFAULT_BUDGET_MS = 3500;
const MAX_INTERVAL = 1000;
const MAX_COUNT = 1_000_000;
const MAX_LIST = 400;
// EXDATE or RDATE values kept for one event, and wall-clock conversions for the whole file.
const MAX_DATE_VALUES = 500;
const MAX_CONVERSIONS = 40_000;
// Periods (days, weeks, months or years) a rule may step through before the window, for one event and for the file.
const MAX_PERIODS = 60_000;
const MAX_FILE_PERIODS = 600_000;
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;
const DAY_MS = 86_400_000;

export interface ParseWindow {
  // Epoch milliseconds: the window is [from, to].
  from: number;
  to: number;
  now: number;
  // The household's IANA zone: where a time with no zone, or one we cannot read, is taken to be.
  zone: string;
}

export type ParsedOccurrence =
  | { allDay: false; startMs: number; endMs: number; title: string; free: boolean; approx: boolean }
  | { allDay: true; startOn: string; endOn: string; title: string; free: boolean };

export interface ParseCounts {
  // Events in the file, whatever became of them.
  events: number;
  // Events or rules we could not use (no start, a bad date, a frequency finer than daily, a stopped expansion).
  skipped: number;
  // Occurrences kept whose time was read in the household zone because the zone was not known.
  approx: number;
  // True when more than 2,000 occurrences fell in the window and only the nearest to now were kept.
  truncated: boolean;
}

export type ParseResult =
  | { ok: true; occurrences: ParsedOccurrence[]; counts: ParseCounts }
  | { ok: false; internal: 'not_calendar' | 'too_big' | 'parse' };

type Jcal = [string, Array<[string, Record<string, unknown>, string, ...unknown[]]>, unknown[]];

const KEPT = new Set(['UID', 'SUMMARY', 'DTSTART', 'DTEND', 'DURATION', 'RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID', 'STATUS', 'TRANSP']);

// ---- Reading the text ----

interface Scanned {
  events: string[][];
}

// Unfolds the lines and keeps only the VEVENT properties we read. A VTIMEZONE, an alarm and any other block is dropped whole, so the
// parser never sees it and nesting depth costs one counter. Returns null when there are too many events.
function scan(text: string): Scanned | 'not_calendar' | 'too_big' {
  const lines: string[] = [];
  let pending: string[] | undefined;
  let pendingLength = 0;
  const flush = (): void => {
    if (pending !== undefined) lines.push(pendingLength > MAX_LINE ? '' : pending.join(''));
    pending = undefined;
    pendingLength = 0;
  };
  for (const raw of text.split(/\r\n|\n|\r/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && pending !== undefined) {
      if (pendingLength <= MAX_LINE) pending.push(raw.slice(1));
      pendingLength += raw.length - 1;
      continue;
    }
    flush();
    pending = [raw];
    pendingLength = raw.length;
  }
  flush();

  const events: string[][] = [];
  let sawCalendar = false;
  let inCalendar = false;
  let current: string[] | undefined;
  let skipDepth = 0;
  let eventLines = 0;
  for (const line of lines) {
    const colon = line.indexOf(':');
    const semicolon = line.indexOf(';');
    const end = [colon, semicolon].filter(index => index >= 0).sort((a, b) => a - b)[0] ?? line.length;
    const name = line.slice(0, end).trim().toUpperCase();
    if (name === 'BEGIN') {
      const kind = line.slice(colon + 1).trim().toUpperCase();
      if (kind === 'VEVENT') {
        eventLines += 1;
        if (eventLines > MAX_EVENTS) return 'too_big';
      }
      if (skipDepth > 0) skipDepth += 1;
      else if (kind === 'VCALENDAR' && !inCalendar) {
        inCalendar = true;
        sawCalendar = true;
      } else if (kind === 'VEVENT' && inCalendar && current === undefined) current = [];
      else skipDepth = 1;
      continue;
    }
    if (name === 'END') {
      if (skipDepth > 0) skipDepth -= 1;
      else if (current !== undefined) {
        events.push(current);
        current = undefined;
      } else if (inCalendar) inCalendar = false;
      continue;
    }
    if (current !== undefined && skipDepth === 0 && line.length <= MAX_LINE && KEPT.has(name)) current.push(line);
  }
  if (!sawCalendar) return 'not_calendar';
  return { events };
}

// ---- Text ----

const FORMAT_CHARS = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu;

function cleanTitle(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  // Line breaks and tabs become a space first, then the rest of the control and format characters go.
  const clean = text.replace(/[\r\n\t\u0085\u2028\u2029]+/gu, ' ').replace(FORMAT_CHARS, '').replace(/\s+/gu, ' ').trim();
  const cut = Array.from(clean).slice(0, MAX_TITLE).join('').trim();
  return cut === '' ? 'Busy' : cut;
}

// ---- Times ----

type ZoneRef = { kind: 'utc' } | { kind: 'zone'; name: string; approx: boolean };

interface Wall {
  day: string;
  // Seconds after midnight on the wall clock. Zero for a date.
  seconds: number;
  allDay: boolean;
  zone: ZoneRef;
}

const DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z?)$/;
const IANA_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

class BudgetError extends Error {}

// Time limits shared by the whole parse.
interface Budget {
  steps: number;
  periods: number;
  conversions: number;
  deadline: number;
}

class Zones {
  private readonly known = new Map<string, ZoneRef>();
  private readonly instants = new Map<string, number>();

  constructor(readonly household: string, readonly budget: Budget) {}

  // A wall-clock time as an instant. Each distinct time is worked out once, and the number worked out and the clock are both
  // limited, so a file of thousands of different times cannot run on.
  instant(day: string, seconds: number, zone: ZoneRef): number {
    const key = `${zone.kind === 'utc' ? 'Z' : zone.name}|${day}|${seconds}`;
    const known = this.instants.get(key);
    if (known !== undefined) return known;
    this.budget.conversions += 1;
    if (this.budget.conversions > MAX_CONVERSIONS || Date.now() > this.budget.deadline) throw new BudgetError('out of budget');
    const value = instantOf(day, seconds, zone);
    this.instants.set(key, value);
    return value;
  }

  resolve(tzid: unknown): ZoneRef {
    const home: ZoneRef = { kind: 'zone', name: this.household, approx: false };
    if (tzid === undefined) return home;
    const approx: ZoneRef = { kind: 'zone', name: this.household, approx: true };
    if (typeof tzid !== 'string' || tzid.length > 80) return approx;
    const cached = this.known.get(tzid);
    if (cached) return cached;
    const found = this.lookUp(tzid.trim()) ?? approx;
    if (this.known.size < 500) this.known.set(tzid, found);
    return found;
  }

  private lookUp(name: string): ZoneRef | undefined {
    const candidate = windowsZoneToIana(name) ?? (IANA_SHAPE.test(name) ? name : undefined);
    if (candidate === undefined) return undefined;
    const canonical = canonicalZone(candidate);
    return canonical === undefined ? undefined : { kind: 'zone', name: canonical, approx: false };
  }
}

function canonicalZone(name: string): string | undefined {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function toWall(type: string, value: unknown, tzid: unknown, zones: Zones): Wall | undefined {
  if (typeof value !== 'string') return undefined;
  if (type === 'date') {
    const match = DATE_VALUE.exec(value);
    if (!match || !validYear(match[1]) || !isRealDate(value)) return undefined;
    return { day: value, seconds: 0, allDay: true, zone: zones.resolve(undefined) };
  }
  const match = DATE_TIME_VALUE.exec(value);
  if (!match || !validYear(match[1])) return undefined;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  const [hour, minute, second] = [Number(match[4]), Number(match[5]), Number(match[6])];
  if (!isRealDate(day) || hour > 23 || minute > 59 || second > 60) return undefined;
  const zone: ZoneRef = match[7] === 'Z' ? { kind: 'utc' } : zones.resolve(tzid);
  return { day, seconds: hour * 3600 + minute * 60 + Math.min(second, 59), allDay: false, zone };
}

function validYear(text: string): boolean {
  const year = Number(text);
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function instantOf(day: string, seconds: number, zone: ZoneRef): number {
  if (zone.kind === 'utc') {
    const [year, month, date] = day.split('-').map(Number);
    return Date.UTC(year, month - 1, date) + seconds * 1000;
  }
  const hhmm = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}`;
  return zonedInstant(day, hhmm, zone.name) + (seconds % 60) * 1000;
}

function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDate] = from.split('-').map(Number);
  const [toYear, toMonth, toDate] = to.split('-').map(Number);
  return Math.round((Date.UTC(toYear, toMonth - 1, toDate) - Date.UTC(fromYear, fromMonth - 1, fromDate)) / DAY_MS);
}

const DURATION = /^([+-])?P(?:(\d{1,6})W)?(?:(\d{1,6})D)?(?:T(?:(\d{1,6})H)?(?:(\d{1,6})M)?(?:(\d{1,6})S)?)?$/;

// A duration in seconds, never negative.
function durationSeconds(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = DURATION.exec(value);
  if (!match) return undefined;
  if (match[1] === '-') return 0;
  const [weeks, days, hours, minutes, seconds] = match.slice(2).map(part => Number(part ?? 0));
  return weeks * 604_800 + days * 86_400 + hours * 3600 + minutes * 60 + seconds;
}

// ---- Repeat rules ----

const FREQUENCIES: readonly string[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const FINER: readonly string[] = ['SECONDLY', 'MINUTELY', 'HOURLY'];
const WEEKDAY_NUMBERS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAY = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i;
// The only parts of a rule we follow. A rule with any other BY part is refused, not guessed at.
const FOLLOWED = new Set(['freq', 'interval', 'count', 'until', 'wkst', 'bymonth', 'bymonthday', 'byday']);

interface Rule extends DayRule {
  until?: string;
}

// A month and a day of the month that can never fall together (February 30) would never match.
function monthAndDayCanMeet(months: number[] | undefined, days: number[] | undefined): boolean {
  if (months === undefined || days === undefined) return true;
  return days.some(day => months.some(month => Math.abs(day) <= DAYS_IN_MONTH[month - 1]));
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

const asInteger = (value: unknown): number | undefined => {
  const number = typeof value === 'string' && /^[+-]?\d{1,9}$/.test(value) ? Number(value) : value;
  return typeof number === 'number' && Number.isInteger(number) ? number : undefined;
};

function integers(value: unknown, min: number, max: number): number[] | undefined {
  const list = asList(value);
  if (list.length > MAX_LIST) return undefined;
  const numbers = list.map(asInteger);
  if (numbers.some(n => n === undefined || n < min || n > max || n === 0)) return undefined;
  return numbers as number[];
}

// Reads a rule from the library's jCal. This is an allow-list: only DAILY, WEEKLY, MONTHLY and YEARLY with INTERVAL, COUNT, UNTIL, WKST,
// BYMONTH, BYMONTHDAY and BYDAY are followed, in the combinations the standard allows and our expansion handles. Anything else (BYSETPOS,
// BYWEEKNO, BYYEARDAY, BYHOUR and the rest, a day of the week with a number the frequency does not take) is 'invalid', and the event
// is skipped and counted. A finer frequency than daily is 'finer'.
function readRule(value: unknown): Rule | 'finer' | 'invalid' {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'invalid';
  const raw = value as Record<string, unknown>;
  const name = typeof raw.freq === 'string' ? raw.freq.toUpperCase() : '';
  if (FINER.includes(name)) return 'finer';
  if (!FREQUENCIES.includes(name)) return 'invalid';
  const frequency = name as Frequency;
  if (Object.keys(raw).some(key => key.startsWith('by') && !FOLLOWED.has(key))) return 'invalid';

  const interval = raw.interval === undefined ? 1 : asInteger(raw.interval);
  if (interval === undefined || interval < 1 || interval > MAX_INTERVAL) return 'invalid';
  let count: number | undefined;
  if (raw.count !== undefined) {
    const parsed = asInteger(raw.count);
    if (parsed === undefined || parsed < 1) return 'invalid';
    count = Math.min(parsed, MAX_COUNT);
  }
  const until = typeof raw.until === 'string' ? raw.until : undefined;
  if (raw.until !== undefined && until === undefined) return 'invalid';

  let wkst = 1;
  if (raw.wkst !== undefined) {
    // The library hands WKST back as a number (1 is Sunday); a name is turned into the same number.
    const named = typeof raw.wkst === 'string' ? WEEKDAY_NUMBERS.indexOf(raw.wkst.toUpperCase()) : -1;
    const number = named >= 0 ? named + 1 : asInteger(raw.wkst);
    if (number === undefined || number < 1 || number > 7) return 'invalid';
    wkst = number - 1;
  }

  const bymonth = raw.bymonth === undefined ? undefined : integers(raw.bymonth, 1, 12);
  const bymonthday = raw.bymonthday === undefined ? undefined : integers(raw.bymonthday, -31, 31);
  if ((raw.bymonth !== undefined && !bymonth) || (raw.bymonthday !== undefined && !bymonthday)) return 'invalid';
  if (bymonthday && frequency === 'WEEKLY') return 'invalid';
  if (bymonthday?.some(day => day < 0) && frequency === 'DAILY') return 'invalid';
  if (!monthAndDayCanMeet(bymonth, bymonthday)) return 'invalid';

  let byday: Array<{ n: number; wd: number }> | undefined;
  if (raw.byday !== undefined) {
    const list = asList(raw.byday);
    if (list.length > MAX_LIST) return 'invalid';
    byday = [];
    for (const item of list) {
      const match = typeof item === 'string' ? WEEKDAY.exec(item) : null;
      if (!match) return 'invalid';
      const n = match[1] === undefined ? 0 : Number(match[1]);
      // A number is the nth such day of the month, so only a monthly rule takes one, and a yearly rule only within its months.
      if (n !== 0 && (Math.abs(n) > 5 || (frequency !== 'MONTHLY' && !(frequency === 'YEARLY' && bymonth)))) return 'invalid';
      byday.push({ n, wd: WEEKDAY_NUMBERS.indexOf(match[2].toUpperCase()) });
    }
  }
  return {
    frequency, interval, wkst,
    ...(count === undefined ? {} : { count }),
    ...(until === undefined ? {} : { until }),
    ...(bymonth ? { bymonth } : {}),
    ...(bymonthday ? { bymonthday } : {}),
    ...(byday ? { byday } : {}),
  };
}

// UNTIL as a time on the wall clock of the event's start. A time in universal time is converted to that clock; a date covers all of
// its day when the event has a time.
function untilOnWall(until: string, start: Wall): string | undefined {
  const date = DATE_VALUE.exec(until);
  if (date) return start.allDay ? until : `${until}T23:59:59`;
  const dateTime = DATE_TIME_VALUE.exec(until);
  if (!dateTime) return undefined;
  const day = `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`;
  if (!isRealDate(day) || !validYear(dateTime[1])) return undefined;
  if (start.allDay) return day;
  if (dateTime[7] !== 'Z') return until;
  const instant = instantOf(day, Number(dateTime[4]) * 3600 + Number(dateTime[5]) * 60 + Math.min(Number(dateTime[6]), 59), { kind: 'utc' });
  if (start.zone.kind === 'utc') return until.slice(0, -1);
  const wall = zonedWall(instant, start.zone.name);
  return `${wall.day}T${pad(Math.floor(wall.seconds / 3600))}:${pad(Math.floor((wall.seconds % 3600) / 60))}:${pad(wall.seconds % 60)}`;
}

// ---- Events ----

interface Prop {
  params: Record<string, unknown>;
  type: string;
  values: unknown[];
}

interface Parsed {
  uid?: string;
  title: string;
  free: boolean;
  cancelled: boolean;
  start?: Wall;
  // All-day: the length in days (at least 1). Timed: the length in milliseconds.
  length: number;
  isOverride: boolean;
  recurrenceId?: Wall;
  thisAndFuture: boolean;
  rule?: Rule | 'finer' | 'invalid';
  rdates: Wall[];
  exdates: Wall[];
  // More RDATE or EXDATE values than we keep.
  listsCut: boolean;
}

function propsOf(jcal: Jcal): Map<string, Prop[]> {
  const props = new Map<string, Prop[]>();
  for (const entry of jcal[1] ?? []) {
    const [name, params, type, ...values] = entry;
    const list = props.get(name) ?? [];
    list.push({ params: params ?? {}, type, values });
    props.set(name, list);
  }
  return props;
}

// RDATE and EXDATE may hold many values, and RDATE a period: the start of the period is the occurrence.
function wallsOf(list: Prop[] | undefined, zones: Zones): { walls: Wall[]; cut: boolean } {
  const walls: Wall[] = [];
  for (const prop of list ?? []) {
    for (const value of prop.values) {
      const text = Array.isArray(value) ? value[0] : value;
      const type = prop.type === 'period' ? 'date-time' : prop.type;
      const wall = toWall(type, text, prop.params.tzid, zones);
      if (!wall) continue;
      if (walls.length >= MAX_DATE_VALUES) return { walls, cut: true };
      walls.push(wall);
    }
  }
  return { walls, cut: false };
}

function readEvent(jcal: Jcal, zones: Zones): Parsed {
  const props = propsOf(jcal);
  const first = (name: string): Prop | undefined => props.get(name)?.[0];
  const startProp = first('dtstart');
  const start = startProp ? toWall(startProp.type, startProp.values[0], startProp.params.tzid, zones) : undefined;
  const idProp = first('recurrence-id');
  const rdates = wallsOf(props.get('rdate'), zones);
  const exdates = wallsOf(props.get('exdate'), zones);
  const uid = first('uid')?.values[0];
  return {
    ...(typeof uid === 'string' && uid.length <= 512 ? { uid } : {}),
    title: cleanTitle(first('summary')?.values[0]),
    free: String(first('transp')?.values[0] ?? '').toUpperCase() === 'TRANSPARENT',
    cancelled: String(first('status')?.values[0] ?? '').toUpperCase() === 'CANCELLED',
    ...(start ? { start } : {}),
    length: start ? lengthOf(start, first('dtend'), first('duration'), zones) : 0,
    isOverride: idProp !== undefined,
    ...(idProp ? { recurrenceId: toWall(idProp.type, idProp.values[0], idProp.params.tzid, zones) } : {}),
    thisAndFuture: String(idProp?.params.range ?? '').toUpperCase() === 'THISANDFUTURE',
    ...(first('rrule') ? { rule: readRule(first('rrule')?.values[0]) } : {}),
    rdates: rdates.walls,
    exdates: exdates.walls,
    listsCut: rdates.cut || exdates.cut,
  };
}

function lengthOf(start: Wall, endProp: Prop | undefined, durationProp: Prop | undefined, zones: Zones): number {
  if (start.allDay) {
    let days = 1;
    const end = endProp ? toWall(endProp.type, endProp.values[0], endProp.params.tzid, zones) : undefined;
    if (end) days = daysBetween(start.day, end.day);
    else if (durationProp) days = Math.ceil((durationSeconds(durationProp.values[0]) ?? 0) / 86_400);
    return Math.min(Math.max(days, 1), MAX_SPAN_DAYS);
  }
  const cap = MAX_SPAN_DAYS * DAY_MS;
  const end = endProp ? toWall(endProp.type, endProp.values[0], endProp.params.tzid, zones) : undefined;
  if (end) {
    const length = zones.instant(end.day, end.seconds, end.allDay ? start.zone : end.zone) - zones.instant(start.day, start.seconds, start.zone);
    return Math.min(Math.max(length, 0), cap);
  }
  if (durationProp) return Math.min((durationSeconds(durationProp.values[0]) ?? 0) * 1000, cap);
  return 0;
}

function parseOne(lines: string[], zones: Zones): Parsed | undefined {
  try {
    const jcal = ICAL.parse(['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')) as Jcal;
    return readEvent(jcal, zones);
  } catch {
    return undefined;
  }
}

// ---- Expansion ----

interface Excluded {
  instants: Set<number>;
  days: Set<string>;
}

const newExcluded = (): Excluded => ({ instants: new Set(), days: new Set() });

function exclude(set: Excluded, wall: Wall, zones: Zones): void {
  if (wall.allDay) set.days.add(wall.day);
  else set.instants.add(zones.instant(wall.day, wall.seconds, wall.zone));
}

// A date excludes every occurrence on that day; an instant excludes the occurrence at that instant.
function isExcluded(set: Excluded, wall: Wall, zones: Zones): boolean {
  if (set.days.has(wall.day)) return true;
  return !wall.allDay && set.instants.has(zones.instant(wall.day, wall.seconds, wall.zone));
}

interface Context {
  zones: Zones;
  range: ParseWindow;
  fromDay: string;
  toDay: string;
  budget: Budget;
  counts: ParseCounts;
}

function occurrenceAt(parsed: Parsed, wall: Wall, context: Context): ParsedOccurrence | undefined {
  if (wall.allDay) {
    const endOn = addDays(wall.day, parsed.length - 1);
    if (endOn < context.fromDay || wall.day > context.toDay) return undefined;
    return { allDay: true, startOn: wall.day, endOn, title: parsed.title, free: parsed.free };
  }
  const startMs = context.zones.instant(wall.day, wall.seconds, wall.zone);
  const endMs = startMs + parsed.length;
  if (endMs < context.range.from || startMs > context.range.to) return undefined;
  const approx = wall.zone.kind === 'zone' && wall.zone.approx;
  return { allDay: false, startMs, endMs, title: parsed.title, free: parsed.free, approx };
}

// The wall-clock starts of a repeat rule from our own expansion, up to the end of the window. Returns false when a limit stopped it.
function walkRule(parsed: Parsed, start: Wall, rule: Rule, context: Context, visit: (day: string, seconds: number) => void): boolean {
  const until = rule.until === undefined ? undefined : untilOnWall(rule.until, start);
  if (rule.until !== undefined && until === undefined) return false;
  const clock = `${pad(Math.floor(start.seconds / 3600))}:${pad(Math.floor((start.seconds % 3600) / 60))}:${pad(start.seconds % 60)}`;
  // How far back an occurrence can start and still reach the window.
  const span = start.allDay ? parsed.length : Math.ceil(parsed.length / DAY_MS) + 1;
  let eventSteps = 0;
  let periods = 0;
  return expandRule({
    rule,
    startDay: start.day,
    fromDay: addDays(context.fromDay, -(span + 2)),
    lastDay: addDays(context.toDay, 1),
    pastUntil: day => until !== undefined && (start.allDay ? day > until : `${day}T${clock}` > until),
    emit: day => {
      if (eventSteps >= MAX_EVENT_STEPS || context.budget.steps >= MAX_FILE_STEPS) return false;
      eventSteps += 1;
      context.budget.steps += 1;
      visit(day, start.seconds);
      return true;
    },
    tick: () => {
      periods += 1;
      context.budget.periods += 1;
      if (periods > MAX_PERIODS || context.budget.periods > MAX_FILE_PERIODS) return false;
      return periods % 256 !== 0 || Date.now() <= context.budget.deadline;
    },
  });
}

function expandMaster(parsed: Parsed, start: Wall, overridden: Excluded | undefined, context: Context): ParsedOccurrence[] {
  const found: ParsedOccurrence[] = [];
  const seen = new Set<string>();
  const excluded = newExcluded();
  for (const wall of parsed.exdates) exclude(excluded, wall, context.zones);

  const emit = (day: string, seconds: number): void => {
    const wall: Wall = { ...start, day, seconds };
    const key = wall.allDay ? day : String(context.zones.instant(day, seconds, wall.zone));
    if (seen.has(key)) return;
    seen.add(key);
    if (isExcluded(excluded, wall, context.zones) || (overridden !== undefined && isExcluded(overridden, wall, context.zones))) return;
    const occurrence = occurrenceAt(parsed, wall, context);
    if (occurrence) found.push(occurrence);
  };

  let complete = true;
  const rule = parsed.rule as Rule | undefined;
  // DTSTART is the first instance of the set, whether or not the rule would give it.
  emit(start.day, start.seconds);
  if (rule !== undefined) {
    try {
      complete = walkRule(parsed, start, rule, context, emit);
    } catch {
      complete = false;
    }
  }
  for (const wall of parsed.rdates) {
    if (context.budget.steps >= MAX_FILE_STEPS) {
      complete = false;
      break;
    }
    context.budget.steps += 1;
    emit(wall.day, wall.seconds);
  }
  if (!complete) context.counts.skipped += 1;
  return found;
}

// ---- The whole file ----

function validWindow(span: ParseWindow): boolean {
  return [span.from, span.to, span.now].every(Number.isFinite) && span.from <= span.to && canonicalZone(span.zone) !== undefined;
}


export interface ParseLimits {
  // How long expansion may run before it stops and keeps what it has. The worker's own time limit is the backstop.
  budgetMs?: number;
}

// Each occurrence with the instant it starts, worked out once: an all-day date starts at midnight in the household zone.
function sortKeys(list: ParsedOccurrence[], zone: string): Array<{ occurrence: ParsedOccurrence; start: number }> {
  const midnights = new Map<string, number>();
  return list.map(occurrence => {
    if (!occurrence.allDay) return { occurrence, start: occurrence.startMs };
    let start = midnights.get(occurrence.startOn);
    if (start === undefined) {
      start = zonedInstant(occurrence.startOn, '00:00', zone);
      midnights.set(occurrence.startOn, start);
    }
    return { occurrence, start };
  });
}

export function parseCore(input: string, span: ParseWindow, limits: ParseLimits = {}): ParseResult {
  if (typeof input !== 'string' || !validWindow(span)) return { ok: false, internal: 'parse' };
  if (input.length > MAX_INPUT_CHARS) return { ok: false, internal: 'too_big' };
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const scanned = scan(text);
  if (scanned === 'not_calendar' || scanned === 'too_big') return { ok: false, internal: scanned };

  const zone = canonicalZone(span.zone) as string;
  const budget: Budget = { steps: 0, periods: 0, conversions: 0, deadline: Date.now() + (limits.budgetMs ?? DEFAULT_BUDGET_MS) };
  const zones = new Zones(zone, budget);
  const counts: ParseCounts = { events: scanned.events.length, skipped: 0, approx: 0, truncated: false };
  const context: Context = { zones, range: span, fromDay: dayInZone(span.from, zone), toDay: dayInZone(span.to, zone), counts, budget };

  const masters: Parsed[] = [];
  const replaced = new Map<string, Excluded>();
  const found: ParsedOccurrence[] = [];
  for (const lines of scanned.events) {
    const parsed = parseOne(lines, zones);
    if (!parsed) {
      counts.skipped += 1;
      continue;
    }
    if (parsed.listsCut) counts.skipped += 1;
    if (!parsed.isOverride) {
      masters.push(parsed);
      continue;
    }
    if (parsed.thisAndFuture) {
      counts.skipped += 1;
      continue;
    }
    try {
      if (parsed.uid !== undefined && parsed.recurrenceId !== undefined) {
        const set = replaced.get(parsed.uid) ?? newExcluded();
        exclude(set, parsed.recurrenceId, zones);
        replaced.set(parsed.uid, set);
      }
      if (parsed.cancelled) continue;
      if (!parsed.start) {
        counts.skipped += 1;
        continue;
      }
      const occurrence = occurrenceAt(parsed, parsed.start, context);
      if (occurrence) found.push(occurrence);
    } catch {
      counts.skipped += 1;
    }
  }

  for (const parsed of masters) {
    if (Date.now() > budget.deadline) {
      counts.skipped += 1;
      continue;
    }
    if (!parsed.start) {
      counts.skipped += 1;
      continue;
    }
    if (parsed.cancelled) continue;
    if (parsed.rule === 'finer' || parsed.rule === 'invalid') {
      counts.skipped += 1;
      continue;
    }
    const repeats = parsed.rule !== undefined || parsed.rdates.length > 0;
    const overridden = parsed.uid === undefined ? undefined : replaced.get(parsed.uid);
    if (repeats && budget.steps >= MAX_FILE_STEPS) {
      counts.skipped += 1;
      continue;
    }
    try {
      for (const occurrence of expandMaster(parsed, parsed.start, overridden, context)) found.push(occurrence);
    } catch {
      counts.skipped += 1;
    }
  }

  let keyed = sortKeys(found, zone);
  if (keyed.length > MAX_OCCURRENCES) {
    counts.truncated = true;
    keyed = keyed.sort((a, b) => Math.abs(a.start - span.now) - Math.abs(b.start - span.now)).slice(0, MAX_OCCURRENCES);
  }
  keyed.sort((a, b) => a.start - b.start);
  const kept = keyed.map(entry => entry.occurrence);
  counts.approx = kept.filter(occurrence => !occurrence.allDay && occurrence.approx).length;
  return { ok: true, occurrences: kept, counts };
}
