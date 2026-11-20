import { connect as netConnect, createServer as createNetServer, type Server as NetServer } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFetcher, fetchFeed, pinnedLookup, userCodeFor, type FetcherDeps, type RequestFn } from '../fetcher';
import { createTestPki, type TestPki } from './testPki';

const gunzips = vi.hoisted(() => [] as Array<{ destroyed: boolean }>);
vi.mock('node:zlib', async importOriginal => {
  const original = await importOriginal<typeof import('node:zlib')>();
  return { ...original, createGunzip: (...args: Parameters<typeof original.createGunzip>) => {
    const stream = original.createGunzip(...args);
    gunzips.push(stream);
    return stream;
  } };
});

const LINK = 'https://calendar.google.com/calendar/ical/a/b/basic.ics';
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const PUBLIC = '93.184.216.34';
const MB = 1024 * 1024;
const NAMES = ['calendar.google.com', 'outlook.office365.com', 'p12-caldav.icloud.com', 'calendar.proton.me'];

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let pki: TestPki;
let server: https.Server;
let port: number;
let wrongNameServer: https.Server;
let wrongNamePort: number;
let handler: Handler;
let seen: Array<{ host: string | undefined; url: string | undefined; headers: IncomingMessage['headers'] }>;
const sockets = new Set<import('node:net').Socket>();

const listen = (s: https.Server | NetServer): Promise<number> => new Promise(resolve => s.listen(0, '127.0.0.1', () => resolve((s.address() as AddressInfo).port)));

beforeAll(async () => {
  pki = createTestPki();
  const leaf = pki.leaf(NAMES);
  server = https.createServer({ cert: leaf.cert, key: leaf.key }, (req, res) => {
    seen.push({ host: req.headers.host, url: req.url, headers: req.headers });
    handler(req, res);
  });
  server.on('connection', (socket: import('node:net').Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  port = await listen(server);
  const other = pki.leaf(['other.example']);
  wrongNameServer = https.createServer({ cert: other.cert, key: other.key }, (_req, res) => res.end(ICS));
  wrongNamePort = await listen(wrongNameServer);
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => wrongNameServer.close(resolve));
  pki.dispose();
});

beforeEach(() => {
  seen = [];
  handler = (_req, res) => res.end(ICS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

type LookupCallback = (error: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void;
const loopback = (_host: string, options: unknown, callback?: LookupCallback): void => {
  const cb = (typeof options === 'function' ? options : callback) as LookupCallback;
  const all = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true;
  if (all) cb(null, [{ address: '127.0.0.1', family: 4 }]);
  else cb(null, '127.0.0.1', 4);
};

interface Harness {
  fetcher: ReturnType<typeof createFetcher>;
  options: https.RequestOptions[];
  resolved: string[];
}

function make(overrides: Partial<FetcherDeps> = {}, targetPort?: () => number): Harness {
  const options: https.RequestOptions[] = [];
  const resolved: string[] = [];
  const request: RequestFn = (opts, callback) => {
    options.push(opts);
    return https.request({ ...opts, port: targetPort ? targetPort() : port, lookup: loopback as https.RequestOptions['lookup'] }, callback);
  };
  const deps: FetcherDeps = {
    resolve4: async host => {
      resolved.push(host);
      return [PUBLIC];
    },
    resolve6: async () => [],
    request,
    ca: pki.ca,
    extraHosts: [],
    limits: { connectMs: 400, idleMs: 400, totalMs: 3000, dnsMs: 300 },
    ...overrides,
  };
  return { fetcher: createFetcher(deps), options, resolved };
}

const redirectTo = (location: string, status = 302): Handler => (_req, res) => {
  res.writeHead(status, { Location: location });
  res.end();
};

async function expectRefusal(promise: Promise<unknown>, internal: string, code: string): Promise<void> {
  const result = (await promise) as { ok: boolean; internal?: string; code?: string };
  expect({ ok: result.ok, internal: result.internal, code: result.code }).toEqual({ ok: false, internal, code });
}

describe('a good fetch', () => {
  it('returns the text and the byte count', async () => {
    const { fetcher } = make();
    const result = await fetcher(LINK);
    expect(result).toEqual({ ok: true, text: ICS, bytes: ICS.length });
  });

  it('sends a plain GET with only the fixed headers, to port 443, for the original name', async () => {
    const { fetcher, options } = make();
    await fetcher(LINK + '?x=1');
    const o = options[0];
    expect(o.method).toBe('GET');
    expect(o.protocol).toBe('https:');
    expect(o.hostname).toBe('calendar.google.com');
    expect(o.port).toBe(443);
    expect(o.path).toBe('/calendar/ical/a/b/basic.ics?x=1');
    expect(o.servername).toBe('calendar.google.com');
    expect(o.agent).toBe(false);
    expect(o.rejectUnauthorized).not.toBe(false);
    expect(o.minVersion).toBe('TLSv1.2');
    expect(o.headers).toEqual({ Host: 'calendar.google.com', 'Accept-Encoding': 'gzip', 'User-Agent': 'Hearthwise-calendar/1', Connection: 'close' });
  });

  it('shows the server the right Host, no cookie, no authorisation and no referrer', async () => {
    const { fetcher } = make();
    await fetcher(LINK);
    expect(seen[0].host).toBe('calendar.google.com');
    expect(seen[0].headers.cookie).toBeUndefined();
    expect(seen[0].headers.authorization).toBeUndefined();
    expect(seen[0].headers.referer).toBeUndefined();
    expect(seen[0].headers['user-agent']).toBe('Hearthwise-calendar/1');
    expect(seen[0].headers['accept-encoding']).toBe('gzip');
  });

  it('accepts a byte-order mark and leading spaces before BEGIN:VCALENDAR, and ignores the content type', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end('﻿ \r\n' + ICS);
    };
    const result = await make().fetcher(LINK);
    expect(result.ok).toBe(true);
  });

  it('rewrites webcal:// and reads the same address', async () => {
    const { fetcher, options } = make();
    expect((await fetcher(LINK.replace('https://', 'webcal://'))).ok).toBe(true);
    expect(options[0].hostname).toBe('calendar.google.com');
  });

  it('exports a real fetchFeed built from the real dependencies', () => {
    expect(typeof fetchFeed).toBe('function');
  });
});

describe('links that never reach the network', () => {
  it.each([
    ['http://calendar.google.com/calendar/ical/a', 'blocked_host', 'not_https'],
    ['https://evil.example/calendar.ics', 'blocked_host', 'not_supported'],
    ['https://calendar.google.com.evil.example/calendar/ical/a', 'blocked_host', 'not_supported'],
    ['https://127.0.0.1/calendar/ical/a', 'blocked_host', 'not_supported'],
    ['https://169.254.169.254/latest/meta-data/', 'blocked_host', 'not_supported'],
    ['https://calendar.google.com:8443/calendar/ical/a', 'blocked_host', 'not_supported'],
    ['https://user:pw@calendar.google.com/calendar/ical/a', 'blocked_host', 'not_supported'],
    ['https://calendar.google.com/other', 'blocked_host', 'not_supported'],
    ['not a link', 'blocked_host', 'bad_link'],
  ])('refuses %s without resolving or connecting', async (link, internal, code) => {
    const { fetcher, options, resolved } = make();
    await expectRefusal(fetcher(link), internal, code);
    expect(resolved).toEqual([]);
    expect(options).toEqual([]);
  });
});

describe('resolving the name in our own code', () => {
  it('resolves once for each family and connects to the vetted address through a lookup that cannot say anything else', async () => {
    const { fetcher, options, resolved } = make({ resolve6: async () => ['2607:f8b0:4004:c1b::65'] });
    await fetcher(LINK);
    expect(resolved).toEqual(['calendar.google.com']);
    const lookup = options[0].lookup as (host: string, options: unknown, cb: LookupCallback) => void;
    const answers: unknown[] = [];
    lookup('calendar.google.com', { all: true }, (_e, a) => answers.push(a));
    lookup('calendar.google.com', {}, (_e, a, f) => answers.push([a, f]));
    lookup('calendar.google.com', { all: true, family: 4 }, (_e, a) => answers.push(a));
    expect(answers).toEqual([[{ address: PUBLIC, family: 4 }], [PUBLIC, 4], [{ address: PUBLIC, family: 4 }]]);
  });

  it('prefers an IPv4 address and falls back to IPv6', async () => {
    const six = make({ resolve4: async () => [], resolve6: async () => ['2607:f8b0:4004:c1b::65'] });
    await six.fetcher(LINK);
    const lookup = six.options[0].lookup as (host: string, options: unknown, cb: LookupCallback) => void;
    let answer: unknown;
    lookup('calendar.google.com', { all: true }, (_e, a) => (answer = a));
    expect(answer).toEqual([{ address: '2607:f8b0:4004:c1b::65', family: 6 }]);
  });

  it('is not moved by DNS rebinding: a second answer is never asked for or used', async () => {
    const answers = [[PUBLIC], ['169.254.169.254'], ['127.0.0.1']];
    let asked = 0;
    const { fetcher, options } = make({ resolve4: async () => answers[Math.min(asked++, 2)] });
    const result = await fetcher(LINK);
    expect(result.ok).toBe(true);
    expect(asked).toBe(1);
    const lookup = options[0].lookup as (host: string, options: unknown, cb: LookupCallback) => void;
    for (let i = 0; i < 5; i++) {
      let got: unknown;
      lookup('calendar.google.com', { all: true }, (_e, a) => (got = a));
      expect(got).toEqual([{ address: PUBLIC, family: 4 }]);
    }
  });

  it('answers a lookup for any other name with an error', async () => {
    const { fetcher, options } = make();
    await fetcher(LINK);
    const lookup = options[0].lookup as (host: string, options: unknown, cb: LookupCallback) => void;
    let error: Error | null = null;
    lookup('evil.example', { all: true }, e => (error = e));
    expect(error).not.toBeNull();
  });

  it.each([
    ['a private address', ['10.0.0.5']],
    ['the metadata address', ['169.254.169.254']],
    ['loopback', ['127.0.0.1']],
    ['one bad address among good ones', [PUBLIC, '192.168.1.1']],
    ['one bad address first', ['10.0.0.1', PUBLIC]],
    ['an IPv4-mapped IPv6 address', ['::ffff:127.0.0.1']],
    ['an IPv4-mapped address in hex', ['::ffff:a9fe:a9fe']],
    ['a NAT64 address', ['64:ff9b::a9fe:a9fe']],
    ['a unique local address', ['fd00:ec2::254']],
    ['a link-local address with a zone', ['fe80::1%eth0']],
    ['a decimal address', ['2130706433']],
    ['an octal address', ['0177.0.0.1']],
    ['an empty string', ['']],
  ])('refuses the whole request for %s', async (_name, addresses) => {
    const { fetcher, options } = make({ resolve4: async () => addresses });
    await expectRefusal(fetcher(LINK), 'blocked_address', 'unreachable');
    expect(options).toEqual([]);
  });

  it('refuses a blocked IPv6 answer even when the IPv4 answer is fine', async () => {
    const { fetcher, options } = make({ resolve6: async () => ['::1'] });
    await expectRefusal(fetcher(LINK), 'blocked_address', 'unreachable');
    expect(options).toEqual([]);
  });

  it('fails with dns when nothing resolves, or the resolver throws, or answers with junk', async () => {
    await expectRefusal(make({ resolve4: async () => [], resolve6: async () => [] }).fetcher(LINK), 'dns', 'unreachable');
    await expectRefusal(
      make({
        resolve4: async () => {
          throw new Error('ENOTFOUND calendar.google.com SENTINEL');
        },
        resolve6: async () => {
          throw new Error('ENOTFOUND');
        },
      }).fetcher(LINK),
      'dns',
      'unreachable',
    );
    await expectRefusal(make({ resolve4: (() => { throw new Error('sync'); }) as never }).fetcher(LINK), 'dns', 'unreachable');
    await expectRefusal(make({ resolve4: (async () => 'not an array') as never }).fetcher(LINK), 'dns', 'unreachable');
  });

  it('goes on with one family when the other fails', async () => {
    const { fetcher } = make({
      resolve6: async () => {
        throw new Error('SERVFAIL');
      },
    });
    expect((await fetcher(LINK)).ok).toBe(true);
  });

  it('gives up on a resolver that never answers, after its own short limit', async () => {
    const hang = (): Promise<string[]> => new Promise(() => undefined);
    const started = Date.now();
    await expectRefusal(make({ resolve4: hang, resolve6: hang }).fetcher(LINK), 'dns', 'unreachable');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('redirects', () => {
  it('follows a redirect to another allowed host and checks it from the start', async () => {
    handler = (req, res) => (req.headers.host === 'calendar.google.com' ? redirectTo('https://outlook.office365.com/anything')(req, res) : res.end(ICS));
    const { fetcher, resolved } = make();
    expect((await fetcher(LINK)).ok).toBe(true);
    expect(resolved).toEqual(['calendar.google.com', 'outlook.office365.com']);
    expect(seen.map(s => s.host)).toEqual(['calendar.google.com', 'outlook.office365.com']);
  });

  it.each([301, 302, 303, 307, 308])('follows a %i', async status => {
    let first = true;
    handler = (req, res) => {
      if (first) {
        first = false;
        redirectTo('/next', status)(req, res);
        return;
      }
      res.end(ICS);
    };
    expect((await make().fetcher(LINK)).ok).toBe(true);
    expect(seen[1].url).toBe('/next');
  });

  it('follows a relative location against the current address', async () => {
    let first = true;
    handler = (req, res) => {
      if (first) {
        first = false;
        redirectTo('other?x=1')(req, res);
        return;
      }
      res.end(ICS);
    };
    await make().fetcher(LINK);
    expect(seen[1].url).toBe('/calendar/ical/a/b/other?x=1');
  });

  it.each([
    ['an unlisted host', 'https://evil.example/a', 'blocked_host', 'not_supported'],
    ['a look-alike host', 'https://calendar.google.com.evil.example/a', 'blocked_host', 'not_supported'],
    ['http', 'http://calendar.google.com/a', 'blocked_host', 'not_https'],
    ['another scheme', 'ftp://calendar.google.com/a', 'blocked_host', 'not_https'],
    ['the metadata address', 'https://169.254.169.254/latest/meta-data/', 'blocked_host', 'not_supported'],
    ['an address in decimal', 'https://2852039166/', 'blocked_host', 'not_supported'],
    ['loopback in IPv6', 'https://[::1]/', 'blocked_host', 'not_supported'],
    ['another port', 'https://calendar.google.com:8443/a', 'blocked_host', 'not_supported'],
    ['a host with a user name', 'https://user@calendar.google.com/a', 'blocked_host', 'not_supported'],
    ['a trailing-dot host', 'https://calendar.google.com./a', 'blocked_host', 'not_supported'],
  ])('refuses a redirect to %s, and makes no second request', async (_name, location, internal, code) => {
    handler = redirectTo(location);
    const { fetcher, options } = make();
    await expectRefusal(fetcher(LINK), internal, code);
    expect(options).toHaveLength(1);
  });

  it('refuses a redirect to an allowed name that now resolves to an internal address', async () => {
    handler = redirectTo('https://outlook.office365.com/a');
    const { fetcher, options } = make({ resolve4: async host => (host === 'outlook.office365.com' ? ['169.254.169.254'] : [PUBLIC]) });
    await expectRefusal(fetcher(LINK), 'blocked_address', 'unreachable');
    expect(options).toHaveLength(1);
  });

  it('follows three redirects and refuses the fourth', async () => {
    let count = 0;
    handler = (req, res) => {
      count++;
      if (count <= 3) redirectTo(`/hop${count}`)(req, res);
      else res.end(ICS);
    };
    expect((await make().fetcher(LINK)).ok).toBe(true);

    count = 0;
    handler = (req, res) => {
      count++;
      if (count <= 4) redirectTo(`/hop${count}`)(req, res);
      else res.end(ICS);
    };
    await expectRefusal(make().fetcher(LINK), 'redirect', 'unreachable');
    expect(count).toBe(4);
  });

  it('refuses a redirect loop', async () => {
    handler = redirectTo('/again');
    await expectRefusal(make().fetcher(LINK), 'redirect', 'unreachable');
  });

  it('refuses a redirect with no location, or an empty one', async () => {
    handler = (_req, res) => {
      res.writeHead(302);
      res.end();
    };
    await expectRefusal(make().fetcher(LINK), 'redirect', 'unreachable');
    handler = (_req, res) => {
      res.writeHead(302, { Location: '' });
      res.end();
    };
    await expectRefusal(make().fetcher(LINK), 'redirect', 'unreachable');
  });

  it('does not follow a 304 or a 300 as a redirect', async () => {
    handler = (_req, res) => {
      res.writeHead(304, { Location: 'https://outlook.office365.com/a' });
      res.end();
    };
    const { fetcher, options } = make();
    await expectRefusal(fetcher(LINK), 'status', 'unreachable');
    expect(options).toHaveLength(1);
  });

  it('closes the connection of a redirect before it goes on', async () => {
    let first: import('node:net').Socket | undefined;
    let closed = false;
    handler = (req, res) => {
      if (!first) {
        first = req.socket;
        req.socket.on('close', () => (closed = true));
        res.writeHead(302, { Location: '/next' });
        res.write('x'.repeat(1000));
        return;
      }
      res.end(ICS);
    };
    expect((await make().fetcher(LINK)).ok).toBe(true);
    await vi.waitFor(() => expect(closed).toBe(true));
  });
});

describe('the codes table', () => {
  it.each([
    [401, 'status', 'link_stopped'],
    [403, 'status', 'link_stopped'],
    [404, 'status', 'link_stopped'],
    [410, 'status', 'link_stopped'],
    [429, 'status', 'provider_busy'],
    [500, 'status', 'provider_busy'],
    [502, 'status', 'provider_busy'],
    [503, 'status', 'provider_busy'],
    [504, 'status', 'provider_busy'],
    [400, 'status', 'unreachable'],
    [204, 'status', 'unreachable'],
    [206, 'status', 'unreachable'],
    [304, 'status', 'unreachable'],
  ])('maps status %i', async (status, internal, code) => {
    handler = (_req, res) => {
      res.writeHead(status);
      res.end(ICS);
    };
    await expectRefusal(make().fetcher(LINK), internal, code);
  });

  it('reads only a 200', async () => {
    handler = (_req, res) => {
      res.writeHead(203);
      res.end(ICS);
    };
    expect((await make().fetcher(LINK)).ok).toBe(false);
  });

  it('maps a body that is not a calendar', async () => {
    handler = (_req, res) => res.end('<html><body>Sign in</body></html>');
    await expectRefusal(make().fetcher(LINK), 'not_calendar', 'not_calendar');
    handler = (_req, res) => res.end('');
    await expectRefusal(make().fetcher(LINK), 'not_calendar', 'not_calendar');
    handler = (_req, res) => res.end('  BEGIN:VCALENDAR'.toLowerCase());
    await expectRefusal(make().fetcher(LINK), 'not_calendar', 'not_calendar');
  });

  it('maps every internal value to a user code', () => {
    expect(userCodeFor('blocked_address')).toBe('unreachable');
    expect(userCodeFor('dns')).toBe('unreachable');
    expect(userCodeFor('connect')).toBe('unreachable');
    expect(userCodeFor('timeout')).toBe('unreachable');
    expect(userCodeFor('tls')).toBe('unreachable');
    expect(userCodeFor('redirect')).toBe('unreachable');
    expect(userCodeFor('not_calendar')).toBe('not_calendar');
    expect(userCodeFor('parse')).toBe('not_calendar');
    expect(userCodeFor('too_big')).toBe('too_big');
    expect(userCodeFor('status', 404)).toBe('link_stopped');
    expect(userCodeFor('status', 429)).toBe('provider_busy');
    expect(userCodeFor('status', 418)).toBe('unreachable');
  });
});

describe('size limits', () => {
  it('accepts a body of exactly 2 MB and refuses one byte more', async () => {
    const body = (n: number): Buffer => Buffer.concat([Buffer.from(ICS), Buffer.alloc(n - ICS.length, 'a')]);
    handler = (_req, res) => res.end(body(2 * MB));
    const exact = await make().fetcher(LINK);
    expect(exact.ok && exact.bytes).toBe(2 * MB);
    handler = (_req, res) => res.end(body(2 * MB + 1));
    await expectRefusal(make().fetcher(LINK), 'too_big', 'too_big');
  });

  it('refuses at once when Content-Length says it is too big', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Length': String(5 * MB) });
      res.write(ICS);
    };
    await expectRefusal(make().fetcher(LINK), 'too_big', 'too_big');
  });

  it('stops a chunked body with no length at 2 MB and drops the connection', async () => {
    let closed = false;
    handler = (req, res) => {
      req.socket.on('close', () => (closed = true));
      res.write(ICS);
      const chunk = Buffer.alloc(64 * 1024, 'a');
      const timer = setInterval(() => {
        if (res.destroyed) clearInterval(timer);
        else res.write(chunk);
      }, 1);
    };
    await expectRefusal(make().fetcher(LINK), 'too_big', 'too_big');
    await vi.waitFor(() => expect(closed).toBe(true));
  });

  it('decodes a gzip body', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Encoding': 'gzip' });
      res.end(gzipSync(Buffer.from(ICS)));
    };
    const result = await make().fetcher(LINK);
    expect(result).toEqual({ ok: true, text: ICS, bytes: ICS.length });
  });

  it('reads the encoding name in any case, and x-gzip and identity', async () => {
    for (const [name, body] of [['GZIP', gzipSync(Buffer.from(ICS))], ['x-gzip', gzipSync(Buffer.from(ICS))], ['identity', Buffer.from(ICS)]] as const) {
      handler = (_req, res) => {
        res.writeHead(200, { 'Content-Encoding': name });
        res.end(body);
      };
      expect((await make().fetcher(LINK)).ok, name).toBe(true);
    }
  });

  it('stops a compressed bomb at 2 MB of output, quickly, and drops the connection', async () => {
    const bomb = gzipSync(Buffer.alloc(300 * MB, 'a'), { level: 9 });
    expect(bomb.length).toBeLessThan(2 * MB);
    let closed = false;
    handler = (req, res) => {
      req.socket.on('close', () => (closed = true));
      res.writeHead(200, { 'Content-Encoding': 'gzip' });
      res.end(bomb);
    };
    const started = Date.now();
    await expectRefusal(make().fetcher(LINK), 'too_big', 'too_big');
    expect(Date.now() - started).toBeLessThan(2500);
    await vi.waitFor(() => expect(closed).toBe(true));
  });

  it('destroys the decompressor when the output limit trips, so it does no more work', async () => {
    gunzips.length = 0;
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Encoding': 'gzip' });
      res.end(gzipSync(Buffer.alloc(50 * MB, 'a'), { level: 9 }));
    };
    await expectRefusal(make().fetcher(LINK), 'too_big', 'too_big');
    expect(gunzips).toHaveLength(1);
    expect(gunzips[0].destroyed).toBe(true);
  });

  it('refuses a compressed body of more than 2 MB before it is decoded, with no length given', async () => {
    const big = gzipSync(randomBytes(3 * MB));
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Encoding': 'gzip' });
      for (let i = 0; i < big.length; i += 64 * 1024) res.write(big.subarray(i, i + 64 * 1024));
      res.end();
    };
    await expectRefusal(make().fetcher(LINK), 'too_big', 'too_big');
  });

  it.each(['br', 'deflate', 'compress', 'zstd', 'gzip, br', 'gzip, gzip', 'br, gzip', 'unknown'])('refuses Content-Encoding %s', async encoding => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Encoding': encoding });
      res.end(gzipSync(Buffer.from(ICS)));
    };
    await expectRefusal(make().fetcher(LINK), 'not_calendar', 'not_calendar');
  });

  it('refuses a gzip body that is cut short or is not gzip', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Encoding': 'gzip' });
      res.end(gzipSync(Buffer.from(ICS)).subarray(0, 12));
    };
    await expectRefusal(make().fetcher(LINK), 'not_calendar', 'not_calendar');
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Encoding': 'gzip' });
      res.end(ICS);
    };
    await expectRefusal(make().fetcher(LINK), 'not_calendar', 'not_calendar');
  });
});

describe('time limits', () => {
  it('gives up on a server that never answers, at the idle limit', async () => {
    handler = () => undefined;
    const started = Date.now();
    await expectRefusal(make().fetcher(LINK), 'timeout', 'unreachable');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('gives up on a server that stops part-way through the body', async () => {
    handler = (_req, res) => {
      res.writeHead(200);
      res.write(ICS);
    };
    await expectRefusal(make().fetcher(LINK), 'timeout', 'unreachable');
  });

  it('gives up on a connection that never finishes the handshake, at the connect limit', async () => {
    const held: import('node:net').Socket[] = [];
    const silent = createNetServer(socket => held.push(socket));
    const silentPort = await listen(silent as unknown as https.Server);
    try {
      const started = Date.now();
      const { fetcher } = make({ limits: { connectMs: 200, idleMs: 10_000, totalMs: 10_000, dnsMs: 300 } }, () => silentPort);
      await expectRefusal(fetcher(LINK), 'timeout', 'unreachable');
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      for (const socket of held) socket.destroy();
      await new Promise(resolve => silent.close(resolve));
    }
  });

  it('is not held by a slow trickle that keeps the idle timer alive: the total limit ends it', async () => {
    handler = (_req, res) => {
      res.writeHead(200);
      res.write(ICS);
      const timer = setInterval(() => {
        if (res.destroyed) clearInterval(timer);
        else res.write('X');
      }, 100);
    };
    const started = Date.now();
    await expectRefusal(make({ limits: { connectMs: 400, idleMs: 400, totalMs: 900, dnsMs: 300 } }).fetcher(LINK), 'timeout', 'unreachable');
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('shares one total across every hop', async () => {
    handler = (req, res) => {
      setTimeout(() => redirectTo('/again')(req, res), 350);
    };
    const started = Date.now();
    await expectRefusal(make({ limits: { connectMs: 400, idleMs: 400, totalMs: 800, dnsMs: 300 } }).fetcher(LINK), 'timeout', 'unreachable');
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('counts the time spent resolving against the total', async () => {
    const slow = (): Promise<string[]> => new Promise(resolve => setTimeout(() => resolve([PUBLIC]), 600));
    const started = Date.now();
    await expectRefusal(make({ resolve4: slow, limits: { connectMs: 400, idleMs: 400, totalMs: 300, dnsMs: 2000 } }).fetcher(LINK), 'timeout', 'unreachable');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('certificates', () => {
  it('refuses a certificate for another name', async () => {
    await expectRefusal(make({}, () => wrongNamePort).fetcher(LINK), 'tls', 'unreachable');
  });

  it('refuses a certificate from an authority it does not trust', async () => {
    await expectRefusal(make({ ca: pki.otherCa }).fetcher(LINK), 'tls', 'unreachable');
  });

  it('never turns certificate checking off', async () => {
    const { fetcher, options } = make();
    await fetcher(LINK);
    expect(options[0].rejectUnauthorized).toBeUndefined();
    expect(options[0].checkServerIdentity).toBeUndefined();
  });
});

describe('connection failures', () => {
  it('maps a refused connection to connect', async () => {
    const closed = createNetServer();
    const closedPort = await listen(closed as unknown as https.Server);
    await new Promise(resolve => closed.close(resolve));
    await expectRefusal(make({}, () => closedPort).fetcher(LINK), 'connect', 'unreachable');
  });

  it('maps a connection reset mid-body to connect', async () => {
    handler = (req, res) => {
      res.writeHead(200);
      res.write(ICS);
      setTimeout(() => req.socket.destroy(), 20);
    };
    await expectRefusal(make().fetcher(LINK), 'connect', 'unreachable');
  });

  it('maps a request function that throws to connect', async () => {
    const { fetcher } = make({
      request: () => {
        throw new Error('boom calendar.google.com SENTINEL');
      },
    });
    await expectRefusal(fetcher(LINK), 'connect', 'unreachable');
  });
});

describe('at most two fetches at once', () => {
  it('lets a third wait until one has finished, and frees the slot after a failure', async () => {
    let inFlight = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    handler = (_req, res) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      releases.push(() => {
        inFlight--;
        res.end(ICS);
      });
    };
    const { fetcher } = make({ limits: { connectMs: 2000, idleMs: 5000, totalMs: 10_000, dnsMs: 300 } });
    const all = [fetcher(LINK), fetcher(LINK), fetcher(LINK), fetcher(LINK)];
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(releases).toHaveLength(2);
    releases[0]();
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases[1]();
    await vi.waitFor(() => expect(releases).toHaveLength(4));
    releases[2]();
    releases[3]();
    const results = await Promise.all(all);
    expect(results.every(r => r.ok)).toBe(true);
    expect(peak).toBe(2);
  });

  it('frees the slot when a fetch fails, so later fetches still run', async () => {
    const { fetcher } = make({ resolve4: async () => ['10.0.0.1'] });
    for (let i = 0; i < 6; i++) await expectRefusal(fetcher(LINK), 'blocked_address', 'unreachable');
    const good = make();
    expect((await good.fetcher(LINK)).ok).toBe(true);
  });

  it('frees the slot when the resolver hangs and the total runs out', async () => {
    const hang = (): Promise<string[]> => new Promise(() => undefined);
    const { fetcher } = make({ resolve4: hang, resolve6: hang });
    await Promise.all([fetcher(LINK), fetcher(LINK), fetcher(LINK)].map(p => expectRefusal(p, 'dns', 'unreachable')));
  });
});

describe('no secret in a result, a log or an error', () => {
  const SENTINEL = 'SENTINEL-FEED-SECRET-9f3a';

  it('keeps the link, the host and the library error text out of every outcome', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined));
    const link = `${LINK}?key=${SENTINEL}`;
    const outcomes: unknown[] = [];

    outcomes.push(await make().fetcher(link));
    outcomes.push(await make().fetcher(`https://evil.example/${SENTINEL}`));
    outcomes.push(await make().fetcher(`http://calendar.google.com/${SENTINEL}`));
    outcomes.push(await make({ resolve4: async () => ['10.1.2.3'] }).fetcher(link));
    outcomes.push(await make({ resolve4: async () => { throw new Error(`ENOTFOUND calendar.google.com ${SENTINEL} 10.1.2.3`); } }).fetcher(link));
    outcomes.push(await make({ request: () => { throw new Error(`connect ECONNREFUSED 10.1.2.3:443 ${SENTINEL}`); } }).fetcher(link));
    outcomes.push(await make({ ca: pki.otherCa }).fetcher(link));
    handler = redirectTo(`https://evil.example/${SENTINEL}`);
    outcomes.push(await make().fetcher(link));
    handler = (_req, res) => {
      res.writeHead(404);
      res.end(SENTINEL);
    };
    outcomes.push(await make().fetcher(link));
    handler = (_req, res) => res.end(`<html>${SENTINEL}</html>`);
    outcomes.push(await make().fetcher(link));

    const text = JSON.stringify(outcomes);
    for (const forbidden of [SENTINEL, 'calendar.google.com', 'evil.example', '10.1.2.3', '127.0.0.1', 'ECONN', 'ENOTFOUND']) expect(text).not.toContain(forbidden);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(SENTINEL);
    expect(outcomes.filter(o => (o as { ok: boolean }).ok)).toHaveLength(1);
    // The one success carries the file, which is the caller's to handle; every refusal is only two enums.
    for (const o of outcomes.filter(o => !(o as { ok: boolean }).ok)) expect(Object.keys(o as object).sort()).toEqual(['code', 'internal', 'ok']);
  });
});

describe('pinnedLookup under Node 24', () => {
  let tcp: NetServer;
  let tcpPort: number;
  beforeAll(async () => {
    tcp = createNetServer(socket => socket.end('hello'));
    tcpPort = await listen(tcp as unknown as https.Server);
  });
  afterAll(async () => {
    await new Promise(resolve => tcp.close(resolve));
  });

  it('answers the all: true shape with a list, and the single shape with a pair', () => {
    const lookup = pinnedLookup('calendar.google.com', PUBLIC);
    const seenAll: unknown[] = [];
    lookup('calendar.google.com', { all: true }, (_e, a) => seenAll.push(a));
    expect(seenAll).toEqual([[{ address: PUBLIC, family: 4 }]]);
    const pair: unknown[] = [];
    lookup('calendar.google.com', {}, (_e, a, f) => pair.push(a, f));
    expect(pair).toEqual([PUBLIC, 4]);
    const bare: unknown[] = [];
    (lookup as unknown as (h: string, cb: LookupCallback) => void)('calendar.google.com', (_e, a, f) => bare.push(a, f));
    expect(bare).toEqual([PUBLIC, 4]);
  });

  it('refuses another name, and a family that does not match', () => {
    const lookup = pinnedLookup('calendar.google.com', PUBLIC);
    const errors: Array<Error | null> = [];
    lookup('evil.example', { all: true }, e => errors.push(e));
    lookup('calendar.google.com', { family: 6 }, e => errors.push(e));
    lookup('CALENDAR.GOOGLE.COM', { all: true }, e => errors.push(e));
    expect(errors.every(e => e !== null)).toBe(true);
  });

  it('is the lookup a real socket uses: net.connect with autoSelectFamily (all: true) reaches only the pinned address', async () => {
    const lookup = pinnedLookup('calendar.google.com', '127.0.0.1');
    const data = await new Promise<string>((resolve, reject) => {
      const socket = netConnect({ host: 'calendar.google.com', port: tcpPort, lookup, autoSelectFamily: true });
      let text = '';
      socket.on('data', chunk => (text += chunk));
      socket.on('end', () => resolve(text));
      socket.on('error', reject);
    });
    expect(data).toBe('hello');
  });

  it('works for a TLS socket with the original name as the server name', async () => {
    const lookup = pinnedLookup('calendar.google.com', '127.0.0.1');
    const result = await new Promise<string>((resolve, reject) => {
      const socket = tlsConnect({ host: 'calendar.google.com', port, servername: 'calendar.google.com', lookup, ca: pki.ca });
      socket.on('secureConnect', () => {
        resolve(String(socket.authorized));
        socket.destroy();
      });
      socket.on('error', reject);
    });
    expect(result).toBe('true');
  });
});
