import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { deleteRecipe, listRecipes, putRecipe } from '../meals/recipes';
import { parseItemDeleteBody } from '../shared/itemValidation';
import { parseRecipePut } from '../shared/mealValidation';
import { getStore } from '../store';
import { invalid, noStore, ok, parseJsonObject } from './http';
import { guarded, written } from './respond';
import type { TaskHandler } from './respond';
import type { Router } from './router';
import type { ApiResponse } from './types';

async function getRecipes(_event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  return noStore(ok(await listRecipes(getStore(), ctx)));
}

// A recipe write ignores `notify`: recipes are not something to tell the other person about.
const putRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseRecipePut(body);
  if (!input.ok) return invalid(input.field);
  return written(await putRecipe(getStore(), ctx, params.id, input.value), 200);
};

const deleteRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseItemDeleteBody(body);
  if (!input.ok) return invalid(input.field);
  return written(await deleteRecipe(getStore(), ctx, params.id, input.value), 200);
};

export function registerMealRoutes(router: Router): void {
  router.get('/api/hh/recipes', withHousehold(getRecipes));
  router.put('/api/hh/recipes/{id}', withHousehold(guarded(['id'], putRoute)));
  router.delete('/api/hh/recipes/{id}', withHousehold(guarded(['id'], deleteRoute)));
}
