import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findNetworkUse } from './networkScan';

const ROOT = join(__dirname, '..', '..', '..');
const FETCHER = 'src/calendar/fetcher.ts';

// Files that legitimately use a network or process module, and only the modules named. The container's server listens for requests
// (http) and starts Caddy (child_process); neither reaches an address a person typed.
const ALLOWED: Record<string, string[]> = {
  [FETCHER]: ['*'],
  'container/server.ts': ['http', 'child_process'],
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts')) found.push(path);
  }
  return found;
}

describe('the scanner (so the guard below cannot pass by being blind)', () => {
  const uses = (source: string): string[] => findNetworkUse(source).map(use => use.what);

  it.each([
    ["import https from 'https';", 'https'],
    ["import https from 'node:https';", 'https'],
    ["import * as http from \"node:http\";", 'http'],
    ["import { request } from 'http';", 'http'],
    ["import 'net';", 'net'],
    ["import http2 from 'node:http2';", 'http2'],
    ["import { connect } from 'tls';", 'tls'],
    ["import dns from 'node:dns';", 'dns'],
    ["import { Resolver } from 'node:dns/promises';", 'dns'],
    ["import dgram from 'dgram';", 'dgram'],
    ["import { spawn } from 'child_process';", 'child_process'],
    ["import { fetch } from 'undici';", 'undici'],
    ["import axios from 'axios';", 'axios'],
    ["import got from 'got';", 'got'],
    ["import got from 'got/dist/source';", 'got'],
    ["export * from 'node:net';", 'net'],
    ["export { request } from 'https';", 'https'],
    ["import {\n  request,\n} from 'node:https';", 'https'],
    ["import { type X, request } from 'node:https';", 'https'],
    ["const https = require('https');", 'https'],
    ["const https = require(\"node:https\");", 'https'],
    ["const { request } = require( 'http' );", 'http'],
    ["const net = await import('net');", 'net'],
    ["const net = await import(\"node:net\");", 'net'],
    ["import('node:tls').then(m => m);", 'tls'],
    ["const x = require(`https`);", 'https'],
    ["const x = await import(`node:https`);", 'https'],
    ["import https = require('https');", 'https'],
  ])('flags %j', (source, what) => {
    expect(uses(source)).toContain(what);
  });

  it.each([
    ["const m = 'ht' + 'tps'; require(m);", 'a require that is not a plain string'],
    ["const name = 'node:https'; await import(name);", 'a dynamic import that is not a plain string'],
    ["await import(`node:${x}`);", 'a template import with a hole'],
    ["const r = createRequire(import.meta.url);", 'createRequire'],
    ["process.binding('tcp_wrap');", 'process.binding'],
    ["process.dlopen(m, f);", 'process.dlopen'],
    ["module.require('https');", 'module.require'],
    ["require.resolve('x'); eval('1');", 'eval'],
    ["new Function('return 1')();", 'Function constructor'],
  ])('flags %j as %s', source => {
    expect(findNetworkUse(source).length).toBeGreaterThan(0);
  });

  it.each([
    ['fetch(url);', 'fetch'],
    ['await fetch(url, { method: "POST" });', 'fetch'],
    ['const f = fetch;', 'fetch'],
    ['globalThis.fetch(url);', 'fetch'],
    ['window.fetch(url);', 'fetch'],
    ['self["fetch"](url);', 'fetch'],
    ['globalThis["fetch"](url);', 'fetch'],
    ['const { fetch } = globalThis;', 'fetch'],
    ['new WebSocket(url);', 'WebSocket'],
    ['new XMLHttpRequest();', 'XMLHttpRequest'],
    ['new EventSource(url);', 'EventSource'],
    ['navigator.sendBeacon(url);', 'sendBeacon'],
  ])('flags %j', (source, what) => {
    expect(uses(source)).toContain(what);
  });

  it.each([
    "import type { IncomingMessage } from 'node:http';",
    "import type https from 'node:https';",
    "export type { Server } from 'node:net';",
    "import { readFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "import webpush from 'web-push';",
    "import { SNSClient } from '@aws-sdk/client-sns';",
    "import { gotcha } from './got';",
    "import { x } from './http';",
    "import { x } from '../net';",
    "const fetchFeed = createFetcher(deps); await fetchFeed(link);",
    "refetch(); prefetch(); store.fetchedAt; const fetchedAt = 1; fetch_count++;",
    "// we never call fetch(url) or import https here",
    "/* require('https'); fetch(url) */ const a = 1;",
    "const text = 'do not fetch(url) or require(\"http\")';",
    "const t = `fetch(${x}) import('net')`;",
    "const x = a / b; // fetch(url)\nconst y = 1;",
    "const re = /fetch/;",
  ])('does not flag %j', source => {
    expect(findNetworkUse(source)).toEqual([]);
  });

  it('flags code after a comment or a string that only looks like it ends the code', () => {
    expect(uses("const a = 'it\\'s'; fetch(url);")).toContain('fetch');
    expect(uses('const a = "x"; /* c */ fetch(url);')).toContain('fetch');
    expect(uses('// c\nfetch(url);')).toContain('fetch');
    expect(uses("const a = `${fetch(url)}`;")).toContain('fetch');
    expect(uses("const a = `x ${`y ${require('https')}`}`;")).toContain('https');
  });
});

describe('nothing but the fetcher reaches the network', () => {
  const files = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'container')), ...readdirSync(ROOT).filter(name => /\.(ts|cjs|mjs|js)$/.test(name) && !/\.config\./.test(name)).map(name => join(ROOT, name))];

  it('scans the files it should', () => {
    const names = files.map(file => relative(ROOT, file));
    expect(names).toContain(FETCHER);
    expect(names).toContain('container/server.ts');
    expect(names).toContain('src/push/webPushSender.ts');
    expect(names).toContain('api-handler.ts');
    expect(names).toContain('push-handler.ts');
    expect(names.some(name => name.includes('__tests__'))).toBe(false);
    expect(names.length).toBeGreaterThan(80);
  });

  it('finds no import, require, dynamic import or fetch call in any other file', () => {
    const problems: string[] = [];
    for (const file of files) {
      const name = relative(ROOT, file);
      const allowed = ALLOWED[name] ?? [];
      if (allowed.includes('*')) continue;
      for (const use of findNetworkUse(readFileSync(file, 'utf8'))) {
        if (allowed.includes(use.what)) continue;
        problems.push(`${name}:${use.line} ${use.what}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps the allow-list to what the files really use, so it cannot quietly grow', () => {
    for (const [name, modules] of Object.entries(ALLOWED)) {
      if (modules.includes('*')) continue;
      const used = new Set(findNetworkUse(readFileSync(join(ROOT, name), 'utf8')).map(use => use.what));
      expect([...used].sort()).toEqual([...modules].sort());
    }
  });

  it('finds the fetcher itself using the network, so the scan is not blind to it', () => {
    const used = findNetworkUse(readFileSync(join(ROOT, FETCHER), 'utf8')).map(use => use.what);
    expect(used).toEqual(expect.arrayContaining(['https', 'dns']));
  });
});
