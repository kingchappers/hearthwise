import type { Router } from './router';
import { registerCalendarRoutes } from './calendar';
import { registerHouseholdRoutes } from './households';
import { registerItemRoutes } from './items';
import { registerMealRoutes } from './meals';
import { registerMoneyRoutes } from './money';
import { registerProjectRoutes } from './projects';
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
  registerCalendarRoutes(router);
  registerProjectRoutes(router);
  registerPushRoutes(router);
}
