import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { parseItemBatch, parseItemDeleteBody, parseItemPut } from '../shared/itemValidation';
import { batchItems, deleteItem, listItems, putItem } from '../shopping/items';
import { getStore } from '../store';
import { invalid, noStore, ok, parseJsonObject } from './http';
import { guarded, written } from './respond';
import type { TaskHandler } from './respond';
import type { Router } from './router';
import type { ApiResponse } from './types';

async function getItems(_event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  return noStore(ok(await listItems(getStore(), ctx)));
}

const putRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseItemPut(body);
  if (!input.ok) return invalid(input.field);
  return written(await putItem(getStore(), ctx, params.id, input.value), 200);
};

const deleteRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseItemDeleteBody(body);
  if (!input.ok) return invalid(input.field);
  return written(await deleteItem(getStore(), ctx, params.id, input.value), 200);
};

const batchRoute: TaskHandler = async (event, ctx) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseItemBatch(body);
  if (!input.ok) return invalid(input.field);
  return written(await batchItems(getStore(), ctx, input.value), 200);
};

export function registerItemRoutes(router: Router): void {
  router.get('/api/hh/items', withHousehold(getItems));
  router.put('/api/hh/items/{id}', withHousehold(guarded(['id'], putRoute)));
  router.delete('/api/hh/items/{id}', withHousehold(guarded(['id'], deleteRoute)));
  router.post('/api/hh/items/batch', withHousehold(guarded([], batchRoute)));
}
