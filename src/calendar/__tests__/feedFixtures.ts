import { vi } from 'vitest';
import type { FeedDeps } from '../feeds';
import type { ParsedOccurrence, ParseResult } from '../parseCore';

export const FIXTURE_KEY = Buffer.alloc(32, 7);

const meeting: ParsedOccurrence = { allDay: false, startMs: Date.parse('2026-11-17T14:00:00Z'), endMs: Date.parse('2026-11-17T15:00:00Z'), title: 'Meeting', free: false, approx: false };

// Feed dependencies that never touch the network: the fetcher answers with a calendar, the parser with one meeting, the key is set.
export function fetchedFixtureDeps(over: Partial<FeedDeps> = {}): FeedDeps {
  let n = 0;
  return {
    readLink: vi.fn(async () => ({ ok: true as const, text: 'BEGIN:VCALENDAR', bytes: 100 })),
    parse: vi.fn(async (): Promise<ParseResult> => ({ ok: true, occurrences: [meeting], counts: { events: 1, skipped: 0, approx: 0, truncated: false } })),
    loadKey: async () => FIXTURE_KEY,
    extraHosts: [],
    newId: () => `snap-${++n}`,
    ...over,
  };
}
