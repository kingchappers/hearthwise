export interface PushPayload {
  title: string;
  body?: string;
  tag?: string;
  // A path in this app. Anything else becomes the home page.
  url: string;
}

interface PushData {
  json(): unknown;
  text(): string;
}

const asString = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

// A path that starts with a single slash stays inside the app; an address, a protocol-relative one or a script never does.
const appPath = (value: unknown): string => (typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : '/');

// What a push shows. A body that is not JSON is shown as text rather than losing the notification, and nothing from a payload is
// trusted beyond being text: the address it opens is always a path in this app.
export function parsePushPayload(data: PushData | undefined): PushPayload {
  if (!data) return { title: 'Hearthwise', url: '/' };
  let parsed: unknown;
  try {
    parsed = data.json();
  } catch {
    const text = asString(data.text());
    return { title: 'Hearthwise', ...(text === undefined ? {} : { body: text }), url: '/' };
  }
  const record = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  const body = asString(record.body);
  const tag = asString(record.tag);
  return { title: asString(record.title) ?? 'Hearthwise', ...(body === undefined ? {} : { body }), ...(tag === undefined ? {} : { tag }), url: appPath(record.url) };
}
