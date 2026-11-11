import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStore } from '..';
import { createAccount, createSession, getAccount, recordFailure, throttleRemaining } from '../../auth/localData';
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
      ['reset-password', ['reset-password']],
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

  describe('reset-password', () => {
    async function seedAccount(): Promise<void> {
      const store = new SqliteStore(env.SQLITE_PATH as string);
      await createAccount(store, 'me@example.com', 'the old password 1');
      await createSession(store, 'local|u1', Math.floor(Date.now() / 1000));
      for (let i = 0; i < 6; i++) await recordFailure(store, Math.floor(Date.now() / 1000));
      store.close();
    }

    it('sets the new password, ends every session and clears the lock-out', async () => {
      await seedAccount();
      const message = await runCli(['reset-password'], env, { readPassword: async () => 'the new password 22' });
      expect(message).toMatch(/all sessions have ended/i);

      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await verifyPassword('the new password 22', (await getAccount(store))!)).toBe(true);
      expect(await store.query('AUTH#SESSIONS')).toEqual([]);
      expect(await throttleRemaining(store, Math.floor(Date.now() / 1000))).toBe(0);
      store.close();
    });

    it('replaces the password before ending sessions, so no old-password session can outlive the reset', async () => {
      await seedAccount();
      const realDelete = SqliteStore.prototype.delete;
      let oldPasswordStillWorkedAtSessionDelete: boolean | undefined;
      vi.spyOn(SqliteStore.prototype, 'delete').mockImplementation(async function (this: SqliteStore, key, options) {
        if (key.PK === 'AUTH#SESSIONS' && oldPasswordStillWorkedAtSessionDelete === undefined) {
          oldPasswordStillWorkedAtSessionDelete = await verifyPassword('the old password 1', (await getAccount(this))!);
        }
        return realDelete.call(this, key, options);
      });

      await runCli(['reset-password'], env, { readPassword: async () => 'the new password 22' });
      vi.restoreAllMocks();

      expect(oldPasswordStillWorkedAtSessionDelete).toBe(false);
      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await store.query('AUTH#SESSIONS')).toEqual([]);
      expect(await verifyPassword('the new password 22', (await getAccount(store))!)).toBe(true);
      store.close();
    });

    it('refuses a password that fails the policy, changing nothing', async () => {
      await seedAccount();
      await expect(runCli(['reset-password'], env, { readPassword: async () => 'short' })).rejects.toThrow(/at least 12/);
      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await verifyPassword('the old password 1', (await getAccount(store))!)).toBe(true);
      expect((await store.query('AUTH#SESSIONS')).length).toBe(1);
      store.close();
    });

    it('refuses when no account exists yet', async () => {
      await seedDatabase();
      await expect(runCli(['reset-password'], env, { readPassword: async () => 'the new password 22' })).rejects.toThrow(/No account/);
    });

    it('never takes the password from argv or the environment', async () => {
      await seedAccount();
      const readPassword = vi.fn(async () => 'a valid password 99');
      await expect(runCli(['reset-password', 'sneaky-password-123'], env, { readPassword })).rejects.toThrow(/Usage/);
      expect(readPassword).not.toHaveBeenCalled();
      const store = new SqliteStore(env.SQLITE_PATH as string);
      expect(await verifyPassword('the old password 1', (await getAccount(store))!)).toBe(true);
      expect((await store.query('AUTH#SESSIONS')).length).toBe(1);
      store.close();
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
