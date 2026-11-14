import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listSubscribedUsers, loadSubscriptions } from '../../push/subscriptions';
import { getStore, setStore } from '../../store';
import { MemoryStore } from '../../store/memory';
import { registerPushRoutes } from '../push';
import { createRouter, type Router } from '../router';

let router: Router;
const KEYS = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
const URL_OK = 'https://fcm.googleapis.com/fcm/send/abc';

function event(method: string, body?: unknown): APIGatewayProxyEventV2 {
  return {
    rawPath: '/api/push/subscriptions', requestContext: { http: { method } }, body: body === undefined ? undefined : JSON.stringify(body),
    headers: {}, queryStringParameters: {}, isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
const call = async (method: string, body?: unknown, user = 'auth0|u1') => {
  const res = await router.dispatch(event(method, body), user);
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : undefined };
};

beforeEach(() => { setStore(new MemoryStore()); router = createRouter(); registerPushRoutes(router); });
afterEach(() => setStore(undefined));

describe('subscribing', () => {
  it('stores the device for the caller only, with no settings', async () => {
    expect((await call('POST', { endpoint: URL_OK, keys: KEYS })).status).toBe(201);
    expect(await loadSubscriptions(getStore(), 'auth0|u1')).toHaveLength(1);
    expect(await loadSubscriptions(getStore(), 'auth0|u2')).toEqual([]);
    expect(await listSubscribedUsers(getStore())).toEqual(['auth0|u1']);
  });

  it.each([
    ['an http endpoint', { endpoint: 'http://fcm.googleapis.com/a', keys: KEYS }, 'endpoint'],
    ['an endpoint over 2,000 characters', { endpoint: `https://fcm.googleapis.com/${'a'.repeat(2000)}`, keys: KEYS }, 'endpoint'],
    ['keys that are not base64url', { endpoint: URL_OK, keys: { p256dh: '!!!', auth: KEYS.auth } }, 'keys.p256dh'],
    ['a missing auth key', { endpoint: URL_OK, keys: { p256dh: KEYS.p256dh } }, 'keys.auth'],
    ['settings in the body', { endpoint: URL_OK, keys: KEYS, settings: {} }, 'settings'],
  ])('refuses %s, naming the field', async (_name, body, field) => {
    expect(await call('POST', body)).toEqual({ status: 400, json: { error: 'invalid', field } });
  });

  it('refuses a body that is not JSON', async () => {
    const res = await router.dispatch({ ...event('POST'), body: 'nope' } as APIGatewayProxyEventV2, 'auth0|u1');
    expect(res.statusCode).toBe(400);
  });
});

describe('where a device may be', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('accepts the push service at %s', async endpoint => {
    expect((await call('POST', { endpoint, keys: KEYS })).status).toBe(201);
  });

  it.each([
    ['a host that is not a push service', 'https://evil.example/hook'],
    ['an internal address', 'https://169.254.169.254/latest/meta-data'],
    ['an IP literal', 'https://10.0.0.5/x'],
    ['localhost', 'https://localhost/x'],
    ['a look-alike host', 'https://fcm.googleapis.com.evil.example/x'],
    ['a custom port', 'https://fcm.googleapis.com:8443/x'],
    ['credentials in the address', 'https://user:pass@fcm.googleapis.com/x'],
  ])('refuses %s, so the server never calls it', async (_name, endpoint) => {
    expect(await call('POST', { endpoint, keys: KEYS })).toEqual({ status: 400, json: { error: 'invalid', field: 'endpoint' } });
    expect(await loadSubscriptions(getStore(), 'auth0|u1')).toEqual([]);
  });

  it('keeps at most ten devices for a person, but lets a known device be saved again', async () => {
    for (let i = 0; i < 10; i += 1) expect((await call('POST', { endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, keys: KEYS })).status).toBe(201);
    expect(await call('POST', { endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: KEYS })).toEqual({ status: 409, json: { error: 'too_many_devices' } });
    expect((await call('POST', { endpoint: 'https://fcm.googleapis.com/fcm/send/3', keys: KEYS })).status).toBe(201);
    expect(await loadSubscriptions(getStore(), 'auth0|u1')).toHaveLength(10);
  });
});

describe('unsubscribing', () => {
  it('removes the device and is quiet about one that is not there', async () => {
    await call('POST', { endpoint: URL_OK, keys: KEYS });
    expect((await call('DELETE', { endpoint: URL_OK })).status).toBe(204);
    expect(await loadSubscriptions(getStore(), 'auth0|u1')).toEqual([]);
    expect((await call('DELETE', { endpoint: URL_OK })).status).toBe(204);
  });

  it('cannot remove somebody else\'s device', async () => {
    await call('POST', { endpoint: URL_OK, keys: KEYS }, 'auth0|u2');
    await call('DELETE', { endpoint: URL_OK }, 'auth0|u1');
    expect(await loadSubscriptions(getStore(), 'auth0|u2')).toHaveLength(1);
  });
});
