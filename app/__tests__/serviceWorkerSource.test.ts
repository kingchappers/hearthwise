import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The worker cannot run under jsdom, so what matters about it is checked in its source.
const source = readFileSync(join(__dirname, '..', 'sw.ts'), 'utf8');
const code = source.replace(/(^|\s)\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the service worker (app/sw.ts)', () => {
  it('precaches the built app and cleans up old caches', () => {
    expect(code).toContain('precacheAndRoute(self.__WB_MANIFEST)');
    expect(code).toContain('cleanupOutdatedCaches()');
  });

  it('answers navigation from the precached app shell, never for the API', () => {
    expect(code).toContain('NavigationRoute');
    expect(code).toMatch(/createHandlerBoundToURL\(['"]\/index\.html['"]\)/);
    expect(code).toMatch(/denylist:\s*\[\s*\/\^\\\/api\\\/\//);
  });

  it('serves /config.json stale-while-revalidate, and nothing else outside the app shell', () => {
    expect(code).toMatch(/pathname === ['"]\/config\.json['"]/);
    expect(code).toContain('StaleWhileRevalidate');
    const routes = code.match(/registerRoute\(/g) ?? [];
    expect(routes).toHaveLength(2); // the navigation fallback and /config.json
  });

  it('never caches an API response', () => {
    expect(code).not.toMatch(/registerRoute\([^)]*['"]\/api/);
    expect(code).not.toMatch(/CacheFirst|NetworkFirst/);
  });

  it('never calls skipWaiting, so an open page never loads files from a different build', () => {
    expect(code).not.toContain('skipWaiting');
    expect(code).not.toContain('clients.claim');
  });

  it('shows a push notification and opens the app when it is tapped', () => {
    expect(code).toContain("addEventListener('push'");
    expect(code).toContain("addEventListener('notificationclick'");
  });
});
