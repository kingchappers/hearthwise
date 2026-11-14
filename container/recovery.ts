import { renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CodeHooks } from '../src/auth/local';

export const SETUP_CODE_FILE = 'SETUP_CODE.txt';

type Warn = (message: string) => void;

// Names a failure without a path or message, which could carry data.
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'Error';
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code) ? `${error.name} (${code})` : error.name;
}

function removeFile(target: string, warn: Warn): void {
  try {
    rmSync(target, { force: true });
  } catch (error) {
    warn(`Could not remove ${path.basename(target)}: ${describeFailure(error)}`);
  }
}

// Removes the code file and its temporary name: used for a stale file at start-up, at shutdown and once the code is used.
export function removeCodeFile(dataDir: string, warn: Warn): void {
  const file = path.join(dataDir, SETUP_CODE_FILE);
  removeFile(file, warn);
  removeFile(`${file}.tmp`, warn);
}

function formatBlock(code: string): string {
  const rule = '='.repeat(60);
  return [
    rule,
    `Setup code: ${code}`,
    'Open the app and enter this code to create your account.',
    `The code is also saved as ${SETUP_CODE_FILE} in your data folder until you use it.`,
    rule,
  ].join('\n');
}

export function createCodeHooks(dataDir: string, io: { print(text: string): void; warn: Warn }): CodeHooks {
  const file = path.join(dataDir, SETUP_CODE_FILE);
  const temporary = `${file}.tmp`;
  return {
    announce(code) {
      io.print(formatBlock(code));
      try {
        // Exclusive create applies the mode and never follows a symlink, so any stale entry is cleared first.
        rmSync(temporary, { force: true });
        writeFileSync(temporary, `${code}\n`, { mode: 0o600, flag: 'wx' });
        renameSync(temporary, file);
      } catch (error) {
        io.warn(`Could not write ${SETUP_CODE_FILE}: ${describeFailure(error)}. The code is in this log.`);
        // The temporary file may hold the code, so a failure to remove it is reported too.
        removeFile(temporary, io.warn);
      }
    },
    retire() {
      removeCodeFile(dataDir, io.warn);
    },
  };
}
