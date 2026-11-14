// Whether this device can get push, and how to turn it on. Settings (hours, quiet hours) live on the server with the member, not here.
export interface Environment {
  ios: boolean;
  standalone: boolean;
}

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

type Request = (endpoint: string, options?: RequestInit) => Promise<unknown>;

export function currentEnvironment(): Environment {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  // An iPad asks for the desktop site and says it is a Mac, but it has a touch screen.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  const standalone = (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
    || (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return { ios, standalone };
}

export function pushSupport(): PushSupport {
  const capable = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof PushManager !== 'undefined' && typeof Notification !== 'undefined';
  if (capable) return 'supported';
  // An iPhone only gets push for an app added to its Home Screen.
  const { ios, standalone } = currentEnvironment();
  return ios && !standalone ? 'needs-install' : 'unsupported';
}

// A VAPID public key is base64url; the browser wants its bytes.
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

// Subscribes this device and tells the server. The server holds no settings for it: hours and quiet hours belong to the member.
export async function subscribeToPush(vapidPublicKey: string, request: Request): Promise<void> {
  const { pushManager } = await registration();
  const subscription = (await pushManager.getSubscription())
    ?? await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  const { endpoint, keys } = subscription.toJSON();
  await request('/api/push/subscriptions', { method: 'POST', body: JSON.stringify({ endpoint, keys: { p256dh: keys?.p256dh, auth: keys?.auth } }) });
}

export async function unsubscribeFromPush(request: Request): Promise<void> {
  const { pushManager } = await registration();
  const subscription = await pushManager.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription.toJSON();
  await subscription.unsubscribe();
  await request('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
}
