// Our own expansion of a repeat rule, in wall-clock days. It supports exactly the shapes listed in `readRule` (parseCore.ts) and has no
// loop that can run past the window: every loop ends at a day we choose, counts its periods, and asks `tick` whether to go on. The
// library's iterator is not used, because one call of it cannot be interrupted and some rules make it spin or abort the process.

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface DayRule {
  frequency: Frequency;
  interval: number;
  // Occurrences in all, counting the start. Absent means no limit.
  count?: number;
  bymonth?: number[];
  // 1 to 31, or -1 to -31 from the end of the month.
  bymonthday?: number[];
  // `n` is 0 for every such weekday, or the nth (negative from the end). `wd` is 0 for Sunday.
  byday?: Array<{ n: number; wd: number }>;
  // The day a week starts on, 0 for Sunday.
  wkst: number;
}

const DAY_MS = 86_400_000;
const MAX_YEAR = 2200;
const pad = (n: number): string => String(n).padStart(2, '0');

export const dayNum = (day: string): number => {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / DAY_MS;
};
export const dayText = (num: number): string => new Date(num * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (num: number): number => (((num + 4) % 7) + 7) % 7;
const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();
const firstOf = (year: number, month: number): number => dayNum(`${String(year).padStart(4, '0')}-${pad(month)}-01`);

// The days of one month the rule picks, in order. With no BYMONTHDAY or BYDAY it is the start's day of the month, in a month that has it.
function monthDays(rule: DayRule, year: number, month: number, startDate: number): number[] {
  const length = daysInMonth(year, month);
  let picked: Set<number> | undefined;
  if (rule.bymonthday) picked = new Set(rule.bymonthday.map(day => (day > 0 ? day : length + 1 + day)).filter(day => day >= 1 && day <= length));
  if (rule.byday) {
    const first = firstOf(year, month);
    const hits = new Set<number>();
    for (const { n, wd } of rule.byday) {
      const days: number[] = [];
      for (let day = 1; day <= length; day += 1) if (weekdayOf(first + day - 1) === wd) days.push(day);
      if (n === 0) days.forEach(day => hits.add(day));
      else {
        const one = n > 0 ? days[n - 1] : days[days.length + n];
        if (one !== undefined) hits.add(one);
      }
    }
    picked = picked ? new Set([...picked].filter(day => hits.has(day))) : hits;
  }
  if (!picked) return startDate <= length ? [startDate] : [];
  return [...picked].sort((a, b) => a - b);
}

export interface ExpandInput {
  rule: DayRule;
  // The first instance, which is not given again.
  startDay: string;
  // Days before this are counted (for COUNT) but not given.
  fromDay: string;
  // The last day worth giving.
  lastDay: string;
  // True once a day is past the rule's UNTIL.
  pastUntil: (day: string) => boolean;
  // Called for each day to give; false stops the expansion.
  emit: (day: string) => boolean;
  // Called once for each period examined; false stops the expansion.
  tick: () => boolean;
}

// Returns false when `emit` or `tick` stopped it before the end.
export function expandRule(input: ExpandInput): boolean {
  const { rule, emit, tick } = input;
  const startN = dayNum(input.startDay);
  const fromN = dayNum(input.fromDay);
  const lastN = dayNum(input.lastDay);
  const [startYear, startMonth, startDate] = input.startDay.split('-').map(Number);
  const startIndex = startYear * 12 + startMonth - 1;
  const startWeekday = weekdayOf(startN);
  const weekStartN = startN - ((startWeekday - rule.wkst + 7) % 7);
  const [fromYear, fromMonth] = input.fromDay.split('-').map(Number);
  const wanted = (day: number): boolean => !rule.bymonth || rule.bymonth.includes(Number(dayText(day).slice(5, 7)));

  // With a COUNT every earlier period has to be counted, so it starts at the beginning; without one it starts at the window.
  const skipTo = rule.count !== undefined ? 0 : {
    DAILY: Math.floor((fromN - startN) / rule.interval),
    WEEKLY: Math.floor((fromN - weekStartN) / (7 * rule.interval)),
    MONTHLY: Math.floor((fromYear * 12 + fromMonth - 1 - startIndex) / rule.interval),
    YEARLY: Math.floor((fromYear - startYear) / rule.interval),
  }[rule.frequency];

  // The days of one period, in order, and the first day of the period.
  const period = (i: number): { first: number; days: number[] } => {
    switch (rule.frequency) {
      case 'DAILY': {
        const day = startN + i * rule.interval;
        const [year, month] = dayText(day).split('-').map(Number);
        const date = Number(dayText(day).slice(8, 10));
        const monthOk = !rule.bymonth || rule.bymonth.includes(month);
        const dateOk = !rule.bymonthday || rule.bymonthday.some(want => (want > 0 ? want : daysInMonth(year, month) + 1 + want) === date);
        const dayOk = !rule.byday || rule.byday.some(({ wd }) => wd === weekdayOf(day));
        return { first: day, days: monthOk && dateOk && dayOk ? [day] : [] };
      }
      case 'WEEKLY': {
        const first = weekStartN + i * rule.interval * 7;
        const days: number[] = [];
        for (let offset = 0; offset < 7; offset += 1) {
          const day = first + offset;
          const hit = rule.byday ? rule.byday.some(({ wd }) => wd === weekdayOf(day)) : weekdayOf(day) === startWeekday;
          if (hit && wanted(day)) days.push(day);
        }
        return { first, days };
      }
      case 'MONTHLY': {
        const index = startIndex + i * rule.interval;
        const year = Math.floor(index / 12);
        const month = (index % 12) + 1;
        if (rule.bymonth && !rule.bymonth.includes(month)) return { first: firstOf(year, month), days: [] };
        return { first: firstOf(year, month), days: monthDays(rule, year, month, startDate).map(date => firstOf(year, month) + date - 1) };
      }
      case 'YEARLY': {
        const year = startYear + i * rule.interval;
        const months = rule.bymonth ? [...rule.bymonth].sort((a, b) => a - b) : rule.bymonthday || rule.byday ? Array.from({ length: 12 }, (_, m) => m + 1) : [startMonth];
        const days = months.flatMap(month => monthDays(rule, year, month, startDate).map(date => firstOf(year, month) + date - 1));
        return { first: firstOf(year, 1), days };
      }
    }
  };

  let seen = 1;
  for (let i = Math.max(0, skipTo); ; i += 1) {
    if (!tick()) return false;
    const { first, days } = period(i);
    if (first > lastN || Number(dayText(first).slice(0, 4)) > MAX_YEAR) return true;
    for (const day of days) {
      if (day <= startN) continue;
      if (day > lastN || input.pastUntil(dayText(day))) return true;
      seen += 1;
      if (rule.count !== undefined && seen > rule.count) return true;
      if (day >= fromN && !emit(dayText(day))) return false;
    }
  }
}
