import { describe, expect, it } from 'vitest';
import { parseCore, type ParseWindow, type ParsedOccurrence } from '../parseCore';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 12, 0);
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
