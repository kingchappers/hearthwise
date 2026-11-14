import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface VapidDeps {
  // The container's data folder: where vapid.json lives. Absent on AWS.
  dataDir?: string;
  log?: (message: string) => void;
  readParameter?: (name: string) => Promise<string>;
}

const DEFAULT_SUBJECT = 'mailto:admin@localhost';
const FILE = 'vapid.json';

async function readSsmParameter(name: string): Promise<string> {
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const result = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) throw new Error('Parameter has no value');
  return value;
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'Error');

// Where the keys come from depends on where this runs. On AWS the private key is an SSM parameter (never in the repository or in
// state); the public key and the subject are plain settings. In the container the environment wins, then <dataDir>/vapid.json, and
// a pair is generated (mode 0600) the first time there is neither. No keys means no push, never a failure to start.
export async function loadVapid(env: NodeJS.ProcessEnv, deps: VapidDeps = {}): Promise<Vapid | undefined> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const subject = env.VAPID_SUBJECT || DEFAULT_SUBJECT;

  if (env.VAPID_PRIVATE_KEY_PARAMETER) {
    if (!env.VAPID_PUBLIC_KEY) {
      log('Push is off: VAPID_PUBLIC_KEY is not set');
      return undefined;
    }
    try {
      const privateKey = await (deps.readParameter ?? readSsmParameter)(env.VAPID_PRIVATE_KEY_PARAMETER);
      return { publicKey: env.VAPID_PUBLIC_KEY, privateKey, subject };
    } catch (error) {
      log(`Push is off: the VAPID private key could not be read (${errorName(error)})`);
      return undefined;
    }
  }

  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject };
  }

  if (!deps.dataDir) return undefined;
  const file = join(deps.dataDir, FILE);
  try {
    if (existsSync(file)) {
      const stored = JSON.parse(readFileSync(file, 'utf8')) as { publicKey?: unknown; privateKey?: unknown; subject?: unknown };
      if (typeof stored.publicKey !== 'string' || typeof stored.privateKey !== 'string') throw new Error('Incomplete');
      return { publicKey: stored.publicKey, privateKey: stored.privateKey, subject: env.VAPID_SUBJECT || (typeof stored.subject === 'string' ? stored.subject : DEFAULT_SUBJECT) };
    }
    const webpush = (await import('web-push')).default;
    const generated = webpush.generateVAPIDKeys();
    const created: Vapid = { publicKey: generated.publicKey, privateKey: generated.privateKey, subject };
    writeFileSync(file, JSON.stringify(created) + '\n', { mode: 0o600 });
    chmodSync(file, 0o600);
    log('Push keys created in the data folder (vapid.json)');
    return created;
  } catch (error) {
    log(`Push is off: ${FILE} could not be used (${errorName(error)})`);
    return undefined;
  }
}
