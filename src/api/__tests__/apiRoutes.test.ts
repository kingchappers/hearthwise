import { describe, it, expect } from 'vitest';
import { createRouter } from '../router';
import { registerApiRoutes } from '../apiRoutes';

describe('registerApiRoutes', () => {
  it('registers the health route and the household routes', () => {
    const router = createRouter();
    registerApiRoutes(router);
    expect(router.routes()).toEqual([
      { method: 'GET', template: '/api/health' },
      { method: 'POST', template: '/api/households' },
      { method: 'GET', template: '/api/hh' },
      { method: 'PATCH', template: '/api/hh/members/me' },
    ]);
  });
});
