# Phase 1, Step 6: Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nothing notifies the other person by surprise. A person can tick "Let <name> know" on a change and the other gets one push (held during their quiet hours); and each person can turn on their own daily digest and due-day nudges. It works on AWS and in the self-hosted container.

**Architecture:** A `PushSender` interface (web-push in production, a fake in tests) used by `notifyOther` (sender-chosen, called from the write routes after a fresh successful write) and `runSchedule` (the hourly scheduler: digest, nudges, held pushes). Subscriptions and held pushes are plain Store items; claims use conditional updates so overlapping runs send once. The client gains a "Let <name> know" tick, reminder settings, and a push check.

**Tech Stack:** TypeScript, `web-push`, the Store (`update` with `ifEquals`/`ifMissing`), AWS SSM (VAPID private key), React + Mantine.

**Spec:** `docs/designs/phase-1-foundation.md`, Step 6 (items 35, 36, 36a, 37, 38, 38a, 39), "Notifications", "Member settings", CUJ 8.

## Global Constraints

- **Nothing is ever sent to the person who made the change.** A push is only the other member's. The only other pushes are a member's own digest and nudges, off by default.
- `notifyOther` runs only when the request had `notify: true` AND the write succeeded (not 403, 409, 410) AND the write record was fresh (a retry sends nothing) AND `clientAt` is not more than 30 minutes before server time. It is awaited before the response, with a **2-second timeout**; errors and timeouts are logged with the household id and event type, never thrown, and never fail the request.
- Quiet hours (the recipient's, in the household's time zone) hold a "Let them know" push as a `HELD#<recipientId>#<createdAt>` item (`title`, `body`, `tag`, `ref`, `releaseAt`, `expiresAt` 24 h) released when they end. Quiet hours do not apply to a member's own digest and nudges.
- Digest and nudges: only when on; the member's local hour is their chosen hour or up to 2 hours after it, never past local midnight (hour 22 gives 22, 23); `lastDigestSent`/`lastNudgeSent` is not today; claimed with an update conditional on the value read (`ifEquals`, or `ifMissing` the first time) BEFORE sending; an empty digest is not sent. Tasks use the **effective assignee** (`src/tasks/ownership.ts`): assigned to the member, `either` or `both` (swaps apply); a digest lists open tasks due today **or earlier**; nudges are tasks due today, one push each.
- A held push is claimed with a delete that requires it to exist and sent only if the delete succeeded; one past `expiresAt` is skipped.
- Tags: `nudge-<taskId>-<date>`, `notify-<mutationId>`, `digest-<date>`. A subscription the push service reports 404 or 410 is removed.
- A batch request builds one combined body ("3 items added to the shopping list").
- The VAPID private key never appears in logs, `/config.json`, or the repository. `/config.json` gains only `vapidPublicKey`.
- `undoCompletion` deletes any `HELD` item whose `ref` is the undone completion.
- Wording neutral; no "overdue", "missed", "streak"; no red; no `xs` buttons.
- Conventional commits with the attribution trailer. Branch `step-6-notifications` (cut from `step-5-offline`). Every task leaves `yarn typecheck` and `yarn test` green.

## Decisions made in this plan (the spec is silent)

- **Subscriptions** are `USER#<userId>`/`PUSHSUB#<sha256 of endpoint>` items (`endpoint`, `p256dh`, `auth`, `createdAt`), with an index item `PUSHIDX`/`USER#<userId>` so the scheduler lists subscribed people without a scan. Subscription bodies carry no settings.
- **`notify` on the wire:** every write route already accepts `notify` and `clientAt`; the parsers now return them, and the route calls `notifyOther` after a fresh success. Events and wording: a task created, edited, deleted, completed, proposed; an item added, edited, ticked, deleted, cleared.
- **"Let <name> know" in the UI is one tick per visit,** shown on Today, the task page, Shopping, the task sheet and the add-item form, **unticked by default and never remembered** (it resets on reload). It stamps `notify` and `clientAt` on the writes made on that page. The design asks for a tick beside every action; a tick on every row would bury the lists, so this ruling groups them per page. Cost if wrong: someone has to tick it once more per action type.
- **Container push:** the container wires the same `runSchedule` into the hourly maintenance tick, and the same sender into `notifyOther`.
- **No sender configured** (no VAPID keys) means `notifyOther` and the scheduler do nothing, quietly.

## Review Focus

1. **Never a surprise:** with `notify` missing or false, on a failed write, on a retry, on a stale replay, or for the person who made the change: nothing is sent. [Task 2]
2. **Never twice:** two overlapping scheduler runs send one digest, one nudge per task, one held push; a retried write pushes once. [Task 1]
3. **Never lost without a trace:** a push that times out or a subscription that is gone never fails the request; a gone subscription is removed. [Task 1, Task 2]
4. **Time zones and the clock:** the hour window, midnight, quiet hours that run past midnight, the household's zone (not the server's). [Task 1]
5. **Secrets:** the VAPID private key is never logged or served. [Task 3]

---

### Task 1: Push domain: subscriptions, selection, notifyOther, scheduler

**Files:**
- Create: `src/push/{subscriptions,sender,notifyOther,scheduler,events}.ts`
- Modify: `src/push/select.ts` (digest and nudge selection), `src/tasks/keys.ts` (held, push keys)
- Test: `src/push/__tests__/{subscriptions,select,notifyOther,scheduler}.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // subscriptions.ts
  export interface PushSubscriptionRecord { endpoint: string; p256dh: string; auth: string; createdAt: number }
  export async function saveSubscription(store, userId, sub): Promise<void>      // also writes PUSHIDX
  export async function removeSubscription(store, userId, endpoint): Promise<void>
  export async function loadSubscriptions(store, userId): Promise<PushSubscriptionRecord[]>
  export async function listSubscribedUsers(store): Promise<string[]>
  // sender.ts
  export interface PushPayload { title: string; body: string; tag: string; url?: string }
  export interface PushSender { send(sub: PushSubscriptionRecord, payload: PushPayload): Promise<{ status: number }> }
  export async function deliver(store, sender, userId, payload): Promise<number>   // to every subscription; removes 404/410; returns how many were sent
  // select.ts
  export function digestFor(member, tasks, roster, moment): { title; body; tag } | undefined
  export function nudgesFor(member, tasks, roster, moment): { title; body; tag }[]
  export function inWindow(chosenHour: number, localHour: number): boolean       // chosen..min(chosen+2, 23)
  // notifyOther.ts
  export interface NotifyInput { store; sender?: PushSender; ctx: HouseholdContext; event: { title: string; body: string; mutationId: string; ref?: string; type: string }; fresh: boolean; clientAt?: number; notify?: boolean; serverNow: number }
  export async function notifyOther(input: NotifyInput): Promise<void>            // never throws, 2 s timeout
  export async function releaseHeld(store, ctx, nowMs): Promise<...> / deleteHeldFor(store, householdId, ref)
  // scheduler.ts
  export async function runSchedule(store, sender: PushSender | undefined, now: Date): Promise<void>
  ```

- [ ] **Step 1: Write the failing tests** (design item 38): subscriptions round-trip, PUSHIDX lists subscribed users, remove; `digestFor`/`nudgesFor` only when on, at the chosen hour or up to 2 hours after in the household timezone, using the effective assignee (swap, either, both), the digest includes undone tasks from earlier days and is empty-skipped, tags right; `notifyOther`: nothing without `notify`, nothing when not fresh, nothing when `clientAt` is over 30 minutes old, nothing to the caller, sent at once to the other member, a push during quiet hours is held with `releaseAt` at the end of quiet hours (including quiet hours past midnight), a timeout and a thrown sender never throw, a 410 removes the subscription, a combined body is passed through as given; scheduler: digest sent once for two overlapping runs, the first-ever digest uses `ifMissing`, hour 22 is not sent after midnight and a missed hour is caught up within 2 hours, nudges one per due task, a held push is released once for two overlapping runs, one past `expiresAt` is skipped, undoing a completion removes its held push, CUJ 8 (one member digest at 19 on the full list, the other with everything off: exactly one notification, the first member's digest).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add the push domain, sender-chosen pushes and the scheduler`.

---

### Task 2: Routes, wiring and the runtime key

**Files:**
- Create: `src/api/push.ts`, `src/push/sender-registry.ts`
- Modify: `src/shared/taskValidation.ts`, `src/shared/itemValidation.ts` (return `notify`, `clientAt`), `src/api/{tasks,items}.ts` (call `notifyOther`), `src/tasks/completions.ts` (undo deletes held), `src/api/apiRoutes.ts`, `app/lib/runtimeConfig.ts` (`vapidPublicKey`), `scripts/build-static-handler.cjs`, `push-handler.ts`
- Test: `src/api/__tests__/{push,notify}.test.ts`, `app/lib/__tests__/runtimeConfig.test.ts`

**Interfaces:**
- Routes: `POST /api/push/subscriptions` `{ endpoint, keys: { p256dh, auth }, mutationId }` (201), `DELETE /api/push/subscriptions` `{ endpoint, mutationId }` (204): `https` endpoint of at most 2,000 characters, keys base64url of sane length, 400 naming the field otherwise.
- `setSender(sender | undefined)` / `getSender()`.

- [ ] **Step 1: Write the failing tests** (design item 38, HTTP): no push when `notify` is missing or false; none when the write fails with 403, 409 or 410; the push is sent before the response returns, and a push that times out does not fail the request; a retried write with the same `mutationId` pushes once; a replay with `clientAt` more than 30 minutes old sends nothing; a batch sends one combined push; nothing is sent to the person who made the change; subscribe validates and stores, unsubscribe removes; `runtimeConfig` accepts and ignores a missing `vapidPublicKey` and parses a present one.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add push subscriptions and the notify option on writes`.

---

### Task 3: Keys, the container, infrastructure

**Files:**
- Create: `src/push/vapid.ts`, `container/push.ts`
- Modify: `container/server.ts`, `container/maintenance.ts`, `container/adapter.ts` (config.json carries the public key), `scripts/build-push-handler.cjs`, `push-handler.ts`, `infra/{api-lambda,push-lambda}.tf`, `src/infra/__tests__/infraGuards.test.ts`
- Test: `src/push/__tests__/vapid.test.ts`, `container/__tests__/{push,maintenance}.test.ts`

**Interfaces:**
- `loadVapid(env, deps?)`: AWS (private key from SSM at `VAPID_PRIVATE_KEY_PARAMETER`, public key and subject from env); container (env first, then `<dataDir>/vapid.json`, else generate with `generateVAPIDKeys()` and write mode 0600; subject defaults to `mailto:admin@localhost`).
- `createContainerSender(vapid): PushSender`; `MaintenanceDeps.runScheduler(now): Promise<void>`; `attemptAsync(deps, label, work)`.
- Infra: API Lambda gets SSM `GetParameter` on the parameter and the three `VAPID_*` variables; the push Lambda gets `UpdateItem`, `PutItem`, `DeleteItem` on the table.

- [ ] **Step 1: Write the failing tests:** each maintenance tick calls the scheduler once; a scheduler rejection is logged and the purge and backup still run; a missing `vapid.json` is generated once and reused, environment variables override the file, the file is mode 0600; the private key never appears in a log line or in `/config.json`; infra guards: the API role can read only the Hearthwise parameter, the push role's table actions are exactly the six it needs and scoped to the table, the boundary already allows it.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `yarn typecheck && yarn test && yarn build && yarn build:container && tofu fmt -check -recursive infra && tofu -chdir=infra init -backend=false && tofu -chdir=infra validate`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add the VAPID keys, container push and the scheduler's access`.

---

### Task 4: Client: Let them know, reminder settings, push check

**Files:**
- Create: `app/lib/push.ts`, `app/lib/letThemKnow.ts`, `app/components/shared/LetThemKnow.tsx`, `app/components/settings/{Reminders,QuietHours,DefaultView,PushCheck}.tsx`
- Modify: `app/lib/mutations.ts` (`notify` on variables and bodies), `app/hooks/{useTaskActions,useItemActions}.tsx`, `app/routes/{_index,shopping,tasks.$id,settings}.tsx`, `app/components/tasks/TaskSheet.tsx`, `app/components/shopping/AddItem.tsx`
- Test: `app/lib/__tests__/{push,letThemKnow,mutations}.test.ts`, `app/components/shared/__tests__/LetThemKnow.test.tsx`, `app/components/settings/__tests__/*.test.tsx`, extend the page tests

**Interfaces:**
- `pushSupport(): 'supported' | 'needs-install' | 'unsupported'`; `subscribeToPush(vapidPublicKey, request)`; `useLetThemKnow(): { on: boolean; set(on: boolean): void }` (session only, default off); mutation variables gain `notify?: boolean` and bodies send `notify` and `clientAt` only when true.

- [ ] **Step 1: Write the failing tests:** the "Let <name> know" box is present on Today, the task page, Shopping, the task sheet and the add-item form, unticked by default, and not remembered across a reload; when ticked, the writes made on that page carry `notify: true` and `clientAt`; unticked, the bodies carry neither; settings save digest on/off and hour, due nudges on/off and hour, quiet hours, and default view through `PATCH /api/hh/members/me`; the note "Your reminder is still sent at this hour" appears when a reminder hour falls in the member's quiet hours; `PushCheck` says whether push works on this device and shows Home Screen install steps for `needs-install`; a one-time prompt on Today points to it and is not shown again once dismissed; no banned words, no `xs` buttons, sound headings, no unlabelled controls.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `yarn typecheck && yarn test && yarn build`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add Let them know, reminder settings and the push check`.

---

### Task 5: Docs, whole-step verification and review

- [ ] **Step 1: Docs.** ROADMAP step 6 built; CLAUDE.md (push modules, `notifyOther`, scheduler); DECISIONS (this plan's decisions); SECURITY (the VAPID key, nothing to the caller, held pushes, no secrets in config); a SELF-HOSTING note on `vapid.json`.
- [ ] **Step 2: Whole-step verification.** `yarn install --frozen-lockfile && yarn typecheck && DYNAMODB_ENDPOINT=http://localhost:8000 yarn test && yarn test:e2e && yarn build && yarn build:container && docker build -t hearthwise:dev . && node scripts/container-smoke.mjs hearthwise:dev && node scripts/container-smoke.mjs hearthwise:dev --proxy && tofu fmt -check -recursive infra`; the smoke script also checks that `vapid.json` is created with mode 600 and that `/config.json` carries only the public key.
- [ ] **Step 3: Final review** by a fresh reviewer against the Review Focus; fix Critical and Important test-first; ledger the rest.
- [ ] **Step 4: Commit** `docs: document notifications`, push, open the PR (base `step-5-offline`).
