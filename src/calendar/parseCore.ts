import ICAL from 'ical.js';
import { addDays, dayInZone, isRealDate } from '../shared/schedule';
import { zonedInstant } from '../shared/zoned';
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

class Zones {
  private readonly known = new Map<string, ZoneRef>();

  constructor(readonly household: string) {}

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

// ---- Events ----

interface Prop {
  params: Record<string, unknown>;
  type: string;
  values: unknown[];
}

interface Event {
  title: string;
  free: boolean;
  cancelled: boolean;
  start: Wall;
  // All-day: the length in days (at least 1). Timed: the length in milliseconds.
  length: number;
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

function readEvent(jcal: Jcal, zones: Zones): Event | undefined {
  const props = propsOf(jcal);
  const first = (name: string): Prop | undefined => props.get(name)?.[0];
  const startProp = first('dtstart');
  if (!startProp) return undefined;
  const start = toWall(startProp.type, startProp.values[0], startProp.params.tzid, zones);
  if (!start) return undefined;

  return {
    title: cleanTitle(first('summary')?.values[0]),
    free: String(first('transp')?.values[0] ?? '').toUpperCase() === 'TRANSPARENT',
    cancelled: String(first('status')?.values[0] ?? '').toUpperCase() === 'CANCELLED',
    start,
    length: lengthOf(start, first('dtend'), first('duration'), zones),
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
    const length = instantOf(end.day, end.seconds, end.allDay ? start.zone : end.zone) - instantOf(start.day, start.seconds, start.zone);
    return Math.min(Math.max(length, 0), cap);
  }
  if (durationProp) return Math.min((durationSeconds(durationProp.values[0]) ?? 0) * 1000, cap);
  return 0;
}

function occurrenceOf(event: Event, window: ParseWindow, fromDay: string, toDay: string): ParsedOccurrence | undefined {
  if (event.start.allDay) {
    const endOn = addDays(event.start.day, event.length - 1);
    if (endOn < fromDay || event.start.day > toDay) return undefined;
    return { allDay: true, startOn: event.start.day, endOn, title: event.title, free: event.free };
  }
  const startMs = instantOf(event.start.day, event.start.seconds, event.start.zone);
  const endMs = startMs + event.length;
  if (endMs < window.from || startMs > window.to) return undefined;
  const approx = event.start.zone.kind === 'zone' && event.start.zone.approx;
  return { allDay: false, startMs, endMs, title: event.title, free: event.free, approx };
}

// ---- The whole file ----

function validWindow(window: ParseWindow): boolean {
  return [window.from, window.to, window.now].every(Number.isFinite) && window.from <= window.to && canonicalZone(window.zone) !== undefined;
}

const startOf = (occurrence: ParsedOccurrence, zone: string): number =>
  occurrence.allDay ? zonedInstant(occurrence.startOn, '00:00', zone) : occurrence.startMs;

export function parseCore(input: string, window: ParseWindow): ParseResult {
  if (typeof input !== 'string' || !validWindow(window)) return { ok: false, internal: 'parse' };
  if (input.length > MAX_INPUT_CHARS) return { ok: false, internal: 'too_big' };
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const scanned = scan(text);
  if (scanned === 'not_calendar' || scanned === 'too_big') return { ok: false, internal: scanned };

  const zone = canonicalZone(window.zone) as string;
  const zones = new Zones(zone);
  const fromDay = dayInZone(window.from, zone);
  const toDay = dayInZone(window.to, zone);
  const counts: ParseCounts = { events: scanned.events.length, skipped: 0, approx: 0, truncated: false };
  const found: ParsedOccurrence[] = [];

  for (const lines of scanned.events) {
    const event = readParsed(lines, zones);
    if (!event) {
      counts.skipped += 1;
      continue;
    }
    if (event.cancelled) continue;
    const occurrence = occurrenceOf(event, window, fromDay, toDay);
    if (occurrence) found.push(occurrence);
  }

  let kept = found;
  if (kept.length > MAX_OCCURRENCES) {
    counts.truncated = true;
    kept = [...kept].sort((a, b) => Math.abs(startOf(a, zone) - window.now) - Math.abs(startOf(b, zone) - window.now)).slice(0, MAX_OCCURRENCES);
  }
  kept.sort((a, b) => startOf(a, zone) - startOf(b, zone));
  counts.approx = kept.filter(occurrence => !occurrence.allDay && occurrence.approx).length;
  return { ok: true, occurrences: kept, counts };
}

function readParsed(lines: string[], zones: Zones): Event | undefined {
  try {
    const jcal = ICAL.parse(['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')) as Jcal;
    return readEvent(jcal, zones);
  } catch {
    return undefined;
  }
}
