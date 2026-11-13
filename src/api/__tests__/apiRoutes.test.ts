import { describe, it, expect } from 'vitest';
import { createRouter } from '../router';
import { registerApiRoutes } from '../apiRoutes';

describe('registerApiRoutes', () => {
  it('registers the health, household, invite and member routes', () => {
    const router = createRouter();
    registerApiRoutes(router);
    expect(router.routes()).toEqual([
      { method: 'GET', template: '/api/health' },
      { method: 'POST', template: '/api/households' },
      { method: 'GET', template: '/api/hh' },
      { method: 'PATCH', template: '/api/hh/members/me' },
      { method: 'DELETE', template: '/api/hh/members/{userId}' },
      { method: 'POST', template: '/api/hh/invites' },
      { method: 'GET', template: '/api/hh/invites' },
      { method: 'DELETE', template: '/api/hh/invites/{hash}' },
      { method: 'POST', template: '/api/invites/accept' },
    ]);
  });
});
