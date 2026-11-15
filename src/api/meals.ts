import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { listPlan, setPlanDay } from '../meals/plan';
import { deleteRecipe, listRecipes, putRecipe } from '../meals/recipes';
import * as events from '../push/events';
import { parseItemDeleteBody } from '../shared/itemValidation';
import { parsePlanPut, parseRecipePut } from '../shared/mealValidation';
import { addDays, dayInZone, isRealDate } from '../shared/schedule';
import { getStore } from '../store';
import { err, invalid, noStore, ok, parseJsonObject } from './http';
import { notifyAfter } from './notify';
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

const DAYS_BACK = 14;

async function getPlan(event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  const asked = event.queryStringParameters?.from;
  if (asked !== undefined && !isRealDate(asked)) return invalid('from');
  const from = asked ?? addDays(dayInZone(Date.now(), ctx.household.timezone), -DAYS_BACK);
  return noStore(ok(await listPlan(getStore(), ctx, from)));
}

// "Friday 20": the weekday and the day of the month of a calendar date, which is the same in every zone.
const dayLabel = (day: string): string => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

// A day is not a UUID, so it is checked here: one that is not a real date can only be a day that does not exist.
const putPlanRoute: TaskHandler = async (event, ctx, params) => {
  if (!isRealDate(params.day)) return err(404, 'not_found');
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parsePlanPut(body);
  if (!input.ok) return invalid(input.field);
  const { meal, at, mutationId, clientAt } = input.value;
  const outcome = await setPlanDay(getStore(), ctx, params.day, { meal, mealAt: at, mutationId, ...(clientAt === undefined ? {} : { clientAt }) });
  await notifyAfter(ctx, body, outcome.fresh, events.planChanged(ctx.member.displayName, dayLabel(params.day), meal?.title, mutationId));
  return written(outcome, 200);
};

export function registerMealRoutes(router: Router): void {
  router.get('/api/hh/recipes', withHousehold(getRecipes));
  router.put('/api/hh/recipes/{id}', withHousehold(guarded(['id'], putRoute)));
  router.delete('/api/hh/recipes/{id}', withHousehold(guarded(['id'], deleteRoute)));
  router.get('/api/hh/plan', withHousehold(guarded([], async (event, ctx) => getPlan(event, ctx))));
  router.put('/api/hh/plan/{day}', withHousehold(guarded([], putPlanRoute)));
}
