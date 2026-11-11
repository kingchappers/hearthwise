import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const { mockVerify, mockGetSigningKey, health } = vi.hoisted(() => {
  process.env.AUTH0_DOMAIN = 'tenant.example.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  return { mockVerify: vi.fn(), mockGetSigningKey: vi.fn(), health: vi.fn() };
});

vi.mock('jsonwebtoken', () => ({ verify: mockVerify }));
vi.mock('jwks-rsa', () => ({ default: () => ({ getSigningKey: mockGetSigningKey }) }));
vi.mock('../routes', () => ({
  registerCoreRoutes: (router: { get(path: string, handler: unknown): void }) => router.get('/api/health', health),
}));
const { mockInitStore } = vi.hoisted(() => ({ mockInitStore: vi.fn() }));
vi.mock('../../store', () => ({ initStore: mockInitStore }));

import { handler } from '../../../api-handler';
import { SECURITY_HEADERS } from '../constants';

const TOKEN = 'secret-token-abc123';

function makeEvent(overrides: { method?: string; path?: string; authorization?: string | null } = {}): APIGatewayProxyEventV2 {
  const { method = 'GET', path = '/api/health', authorization = `Bearer ${TOKEN}` } = overrides;
  return {
    rawPath: path,
    headers: authorization === null ? {} : { authorization },
    requestContext: { routeKey: `${method} /templated`, http: { method, sourceIp: '203.0.113.9' } },
  } as unknown as APIGatewayProxyEventV2;
}

async function invoke(event: APIGatewayProxyEventV2): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  return (await handler(event, {} as Context, () => {})) as { statusCode: number; headers: Record<string, string>; body: string };
}

function allowToken(claims: Record<string, unknown> = { sub: 'user-123' }): void {
  mockVerify.mockImplementation((_token, _getKey, _options, callback) => callback(null, claims));
}

function rejectToken(message = 'invalid signature'): void {
  mockVerify.mockImplementation((_token, _getKey, _options, callback) => callback(new Error(message)));
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockVerify.mockReset();
  mockGetSigningKey.mockReset();
  health.mockReset().mockResolvedValue({ statusCode: 200, headers: {}, body: JSON.stringify({ handled: 'health' }) });
  allowToken();
  mockInitStore.mockReset().mockResolvedValue(undefined);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('authentication', () => {
  it('answers 401 with no token and never reaches a handler', async () => {
    const res = await invoke(makeEvent({ authorization: null }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Missing authorization token' });
    expect(res.headers).toEqual(SECURITY_HEADERS);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockInitStore).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
  });

  it('answers 401 for a header that has the Bearer prefix but no token', async () => {
    const res = await invoke(makeEvent({ authorization: 'Bearer ' }));
    expect(res.statusCode).toBe(401);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockInitStore).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
  });

  it('answers 401 for a token that fails verification, without saying why', async () => {
    rejectToken('jwt expired: details that must not leak');
    const res = await invoke(makeEvent());
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Unauthorized' });
    expect(res.body).not.toContain('expired');
    expect(res.headers).toEqual(SECURITY_HEADERS);
    expect(mockInitStore).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['a number', 12345],
    ['an object', { id: 'user-123' }],
  ])('answers 401 for a verified token whose sub is %s', async (_label, sub) => {
    allowToken({ sub });
    const res = await invoke(makeEvent());
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Unauthorized' });
    expect(health).not.toHaveBeenCalled();
  });

  it('verifies with RS256 only, the configured audience and the tenant issuer', async () => {
    await invoke(makeEvent());
    expect(mockVerify).toHaveBeenCalledTimes(1);
    const [token, , options] = mockVerify.mock.calls[0];
    expect(token).toBe(TOKEN);
    expect(options).toEqual({ audience: 'https://api.example.com', issuer: 'https://tenant.example.com/', algorithms: ['RS256'] });
  });

  it('hands the handler the user id from the token, not anything from the request', async () => {
    allowToken({ sub: 'auth0|from-the-token' });
    const event = makeEvent();
    (event.headers as Record<string, string>)['x-user-id'] = 'someone-else';
    await invoke(event);
    expect(health).toHaveBeenCalledWith(event, 'auth0|from-the-token', {});
  });

  describe('looking up the signing key', () => {
    function signingKeyLookup(): (header: { kid: string }, callback: (err: Error | null, key?: string) => void) => void {
      return mockVerify.mock.calls[0][1];
    }

    it('asks the JWKS client for the key named in the token header and passes on its public key', async () => {
      await invoke(makeEvent());
      mockGetSigningKey.mockImplementation((_kid, callback) => callback(null, { getPublicKey: () => 'PUBLIC-KEY' }));
      const callback = vi.fn();
      signingKeyLookup()({ kid: 'key-1' }, callback);
      expect(mockGetSigningKey).toHaveBeenCalledWith('key-1', expect.any(Function));
      expect(callback).toHaveBeenCalledWith(null, 'PUBLIC-KEY');
    });

    it('passes a lookup failure on, so the token is refused', async () => {
      await invoke(makeEvent());
      const failure = new Error('no such key');
      mockGetSigningKey.mockImplementation((_kid, callback) => callback(failure));
      const callback = vi.fn();
      signingKeyLookup()({ kid: 'missing' }, callback);
      expect(callback).toHaveBeenCalledWith(failure);
    });
  });

  it('logs the templated route and never the token or the raw path', async () => {
    await invoke(makeEvent({ path: '/api/things/t-private-id', method: 'DELETE' }));
    const logged = JSON.stringify([...logSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(logged).toContain('DELETE /templated');
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('t-private-id');
  });
});

describe('route table', () => {
  it('sends GET /api/health to the health handler and to nothing else', async () => {
    const res = await invoke(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(health).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unknown path', 'GET', '/api/nope'],
    ['a known path with the wrong method', 'POST', '/api/health'],
    ['a path with an extra segment', 'GET', '/api/health/extra'],
  ])('answers 404 for %s', async (_label, method, path) => {
    const res = await invoke(makeEvent({ method, path }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Endpoint not found' });
    expect(health).not.toHaveBeenCalled();
  });

  it('checks the token before it looks at the route', async () => {
    rejectToken();
    const res = await invoke(makeEvent({ method: 'GET', path: '/api/nope' }));
    expect(res.statusCode).toBe(401);
  });
});

describe('a handler that fails', () => {
  it('answers a JSON 500 with a generic message when the handler rejects', async () => {
    health.mockRejectedValue(new Error('dynamodb: secret table name exploded'));
    const res = await invoke(makeEvent());
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'Internal server error' });
    expect(res.body).not.toContain('dynamodb');
    expect(res.headers).toEqual(SECURITY_HEADERS);
  });

  it('answers the same when the handler throws before returning a promise', async () => {
    health.mockImplementation(() => { throw new Error('sync boom'); });
    const res = await invoke(makeEvent());
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('sync boom');
  });

  it('is never reported as an authentication failure', async () => {
    health.mockRejectedValue(new Error('boom'));
    const res = await invoke(makeEvent());
    expect(res.statusCode).not.toBe(401);
    expect(res.body).not.toContain('Unauthorized');
  });

  it('records what failed, for the logs, without the token', async () => {
    health.mockRejectedValue(new Error('boom detail'));
    await invoke(makeEvent());
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('boom detail');
    expect(logged).toContain('GET /templated');
    expect(logged).not.toContain(TOKEN);
  });
});

describe('store start-up', () => {
  it('starts the store once for an authenticated request', async () => {
    await invoke(makeEvent());
    expect(mockInitStore).toHaveBeenCalledTimes(1);
  });

  it('answers 500 without leaking detail when the store cannot start, and reaches no handler', async () => {
    mockInitStore.mockRejectedValueOnce(new Error('DYNAMODB_TABLE is required when STORE=dynamodb'));
    const res = await invoke(makeEvent());
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'Internal server error' });
    expect(res.body).not.toContain('DYNAMODB_TABLE');
    expect(health).not.toHaveBeenCalled();
  });
});
