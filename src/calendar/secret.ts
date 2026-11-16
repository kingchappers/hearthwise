import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A feed's link is a bearer secret. It is stored encrypted (AES-256-GCM) in its own item, with the household and the feed as
// additional authenticated data, so a ciphertext copied to another feed does not decrypt. No route returns it and nothing here logs it.

export interface SecretEnvelope {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

export interface LinkBinding {
  householdId: string;
  feedId: string;
}

export interface CalendarKeyDeps {
  // The container's data folder: where calendar.key lives. Absent on AWS.
  dataDir?: string;
  log?: (message: string) => void;
  readParameter?: (name: string) => Promise<string>;
}

// Carries a code and nothing else: never the link, an id or a library message.
export class SecretError extends Error {
  constructor() {
    super('calendar_secret_unreadable');
    this.name = 'SecretError';
  }
}

const VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FILE = 'calendar.key';

// JSON, so ids that run together ("a|b" and "c" against "a" and "b|c") can never give the same bytes.
const additionalData = (binding: LinkBinding): Buffer => Buffer.from(JSON.stringify(['hearthwise-calendar-link', VERSION, binding.householdId, binding.feedId]));

function checkKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new SecretError();
}

export function encryptLink(key: Buffer, link: string, binding: LinkBinding): SecretEnvelope {
  checkKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(binding));
  const data = Buffer.concat([cipher.update(link, 'utf8'), cipher.final()]);
  return { v: VERSION, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decryptLink(key: Buffer, envelope: SecretEnvelope, binding: LinkBinding): string {
  checkKey(key);
  try {
    if (typeof envelope !== 'object' || envelope === null || envelope.v !== VERSION) throw new SecretError();
    const { iv, tag, data } = envelope;
    if (typeof iv !== 'string' || typeof tag !== 'string' || typeof data !== 'string') throw new SecretError();
    const ivBytes = Buffer.from(iv, 'base64');
    const tagBytes = Buffer.from(tag, 'base64');
    if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw new SecretError();
    const decipher = createDecipheriv('aes-256-gcm', key, ivBytes, { authTagLength: TAG_BYTES });
    decipher.setAAD(additionalData(binding));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Whatever went wrong, the caller learns only that the link cannot be read.
    throw new SecretError();
  }
}

function parseKey(text: string): Buffer | undefined {
  const trimmed = text.trim();
  const bytes = Buffer.from(trimmed, 'base64');
  if (bytes.length !== KEY_BYTES || bytes.toString('base64') !== trimmed) return undefined;
  return bytes;
}

async function readSsmParameter(name: string): Promise<string> {
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const result = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) throw new Error('Parameter has no value');
  return value;
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'Error');

// Where the key comes from depends on where this runs, as for the push keys. On AWS it is an SSM parameter (CALENDAR_KEY_PARAMETER,
// created by hand); there is no fallback from it. In the container the environment variable CALENDAR_KEY wins, then
// <dataDir>/calendar.key, and a key is made (mode 0600) the first time there is neither. No key means no calendars: add and refresh
// say so kindly, and nothing crashes. A bad key is never replaced, because replacing it would strand every stored link.
export async function loadCalendarKey(env: NodeJS.ProcessEnv, deps: CalendarKeyDeps = {}): Promise<Buffer | undefined> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const missing = (reason: string): undefined => {
    log(JSON.stringify({ event: 'calendar_key_missing', reason }));
    return undefined;
  };

  if (env.CALENDAR_KEY_PARAMETER) {
    try {
      const key = parseKey(await (deps.readParameter ?? readSsmParameter)(env.CALENDAR_KEY_PARAMETER));
      return key ?? missing('invalid');
    } catch (error) {
      return missing(`unreadable:${errorName(error)}`);
    }
  }

  if (env.CALENDAR_KEY) return parseKey(env.CALENDAR_KEY) ?? missing('invalid');

  if (!deps.dataDir) return missing('not_set');
  const file = join(deps.dataDir, FILE);
  try {
    if (existsSync(file)) return parseKey(readFileSync(file, 'utf8')) ?? missing('invalid');
    const created = randomBytes(KEY_BYTES);
    writeFileSync(file, created.toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
    chmodSync(file, 0o600);
    log(`Calendar key created in the data folder (${FILE})`);
    return created;
  } catch (error) {
    return missing(`file:${errorName(error)}`);
  }
}
