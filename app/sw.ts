// The service worker. It precaches the built app so Hearthwise opens with no signal, answers page navigation from the cached shell,
// keeps /config.json fresh in the background, and shows push notifications. It never caches the API: the saved copy of the lists
// lives in the app's own cache, so there is one source of cached data. It never calls skipWaiting: a new version waits for the next
// launch, so an open page never loads files from a different build.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

// The parts of the worker's global scope this file uses (the app is compiled with the DOM library, which has no worker types).
interface WorkerEvent { waitUntil(promise: Promise<unknown>): void }
interface PushEvent extends WorkerEvent { data?: { json(): { title?: string; body?: string; tag?: string; url?: string } } }
interface NotificationClickEvent extends WorkerEvent { notification: { close(): void; data?: { url?: string } } }
interface WorkerWindow { focus(): Promise<unknown>; navigate?(url: string): Promise<unknown>; url: string }
declare const self: {
  __WB_MANIFEST: { url: string; revision: string | null }[];
  registration: { showNotification(title: string, options: object): Promise<void> };
  clients: { matchAll(options: object): Promise<WorkerWindow[]>; openWindow(url: string): Promise<unknown> };
  addEventListener(name: 'push', listener: (event: PushEvent) => void): void;
  addEventListener(name: 'notificationclick', listener: (event: NotificationClickEvent) => void): void;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Answers at once from the copy it has, and refreshes it in the background: a launch with no signal still starts.
registerRoute(({ url }) => url.pathname === '/config.json', new StaleWhileRevalidate({ cacheName: 'hearthwise-config' }));

self.addEventListener('push', event => {
  const payload = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(payload.title ?? 'Hearthwise', {
    body: payload.body,
    // A tag groups a phone's notifications without hiding any.
    tag: payload.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url ?? '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows[0];
    if (open) {
      await open.focus();
      await open.navigate?.(url);
      return;
    }
    await self.clients.openWindow(url);
  })());
});
