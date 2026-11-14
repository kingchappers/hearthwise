# Phase 1, Step 2: Accounts, Households and Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people can sign in to their own accounts, belong to one household, and see the same (empty) shell: multi-account local login, households, a membership guard on every household route, one-time invite links, member removal, and sign-up alerts.

**Architecture:** Server domain modules in `src/household/` and `src/security/`, using the Step 1 Store `update` op for every multi-item change. Household routes sit behind a `withHousehold` guard that reads the caller's membership; the household id never comes from the request. Local login is rebuilt around per-email accounts, and recovery-by-flag is removed. The client adds a welcome page, a join page, a members section in Settings and a gate in the layout.

**Tech Stack:** TypeScript (strict), Vitest, React Router + TanStack Query, Mantine, AWS SNS (alerts), OpenTofu.

**Spec:** `docs/designs/phase-1-foundation.md`. This plan covers its **Step 2** (items 14, 15, 16, 16a, 17, 18, 19) and CUJs 1, 10 and 11. Item 21a's validation table is started here for the fields Step 2 needs and extended in Step 3.

## Global Constraints

- An attribute that isn't set is left out of an item, never stored as `null`. `expiresAt` is epoch **seconds**.
- Household data keys (spec "Data model"): membership `USER#<userId>`/`MEMBERSHIP`; household `HH#<hid>`/`META`; member `HH#<hid>`/`MEMBER#<userId>`; invite `INVITE#<sha256 hex>`/`META`; open-invite pointer `HH#<hid>`/`INVITE#<sha256 hex>`.
- Invite token: 32 random bytes as base64url (43 characters); only its SHA-256 hex is stored; link `https://<host>/join#<token>` (fragment, so it never reaches logs); expires after **7 days**; single use; a household holds at most **2** members.
- Error bodies: `{ error: '<code>' }` plus extras. Codes and statuses: `no_household` 403, `invalid` 400 (with `field`), `invite_expired` 410, `household_full` 409, `already_member` 409 (with `canMove`), `email_taken` 409, `forbidden` 403, `not_found` 404.
- Validation limits: `displayName` 1-40 characters after trimming; hours are integers 0-23; `defaultView` is `list` or `next`; password 12-128 characters; email at most 254 characters.
- Default member settings: `digest: { on: false, hour: 19 }`, `dueNudges: { on: false, hour: 8 }`, `quietHours: null`, `defaultView: 'list'`.
- Local login: no open sign-up after first-run setup; `store-cli reset-password <email>` never reopens setup; Hoardwise's recovery flag is not carried over. Throttle rows expire after 1 day.
- Alerts carry ids and the event type, never emails or names. A failed publish is logged and never fails the request.
- Wording: nothing in the UI reads "overdue", "missed" or "streak"; no red.
- Commits are conventional, imperative, under 72 characters, ending with the attribution trailer from the session's system-reminder. Work on branch `step-2-accounts`. Every task leaves `yarn typecheck` and `yarn test` green.

## Decisions made in this plan (the spec is silent or inconsistent)

- `POST /api/invites/accept` and `POST /api/households` both take a `displayName` in the body (spec item 17 lists only `{ token, confirmMove? }`, but item 16's `acceptInvite` needs it). The client prefills it from the Auth0 profile or the local account.
- Local accounts store a default `displayName`, returned by `GET /api/auth/me`, so the welcome form can prefill it in local mode.
- The router gains `patch` now (Step 1 deferred it to the first PATCH route, which is `PATCH /api/hh/members/me`) and decodes path parameters, so `auth0%7Cabc` reaches handlers as `auth0|abc`. A malformed escape is a 400.
- Household names are 1-60 characters (the spec gives none).
- After an Auth0 login the app always lands on `/` (`Auth0Provider` has no `onRedirectCallback`). So the layout gate, not Auth0, sends a signed-in person with a pending invite to `/join`.
- The IAM user for the Auth0 alert publisher, and the deploy role's SNS permissions, go in `infra/initialSetup` (applied by hand with admin credentials). The SNS topic and email subscription go in the main stack. The alert email comes from the repository variable `ALERT_EMAIL`, and the subscription must be confirmed by clicking the email AWS sends.
- Local-mode accounts created by Step 1 are not migrated (new key scheme); delete the SQLite file and set up again.
- **Auth0 sign-in on the deployed site is broken today** (author report, 2026-11-13): after "Sign in" the person lands on the home page with `?error=invalid_request&error_description=Client "<id>" is not authorized to access resource server "https://hearthwise-api"`. The cause is Auth0 tenant configuration (the SPA application has not been granted user access to the API), which no code change can fix; the author applies the settings in `docs/AUTH0.md`. The code fix in this step is that the app **shows** the sign-in error (and clears it from the address) instead of silently dropping the person on a signed-out home page, so a misconfiguration is visible and explained next time.

## Review Focus

Inputs the spec implies but no task's tests cover directly; each is pinned by a test in the task in brackets.

1. **Garbage invite tokens:** empty, too short or long, non-base64url, 10 KB of text. Expect `410 invite_expired` or `400 invalid`, never a 500, and no store key built from attacker-sized input. [Task 1, Task 4]
2. **Email variants and odd emails:** `ME@Example.com ` and `me@example.com` are one account; an email containing `#` or NUL, or over 254 characters, never produces a store key or a throttle row. [Task 5]
3. **Unknown email vs wrong password:** the same status and body, and a throttle on one email never locks another. [Task 5, Task 6]
4. **Member removal by encoded id:** `DELETE /api/hh/members/auth0%7Cabc` removes the right member; a malformed escape is 400; a user who isn't a member is 404; another household is never touched. [Task 1, Task 4]
5. **Races:** two simultaneous accepts, two simultaneous first-run setups, and an invited sign-up that fails midway each leave exactly one winner and no half-created state (no account without its membership, no membership without its member). [Task 4, Task 5]

---

### Task 1: Foundation: validation and router

**Files:**
- Create: `src/shared/household.ts`, `src/shared/validation.ts`
- Modify: `src/api/router.ts`, `src/api/http.ts`
- Test: `src/shared/__tests__/validation.test.ts` (create), `src/api/__tests__/router.test.ts` (extend)

**Interfaces:**
- Produces:
  ```ts
  // src/shared/household.ts
  export interface HourSetting { on: boolean; hour: number }
  export interface MemberSettings { digest: HourSetting; dueNudges: HourSetting; quietHours: { start: number; end: number } | null; defaultView: 'list' | 'next' }
  export const DEFAULT_SETTINGS: MemberSettings
  // src/shared/validation.ts
  export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string }
  export function parseDisplayName(value: unknown): Parsed<string>              // field 'displayName'
  export function parseHouseholdName(value: unknown): Parsed<string>            // field 'name', 1-60
  export function parseTimeZoneField(value: unknown): Parsed<string>            // field 'timezone', uses isValidTimeZone
  export function parseInviteToken(value: unknown): Parsed<string>              // /^[A-Za-z0-9_-]{43}$/, field 'token'
  export function parseMemberPatch(body: Record<string, unknown>): Parsed<{ displayName?: string; settings?: Partial<MemberSettings> }>
  export function parseMutationId(value: unknown): Parsed<string | undefined>   // absent is fine; present must be a UUID, field 'mutationId'
  // src/api/http.ts
  export function invalid(field: string): ApiResponse                           // 400 { error: 'invalid', field }
  // src/api/router.ts: Router gains patch(path, handler); dispatch decodes {params}
  ```

- [ ] **Step 1: Write the failing validation tests** (`validation.test.ts`), each at its edge and one past it: display name `''`, 40 characters ok, 41 not, whitespace-only not, trimmed on success; household name 60 ok / 61 not; hours `-1`, `0`, `23`, `24`, `1.5`, `'8'`; `defaultView` `'list'`, `'next'`, `'grid'`; `quietHours: null` ok, `{start:22,end:7}` ok, `{start:22}` not; an unknown key in the patch (`{ role: 'admin' }`) is `invalid` with that field; an empty patch `{}` is `invalid`; invite tokens: 43 valid characters ok, 42 and 44 not, `'+'` and `'='` not, `''`, `null`, a 10,000-character string not.
- [ ] **Step 2: Run them to see them fail.** Run: `yarn vitest run src/shared/__tests__/validation.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/shared/household.ts` and `src/shared/validation.ts`** to the signatures above.
- [ ] **Step 4: Write the failing router tests:** `router.patch` registers and dispatches `PATCH`; a `{userId}` parameter given `auth0%7Cabc` reaches the handler as `auth0|abc`; `%E0%A4%A` (malformed) answers 400 `{ error: 'invalid', field: 'path' }` without calling the handler; a parameter containing `%2F` stays one segment (`a/b` as a value, route still matches).
- [ ] **Step 5: Run to see them fail, implement** `patch` and decoding in `createRouter` (decode inside `dispatch`, each parameter once), and `invalid()` in `http.ts`.
- [ ] **Step 6: Run `yarn typecheck && yarn vitest run src/shared src/api`; expect PASS.**
- [ ] **Step 7: Commit** `feat: add validation helpers and PATCH routing with decoded params`.

---

### Task 2: Security events

**Files:**
- Create: `src/security/events.ts`
- Test: `src/security/__tests__/events.test.ts`
- Modify: `scripts/build-api-handler.cjs` (add `@aws-sdk/client-sns` to the API bundle's runtime packages)

**Interfaces:**
- Produces:
  ```ts
  export interface SecurityEvent { event: 'household_created' | 'invite_accepted' | 'user_first_seen'; userId: string; householdId?: string; at: string }
  export interface EventDeps { publish?: (message: string) => Promise<void>; log?: (line: string) => void }
  export function emitSecurityEvent(event: SecurityEvent, deps?: EventDeps): Promise<void>   // never throws
  ```
  The default `publish` is used only when `process.env.ALERT_TOPIC_ARN` is set; it imports `@aws-sdk/client-sns` lazily so the container never loads it.

- [ ] **Step 1: Write the failing tests:** one JSON log line per event with `event`, `userId`, `householdId`, `at`; with a topic ARN and a stub `publish`, one publish of that same JSON; no `publish` call when no topic is configured; a `publish` that rejects is logged (a line naming the event type, no payload) and `emitSecurityEvent` still resolves; an event object with extra fields (`email`, `displayName`) never has them in the log line or the published message (only the four known fields are copied).
- [ ] **Step 2: Run to see them fail; implement `emitSecurityEvent`** (copy only the known fields, `JSON.stringify`, log, then publish inside try/catch).
- [ ] **Step 3: Run `yarn vitest run src/security`; expect PASS.** Run `yarn build` to confirm the API bundle still builds.
- [ ] **Step 4: Commit** `feat: add security event logging and SNS alerts`.

---

### Task 3: Household core, guard and member settings

**Files:**
- Create: `src/household/{types,keys,households,guard,members}.ts`, `src/api/households.ts`
- Modify: `src/api/apiRoutes.ts`
- Test: `src/household/__tests__/{households,guard}.test.ts`, `src/api/__tests__/households.test.ts`

**Interfaces:**
- Consumes: `Store`, `MemoryStore`, `TxOp`; Task 1 validators and `invalid`; Task 2 `emitSecurityEvent`.
- Produces:
  ```ts
  // types.ts
  export interface HouseholdMeta { name: string; timezone: string; createdBy: string; createdAt: string; memberCount: number }
  export interface Member { userId: string; displayName: string; settings: MemberSettings; joinedAt: string; lastDigestSent?: string; lastNudgeSent?: string }
  export interface HouseholdContext { userId: string; householdId: string; household: HouseholdMeta; member: Member; members: Member[] }
  export class HouseholdError extends Error { constructor(readonly code: string, readonly status: number, readonly extra?: Record<string, unknown>) }
  // keys.ts
  export const hhPk: (householdId: string) => string
  export const membershipKey: (userId: string) => Key
  export const memberSk: (userId: string) => string
  // households.ts
  export function createHousehold(store: Store, input: { userId: string; name: string; timezone: string; displayName: string; nowMs?: number }, emit?: typeof emitSecurityEvent): Promise<{ householdId: string }>
  // guard.ts
  export function loadContext(store: Store, userId: string): Promise<HouseholdContext | undefined>
  export type HouseholdHandler = (event: APIGatewayProxyEventV2, ctx: HouseholdContext, params: Record<string, string>) => Promise<ApiResponse>
  export function withHousehold(handler: HouseholdHandler): Handler        // 403 { error: 'no_household' } when there is no membership
  // members.ts
  export function updateOwnMember(store: Store, ctx: HouseholdContext, patch: { displayName?: string; settings?: Partial<MemberSettings> }): Promise<Member>
  ```
- Routes registered here: `POST /api/households`, `GET /api/hh`, `PATCH /api/hh/members/me`. `GET /api/hh` returns `{ household, members, me }` (me = the caller's member record).

- [ ] **Step 1: Write the failing domain tests.** `createHousehold` writes META (`memberCount: 1`, `createdBy`), the creator's MEMBER with default settings, and MEMBERSHIP, in one transaction; a caller who already has a membership gets `HouseholdError('already_member', 409)` and nothing changes; two simultaneous creates by the same user leave exactly one household's META behind (no orphan); exactly one `household_created` event is emitted with no name or email in it; an invalid timezone is rejected at the handler, not the domain. `loadContext` returns the household, the caller and both members; returns `undefined` with no membership. `updateOwnMember` merges settings (patching `digest.hour` keeps `digest.on`) and leaves the other member untouched.
- [ ] **Step 2: Write the failing handler tests** (in-memory store, a fake Auth0-style `userId`): `GET /api/hh` is 403 `no_household` before creating, 200 after; a household id in the request body or query is ignored (the response is the caller's household); `POST /api/households` by a member is 409 `already_member`; `PATCH /api/hh/members/me` with `digest.hour: 24` is 400 `{ error: 'invalid', field: 'settings.digest.hour' }`, with an unknown key is 400, with a valid patch is 200 and persists; the optional `mutationId` is accepted when a UUID and ignored.
- [ ] **Step 3: Run to see them fail** (`yarn vitest run src/household src/api/__tests__/households.test.ts`).
- [ ] **Step 4: Implement** the modules to the signatures above. `loadContext` reads `MEMBERSHIP` with `consistent: true`, then queries `HH#<hid>` for `META` and `skPrefix: 'MEMBER#'`. `createHousehold` generates the id with `randomUUID()` and checks the timezone only in the handler. Register the routes in `apiRoutes.ts` (`POST /api/households` is authenticated but outside the guard).
- [ ] **Step 5: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 6: Commit** `feat: add households, the membership guard and member settings`.

---

### Task 4: Invites and member removal

**Files:**
- Create: `src/household/invites.ts`
- Modify: `src/household/members.ts`, `src/api/households.ts`, `src/api/apiRoutes.ts`
- Test: `src/household/__tests__/{invites,members}.test.ts`, extend `src/api/__tests__/households.test.ts`

**Interfaces:**
- Consumes: Task 3 types, keys, `loadContext`; `emitSecurityEvent`; `parseInviteToken`.
- Produces:
  ```ts
  export function inviteHash(token: string): string                                    // sha256 hex
  export function createInvite(store: Store, ctx: HouseholdContext, nowMs?: number): Promise<{ token: string; hash: string; expiresAt: number }>   // HouseholdError('household_full', 409) if memberCount is 2
  export function listInvites(store: Store, householdId: string, nowSeconds: number): Promise<{ hash: string; createdBy: string; expiresAt: number }[]>
  export function revokeInvite(store: Store, ctx: HouseholdContext, hash: string): Promise<void>   // 404 not_found if it is not this household's invite
  export function joinOps(invite: { hash: string; householdId: string }, userId: string, displayName: string, nowMs: number, opts?: { moveFrom?: string }): TxOp[]   // shared with Task 5
  export function acceptInvite(store: Store, input: { token: string; userId: string; displayName: string; confirmMove?: boolean; nowMs?: number }, emit?: typeof emitSecurityEvent): Promise<{ householdId: string }>
  // members.ts
  export function removeMember(store: Store, ctx: HouseholdContext, targetUserId: string): Promise<void>
  ```
- Routes: `POST /api/hh/invites`, `GET /api/hh/invites`, `DELETE /api/hh/invites/{hash}`, `DELETE /api/hh/members/{userId}`, `POST /api/invites/accept` (authenticated, outside the guard, body `{ token, displayName, confirmMove? }`). `POST /api/hh/invites` returns `{ link, expiresAt, hash }`, building `link` from `APP_ORIGIN` or the request's `Host` header.

- [ ] **Step 1: Write the failing domain tests.** Create: the stored invite has `householdId`, `createdBy`, `expiresAt = now + 7 days` and **no `usedBy` attribute**; the token is 43 base64url characters and the raw token is nowhere in the store; the pointer has the same `expiresAt`; full household gives `household_full`. Accept: CUJ 1 (two members, same household, `memberCount` 2, pointer deleted); second use of the link fails; the same user retrying returns the same result with no change; an expired invite (clock past `expiresAt`) is `invite_expired` and creates nothing (CUJ 10); a revoked invite is `invite_expired`; a third member is `household_full`, including two accepts racing; a user already in a non-empty household gets `already_member` with `canMove: false`; CUJ 11: the only member of an empty household gets `canMove: true`, and with `confirmMove: true` their old META, MEMBER and invite pointers are deleted and their MEMBERSHIP points at the new household; a task or shopping item in the old household makes `canMove` false. Exactly one `invite_accepted` event per success. Remove: only `META.createdBy` may remove, never themselves; the removed member loses `MEMBERSHIP` and `MEMBER`, `memberCount` goes back to 1, and the rest of the household is untouched; removing a non-member is `not_found`.
- [ ] **Step 2: Write the failing handler tests:** every Review Focus 1 token (empty, 42 and 44 characters, `+`, 10 KB) gets `410 invite_expired` or `400 invalid` and never 500; `DELETE /api/hh/members/auth0%7Cabc` removes `auth0|abc`; `%E0%A4%A` is 400; a non-member id is 404; a revoke of another household's hash is 404 and that invite is untouched.
- [ ] **Step 3: Run to see them fail; implement.** `joinOps` order is fixed so a `ConditionFailedError.failedIndex` maps to a code: `[update invite (ifMissing usedBy, set usedBy), update META (ifEquals memberCount 1, set 2), delete pointer, put MEMBERSHIP (ifAbsent) or update it (ifEquals householdId old), put MEMBER]`, plus, when moving, deletes of the old META, MEMBER and invite pointers. Failure at index 0 is `invite_expired` (410), at index 1 `household_full` (409). Read the invite first and answer `invite_expired` for a missing or past-expiry one before building any ops. `acceptInvite` runs its emptiness query just before the transaction (the accepted race from the spec).
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add invites, joining and member removal`.

---

### Task 5: Local multi-account data layer

**Files:**
- Modify: `src/auth/localData.ts`, `src/auth/__tests__/localData.test.ts`
- Test: `src/auth/__tests__/localData.test.ts`

**Interfaces:**
- Consumes: Task 4 `joinOps`, `inviteHash`; `HouseholdError`.
- Produces (replacing the single-account functions):
  ```ts
  export interface Account extends PasswordRecord { userId: string; email: string; displayName: string; createdAt: string }
  export const MAX_EMAIL_LENGTH = 254
  export function normaliseEmail(email: string): string                  // trim + lower case
  export function isUsableEmail(email: unknown): email is string         // string, <= 254, one '@' shape, no '#' or control characters
  export function getAccountByEmail(store: Store, email: string): Promise<Account | undefined>
  export function isSetupOpen(store: Store): Promise<boolean>            // AUTH#SETUP / DONE absent
  export function createFirstAccount(store: Store, input: { email: string; password: string; displayName: string; nowMs?: number }): Promise<Account>   // ConditionFailedError once setup is done
  export function createInvitedAccount(store: Store, input: { token: string; email: string; password: string; displayName: string; nowMs?: number }): Promise<{ account: Account; householdId: string }>   // EmailTakenError, HouseholdError
  export function replacePassword(store: Store, email: string, password: string): Promise<Account>   // throws if no such account
  export function createSession(store: Store, account: { userId: string; email: string }, nowSeconds: number): Promise<string>
  export function readSession(store: Store, token: string | undefined, nowSeconds: number): Promise<{ userId: string; email: string } | undefined>
  export function deleteSessionsForUser(store: Store, userId: string): Promise<void>
  export function throttleRemaining(store: Store, email: string, nowSeconds: number): Promise<number>
  export function recordFailure(store: Store, email: string, nowSeconds: number): Promise<void>     // expiresAt = last failure + 1 day
  export function clearThrottle(store: Store, email: string): Promise<void>
  ```
  Keys: account `AUTH#ACCOUNT#<email>`/`PROFILE`; throttle `AUTH#THROTTLE#<email>`/`LOGIN`; setup marker `AUTH#SETUP`/`DONE`; sessions stay in `AUTH#SESSIONS`, each now carrying `userId` and `email`.

- [ ] **Step 1: Write the failing tests.** Accounts: two accounts coexist and each has its own session; `ME@Example.com ` and `me@example.com` are one account (a second create is `EmailTakenError`); `createFirstAccount` succeeds once, writes the marker in the same transaction (a second call fails, and fails even if the account was deleted); `createInvitedAccount` creates the account, joins the household and writes membership in one transaction (CUJ 1 over the local path); if the invite is expired or the household is full, **no account exists afterwards** (Review Focus 5); two simultaneous `createFirstAccount` calls leave one account. Email safety (Review Focus 2): `isUsableEmail` rejects `a#b@x.com`, a NUL, 255 characters and `''`; `recordFailure` is never called with an unusable email in the route tests (Task 6). Throttle: per email (a locked email doesn't lock another), the row carries `expiresAt` one day after the last failure, `clearThrottle` removes only that email's row. Sessions: `deleteSessionsForUser` ends that user's sessions and leaves the other user's; `readSession` returns `email`.
- [ ] **Step 2: Run to see them fail; implement** to the signatures above (one `transact` per multi-item write; the marker and account are `put` with `ifAbsent`; `createInvitedAccount` prepends the account `put` to `joinOps(...)` and maps `failedIndex` to `EmailTakenError`, `invite_expired` or `household_full`).
- [ ] **Step 3: Run `yarn typecheck`.** Expected: errors in `src/auth/{routes,local}.ts` and `src/store/cli.ts`, which Task 6 fixes. Run `yarn vitest run src/auth/__tests__/localData.test.ts`; expect PASS.
- [ ] **Step 4: Commit** `feat: add per-email local accounts, setup marker and throttles`. (This commit does not build on its own; Task 6 follows immediately.)

---

### Task 6: Local auth routes, provider and CLI

**Files:**
- Modify: `src/auth/{routes,local,types}.ts`, `src/store/cli.ts`, `container/{server,recovery}.ts` (only if they reference removed names), `src/auth/__tests__/{routes,local}.test.ts`, `src/store/__tests__/cli.test.ts`
- Create: nothing

**Interfaces:**
- Consumes: Task 5 data layer; `parseDisplayName`, `parseInviteToken`.
- Produces (HTTP):
  - `POST /api/auth/setup` body `{ code, email, password, displayName }`
  - `POST /api/auth/login` body `{ email, password }` (unchanged shape)
  - `POST /api/auth/signup-with-invite` body `{ token, email, password, displayName }` -> 200 with a session cookie, 410 `invite_expired`, 409 `household_full` or `email_taken`
  - `GET /api/auth/status` -> `{ setupRequired: boolean }` (no `recoveryOpen`)
  - `GET /api/auth/me` -> `{ userId, email, displayName }`
- CLI: `store-cli reset-password <email>` (prompts for the password; sets it, ends only that user's sessions, clears that email's throttle, never reopens setup).

- [ ] **Step 1: Write the failing route tests.** Setup: needs the setup code; a second setup is 409; `displayName` is required (400 `invalid`). Signup-with-invite: works only with a valid token, an invalid shape token is 400 or 410 (never 500), and (CUJ 1) the new account lands in the inviter's household; a failed join leaves no account; the origin check applies (403 from another origin). Login (Review Focus 3): an unknown email and a wrong password return the identical status and body; a malformed or over-long email returns 401 **without writing a throttle row**; throttling one email does not throttle another; success clears that email's throttle. `me` returns `displayName`. `status` has no `recoveryOpen`. No route reads `ctx.recovery`; `createLocalProvider` has no `recovery` option.
- [ ] **Step 2: Write the failing CLI tests:** `reset-password` with no email, or with `--out`, prints usage; with an email that has no account, says so and changes nothing; with a valid email sets the new password, ends only that user's sessions, clears only that email's throttle, and leaves first-run setup closed; the password is never taken from arguments or the environment; the `USAGE` text shows `reset-password <email>`.
- [ ] **Step 3: Run to see them fail; implement.** Remove `recover`/`attemptRecovery`, `AuthRouteContext.recovery`, the `recovery` provider option and `recoveryOpen`. `local.ts` still prints the one-time setup code when setup is open. Update `store/cli.ts` per the interface (and the step-1 deviation in `docs/DECISIONS.md` is now resolved).
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: make local login multi-account and invite-only`.

---

### Task 7: Alerts infrastructure and the Auth0 Action

**Files:**
- Create: `infra/alerts.tf`, `infra/auth0/first-login.js`
- Modify: `infra/api-lambda.tf` (`ALERT_TOPIC_ARN`), `infra/variables.tf` (`alert_email`), `infra/terraform.tfvars.example`, `infra/initialSetup/main.tf`, `.github/workflows/yarnBuild.yml` (`TF_VAR_alert_email`), `src/infra/__tests__/infraGuards.test.ts`
- Test: `src/infra/__tests__/{infraGuards,firstLogin}.test.ts`

**Interfaces:**
- Produces: SNS topic `hearthwise-alerts` (name from `${var.app_name}-alerts`); an email subscription when `var.alert_email` is non-empty; the API Lambda role's `sns:Publish` on that topic; in `initialSetup`, IAM user `hearthwise-auth0-alerts` with a policy allowing only `sns:Publish` on `arn:aws:sns:<region>:<account>:hearthwise-alerts`, **no access key created in OpenTofu**, and SNS management permissions for the deploy role scoped to topics named `hearthwise-*`.
  ```js
  // infra/auth0/first-login.js (CommonJS, installed by hand as a post-login Action)
  exports.createHandler = (publish) => async (event, api) => void   // publishes { event: 'user_first_seen', userId, at } when event.stats.logins_count === 1
  exports.onExecutePostLogin = createHandler(/* real SNS publish using Action secrets */)
  ```

- [ ] **Step 1: Write the failing guard tests** (extend `infraGuards.test.ts`): the Auth0 alert user's policy allows only `sns:Publish` on the alerts topic ARN and `main.tf` contains no `aws_iam_access_key`; the deploy role's SNS statement is scoped to `hearthwise-*` topics and grants no IAM user actions (`iam:CreateUser`, `iam:PutUserPolicy` are not in the **deploy** policy); the topic is named from `app_name`; the lambda boundary still allows `sns:Publish` on `${var.app_name}-*`; `alert_email` has an empty default and the subscription is count-gated on it.
- [ ] **Step 2: Write the failing Action tests** (`firstLogin.test.ts`): a first login publishes exactly one message with `event: 'user_first_seen'`, `userId` and `at`; a second login publishes nothing; the message has no email or name even when the event carries them; a publish error does not throw (the login must never fail because an alert did).
- [ ] **Step 3: Run to see them fail; implement** the Terraform and the Action. Document, in the file's header comment, how to install the Action (secrets `AWS_REGION`, `ALERT_TOPIC_ARN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; the key is created by hand in the AWS console for `hearthwise-auth0-alerts`).
- [ ] **Step 4: Validate offline.** Run: `tofu fmt -check -recursive infra && tofu -chdir=infra init -backend=false && tofu -chdir=infra validate && tofu -chdir=infra/initialSetup init -backend=false && tofu -chdir=infra/initialSetup validate && yarn vitest run src/infra`. Expected: valid, no format diff, tests pass.
- [ ] **Step 5: Commit** `feat: add sign-up alert infrastructure and the Auth0 first-login Action`.

---

### Task 8: Client data layer and local auth UI

**Files:**
- Create: `app/lib/household.ts`, `app/lib/inviteToken.ts`, `app/lib/signInError.ts`
- Modify: `app/lib/localAuth.ts`, `app/components/authentication/{LocalAuthForm,LocalAuthProvider}.tsx`, `app/components/layout/{DefaultLayout,SignedOutPanel}.tsx`
- Test: `app/lib/__tests__/{household,inviteToken,localAuth,signInError}.test.ts(x)`, `app/components/authentication/__tests__/LocalAuthForm.test.tsx`, extend `app/components/layout/__tests__/DefaultLayout.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // app/lib/inviteToken.ts: localStorage key 'hearthwise-invite', 1-hour expiry; every access wrapped in try/catch
  export function storeInviteToken(token: string, nowMs?: number): void
  export function peekInviteToken(nowMs?: number): string | undefined      // undefined when absent, expired or storage is unavailable
  export function clearInviteToken(): void
  export function tokenFromHash(hash: string): string | undefined          // '#<43 chars>' -> token, else undefined
  // app/lib/household.ts (TanStack Query + useProtectedApi)
  export function useHousehold(): { status: 'loading' | 'none' | 'ready' | 'error'; data?: { household: HouseholdMeta; members: Member[]; me: Member } }
  export function useCreateHousehold(), useAcceptInvite(), useInvites(), useCreateInvite(), useRevokeInvite(), useRemoveMember(), useUpdateMe()
  // app/lib/localAuth.ts
  export function setupLocal(input: { code: string; email: string; password: string; displayName: string }): Promise<void>
  export function signupWithInvite(input: { token: string; email: string; password: string; displayName: string }): Promise<void>
  // recoverLocal and recoveryOpen are removed
  ```
  ```ts
  // app/lib/signInError.ts: what Auth0 puts in the address when sign-in fails (?error=...&error_description=...&state=...)
  export interface SignInError { code: string; message: string }
  export function readSignInError(search: string): SignInError | undefined   // undefined when there is no `error` parameter
  export function clearSignInErrorFromAddress(): void                         // history.replaceState without error, error_description and state
  ```
  `message` is Auth0's `error_description` trimmed to 300 characters and rendered as **text** only; when it names an unauthorized resource server (`is not authorized to access resource server`), the panel adds the line "This app's Auth0 application has not been given access to its API yet. See docs/AUTH0.md." `SignedOutPanel` gains an optional `signInError` prop shown in an alert (never red) above the Sign in button, so a failed sign-in is explained and retryable.
  `LocalAuthForm` props lose `recoveryOpen`/`onRecover`; gain a `mode: 'login' | 'setup' | 'invite'` and a `displayName` field in `setup` and `invite`. `GET /api/hh` answering 403 `no_household` maps to `status: 'none'`.

- [ ] **Step 1: Write the failing tests.** Token: a stored token is returned once within the hour and `undefined` after 1 h 1 s; storage throwing yields `undefined` and never an exception; `tokenFromHash('#' + 43 chars)` returns it, wrong length or characters return `undefined`. `localAuth`: `setupLocal` and `signupWithInvite` post the documented bodies with a timeout signal; a 410 surfaces the server's `invite_expired` as the message "This invite has expired. Ask your partner for a new link." (name-free here; the page adds the name); a 409 `email_taken` and `household_full` have plain messages. `LocalAuthForm`: setup mode requires the code, email, password (12+) and display name (1-40) before it calls `onSetup`; invite mode has no code field; there is no recovery UI; the forgot-password link remains and points at `docs/SELF-HOSTING.md#forgot-your-password`. `useHousehold`: 403 `no_household` gives `none`; 200 gives `ready`; any other error gives `error` (not `none`, so a network failure never sends someone to create a second household).
  Sign-in errors: `readSignInError('?error=invalid_request&error_description=Client%20%22x%22%20is%20not%20authorized%20to%20access%20resource%20server%20%22https%3A%2F%2Fhearthwise-api%22.&state=abc')` returns that code and the decoded sentence; no `error` parameter returns `undefined`; a 10,000-character description is cut to 300; `<script>` in the description is returned as plain text and rendered inert (assert the rendered DOM has no script element and the text appears verbatim); `clearSignInErrorFromAddress` removes `error`, `error_description` and `state` and keeps other parameters and the path. `DefaultLayout` (Auth0 mode, signed out, address has `?error=...`): the signed-out panel shows the message and the docs hint for the unauthorized-resource-server case, then the address no longer contains `error`; with no error parameter the panel is unchanged; the Sign in button still starts login.
- [ ] **Step 2: Run to see them fail; implement.**
- [ ] **Step 3: Run `yarn typecheck && yarn vitest run --project app`; expect PASS.**
- [ ] **Step 4: Commit** `feat: add the client household data layer, invite-aware sign-up and sign-in errors`.

---

### Task 9: Client pages and layout gate

**Files:**
- Create: `app/routes/{welcome,join}.tsx`, `app/components/household/{CreateHousehold,InviteLink,Members}.tsx`
- Modify: `app/components/layout/DefaultLayout.tsx` (gate, `/join` public), `app/routes/settings.tsx` (Members section), `app/routes.ts` only if file routes need it
- Test: `app/routes/__tests__/{welcome,join}.test.tsx`, `app/components/household/__tests__/*.test.tsx`, extend `app/components/layout/__tests__/DefaultLayout.test.tsx` and `app/__tests__/decisionText.test.tsx`

**Interfaces:**
- Consumes: Task 8 hooks and token helpers.
- Behaviour:
  - **Gate (`DefaultLayout`):** a signed-in person with `status: 'none'` is sent to `/join` if `peekInviteToken()` exists, otherwise to `/welcome`; with a household they are sent away from `/welcome` to `/`. `PUBLIC_PATHS` becomes `['/join']`. A signed-in person with `status: 'error'` sees a retry panel, never the welcome page.
  - **`welcome.tsx`:** leads with "Waiting for an invite? Open the link your partner sent you", then "Create a household" (household name, display name prefilled, timezone defaulting to the browser's); the display name is prefilled from the Auth0 profile `name` or `nickname`, or the local account.
  - **`join.tsx`:** reads the token from `location.hash`, stores it, then removes the hash. Auth0 mode: if signed out, starts login; once signed in, calls accept. Local mode: shows `LocalAuthForm` in `invite` mode (calls `signupWithInvite`). On `409 already_member` with `canMove: true`: asks "Move to <name>'s household? Your current household is empty and will be removed." and resends with `confirmMove: true`; with `canMove: false` explains they are already in a household with things in it. On 410: "This invite has expired. Ask <name> for a new link." (CUJ 10). The stored token is cleared when accept or sign-up returns, success or failure.
  - **Settings:** `Members` lists both members with an editable own display name; the creator sees "Remove from household" (with a confirmation) on the other member; `InviteLink` creates a link, copies it, offers the Web Share API, and lists open invites with Revoke.

- [ ] **Step 1: Write the failing tests.** Gate: a signed-in person with no household and no stored token lands on `/welcome`; with a stored token, on `/join`; with a household, `/welcome` redirects to `/`; `/join` renders for a signed-out person (no sign-in panel); `status: 'error'` shows a retry and **not** the create form. Welcome: the invite prompt comes before the create form; the create form prefills the display name and timezone; submit calls create with the typed values. Join: the hash is removed from the address after it is stored; CUJ 10 message with the inviter's name; CUJ 11 confirm-then-resend with `confirmMove: true`; `canMove: false` wording; the token is cleared after each outcome. Members: the creator sees Remove only on the other member and only after confirming; the other member never sees Remove; `InviteLink` shows the link once, copies it, and lists then revokes an open invite. Wording and touch targets: no "overdue", "missed" or "streak"; every new button is at least the shared touch-target minimum; add the new pages' hint text to `decisionText.test.tsx` so none is dimmed or `xs`.
- [ ] **Step 2: Run to see them fail; implement.**
- [ ] **Step 3: Run `yarn typecheck && yarn test`; expect PASS. Run `yarn build`; expect success.**
- [ ] **Step 4: Check it in a browser** against the container (below), at 390 px and desktop, signed out, setup, welcome, join, Settings members. Report what you saw.
- [ ] **Step 5: Commit** `feat: add the welcome and join pages, members settings and the household gate`.

---

### Task 10: Container smoke, docs and security review

**Files:**
- Modify: `scripts/container-smoke.mjs`, `docs/SELF-HOSTING.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`, `SECURITY.md`, `CLAUDE.md`
- Test: `scripts/container-smoke.mjs` run against the built image

- [ ] **Step 1: Extend the smoke script** after first-run setup: create a household (`POST /api/households`), create an invite, sign up a second account with the invite (`signup-with-invite`), and check both sessions `GET /api/hh` return the same household with two members; a second use of the invite link is 410; `status` returns `{ setupRequired: false }` with no `recoveryOpen`. Replace the Step 1 `RESET_PASSWORD` step with one that runs `store-cli reset-password <email>` inside the container (feeding the password on stdin only if the CLI supports it; otherwise assert it exits with the prompt-needed usage message) and checks only that email's sessions end.
- [ ] **Step 1b: Write `docs/AUTH0.md`**, the tenant setup the deployed site needs, each setting with the symptom when it is missing: create an **API** (identifier = `auth0_audience`, RS256, **Allow Offline Access on**, because the app asks for `offline_access`); create a **Single Page Application** and give it **user access** to that API (API -> Application Access tab -> the application -> User Access: Authorized; without it sign-in fails with `Client "<id>" is not authorized to access resource server "<audience>"`); the application's **Grant Types** include Authorization Code and Refresh Token, with **Refresh Token Rotation** on; **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins** include the site's origin; the first-login Action. Add a test that every symptom string quoted in the doc appears in `app/lib/signInError.ts`'s mapping or this doc's table (so the two cannot drift), and link the doc from `README.md`.
- [ ] **Step 2: Docs.** `SELF-HOSTING.md`: the multi-account text, invite links, `reset-password <email>` (replace the "takes no argument in step 1" paragraph). `DECISIONS.md`: this plan's decisions, the unmigrated Step 1 accounts, the email-existence leak to an invite holder (accepted: invites are one-time and trusted), and the alert subscription confirmation. `SECURITY.md`: invites and multi-account login now exist, and the alerts. `ROADMAP.md`: mark step 2 built. `CLAUDE.md`: the new modules and the `withHousehold` rule.
- [ ] **Step 3: Whole-step verification.** Run: `yarn install --frozen-lockfile && yarn typecheck && DYNAMODB_ENDPOINT=http://localhost:8000 yarn test && yarn build && yarn build:container && docker build -t hearthwise:dev . && node scripts/container-smoke.mjs hearthwise:dev && node scripts/container-smoke.mjs hearthwise:dev --proxy`. Expected: everything passes. Also: `grep -rniE "hoardwise|budget-app" src app infra scripts container .github` returns nothing outside tests that assert absence.
- [ ] **Step 4: Security review gate (required by the spec before merge).** Run the `/security-review` skill on the branch and have a fresh reviewer read `src/auth`, `src/household`, `src/security` and `infra/initialSetup/main.tf` with the Review Focus section. Fix Critical and Important findings test-first; record the rest.
- [ ] **Step 5: Commit** `docs: document accounts, households and invites`, then push the branch and open the PR. **Before merging:** apply `infra/initialSetup` by hand (it adds the SNS permissions and the alert IAM user), set the repository variable `ALERT_EMAIL`, and confirm the AWS subscription email; otherwise the deploy fails on the missing SNS permission.
