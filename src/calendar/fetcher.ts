import { Resolver } from 'node:dns/promises';
import type { ClientRequest, IncomingMessage } from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { createGunzip } from 'node:zlib';
import { isAllowedAddress } from './addressRules';
import { checkRedirectTarget, extraHostsFrom, parseFeedLink } from './allowedHosts';

// The one module that makes outbound requests to a link a person typed (a test fails if any other file does). Every rule is the
// "Fetching a link" section of docs/designs/phase-4-calendar.md. It never throws, never logs, and never keeps the text of an
// underlying error, because Node's errors hold the host and the address: a refusal is two enums and nothing else.

export type InternalOutcome = 'blocked_host' | 'blocked_address' | 'dns' | 'connect' | 'timeout' | 'tls' | 'redirect' | 'status' | 'not_calendar' | 'parse' | 'too_big';
export type FeedUserCode = 'ok' | 'not_https' | 'bad_link' | 'not_supported' | 'unreachable' | 'link_stopped' | 'provider_busy' | 'not_calendar' | 'too_big';
export type FailureCode = Exclude<FeedUserCode, 'ok'>;

export type FetchResult = { ok: true; text: string; bytes: number } | { ok: false; internal: InternalOutcome; code: FailureCode };

export type RequestFn = (options: https.RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

export interface Limits {
  connectMs: number;
  idleMs: number;
  totalMs: number;
  dnsMs: number;
}

// Everything the fetcher touches outside itself. The real set is built once at the bottom of this file; a test builds its own with a
// fake resolver, a local server and its own certificate authority, so production code has no override.
export interface FetcherDeps {
  resolve4: (host: string) => Promise<string[]>;
  resolve6: (host: string) => Promise<string[]>;
  request: RequestFn;
  // The trusted certificates. Absent means Node's own list.
  ca?: string | Buffer | Array<string | Buffer>;
  extraHosts: readonly string[];
  limits?: Partial<Limits>;
}

const DEFAULT_LIMITS: Limits = { connectMs: 5000, idleMs: 5000, totalMs: 15_000, dnsMs: 3000 };
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_CONCURRENT = 2;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = 'Hearthwise-calendar/1';

class Refusal {
  constructor(
    readonly internal: InternalOutcome,
    readonly code: FailureCode,
  ) {}
}

export function userCodeFor(internal: InternalOutcome, status?: number): FailureCode {
  switch (internal) {
    case 'not_calendar':
    case 'parse':
      return 'not_calendar';
    case 'too_big':
      return 'too_big';
    case 'status':
      if (status === 401 || status === 403 || status === 404 || status === 410) return 'link_stopped';
      if (status === 429 || (status !== undefined && status >= 500 && status <= 599)) return 'provider_busy';
      return 'unreachable';
    case 'blocked_host':
      return 'not_supported';
    default:
      return 'unreachable';
  }
}

const refusal = (internal: InternalOutcome, status?: number): Refusal => new Refusal(internal, userCodeFor(internal, status));

// A lookup that can only ever answer with one vetted address, for one name, in both shapes Node asks for: a single address, and (with
// `all: true`, which Node 24's connection racing uses) a list. A second lookup, whatever it asks, gets the same answer, so a name that
// changes its DNS answer between the check and the connection (DNS rebinding) cannot move the connection.
export function pinnedLookup(hostname: string, address: string): LookupFunction {
  const family = address.includes(':') ? 6 : 4;
  const lookup = (name: string, optionsOrCallback: unknown, maybeCallback?: unknown): void => {
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as (error: Error | null, address?: unknown, family?: number) => void;
    const options = typeof optionsOrCallback === 'object' && optionsOrCallback !== null ? (optionsOrCallback as { all?: boolean; family?: number | string }) : {};
    const wanted = options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : options.family;
    if (name !== hostname || (wanted !== undefined && wanted !== 0 && wanted !== family)) {
      const error = Object.assign(new Error('lookup refused'), { code: 'ENOTFOUND' });
      callback(error);
      return;
    }
    if (options.all === true) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
  return lookup as LookupFunction;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Rejects when the shared deadline passes, so every wait in a fetch ends there.
const raceDeadline = <T>(promise: Promise<T>, deadline: Promise<never>): Promise<T> => Promise.race([promise, deadline]);

type HopResult = { kind: 'redirect'; location: string } | { kind: 'body'; text: string; bytes: number };

export function createFetcher(deps: FetcherDeps): (link: string) => Promise<FetchResult> {
  const limits: Limits = { ...DEFAULT_LIMITS, ...deps.limits };

  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = (): Promise<void> => {
    if (active < MAX_CONCURRENT) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => waiting.push(resolve));
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  // Step 4: our own resolution, under its own timeout. Every address returned must be allowed, or the whole request is refused.
  async function resolveVetted(host: string, deadline: Promise<never>): Promise<string> {
    const answer = async (lookup: (name: string) => Promise<string[]>): Promise<string[] | undefined> => {
      try {
        const addresses = await withTimeout(Promise.resolve(lookup(host)), limits.dnsMs);
        return Array.isArray(addresses) ? addresses : undefined;
      } catch {
        return undefined;
      }
    };
    const [four, six] = await raceDeadline(Promise.all([answer(deps.resolve4), answer(deps.resolve6)]), deadline);
    const all = [...(four ?? []), ...(six ?? [])];
    if (all.length === 0) throw refusal('dns');
    if (!all.every(address => typeof address === 'string' && isAllowedAddress(address))) throw refusal('blocked_address');
    const pinned = (four ?? []).find(address => !address.includes(':')) ?? all[0];
    return pinned;
  }

  // Steps 5 and 7: one request to the vetted address, with every limit. The connection is destroyed on every exit.
  function runHop(url: URL, address: string, deadline: Promise<never>): Promise<HopResult> {
    return new Promise<HopResult>((resolve, reject) => {
      let finished = false;
      let request: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      let connectTimer: NodeJS.Timeout | undefined;

      const end = (): void => {
        finished = true;
        if (connectTimer) clearTimeout(connectTimer);
        response?.destroy();
        request?.destroy();
      };
      const fail = (error: Refusal): void => {
        if (finished) return;
        end();
        reject(error);
      };
      const succeed = (result: HopResult): void => {
        if (finished) return;
        end();
        resolve(result);
      };
      deadline.catch(() => fail(refusal('timeout')));

      try {
        request = deps.request(
          {
            method: 'GET',
            protocol: 'https:',
            hostname: url.hostname,
            port: 443,
            path: `${url.pathname}${url.search}`,
            agent: false,
            servername: url.hostname,
            lookup: pinnedLookup(url.hostname, address),
            ca: deps.ca,
            minVersion: 'TLSv1.2',
            headers: { Host: url.hostname, 'Accept-Encoding': 'gzip', 'User-Agent': USER_AGENT, Connection: 'close' },
          },
          res => {
            response = res;
            const status = res.statusCode ?? 0;
            if (REDIRECT_STATUSES.has(status)) {
              const location = res.headers.location;
              if (typeof location !== 'string' || location === '') fail(refusal('redirect'));
              else succeed({ kind: 'redirect', location });
              return;
            }
            if (status !== 200) {
              fail(refusal('status', status));
              return;
            }
            readBody(res, fail, succeed);
          },
        );
      } catch {
        fail(refusal('connect'));
        return;
      }

      request.setTimeout(limits.idleMs, () => fail(refusal('timeout')));
      request.on('socket', socket => {
        connectTimer = setTimeout(() => fail(refusal('timeout')), limits.connectMs);
        socket.once('secureConnect', () => {
          if (connectTimer) clearTimeout(connectTimer);
        });
      });
      request.on('error', error => fail(refusal(isCertificateError(error) ? 'tls' : 'connect')));
      request.end();
    });
  }

  function readBody(res: IncomingMessage, failHop: (error: Refusal) => void, succeed: (result: HopResult) => void): void {
    let gunzip: ReturnType<typeof createGunzip> | undefined;
    // Every way out also destroys the decompressor, so it does no more work.
    const fail = (error: Refusal): void => {
      gunzip?.destroy();
      failHop(error);
    };
    const encodingHeader = res.headers['content-encoding'];
    const encoding = (typeof encodingHeader === 'string' ? encodingHeader : '').trim().toLowerCase();
    const gzip = encoding === 'gzip' || encoding === 'x-gzip';
    if (encoding !== '' && encoding !== 'identity' && !gzip) {
      fail(refusal('not_calendar'));
      return;
    }
    const declared = Number(res.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      fail(refusal('too_big'));
      return;
    }

    const chunks: Buffer[] = [];
    let received = 0;
    let produced = 0;
    const take = (chunk: Buffer): void => {
      produced += chunk.length;
      if (produced > MAX_BYTES) {
        fail(refusal('too_big'));
        return;
      }
      chunks.push(chunk);
    };
    const done = (): void => {
      const text = Buffer.concat(chunks).toString('utf8');
      const start = text.replace(/^[﻿\s]+/, '');
      if (!start.startsWith('BEGIN:VCALENDAR')) fail(refusal('not_calendar'));
      else succeed({ kind: 'body', text, bytes: produced });
    };

    res.on('error', () => fail(refusal('connect')));
    res.on('aborted', () => fail(refusal('connect')));
    res.on('close', () => {
      if (!res.complete) fail(refusal('connect'));
    });

    if (!gzip) {
      res.on('data', (chunk: Buffer) => take(chunk));
      res.on('end', done);
      return;
    }

    // Count what comes in as well as what comes out, and stop reading the moment either passes the limit, so a bomb is never expanded.
    const decoder = createGunzip();
    gunzip = decoder;
    decoder.on('error', () => fail(refusal('not_calendar')));
    decoder.on('data', (chunk: Buffer) => take(chunk));
    decoder.on('end', done);
    res.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BYTES) {
        decoder.destroy();
        fail(refusal('too_big'));
        return;
      }
      if (!decoder.write(chunk)) {
        res.pause();
        decoder.once('drain', () => res.resume());
      }
    });
    res.on('end', () => decoder.end());
  }

  async function run(link: string, deadline: Promise<never>): Promise<FetchResult> {
    const first = parseFeedLink(link, deps.extraHosts);
    if (!first.ok) return { ok: false, internal: first.internal, code: first.code };
    let url = new URL(first.href);
    let redirects = 0;
    for (;;) {
      const address = await resolveVetted(url.hostname, deadline);
      const hop = await runHop(url, address, deadline);
      if (hop.kind === 'body') return { ok: true, text: hop.text, bytes: hop.bytes };
      if (++redirects > MAX_REDIRECTS) throw refusal('redirect');
      const next = checkRedirectTarget(hop.location, url, deps.extraHosts);
      if (!next.ok) throw new Refusal(next.internal, next.code);
      url = new URL(next.href);
    }
  }

  return async function fetchLink(link: string): Promise<FetchResult> {
    // Cheap checks first, so a refused link never waits for a slot.
    const early = typeof link === 'string' ? parseFeedLink(link, deps.extraHosts) : undefined;
    if (!early || !early.ok) return { ok: false, internal: 'blocked_host', code: early && !early.ok ? early.code : 'bad_link' };

    await acquire();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('deadline')), limits.totalMs);
    });
    deadline.catch(() => undefined);
    try {
      return await run(link, deadline);
    } catch (error) {
      if (error instanceof Refusal) return { ok: false, internal: error.internal, code: error.code };
      // The deadline, or anything unexpected. Only the fact is kept, never the text.
      const timedOut = error instanceof Error && error.message === 'deadline';
      return { ok: false, internal: timedOut ? 'timeout' : 'connect', code: 'unreachable' };
    } finally {
      if (timer) clearTimeout(timer);
      release();
    }
  };
}

function isCertificateError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /CERT|ISSUER|SIGNATURE|ALTNAME|SELF_SIGNED|ERR_TLS|ERR_SSL|HOSTNAME_MISMATCH/.test(code);
}

function createRealDeps(): FetcherDeps {
  const resolver = new Resolver({ timeout: 3000, tries: 1 });
  return {
    resolve4: host => resolver.resolve4(host),
    resolve6: host => resolver.resolve6(host),
    request: (options, callback) => https.request(options, callback),
    extraHosts: extraHostsFrom(process.env),
  };
}

export const fetchFeed = createFetcher(createRealDeps());
