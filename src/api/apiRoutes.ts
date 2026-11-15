import type { Router } from './router';
import { registerHouseholdRoutes } from './households';
import { registerItemRoutes } from './items';
import { registerMealRoutes } from './meals';
import { registerMoneyRoutes } from './money';
import { registerPushRoutes } from './push';
import { registerCoreRoutes } from './routes';
import { registerTaskRoutes } from './tasks';

export function registerApiRoutes(router: Router): void {
  registerCoreRoutes(router);
  registerHouseholdRoutes(router);
  registerTaskRoutes(router);
  registerItemRoutes(router);
  registerMealRoutes(router);
  registerMoneyRoutes(router);
  registerPushRoutes(router);
}
