# Goldfish Annotated Review Report

**Target:** `docs/designs/phase-1-foundation.md` (lines 1–780, FeatureRange). Stage 7, round 4.
**Status:** resolved (2026-11-11). The author asked for every fix to be applied, then for Stage 7 to close at this round (accepted at round 4 of 5, with churn noted) and the review to move to Stage 8.
**Source findings:** [critic_report_round4.md](critic_report_round4.md). Earlier rounds: [1](goldfish_review_report_round1.md), [2](goldfish_review_report_round2.md), [3](goldfish_review_report_round3.md).

**Summary:**
- PROPOSE FIX: 6 (R4-M1–M6)
- PROPOSE FIX (Nit groups): 3
- DECLINE: 0
- CONTEST: 0
- ESCALATE: 0
- **Churn:** R4-M1 and R4-M2 come from earlier fixes. The fixes below replace those rules with better ones rather than reverting them.

---

## Prioritized Findings & AI Suggestions

### [R4-M1] Repeat-rule proposals go stale (churn)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** an edit whose `set` includes `repeat` (by `PATCH` or proposal) checks only `baseRuleVersion`. Its `dueOn` is a suggestion: on apply, if it's on or after today it's used, otherwise the server uses the first date the new rule gives on or after today. `baseCycleSeq` is kept only for swaps and for edits that change `dueOn` alone. Line 467's sentence is corrected to match. Test: a repeat proposal on a daily chore is accepted after a completion.

### [R4-M2] Delete fails behind the phone's own write (churn)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** task delete is conditioned on `ruleVersion` and `deletedAt` missing, not `updatedAt`. A restore and an assignee change both bump `ruleVersion`, so both reasons for the condition still hold. Each mutation reads its base versions from the optimistic cache when it runs, not when it was queued. Test: create then delete straight away, online and offline.

### [R4-M3] Launch hangs on weak signal
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** the service worker serves `/config.json` stale-while-revalidate: the cached copy at once, refreshed in the background. The persisted cache renders without waiting for the login provider. Every API fetch has a 10-second timeout (`AbortSignal.timeout`), so a hung request takes the network-failure retry path. The step 5 spike adds a weak-signal case using throttling and packet loss.

### [R4-M4] Signed up before opening the invite
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   The no-household screen leads with "Waiting for an invite? Open the link your partner sent you", before "Create a household".
    *   On accept, a caller who is the only member of a household with no tasks or items is asked to confirm moving. Their empty household (`META`, `MEMBER`, `MEMBERSHIP` and any invite pointers) is deleted and the new membership written in the same transaction. A non-empty household still gets `409 already_member`.
    *   New CUJ 11 and a test.

### [R4-M5] Second digest after midnight
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** the 2-hour catch-up window never crosses local midnight. Test for hours 22 and 23, for digests and nudges.

### [R4-M6] Deleting one shopping item
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** `DELETE /api/hh/items/:id` with `{ at }`, the client time of the delete (also allowed as a batch entry). It applies only if the item isn't already deleted and `at` is newer than every stored field time and than `restoredAt`, which a restore sets to server time. So a replayed delete can't overturn a restore, and the phone's own earlier tick doesn't block it. Added to the routes table and "Shopping-list conflicts".

### [Nits: design] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   A `dueOn` edit no longer clears a swap; only a `repeat` change does, and the task sheet warns "This cancels \<name\>'s swap".
    *   The complete response returns the `cycleSeq` it completed, which the undo toast uses. Before rules 1 and 4, the server checks whether this `mutationId` is already on the previous cycle's `DONE` record and, if so, treats the request as a repeat.
    *   Undo by a caller with no record for that cycle returns 200 and writes nothing.
    *   Notification tags: one per task and day for nudges, one per `mutationId` for "Let \<name\> know", one per day for the digest.
    *   `fixed`: weeks start on Monday; for months, `dayOfMonth` sets the day (default: `startOn`'s day) and `startOn` sets which months; days past the month's end clamp to its last day.
    *   `GET /api/hh/tasks` also returns the caller's own proposals resolved in the last 7 days, so the UI can show "No longer applies: the task changed".
*   **Nits: structure.** Link style for `discussion_summary.md`; "outside the household guard" on `POST /api/households`; the "applies directly" note as its own bullet; NFR labels "Performance & Cost" (references updated); a decisions-table row for `both` tasks.
*   **Nits: style.** Alternative C's rejection reworded once; "It uses the normal completion rules; the only addition is the `together` flag"; "One option is ICS links"; Alternative I's con names its parts (change feed, client merge step, tombstone handling).

---

## Resolution log (2026-11-11)

All PROPOSE FIX items were applied to `docs/designs/phase-1-foundation.md`. After the edits, FeatureRange is lines 1–796 and DetailedRange starts at line 797.

| Id | Where it landed |
|---|---|
| R4-M1 | Task writes: a `repeat` change checks only `baseRuleVersion` and carries a suggested `dueOn`, recomputed on apply if it's in the past; Proposals acceptance wording; tests in item 23 |
| R4-M2 | Task delete conditioned on `ruleVersion` and `deletedAt`; mutations read base versions when they run; items 21 and 23 |
| R4-M3 | `/config.json` stale-while-revalidate; cache renders without waiting for login; 10-second fetch timeout; weak-signal spike case (items 29a, 30 and 34) |
| R4-M4 | "Waiting for an invite?" on the no-household screen; moving out of an empty household on accept; new CUJ 11 with a test (items 18 and 19) |
| R4-M5 | Catch-up window never crosses local midnight; test for hours 22 and 23 |
| R4-M6 | `DELETE /api/hh/items/:id` with `{ at }`, beaten by `restoredAt`; routes table, item 27 and tests in item 28 |
| Nits | All applied: swaps survive `dueOn` edits; completion response returns its `cycleSeq` and retries are detected by `mutationId`; undo with no record is a no-op; notification tags; `fixed` week start and month rules; recently resolved proposals shown to the proposer; link styles; guard note; "Always direct" bullet; "Performance & Cost"; `both` decision row; four wording fixes |

**Stage 7 outcome:** accepted at round 4 of 5 by the author. Churn was found in round 4 (R4-M1, R4-M2) and resolved with replacement rules, not reverts. The fixes from this round haven't been re-read by a fresh reviewer; Stage 8 reads the whole document next.
