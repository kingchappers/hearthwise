import type { Router } from './router';
import { registerCoreRoutes } from './routes';

// Push subscription routes register here from step 6.
export function registerApiRoutes(router: Router): void {
  registerCoreRoutes(router);
}
