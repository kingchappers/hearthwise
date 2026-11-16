import { describe, expect, it } from 'vitest';
import { parseCore, type ParseWindow, type ParsedOccurrence } from '../parseCore';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 0, 0);
const windowAt = (now: number, zone = 'Europe/London'): ParseWindow => ({ from: now - 14 * DAY, to: now + 120 * DAY, now, zone });
const JUNE = windowAt(NOW);

const calendar = (...parts: string[]): string => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...parts, 'END:VCALENDAR', ''].join('\r\n');
const vevent = (...lines: string[]): string => ['BEGIN:VEVENT', 'UID:' + Math.random().toString(36).slice(2) + '@test', ...lines, 'END:VEVENT'].join('\r\n');

function occurrencesOf(text: string, window: ParseWindow = JUNE): ParsedOccurrence[] {
  const result = parseCore(text, window);
  if (!result.ok) throw new Error(`parse failed: ${result.internal}`);
  return result.occurrences;
}

const at = (iso: string): number => Date.parse(iso);

describe('parseCore: times', () => {
  it('reads a time ending in Z as universal time', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Lunch', 'DTSTART:20260701T090000Z', 'DTEND:20260701T100000Z')));
    expect(one).toEqual({ allDay: false, startMs: at('2026-07-01T09:00:00Z'), endMs: at('2026-07-01T10:00:00Z'), title: 'Lunch', free: false, approx: false });
  });

  it('reads a floating time in the household zone', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Lunch', 'DTSTART:20260701T090000', 'DTEND:20260701T100000')));
    expect(one).toMatchObject({ startMs: at('2026-07-01T08:00:00Z'), approx: false });
  });

  it('converts an IANA TZID', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Call', 'DTSTART;TZID=America/New_York:20260701T090000', 'DTEND;TZID=America/New_York:20260701T100000')));
    expect(one).toMatchObject({ startMs: at('2026-07-01T13:00:00Z'), endMs: at('2026-07-01T14:00:00Z'), approx: false });
  });

  it('converts a Windows TZID', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Call', 'DTSTART;TZID=W. Europe Standard Time:20260701T090000', 'DTEND;TZID=W. Europe Standard Time:20260701T100000')));
    expect(one).toMatchObject({ startMs: at('2026-07-01T07:00:00Z'), approx: false });
  });

  it('reads an unknown TZID in the household zone and marks it approx', () => {
    const result = parseCore(calendar(vevent('SUMMARY:Call', 'DTSTART;TZID=Customized Time Zone:20260701T090000')), JUNE);
    expect(result).toMatchObject({ ok: true, counts: { approx: 1 } });
    expect(result.ok && result.occurrences[0]).toMatchObject({ startMs: at('2026-07-01T08:00:00Z'), approx: true });
  });

  it('reads a TZID that is not a zone name in the household zone, whatever it looks like', () => {
    for (const tzid of ['+05:00', '../../etc/passwd', 'europe/LONDON/x/y/z', 'a'.repeat(500), 'Etc/GMT-14junk']) {
      const [one] = occurrencesOf(calendar(vevent('SUMMARY:Call', `DTSTART;TZID="${tzid}":20260701T090000`)));
      expect(one, tzid).toMatchObject({ startMs: at('2026-07-01T08:00:00Z'), approx: true });
    }
  });

  it('ignores a VTIMEZONE block, so the file cannot redefine a zone', () => {
    const vtimezone = ['BEGIN:VTIMEZONE', 'TZID:Europe/London', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0500', 'TZOFFSETTO:+0500', 'END:STANDARD', 'END:VTIMEZONE'].join('\r\n');
    const [one] = occurrencesOf(calendar(vtimezone, vevent('SUMMARY:Call', 'DTSTART;TZID=Europe/London:20260701T090000')));
    expect(one).toMatchObject({ startMs: at('2026-07-01T08:00:00Z'), approx: false });
  });

  it('puts the time in the gap after a clock change forward', () => {
    const march = windowAt(at('2026-03-20T12:00:00Z'));
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Gap', 'DTSTART;TZID=Europe/London:20260329T013000')), march);
    expect(one).toMatchObject({ startMs: at('2026-03-29T01:00:00Z') });
  });

  it('keeps seconds', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Sec', 'DTSTART:20260701T090030Z')));
    expect(one).toMatchObject({ startMs: at('2026-07-01T09:00:30Z') });
  });
});

describe('parseCore: length', () => {
  it('uses DURATION for the length of a timed event', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Run', 'DTSTART:20260701T090000Z', 'DURATION:PT1H30M')));
    expect(one).toMatchObject({ endMs: at('2026-07-01T10:30:00Z') });
  });

  it('gives a timed event with no end no length', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Ping', 'DTSTART:20260701T090000Z')));
    expect(one).toMatchObject({ startMs: at('2026-07-01T09:00:00Z'), endMs: at('2026-07-01T09:00:00Z') });
  });

  it('gives a negative or absurd length no length or a capped length', () => {
    const backwards = occurrencesOf(calendar(vevent('SUMMARY:Back', 'DTSTART:20260701T090000Z', 'DTEND:20260701T080000Z')))[0];
    expect(backwards).toMatchObject({ endMs: at('2026-07-01T09:00:00Z') });
    const long = occurrencesOf(calendar(vevent('SUMMARY:Long', 'DTSTART:20260701T090000Z', 'DTEND:99991231T090000Z')))[0];
    expect((long as { endMs: number }).endMs - (long as { startMs: number }).startMs).toBeLessThanOrEqual(366 * DAY);
  });
});

describe('parseCore: all-day events', () => {
  it('turns the exclusive end date into an inclusive one', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Trip', 'DTSTART;VALUE=DATE:20260701', 'DTEND;VALUE=DATE:20260704')));
    expect(one).toEqual({ allDay: true, startOn: '2026-07-01', endOn: '2026-07-03', title: 'Trip', free: false });
  });

  it('takes one all-day event with no end as one day', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Birthday', 'DTSTART;VALUE=DATE:20260701')));
    expect(one).toMatchObject({ allDay: true, startOn: '2026-07-01', endOn: '2026-07-01' });
  });

  it('uses DURATION in days or weeks', () => {
    const days = occurrencesOf(calendar(vevent('SUMMARY:A', 'DTSTART;VALUE=DATE:20260701', 'DURATION:P3D')))[0];
    expect(days).toMatchObject({ endOn: '2026-07-03' });
    const week = occurrencesOf(calendar(vevent('SUMMARY:B', 'DTSTART;VALUE=DATE:20260701', 'DURATION:P1W')))[0];
    expect(week).toMatchObject({ endOn: '2026-07-07' });
  });

  it('never moves an all-day event to another date, whatever the zone', () => {
    const sydney = windowAt(NOW, 'Australia/Sydney');
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Birthday', 'DTSTART;VALUE=DATE:20260701')), sydney);
    expect(one).toMatchObject({ startOn: '2026-07-01', endOn: '2026-07-01' });
  });
});

describe('parseCore: what is kept', () => {
  it('drops cancelled events', () => {
    expect(occurrencesOf(calendar(vevent('SUMMARY:Gone', 'STATUS:CANCELLED', 'DTSTART:20260701T090000Z')))).toEqual([]);
  });

  it('marks a transparent event as free', () => {
    expect(occurrencesOf(calendar(vevent('SUMMARY:Maybe', 'TRANSP:TRANSPARENT', 'DTSTART:20260701T090000Z')))[0]).toMatchObject({ free: true });
  });

  it('drops a one-off that ended before the window or starts after it', () => {
    const text = calendar(
      vevent('SUMMARY:Old', 'DTSTART:20260101T090000Z', 'DTEND:20260101T100000Z'),
      vevent('SUMMARY:Far', 'DTSTART:20270101T090000Z'),
      vevent('SUMMARY:Now', 'DTSTART:20260615T090000Z'),
    );
    expect(occurrencesOf(text).map(o => o.title)).toEqual(['Now']);
  });

  it('keeps an event that began before the window and is still running', () => {
    const text = calendar(vevent('SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20260525', 'DTEND;VALUE=DATE:20260605'), vevent('SUMMARY:Ended', 'DTSTART;VALUE=DATE:20260525', 'DTEND;VALUE=DATE:20260528'));
    expect(occurrencesOf(text).map(o => o.title)).toEqual(['Holiday']);
  });

  it('skips and counts an event with no usable start', () => {
    const text = calendar(vevent('SUMMARY:No start'), vevent('SUMMARY:Bad', 'DTSTART:20261345T090000Z'), vevent('SUMMARY:Huge', 'DTSTART:99991231T090000Z'), vevent('SUMMARY:Ok', 'DTSTART:20260701T090000Z'));
    const result = parseCore(text, JUNE);
    expect(result).toMatchObject({ ok: true, counts: { events: 4, skipped: 3 } });
    expect(result.ok && result.occurrences.map(o => o.title)).toEqual(['Ok']);
  });

  it('sorts by start', () => {
    const text = calendar(vevent('SUMMARY:B', 'DTSTART:20260702T090000Z'), vevent('SUMMARY:A', 'DTSTART:20260701T090000Z'));
    expect(occurrencesOf(text).map(o => o.title)).toEqual(['A', 'B']);
  });
});

describe('parseCore: titles', () => {
  const titleOf = (summary: string): string => occurrencesOf(calendar(vevent(summary, 'DTSTART:20260701T090000Z')))[0].title;

  it('unescapes text and unfolds lines', () => {
    expect(titleOf('SUMMARY:Lunch\\, then\\n a walk')).toBe('Lunch, then a walk');
    const folded = calendar(vevent('SUMMARY:Very long', ' title here', 'DTSTART:20260701T090000Z'));
    expect(occurrencesOf(folded)[0].title).toBe('Very longtitle here');
  });

  it('removes control, bidirectional and zero-width characters', () => {
    expect(titleOf('SUMMARY:a\u0007b\u202Ec\u2066d\u200Be\u200Ff\u2060g\uFEFFhi')).toBe('abcdefghi');
  });

  it('cuts to 120 characters without splitting a surrogate pair', () => {
    const title = titleOf('SUMMARY:' + '\u{1F600}'.repeat(200));
    expect(Array.from(title)).toHaveLength(120);
    expect(title).not.toMatch(/\p{Cs}/u);
  });

  it('says Busy when there is no title', () => {
    expect(occurrencesOf(calendar(vevent('DTSTART:20260701T090000Z')))[0].title).toBe('Busy');
    expect(titleOf('SUMMARY:\u200B  \u202E')).toBe('Busy');
  });

  it('keeps nothing else from the event', () => {
    const [one] = occurrencesOf(calendar(vevent('SUMMARY:Hi', 'DESCRIPTION:secret', 'LOCATION:Home', 'ATTENDEE:mailto:a@b.c', 'URL:https://x.example', 'DTSTART:20260701T090000Z')));
    expect(Object.keys(one).sort()).toEqual(['allDay', 'approx', 'endMs', 'free', 'startMs', 'title']);
  });
});

describe('parseCore: the text', () => {
  it('reads a file with a byte-order mark and bare line feeds', () => {
    const text = '\uFEFF' + calendar(vevent('SUMMARY:Hi', 'DTSTART:20260701T090000Z')).replace(/\r\n/g, '\n');
    expect(occurrencesOf(text)).toHaveLength(1);
  });

  it('is not a calendar without BEGIN:VCALENDAR', () => {
    expect(parseCore('hello', JUNE)).toEqual({ ok: false, internal: 'not_calendar' });
    expect(parseCore('', JUNE)).toEqual({ ok: false, internal: 'not_calendar' });
  });

  it('gives too_big for more than 3,000 events, counted even when the lines are folded', () => {
    const many = (n: number): string => calendar(...Array.from({ length: n }, () => 'BEGIN:VEVENT\r\nEND:VEVENT'));
    expect(parseCore(many(3000), JUNE)).toMatchObject({ ok: true });
    expect(parseCore(many(3001), JUNE)).toEqual({ ok: false, internal: 'too_big' });
    const folded = calendar(...Array.from({ length: 3001 }, () => 'BEGIN:VEV\r\n ENT\r\nEND:VEVENT'));
    expect(parseCore(folded, JUNE)).toEqual({ ok: false, internal: 'too_big' });
  });

  it('gives too_big for more than 2 MB', () => {
    expect(parseCore(calendar('X-PAD:' + 'a'.repeat(2 * 1024 * 1024)), JUNE)).toEqual({ ok: false, internal: 'too_big' });
  });

  it('refuses a window or zone it cannot use', () => {
    expect(parseCore(calendar(), { ...JUNE, zone: 'Not/AZone' })).toEqual({ ok: false, internal: 'parse' });
    expect(parseCore(calendar(), { ...JUNE, from: Number.NaN })).toEqual({ ok: false, internal: 'parse' });
  });
});

// ---- Repeats ----

const MARCH = windowAt(at('2026-03-20T12:00:00Z'));
const OCTOBER = windowAt(at('2026-10-15T12:00:00Z'));
const starts = (list: ParsedOccurrence[]): string[] => list.map(o => (o.allDay ? o.startOn : new Date(o.startMs).toISOString().slice(0, 16) + 'Z'));
const titles = (list: ParsedOccurrence[]): string[] => list.map(o => o.title);

describe('parseCore: repeats across the London clock changes', () => {
  it('keeps a daily 09:00 at 09:00 when the clocks go forward on 2026-03-29', () => {
    const list = occurrencesOf(calendar(vevent('SUMMARY:Standup', 'DTSTART;TZID=Europe/London:20260101T090000', 'DTEND;TZID=Europe/London:20260101T093000', 'RRULE:FREQ=DAILY')), MARCH);
    const around = list.filter(o => !o.allDay && o.startMs >= at('2026-03-27T00:00:00Z') && o.startMs < at('2026-04-01T00:00:00Z'));
    expect(starts(around)).toEqual(['2026-03-27T09:00Z', '2026-03-28T09:00Z', '2026-03-29T08:00Z', '2026-03-30T08:00Z', '2026-03-31T08:00Z']);
    expect(around.every(o => !o.allDay && o.endMs - o.startMs === 30 * 60_000)).toBe(true);
  });

  it('keeps a daily 09:00 at 09:00 when the clocks go back on 2026-10-25', () => {
    const list = occurrencesOf(calendar(vevent('SUMMARY:Standup', 'DTSTART;TZID=Europe/London:20260101T090000', 'RRULE:FREQ=DAILY')), OCTOBER);
    const around = list.filter(o => !o.allDay && o.startMs >= at('2026-10-23T00:00:00Z') && o.startMs < at('2026-10-28T00:00:00Z'));
    expect(starts(around)).toEqual(['2026-10-23T08:00Z', '2026-10-24T08:00Z', '2026-10-25T09:00Z', '2026-10-26T09:00Z', '2026-10-27T09:00Z']);
  });

  it('keeps a floating weekly event at the same wall time across a change', () => {
    const list = occurrencesOf(calendar(vevent('SUMMARY:Class', 'DTSTART:20260105T183000', 'RRULE:FREQ=WEEKLY;BYDAY=MO')), MARCH);
    const around = list.filter(o => !o.allDay && o.startMs >= at('2026-03-23T00:00:00Z') && o.startMs < at('2026-04-07T00:00:00Z'));
    expect(starts(around)).toEqual(['2026-03-23T18:30Z', '2026-03-30T17:30Z', '2026-04-06T17:30Z']);
  });

  it('keeps a universal-time repeat at the same universal time', () => {
    const list = occurrencesOf(calendar(vevent('SUMMARY:Utc', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=DAILY')), MARCH);
    const around = list.filter(o => !o.allDay && o.startMs >= at('2026-03-28T00:00:00Z') && o.startMs < at('2026-03-31T00:00:00Z'));
    expect(starts(around)).toEqual(['2026-03-28T09:00Z', '2026-03-29T09:00Z', '2026-03-30T09:00Z']);
  });
});

describe('parseCore: repeat rules', () => {
  const rule = (extra: string, ...lines: string[]): ParsedOccurrence[] => occurrencesOf(calendar(vevent('SUMMARY:R', 'DTSTART:20260601T090000Z', extra, ...lines)));

  it('honours COUNT', () => {
    expect(starts(rule('RRULE:FREQ=WEEKLY;COUNT=3'))).toEqual(['2026-06-01T09:00Z', '2026-06-08T09:00Z', '2026-06-15T09:00Z']);
  });

  it('honours COUNT when the series began long before the window', () => {
    const text = calendar(vevent('SUMMARY:Old', 'DTSTART:20200101T090000Z', 'RRULE:FREQ=DAILY;COUNT=2400'));
    const list = occurrencesOf(text);
    // 2020-01-01 plus 2,399 days is 2026-07-27.
    expect(starts(list).at(-1)).toBe('2026-07-27T09:00Z');
    expect(list[0]).toMatchObject({ startMs: at('2026-06-01T09:00:00Z') });
    expect(list).toHaveLength(57);
    expect(occurrencesOf(calendar(vevent('SUMMARY:Done', 'DTSTART:20200101T090000Z', 'RRULE:FREQ=DAILY;COUNT=100')))).toEqual([]);
  });

  it('honours UNTIL in universal time, converted to the wall clock', () => {
    const text = calendar(vevent('SUMMARY:U', 'DTSTART;TZID=Europe/London:20260601T090000', 'RRULE:FREQ=DAILY;UNTIL=20260603T080000Z'));
    expect(starts(occurrencesOf(text))).toEqual(['2026-06-01T08:00Z', '2026-06-02T08:00Z', '2026-06-03T08:00Z']);
    const before = calendar(vevent('SUMMARY:U', 'DTSTART;TZID=Europe/London:20260601T090000', 'RRULE:FREQ=DAILY;UNTIL=20260603T075900Z'));
    expect(starts(occurrencesOf(before))).toEqual(['2026-06-01T08:00Z', '2026-06-02T08:00Z']);
  });

  it('includes the last day of a date-only UNTIL on a timed event', () => {
    expect(starts(rule('RRULE:FREQ=DAILY;UNTIL=20260603'))).toEqual(['2026-06-01T09:00Z', '2026-06-02T09:00Z', '2026-06-03T09:00Z']);
  });

  it('honours INTERVAL and BYDAY', () => {
    expect(starts(rule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4'))).toEqual(['2026-06-01T09:00Z', '2026-06-03T09:00Z', '2026-06-15T09:00Z', '2026-06-17T09:00Z']);
  });

  it('expands a rule that began years ago without losing the window', () => {
    const daily = occurrencesOf(calendar(vevent('SUMMARY:Old', 'DTSTART:20150101T090000Z', 'RRULE:FREQ=DAILY')));
    expect(daily).toHaveLength(134);
    expect(starts(daily)[0]).toBe('2026-06-01T09:00Z');
    const weekdays = occurrencesOf(calendar(vevent('SUMMARY:Old', 'DTSTART:20150105T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')));
    expect(starts(weekdays)[0]).toBe('2026-06-01T09:00Z');
  });

  it('removes an EXDATE, in any zone form', () => {
    const list = rule('RRULE:FREQ=DAILY;COUNT=4', 'EXDATE:20260602T090000Z', 'EXDATE;TZID=Europe/London:20260603T100000');
    expect(starts(list)).toEqual(['2026-06-01T09:00Z', '2026-06-04T09:00Z']);
  });

  it('removes a day with a date-only EXDATE', () => {
    expect(starts(rule('RRULE:FREQ=DAILY;COUNT=3', 'EXDATE;VALUE=DATE:20260602'))).toEqual(['2026-06-01T09:00Z', '2026-06-03T09:00Z']);
  });

  it('adds RDATE occurrences, with the same length, and takes the start of a period', () => {
    const list = rule('RRULE:FREQ=WEEKLY;COUNT=1', 'RDATE:20260605T150000Z', 'RDATE;VALUE=PERIOD:20260606T150000Z/PT2H');
    expect(starts(list)).toEqual(['2026-06-01T09:00Z', '2026-06-05T15:00Z', '2026-06-06T15:00Z']);
  });

  it('does not repeat an occurrence that RDATE and RRULE both give', () => {
    expect(rule('RRULE:FREQ=WEEKLY;COUNT=2', 'RDATE:20260608T090000Z')).toHaveLength(2);
  });

  it('repeats all-day events and keeps their length', () => {
    const text = calendar(vevent('SUMMARY:Away', 'DTSTART;VALUE=DATE:20260601', 'DTEND;VALUE=DATE:20260603', 'RRULE:FREQ=WEEKLY;COUNT=2'));
    expect(occurrencesOf(text)).toEqual([
      { allDay: true, startOn: '2026-06-01', endOn: '2026-06-02', title: 'Away', free: false },
      { allDay: true, startOn: '2026-06-08', endOn: '2026-06-09', title: 'Away', free: false },
    ]);
  });

  it('keeps a repeating all-day event on its date in any zone', () => {
    const text = calendar(vevent('SUMMARY:Bday', 'DTSTART;VALUE=DATE:20200301', 'RRULE:FREQ=YEARLY'));
    const list = occurrencesOf(text, windowAt(at('2026-02-20T12:00:00Z'), 'Pacific/Auckland'));
    expect(starts(list)).toEqual(['2026-03-01']);
  });

  it('applies a monthly rule on the last Friday', () => {
    const text = calendar(vevent('SUMMARY:M', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR'));
    expect(starts(occurrencesOf(text)).slice(0, 2)).toEqual(['2026-06-26T09:00Z', '2026-07-31T09:00Z']);
  });
});

describe('parseCore: overrides', () => {
  const series = ['SUMMARY:Gym', 'UID:series@test', 'DTSTART;TZID=Europe/London:20260601T180000', 'RRULE:FREQ=DAILY;COUNT=3'];
  const base = (...more: string[]): string => calendar(
    ['BEGIN:VEVENT', ...series, 'END:VEVENT'].join('\r\n'),
    ['BEGIN:VEVENT', 'UID:series@test', ...more, 'END:VEVENT'].join('\r\n'),
  );

  it('lets an override replace its occurrence', () => {
    const list = occurrencesOf(base('SUMMARY:Gym (moved)', 'RECURRENCE-ID;TZID=Europe/London:20260602T180000', 'DTSTART;TZID=Europe/London:20260602T200000'));
    expect(titles(list)).toEqual(['Gym', 'Gym (moved)', 'Gym']);
    expect(starts(list)[1]).toBe('2026-06-02T19:00Z');
  });

  it('removes an occurrence whose override is cancelled', () => {
    const list = occurrencesOf(base('SUMMARY:Gym', 'STATUS:CANCELLED', 'RECURRENCE-ID;TZID=Europe/London:20260602T180000', 'DTSTART;TZID=Europe/London:20260602T180000'));
    expect(starts(list)).toEqual(['2026-06-01T17:00Z', '2026-06-03T17:00Z']);
  });

  it('matches the recurrence id in another zone form', () => {
    const list = occurrencesOf(base('SUMMARY:Gym (moved)', 'RECURRENCE-ID:20260602T170000Z', 'DTSTART:20260602T190000Z'));
    expect(titles(list)).toEqual(['Gym', 'Gym (moved)', 'Gym']);
  });

  it('matches a date-only recurrence id on an all-day series', () => {
    const text = calendar(
      'BEGIN:VEVENT\r\nUID:a@test\r\nSUMMARY:Bin\r\nDTSTART;VALUE=DATE:20260601\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT',
      'BEGIN:VEVENT\r\nUID:a@test\r\nSUMMARY:Bin (recycling)\r\nRECURRENCE-ID;VALUE=DATE:20260602\r\nDTSTART;VALUE=DATE:20260602\r\nEND:VEVENT',
    );
    expect(titles(occurrencesOf(text))).toEqual(['Bin', 'Bin (recycling)', 'Bin']);
  });

  it('keeps an override that has no series, and one moved into the window from outside it', () => {
    const orphan = calendar('BEGIN:VEVENT\r\nUID:z@test\r\nSUMMARY:Orphan\r\nRECURRENCE-ID:20260101T090000Z\r\nDTSTART:20260701T090000Z\r\nEND:VEVENT');
    expect(titles(occurrencesOf(orphan))).toEqual(['Orphan']);
  });

  it('ignores a THISANDFUTURE override and counts it', () => {
    const result = parseCore(base('SUMMARY:Gym (later)', 'RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=Europe/London:20260602T180000', 'DTSTART;TZID=Europe/London:20260602T200000'), JUNE);
    expect(result).toMatchObject({ ok: true, counts: { skipped: 1 } });
    expect(result.ok && titles(result.occurrences)).toEqual(['Gym', 'Gym', 'Gym']);
  });
});

describe('parseCore: rules it will not follow', () => {
  const run = (rrule: string): ReturnType<typeof parseCore> => parseCore(calendar(vevent('SUMMARY:X', 'DTSTART:20260601T090000Z', rrule)), JUNE);

  it.each(['FREQ=SECONDLY', 'FREQ=MINUTELY;COUNT=5', 'FREQ=HOURLY'])('skips and counts %s', rrule => {
    expect(run(`RRULE:${rrule}`)).toMatchObject({ ok: true, occurrences: [], counts: { events: 1, skipped: 1 } });
  });

  it.each([
    'FREQ=DAILY;INTERVAL=99999999999',
    'FREQ=WEEKLY;BYDAY=XX',
    'FREQ=DAILY;BYHOUR=99',
    'FREQ=YEARLY;BYMONTH=13',
    'FREQ=NEVER',
    'COUNT=5',
    `FREQ=YEARLY;BYYEARDAY=${Array.from({ length: 500 }, (_, i) => i + 1).join(',')}`,
  ])('skips and counts the malformed rule %s without stalling', rrule => {
    expect(run(`RRULE:${rrule}`)).toMatchObject({ ok: true, counts: { skipped: 1 } });
  });

  it('reads a zero or negative INTERVAL as one, as the library does', () => {
    expect(run('RRULE:FREQ=DAILY;INTERVAL=0;COUNT=3')).toMatchObject({ ok: true, counts: { skipped: 0 } });
  });

  it('survives a billion-occurrence COUNT', () => {
    const result = run('RRULE:FREQ=DAILY;COUNT=1000000000');
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.occurrences).toHaveLength(134);
  });
});

describe('parseCore: expansion limits', () => {
  it('stops one event at 1,000 steps and counts it', () => {
    const result = parseCore(calendar(vevent('SUMMARY:Busy', 'DTSTART:20260601T000000Z', 'RRULE:FREQ=DAILY;BYHOUR=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23')), JUNE);
    expect(result).toMatchObject({ ok: true, counts: { skipped: 1 } });
    expect(result.ok && result.occurrences.length).toBeLessThanOrEqual(1000);
    expect(result.ok && result.occurrences.length).toBeGreaterThan(900);
  });

  it('stops the whole file at 20,000 steps', () => {
    const rule = 'RRULE:FREQ=DAILY;BYHOUR=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23';
    const events = Array.from({ length: 40 }, (_, i) => vevent(`SUMMARY:E${i}`, 'DTSTART:20260601T000000Z', rule));
    const result = parseCore(calendar(...events), JUNE);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.counts.skipped).toBeGreaterThanOrEqual(20);
    expect(result.ok && result.occurrences.length).toBeLessThanOrEqual(20_000);
  });

  it('keeps the 2,000 occurrences nearest to now, in order, and says so', () => {
    const events = Array.from({ length: 20 }, (_, i) => vevent(`SUMMARY:E${i}`, 'DTSTART:20260601T090000Z', 'RRULE:FREQ=DAILY'));
    const result = parseCore(calendar(...events), JUNE);
    if (!result.ok) throw new Error('failed');
    expect(result.counts.truncated).toBe(true);
    expect(result.occurrences).toHaveLength(2000);
    const times = result.occurrences.map(o => (o.allDay ? 0 : o.startMs));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The window is 14 days back and 120 ahead, so the nearest 100 days of each rule are from 14 days back to about 85 ahead of now.
    expect(times.at(-1)).toBeLessThan(at('2026-09-15T00:00:00Z'));
    expect(times[0]).toBeGreaterThanOrEqual(at('2026-06-01T00:00:00Z'));
  });

  it('stops expanding when its time budget is spent, and keeps what it has', () => {
    const text = calendar(vevent('SUMMARY:A', 'DTSTART:20260601T090000Z'), vevent('SUMMARY:B', 'DTSTART:20260602T090000Z', 'RRULE:FREQ=DAILY'));
    const result = parseCore(text, JUNE, { budgetMs: -1 });
    expect(result).toMatchObject({ ok: true, counts: { skipped: 2 } });
  });
});

// ---- Hostile files ----

import { GOOD_FILE, HOSTILE } from './hostile';

describe('parseCore: hostile files', () => {
  it.each(Object.keys(HOSTILE))('returns a result for %s and still reads a good file after it', name => {
    const text = HOSTILE[name]();
    expect(text.length).toBeLessThanOrEqual(2 * 1024 * 1024 + 4096);
    const result = parseCore(text, JUNE, { budgetMs: 1500 });
    expect(result.ok === true || ['too_big', 'not_calendar', 'parse'].includes(result.internal)).toBe(true);
    expect(parseCore(GOOD_FILE, JUNE)).toMatchObject({ ok: true, occurrences: [{ title: 'Still works' }] });
  });

  it('reads past a block nested a hundred thousand deep', () => {
    expect(occurrencesOf(HOSTILE.deepNestingClosed()).map(o => o.title)).toEqual(['after']);
  });

  it('strips the control characters from a hostile title', () => {
    expect(occurrencesOf(HOSTILE.controlCharacters())[0].title).toBe('visible');
  });

  it('reads an event after a byte-order mark', () => {
    expect(occurrencesOf(HOSTILE.byteOrderMark())).toHaveLength(1);
  });

  it('keeps a title with replacement characters and with lone surrogates as clean text', () => {
    expect(occurrencesOf(HOSTILE.invalidUtf8())[0].title).toBe('caf����');
    expect(occurrencesOf(HOSTILE.loneSurrogates())[0].title).toBe('abc');
  });

  it('caps a huge duration', () => {
    const list = occurrencesOf(HOSTILE.hugeDuration());
    for (const occurrence of list) {
      if (occurrence.allDay) expect(occurrence.endOn <= '2027-07-02').toBe(true);
      else expect(occurrence.endMs - occurrence.startMs).toBeLessThanOrEqual(366 * DAY);
    }
  });
});
