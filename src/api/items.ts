import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { parseItemBatch, parseItemDeleteBody, parseItemPut } from '../shared/itemValidation';
import { batchItems, deleteItem, listItems, putItem } from '../shopping/items';
import { getStore } from '../store';
import * as events from '../push/events';
import { invalid, noStore, ok, parseJsonObject } from './http';
import { notifyAfter } from './notify';
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
  const outcome = await putItem(getStore(), ctx, params.id, input.value);
  const { write, mutationId } = input.value;
  const who = ctx.member.displayName;
  const text = outcome.result.item.text;
  const message = write.ticked !== undefined && write.text === undefined && write.quantity === undefined
    ? events.itemTicked(who, write.ticked.value, text, mutationId)
    : events.itemUpdated(who, text, mutationId);
  await notifyAfter(ctx, body, outcome.fresh, message);
  return written(outcome, 200);
};

const deleteRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseItemDeleteBody(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await deleteItem(getStore(), ctx, params.id, input.value);
  await notifyAfter(ctx, body, outcome.fresh, events.itemRemoved(ctx.member.displayName, outcome.result.item.text, input.value.mutationId));
  return written(outcome, 200);
};

const batchRoute: TaskHandler = async (event, ctx) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseItemBatch(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await batchItems(getStore(), ctx, input.value);
  const applied = outcome.result.results.filter(entry => entry.status === 'created' || entry.status === 'applied');
  const added = applied.filter(entry => entry.status === 'created').length;
  // A batch that changed nothing says nothing.
  const message = applied.length === 0 ? undefined : events.itemsBatch(ctx.member.displayName, added, applied.length - added, input.value.mutationId);
  await notifyAfter(ctx, body, outcome.fresh, message);
  return written(outcome, 200);
};

export function registerItemRoutes(router: Router): void {
  router.get('/api/hh/items', withHousehold(getItems));
  router.put('/api/hh/items/{id}', withHousehold(guarded(['id'], putRoute)));
  router.delete('/api/hh/items/{id}', withHousehold(guarded(['id'], deleteRoute)));
  router.post('/api/hh/items/batch', withHousehold(guarded([], batchRoute)));
}
