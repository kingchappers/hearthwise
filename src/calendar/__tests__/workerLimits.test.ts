import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIcs, startWorker } from '../parseIcs';
import type { ParseWindow } from '../parseCore';
import { GOOD_FILE } from './hostile';

// One call of the repeat library cannot be interrupted from inside its own thread, so the protection that holds for every rule is
// the worker's time limit: the worker is stopped and the answer is `parse`. These run the real worker (bundled from the source, since
// a worker cannot load TypeScript) on rules found to make the library search without end.
const NOW = Date.UTC(2026, 5, 15);
const WINDOW: ParseWindow = { from: NOW - 14 * 86_400_000, to: NOW + 120 * 86_400_000, now: NOW, zone: 'Europe/London' };
let dir = '';
let file = '';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hearthwise-worker-'));
  file = join(dir, 'parseWorker.cjs');
  await build({ entryPoints: [join(__dirname, '../parseWorker.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: file, logLevel: 'silent' });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const withRule = (rrule: string, start = '20200229T110000Z'): string =>
  `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:spin@test\r\nSUMMARY:Spin\r\nDTSTART:${start}\r\n${rrule}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const parse = (text: string): ReturnType<typeof parseIcs> => parseIcs(text, WINDOW, { createWorker: input => startWorker(file, input), timeoutMs: 1500 });

describe('the worker is the backstop for a rule the library never finishes', () => {
  it('reads a good file in the real worker', async () => {
    await expect(parse(GOOD_FILE)).resolves.toMatchObject({ ok: true, occurrences: [{ title: 'Still works' }] });
  });

  it.each([
    'RRULE:FREQ=DAILY;INTERVAL=154;BYMONTH=5;BYMONTHDAY=11,26,1;BYDAY=MO;BYHOUR=1;COUNT=79',
    'RRULE:FREQ=DAILY;BYMONTHDAY=-26;BYDAY=MO;BYHOUR=1',
    'RRULE:FREQ=WEEKLY;INTERVAL=2;BYMONTH=2;BYMONTHDAY=30',
    'RRULE:FREQ=YEARLY;INTERVAL=2;BYMONTH=2;BYMONTHDAY=30;BYDAY=MO',
    'RRULE:FREQ=MONTHLY;INTERVAL=12;BYSETPOS=5;BYDAY=MO;BYMONTH=2',
  ])('stops %s within the deadline, and the next file is read', async rrule => {
    const started = Date.now();
    const result = await parse(withRule(rrule));
    expect(Date.now() - started).toBeLessThan(4000);
    expect(result.ok === true || result.internal === 'parse').toBe(true);
    await expect(parse(GOOD_FILE)).resolves.toMatchObject({ ok: true });
  });

  it('answers parse, and no events, for a rule the library spins on', async () => {
    await expect(parse(withRule('RRULE:FREQ=DAILY;INTERVAL=154;BYMONTH=5;BYMONTHDAY=11,26,1;BYDAY=MO;BYHOUR=1;COUNT=79'))).resolves.toEqual({ ok: false, internal: 'parse' });
  });
});
