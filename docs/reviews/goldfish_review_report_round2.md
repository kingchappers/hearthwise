# Goldfish Annotated Review Report

**Target:** `docs/designs/phase-1-foundation.md` (lines 1–743, FeatureRange). Stage 7, round 2.
**Status:** resolved (2026-11-11). The author chose option A for R2-M8 and asked for every proposed fix to be applied (auto accept).
**Source findings:** [critic_report_round2.md](critic_report_round2.md). The ids below match that report. Round 1 is in [goldfish_review_report_round1.md](goldfish_review_report_round1.md).

**Summary:**
- PROPOSE FIX: 12 (R2-M1–M7, R2-M9–M13)
- PROPOSE FIX (Nit groups): 4
- DECLINE: 2 Nits
- CONTEST: 0
- ESCALATE: 1 (R2-M8)

---

## Escalated: needs the author's decision

### [R2-M8] [`egm-design`] - Severity: Major: can either person change a `both` task directly?
*   **Affected Scope:** lines 74, 335 and 433
*   ***AI Suggestion:*** ESCALATE
*   ***Author decision (2026-11-11):*** **Option A.** Rescheduling, changing the repeat rule of, or deleting a `both` task needs a proposal. Applied with the other fixes.
*   ***Justification:*** This is a product decision about the "no surprise changes" requirement, not a defect with one right answer.
*   **Options:**
    *   **A. A proposal is needed.** Rescheduling, changing the repeat rule of, or deleting a `both` task needs the other person's approval. Title, notes and checklist edits stay direct. This fits the "no surprise changes" row in the requirements, and adds friction for jobs like the big shop.
    *   **B. Direct changes, with history.** Either person can change a `both` task directly. The change is recorded in its history, and the goal is narrowed to say `both` tasks are shared. Less friction, but the other person can be surprised.

---

## Prioritized Findings & AI Suggestions

### [R2-M1] [`egm-design`] - Severity: Major: proposal transitions aren't replay-safe
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Traced: a lost accept response plus a retry marks an applied proposal `stale`.
*   ***Proposed Edit:*** accept, decline and withdraw each require `status = pending` (accept inside its transaction). A repeat call that finds the requested state already set returns 200 with no write. `stale` is only set while pending. Proposals are added to the replay-safety list. Tests in item 23.

### [R2-M2] [`egm-design`] - Severity: Major: an old tick re-ticks the new cycle
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** each tick carries `cycleSeq` and applies only when it equals `task.cycleSeq`; otherwise it's dropped (200, no write). Test in item 23.

### [R2-M3] [`egm-design`] - Severity: Major: completions make proposals stale
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Real in daily use: a proposal on a daily chore would almost never succeed.
*   ***Proposed Edit:*** replace `scheduleVersion` with `ruleVersion` (bumped by `assignee`, `repeat`, delete and restore). `edit`, `assign`, `delete` and `restore` proposals and `assignee`/`repeat` PATCHes check `ruleVersion`. `dueOn` PATCHes and `swap` proposals check `ruleVersion` and `cycleSeq`. Undo keeps its own guard: `cycleSeq` plus `dueOn` equal to the `setDueOn` it stored. Update the data model, Task writes, Proposals, Undo, and items 21 and 23.

### [R2-M4] [`egm-design`] - Severity: Major: 409s drop real actions silently
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** rule 4 splits: a higher `cycleSeq` where the client's cycle was undone (the task's `cycleSeq` is lower than the sent one) completes the current cycle using the client's `completedAt`. Every other user-initiated write dropped on 409 is listed in the banner as "Changed on <name>'s phone, please check". New Risks row.

### [R2-M5] [`egm-design`] - Severity: Major: undo and also-done records
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** if `ALSO` items exist for the cycle, the first completer's undo promotes the earliest one to be the completer on `DONE`, deletes that `ALSO` item, and leaves the cycle done. A caller who only has an `ALSO` item can undo, which deletes it. "Undo on every completion" then holds for both people.

### [R2-M6] [`egm-design`] - Severity: Major: list freezes while a write retries
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** polling continues while writes are pending. The pending-mutation overlay keeps optimistic changes visible. A response whose request started before the latest household mutation settled is ignored. The banner shows pending writes. Items 24 and 29 updated.

### [R2-M7] [`egm-design`] - Severity: Major: creating a task for the other person
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** the client sends a create with `assignee: either`, then an `assign` proposal, as two queued mutations. The server never writes on `403 proposal_required`. A `proposal_required` result during replay goes to the banner with an "Ask <name>" action.

### [R2-M9] [`egm-design`, `egm-structural`, `egm-style`] - Severity: Major: unlinked alternatives
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** add a "Decisions made while drafting the design (2026-11-10)" list to `discussion_summary.md` covering D and F–J (the choices the author made at the drafting gates), and link each alternative to it. Drop `comprehension_report.md` from the lead-in.

### [R2-M10] [`egm-structural`] - Severity: Major: letter clash
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** one line under the Alternatives lead-in: "The letters here are this document's own. `discussion_summary.md` uses 'option B' for the chosen design."

### [R2-M11] [`egm-style`] - Severity: Major: "never reused"
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** "It only goes back when an undo returns it to the undone cycle, whose `DONE` record the undo deleted. Unlike a date, an early completion or a `dueOn` edit can't make it collide with an earlier cycle's record."

### [R2-M12] [`egm-style`, `egm-design`] - Severity: Major: DynamoDB billing mode
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Checked: Hoardwise's table is on-demand (`PAY_PER_REQUEST`).
*   ***Proposed Edit:*** state that the table is on-demand, as in Hoardwise; give the read and write cost per million request units and the resulting estimate (well under US$1 a month); add "Checked 2026-11-11" to the pricing figures; quantify the margin in Risks.

### [R2-M13] [`egm-style`] - Severity: Major: slow clocks
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** "While a phone's clock is slow, its edits lose to any newer-stamped edit of the same field. Nothing is corrupted. Phones that set their time automatically are rarely affected."

### [Nits: concurrency] [`egm-design`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** all items in the critic report's concurrency group: completion requires `deletedAt` missing; delete conditional on the loaded `updatedAt`; held pushes claimed before sending; notify only after a successful write and undo removes a matching `HELD`; local invite sign-up in one transaction; sign-out warning with pending writes; invite refused at `memberCount = 2`; removal clears overrides and history shows "Former member"; no empty digest; service worker update waits for the next launch (no `skipWaiting()` with open pages).

### [Nits: diagram and structure] [`egm-structural`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** diagram glyph, two-way arrow 6 and label 3 placement; correct the "Performance and cost" cross-reference; route groups and member settings as H4s; nested Pros/Cons lists throughout; Open Questions reduced to "None open." with the confirmation moved to Risks and linked to the requirements section; `PushCheck` named where it's introduced; `docs/MANUAL-CHECKS.md` described as created in step 7.

### [Nits: wording] [`egm-style`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** style Nits N1, N3–N9, N11–N21 as worded in the critic report: calibrated problem framing, split notification goal, Non-Goals points to Alternative D, "Records that build up automatically expire", merged E Pros, neutral wording for superlatives, "keeps the usual delay under the 15-second goal", one scale threshold (expected under 500 records; pagination added at 500), Proton deferred to phase 4, "used day to day".

### [Nit] [`egm-style`] - Severity: Nit: N2, the inferred outcomes in the problem list
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** "Missed or bought twice" and "memory and argument" describe what happens with no shared list, and the author wrote the problem framing. Marking them as inferred adds noise without changing scope.

### [Nit] [`egm-style`] - Severity: Nit: N10, cite Hoardwise's design aim
*   ***AI Suggestion:*** DECLINE (partly)
*   ***Justification:*** "calm" is dropped under the wording group. The design aim is in Hoardwise's README and CLAUDE.md, which the Overview already points to; a further citation adds little.

---

## Resolution log (2026-11-11)

All PROPOSE FIX items were applied to `docs/designs/phase-1-foundation.md`, plus the author's decision on R2-M8. The 2 DECLINE items were left as they were. After the edits, FeatureRange is lines 1–768 and DetailedRange starts at line 769.

| Id | Where it landed |
|---|---|
| R2-M1 | Proposals, "Retries and races": every transition requires `status = pending`; repeats are no-ops; added to the replay-safety list; item 21 and tests in item 23 |
| R2-M2 | Task writes: ticks carry `cycleSeq` and are dropped for an old cycle |
| R2-M3 | `scheduleVersion` replaced by `ruleVersion` (assignee, repeat, delete, restore); `dueOn` edits and swaps also check `cycleSeq`; undo guards on `cycleSeq` and `setDueOn` |
| R2-M4 | Completion rule 4 (a higher `cycleSeq` completes the current cycle) and rule 5 (409 shown in the banner); banner wording in error handling; new Risks row |
| R2-M5 | Undo rewritten for three cases (also-done only, promote the earliest `ALSO`, only completer); `alsoCount` on `DONE` prevents orphaned `ALSO` items |
| R2-M6 | Polling continues while writes are pending; stale responses discarded; items 24 and 29 |
| R2-M7 | The client queues a create as `either`, then an `assign` proposal; a replayed `proposal_required` goes to the banner |
| R2-M8 | Option A: schedule changes and deletion on `both` tasks need a proposal (Proposals, Recycle bin, items 21, 23, 25 and 25a); recorded in `discussion_summary.md` |
| R2-M9 | New "Decisions made while drafting the design" list in `discussion_summary.md`; D and F–J link to it; lead-in no longer lists `comprehension_report.md` |
| R2-M10 | Lead-in explains the lettering differs from the summary's |
| R2-M11 | `cycleSeq` note says when it goes back |
| R2-M12 | Performance and cost: on-demand DynamoDB, read-unit estimate, prices checked 2026-11-11; Risks row quantified |
| R2-M13 | Clock-skew Risks row reworded |
| Nits: concurrency | Completion requires `deletedAt` missing and re-runs on a race; conditional delete; held pushes claimed before sending; notify only after success and undo removes the held push; local invite sign-up in one transaction; sign-out confirmation; full-household invite refused; removal clears overrides and shows "Former member"; no empty digest; no `skipWaiting()` |
| Nits: diagram and structure | Diagram glyph, two-way arrow 6, label 3; "Performance and cost" reference; route groups and member settings as H4s; nested Pros/Cons in all 14 alternatives; Open Questions is "None open." with the confirmation in Risks; `PushCheck` introduced; `docs/MANUAL-CHECKS.md` described |
| Nits: wording | All listed items applied |
