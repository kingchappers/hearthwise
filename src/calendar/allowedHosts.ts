import { isHostLiteral } from './addressRules';

// The only places a calendar link may point: each provider's published-calendar address. A whole domain such as google.com is never
// allowed, because anyone can host a page there. The first request must also start with the provider's path prefix; a redirect only
// has to land on a listed host. A link from anywhere else is refused with `not_supported`.

export type LinkCode = 'not_https' | 'bad_link' | 'not_supported';

export type LinkCheck = { ok: true; host: string; href: string } | { ok: false; internal: 'blocked_host'; code: LinkCode };

interface Provider {
  host: string | RegExp;
  pathPrefix: string;
}

export const PROVIDERS: readonly Provider[] = [
  { host: 'calendar.google.com', pathPrefix: '/calendar/ical/' },
  { host: 'outlook.office365.com', pathPrefix: '/owa/calendar/' },
  { host: 'outlook.office.com', pathPrefix: '/owa/calendar/' },
  { host: 'outlook.live.com', pathPrefix: '/owa/calendar/' },
  { host: /^p\d+-caldav\.icloud\.com$/, pathPrefix: '/published/' },
  { host: 'calendar.proton.me', pathPrefix: '/api/calendar/v1/url/' },
];

export const MAX_LINK_LENGTH = 2000;

const refuse = (code: LinkCode): LinkCheck => ({ ok: false, internal: 'blocked_host', code });
const matches = (provider: Provider, host: string): boolean => (typeof provider.host === 'string' ? provider.host === host : provider.host.test(host));

const CONTROL_OR_SPACE = /[\u0000- \u007f-\u009f]/;
// The text between the scheme and the first path, query or fragment character (the parser also treats a backslash as a slash).
const AUTHORITY = /^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#\\]*)/i;

// Container only: exact host names added with CALENDAR_EXTRA_HOSTS. The Lambdas ignore the variable. An entry that is not a plain
// lower-case ASCII name (a wildcard, an address, a port, a path, a name with no dot) is dropped.
export function extraHostsFrom(env: NodeJS.ProcessEnv): string[] {
  if (env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_EXECUTION_ENV) return [];
  const hosts = new Set<string>();
  for (const raw of (env.CALENDAR_EXTRA_HOSTS ?? '').split(',')) {
    const host = raw.trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) continue;
    if (isHostLiteral(host)) continue;
    hosts.add(host);
  }
  return [...hosts];
}

function vet(url: URL, text: string, extraHosts: readonly string[], firstRequest: boolean): LinkCheck {
  if (url.protocol !== 'https:') return refuse('not_https');
  const authority = AUTHORITY.exec(text)?.[1];
  if (url.username || url.password || authority?.includes('@')) return refuse('not_supported');
  if (url.port !== '') return refuse('not_supported');
  const host = url.hostname;
  if (isHostLiteral(host)) return refuse('not_supported');
  const provider = PROVIDERS.find(candidate => matches(candidate, host));
  const extra = extraHosts.includes(host);
  if (!provider && !extra) return refuse('not_supported');
  if (firstRequest && !extra && provider && !url.pathname.startsWith(provider.pathPrefix)) return refuse('not_supported');
  // Only the parser's own serialised form is ever requested: no port, no user name, no fragment.
  return { ok: true, host, href: `https://${host}${url.pathname}${url.search}` };
}

// Steps 1 to 3 of the fetcher for the link a person pasted. Nothing of the text is put in the result.
export function parseFeedLink(text: string, extraHosts: readonly string[]): LinkCheck {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '' || trimmed.length > MAX_LINK_LENGTH || CONTROL_OR_SPACE.test(trimmed)) return refuse('bad_link');
  // webcal: is not a "special" scheme, so the parser would not lower-case or normalise its host: swap it first.
  const rewritten = trimmed.replace(/^webcal:\/\//i, 'https://');
  let url: URL;
  try {
    url = new URL(rewritten);
  } catch {
    return refuse('bad_link');
  }
  return vet(url, rewritten, extraHosts, true);
}

// A redirect hop goes through the same checks from the start, except the path prefix, which is checked on the first request only.
export function checkRedirectTarget(location: string, from: URL, extraHosts: readonly string[]): LinkCheck {
  const trimmed = typeof location === 'string' ? location.trim() : '';
  if (trimmed === '' || trimmed.length > MAX_LINK_LENGTH || CONTROL_OR_SPACE.test(trimmed)) return refuse('bad_link');
  let url: URL;
  try {
    url = new URL(trimmed, from);
  } catch {
    return refuse('bad_link');
  }
  return vet(url, trimmed, extraHosts, false);
}
