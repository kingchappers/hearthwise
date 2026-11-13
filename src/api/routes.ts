import type { Router } from './router';
import { ok } from './http';

// Everything the API serves except push subscriptions, which need Node's crypto and so stay with the Lambda entry point.
export function registerCoreRoutes(router: Router): void {
  router.get('/api/health', async () => ok({ status: 'ok' }));
}
