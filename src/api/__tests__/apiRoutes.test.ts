import { describe, it, expect } from 'vitest';
import { createRouter } from '../router';
import { registerApiRoutes } from '../apiRoutes';

describe('registerApiRoutes', () => {
  it('registers the health, household, invite, member, task, proposal, restore, item and push routes', () => {
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
      { method: 'GET', template: '/api/hh/tasks' },
      { method: 'POST', template: '/api/hh/tasks' },
      { method: 'PATCH', template: '/api/hh/tasks/{id}' },
      { method: 'DELETE', template: '/api/hh/tasks/{id}' },
      { method: 'POST', template: '/api/hh/tasks/{id}/complete' },
      { method: 'DELETE', template: '/api/hh/tasks/{id}/completions/{cycleSeq}' },
      { method: 'GET', template: '/api/hh/tasks/{id}/history' },
      { method: 'POST', template: '/api/hh/proposals' },
      { method: 'POST', template: '/api/hh/proposals/{id}/accept' },
      { method: 'POST', template: '/api/hh/proposals/{id}/decline' },
      { method: 'POST', template: '/api/hh/proposals/{id}/withdraw' },
      { method: 'POST', template: '/api/hh/restore' },
      { method: 'GET', template: '/api/hh/items' },
      { method: 'PUT', template: '/api/hh/items/{id}' },
      { method: 'DELETE', template: '/api/hh/items/{id}' },
      { method: 'POST', template: '/api/hh/items/batch' },
      { method: 'POST', template: '/api/push/subscriptions' },
      { method: 'DELETE', template: '/api/push/subscriptions' },
    ]);
  });
});
