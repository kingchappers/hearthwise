import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'test-utils') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

const sources = sourceFiles(APP).map(path => ({ path: path.slice(APP.length + 1), text: readFileSync(path, 'utf8') }));

function offences(pattern: RegExp): string[] {
  return sources.flatMap(({ path, text }) => text.split('\n').flatMap((line, index) => (pattern.test(line) ? [`${path}:${index + 1}: ${line.trim()}`] : [])));
}

describe('colours used in the app', () => {
  it('are only ones the Hearthwise theme defines: no red, and nothing left from the sibling app', () => {
    const removed = 'red|danger|success|hoard|gold|ember|pine|mist';
    expect(offences(new RegExp(`\\b(color|c|bg|variant-color)="(${removed})(\\.\\d)?"`))).toEqual([]);
    expect(offences(new RegExp(`mantine-color-(${removed})\\b`))).toEqual([]);
  });

  it("never names or links to the sibling app", () => {
    expect(offences(/hoardwise|budget-app/i)).toEqual([]);
  });
});
