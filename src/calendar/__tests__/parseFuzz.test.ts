import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Random and hand-picked repeat rules through the real parseIcs and worker, in a child process: a rule that aborts the whole process
// (as `FREQ=DAILY;BYMONTHDAY=-1` did in the library's iterator, with exit 134) or that never finishes cannot be seen from inside this
// test run. The child must exit 0, every file must be answered inside the deadline, and none may need the worker to be killed.
let dir = '';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hearthwise-fuzz-'));
  await build({ entryPoints: [join(__dirname, '../parseIcs.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(dir, 'parseIcs.cjs'), logLevel: 'silent' });
  await build({ entryPoints: [join(__dirname, '../parseWorker.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(dir, 'parseWorker.js'), logLevel: 'silent' });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CHILD = `
const { parseIcs } = require(process.argv[1] + '/parseIcs.cjs');
const now = Date.UTC(2026, 5, 15);
const range = { from: now - 14 * 864e5, to: now + 120 * 864e5, now, zone: 'Europe/London' };
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = list => list[Math.floor(rnd() * list.length)];
const nums = (lo, hi, n) => Array.from({ length: 1 + Math.floor(rnd() * n) }, () => (lo + Math.floor(rnd() * (hi - lo + 1))) || 1).join(',');
const starts = ['20260101T090000Z', '20261101T090000Z', '20200229T110000Z', '20150131T000000Z', '19700101T000000Z'];
const rules = ['FREQ=DAILY;BYMONTHDAY=-1', 'FREQ=DAILY;BYMONTHDAY=-1;BYMONTH=2', 'FREQ=MONTHLY;BYMONTHDAY=-1', 'FREQ=DAILY;INTERVAL=154;BYMONTH=5;BYMONTHDAY=11,26,1;BYDAY=MO;COUNT=79'];
for (let i = 0; i < 400; i += 1) {
  const parts = ['FREQ=' + pick(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'HOURLY'])];
  if (rnd() < 0.4) parts.push('INTERVAL=' + (1 + Math.floor(rnd() * 1000)));
  if (rnd() < 0.4) parts.push('BYMONTH=' + nums(1, 12, 3));
  if (rnd() < 0.4) parts.push('BYMONTHDAY=' + nums(-31, 31, 3));
  if (rnd() < 0.2) parts.push('BYYEARDAY=' + nums(-366, 366, 3));
  if (rnd() < 0.2) parts.push('BYWEEKNO=' + nums(-53, 53, 3));
  if (rnd() < 0.4) parts.push('BYDAY=' + pick(['MO', '5MO', '-5FR', '53SU', '1TU,2WE', '-1SA', 'MO,TU,WE,TH,FR']));
  if (rnd() < 0.2) parts.push('BYSETPOS=' + nums(-366, 366, 2));
  if (rnd() < 0.2) parts.push('BYHOUR=' + nums(0, 23, 4));
  if (rnd() < 0.3) parts.push('COUNT=' + (1 + Math.floor(rnd() * 1000)));
  if (rnd() < 0.2) parts.push('UNTIL=' + pick(['20260801T000000Z', '20260701', '20250101T000000Z']));
  if (rnd() < 0.2) parts.push('WKST=' + pick(['MO', 'SU', 'WE']));
  rules.push(parts.join(';'));
}
(async () => {
  let slowest = 0; let parseFailures = 0; let answered = 0; let following = 0;
  for (const rule of rules) {
    for (const start of [pick(starts), '20260101T090000Z']) {
      const text = 'BEGIN:VCALENDAR\\r\\nBEGIN:VEVENT\\r\\nUID:f@t\\r\\nSUMMARY:F\\r\\nDTSTART:' + start + '\\r\\nRRULE:' + rule + '\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR\\r\\n';
      const t = Date.now();
      const result = await parseIcs(text, range);
      slowest = Math.max(slowest, Date.now() - t);
      answered += 1;
      if (!result.ok) parseFailures += 1;
      else if (result.counts.skipped === 0) following += 1;
    }
  }
  console.log(JSON.stringify({ rules: rules.length, answered, slowest, parseFailures, following }));
})();
`;

describe('repeat rules through the real worker in a child process', () => {
  it('answers every rule within the deadline, never aborts the process, and never needs the worker killed', () => {
    const stdout = execFileSync(process.execPath, ['-e', CHILD, dir], { env: {}, encoding: 'utf8', timeout: 180_000 });
    const summary = JSON.parse(stdout.trim().split('\n').at(-1) as string) as { rules: number; answered: number; slowest: number; parseFailures: number; following: number };
    expect(summary.answered).toBe(summary.rules * 2);
    expect(summary.slowest).toBeLessThan(4000);
    expect(summary.parseFailures).toBe(0);
    // Some of the random rules are ones we follow, so the test is not only refusals.
    expect(summary.following).toBeGreaterThan(100);
  }, 200_000);
});
