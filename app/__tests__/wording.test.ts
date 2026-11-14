import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = resolve(__dirname, '..');
const BANNED = /\b(overdue|missed|streak|late|failed to complete)\b/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'test-utils' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

// What a person can read: quoted strings and the text between JSX tags. Comments are left out.
export function readableText(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const strings = [...code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map(match => match[2]);
  const jsx = [...code.matchAll(/>([^<>{}\n]+)</g)].map(match => match[1]);
  return [...strings, ...jsx];
}

describe('wording', () => {
  it('finds the words it is looking for, as whole words only', () => {
    const found = (text: string): boolean => readableText(text).some(line => BANNED.test(line));
    expect(found(`const a = 'This is overdue';`)).toBe(true);
    expect(found('<p>You missed it</p>')).toBe(true);
    expect(found(`const a = "Keep your streak";`)).toBe(true);
    expect(found(`const a = 'Later';`)).toBe(false);
    expect(found(`const a = 'template';`)).toBe(false);
    expect(found(`// overdue is banned\nconst a = 1;`)).toBe(false);
  });

  it('keeps the shaming words out of everything a person can read', () => {
    const hits = sourceFiles(APP).flatMap(file =>
      readableText(readFileSync(file, 'utf8')).filter(line => BANNED.test(line)).map(line => `${relative(APP, file)}: ${line}`),
    );
    expect(hits).toEqual([]);
  });
});
