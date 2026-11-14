// The server calls a subscription's address, so it must be a real push service and nothing a caller can aim at the server's own
// network: https only, the default port, no credentials, and a host that is (or is under) a known push service. A host that is an
// IP literal never matches. Checked when a device subscribes and again each time the server is about to call it.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

const isPushHost = (hostname: string): boolean => PUSH_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));

export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.port === '' && url.username === '' && url.password === '' && isPushHost(url.hostname);
  } catch {
    return false;
  }
}
