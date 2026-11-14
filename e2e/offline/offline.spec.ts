import { expect, test } from '@playwright/test';
import type { BrowserContext, Page, Route } from '@playwright/test';

// The stub API. Each test controls it: `mode` decides what the network does, and the server state records what really landed.
type Mode = 'ok' | 'down' | 'weak' | 'slow' | 'hang-first-add';

interface Stub {
  mode: Mode;
  items: Record<string, string[]>;
  seen: Set<string>;
  addRequests: { user: string; mutationId: string }[];
  calls: number;
}

function newStub(): Stub {
  return { mode: 'ok', items: { a: [], b: [] }, seen: new Set(), addRequests: [], calls: 0 };
}

const userOf = (route: Route): string | undefined => {
  const header = route.request().headers().authorization ?? '';
  const match = /^Bearer valid:(\w+)$/.exec(header);
  return match?.[1];
};

async function install(context: BrowserContext, stub: Stub): Promise<void> {
  let hung = false;
  await context.route('**/api/**', async route => {
    stub.calls += 1;
    if (stub.mode === 'down') return route.abort('failed');
    // Weak signal: three in ten responses never arrive.
    if (stub.mode === 'weak' && stub.calls % 10 < 3) return route.abort('failed');
    const url = new URL(route.request().url());
    const user = userOf(route);
    if (!user) return route.fulfill({ status: 401, json: { error: 'unauthorised' } });

    if (url.pathname === '/api/add' || url.pathname === '/api/rename') {
      const body = route.request().postDataJSON() as { text: string; mutationId: string };
      stub.addRequests.push({ user, mutationId: body.mutationId });
      // The write lands when the request arrives, so a response that never gets back still leaves it saved.
      if (!stub.seen.has(body.mutationId)) {
        stub.seen.add(body.mutationId);
        stub.items[user].push(body.text);
      }
      if (stub.mode === 'hang-first-add' && !hung) {
        hung = true;
        return; // never answered: the page's own 10-second timeout must end it
      }
      if (stub.mode === 'slow') await new Promise(resolve => setTimeout(resolve, 3000));
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/api/list') return route.fulfill({ json: { items: stub.items[user] } });
    if (url.pathname === '/api/whoami') return route.fulfill({ json: { user } });
    return route.fulfill({ status: 404, json: {} });
  });
}

async function signIn(page: Page, as: 'a' | 'b'): Promise<void> {
  await page.goto('/');
  await page.getByTestId(`sign-in-as-${as}`).click();
  await expect(page.getByTestId('status')).toHaveText('signed in');
}

const savedList = (page: Page) => page.getByTestId('saved-list');

test.describe('offline spike', () => {
  test('a write is kept when the page is closed during a retry backoff, and saved when it reopens', async ({ context }) => {
    const stub = newStub();
    await install(context, stub);
    let page = await context.newPage();
    await signIn(page, 'a');

    stub.mode = 'down';
    await page.getByTestId('add-button').click();
    // The first attempt fails at once; the retry is a second away, so the page is in the middle of its backoff.
    await page.waitForTimeout(300);
    await expect(page.getByTestId('pending-count')).toHaveText('1');
    await page.close();

    stub.mode = 'ok';
    page = await context.newPage();
    await page.goto('/');
    await expect(savedList(page)).toContainText('milk', { timeout: 10_000 });
    await expect(page.getByTestId('pending-count')).toHaveText('0');
    expect(stub.items.a).toEqual(['milk']);
  });

  test('a write made a moment before the page is closed is still pending when it reopens, and is saved once', async ({ context }) => {
    const stub = newStub();
    await install(context, stub);
    let page = await context.newPage();
    await signIn(page, 'a');

    stub.mode = 'slow';
    await page.getByTestId('add-button').click();
    await page.waitForTimeout(150);
    await page.close();

    stub.mode = 'ok';
    page = await context.newPage();
    await page.goto('/');
    await expect(savedList(page)).toContainText('milk', { timeout: 10_000 });
    await expect(page.getByTestId('pending-count')).toHaveText('0');
    // It reached the stub before the page closed and again after reopening, with the same mutation id: written once.
    expect(stub.items.a).toEqual(['milk']);
    expect(new Set(stub.addRequests.map(request => request.mutationId)).size).toBe(1);
  });

  test('one person\'s waiting writes are never sent for another person, and are gone after sign-out', async ({ context }) => {
    const stub = newStub();
    await install(context, stub);
    let page = await context.newPage();
    await signIn(page, 'a');
    stub.mode = 'ok';
    await page.getByTestId('add-button').click();
    await expect(savedList(page)).toContainText('milk');

    stub.mode = 'down';
    await page.getByTestId('text').fill('secret');
    await page.getByTestId('add-button').click();
    await page.waitForTimeout(300);
    await page.close();

    // A did not sign out, but A's login is gone when the page loads (an expired session), and B signs in on the same browser. A's
    // cache is never opened for B, and A's waiting write is never sent as B. The login is cleared before the app starts, once only.
    stub.mode = 'ok';
    page = await context.newPage();
    await page.addInitScript(() => {
      if (sessionStorage.getItem('wiped')) return;
      sessionStorage.setItem('wiped', '1');
      localStorage.removeItem('spike-user');
      localStorage.removeItem('spike-token');
    });
    await page.goto('/');
    await page.getByTestId('sign-in-as-b').click();
    await expect(page.getByTestId('status')).toHaveText('signed in');
    await expect(savedList(page)).toBeEmpty();
    await expect(page.getByTestId('pending-count')).toHaveText('0');
    await page.waitForTimeout(3500);
    expect(stub.items.b).toEqual([]);
    expect(stub.addRequests.filter(request => request.user === 'b')).toEqual([]);
    expect(stub.items.a).not.toContain('secret');
  });

  test('signing out clears the person\'s own cache, so a waiting write is gone for good', async ({ context }) => {
    const stub = newStub();
    await install(context, stub);
    const page = await context.newPage();
    await signIn(page, 'a');
    stub.mode = 'down';
    await page.getByTestId('text').fill('secret');
    await page.getByTestId('add-button').click();
    await expect(page.getByTestId('pending-count')).toHaveText('1');

    await page.getByTestId('sign-out').click();
    stub.mode = 'ok';
    await page.getByTestId('sign-in-as-a').click();
    await expect(page.getByTestId('status')).toHaveText('signed in');
    await expect(page.getByTestId('pending-count')).toHaveText('0');
    await page.waitForTimeout(3500);
    expect(stub.items.a).toEqual([]);
    expect(stub.addRequests).toEqual([]);
  });

  test('a cold launch with no network shows the cached list at once, and waiting writes wait for sign-in', async ({ context }) => {
    const stub = newStub();
    await install(context, stub);
    let page = await context.newPage();
    await signIn(page, 'a');
    await page.getByTestId('add-button').click();
    await expect(savedList(page)).toContainText('milk');
    stub.mode = 'down';
    await page.getByTestId('text').fill('later');
    await page.getByTestId('add-button').click();
    await page.waitForTimeout(300);
    await page.close();

    // No network at all, and the token has expired: the list still shows within a second, and the write waits.
    page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(savedList(page)).toContainText('milk', { timeout: 1000 });
    await expect(page.getByTestId('status')).toHaveText('signing in');
    await expect(page.getByTestId('pending-count')).toHaveText('1');

    stub.mode = 'ok';
    await page.evaluate(() => localStorage.setItem('spike-token', 'expired'));
    await page.reload();
    await expect(savedList(page)).toContainText('milk', { timeout: 1000 });
    await page.waitForTimeout(2500);
    expect(stub.items.a).toEqual(['milk']);
    await expect(page.getByTestId('pending-count')).toHaveText('1');

    // Signed in again: the waiting write is saved.
    await page.evaluate(() => localStorage.setItem('spike-token', 'valid:a'));
    await page.reload();
    await expect(page.getByTestId('status')).toHaveText('signed in');
    await expect(savedList(page)).toContainText('later', { timeout: 10_000 });
    expect(stub.items.a).toEqual(['milk', 'later']);
  });

  test('on a weak signal the cached list shows at once, and a request that hangs times out and is retried', async ({ context }) => {
    const stub = newStub();
    await install(context, stub);
    let page = await context.newPage();
    await signIn(page, 'a');
    await page.getByTestId('add-button').click();
    await expect(savedList(page)).toContainText('milk');
    await page.close();

    stub.mode = 'weak';
    page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(savedList(page)).toContainText('milk', { timeout: 1000 });

    // A write whose request hangs for ever: the page's own 10-second timeout ends it and the retry saves it.
    stub.mode = 'hang-first-add';
    await expect(page.getByTestId('status')).toHaveText('signed in', { timeout: 15_000 });
    await page.getByTestId('text').fill('eggs');
    await page.getByTestId('add-button').click();
    await expect(page.getByTestId('pending-count')).toHaveText('1');
    await expect(page.getByTestId('pending-count')).toHaveText('0', { timeout: 30_000 });
    expect(stub.items.a).toEqual(['milk', 'eggs']);
    // The same write was sent more than once (the hung one, then the retry) and saved once.
    expect(stub.addRequests.filter(request => request.user === 'a').length).toBeGreaterThanOrEqual(3);
  });
});
