import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStore } from '..';
import { createFirstAccount, createSession, getAccountByEmail, readSession, recordFailure, throttleRemaining } from '../../auth/localData';
import { verifyPassword } from '../../auth/password';
import { runCli } from '../cli';
import { SqliteStore } from '../sqlite';
import { computeTotal, loanProgress } from '../../shared/ledger';
import { toEntry } from '../../money/entries';
import { formatPounds } from '../../shared/money';

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

  describe('money-total <householdId>', () => {
    const base = { fieldTimes: {}, version: 1, createdAt: 1, updatedAt: 1, status: 'agreed', proposedBy: 'u1', agreedBy: 'u2' };
    const row = (id: string, over: Record<string, unknown>) => ({
      PK: 'HH#h1', SK: `MONEY#${id}`, description: 'x', on: '2026-11-01', createdBy: 'u1', updatedBy: 'u1', ...base, ...over,
    });

    async function seedMoney(members: string[]): Promise<void> {
      const store = new SqliteStore(env.SQLITE_PATH as string);
      for (const [i, id] of members.entries()) {
        await store.put({ PK: 'HH#h1', SK: `MEMBER#${id}`, displayName: i === 0 ? 'Sam' : 'Alex', joinedAt: `2026-11-0${i + 1}T10:00:00.000Z` });
      }
      await store.put(row('loan1', { kind: 'loan', paidBy: 'u1', amountPence: 10000, sharePence: 10000 }));
      await store.put(row('pay1', { kind: 'payment', paidBy: 'u2', amountPence: 2500, sharePence: 2500, loanId: 'loan1' }));
      await store.put(row('exp1', { kind: 'expense', paidBy: 'u2', amountPence: 3001, sharePence: 1500 }));
      await store.put(row('wait1', { kind: 'expense', paidBy: 'u1', amountPence: 9999, sharePence: 5000, status: 'waiting' }));
      store.close();
    }

    const entriesOf = async () => {
      const store = new SqliteStore(env.SQLITE_PATH as string);
      const rows = (await store.query('HH#h1', { skPrefix: 'MONEY#' })).map(toEntry);
      store.close();
      return rows;
    };

    it('prints the total and each loan\'s progress for two members', async () => {
      await seedMoney(['u1', 'u2']);
      const total = computeTotal(await entriesOf(), 'u1', 'u2');

      const out = await runCli(['money-total', 'h1'], env);

      expect(total).toEqual({ direction: 'toMe', pence: 6000 });
      expect(out).toContain(`Alex pays Sam ${formatPounds(total.pence)}`);
      expect(out).toContain(`${formatPounds(loanProgress(await entriesOf(), 'loan1'))} of ${formatPounds(10000)}`);
    });

    it('works with one member and counts only what that member paid', async () => {
      await seedMoney(['u1']);

      const out = await runCli(['money-total', 'h1'], env);

      expect(out).toContain('1 member');
      expect(out).toContain(`Total: ${formatPounds(computeTotal(await entriesOf(), 'u1', '').pence)}`);
    });

    it('writes nothing', async () => {
      await seedMoney(['u1', 'u2']);
      const before = await entriesOf();
      await runCli(['money-total', 'h1'], env);
      expect(await entriesOf()).toEqual(before);
    });

    it('needs exactly one household id', async () => {
      await seedMoney(['u1', 'u2']);
      await expect(runCli(['money-total'], env)).rejects.toThrow('Usage');
      await expect(runCli(['money-total', 'h1', 'h2'], env)).rejects.toThrow('Usage');
    });
  });
});
