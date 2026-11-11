# Stage 8: Intermediate Zoom Out Review

*   **Target:** `docs/designs/phase-1-foundation.md`, full file (lines 1–1382)
*   **Reviewer:** `egm-zoom-out` (fresh context), standard `zoom-out-standard.md`
*   **Goldfish context:** `discussion_summary.md`, `zoom_out_report.md`, and the Hoardwise files `CLAUDE.md`, `src/store/types.ts`, `src/auth/localData.ts`, `app/lib/offlineQueue.ts`, `src/push/scheduler.ts` and `public/sw.js`
*   **Date:** 2026-11-11
*   **Status:** resolved (2026-11-11). The author asked for every finding to be applied as recommended.
*   **Verdict:** Needs revision. 0 Blocker, 5 Major, 5 Nit.

**Overall judgement (reviewer):** the architecture is sound and proportionate: a copied Hoardwise scaffold, one Store extension, a persisted query cache with paused mutations, and an hourly scheduler. What has grown is the set of conflict and replay rules on top of it. Added one critic finding at a time, several now exist only to cover gaps left by others. For one maintainer, completions, undo, proposals and member removal are where bugs will come from. Item 23 alone lists about 35 test cases.

**Checked by the author's agent:** findings 4 and 7 are real mismatches. Item 22 says `mutationId` is "ignored until step 6", but step 3's completion rules use it. Item 21's completion condition leaves out the `updatedAt` check the Technical Plan requires.

---

## 🟡 1. Major: one idempotency record per mutation instead of five retry mechanisms

- **Scope:** `NOTIFY#` marker, `mutationId` on `DONE` and its retry check, `restoredAt` and the `at`-ordered item delete, repeated proposal transitions returning 200.
- **Problem:** each route has its own way of recognising "this retry already landed". They all answer the same question, each with its own tests.
- **What to do:** every write carries a client `mutationId`. Write `HH#<hid>/MUT#<mutationId>` put-if-absent in the same transaction as the write, with the response status and an expiry a little over the cache's 7-day `maxAge`. A retry finds it and gets the stored result. This replaces the `NOTIFY#` marker, the `mutationId` field and check on `DONE`, and `restoredAt`. Field timestamps and `baseRuleVersion`/`baseCycleSeq` stay, because they handle edits from two people arriving out of order, which is a different problem.
- **Agent's recommendation:** adopt.

## 🟡 2. Major: completers as attributes on `DONE`, and a simpler undo

- **Scope:** `ALSO#` items, `alsoCount`, promotion on undo, the four undo cases.
- **Problem:** a separate item per extra completer, a counter, and promotion logic add up to four undo cases with conditional deletes and reload loops, for a household with exactly two possible completers.
- **What to do:** `DONE` holds one attribute per completer (`by_<userId>: completedAt`). "Also did it" is a conditional update with `ifMissing` on that attribute. Undo removes the caller's attribute. The cycle reopens only when no completer attribute remains. `alsoCount`, `ALSO` items, promotion and the "first completer" field go.
- **Agent's recommendation:** adopt the completer attributes. Keep the existing reopen conditions rather than the reviewer's optional "`updatedAt` unchanged" check, which would refuse an undo after the other person merely ticked a checklist step.

## 🟡 3. Major: member removal duplicates a read-time rule

- **Scope:** Invites step 5, items 16 and 18.
- **Problem:** the batch pass that rewrites tasks, clears overrides and stales proposals duplicates the read-time rule ("a task assigned to a non-member reads as `either`"), with its own partial-failure state.
- **What to do:** choose one:
  - **A (recommended).** Removal is one transaction (`MEMBERSHIP`, `MEMBER`, `memberCount`). `ownership.ts` and the views treat a non-member assignee or override, and a `both` task in a one-member household, as `either`. Proposals involving a non-member read as stale. No batch pass.
  - **B.** Removal becomes an operator command, `store-cli remove-member`, like `reset-password`, and the UI is deferred.

## 🟡 4. Major: the step order doesn't match the architecture

- **Scope:** item 22 vs completion rules; item 21's undo vs item 36.
- **What to do:** accept and use `mutationId` from step 3. With finding 1, the idempotency record lands in step 3. Move "undo deletes the held push" to item 36 in step 6.
- **Agent's recommendation:** adopt.

## 🟡 5. Major: sign-up alerts cover more than the decided threat

- **Scope:** "Sign-up alerts", item 16a.
- **Problem:** open sign-up exists only in Auth0 mode, so the container webhook covers a risk that doesn't exist. `user_first_seen` needs a `SEEN` item, `noteUserSeen()` on every authenticated route and a per-instance cache.
- **What to do:** keep `household_created` and `invite_accepted` through SNS. Replace `user_first_seen` with an Auth0 post-registration Action that emails the author, which needs no Hearthwise code. Drop `SEEN`, `noteUserSeen` and the container webhook.
- **Agent's note:** this still meets the author's request to be alerted to every new sign-up, because the Auth0 Action fires on every registration in the tenant, whichever deployment it's used from.
- **Agent's recommendation:** adopt.

---

## 🟢 Nits

6. The `assign` proposal kind duplicates `{ kind: 'edit', set: { assignee } }`. Merge them.
7. Item 21 restates the completion and undo rules and has drifted. Make it refer to "Completing a task" and "Undo" instead.
8. Moving out of an empty household checks emptiness outside the transaction. Accept the small race, and add the move path and the same-user retry to item 16.
9. Optimistic updates are described as both cache writes and a `select` overlay. Use the overlay throughout.
10. The spike says "four cases" but lists five.

## Cost of decisions already made (not findings)

- Self-hosting and multi-account local login are roughly a quarter of the new code.
- Proposals and held pushes are where most of the rule growth sits. Findings 1–3 and 6 reduce it without removing either feature.

## Reuse confirmed as appropriate

- The Store and its contract tests, with the extended `TxOp`
- The single `AUTH#SESSIONS` partition and `hashToken`
- Finding push recipients through subscribed users, as Hoardwise's scheduler does
- Hoardwise's hourly maintenance loop, `select.ts` and `isQuietHour`
- The push and `notificationclick` handlers from `public/sw.js`, without its `skipWaiting()`
- TanStack persisted paused mutations, with Alternative K as the fallback
- The trash/Deleted page, `undoDuration`, `PushCheck` and the accessibility test helpers

---

## Resolution log (2026-11-11)

All findings were applied to `docs/designs/phase-1-foundation.md` as recommended. FeatureRange is now lines 1–793 and DetailedRange starts at line 794.

| # | Resolution |
|---|---|
| 1 | New "Retries: one record per write" section. `MUT#<mutationId>` is written in the same transaction as every write. The `NOTIFY#` marker, the `mutationId` retry check on `DONE`, `restoredAt` and the timestamped item delete are gone. New `src/api/writeRecord.ts` in item 21. |
| 2 | `DONE` holds one `by_<userId>` attribute per completer. `ALSO` items, `alsoCount`, promotion and "first completer" are gone. Undo is one rule with three short cases. The existing reopen conditions are kept. |
| 3 | Option A. Removal is one transaction; non-member assignees, overrides and proposals, and `both` tasks in a one-member household, are handled at read time in `ownership.ts` and the views. No batch pass. |
| 4 | `mutationId` is required from step 3 (item 22). Deleting a held push on undo moved to item 36. |
| 5 | Sign-up alerts: an Auth0 post-login Action on first login publishes `user_first_seen` to SNS; the API sends `household_created` and `invite_accepted`. `SEEN`, `noteUserSeen` and the container webhook are gone. |
| 6 | The `assign` kind merged into `{ kind: 'edit', set: { assignee } }`. |
| 7 | Item 21 now refers to "Completing a task → Rules" and "Undo" instead of restating them. |
| 8 | The move path and the same-user retry are in item 16, with the emptiness race accepted. |
| 9 | Optimistic updates are the `select` overlay throughout; base versions are read from the overlaid data. |
| 10 | The spike lists five cases. |
