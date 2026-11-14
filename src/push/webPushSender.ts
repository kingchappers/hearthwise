import type { PushPayload, PushSender } from './sender';
import type { Vapid } from './vapid';

const TTL_SECONDS = 60 * 60;

// The production sender. The web-push package is loaded on first use, so a server with no keys never loads it.
export function createWebPushSender(vapid: Vapid): PushSender {
  return {
    async send(subscription, payload: PushPayload) {
      const webpush = (await import('web-push')).default;
      try {
        const response = await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(payload),
          { TTL: TTL_SECONDS, vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey } },
        );
        return { status: response.statusCode };
      } catch (error) {
        // The push service answered with a refusal: its status says whether the subscription is gone. Anything else did not reach it.
        const status = (error as { statusCode?: unknown }).statusCode;
        if (typeof status === 'number') return { status };
        throw error;
      }
    },
  };
}
