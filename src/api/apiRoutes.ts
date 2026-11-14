import type { Router } from './router';
import { registerHouseholdRoutes } from './households';
import { registerItemRoutes } from './items';
import { registerCoreRoutes } from './routes';
import { registerTaskRoutes } from './tasks';

// Push subscription routes register here from step 6.
export function registerApiRoutes(router: Router): void {
  registerCoreRoutes(router);
  registerHouseholdRoutes(router);
  registerTaskRoutes(router);
  registerItemRoutes(router);
}
