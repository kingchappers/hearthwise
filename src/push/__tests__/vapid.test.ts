import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadVapid } from '../vapid';

let dir: string;
let logs: string[];
const log = (message: string): void => { logs.push(message); };
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'vapid-')); logs = []; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('in the container (a data folder, no SSM)', () => {
  it('generates a key pair once, writes it with mode 0600, and reuses it', async () => {
    const first = (await loadVapid({}, { dataDir: dir, log }))!;
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{80,100}$/);
    expect(first.subject).toBe('mailto:admin@localhost');
    expect(statSync(join(dir, 'vapid.json')).mode & 0o777).toBe(0o600);
    const second = (await loadVapid({}, { dataDir: dir, log }))!;
    expect(second).toEqual(first);
  });

  it('lets environment variables override the file', async () => {
    await loadVapid({}, { dataDir: dir, log });
    const given = await loadVapid({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:me@example.com' }, { dataDir: dir, log });
    expect(given).toEqual({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:me@example.com' });
  });

  it('never logs the private key', async () => {
    const vapid = (await loadVapid({}, { dataDir: dir, log }))!;
    await loadVapid({}, { dataDir: dir, log });
    expect(logs.join('\n')).not.toContain(vapid.privateKey);
  });

  it('reads a file that holds only a subject-less pair', async () => {
    writeFileSync(join(dir, 'vapid.json'), JSON.stringify({ publicKey: 'p', privateKey: 'k' }));
    expect(await loadVapid({}, { dataDir: dir, log })).toEqual({ publicKey: 'p', privateKey: 'k', subject: 'mailto:admin@localhost' });
  });

  it('keeps going without push, and says so, when the file is corrupt', async () => {
    writeFileSync(join(dir, 'vapid.json'), '{not json');
    expect(await loadVapid({}, { dataDir: dir, log })).toBeUndefined();
    expect(logs.join('\n')).toMatch(/vapid/i);
    expect(readFileSync(join(dir, 'vapid.json'), 'utf8')).toBe('{not json');
  });

  it('is nothing when there is no data folder and no environment keys', async () => {
    expect(await loadVapid({}, { log })).toBeUndefined();
  });
});

describe('on AWS (a parameter name)', () => {
  const env = { VAPID_PRIVATE_KEY_PARAMETER: '/hearthwise/vapid-private-key', VAPID_PUBLIC_KEY: 'pub', VAPID_SUBJECT: 'mailto:a@example.com' };

  it('reads the private key from the named parameter and the rest from the environment', async () => {
    const asked: string[] = [];
    const vapid = await loadVapid(env, { log, readParameter: async name => { asked.push(name); return 'secret'; } });
    expect(vapid).toEqual({ publicKey: 'pub', privateKey: 'secret', subject: 'mailto:a@example.com' });
    expect(asked).toEqual(['/hearthwise/vapid-private-key']);
  });

  it('is nothing, without throwing, when the parameter cannot be read, and does not log the key', async () => {
    const vapid = await loadVapid(env, { log, readParameter: async () => { throw new Error('AccessDenied secret'); } });
    expect(vapid).toBeUndefined();
    expect(logs.join('\n')).not.toContain('secret');
  });

  it('is nothing when the public key is not set', async () => {
    expect(await loadVapid({ VAPID_PRIVATE_KEY_PARAMETER: '/x' }, { log, readParameter: async () => 'k' })).toBeUndefined();
  });
});
