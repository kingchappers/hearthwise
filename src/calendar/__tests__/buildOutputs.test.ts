import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOOD_FILE, HOSTILE } from './hostile';

// Starts the compiled worker from each build output, the way the Lambda and the container will. These need `yarn build` (and, for the
// container, `yarn build:container`) to have run: `yarn test:build` sets REQUIRE_BUILD_OUTPUT so a missing output fails instead of
// being skipped, and CI runs it after the builds.
const root = join(__dirname, '../../..');
const required = process.env.REQUIRE_BUILD_OUTPUT === '1';

const OUTPUTS = [
  { name: 'API', dir: 'build/api' },
  { name: 'push', dir: 'build/push' },
  { name: 'container', dir: 'build/container' },
];

// Runs in a child process with an empty environment, so what it proves does not depend on the test runner's modules.
const CHILD = `
const path = require('node:path');
const dir = process.argv[1];
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
// ical.js must resolve inside the output, not from the repository.
const resolved = require.resolve('ical.js', { paths: [path.join(dir, 'src', 'calendar')] });
if (!resolved.startsWith(dir)) throw new Error('ical.js resolved outside the output: ' + resolved);
const { parseIcs } = require(path.join(dir, 'src', 'calendar', 'parseIcs.js'));
const window = { from: input.now - 14 * 86400000, to: input.now + 120 * 86400000, now: input.now, zone: 'Europe/London' };
(async () => {
  const out = {};
  for (const [name, text] of Object.entries(input.files)) {
    const started = Date.now();
    const result = await parseIcs(text, window);
    out[name] = { ok: result.ok, internal: result.internal, titles: result.ok ? result.occurrences.map(o => o.title) : undefined, ms: Date.now() - started };
  }
  console.log(JSON.stringify(out));
})();
`;

function runIn(dir: string, files: Record<string, string>): Record<string, { ok: boolean; internal?: string; titles?: string[]; ms: number }> {
  const stdout = execFileSync(process.execPath, ['-e', CHILD, join(root, dir)], { input: JSON.stringify({ now: Date.UTC(2026, 5, 15), files }), env: {}, encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout.trim().split('\n').at(-1) as string);
}

describe.each(OUTPUTS)('the compiled worker from the $name build', ({ dir }) => {
  const present = existsSync(join(root, dir, 'src', 'calendar', 'parseWorker.js'));
  it.skipIf(!present && !required)('is built, and ical.js is installed beside it', () => {
    expect(present, `${dir} has no src/calendar/parseWorker.js: run the build first`).toBe(true);
    expect(existsSync(join(root, dir, 'node_modules', 'ical.js', 'package.json'))).toBe(true);
  });

  it.skipIf(!present && !required)('parses a good file, answers a hostile file, and parses a good file again', () => {
    const hostile = ['neverMatchesMany', 'thousandsOfRules', 'manyExdates', 'spinningRules', 'nestedFolding', 'deepNestingClosed'];
    const files: Record<string, string> = { good: GOOD_FILE };
    for (const name of hostile) files[name] = HOSTILE[name]();
    files.goodAgain = GOOD_FILE;
    const out = runIn(dir, files);
    expect(out.good).toMatchObject({ ok: true, titles: ['Still works'] });
    for (const name of hostile) {
      expect(out[name].ok === true || ['parse', 'too_big', 'not_calendar'].includes(out[name].internal ?? ''), name).toBe(true);
    }
    expect(out.goodAgain).toMatchObject({ ok: true, titles: ['Still works'] });
  });
});
