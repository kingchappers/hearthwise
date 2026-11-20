// Wall-clock times to instants, to the minute. Hearthwise events are stored as the time on a clock in the household's zone, and
// become an instant only when something must be compared with now (a reminder, "Now and next").
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const FORMATS = new Map<string, Intl.DateTimeFormat>();

function formatFor(timeZone: string): Intl.DateTimeFormat {
  let format = FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    FORMATS.set(timeZone, format);
  }
  return format;
}

// How far the zone's clock is ahead of UTC at an instant, in milliseconds.
function offsetAt(ms: number, timeZone: string): number {
  const whole = Math.floor(ms / 1000) * 1000;
  const parts = formatFor(timeZone).formatToParts(new Date(whole));
  const part = (type: string): number => Number(parts.find(candidate => candidate.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - whole;
}

// The first instant from `from` (which has offset `before`) at which the zone's offset is something else, to the millisecond.
function transitionAfter(from: number, to: number, before: number, timeZone: string): number {
  let low = from;
  let high = to;
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (offsetAt(middle, timeZone) === before) low = middle;
    else high = middle;
  }
  return high;
}

// The instant at which a clock in `timeZone` reads `day` `hhmm`. A time that does not exist (the clocks went forward over it) gives
// the first moment after the gap. A time that happens twice (the clocks went back) gives the first one.
export function zonedInstant(day: string, hhmm: string, timeZone: string): number {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);

  const earlier = offsetAt(wall - DAY_MS, timeZone);
  const later = offsetAt(wall + DAY_MS, timeZone);
  const valid = [...new Set([earlier, later])].map(offset => wall - offset).filter(instant => offsetAt(instant, timeZone) === wall - instant);
  if (valid.length > 0) return Math.min(...valid);

  // In the gap: the offsets either side differ, and the clock jumped over this time.
  return transitionAfter(wall - earlier - HOUR_MS * 12, wall - later + HOUR_MS * 12, earlier, timeZone);
}

// The clock in `timeZone` at an instant: the day and the seconds after midnight.
export function zonedWall(ms: number, timeZone: string): { day: string; seconds: number } {
  const local = new Date(Math.floor(ms / 1000) * 1000 + offsetAt(ms, timeZone));
  return { day: local.toISOString().slice(0, 10), seconds: local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds() };
}
