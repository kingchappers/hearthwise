# Phase 1, Step 1: Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Hearthwise repository as a copy of Hoardwise's scaffolding with the budgeting domain removed, a Store that supports conditional updates, Hearthwise's brand, and an empty signed-in shell, so steps 2–7 have a green base to build on.

**Architecture:** Copy pinned files from Hoardwise (`~/Projects/hoardwise` at commit `b50544f`), trim what the design says to drop, and write only the genuinely new pieces test-first: the Store `update` op, `clampClientTime`, and the brand tokens. Everything else is copy-then-trim, verified by the copied test suites.

**Tech Stack:** TypeScript (strict), React 19 + React Router v8 SPA (`ssr: false`), Mantine 8, Tailwind 4, Vitest 4, AWS Lambda + API Gateway, single-table DynamoDB / SQLite / in-memory Store, OpenTofu, Node 24, Yarn 1.22.

**Spec:** `docs/designs/phase-1-foundation.md`. This plan covers its **Step 1** (items 1–13 and 9a, 3a, 3b). Steps 2–7 get their own plans. Item numbers below refer to the spec's "Detailed Implementation Plan".

## Global Constraints

- Package `name: "hearthwise"`, `license: "AGPL-3.0-or-later"`, `.nvmrc` = `24`.
- Copy from Hoardwise **only at commit `b50544f`**, never from its working tree: `git -C ~/Projects/hoardwise archive b50544f <paths> | tar -x -C ~/Projects/hearthwise`. Anything the spec doesn't name is not copied.
- **Never modify anything under `~/Projects/hoardwise`.**
- An attribute that isn't set is left out of an item, never stored as `null`. `expiresAt` is epoch **seconds**.
- AWS: same account and region as Hoardwise (`eu-west-2`); table `hearthwise-data` (`PK`/`SK`, TTL on `expiresAt`, `PAY_PER_REQUEST`); SSM parameter `/hearthwise/vapid-private-key` (**never** `/budget-app/...`); state key `hearthwise/terraform.tfstate` in Hoardwise's bucket; CI role `hearthwise-github-actions`. No real `terraform.tfvars`, no `.terraform/`, no `*.zip` committed.
- Brand: warm palette only, **no red "attention" colour**; text contrast threshold 4.5:1.
- Wording: nothing in the UI reads "overdue", "missed" or "streak".
- Commits: conventional (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`), imperative, under 72 characters, ending with the attribution trailer from the session's system-reminder.
- Never read, commit or log secrets. Work on a branch `step-1-scaffold` (created at execution time via `superpowers:using-git-worktrees`), not on `main`.
- Each task leaves `yarn tsc` and `yarn test` green. `yarn typecheck` (which runs `react-router typegen`) and `yarn build` first go green at Task 6, when `app/` exists, and stay green through Task 7.

## Review Focus

The spec is silent on these inputs. Each is pinned by a test in the task named in brackets.

1. **Store `update` given `undefined` or `null` values.** A `set` value of `undefined` is dropped, never stored as `null`, on all three stores; an `ifEquals` entry whose value is `undefined` is rejected (use `ifMissing`). [Task 2]
2. **Malformed `update` ops:** no `set` and no `remove` after dropping undefineds; the same attribute in `set` and `remove`; `PK`/`SK` named in `set` or `remove`; the same item twice in one transaction (including `put` + `update`). Each throws a plain `Error`, never a silent no-op. [Task 2]
3. **`clampClientTime` with a non-finite timestamp** (`NaN`, `Infinity`). `NaN` would serialise to `null` and break the no-nulls rule, so it throws `RangeError`. [Task 3]
4. **A leftover Hoardwise identifier** (`budget-app`, `hoardwise`) in infra, scripts, container or source, which could point a Hearthwise deploy at Hoardwise's live resources. [Task 5, repeated in Task 7]
5. **Dark-mode brand text** failing contrast, and a red creeping into the palette. [Task 6]

---

### Task 1: Tooling baseline and Store copy

**Files:**
- Create (copied from `b50544f`, then trimmed): `package.json`, `yarn.lock`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`, `vite.config.ts`, `react-router.config.ts`, `postcss.config.cjs`, `.nvmrc`, `.dockerignore`, `LICENSE`
- Create: `src/store/{types,index,dynamo,sqlite,memory,patch,testing,backup}.ts`, `src/store/__tests__/{contract,dynamo.contract,dynamo,init,memory.contract,memory,sqlite.contract,sqlite,store,backup}.test.ts` (`contract.ts` keeps its name)
- Modify: `.gitignore`
- Not in this task: `src/store/cli.ts` and `cli.test.ts` (they import auth; they land in Task 4); `transfer.ts` and its tests (dropped)

**Interfaces:**
- Produces: the `Store` interface, `TxOp`, `ConditionFailedError`, `MemoryStore`, `SqliteStore`, `DynamoStore`, `initStore()` exactly as Hoardwise has them. Task 2 extends `TxOp`.

- [ ] **Step 1: Copy the pinned files.** Run the `git archive` command from Global Constraints for the files listed above (use `src/store` as one path, then delete `src/store/{cli,transfer}.ts` and `src/store/__tests__/{cli,transfer,transfer.dynamo}.test.ts`).

- [ ] **Step 2: Edit `package.json` per item 1.** Set `name`/`license`; scripts exactly as the spec lists (`build` = `react-router build && node scripts/build-static-handler.cjs && node scripts/build-api-handler.cjs && node scripts/build-push-handler.cjs`; keep `dev`, `start`, `typecheck`, `test`, `test:watch`, `build:container`, `store-cli`; add `test:e2e` = `playwright test`; drop `build:demo`, `docs:generate`, `screenshots`). Remove dependencies `@mantine/charts`, `@modelcontextprotocol/server`, `recharts`; remove devDependencies `@seriousme/openapi-schema-validator`, `ajv`, `ajv-formats`, `ical.js`, `sharp`, `yaml`. Add `uuid` (dep), `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `idb-keyval` (deps), `@aws-sdk/client-sns`, `vite-plugin-pwa`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `@playwright/test` (devDeps). Keep `resolutions` and the Hoardwise versions of everything else. Remove `playwright` only if `@playwright/test` replaces it (it does; `@playwright/test` depends on it).

- [ ] **Step 3: Trim configs.** `vite.config.ts`: delete the `stubServerStores` plugin, its comment and the `node:path`/`Plugin` imports it needs. `vitest.config.ts`: keep the `api` and `app` projects, add `exclude: ['e2e/**']` to `app`, and add `coverage: { provider: 'v8', thresholds: { 'src/shared/schedule.ts': { branches: 100 }, 'src/tasks/completions.ts': { branches: 100 }, 'src/tasks/ownership.ts': { branches: 100 }, 'src/shopping/items.ts': { branches: 100 } } }`. If `yarn vitest run --coverage` later errors because those files don't exist yet, move each threshold into the step that creates its file (steps 3 and 4) and note the deviation in `docs/DECISIONS.md` (Task 7). `react-router.config.ts`: replace the demo comment on `buildDirectory` (keep `process.env.BUILD_DIR ?? "build"`).

- [ ] **Step 4: Merge `.gitignore`.** Replace the file with Hoardwise's, keeping the existing first entry `design_draft.md` (with its comment) and keeping `vapid.json`. Confirm `.env`, `*.tfvars` (with `!*.tfvars.example`), `build/`, `*.sqlite*`, `.terraform/`, `infra/*.zip`, `*.tfstate*`, `.worktrees/` are covered.

- [ ] **Step 5: Install and run the copied store tests against all three stores.**
  Run: `yarn install && docker run -d --rm -p 8000:8000 --name ddb-local amazon/dynamodb-local` then `DYNAMODB_ENDPOINT=http://localhost:8000 yarn vitest run --project api src/store && yarn tsc`
  Expected: all store tests pass (memory, SQLite, DynamoDB Local contract runs) and `tsc` reports no errors. Stop the container afterwards: `docker stop ddb-local`.

- [ ] **Step 6: Commit.**
  ```bash
  git add -A && git commit -m "chore: add tooling baseline and copy store from Hoardwise"
  ```

---

### Task 2: Store conditional `update` (item 2, new code)

**Files:**
- Modify: `src/store/types.ts`, `src/store/patch.ts`, `src/store/memory.ts`, `src/store/sqlite.ts`, `src/store/dynamo.ts`
- Test: `src/store/__tests__/contract.ts` (shared by all three stores), `src/store/__tests__/dynamo.test.ts` (stubbed client), `src/store/__tests__/patch.test.ts` (create)

**Interfaces:**
- Consumes: `planPatch`, `matchesAll` from `patch.ts`; `ConditionFailedError(failedIndex?)`.
- Produces (later steps rely on these exact shapes):
  ```ts
  // types.ts: third TxOp variant
  | { update: Key; set?: Record<string, unknown>; remove?: string[];
      ifEquals?: Record<string, unknown>; ifMissing?: string[]; mustExist?: boolean }
  // patch.ts
  export interface UpdatePlan { set: [string, unknown][]; remove: string[]; ifEquals: [string, unknown][]; ifMissing: string[]; mustExist: boolean }
  export function planUpdate(op: Extract<TxOp, { update: Key }>): UpdatePlan   // validates; throws Error
  export function matchesMissing(current: Record<string, unknown> | undefined, names: string[]): boolean
  // dynamo.ts
  constructor(client: Sender, table: string, retry?: { sleep?: (ms: number) => Promise<void>; random?: () => number })
  ```
- Semantics: `mustExist` defaults to `true` (an update on a missing item fails with `ConditionFailedError(index)`); with `mustExist: false` a missing item is created from `set`. Conditions are checked against the pre-transaction state; if any op fails nothing is written. `set` values of `undefined` are dropped. `ifMissing` is satisfied only by an absent attribute (never by a stored `null`, which the store never writes). A `TransactionCanceledException` whose reasons include `ConditionalCheckFailed` becomes `ConditionFailedError` and is **not** retried; otherwise, if the reasons include `TransactionConflict`, the DynamoDB store retries up to 3 times with jittered backoff (`sleep(random() * 50 * 2 ** attempt)`), then throws the original error.

- [ ] **Step 1: Write the failing `planUpdate` tests** in `src/store/__tests__/patch.test.ts`: `planUpdate({ update: k, set: { a: undefined } })` throws `/needs at least one/`; `set` and `remove` both naming `a` throws `/both set and remove/`; `set: { PK: 'x' }` and `remove: ['SK']` each throw `/key attribute/`; `ifEquals: { a: undefined }` throws `/use ifMissing/`; a valid op returns `mustExist: true` by default and drops `undefined` set values.

- [ ] **Step 2: Run them to see them fail.**
  Run: `yarn vitest run src/store/__tests__/patch.test.ts`
  Expected: FAIL, `planUpdate` is not exported.

- [ ] **Step 3: Implement `planUpdate` and `matchesMissing` in `patch.ts`**, reusing `planPatch`'s key-attribute check and `definedEntries`. Add the `update` variant to `TxOp` in `types.ts`.

- [ ] **Step 4: Run `patch.test.ts`; expect PASS.**

- [ ] **Step 5: Write the failing contract tests** in `contract.ts` (one `describe('transact update')` block, run by all three stores). Each is one test with the assertion shown:
  - `ifEquals` passes when the attribute matches and throws `ConditionFailedError` with `failedIndex` 0 when it doesn't
  - `ifMissing` passes for an absent attribute and fails for a present one; an item with an attribute removed by an earlier update satisfies `ifMissing`
  - an update on a missing item fails (`failedIndex` 0) by default, and creates the item with `mustExist: false`
  - a stored item never gains a `null`: after `set: { a: undefined, b: 1 }`, `Object.keys(item)` contains `b` and not `a`
  - `remove: ['a']` deletes the attribute (`'a' in item === false`), and `remove: ['expiresAt']` on a SQLite item clears its TTL column (the row is not purged by `purgeExpired` afterwards)
  - atomicity: `[put new item, update with a failing condition]` throws with `failedIndex` 1 and the new item does not exist; reversed order throws `failedIndex` 0 and writes nothing
  - an update plus a `put` on the same key in one `transact` throws `/same item twice/`
  - each malformed op from Review Focus 2 rejects with an `Error` (not `ConditionFailedError`)

- [ ] **Step 6: Run the contract suite; expect FAIL** on all three stores.
  Run: `DYNAMODB_ENDPOINT=http://localhost:8000 yarn vitest run --project api src/store`
  (start DynamoDB Local as in Task 1 step 5.)

- [ ] **Step 7: Implement `update` in `memory.ts` and `sqlite.ts`.** Extend the same-item-twice check to `update` keys. Memory: check every op's conditions first (as it does now), then apply. SQLite: inside the existing `BEGIN IMMEDIATE` transaction, read the row, check, then write through the existing `write()` so `expires_at` stays in sync (including when `expiresAt` is removed). Compute the new attributes as `{ ...current, ...set }` minus `remove`.

- [ ] **Step 8: Implement `update` in `dynamo.ts`.** Translate to a `TransactWriteItems` `Update` using `ExpressionAttributeNames`/`Values` placeholders for every attribute: `SET`/`REMOVE` clauses from the plan; condition = `attribute_exists(PK)` (when `mustExist`) `AND` `#e = :e` per `ifEquals` `AND` `attribute_not_exists(#m)` per `ifMissing`. Add the `TransactionConflict` retry from the Semantics block inside `transact`, via the injected `retry` options (defaults: real `setTimeout`, `Math.random`).

- [ ] **Step 9: Write and run the stubbed-client DynamoDB tests** in `dynamo.test.ts`: the sent `Update` carries the expected `UpdateExpression`/`ConditionExpression`; a `TransactionConflict` cancellation followed by success resolves after exactly 2 sends, with `sleep` called once; four consecutive conflicts throw after exactly 4 sends (1 + 3 retries); a `ConditionalCheckFailed` cancellation throws `ConditionFailedError` after exactly 1 send.

- [ ] **Step 10: Run everything; expect PASS.**
  Run: `DYNAMODB_ENDPOINT=http://localhost:8000 yarn vitest run --project api src/store && yarn tsc`

- [ ] **Step 11: Commit.**
  ```bash
  git add src/store && git commit -m "feat: add conditional update to Store transactions"
  ```

---

### Task 3: API core, auth and time helpers (items 3, 3a, 3b)

**Files:**
- Create (copied, then trimmed): `src/api/{router,routes,apiRoutes,http,db,dates,constants,types}.ts`; `api-handler.ts`; `src/auth/{index,auth0,local,localData,password,passwordAttempts,failureLimiter,cookies,routes,setupCode,types,prompt}.ts`; `src/push/select.ts`; and the `__tests__` files for each of these that still apply
- Create: `push-handler.ts` (new no-op), `src/api/__tests__/dates.test.ts` additions
- Not copied: `tokenAuth.ts`, `tokens.ts`, `src/api/{tokens,tokenRouter,docs,oauthConsent,passwordGate}.ts`, everything under `src/mcp`, `src/oauth`, `src/demo`, and every budgeting module in `src/api`

**Interfaces:**
- Consumes: `Store`, `initStore` (Task 1).
- Produces:
  ```ts
  // src/api/dates.ts
  export function clampClientTime(clientMs: number, serverMs: number): number   // min(clientMs, serverMs + 5 min); throws RangeError if clientMs is not finite
  export function isValidTimeZone(value: unknown): value is string              // moved here from Hoardwise's src/api/push.ts (step 2 needs it; step 6 re-copies push.ts without it)
  // src/push/select.ts: localMoment(now: Date, timeZone: string), isQuietHour(hour, quietStart, quietEnd), sendHour(settings) + their tests
  // src/api/apiRoutes.ts: registerApiRoutes(router) with GET /api/health only (push routes register here in step 6)
  ```

- [ ] **Step 1: Write the failing `dates` tests.** `clampClientTime(now + 3_600_000, now)` equals `now + 300_000`; `clampClientTime(now - 1000, now)` equals `now - 1000`; `clampClientTime(Number.NaN, now)` and `Infinity` each throw `RangeError`. `isValidTimeZone('Europe/London')` is true; `'Mars/Olympus'`, `''`, `42` and `undefined` are false.

- [ ] **Step 2: Run them; expect FAIL** (`yarn vitest run src/api/__tests__/dates.test.ts`).

- [ ] **Step 3: Copy the pinned files** and trim per items 3, 3a, 3b:
  - `routes.ts`: empty the route table except `GET /api/health`. `apiRoutes.ts`: drop docs, OAuth-consent and token routes; keep an empty push registration point. Delete the budgeting handler tests; rewrite `src/api/__tests__/routes.test.ts` to assert `GET /api/health` returns 200 and an unknown route returns 404.
  - `api-handler.ts`: remove the `tokenRouter`, `tokenAuth`, `tokens`, `mcp`, `oauth` imports, the token/oauth limiters and `handleTokenRequest`; the handler authenticates with `initAuth()` and dispatches to the router only.
  - `db.ts`: keep `pk`, `PUSH_INDEX_PK`, `pushSubscriptionSk`; remove budgeting key helpers. `dates.ts`: keep only local-date helpers; add the two functions above.
  - `src/auth`: remove token imports from `local.ts` and `routes.ts` (`tokens.ts` also imports `src/oauth/types`, which is gone); drop `tokenAuth.test.ts`/`tokens.test.ts`; keep the rest. Single-account behaviour stays unchanged (step 2 changes it).
  - `select.ts`: delete `reminderFor`, `selectReminders` and their types and the four `../../app/lib/*` imports; keep `localMoment`, `isQuietHour`, `sendHour` and their tests.
  - `push-handler.ts`: `export const handler = async (): Promise<void> => { console.log('push scheduler: not implemented yet'); };`

- [ ] **Step 4: Implement the two helpers in `dates.ts`.** `isValidTimeZone` is Hoardwise's, moved verbatim (its own test moves with it). `clampClientTime` throws before comparing so `NaN` can never be returned.

- [ ] **Step 5: Run everything; expect PASS.**
  Run: `yarn tsc && yarn vitest run --project api`
  Expected: no type errors; all `src/api`, `src/auth`, `src/push`, `src/store` tests pass. Fix type errors by deleting dead imports, never by stubbing budgeting code back in.

- [ ] **Step 6: Commit.**
  ```bash
  git add -A && git commit -m "feat: add API core and auth copied from Hoardwise, plus time helpers"
  ```

---

### Task 4: Static Lambda, build scripts, Store CLI and container (items 4, 5, 6, and `cli.ts` from item 2)

**Files:**
- Create (copied, then trimmed): `src/static/` (as is), `scripts/{build-static-handler,build-api-handler,build-push-handler,build-container,build-store-cli}.cjs`, `scripts/setup-vapid-keys.sh`, `scripts/container-smoke.mjs`, `container/{adapter,bin,caddy,config,main,maintenance,recovery,server}.ts`, `container/__tests__/*`, `Dockerfile`, `compose.example.yml`, `compose.plain.example.yml`, `store-cli.ts`, `src/store/cli.ts`, `src/store/__tests__/cli.test.ts`
- Modify: `src/auth/__tests__` as needed for the SQLite file rename

**Interfaces:**
- Consumes: Task 3's auth and API modules.
- Produces: `yarn build` outputs `build/static`, `build/api`, `build/push` bundles; `yarn build:container` produces the container bundle; `yarn store-cli backup --out <file>`.
- Decision: in step 1, `reset-password` keeps Hoardwise's **single-account, no-argument** form minus the `revokeAllTokens` call. The spec's item 2 describes the email-argument form, but that depends on `deleteSessionsForUser` (item 14, step 2); step 2 changes the command.

- [ ] **Step 1: Copy the pinned files** and trim per items 4–6: rename the SQLite file to `hearthwise.sqlite` and remove `LEGACY_SQLITE_FILE`/`chooseSqliteFile`'s fallback (`chooseSqliteFile` becomes a plain path join; update `cli.ts` and its tests); `recovery.ts` keeps `createCodeHooks` only (remove `consumeResetMarker` and its call in `server.ts`); `server.ts` serves `/config.json` as `{ auth: 'local' }`; `src/store/cli.ts` keeps only `backup` and `reset-password` (remove `export`/`import`, the `transfer` import, `revokeAllTokens`, and the Hoardwise AWS-to-self-hosted migration text from `USAGE`).

- [ ] **Step 2: Trim the build scripts.** App name and output paths become Hearthwise. Do not copy `sdk-runtime-deps.cjs`; each bundle script names its own runtime packages: API Lambda `jsonwebtoken`, `jwks-rsa`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` (steps 2 and 6 add `@aws-sdk/client-sns`, `@aws-sdk/client-ssm`, `web-push`). `build-push-handler.cjs` builds the no-op `push-handler.ts` with Hoardwise's runtime packages. `build-static-handler.cjs` still writes `config.json`. `setup-vapid-keys.sh` uses `/hearthwise/vapid-private-key`. Not copied: `api-docs.mjs`, `generate-api-docs.mjs`, `build-demo.cjs`, `check-demo-build.mjs`, `demo-smoke.mjs`, `screenshots/`, `local-auth-check/`.

- [ ] **Step 3: Adapt `container-smoke.mjs`** to this step's reachable behaviour: start the built container, `GET /api/health` returns 200, `GET /config.json` returns `{ auth: 'local' }`, and the first-run setup with the printed setup code succeeds. (Steps 2 and 3 extend it.)

- [ ] **Step 4: Run the checks.**
  Run: `yarn tsc && yarn vitest run --project api && yarn build:container && node scripts/container-smoke.mjs`
  Expected: no type errors, tests pass, the container bundle builds and the smoke script exits 0. If Docker is available, also `docker build -t hearthwise:dev .` (expected: succeeds). `yarn build` is not expected to pass yet (no `app/`).

- [ ] **Step 5: Guard against Hoardwise leftovers.**
  Run: `grep -rniE "budget-app|hoardwise|hoard\b" container scripts src api-handler.ts push-handler.ts store-cli.ts Dockerfile compose*.yml`
  Expected: no matches except explanatory comments that say "as in Hoardwise" (list any you keep in the commit message).

- [ ] **Step 6: Commit.**
  ```bash
  git add -A && git commit -m "feat: add static Lambda, build scripts, store CLI and container"
  ```

---

### Task 5: OpenTofu infrastructure (item 7)

**Files:**
- Create (copied, then trimmed): `infra/{main,variables,dynamodb,lambda,api-lambda,push-lambda,logs}.tf`, `infra/initialSetup/*.tf`, `infra/initialSetup/README.md`, `infra/terraform.tfvars.example`, `infra/backend.hcl`, `infra/.terraform.lock.hcl`, `infra/initialSetup/.terraform.lock.hcl`
- Not copied: `.terraform/`, any `terraform.tfvars`, any `*.zip`

**Interfaces:**
- Consumes: the `build/api`, `build/push`, `build/static` bundle paths from Task 4.
- Produces: resources named `hearthwise-*`; API Gateway routes `ANY /api/{proxy+}`-style routes **plus `PATCH /api/{proxy+}`** to the API Lambda; role `hearthwise-github-actions`.

- [ ] **Step 1: Copy and rename.** `app_name = "hearthwise"`; table `hearthwise-data` (resource `hearthwise_data`); remove the MCP and OAuth routes and variables from `lambda.tf`; add the `PATCH /api/{proxy+}` route to the API Lambda integration (Hoardwise has no PATCH route, so PATCH would otherwise reach the static Lambda).

- [ ] **Step 2: `initialSetup/`.** Read Hoardwise's state bucket and GitHub OIDC provider as `data` sources (do not create or modify them). Create only the role `hearthwise-github-actions`, trusted for the Hearthwise repository only (`repo:kingchappers/hearthwise:*` as the `sub` condition) and limited to `hearthwise-*` resources and the `/hearthwise/*` SSM path.

- [ ] **Step 3: Backend and examples.** `backend.hcl` uses Hoardwise's bucket (copy the value from Hoardwise's `infra/backend.hcl`) with key `hearthwise/terraform.tfstate`. `terraform.tfvars.example` documents every variable with placeholder values only.

- [ ] **Step 4: Validate offline.**
  Run: `cd infra && tofu init -backend=false && tofu validate && tofu fmt -check -recursive && cd initialSetup && tofu init -backend=false && tofu validate`
  Expected: `Success! The configuration is valid.` for both, and `fmt -check` prints nothing.

- [ ] **Step 5: Guard checks.**
  Run: `grep -rniE "budget-app|hoardwise" infra --include=*.tf --include=*.hcl --include=*.example` and `grep -c "PATCH" infra/lambda.tf`
  Expected: the first prints nothing; the second prints at least `1`. Also confirm `git status --short infra` shows no `.zip`, `.terraform/` or `terraform.tfvars`.

- [ ] **Step 6: Commit.** Do **not** run `tofu apply`; deployment is a later, human-run step (documented in step 7). Add the post-apply smoke check to `infra/initialSetup/README.md`: `curl -X PATCH https://<api>/api/health` returns 405 from the router, not the SPA's HTML.
  ```bash
  git add infra && git commit -m "feat: add OpenTofu infrastructure for the shared AWS account"
  ```

---

### Task 6: Brand and signed-in shell (items 8, 9, 9a, 10, 11)

**Files:**
- Create (copied, then trimmed): `app/root.tsx`, `app/entry.client.tsx`, `app/routes.ts`, `app/app.css`, `app/routes/{_index,settings}.tsx`, `app/components/layout/{DefaultLayout,LoadError,SaveStatus,ResponsiveSheet,ToastAction,TextSize,ReduceMotion,ColorSchemeToggle,SignedOutPanel,Logo}.tsx`, `app/lib/{api,auth,runtimeConfig,session,sessionLifetime,localAuth,preferences,textSize,undoDuration,apiError,pageTitle,contrast,types}.ts(x)`, `app/hooks/{useProtectedApi,useDocumentTitle}.ts`, `app/components/authentication/` (with its tests), `app/test-utils/`, `app/__tests__/{touchTargets,theme,fixedLayers,errorBoundary,renderBlocking,decisionText}.test.ts(x)`
- Create: `app/lib/brand.ts`, `docs/brand.md`, `public/{manifest.webmanifest,favicon.svg,favicon.ico,apple-touch-icon.png,icons/,splash/}`, `docs/brand/logo/`
- Not copied: `useSaveWithUndo`, `useUndoableDelete`, `offlineQueue`, `flushQueue`, `trash`, `queries`, `oldNames.test.ts`, any budgeting route or component

**Interfaces:**
- Consumes: `contrastRatio(hexA: string, hexB: string): number` from `app/lib/contrast.ts`.
- Produces:
  ```ts
  // app/lib/brand.ts (Mantine tuples + BRAND, same shape as Hoardwise's)
  export const hearth: MantineColorsTuple; export const ember: MantineColorsTuple
  export const sage: MantineColorsTuple;   export const gray: MantineColorsTuple; export const dark: MantineColorsTuple
  export const BRAND: { ink: '#2A1E18'; ash: '#FAF6F2'; surface: '#1E1815'; darkHearthText: '#E8957A'; darkEmberText: '#E3B65C'; darkSageText: '#8FBF98' }
  // app/root.tsx still exports `theme` and `cssVariablesResolver` (the copied theme.test.ts imports them)
  ```
  Tuples are exactly the spec's item 9a values (index 6 of `hearth`=`#9C3D22`, `ember`=`#8A5A12`, `sage`=`#3F6448`, `gray`=`#5E524A`; `dark` index 7 is `#1E1815`). Navigation: Today, Shopping, Settings.

- [ ] **Step 1: Write the failing brand test** (rewrite the copied `app/__tests__/theme.test.ts` against the new tokens; `BRAND.mist` becomes `BRAND.ash`, `BRAND.pine` becomes `BRAND.ink`, and the page/card variables are `BRAND.ash` and white). Add `app/__tests__/brand.test.ts` asserting, with `contrastRatio`:
  - `hearth[6]` on `#FFFFFF` and on `BRAND.ash` ≥ 4.5; `ember[6]` and `sage[6]` on `#FFFFFF` ≥ 4.5; `gray[6]` on `BRAND.ash` ≥ 4.5; `BRAND.ink` on `BRAND.ash` ≥ 4.5
  - `BRAND.darkHearthText`, `darkEmberText`, `darkSageText` on `BRAND.surface` ≥ 4.5, and each is also ≥ 4.5 on `dark[6]`
  - the spec's checked figures hold to one decimal (6.8, 6.3, 5.9, 6.7, 7.0, 15.1, 7.5, 9.3, 8.4), so a mistyped hex fails
  - the module's palette exports are exactly `hearth`, `ember`, `sage`, `gray`, `dark` (no `red` or other attention colour), and each tuple has 10 entries

- [ ] **Step 2: Run it; expect FAIL** (`yarn vitest run --project app app/__tests__/brand.test.ts`: `~/lib/brand` doesn't exist).

- [ ] **Step 3: Create `app/lib/brand.ts`** with the exact tuples and `BRAND` from item 9a. Write `docs/brand.md` with the token table, the checked contrast figures and a description of the mark (item 11).

- [ ] **Step 4: Copy and trim the shell** per items 8–10. `root.tsx`: remove the `./demo/flag` import and demo branch; theme comes from `brand.ts`, `black = BRAND.ink`, body colour `BRAND.ash`. `entry.client.tsx`: remove the guarded demo import. `DefaultLayout.tsx`: remove `TransactionSheet`, `QuickEntryTips`, `LaunchIntent`, `OfflineQueueBanner`, `GuidedTour`, `connectReturn`, `months`, `useNavTarget`, `isDemo`; three nav entries. `settings.tsx`: keep text size, reduced motion, colour scheme, undo duration, sign-out. `_index.tsx`: an empty "Today" page. `api.ts`: remove budget calls and types; every `fetch` gets `signal: AbortSignal.timeout(10_000)` (test: a fetch that never resolves rejects with `TimeoutError` after 10 s under fake timers). `Logo.tsx` renders the mark.

- [ ] **Step 5: Create PWA assets.** `manifest.webmanifest`: name and short name "Hearthwise", `start_url: "/"`, `theme_color: "#2A1E18"`, `background_color: "#FAF6F2"`. Draw the mark (single-colour arch with a small flame, `ember[4]` for the flame) as `favicon.svg` and the `docs/brand/logo/` variants (light, dark-background, `currentColor`). Generate `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.ico` and the five `apple-splash-*` sizes Hoardwise has, with a **throwaway script in the scratchpad** that installs `sharp` there (not in this repo; the spec removes `sharp` from devDependencies). Final art is out of scope.

- [ ] **Step 6: Run the full step-level checks.**
  Run: `yarn typecheck && yarn test && yarn build && yarn build:container`
  Expected: all four succeed. Then `yarn dev`, open the app in the browser, and confirm the signed-out panel renders, the Today/Shopping/Settings navigation is present and no console errors appear (use the `run` skill or the Playwright MCP; report what you saw).

- [ ] **Step 7: Commit.**
  ```bash
  git add -A && git commit -m "feat: add Hearthwise brand and empty signed-in shell"
  ```

---

### Task 7: CI and documentation (items 12, 13)

**Files:**
- Create (copied, then trimmed): `.github/workflows/{yarnBuild,codeql,container,trivy-weekly}.yml`, `.github/CODEOWNERS`, `.trivyignore` (if Hoardwise's lists nothing app-specific, copy as is; otherwise start empty)
- Create: `CLAUDE.md`, `README.md`, `SECURITY.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`

**Interfaces:**
- Consumes: scripts from Task 1 and 4 (`yarn test`, `yarn build`, `yarn build:container`).

- [ ] **Step 1: Copy and trim the workflows.** Remove `demo.yml` and, from `yarnBuild.yml`, the `check-demo-build` step and the `build:demo` step (Hoardwise lines 78–82). Keep: install, the high/critical audit gate, tests with the DynamoDB Local service and `DYNAMODB_ENDPOINT`, build, container build, CodeQL, weekly Trivy. Change `TF_VAR_app_name` to `hearthwise` and the assumed role to `hearthwise-github-actions` (account id, region and state bucket are the same values Hoardwise's workflow uses; copy them from it, do not retype them). Drop the `VITE_VAPID_PUBLIC_KEY` build env (step 6 moves the key to `/config.json`). Add `yarn vitest run --coverage` to the test step only if Task 1 step 3 confirmed thresholds work without their files.

- [ ] **Step 2: Write the docs.** `LICENSE` is already in place (Task 1). `CLAUDE.md`: commands and architecture in the same format as Hoardwise's, describing Hearthwise as built so far (do not describe later steps as done). `README.md`: what Hearthwise is, status "phase 1 in progress", link to the design. `ROADMAP.md`: phase 1 steps 1–7, then phases 2–5 and the unscheduled Hoardwise integration, as in the spec. `DECISIONS.md`: the spec's decisions table plus the Stage 9 decisions (same AWS account, new palette, AGPL, Auth0 Action key made by hand), plus any deviations recorded during this step (the `isValidTimeZone` move, the step-1 `reset-password` form, any coverage-threshold change). `SECURITY.md`: adapt Hoardwise's with Hearthwise's name and repository.

- [ ] **Step 3: Whole-step verification.**
  Run: `yarn install --frozen-lockfile && yarn typecheck && yarn test && yarn build && yarn build:container && grep -rniE "budget-app|hoardwise" infra scripts container src app .github --include=* -l`
  Expected: everything passes; the grep lists no file other than Hoardwise-referencing comments or `docs/`. Confirm `git status --short` is clean apart from the commit and `git ls-files | grep -E "\.(zip|tfstate)$|terraform\.tfvars$|^\.env"` prints nothing.

- [ ] **Step 4: Commit.**
  ```bash
  git add -A && git commit -m "chore: add CI workflows and project documentation"
  ```

- [ ] **Step 5: Hand off.** Push the branch and open the step 1 PR (`gh pr create`) only after the user confirms; the PR description lists the deviations from the spec recorded in `docs/DECISIONS.md`. `tofu apply` and the post-apply PATCH smoke check are for the user to run.
