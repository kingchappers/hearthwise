import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '..');
const ROOT = join(APP, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'test-utils') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// The step 2 hooks write to the household without a registered key; step 5 moves them into app/lib/mutations.ts with persistence.
const STEP_2_HOOKS = ['app/lib/household.ts'];

describe('household mutations', () => {
  it('are used by key only: no component defines a mutation function of its own', () => {
    const offenders: string[] = [];
    for (const file of sources(APP)) {
      const name = relative(ROOT, file);
      if (STEP_2_HOOKS.includes(name)) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/useMutation(?:<[^(]*>)?\(\s*\{([^}]*)\}/g)) {
        if (!/mutationKey/.test(match[1]) || /mutationFn/.test(match[1])) offenders.push(`${name}: ${match[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
