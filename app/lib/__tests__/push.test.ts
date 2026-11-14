import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentEnvironment, pushSupport, subscribeToPush, unsubscribeFromPush, urlBase64ToUint8Array } from '../push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

function setEnvironment(opts: { ua: string; standalone?: boolean; serviceWorker?: boolean; pushManager?: boolean }) {
  vi.stubGlobal('navigator', { userAgent: opts.ua, maxTouchPoints: opts.ua === IPHONE ? 5 : 0, ...(opts.serviceWorker === false ? {} : { serviceWorker: {} }), standalone: opts.standalone });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: opts.standalone === true && query.includes('standalone') }));
  if (opts.pushManager === false) vi.stubGlobal('PushManager', undefined);
  else vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', class {});
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('urlBase64ToUint8Array', () => {
  it('turns a base64url key into its bytes', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });
});

describe('currentEnvironment', () => {
  it('knows an iPhone in the browser from the same iPhone with the app on its Home Screen', () => {
    setEnvironment({ ua: IPHONE, standalone: false });
    expect(currentEnvironment()).toEqual({ ios: true, standalone: false });
    setEnvironment({ ua: IPHONE, standalone: true });
    expect(currentEnvironment()).toEqual({ ios: true, standalone: true });
  });
});

describe('pushSupport', () => {
  it('is supported where there is a service worker and push', () => {
    setEnvironment({ ua: DESKTOP });
    expect(pushSupport()).toBe('supported');
  });

  it('asks an iPhone in the browser to install the app first', () => {
    setEnvironment({ ua: IPHONE, standalone: false, pushManager: false });
    expect(pushSupport()).toBe('needs-install');
  });

  it('is supported on an iPhone once the app is on the Home Screen', () => {
    setEnvironment({ ua: IPHONE, standalone: true });
    expect(pushSupport()).toBe('supported');
  });

  it('is unsupported where the browser has no push at all', () => {
    setEnvironment({ ua: DESKTOP, pushManager: false });
    expect(pushSupport()).toBe('unsupported');
  });
});

describe('subscribeToPush', () => {
  const request = vi.fn().mockResolvedValue({});
  function worker(existing: unknown = null) {
    const subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }), unsubscribe: vi.fn().mockResolvedValue(true) };
    const pushManager = { getSubscription: vi.fn().mockResolvedValue(existing), subscribe: vi.fn().mockResolvedValue(subscription) };
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager }) } });
    return { pushManager, subscription };
  }

  it('asks the browser to subscribe with the server key, then tells the server, with no settings', async () => {
    request.mockClear();
    const { pushManager } = worker();
    await subscribeToPush('AQID', request);
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/api/push/subscriptions');
    expect(JSON.parse(options.body)).toEqual({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } });
  });

  it('reuses a subscription the browser already has', async () => {
    request.mockClear();
    const { pushManager, subscription } = worker(undefined);
    pushManager.getSubscription.mockResolvedValue(subscription);
    await subscribeToPush('AQID', request);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the browser and the server', async () => {
    request.mockClear();
    const { pushManager, subscription } = worker();
    pushManager.getSubscription.mockResolvedValue(subscription);
    await unsubscribeFromPush(request);
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(request.mock.calls[0][1].method).toBe('DELETE');
  });
});
