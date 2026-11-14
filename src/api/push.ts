import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { loadSubscriptions, MAX_DEVICES, removeSubscription, saveSubscription } from '../push/subscriptions';
import { parseSubscribeBody, parseUnsubscribeBody } from '../shared/pushValidation';
import { getStore } from '../store';
import { SECURITY_HEADERS } from './constants';
import { err, invalid, parseJsonObject } from './http';
import { created } from './respond';
import type { Router } from './router';
import type { ApiResponse } from './types';

// A person's own devices: the user id is the caller's, never the request's.
async function subscribe(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseSubscribeBody(body);
  if (!input.ok) return invalid(input.field);
  const existing = await loadSubscriptions(getStore(), userId);
  // A device already saved is saved again (its keys may have changed); only a new one counts against the limit.
  if (existing.length >= MAX_DEVICES && !existing.some(sub => sub.endpoint === input.value.endpoint)) return err(409, 'too_many_devices');
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
