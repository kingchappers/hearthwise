import type { Router } from './router';
import { registerHouseholdRoutes } from './households';
import { registerItemRoutes } from './items';
import { registerPushRoutes } from './push';
import { registerCoreRoutes } from './routes';
import { registerTaskRoutes } from './tasks';

export function registerApiRoutes(router: Router): void {
  registerCoreRoutes(router);
  registerHouseholdRoutes(router);
  registerTaskRoutes(router);
  registerItemRoutes(router);
  registerPushRoutes(router);
}
