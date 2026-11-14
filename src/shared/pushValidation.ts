import { bad, good, isObject, unknownKey } from './validation';
import type { Parsed } from './validation';

const MAX_ENDPOINT = 2000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function parseEndpoint(value: unknown): Parsed<string> {
  if (typeof value !== 'string' || value.length > MAX_ENDPOINT) return bad('endpoint');
  try {
    return new URL(value).protocol === 'https:' ? good(value) : bad('endpoint');
  } catch {
    return bad('endpoint');
  }
}

const key = (value: unknown, min: number, max: number, field: string): Parsed<string> =>
  typeof value === 'string' && value.length >= min && value.length <= max && BASE64URL.test(value) ? good(value) : bad(field);

export function parseSubscribeBody(body: Record<string, unknown>): Parsed<{ endpoint: string; p256dh: string; auth: string }> {
  const extra = unknownKey(body, ['endpoint', 'keys'], '');
  if (extra) return bad(extra);
  const endpoint = parseEndpoint(body.endpoint);
  if (!endpoint.ok) return endpoint;
  if (!isObject(body.keys)) return bad('keys');
  const keysExtra = unknownKey(body.keys, ['p256dh', 'auth'], 'keys');
  if (keysExtra) return bad(keysExtra);
  // A P-256 public key is 65 bytes (87 characters); the auth secret is 16 bytes (22).
  const p256dh = key(body.keys.p256dh, 80, 100, 'keys.p256dh');
  if (!p256dh.ok) return p256dh;
  const auth = key(body.keys.auth, 20, 30, 'keys.auth');
  if (!auth.ok) return auth;
  return good({ endpoint: endpoint.value, p256dh: p256dh.value, auth: auth.value });
}

export function parseUnsubscribeBody(body: Record<string, unknown>): Parsed<{ endpoint: string }> {
  const extra = unknownKey(body, ['endpoint'], '');
  if (extra) return bad(extra);
  const endpoint = parseEndpoint(body.endpoint);
  return endpoint.ok ? good({ endpoint: endpoint.value }) : endpoint;
}
