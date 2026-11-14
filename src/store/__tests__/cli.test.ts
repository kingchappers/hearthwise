import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStore } from '..';
import { createFirstAccount, createSession, getAccountByEmail, readSession, recordFailure, throttleRemaining } from '../../auth/localData';
import { verifyPassword } from '../../auth/password';
import { runCli } from '../cli';
import { SqliteStore } from '../sqlite';

let dir: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'store-cli-'));
  env = { STORE: 'sqlite', SQLITE_PATH: join(dir, 'hearthwise.sqlite') };
});

afterEach(() => {
  setStore(undefined);
  rmSync(dir, { recursive: true, force: true });
});

async function seedDatabase(): Promise<void> {
  const store = new SqliteStore(env.SQLITE_PATH as string);
  await store.put({ PK: 'HH#h1', SK: 'TASK#t1', title: 'Hoover' });
  store.close();
}

describe('runCli', () => {
  it('prints usage for a missing argument, an unknown command and --help', async () => {
    await expect(runCli(['backup'], env)).rejects.toThrow('Usage');
    await expect(runCli(['frobnicate'], env)).rejects.toThrow('Usage');
    await expect(runCli(['export', 'someone'], env)).rejects.toThrow('Usage');
    await expect(runCli(['import'], env)).rejects.toThrow('Usage');
    expect(await runCli(['--help'], env)).toContain('Usage');
  });

  it('does not create any file when the output path is missing', async () => {
    await seedDatabase();
    const before = readdirSync(dir);
    await expect(runCli(['backup'], env)).rejects.toThrow('Usage');
    expect(readdirSync(dir)).toEqual(before);
  });

  describe('a missing SQLite database', () => {
    it.each([
      ['backup', ['backup', '--out', 'copy.sqlite']],
      ['reset-password', ['reset-password', 'me@example.com']],
    ])('is not created by %s', async (_name, args) => {
      const argv = args.map(arg => (arg.endsWith('.sqlite') ? join(dir, arg) : arg));

      await expect(runCli(argv, env)).rejects.toThrow(/No SQLite database at .*hearthwise\.sqlite/);

      expect(readdirSync(dir)).toEqual([]);
    });

  });

  describe('finding the database from DATA_DIR', () => {
    it('finds hearthwise.sqlite in DATA_DIR', async () => {
      await seedDatabase();
      const out = join(dir, 'copy.sqlite');

      await runCli(['backup', '--out', out], { STORE: 'sqlite', DATA_DIR: dir });

      expect(existsSync(out)).toBe(true);
    });

    it("never falls back to another app's database in DATA_DIR", async () => {
      for (const other of ['hoardwise.sqlite', 'budget.sqlite']) {
        const store = new SqliteStore(join(dir, other));
        store.close();
      }

      await expect(runCli(['backup', '--out', join(dir, 'copy.sqlite')], { STORE: 'sqlite', DATA_DIR: dir }))
        .rejects.toThrow(/No SQLite database at .*hearthwise\.sqlite/);
    });

    it('lets an explicit SQLITE_PATH win over DATA_DIR', async () => {
      await seedDatabase();
      const out = join(dir, 'copy.sqlite');

      await runCli(['backup', '--out', out], { ...env, DATA_DIR: join(dir, 'elsewhere') });

      expect(existsSync(out)).toBe(true);
    });
  });

  describe('reset-password <email>', () => {
    const OLD = 'the old password 1';
    const NEW = 'the new password 22';
    const now = () => Math.floor(Date.now() / 1000);

    // Two people: the first made through setup, the second written the way an invited sign-up writes one.
    async function seedTwoAccounts() {
      const store = new SqliteStore(env.SQLITE_PATH as string);
      const first = await createFirstAccount(store, { email: 'me@example.com', password: OLD, displayName: 'Sam' });
      const { hashPassword } = await import('../../auth/password');
      const second = { userId: 'local|bea', email: 'bea@example.com', displayName: 'Bea', ...(await hashPassword(OLD)), createdAt: new Date().toISOString() };
      await store.put({ PK: 'AUTH#ACCOUNT#bea@example.com', SK: 'PROFILE', ...second });
      const sessions = {
        me: await createSession(store, first, now()),
        bea: await createSession(store, second, now()),
      };
      for (let i = 0; i < 6; i += 1) { await recordFailure(store, 'me@example.com', now()); await recordFailure(store, 'bea@example.com', now()); }
      store.close();
      return { first, second, sessions };
    }

    const reset = (args: string[], password = NEW) => runCli(args, env, { readPassword: async () => password });

    it('sets the new password, ends only that person\'s sessions and clears only their lock-out', async () => {
      const { sessions } = await seedTwoAccounts();
      const message = await reset(['reset-password', 'me@example.com']);
      expect(message).toMatch(/me@example\.com/);

      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await verifyPassword(NEW, (await getAccountByEmail(store, 'me@example.com'))!)).toBe(true);
      expect(await readSession(store, sessions.me, now())).toBeUndefined();
      expect(await throttleRemaining(store, 'me@example.com', now())).toBe(0);
      // The other person is untouched.
      expect(await readSession(store, sessions.bea, now())).toBeDefined();
      expect(await throttleRemaining(store, 'bea@example.com', now())).toBeGreaterThan(0);
      expect(await verifyPassword(OLD, (await getAccountByEmail(store, 'bea@example.com'))!)).toBe(true);
      store.close();
    });

    it('finds the account whatever the case or spacing of the email', async () => {
      await seedTwoAccounts();
      await reset(['reset-password', 'BEA@Example.com']);
      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await verifyPassword(NEW, (await getAccountByEmail(store, 'bea@example.com'))!)).toBe(true);
      store.close();
    });

    it('replaces the password before ending sessions, so no old-password session can outlive the reset', async () => {
      await seedTwoAccounts();
      const realDelete = SqliteStore.prototype.delete;
      let oldStillWorkedAtSessionDelete: boolean | undefined;
      vi.spyOn(SqliteStore.prototype, 'delete').mockImplementation(async function (this: SqliteStore, key, options) {
        if (key.PK === 'AUTH#SESSIONS' && oldStillWorkedAtSessionDelete === undefined) {
          oldStillWorkedAtSessionDelete = await verifyPassword(OLD, (await getAccountByEmail(this, 'me@example.com'))!);
        }
        return realDelete.call(this, key, options);
      });
      await reset(['reset-password', 'me@example.com']);
      vi.restoreAllMocks();
      expect(oldStillWorkedAtSessionDelete).toBe(false);
    });

    it('never reopens first-run setup', async () => {
      await seedTwoAccounts();
      await reset(['reset-password', 'me@example.com']);
      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await store.get({ PK: 'AUTH#SETUP', SK: 'DONE' })).toBeDefined();
      store.close();
    });

    it('refuses a password that fails the policy, changing nothing', async () => {
      const { sessions } = await seedTwoAccounts();
      await expect(reset(['reset-password', 'me@example.com'], 'short')).rejects.toThrow(/at least 12/);
      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await verifyPassword(OLD, (await getAccountByEmail(store, 'me@example.com'))!)).toBe(true);
      expect(await readSession(store, sessions.me, now())).toBeDefined();
      store.close();
    });

    it('says so when no account has that email, before asking for a password', async () => {
      await seedTwoAccounts();
      const readPassword = vi.fn(async () => NEW);
      await expect(runCli(['reset-password', 'nobody@example.com'], env, { readPassword })).rejects.toThrow(/No account/);
      expect(readPassword).not.toHaveBeenCalled();
    });

    it('needs an email: with none it prints usage, and asks for no password', async () => {
      await seedTwoAccounts();
      const readPassword = vi.fn(async () => NEW);
      await expect(runCli(['reset-password'], env, { readPassword })).rejects.toThrow(/Usage[\s\S]*reset-password <email>/);
      expect(readPassword).not.toHaveBeenCalled();
    });

    it('takes exactly one argument, and never a password: a second argument is usage, and an argument that is not an email is refused without echoing it', async () => {
      await seedTwoAccounts();
      const readPassword = vi.fn(async () => NEW);
      await expect(runCli(['reset-password', 'me@example.com', 'sneaky-password-123'], env, { readPassword })).rejects.toThrow(/Usage/);
      const refused = await runCli(['reset-password', 'sneaky-password-123'], env, { readPassword }).then(() => undefined, (error: Error) => error);
      expect(refused?.message).toMatch(/not a usable email/i);
      expect(refused?.message).not.toContain('sneaky-password-123');
      expect(readPassword).not.toHaveBeenCalled();
      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await verifyPassword(OLD, (await getAccountByEmail(store, 'me@example.com'))!)).toBe(true);
      store.close();
    });

    it('lists the new form in its usage text', async () => {
      expect(await runCli(['--help'], env)).toMatch(/reset-password <email>/);
    });
  });

  describe('backup', () => {
    it('writes a verified owner-only copy and refuses to overwrite', async () => {
      await seedDatabase();
      const out = join(dir, 'copy.sqlite');
      const message = await runCli(['backup', '--out', out], env);
      expect(message).toContain('Backed up');
      expect(statSync(out).mode & 0o077).toBe(0);
      setStore(undefined);
      await expect(runCli(['backup', '--out', out], env)).rejects.toThrow(/already exists/);
    });

    it('needs --out and a SQLite store', async () => {
      await expect(runCli(['backup'], env)).rejects.toThrow(/Usage/);
      setStore(undefined);
      await expect(runCli(['backup', '--out', join(dir, 'x.sqlite')], { STORE: 'dynamodb', DYNAMODB_TABLE: 't' })).rejects.toThrow(/sqlite/i);
    });
  });
});
