# Phase 1, Step 5: Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app opens and shows the last-known lists with no signal, writes made offline (or on a weak signal) are kept and saved when the connection returns, and a different person signing in on the same browser never sees or sends the first person's data.

**Architecture:** TanStack Query's own persistence: the query cache and every pending household mutation are saved to IndexedDB per user; mutations are registered by key (step 3/4), so they can be replayed after a reload; a service worker precaches the app shell. A spike with browser tests proves the setup before anything else is built; if it fails, the design falls back to Alternative K (a custom write queue).

**Tech Stack:** TanStack Query v5 persist, `idb-keyval`, `vite-plugin-pwa` (injectManifest) with Workbox, Playwright (Chromium).

**Spec:** `docs/designs/phase-1-foundation.md`, Step 5 (items 29a, 30, 31, 33, 34), "Sync and offline on the client", "Risks and Mitigations".

## Global Constraints

- Persisted cache key `hearthwise-cache-<userId>` in IndexedDB; `maxAge` 7 days; `throttleTime: 0`; the entry records the user id and a `schemaVersion`. At sign-in the user id is saved to `localStorage` under `hearthwise-user`; the cache is opened with it before any network call.
- Every household mutation: `networkMode: 'online'`; `retry`: always for a network error (a fetch `TypeError` or the 10-second `TimeoutError`), `failureCount < 3` for 5xx, never otherwise; `retryDelay` exponential, capped at 60 s; persisted whether paused or retrying; after a restore every pending mutation is marked paused, then resumed by `resumePausedMutations()` on restore, `online`, window focus and sign-in.
- Errors: 401 or `login_required` keeps the mutation paused and asks for sign-in (resumes only for the same user); 409/410 drop and refetch; `403 proposal_required` drop and list with an "Ask <name>" action; other 4xx drop and list as "Couldn't save"; 5xx after 3 tries drop and list as "Couldn't save; try again".
- Signing out clears the cache; with writes pending it asks first and says how many would be lost. Another user's cache is never restored or sent.
- The service worker never calls `skipWaiting()` while a page is open; `/api/*` is never cached by it; `/config.json` is stale-while-revalidate.
- Wording: neutral; no "overdue", "missed", "streak"; no red; no `xs` buttons. Every `fetch` keeps the 10-second `withTimeout()`.
- Conventional commits with the attribution trailer. Branch `step-5-offline` (cut from `step-4-shopping`). Every task leaves `yarn typecheck` and `yarn test` green.

## Decisions made in this plan (the spec is silent)

- The spike runs in Chromium only (WebKit is not installed here; the design says "where the API allows"). It builds its own small page against a stub API in `e2e/offline/`, served by Vite on a fixed port by Playwright's `webServer`.
- The cache provider is keyed by the stored user id, so a different person signing in remounts it with their own cache.
- A banner entry for a dropped write is kept in memory (not persisted); the pending count is read from the mutation cache.

## Review Focus

1. **Another person's data:** user A's pending writes and cached lists are never restored for B, never sent, and sign-out clears them. [Task 2, Task 3]
2. **A write is never lost or doubled:** a reload during backoff, a reload within a second of a write, a retry of a write that already landed (same `mutationId`). [Task 1, Task 2]
3. **An expired sign-in:** a 401 keeps the write paused and resumes it for the same user only. [Task 2]
4. **Stale code:** a new service worker waits for the next launch; an old saved cache with an older `schemaVersion` replays its writes and drops its data. [Task 2, Task 3]
5. **Launching with no network and no config:** the app shows cached lists, not an error. [Task 3]

---

### Task 1: The spike (browser tests)

**Files:**
- Create: `playwright.config.ts`, `e2e/offline/index.html`, `e2e/offline/main.tsx`, `e2e/offline/offline.spec.ts`
- Modify: `package.json` (script exists), `.github/workflows/yarnBuild.yml` (an e2e job, no AWS credentials), `vitest.config.ts` (already excludes `e2e/**`)

**Interfaces:**
- Produces: a minimal page with a `PersistQueryClientProvider` (idb-keyval persister, `throttleTime: 0`), two registered mutations (`add`, `rename`) with the Step 5 retry rule, a list query, `resumePausedMutations` on restore, and controls: `data-testid` `add-button`, `pending-count`, `saved-list`, `sign-in-as-a|b`. The API is stubbed with `page.route`.
- The five tests (design 29a): closed during a retry backoff, then reopened → resumes and saves; closed within 1 s of a write → still pending, then saved; A signs out, B signs in → A's writes never sent, B sees none of A's data; cold launch offline (also with an expired token) shows the cached list within 1 s and pending writes wait for sign-in; weak signal (30% of responses dropped, a hung request times out at 10 s and retries) shows cached lists within 1 s.

- [ ] **Step 1: Write the page and the five specs** (they fail first because the page does not persist yet: write the specs, then the page).
- [ ] **Step 2: Run `yarn test:e2e`; see them fail** (no persistence in the first cut of the page).
- [ ] **Step 3: Implement the page's persistence and retry rule** to the Global Constraints.
- [ ] **Step 4: Run `yarn test:e2e`; expect all five PASS.** If one cannot pass, stop: record it in `docs/DECISIONS.md` and switch the rest of the step to Alternative K.
- [ ] **Step 5: Commit** `test: add the offline spike with browser tests`.

---

### Task 2: Persisted cache and resilient mutations

**Files:**
- Create: `app/lib/persistedCache.ts`, `app/lib/retryRules.ts`, `app/hooks/useResumeOnReconnect.ts`, `app/components/layout/PendingWritesBanner.tsx`
- Modify: `app/lib/mutations.ts` (defaults: `networkMode`, `retry`, `retryDelay`, `onError` by status, dropped-write list), `app/root.tsx` (provider), `app/lib/household.ts` (step 2 hooks move into the registry with the same defaults)
- Test: `app/lib/__tests__/{persistedCache,retryRules}.test.ts(x)`, `app/hooks/__tests__/useResumeOnReconnect.test.tsx`, `app/components/layout/__tests__/PendingWritesBanner.test.tsx`, extend `mutations.test.ts` and the registry guard

**Interfaces:**
- Produces:
  ```ts
  // retryRules.ts
  export function shouldRetry(failureCount: number, error: unknown): boolean
  export function retryDelay(failureCount: number): number                    // 1s doubling, capped at 60_000
  // persistedCache.ts
  export const CACHE_SCHEMA_VERSION: number
  export function cacheKey(userId: string): string
  export function createUserPersister(userId: string, storage?: AsyncStorageLike): Persister
  export function pauseAllPending(client: QueryClient): void                  // the one place that touches TanStack's pause dispatch
  export function shouldDehydrateMutation(mutation: Mutation): boolean        // household scope, pending
  export function readStoredUser(): string | undefined; export function storeUser(id: string): void; export function clearStoredUser(): void
  export async function restoreUserCache(client, userId, storage?): Promise<'restored' | 'discarded' | 'none'>
  export async function clearUserCache(userId: string, storage?): Promise<void>
  // hooks and components
  export function useResumeOnReconnect(signedInUserId: string | undefined, cacheUserId: string | undefined): void
  export function PendingWritesBanner(): JSX.Element | null
  export function recordDropped(entry: { id: string; message: string; action?: 'ask' }): void
  ```

- [ ] **Step 1: Write the failing tests** (design item 34): `shouldRetry` — true for a `TypeError` and a `TimeoutError` at any count, true for 5xx below 3 and false at 3, false for 4xx; `retryDelay` doubles to 60 s; every registered key has defaults with `networkMode: 'online'`; a paused mutation is dehydrated, persisted and, after a simulated reload (new `QueryClient`, restored), replays in order; a fetch that rejects while `navigator.onLine` is true is retried, survives a reload during backoff and is saved; a 401 keeps the mutation paused and resumes after the same user signs in, and a different user never sends it; 409, 410, `proposal_required`, other 4xx and 5xx (after 3) each end in the right banner entry; another user's cache is never restored; an older `schemaVersion` replays its pending mutations then discards its query data; creating then deleting a task offline replays both in order and the task ends deleted; `pauseAllPending` fails loudly if TanStack's dispatch changes (it asserts the mutation's `state.isPaused` afterwards).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** Add `idb-keyval` storage (`get`/`set`/`del`) to the persister; `onError` classifies by `ApiError.status`/`code` (and Auth0's `login_required`); `useResumeOnReconnect` calls `resumePausedMutations()` after restore, on `online`, on focus, and when `signedInUserId === cacheUserId`.
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: persist the cache and keep household writes through a reload`.

---

### Task 3: Service worker, launching offline, signing out

**Files:**
- Create: `app/sw.ts`, `app/lib/serviceWorker.ts`, `app/components/layout/UpdateNotice.tsx`
- Modify: `vite.config.ts`, `app/root.tsx`, `app/components/authentication/AuthProvider.tsx`, `app/components/layout/DefaultLayout.tsx`, `app/routes/settings.tsx` (sign-out confirmation), `app/components/authentication/LocalAuthProvider.tsx`
- Test: `app/lib/__tests__/serviceWorker.test.ts`, `app/components/authentication/__tests__/AuthProvider.test.tsx`, `app/components/layout/__tests__/{DefaultLayout,UpdateNotice}.test.tsx`, `app/routes/__tests__/settings.test.tsx`, `app/__tests__/serviceWorkerSource.test.ts`

**Interfaces:**
- Produces: `registerServiceWorker(): Promise<void>` (registers `/sw.js` on every load; resolves quietly where unsupported; reports a waiting worker through `onUpdateReady(cb)`); `signOutWithConfirmation` flow: asks with the count of pending writes, then clears the cache and the stored user and signs out.
- `sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)`, `cleanupOutdatedCaches()`, a `NavigationRoute` to the precached `index.html` excluding `/api/*`, `StaleWhileRevalidate` for `/config.json`, no `/api/*` caching, no `skipWaiting()`.
- `AuthProvider`: with a stored user and no config yet, renders children with a `signedInUser` instead of the "could not start" screen; `DefaultLayout` shows cached lists with a small "Signing in…" note.

- [ ] **Step 1: Write the failing tests:** the worker source contains no `skipWaiting`, no `/api` caching route, precaches and has the navigation fallback and the `/config.json` strategy (a source test, since the worker cannot run under jsdom); registration is quiet when unsupported and reports an update; `AuthProvider` with a stored user and a failing `config.json` renders children, with no stored user it shows the error; `DefaultLayout` with a stored user shows the cached lists and "Signing in…"; sign-out with 3 pending writes asks first and names the count, clears the cache and the stored user once confirmed, and does nothing on cancel.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** `VitePWA({ strategies: 'injectManifest', srcDir: 'app', filename: 'sw.ts', injectRegister: false, manifest: false, injectManifest: { globDirectory: 'build/client', globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'], globIgnores: ['config.json', 'index.js'] } })`.
- [ ] **Step 4: Run `yarn typecheck && yarn test && yarn build`; expect PASS, and `build/client/sw.js` exists with the precache list and no `/api` route.**
- [ ] **Step 5: Commit** `feat: add the service worker, launch with no signal and confirm sign-out`.

---

### Task 4: Docs, whole-step verification and review

- [ ] **Step 1: Docs.** ROADMAP step 5 built; CLAUDE.md (persistence, the pause helper, the service worker); DECISIONS (this plan's decisions and the spike's result); SECURITY (per-user cache, clear on sign-out, no `/api` in the service worker).
- [ ] **Step 2: Whole-step verification.** `yarn install --frozen-lockfile && yarn typecheck && DYNAMODB_ENDPOINT=http://localhost:8000 yarn test && yarn test:e2e && yarn build && yarn build:container && docker build -t hearthwise:dev . && node scripts/container-smoke.mjs hearthwise:dev && node scripts/container-smoke.mjs hearthwise:dev --proxy && tofu fmt -check -recursive infra`; the smoke script also checks `/sw.js` is served with the right type and not cached by the API route.
- [ ] **Step 3: Final review** by a fresh reviewer against the Review Focus; fix Critical and Important test-first; ledger the rest.
- [ ] **Step 4: Commit** `docs: document offline use`, push, open the PR (base `step-4-shopping` if #5 is unmerged).
