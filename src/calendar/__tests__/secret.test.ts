import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptLink, encryptLink, loadCalendarKey, SecretError } from '../secret';

const LINK = 'https://calendar.google.com/calendar/ical/me%40example.com/private-SENTINEL/basic.ics';
const AAD = { householdId: 'hh-1', feedId: 'feed-1' };
const key = (): Buffer => randomBytes(32);

describe('encryptLink and decryptLink', () => {
  it('round-trips a link', () => {
    const k = key();
    expect(decryptLink(k, encryptLink(k, LINK, AAD), AAD)).toBe(LINK);
  });

  it('stores a versioned envelope of base64 text that holds no part of the link', () => {
    const envelope = encryptLink(key(), LINK, AAD);
    expect(Object.keys(envelope).sort()).toEqual(['data', 'iv', 'tag', 'v']);
    expect(envelope.v).toBe(1);
    expect(JSON.stringify(envelope)).not.toContain('SENTINEL');
    expect(JSON.stringify(envelope)).not.toContain('calendar.google.com');
    expect(Buffer.from(envelope.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(envelope.tag, 'base64')).toHaveLength(16);
  });

  it('uses a new nonce each time', () => {
    const k = key();
    const a = encryptLink(k, LINK, AAD);
    const b = encryptLink(k, LINK, AAD);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('refuses a wrong key', () => {
    const envelope = encryptLink(key(), LINK, AAD);
    expect(() => decryptLink(key(), envelope, AAD)).toThrow(SecretError);
  });

  it.each(['data', 'iv', 'tag'] as const)('refuses a changed byte in %s', field => {
    const k = key();
    const envelope = encryptLink(k, LINK, AAD);
    const bytes = Buffer.from(envelope[field], 'base64');
    bytes[0] ^= 1;
    expect(() => decryptLink(k, { ...envelope, [field]: bytes.toString('base64') }, AAD)).toThrow(SecretError);
  });

  it('refuses a ciphertext moved to another feed or another household', () => {
    const k = key();
    const envelope = encryptLink(k, LINK, AAD);
    expect(() => decryptLink(k, envelope, { householdId: 'hh-1', feedId: 'feed-2' })).toThrow(SecretError);
    expect(() => decryptLink(k, envelope, { householdId: 'hh-2', feedId: 'feed-1' })).toThrow(SecretError);
  });

  it('does not confuse ids that run together', () => {
    const k = key();
    const envelope = encryptLink(k, LINK, { householdId: 'a', feedId: 'b|c' });
    expect(() => decryptLink(k, envelope, { householdId: 'a|b', feedId: 'c' })).toThrow(SecretError);
  });

  it('refuses an unknown version, a missing field and junk, with an error that holds no content', () => {
    const k = key();
    const envelope = encryptLink(k, LINK, AAD);
    for (const bad of [{ ...envelope, v: 2 }, { ...envelope, iv: undefined }, { v: 1 }, null, 'text', { ...envelope, iv: 'AAAA' }, { ...envelope, tag: 'AA' }]) {
      let caught: unknown;
      try {
        decryptLink(k, bad as never, AAD);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SecretError);
      expect(String((caught as Error).message)).not.toContain('SENTINEL');
      expect(String((caught as Error).message)).not.toContain('hh-1');
    }
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => encryptLink(randomBytes(16), LINK, AAD)).toThrow(SecretError);
    expect(() => decryptLink(randomBytes(31), encryptLink(key(), LINK, AAD), AAD)).toThrow(SecretError);
  });
});

describe('loadCalendarKey', () => {
  let dir: string;
  const good = randomBytes(32).toString('base64');
  const log = vi.fn();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hearthwise-key-'));
    log.mockReset();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the SSM parameter named by CALENDAR_KEY_PARAMETER', async () => {
    const readParameter = vi.fn(async () => good);
    const loaded = await loadCalendarKey({ CALENDAR_KEY_PARAMETER: '/hearthwise/calendar-key' }, { readParameter, log });
    expect(readParameter).toHaveBeenCalledWith('/hearthwise/calendar-key');
    expect(loaded?.equals(Buffer.from(good, 'base64'))).toBe(true);
  });

  it('is off, with a code in the log, when the parameter cannot be read', async () => {
    const readParameter = vi.fn(async () => {
      throw new Error('AccessDenied SENTINEL');
    });
    expect(await loadCalendarKey({ CALENDAR_KEY_PARAMETER: '/hearthwise/calendar-key' }, { readParameter, log })).toBeUndefined();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('calendar_key_missing');
    expect(logged).not.toContain('SENTINEL');
  });

  it('does not fall back to the environment or the file on AWS when the parameter fails', async () => {
    const readParameter = async (): Promise<string> => {
      throw new Error('x');
    };
    expect(await loadCalendarKey({ CALENDAR_KEY_PARAMETER: '/p', CALENDAR_KEY: good }, { readParameter, dataDir: dir, log })).toBeUndefined();
    expect(existsSync(join(dir, 'calendar.key'))).toBe(false);
  });

  it('reads CALENDAR_KEY from the environment', async () => {
    expect((await loadCalendarKey({ CALENDAR_KEY: good }, { log }))?.equals(Buffer.from(good, 'base64'))).toBe(true);
  });

  it('reads <dataDir>/calendar.key', async () => {
    writeFileSync(join(dir, 'calendar.key'), good + '\n', { mode: 0o600 });
    expect((await loadCalendarKey({}, { dataDir: dir, log }))?.equals(Buffer.from(good, 'base64'))).toBe(true);
  });

  it('makes a key file, mode 0600, the first time there is neither, and reads the same one after', async () => {
    const first = await loadCalendarKey({}, { dataDir: dir, log });
    expect(first).toHaveLength(32);
    expect(statSync(join(dir, 'calendar.key')).mode & 0o777).toBe(0o600);
    const second = await loadCalendarKey({}, { dataDir: dir, log });
    expect(second?.equals(first as Buffer)).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain(first!.toString('base64'));
  });

  it('is off (calendar_key_missing) with no parameter, no variable and no data folder', async () => {
    expect(await loadCalendarKey({}, { log })).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).toContain('calendar_key_missing');
  });

  it.each(['', 'not base64 !!', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64')])('rejects a key that is not 32 bytes of base64 (%j)', async bad => {
    expect(await loadCalendarKey({ CALENDAR_KEY: bad }, { dataDir: undefined, log })).toBeUndefined();
    writeFileSync(join(dir, 'calendar.key'), bad);
    expect(await loadCalendarKey({}, { dataDir: dir, log })).toBeUndefined();
    expect(readFileSync(join(dir, 'calendar.key'), 'utf8')).toBe(bad);
  });
});
