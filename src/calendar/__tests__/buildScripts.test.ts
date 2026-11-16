import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The three builds list their runtime dependencies in code, and compile only what their entry file reaches plus what the tsc command
// names. The parser is reached by nothing yet, so a missing name here would show up only at the first refresh.
const root = join(__dirname, '../../..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');
const pinned = (JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies['ical.js'];
const SCRIPTS = ['scripts/build-api-handler.cjs', 'scripts/build-push-handler.cjs', 'scripts/build-container.cjs'];

describe('ical.js in the builds', () => {
  it('is pinned in package.json at an exact version', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(SCRIPTS)('%s installs the same exact version and compiles the parser and its worker', script => {
    const text = read(script);
    expect(text).toContain(`'ical.js': '${pinned}'`);
    const tsc = text.split('\n').find(line => /\btsc /.test(line)) ?? '';
    expect(tsc).toContain('src/calendar/parseIcs.ts');
    expect(tsc).toContain('src/calendar/parseWorker.ts');
  });

  it('is not part of the store command line tool, which only reads stored state', () => {
    expect(read('scripts/build-store-cli.cjs')).not.toMatch(/ical|parseIcs|parseWorker/);
  });

  it('is not imported by anything the app bundle can reach', () => {
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"ical.js"');
    expect(read('vite.config.ts')).not.toMatch(/ical/);
  });

  it('is parsed in a fixture by the container smoke test', () => {
    expect(read('scripts/container-smoke.mjs')).toMatch(/BEGIN:VCALENDAR/);
    expect(read('scripts/container-smoke.mjs')).toMatch(/parseIcs/);
  });
});
