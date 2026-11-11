# Stage 5: Initial Zoom Out Review

*   **Target:** `docs/designs/phase-1-foundation.md` (lines 1–898)
*   **Reviewer:** `egm-zoom-out` (fresh context), standard `zoom-out-standard.md`
*   **Goldfish context:** `discussion_summary.md` and the Hoardwise files `CLAUDE.md`, `src/store/types.ts`, `src/auth/localData.ts`, `app/lib/offlineQueue.ts`, `src/push/scheduler.ts` and `public/sw.js`
*   **Date:** 2026-11-10
*   **Verdict:** Needs revision. 1 Blocker, 6 Major, 5 Nit.

**Checked by the author's agent:** three of the reviewer's claims about Hoardwise were checked directly in the code, and all three are accurate:
- `TxOp` only allows `put`/`delete` (`src/store/types.ts:8-10`).
- The push schedule is hourly: `cron(0 * * * ? *)` at `infra/push-lambda.tf:122`.
- `vapid.ts` reads the private key from AWS SSM, and `container/` has no push code.

**Context sufficiency: passes.** The objective, the motivation, the success measure and the scope limits are clear. The design addresses the root problem of scattered household tools, and it fits the "shared data, personal views" principle in `discussion_summary.md`.

---

## 🔴 1. Blocker: Completions and invites need atomic operations the copied Store doesn't have

- **Scope:** lines 243–248, 288–290 and 528. Plan items 16 and 21.
- **Problem:**
  - Line 528 says the Store is "copied unchanged" and supplies the conditional operations used by completions and invites.
  - Hoardwise's `TxOp` (`src/store/types.ts:8-10`) only allows `put` (with `ifAbsent`) and `delete` (with `ifPresent`). A transaction can't contain a patch, and it can't check a condition on another item.
  - So "put DONE if absent + patch TASK if `dueOn` equals `cycleDueOn`" can't be built as one transaction.
  - The invite accept can't be built either: it needs "patch invite if `usedBy` is null and `expiresAt` is in the future, then put MEMBERSHIP". The expiry check is also a "later than" comparison, and `ifEquals` only tests equality.
  - CUJ 4 and single-use invites both depend on these operations.
- **What to do:** Option 1: extend `TxOp` with a conditional patch, across DynamoDB, SQLite and memory plus the shared contract tests, and list it as new code. Option 2: redesign both flows around what the Store already supports. For example, check invite expiry on read before the transaction.

## 🟡 2. Major: The push schedule is hourly in Hoardwise, not every 15 minutes

- **Scope:** lines 276–277, 340, 345, 557, 565 and 832.
- **Problem:**
  - Hoardwise's push schedule is hourly (`infra/push-lambda.tf:122`), and so is its container maintenance loop.
  - Hoardwise's `src/push/select.ts` already has hour-based, timezone-aware helpers, including quiet-hour handling across midnight.
  - 15-minute windows and `HH:MM` times add precision nobody asked for, and they stop that code from being reused as is.
- **What to do:** keep the hourly loop and whole-hour settings, and reuse `select.ts`. Fix the "as in Hoardwise" statements.

## 🟡 3. Major: Self-hosted push is new work, but it's listed as copied

- **Scope:** line 194 (diagram), lines 200–219, 345 and 557.
- **Problem:**
  - Hoardwise's container has no push support.
  - `vapid.ts` reads the private key from AWS SSM, which doesn't exist in the container.
  - Self-hosted push therefore needs three new pieces, none of them in the "New code" list:
    - VAPID key storage outside AWS
    - web-push sending in the container
    - a scheduled job
- **What to do:** drop self-hosted push from phase 1 to match Hoardwise, or list it as new code in step 6.

## 🟡 4. Major: Undo on delete contradicts "a tombstone is final", and there's no restore route

- **Scope:** lines 78, 306, 581, 737 and 778.
- **Problem:**
  - "Clear ticked" has undo, and the goals promise undo on every delete. But line 306 says nothing brings a deleted item back.
  - Hoardwise's `useUndoableDelete` works by calling a trash/restore API, which Hearthwise doesn't have.
  - The undo-completion route `DELETE /api/hh/tasks/:id/completions/:cycle` is missing from the API table and from the completion rules.
- **What to do:** choose one approach:
  - delay the delete on the client until the undo window closes, or
  - add a restore route and allow the deleter to undo within the window.

  Then add the missing route to the table.

## 🟡 5. Major: A general offline queue rebuilds what TanStack Query already provides

- **Scope:** line 322 and plan item 34.
- **Problem:**
  - TanStack Query v5 can store paused offline mutations in the persisted cache the design already adds. It replays them with `resumePausedMutations`, restores them after a reload with `setMutationDefaults`, and runs them in order with mutation `scope`.
  - That gives one IndexedDB store instead of two, and keeps each user's writes separate for free.
  - Generalising Hoardwise's transaction-specific queue means rewriting most of it anyway.
- **What to do:** compare the built-in option before committing to a custom queue. If the custom queue stays, say why (for example, control over handling 409/410), and add it to Alternatives.

## 🟡 6. Major: Several features rest on requirements the users haven't confirmed

- **Scope:** lines 69, 103, 266, 311–315, 336, 342 and 403.
- **Problem:**
  - Neither user has checked the design requirements, and the Tody trial hasn't been run.
  - Phase 1 still builds three things that depend on them:
    - a full proposal workflow: an entity, three routes, stale detection, a banner
    - two reminder types
    - a held-push queue
  - In a two-person household, a reassignment could just be a direct edit plus "Let <name> know".
  - Held pushes cover a narrow case. A simpler rule: don't push during quiet hours, since the change already shows in the app.
- **What to do:** get the requirements confirmed before step 3, or move proposals, held pushes and due nudges into a later step.

## 🟡 7. Major: Self-hosting and multi-account local login, flagged again

- **Scope:** line 162, lines 416–424, plan items 14–15.
- **Problem:**
  - The design's own Alternative E says self-hosting costs about half the phase 1 infrastructure and auth code. It calls multi-account local login the riskiest new code.
  - Auth0 already handles both known users.
  - Findings 3 and 6 make the cost higher than stated.
  - The author decided this explicitly, so the reviewer is recording the cost, not overruling it.
- **What to do:** if self-hosting stays, consider the middle option: keep the Store interface now and build SQLite and local login in a later step.

## 🟢 8. Nit: Shopping items are written with a `version` field the data model doesn't have

- **Scope:** line 758 compared with line 264.
- **What to do:** add `version` to the item model, or use `ifEquals` on `updatedAt`/`fieldTimes`.

## 🟢 9. Nit: Adding to `completedBy` can lose a name

- **Scope:** lines 293–294 and 692.
- **What to do:** two concurrent "also done" calls can each overwrite the other. Use a conditional patch, or one completion entry per user.

## 🟢 10. Nit: The push job needs a way to list every household

- **Scope:** line 832.
- **What to do:** `Store.query` only reads one partition. Loop over push subscribers as Hoardwise does, or add an index item.

## 🟢 11. Nit: Some implementation detail in the Technical Plan

- **Scope:** lines 239, 297–300 and 319.
- **What to do:** library-option and algorithm detail repeats in the implementation plan. Trim it from the architecture section.

## 🟢 12. Nit: Banned-word scan includes "late"

- **Scope:** line 875.
- **What to do:** "late" matches "template", "translate" and the UI's own "Later" group. Match whole words only.

---

## Reuse confirmed as appropriate

- Hoardwise's Store contract tests
- `app/lib/ics.ts` for the phase 4 calendar
- Push subscription storage and removal of 404/410 subscriptions
- Workbox via `vite-plugin-pwa`
- Deferring WebSockets and AppSync

---

## Resolution log (2026-11-10)

| # | Finding | Resolution |
|---|---|---|
| 1 | Store can't do the atomic operations completions and invites need | **Fixed (author decision: extend the Store).** New "Store extension" section. `TxOp` gains a conditional `update` (`ifEquals`, `ifMissing`, `ifGreaterThan`), implemented in DynamoDB, SQLite and memory, with contract tests. Invites, completions, undo and proposals use it. |
| 2 | 15-minute schedule wrong | **Fixed.** Hourly schedule, whole-hour settings, `select.ts` reused. |
| 3 | Self-hosted push is new work | **Fixed (author decision: build container push).** Listed as new code. Plan items 36a (VAPID keys from env or `vapid.json`) and 38a (container timer and tests). |
| 4 | Undo vs final tombstones, no restore route | **Fixed (author decision: 30-day recycle bin).** New "Recycle bin" section, restore routes, Deleted page (item 25a), and undo calls restore. The undo-completion route was added to the API table and the completion rules. |
| 5 | Custom queue rebuilds TanStack's feature | **Fixed (author decision: TanStack built-in).** Paused mutations persisted with the cache. Item 34 rewritten, and the custom queue added to Alternatives. |
| 6 | Features built on unconfirmed requirements | **Resolved.** The author confirmed the requirements, so proposals, held pushes and due nudges stay. |
| 7 | Self-hosting cost | **Accepted trade-off.** The author kept self-hosting in phase 1, recorded in Alternative E. |
| 8 | Missing `version` field | **Fixed.** `updatedAt` added to the item model and used for `ifEquals`. |
| 9 | `completedBy` can lose a name | **Fixed.** A separate `ALSO#<userId>` item per extra completer, written put-if-absent. |
| 10 | Listing households | **Fixed.** The scheduler lists subscribed users, then looks up each one's `MEMBERSHIP`. |
| 11 | Implementation detail in the Technical Plan | **Fixed.** Polling options trimmed from the architecture section. |
| 12 | "late" matches "Later" | **Fixed.** Whole-word, case-insensitive matching. |

---

## Re-audit (2026-11-10, the one allowed re-audit)

**Verdict:** all 12 prior findings are resolved or accepted. There's 1 new Major and 6 new Nits, all fixed below. The re-audit cap is now used up, so Stage 5 makes no further passes.

| # | Finding | Resolution |
|---|---|---|
| N1 | 🟡 Writes made on weak signal (fetch rejects while the browser reports online) are lost, unlike in Hoardwise | **Fixed.** Network errors are retried until they succeed, with backoff capped at 60 s. Every pending household mutation is persisted, not only paused ones. A test covers a rejected fetch while the browser reports online. |
| N2 | 🟢 Undo window can't be checked on the server, undo deletes other people's ALSO items, and one-off undo isn't defined | **Fixed.** No server time limit. Undo removes only the caller's own records. A one-off task is set back to `open`. |
| N3 | 🟢 The deleted-items route duplicates data the client already has, and there are three restore routes | **Fixed.** The Deleted page filters the cached tombstones. One `POST /api/hh/restore` route. Tombstone wording made consistent. |
| N4 | 🟢 `ifGreaterThan` is used only once | **Fixed.** Removed. Invite expiry is checked when the invite is read, and `usedBy` keeps it single-use. |
| N5 | 🟢 Leftovers from earlier versions | **Fixed.** Rule count, conditional `update` wording, `digest.hour`, queue wording, and the `deletedBy`/`expiresAt` fields. |
| N6 | 🟢 A new container timer instead of the existing loop | **Fixed.** The scheduler runs from Hoardwise's existing hourly maintenance loop. |
| N7 | 🟢 The recycle bin decision isn't in Alternatives | **Fixed.** Alternative H3 (delaying the delete on the client) added. |
