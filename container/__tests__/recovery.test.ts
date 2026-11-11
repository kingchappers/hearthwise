import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETUP_CODE_FILE, createCodeHooks, removeCodeFile } from '../recovery';

let dir: string;
const warn = vi.fn();
const print = vi.fn();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recovery-'));
  warn.mockReset();
  print.mockReset();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const codeFile = (): string => join(dir, SETUP_CODE_FILE);

describe('createCodeHooks', () => {
  it('prints a block with the code on its own line and saves it as an owner-only file', () => {
    createCodeHooks(dir, { print, warn }).announce('abc123XYZ', 'setup');
    const text = String(print.mock.calls[0][0]);
    expect(text).toMatch(/^Setup code: abc123XYZ$/m);
    expect(text).toContain(SETUP_CODE_FILE);
    expect(readFileSync(codeFile(), 'utf8')).toBe('abc123XYZ\n');
    expect(statSync(codeFile()).mode & 0o777).toBe(0o600);
    expect(existsSync(`${codeFile()}.tmp`)).toBe(false);
  });

  it('labels a recovery code and says what it does', () => {
    createCodeHooks(dir, { print, warn }).announce('abc123XYZ', 'recovery');
    const text = String(print.mock.calls[0][0]);
    expect(text).toMatch(/^Recovery code: abc123XYZ$/m);
    expect(text).toMatch(/new password/i);
  });

  it('still prints the code, and warns without leaking it, when the file cannot be written', () => {
    mkdirSync(`${codeFile()}.tmp`); // a directory where the temporary file should go
    createCodeHooks(dir, { print, warn }).announce('abc123XYZ', 'setup');
    expect(String(print.mock.calls[0][0])).toContain('abc123XYZ');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain(SETUP_CODE_FILE);
    expect(String(warn.mock.calls[0][0])).not.toContain('abc123XYZ');
    expect(String(warn.mock.calls[1][0])).toContain(`${SETUP_CODE_FILE}.tmp`);
    expect(String(warn.mock.calls[1][0])).not.toContain('abc123XYZ');
  });

  it('warns once and leaves no temporary file when the rename fails', () => {
    mkdirSync(codeFile());
    writeFileSync(join(codeFile(), 'inner'), 'x'); // a non-empty directory cannot be replaced
    createCodeHooks(dir, { print, warn }).announce('abc123XYZ', 'setup');
    expect(String(print.mock.calls[0][0])).toContain('abc123XYZ');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(existsSync(`${codeFile()}.tmp`)).toBe(false);
  });

  it('replaces a stale temporary file so the saved code is owner-only', () => {
    writeFileSync(`${codeFile()}.tmp`, 'old', { mode: 0o644 });
    createCodeHooks(dir, { print, warn }).announce('abc123XYZ', 'setup');
    expect(readFileSync(codeFile(), 'utf8')).toBe('abc123XYZ\n');
    expect(statSync(codeFile()).mode & 0o777).toBe(0o600);
    expect(existsSync(`${codeFile()}.tmp`)).toBe(false);
  });

  it('does not write through a symlink at the temporary path', () => {
    const target = join(dir, 'elsewhere');
    writeFileSync(target, 'untouched');
    symlinkSync(target, `${codeFile()}.tmp`);
    createCodeHooks(dir, { print, warn }).announce('abc123XYZ', 'setup');
    expect(readFileSync(target, 'utf8')).toBe('untouched');
    expect(readFileSync(codeFile(), 'utf8')).toBe('abc123XYZ\n');
    expect(statSync(codeFile()).mode & 0o777).toBe(0o600);
  });

  it('retire removes the file', () => {
    const hooks = createCodeHooks(dir, { print, warn });
    hooks.announce('abc123XYZ', 'setup');
    hooks.retire();
    expect(existsSync(codeFile())).toBe(false);
  });
});

describe('removeCodeFile', () => {
  it('removes a stale file and a stale temporary file, and is fine when neither exists', () => {
    removeCodeFile(dir, warn);
    writeFileSync(codeFile(), 'stale');
    writeFileSync(`${codeFile()}.tmp`, 'stale');
    removeCodeFile(dir, warn);
    expect(existsSync(codeFile())).toBe(false);
    expect(existsSync(`${codeFile()}.tmp`)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
