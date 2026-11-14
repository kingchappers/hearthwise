import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { removeSubscription, saveSubscription } from '../push/subscriptions';
import { parseSubscribeBody, parseUnsubscribeBody } from '../shared/pushValidation';
import { getStore } from '../store';
import { SECURITY_HEADERS } from './constants';
import { invalid, parseJsonObject } from './http';
import { created } from './respond';
import type { Router } from './router';
import type { ApiResponse } from './types';

// A person's own devices: the user id is the caller's, never the request's.
async function subscribe(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseSubscribeBody(body);
  if (!input.ok) return invalid(input.field);
  await saveSubscription(getStore(), userId, { ...input.value, createdAt: Date.now() });
  return created({});
}

async function unsubscribe(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseUnsubscribeBody(body);
  if (!input.ok) return invalid(input.field);
  await removeSubscription(getStore(), userId, input.value.endpoint);
  return { statusCode: 204, headers: SECURITY_HEADERS, body: '' };
}

export function registerPushRoutes(router: Router): void {
  router.post('/api/push/subscriptions', subscribe);
  router.delete('/api/push/subscriptions', unsubscribe);
}
