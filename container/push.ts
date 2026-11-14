import { createWebPushSender } from '../src/push/webPushSender';
import type { PushSender } from '../src/push/sender';
import type { Vapid } from '../src/push/vapid';

// The container's sender is the same web-push one the Lambdas use.
export function createContainerSender(vapid: Vapid): PushSender {
  return createWebPushSender(vapid);
}
