import { describe, it, expect } from 'vitest';
import { createRouter } from '../router';
import { registerApiRoutes } from '../apiRoutes';

describe('registerApiRoutes', () => {
  it('registers the core routes and nothing else until later steps add theirs', () => {
    const router = createRouter();
    registerApiRoutes(router);
    expect(router.routes()).toEqual([{ method: 'GET', template: '/api/health' }]);
  });
});
