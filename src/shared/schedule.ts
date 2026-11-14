// Repeat rules and due-date maths, shared by the API and the app. Everything here works on calendar dates ('YYYY-MM-DD'), never on
// hours, so a daylight-saving change day is just another day.
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type Repeat =
  | { type: 'none' }
  | { type: 'after'; days: number }
  | { type: 'fixed'; every: number; unit: 'day' | 'week' | 'month'; weekdays?: Weekday[]; dayOfMonth?: number; startOn: string };

type FixedRepeat = Extract<Repeat, { type: 'fixed' }>;

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const MS_PER_DAY = 86_400_000;
const DAY_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
// The longest gap between two occurrences of any valid rule is under 52 months; this bounds the search for the next one.
const SEARCH_LIMIT_DAYS = 366 * 60;

function dayNumber(day: string): number {
  const [, year, month, date] = DAY_FORMAT.exec(day) ?? [];
  return Date.UTC(Number(year), Number(month) - 1, Number(date)) / MS_PER_DAY;
}

function fromDayNumber(number: number): string {
  return new Date(number * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return fromDayNumber(dayNumber(day) + n);
}

export function isRealDate(day: string): boolean {
  if (!DAY_FORMAT.test(day)) return false;
  return fromDayNumber(dayNumber(day)) === day;
}

// The calendar day an instant falls on in a time zone: a completion at 23:30 UTC on 30 June is 1 July in London.
export function dayInZone(ms: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const part = (type: string): string => parts.find(candidate => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Monday is 0. 1970-01-01 was a Thursday.
const mondayIndex = (number: number): number => (((number + 3) % 7) + 7) % 7;
const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

function occursOn(rule: FixedRepeat, day: string): boolean {
  if (day < rule.startOn) return false;
  const number = dayNumber(day);
  const start = dayNumber(rule.startOn);

  if (rule.unit === 'day') return (number - start) % rule.every === 0;

  if (rule.unit === 'week') {
    const weekday = WEEKDAYS[mondayIndex(number)];
    const allowed = rule.weekdays && rule.weekdays.length > 0 ? rule.weekdays : [WEEKDAYS[mondayIndex(start)]];
    if (!allowed.includes(weekday)) return false;
    const weeksFromStart = Math.floor((number - mondayIndex(number) - (start - mondayIndex(start))) / 7);
    return weeksFromStart % rule.every === 0;
  }

  const [year, month, date] = day.split('-').map(Number);
  const [startYear, startMonth, startDate] = rule.startOn.split('-').map(Number);
  if (((year * 12 + month) - (startYear * 12 + startMonth)) % rule.every !== 0) return false;
  return date === Math.min(rule.dayOfMonth ?? startDate, daysInMonth(year, month));
}

// The first date on or after `day` that the rule gives. An `after` rule or no rule has no calendar, so any day will do.
export function firstOnOrAfter(repeat: Repeat, day: string): string {
  if (repeat.type !== 'fixed') return day;
  let candidate = day < repeat.startOn ? repeat.startOn : day;
  for (let step = 0; step < SEARCH_LIMIT_DAYS; step += 1) {
    if (occursOn(repeat, candidate)) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

// Where a task goes when a cycle is completed. `cycleDueOn` is the date the completed cycle was due.
export function nextDueOn(repeat: Repeat, cycleDueOn: string | undefined, completionDay: string): string | null {
  if (repeat.type === 'none') return null;
  if (repeat.type === 'after') {
    const counted = addDays(completionDay, repeat.days);
    if (cycleDueOn === undefined) return counted;
    const pastCycle = addDays(cycleDueOn, 1);
    return counted > pastCycle ? counted : pastCycle;
  }
  // The first occurrence after the cycle, and after the completion day: missed occurrences do not pile up.
  const afterCycle = cycleDueOn === undefined ? completionDay : cycleDueOn;
  const earliest = addDays(afterCycle > completionDay ? afterCycle : completionDay, 1);
  return firstOnOrAfter(repeat, earliest);
}

export function isDue(task: { dueOn?: string; status: 'open' | 'done' }, today: string): boolean {
  return task.status === 'open' && task.dueOn !== undefined && task.dueOn <= today;
}
