// Hostile calendar files, built in code so the repository holds no large files. Each is at most 2 MB. Used by the parseCore tests, and
// (through the real worker) by the build tests.
const CRLF = '\r\n';
const HEAD = `BEGIN:VCALENDAR${CRLF}VERSION:2.0${CRLF}PRODID:-//Hostile//EN${CRLF}`;
const TAIL = `END:VCALENDAR${CRLF}`;
const wrap = (body: string): string => HEAD + body + TAIL;
const event = (...lines: string[]): string => `BEGIN:VEVENT${CRLF}${lines.join(CRLF)}${CRLF}END:VEVENT${CRLF}`;
const BYHOUR = 'BYHOUR=' + Array.from({ length: 24 }, (_, i) => i).join(',');

export const GOOD_FILE = wrap(event('UID:good@test', 'SUMMARY:Still works', 'DTSTART:20260701T090000Z', 'DTEND:20260701T100000Z'));

export const HOSTILE: Record<string, () => string> = {
  // A single property folded onto a million continuation lines.
  nestedFolding: () => wrap(`BEGIN:VEVENT${CRLF}DTSTART:20260701T090000Z${CRLF}SUMMARY:x${CRLF}${` ab${CRLF}`.repeat(380_000)}END:VEVENT${CRLF}`),
  // Three thousand events, each with a daily rule.
  thousandsOfRules: () => wrap(Array.from({ length: 3000 }, (_, i) => event(`UID:${i}@t`, 'SUMMARY:r', 'DTSTART:20200101T090000Z', 'RRULE:FREQ=DAILY')).join('')),
  // A rule that can never match.
  neverMatches: () => wrap(event('SUMMARY:n', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30;BYDAY=MO;COUNT=3', 'RRULE:FREQ=MONTHLY;BYSETPOS=5;BYDAY=MO;BYMONTH=2')),
  neverMatchesMany: () => wrap(Array.from({ length: 3000 }, (_, i) => event(`UID:${i}@t`, 'SUMMARY:n', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30;BYDAY=MO;COUNT=3')).join('')),
  hugeCount: () => wrap(event('SUMMARY:c', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=DAILY;COUNT=1000000000', `RRULE:FREQ=DAILY;COUNT=99999999999999999999`)),
  hugeInterval: () => wrap(event('SUMMARY:i', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=DAILY;INTERVAL=99999999999')),
  hugeRdateList: () => wrap(event('SUMMARY:r', 'DTSTART:20260101T090000Z', 'RDATE:' + Array.from({ length: 70_000 }, (_, i) => `2026${String(1 + (i % 12)).padStart(2, '0')}${String(1 + (i % 28)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}0000Z`).join(','))),
  hugeExdateList: () => wrap(event('SUMMARY:e', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=DAILY', 'EXDATE:' + Array.from({ length: 70_000 }, (_, i) => `2026${String(1 + (i % 12)).padStart(2, '0')}${String(1 + (i % 28)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}0000Z`).join(','))),
  oneLine: () => wrap(`SUMMARY:${'a'.repeat(2 * 1024 * 1024 - 200)}${CRLF}`),
  oneLineEvent: () => wrap(`BEGIN:VEVENT${CRLF}SUMMARY:${'b'.repeat(2 * 1024 * 1024 - 300)}${CRLF}DTSTART:20260701T090000Z${CRLF}END:VEVENT${CRLF}`),
  hugeDtstart: () => wrap(event('SUMMARY:h', 'DTSTART:99991231T235959Z', 'DTEND:99991231T235959Z') + event('SUMMARY:h2', 'DTSTART:00010101T000000Z', 'RRULE:FREQ=DAILY') + event('SUMMARY:h3', 'DTSTART:2026070100000000000Z')),
  badTzid: () => wrap(event('SUMMARY:z', `DTSTART;TZID=${'Q'.repeat(100_000)}:20260701T090000`, 'DTEND;TZID=Not/A/Zone/At/All:20260701T100000')),
  manyTzids: () => wrap(Array.from({ length: 3000 }, (_, i) => event(`SUMMARY:z${i}`, `DTSTART;TZID=europe/LoNdOn${i % 2 ? '' : '/'}${i}:20260701T090000`)).join('')),
  byteOrderMark: () => '﻿' + GOOD_FILE,
  controlCharacters: () => wrap(event('SUMMARY:' + '\u0000\u0007\u001B‮​'.repeat(50) + 'visible', 'DTSTART:20260701T090000Z')),
  // Deeply nested blocks, and an unterminated one.
  deepNesting: () => HEAD + 'BEGIN:VEVENT' + CRLF + 'BEGIN:VALARM' + CRLF + Array.from({ length: 100_000 }, () => `BEGIN:X${CRLF}`).join('') + 'SUMMARY:deep' + CRLF,
  deepNestingClosed: () => HEAD + Array.from({ length: 60_000 }, () => `BEGIN:X${CRLF}`).join('') + Array.from({ length: 60_000 }, () => `END:X${CRLF}`).join('') + event('SUMMARY:after', 'DTSTART:20260701T090000Z') + TAIL,
  // Many alarms and extra properties, as a "billion laughs" of repeated content.
  repeatedContent: () => wrap(event('SUMMARY:l', 'DTSTART:20260701T090000Z', ...Array.from({ length: 30_000 }, () => 'X-LAUGH:ha ha ha ha ha ha ha'), ...Array.from({ length: 10_000 }, () => 'BEGIN:VALARM\r\nEND:VALARM'))),
  // A replacement character where the file's bytes were not valid UTF-8.
  invalidUtf8: () => wrap(event('SUMMARY:caf����', 'DTSTART:20260701T090000Z', 'DESCRIPTION:��')),
  loneSurrogates: () => wrap(event('SUMMARY:a\uD800b\uDC00c', 'DTSTART:20260701T090000Z')),
  manyOverrides: () => wrap(event('UID:s@t', 'SUMMARY:s', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=DAILY') + Array.from({ length: 2900 }, (_, i) => event('UID:s@t', `SUMMARY:o${i}`, `RECURRENCE-ID:2026${String(1 + (i % 12)).padStart(2, '0')}${String(1 + (i % 28)).padStart(2, '0')}T090000Z`, 'DTSTART:20260701T090000Z')).join('')),
  hugeDuration: () => wrap(event('SUMMARY:d', 'DTSTART:20260701T090000Z', 'DURATION:P99999999W') + event('SUMMARY:d2', 'DTSTART;VALUE=DATE:20260701', 'DTEND;VALUE=DATE:99991231')),
};
