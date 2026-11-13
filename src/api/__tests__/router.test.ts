import { describe, it, expect } from 'vitest';
import { createRouter } from '../router';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeEvent(method: string, path: string, body?: string): APIGatewayProxyEventV2 {
  return {
    rawPath: path,
    requestContext: { http: { method } },
    body,
    headers: {},
    queryStringParameters: {},
    pathParameters: {},
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

describe('router', () => {
  it('dispatches to a matching GET route', async () => {
    const router = createRouter();
    router.get('/api/categories', async () => ({
      statusCode: 200, headers: {}, body: '{"ok":true}',
    }));
    const res = await router.dispatch(makeEvent('GET', '/api/categories'), 'user-1');
    expect(res.statusCode).toBe(200);
  });

  it('dispatches to a matching DELETE route with path param', async () => {
    const router = createRouter();
    router.delete('/api/categories/{categoryId}', async (_event, _userId, params) => ({
      statusCode: 204, headers: {}, body: '',
    }));
    const res = await router.dispatch(makeEvent('DELETE', '/api/categories/abc-123'), 'user-1');
    expect(res.statusCode).toBe(204);
  });

  it('extracts path parameters correctly', async () => {
    const router = createRouter();
    let captured: Record<string, string> = {};
    router.delete('/api/transactions/{yearMonth}/{transactionId}', async (_event, _userId, params) => {
      captured = params;
      return { statusCode: 204, headers: {}, body: '' };
    });
    await router.dispatch(makeEvent('DELETE', '/api/transactions/2025-01/txn-uuid'), 'user-1');
    expect(captured).toEqual({ yearMonth: '2025-01', transactionId: 'txn-uuid' });
  });

  it('returns 404 for unknown routes', async () => {
    const router = createRouter();
    const res = await router.dispatch(makeEvent('GET', '/api/unknown'), 'user-1');
    expect(res.statusCode).toBe(404);
  });

  it('does not match a GET route on a POST request', async () => {
    const router = createRouter();
    router.get('/api/categories', async () => ({ statusCode: 200, headers: {}, body: '' }));
    const res = await router.dispatch(makeEvent('POST', '/api/categories'), 'user-1');
    expect(res.statusCode).toBe(404);
  });

  it('answers HEAD on a GET route with the GET status and headers and an empty body, running the handler once', async () => {
    const router = createRouter();
    let calls = 0;
    router.get('/api/a/{id}', async (_event, _userId, params) => {
      calls += 1;
      return { statusCode: 200, headers: { 'X-Seen': params.id }, body: '{"ok":true}' };
    });
    const res = await router.dispatch(makeEvent('HEAD', '/api/a/42'), 'user-1');
    expect(res).toEqual({ statusCode: 200, headers: { 'X-Seen': '42' }, body: '' });
    expect(calls).toBe(1);
  });

  it('keeps the GET status for HEAD when the GET route answers an error', async () => {
    const router = createRouter();
    router.get('/api/a', async () => ({ statusCode: 404, headers: { 'X-H': '1' }, body: '{"error":"x"}' }));
    const res = await router.dispatch(makeEvent('HEAD', '/api/a'), 'user-1');
    expect(res).toEqual({ statusCode: 404, headers: { 'X-H': '1' }, body: '' });
  });

  it('answers HEAD 404 for a path with only write routes and for an unknown path', async () => {
    const router = createRouter();
    router.post('/api/a/{id}/reassign', async () => ({ statusCode: 200, headers: {}, body: '{}' }));
    const write = await router.dispatch(makeEvent('HEAD', '/api/a/1/reassign'), 'user-1');
    expect(write.statusCode).toBe(404);
    expect(write.body).toBe('{"error":"Endpoint not found"}');
    const unknown = await router.dispatch(makeEvent('HEAD', '/api/unknown'), 'user-1');
    expect(unknown.statusCode).toBe(404);
  });

  it('does not list HEAD among the registered routes', () => {
    const router = createRouter();
    router.get('/api/a', async () => ({ statusCode: 200, headers: {}, body: '' }));
    expect(router.routes()).toEqual([{ method: 'GET', template: '/api/a' }]);
  });

  it('leaves GET bodies intact', async () => {
    const router = createRouter();
    router.get('/api/a', async () => ({ statusCode: 200, headers: {}, body: 'x' }));
    expect((await router.dispatch(makeEvent('GET', '/api/a'), 'user-1')).body).toBe('x');
  });

  it('routes PUT /api/transactions/{yearMonth}/{transactionId} with both params', async () => {
    const router = createRouter();
    let captured: Record<string, string> | null = null;
    router.put('/api/transactions/{yearMonth}/{transactionId}', async (_e, _u, p) => {
      captured = p;
      return { statusCode: 200, headers: {}, body: '' };
    });
    await router.dispatch(makeEvent('PUT', '/api/transactions/2026-07/txn-1'), 'user-1');
    expect(captured).toEqual({ yearMonth: '2026-07', transactionId: 'txn-1' });
  });

  it('routes POST /api/categories/{categoryId}/reassign', async () => {
    const router = createRouter();
    let captured: Record<string, string> | null = null;
    router.post('/api/categories/{categoryId}/reassign', async (_e, _u, p) => {
      captured = p;
      return { statusCode: 200, headers: {}, body: '' };
    });
    await router.dispatch(makeEvent('POST', '/api/categories/cat-custom/reassign'), 'user-1');
    expect(captured).toEqual({ categoryId: 'cat-custom' });
  });

  it('lists registered routes in registration order', () => {
    const router = createRouter();
    const handler = async () => ({ statusCode: 200, headers: {}, body: '' });
    router.get('/api/a/{id}', handler);
    router.post('/api/a', handler);
    expect(router.routes()).toEqual([
      { method: 'GET', template: '/api/a/{id}' },
      { method: 'POST', template: '/api/a' },
    ]);
  });

  it('dispatches a PATCH route and lists it', async () => {
    const router = createRouter();
    router.patch('/api/hh/members/me', async () => ({ statusCode: 200, headers: {}, body: '{"patched":true}' }));
    const res = await router.dispatch(makeEvent('PATCH', '/api/hh/members/me'), 'user-1');
    expect(res.statusCode).toBe(200);
    expect(router.routes()).toContainEqual({ method: 'PATCH', template: '/api/hh/members/me' });
  });

  it('does not match a PATCH route on a PUT request', async () => {
    const router = createRouter();
    router.patch('/api/x', async () => ({ statusCode: 200, headers: {}, body: '' }));
    expect((await router.dispatch(makeEvent('PUT', '/api/x'), 'u')).statusCode).toBe(404);
  });

  describe('path parameters', () => {
    function captureUserId() {
      const router = createRouter();
      const seen: string[] = [];
      router.delete('/api/hh/members/{userId}', async (_event, _userId, params) => {
        seen.push(params.userId);
        return { statusCode: 204, headers: {}, body: '' };
      });
      return { router, seen };
    }

    it('decodes an encoded pipe, so an Auth0 user id reaches the handler as it is', async () => {
      const { router, seen } = captureUserId();
      await router.dispatch(makeEvent('DELETE', '/api/hh/members/auth0%7Cabc123'), 'u');
      expect(seen).toEqual(['auth0|abc123']);
    });

    it('leaves a plain id as it is', async () => {
      const { router, seen } = captureUserId();
      await router.dispatch(makeEvent('DELETE', '/api/hh/members/local%7C0190-abc'), 'u');
      await router.dispatch(makeEvent('DELETE', '/api/hh/members/plain-id'), 'u');
      expect(seen).toEqual(['local|0190-abc', 'plain-id']);
    });

    it('answers 400 for a malformed escape without calling the handler', async () => {
      const { router, seen } = captureUserId();
      const res = await router.dispatch(makeEvent('DELETE', '/api/hh/members/%E0%A4%A'), 'u');
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'invalid', field: 'path' });
      expect(seen).toEqual([]);
    });

    it('keeps an encoded slash inside one parameter instead of adding a path segment', async () => {
      const { router, seen } = captureUserId();
      const res = await router.dispatch(makeEvent('DELETE', '/api/hh/members/a%2Fb'), 'u');
      expect(res.statusCode).toBe(204);
      expect(seen).toEqual(['a/b']);
    });

    it('does not let an encoded slash reach another route', async () => {
      const router = createRouter();
      router.delete('/api/hh/invites/{hash}', async () => ({ statusCode: 204, headers: {}, body: '' }));
      expect((await router.dispatch(makeEvent('DELETE', '/api/hh/invites/a%2Fmembers/x'), 'u')).statusCode).toBe(404);
    });
  });
});

