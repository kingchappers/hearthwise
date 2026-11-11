import { describe, expect, it } from 'vitest';
import { createRouter } from '../router';
import { registerCoreRoutes } from '../routes';

function event(method: string, path: string) {
  return { rawPath: path, headers: {}, requestContext: { http: { method } } } as never;
}

describe('registerCoreRoutes', () => {
  const router = createRouter();
  registerCoreRoutes(router);

  it('registers only GET /api/health', () => {
    expect(router.routes()).toEqual([{ method: 'GET', template: '/api/health' }]);
  });

  it('answers GET /api/health with 200 and an ok status', async () => {
    const response = await router.dispatch(event('GET', '/api/health'), 'user-1');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('answers 404 for an unknown route', async () => {
    const response = await router.dispatch(event('GET', '/api/nope'), 'user-1');
    expect(response.statusCode).toBe(404);
  });
});
