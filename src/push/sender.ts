import { isPushEndpoint } from '../shared/pushEndpoint';
import type { Store } from '../store';
import { MAX_DEVICES } from './subscriptions';
import { loadSubscriptions, removeSubscription, type PushSubscriptionRecord } from './subscriptions';

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url?: string;
}

export interface PushSender {
  // The push service's HTTP status. A thrown error is a failure to reach it at all.
  send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<{ status: number }>;
}

const GONE = new Set([404, 410]);

// Sends to each device a person has subscribed. A device the push service says is gone is removed. Every device is tried
// even if one fails; the first failure is thrown afterwards. Returns how many were accepted.
export async function deliver(store: Store, sender: PushSender, userId: string, payload: PushPayload): Promise<number> {
  let sent = 0;
  let failure: unknown;
  // The newest devices only: a person never has more than the limit, however a record came to be stored.
  const stored = (await loadSubscriptions(store, userId)).sort((a, b) => b.createdAt - a.createdAt);
  for (const surplus of stored.slice(MAX_DEVICES)) await removeSubscription(store, userId, surplus.endpoint);
  for (const subscription of stored.slice(0, MAX_DEVICES)) {
    // The address is checked again here, so nothing already stored can make the server call somewhere it should not.
    if (!isPushEndpoint(subscription.endpoint)) {
      await removeSubscription(store, userId, subscription.endpoint);
      continue;
    }
    try {
      const { status } = await sender.send(subscription, payload);
      if (GONE.has(status)) await removeSubscription(store, userId, subscription.endpoint);
      else if (status >= 200 && status < 300) sent += 1;
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) throw failure;
  return sent;
}
