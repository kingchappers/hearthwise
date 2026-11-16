import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseIcs, startWorker } from '../parseIcs';
import type { ParseWindow } from '../parseCore';
import { GOOD_FILE } from './hostile';

// The real worker, bundled from the source (a worker cannot load TypeScript). Rules the repeat library spins on are refused before any
// loop (we expand rules ourselves), and the worker's time and memory limits are the backstop for anything else.
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

describe('the real worker', () => {
  it('reads a good file', async () => {
    await expect(parse(GOOD_FILE)).resolves.toMatchObject({ ok: true, occurrences: [{ title: 'Still works' }] });
  });

  it.each([
    'RRULE:FREQ=DAILY;INTERVAL=154;BYMONTH=5;BYMONTHDAY=11,26,1;BYDAY=MO;BYHOUR=1;COUNT=79',
    'RRULE:FREQ=DAILY;BYMONTHDAY=-1',
    'RRULE:FREQ=WEEKLY;INTERVAL=2;BYMONTH=2;BYMONTHDAY=30',
    'RRULE:FREQ=YEARLY;INTERVAL=2;BYMONTH=2;BYMONTHDAY=30;BYDAY=MO',
    'RRULE:FREQ=MONTHLY;INTERVAL=12;BYSETPOS=5;BYDAY=MO;BYMONTH=2',
  ])('refuses %s at once, counts it, and reads the next file', async rrule => {
    const started = Date.now();
    await expect(parse(withRule(rrule))).resolves.toMatchObject({ ok: true, occurrences: [], counts: { skipped: 1 } });
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(parse(GOOD_FILE)).resolves.toMatchObject({ ok: true });
  });

  it('is stopped by the time limit when it never answers, and the process stays healthy', async () => {
    const spinner = join(dir, 'spinner.cjs');
    writeFileSync(spinner, 'for (;;) {}');
    const started = Date.now();
    await expect(parseIcs(GOOD_FILE, WINDOW, { createWorker: input => startWorker(spinner, input), timeoutMs: 500 })).resolves.toEqual({ ok: false, internal: 'parse' });
    expect(Date.now() - started).toBeLessThan(3000);
    await expect(parse(GOOD_FILE)).resolves.toMatchObject({ ok: true });
  });

  it('is stopped by its memory ceiling, and the process stays healthy', async () => {
    const hog = join(dir, 'hog.cjs');
    writeFileSync(hog, 'const keep = []; for (;;) keep.push(new Array(1e6).fill(Math.random()));');
    await expect(parseIcs(GOOD_FILE, WINDOW, { createWorker: input => startWorker(hog, input), timeoutMs: 10_000 })).resolves.toEqual({ ok: false, internal: 'parse' });
    await expect(parse(GOOD_FILE)).resolves.toMatchObject({ ok: true });
  });
});
