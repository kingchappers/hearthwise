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
    ['an http endpoint', { endpoint: 'http://x.example/a', keys: KEYS }, 'endpoint'],
    ['an endpoint over 2,000 characters', { endpoint: `https://x.example/${'a'.repeat(2000)}`, keys: KEYS }, 'endpoint'],
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
