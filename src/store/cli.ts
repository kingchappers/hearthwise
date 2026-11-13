import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { sqlitePath } from '../../container/config';
import { clearThrottle, deleteSessionsForUser, getAccountByEmail, isUsableEmail, replacePassword } from '../auth/localData';
import { validatePassword } from '../auth/password';
import { promptHidden } from '../auth/prompt';
import { initStore, type Store } from '.';

const USAGE = `Usage:
  backup --out <file>                      write a consistent, verified, owner-only copy of the SQLite database (never overwrites; STORE=sqlite only)
  reset-password <email>                   set a new password for one person's built-in login, end that person's sessions and clear their lock-out (prompts; the password is never taken from arguments; first-run setup is never reopened)

The backend comes from the environment: STORE=dynamodb with DYNAMODB_TABLE (and your AWS credentials),
or STORE=sqlite, which opens the database in DATA_DIR (default /data) the way the container does, or the file named by SQLITE_PATH.`;

// Opens the same file the container would, so commands need no hard-coded file name. An explicit SQLITE_PATH still wins.
// A missing file always means a wrong path: opening it would leave an empty database next to the real one.
function openStore(env: NodeJS.ProcessEnv): Promise<Store> {
  if (env.STORE !== 'sqlite') return initStore(env);
  const path = env.SQLITE_PATH || sqlitePath(env.DATA_DIR || '/data');
  if (!existsSync(path)) {
    throw new Error(`No SQLite database at ${path}; nothing was created. Check SQLITE_PATH, or leave it unset and point DATA_DIR at the folder holding your database.`);
  }
  return initStore({ ...env, SQLITE_PATH: path });
}

export async function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env, io: { readPassword?: (prompt: string) => Promise<string> } = {}): Promise<string> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) return USAGE;

  const [command, email, ...rest] = positionals;

  if (command === 'reset-password') {
    if (!email || rest.length > 0) throw new Error(USAGE);
    // An argument that is not an email is refused without being repeated: it may be a password typed in the wrong place.
    if (!isUsableEmail(email)) throw new Error('That is not a usable email address.');
    const store = await openStore(env);
    if (!(await getAccountByEmail(store, email))) {
      throw new Error('No account has that email address. Accounts are created through first-run setup or an invite link.');
    }
    const password = await (io.readPassword ?? promptHidden)('New password: ');
    const problem = validatePassword(password);
    if (problem) throw new Error(problem);
    // The password goes first: this process is outside the server's login queue, so ending sessions
    // while the old password still works would let an attacker log straight back in.
    const account = await replacePassword(store, email, password);
    await deleteSessionsForUser(store, account.userId);
    await clearThrottle(store, email);
    return `Password reset for ${account.email}. Their sessions have ended and their login lock-out is cleared. No one else is affected.`;
  }

  if (command === 'backup') {
    if (!values.out) throw new Error(USAGE);
    const store = await openStore(env);
    // Loaded here so the AWS path never touches node:sqlite.
    const { SqliteStore } = await import('./sqlite');
    if (!(store instanceof SqliteStore)) throw new Error('backup works with STORE=sqlite only');
    const { backupToFile } = await import('./backup');
    backupToFile(store, values.out);
    return `Backed up the database to ${values.out}`;
  }

  throw new Error(USAGE);
}
