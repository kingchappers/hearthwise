import { describe, expect, it } from 'vitest';
import { checkRedirectTarget, extraHostsFrom, parseFeedLink } from '../allowedHosts';

const GOOGLE = 'https://calendar.google.com/calendar/ical/someone%40gmail.com/private-0123456789abcdef/basic.ics';
const OUTLOOK = 'https://outlook.office365.com/owa/calendar/0123456789abcdef@example.com/abcdef0123456789/calendar.ics';
const OUTLOOK_LIVE = 'https://outlook.live.com/owa/calendar/0123456789abcdef/abcdef0123456789/reachcalendar.ics';
const OUTLOOK_OFFICE = 'https://outlook.office.com/owa/calendar/0123456789abcdef@example.com/abcdef/calendar.ics';
const ICLOUD = 'https://p12-caldav.icloud.com/published/2/MTIzNDU2Nzg5MA';
const PROTON = 'https://calendar.proton.me/api/calendar/v1/url/abcdef/calendar.ics?CacheKey=abc&PassphraseKey=def';

const ok = (text: string, extra: readonly string[] = []): { host: string; href: string } => {
  const result = parseFeedLink(text, extra);
  if (!result.ok) throw new Error(`expected ${text} to be accepted, got ${result.internal}/${result.code}`);
  return result;
};

const refused = (text: string, extra: readonly string[] = []): string => {
  const result = parseFeedLink(text, extra);
  if (result.ok) throw new Error(`expected ${text} to be refused`);
  return `${result.internal}/${result.code}`;
};

describe('parseFeedLink: the four providers', () => {
  it.each([
    ['Google', GOOGLE, 'calendar.google.com'],
    ['Outlook (Office 365)', OUTLOOK, 'outlook.office365.com'],
    ['Outlook (live)', OUTLOOK_LIVE, 'outlook.live.com'],
    ['Outlook (office.com)', OUTLOOK_OFFICE, 'outlook.office.com'],
    ['Apple', ICLOUD, 'p12-caldav.icloud.com'],
    ['Apple, three digits', 'https://p103-caldav.icloud.com/published/2/abc', 'p103-caldav.icloud.com'],
    ['Proton', PROTON, 'calendar.proton.me'],
  ])('accepts a %s link', (_name, link, host) => {
    const result = ok(link);
    expect(result.host).toBe(host);
    expect(result.href.startsWith(`https://${host}/`)).toBe(true);
  });

  it('rewrites webcal:// to https:// before the URL is read, whatever its case', () => {
    expect(ok(ICLOUD.replace('https://', 'webcal://')).href).toBe(ICLOUD);
    expect(ok(GOOGLE.replace('https://', 'WEBCAL://')).host).toBe('calendar.google.com');
    expect(ok(GOOGLE.replace('https://', 'WebCal://')).host).toBe('calendar.google.com');
  });

  it('lower-cases the host and keeps the path as it was', () => {
    const result = ok('https://CALENDAR.Google.COM/calendar/ical/Someone/Private-AbC/basic.ics');
    expect(result.host).toBe('calendar.google.com');
    expect(result.href).toBe('https://calendar.google.com/calendar/ical/Someone/Private-AbC/basic.ics');
  });

  it('requests the serialised form, in which the parser has turned backslashes into slashes', () => {
    expect(ok('https://calendar.google.com\\calendar\\ical\\a').href).toBe('https://calendar.google.com/calendar/ical/a');
  });

  it('says bad_link for a zoned IPv6 host, which the parser cannot read', () => {
    expect(refused('https://[fe80::1%25eth0]/calendar/ical/a')).toBe('blocked_host/bad_link');
  });

  it('trims the spaces a paste brings, and drops the fragment', () => {
    expect(ok(`  ${GOOGLE}#top \n`).href).toBe(GOOGLE);
  });

  it('accepts an explicit 443 and sends the serialised form without it', () => {
    expect(ok(GOOGLE.replace('.com/', '.com:443/')).href).toBe(GOOGLE);
  });

  it('keeps the query string', () => {
    expect(ok(PROTON).href).toBe(PROTON);
  });
});

describe('parseFeedLink: the wrong scheme and the wrong shape', () => {
  it.each(['http://calendar.google.com/calendar/ical/a/b/basic.ics', 'ftp://calendar.google.com/calendar/ical/a', 'file:///etc/passwd', 'data:text/calendar,BEGIN:VCALENDAR', 'javascript:alert(1)', 'webcals://calendar.google.com/calendar/ical/a', 'gopher://calendar.google.com/'])('says not_https for %s', link => {
    expect(refused(link)).toBe('blocked_host/not_https');
  });

  it.each(['', '   ', 'calendar.google.com/calendar/ical/a', '//calendar.google.com/calendar/ical/a', 'https://', 'not a link', `${GOOGLE}\n.evil.example`, `https://calendar.google.com/calendar/ical/a\tb`, `https://calendar.google.com/calendar/ical/\u0000`, `${GOOGLE}${'a'.repeat(2000)}`, 'https://calendar.google.com:abc/calendar/ical/a', 'https://[::1/'])('says bad_link for %j', link => {
    expect(refused(link)).toMatch(/^blocked_host\/bad_link$/);
  });

  it('accepts a link of exactly 2,000 characters and refuses one of 2,001', () => {
    const base = 'https://calendar.google.com/calendar/ical/';
    expect(parseFeedLink(base + 'a'.repeat(2000 - base.length), []).ok).toBe(true);
    expect(refused(base + 'a'.repeat(2001 - base.length))).toBe('blocked_host/bad_link');
  });
});

describe('parseFeedLink: hosts and paths that are not allowed', () => {
  it.each([
    ['look-alike suffix', 'https://calendar.google.com.evil.example/calendar/ical/a'],
    ['look-alike prefix', 'https://evilcalendar.google.com/calendar/ical/a'],
    ['look-alike with a dash', 'https://calendar-google.com/calendar/ical/a'],
    ['subdomain of an allowed host', 'https://x.calendar.google.com/calendar/ical/a'],
    ['the parent domain', 'https://google.com/calendar/ical/a'],
    ['www.google.com', 'https://www.google.com/calendar/ical/a'],
    ['Apps Script', 'https://script.google.com/macros/s/abc/exec'],
    ['microsoft.com', 'https://outlook.microsoft.com/owa/calendar/a'],
    ['sharepoint', 'https://contoso.sharepoint.com/owa/calendar/a'],
    ['icloud without a p number', 'https://caldav.icloud.com/published/2/a'],
    ['icloud with letters in the number', 'https://p1x-caldav.icloud.com/published/2/a'],
    ['icloud with no digits', 'https://p-caldav.icloud.com/published/2/a'],
    ['icloud look-alike', 'https://p12-caldav.icloud.com.evil.example/published/2/a'],
    ['icloud sub-subdomain', 'https://x.p12-caldav.icloud.com/published/2/a'],
    ['icloud.com itself', 'https://icloud.com/published/2/a'],
    ['proton.me itself', 'https://proton.me/api/calendar/v1/url/a'],
    ['a made-up host', 'https://example.com/calendar.ics'],
    ['userinfo that hides the real host', 'https://calendar.google.com@evil.example/calendar/ical/a'],
    ['userinfo on an allowed host', 'https://user:password@calendar.google.com/calendar/ical/a'],
    ['a user name alone', 'https://user@calendar.google.com/calendar/ical/a'],
    ['an empty user name and password', 'https://:@calendar.google.com/calendar/ical/a'],
    ['an @ after a percent-encoded slash', 'https://calendar.google.com%2f@evil.example/calendar/ical/a'],
    ['a fragment that hides the real host', 'https://evil.example#@calendar.google.com/calendar/ical/a'],
    ['a query that hides the real host', 'https://evil.example?@calendar.google.com/calendar/ical/a'],
    ['a port as the user name', 'https://calendar.google.com:443@evil.example/calendar/ical/a'],
    ['a backslash host trick', 'https://evil.example\\@calendar.google.com/calendar/ical/a'],
    ['a tab inside the host', 'https://calendar.google\t.com/calendar/ical/a'],
    ['a port',  'https://calendar.google.com:8443/calendar/ical/a'],
    ['port 80', 'https://calendar.google.com:80/calendar/ical/a'],
    ['port 444', 'https://calendar.google.com:444/calendar/ical/a'],
    ['a trailing dot', 'https://calendar.google.com./calendar/ical/a'],
    ['the wrong path on a right host', 'https://calendar.google.com/calendar/u/0/r'],
    ['the root of a right host', 'https://calendar.google.com/'],
    ['a path that only looks like the prefix', 'https://calendar.google.com/calendar/icalx/a'],
    ['an upper-case path prefix', 'https://calendar.google.com/CALENDAR/ICAL/a'],
    ['dot segments that climb out of the prefix', 'https://calendar.google.com/calendar/ical/../../../x'],
    ['encoded dot segments that climb out of the prefix', 'https://calendar.google.com/calendar/ical/%2e%2e/%2e%2e/x'],
    ['mixed encoded dot segments', 'https://calendar.google.com/calendar/ical/.%2E/.%2e/x'],
    ['no host, so the parser reads the first path word as one', 'https:///calendar/ical/a'],
    ['a backslash before an @ that the parser turns into a slash', 'https://calendar.google.com\\@evil.example/'],
    ['the wrong provider path on the host', 'https://outlook.office365.com/calendar/ical/a'],
    ['the Google path on an Outlook host', 'https://outlook.live.com/calendar/ical/a'],
    ['an owa path with no trailing slash', 'https://outlook.live.com/owa/calendar'],
    ['the iCloud path on Google', 'https://calendar.google.com/published/2/a'],
    ['the Proton path with the wrong version', 'https://calendar.proton.me/api/calendar/v2/url/a'],
  ])('refuses %s', (_name, link) => {
    expect(refused(link)).toMatch(/^blocked_host\/(not_supported|bad_link)$/);
  });

  it.each([
    'https://127.0.0.1/calendar/ical/a',
    'https://2130706433/calendar/ical/a',
    'https://0x7f000001/calendar/ical/a',
    'https://0177.0.0.1/calendar/ical/a',
    'https://127.1/calendar/ical/a',
    'https://[::1]/calendar/ical/a',
    'https://[::ffff:127.0.0.1]/calendar/ical/a',
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost/calendar/ical/a',
    'https://LOCALHOST/calendar/ical/a',
    'https://intranet/calendar/ical/a',
    'https://nas.local/calendar/ical/a',
  ])('says not_supported for the internal address %s', link => {
    expect(refused(link)).toBe('blocked_host/not_supported');
  });

  it('refuses an internationalised look-alike, which becomes punycode and matches nothing', () => {
    expect(refused('https://calendar.googlе.com/calendar/ical/a')).toMatch(/^blocked_host\//);
    expect(refused('https://xn--calendar-google-7jc.com/calendar/ical/a')).toMatch(/^blocked_host\//);
    expect(refused('https://calendar.google.com。evil.example/calendar/ical/a')).toMatch(/^blocked_host\//);
    expect(refused('https://calendar．google．com.evil.example/calendar/ical/a')).toMatch(/^blocked_host\//);
  });

  it('never puts the rejected link into the result', () => {
    const secret = 'SENTINEL-LINK-SECRET';
    const result = parseFeedLink(`https://evil.example/${secret}`, []);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain('evil.example');
  });
});

describe('extra hosts (the container only)', () => {
  it('lets a listed exact host through with any path', () => {
    expect(ok('https://cloud.example.org/remote.php/dav/public-calendars/abc?export', ['cloud.example.org']).host).toBe('cloud.example.org');
  });

  it('does not let a subdomain or a look-alike through', () => {
    expect(refused('https://x.cloud.example.org/a', ['cloud.example.org'])).toBe('blocked_host/not_supported');
    expect(refused('https://cloud.example.org.evil.example/a', ['cloud.example.org'])).toBe('blocked_host/not_supported');
  });

  it('still refuses an address and the wrong scheme', () => {
    expect(refused('https://127.0.0.1/a', ['127.0.0.1'])).toBe('blocked_host/not_supported');
    expect(refused('http://cloud.example.org/a', ['cloud.example.org'])).toBe('blocked_host/not_https');
  });

  it('reads CALENDAR_EXTRA_HOSTS from a comma list in the container', () => {
    expect(extraHostsFrom({ CALENDAR_EXTRA_HOSTS: ' Cloud.Example.org , nas.example.net ' })).toEqual(['cloud.example.org', 'nas.example.net']);
  });

  it('ignores it on Lambda', () => {
    expect(extraHostsFrom({ CALENDAR_EXTRA_HOSTS: 'cloud.example.org', AWS_LAMBDA_FUNCTION_NAME: 'hearthwise-api' })).toEqual([]);
    expect(extraHostsFrom({ CALENDAR_EXTRA_HOSTS: 'cloud.example.org', AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs24.x' })).toEqual([]);
  });

  it.each(['*.example.org', '.example.org', 'example.org.', '127.0.0.1', '[::1]', 'localhost', 'intranet', 'a b.example.org', 'https://example.org', 'example.org/path', 'user@example.org', 'example.org:8443', '0x7f.1', 'exämple.org', 'google.com\u0000.evil'])('drops the unusable entry %j', entry => {
    expect(extraHostsFrom({ CALENDAR_EXTRA_HOSTS: `${entry},good.example.org` })).toEqual(['good.example.org']);
  });

  it('gives nothing when it is not set', () => {
    expect(extraHostsFrom({})).toEqual([]);
    expect(extraHostsFrom({ CALENDAR_EXTRA_HOSTS: '' })).toEqual([]);
  });
});

describe('checkRedirectTarget', () => {
  const from = new URL(GOOGLE);

  it('follows a redirect to an allowed host, with any path', () => {
    const result = checkRedirectTarget('https://calendar.google.com/somewhere/else', from, []);
    expect(result.ok).toBe(true);
    const other = checkRedirectTarget('https://outlook.office365.com/anything', from, []);
    expect(other.ok).toBe(true);
  });

  it('resolves a relative location against the current address', () => {
    const result = checkRedirectTarget('/other/path?x=1', from, []);
    expect(result.ok && result.href).toBe('https://calendar.google.com/other/path?x=1');
  });

  it('resolves a protocol-relative location and then checks it', () => {
    expect(checkRedirectTarget('//evil.example/a', from, []).ok).toBe(false);
    expect(checkRedirectTarget('//calendar.google.com/a', from, []).ok).toBe(true);
  });

  it.each([
    ['an unlisted host', 'https://evil.example/a', 'blocked_host/not_supported'],
    ['a look-alike host', 'https://calendar.google.com.evil.example/a', 'blocked_host/not_supported'],
    ['http', 'http://calendar.google.com/a', 'blocked_host/not_https'],
    ['another scheme', 'ftp://calendar.google.com/a', 'blocked_host/not_https'],
    ['file', 'file:///etc/passwd', 'blocked_host/not_https'],
    ['an address', 'https://169.254.169.254/latest/meta-data/', 'blocked_host/not_supported'],
    ['an address in hex', 'https://0xa9fea9fe/', 'blocked_host/not_supported'],
    ['an IPv6 address', 'https://[::1]/', 'blocked_host/not_supported'],
    ['a port', 'https://calendar.google.com:8443/a', 'blocked_host/not_supported'],
    ['userinfo', 'https://user:pw@calendar.google.com/a', 'blocked_host/not_supported'],
    ['a trailing dot', 'https://calendar.google.com./a', 'blocked_host/not_supported'],
    ['localhost', 'https://localhost/a', 'blocked_host/not_supported'],
  ])('refuses a redirect to %s', (_name, location, expected) => {
    const result = checkRedirectTarget(location, from, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(`${result.internal}/${result.code}`).toBe(expected);
  });

  it('refuses a location that is not a link at all, or is huge', () => {
    expect(checkRedirectTarget('https://[::1', from, []).ok).toBe(false);
    expect(checkRedirectTarget(`/${'a'.repeat(3000)}`, from, []).ok).toBe(false);
  });

  it('lets a redirect land on an extra host', () => {
    expect(checkRedirectTarget('https://cloud.example.org/x', from, ['cloud.example.org']).ok).toBe(true);
  });
});
