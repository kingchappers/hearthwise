# Stage 6: Comprehension Test

*   **Target:** `docs/designs/phase-1-foundation.md` (FeatureRange 1–553, DetailedRange 554–1010)
*   **Reviewer:** `egm-comprehension` (fresh context, the document alone, no standard)
*   **Date:** 2026-11-10
*   **Verdict:** Needs revision. 0 Blockers, 8 Major, 8 Nits.

## What this proposes

Hearthwise is a new web app (an installable PWA) for a two-adult household. The two adults have different needs. Phase 1 covers four things:
- a shared household that the second person joins through a one-time invite link
- chores and one-off tasks, stored as one "task" model with repeat rules (`after`, `fixed`, `none`)
- a shopping list that works offline
- per-person settings: view, quiet hours, and opt-in digest and due-nudge reminders

Other phones see changes by polling every 10 s. Push messages are only sent when the sender ticks "Let <name> know", or for reminders a person turns on for themselves.

Each due cycle gets exactly one completion record, written put-if-absent, so a chore's date moves only once when both people complete it. Shopping-list conflicts are settled per field by timestamp, and deletions are final tombstones. Offline writes use TanStack Query's persisted paused mutations, and every write is designed to be safe to replay. Changing assignee, due date or repeat on the other person's task creates a proposal they accept or decline. "I did this today" completes any task with no proposal. Deletes go to a 30-day recycle bin.

The app runs on AWS (Lambda + DynamoDB) and also as a self-hosted container (SQLite). The work is planned as seven PRs.

## How the existing system works, per this document

Hoardwise is the author's existing personal budgeting app. Hearthwise copies its scaffolding: React Router SPA, API and static Lambdas, a `Store` interface with DynamoDB, SQLite and in-memory versions, Auth0 or single-account local login, OpenTofu, and an hourly push Lambda.

Hoardwise keys all data to one user (`USER#<id>`). Its `Store.transact` only supports conditional put and delete. Its offline writes use a custom transaction-only queue. Its service worker only handles push and is only registered when reminders are on. Its container has no push. It has a 30-day trash with a restore hook, and undo duration is a per-person client preference.

## Findings

**Note from the author's agent:** finding 1 is a real editing slip. While applying the Stage 5 fixes, the rewrite of plan item 34 also removed the `### Step 6: Notifications` heading that came right after it.

### 🟡 1. Major: The Step 6 heading is missing from the detailed plan (lines 864–981)

The step table says Step 6 is Notifications, but there's no `### Step 6` heading. Items 35–39 therefore sit under "Step 5: Offline". Someone turning steps into Linear issues would put the push work in the offline PR.

### 🟡 2. Major: Step 7's contents don't match its table row (lines 570, 982–995)

The table promises:
- an accessibility pass
- a wording review
- a PWA install check
- an iPhone push check
- a README and deployment docs

Items 40–41 only cover the wording test and the docs. The manual check is in Verification, not in a step.

### 🟡 3. Major: The difference between `either` and `both` is never defined (lines 72, 281, 342, 383, 396)

With one completion per cycle, a `both` task behaves exactly like `either`. The document doesn't say whether `both` means each person must do it, or is only a label. The digest also leaves out `both`, while nudges and the Goals include it.

### 🟡 4. Major: There's no route for loading proposals (lines 141, 343, 348, 806)

Polling only refetches tasks and items, and there's no `GET` route for proposals. It's unclear how pending proposals reach the client.

### 🟡 5. Major: The ownership rules don't cover the full Goal (lines 72, 140, 342–343)

- Edits to the other person's title, notes or checklist, and **deleting** their task, aren't covered.
- CUJ 6 says "for this week", which implies a temporary reassignment that the proposal model can't express. The shape of `change` is never defined.
- It's unclear how the server decides between "proposal" and "apply directly" when the edit arrives as a full `PUT`.

### 🟡 6. Major: Auth0 mode and local mode are never explained, and Auth0 sign-up is left open (lines 162, 234–241, 403, 532)

The document never says how the mode is chosen. In Auth0 mode, nothing stops any Auth0 user from calling `POST /api/households`.

### 🟡 7. Major: Hoardwise is relied on but only introduced late (lines 18, 432, 558)

It's first described properly at line 432. One sentence plus a link in the Overview would fix this.

### 🟡 8. Major: The completion rules leave cases unexplained (lines 299–316)

- A `cycleDueOn` that's *newer* than `task.dueOn` isn't handled.
- After an undo, the other person's kept `ALSO` items leave it unclear whether the cycle shows as done, and what history shows.
- It's unclear whether undo restores the `checklistState` that was cleared at completion.

### 🟢 9. Nit: The Alternatives are out of order (H, H3, H2)

### 🟢 10. Nit: Some process terms aren't defined

"The Stage 5 review", `discussion_summary.md` (no path), "10 s is mechanical", `/security-review` and "Drafted with EGM".

### 🟢 11. Nit: The undo duration setting isn't part of Hearthwise's settings

Rule 6 justifies "no server time limit" with Hoardwise's undo duration preference, but Hearthwise's settings don't include one.

### 🟢 12. Nit: Several fields have no stated shape

- the proposal `change`
- `quietHours`, and how it's validated
- the anchor for `fixed` rules with `every` greater than 1
- whether a one-off task must have a `dueOn`

### 🟢 13. Nit: It's unclear whether quiet hours also hold back your own digest or nudges

### 🟢 14. Nit: The phase numbering doesn't line up

The Overview, the Non-Goals and `ROADMAP.md` "phases 1–5" don't agree, which leaves DIY or the Hoardwise integration unplaced.

### 🟢 15. Nit: CUJ 8 has no named automated test, despite the coverage claim at line 1002

### 🟢 16. Nit: The cache key says `userSub`, but local-mode ids aren't Auth0 subs

Calling it "user id" would match the rest of the design.

---

## Resolution log (2026-11-11)

| # | Resolution |
|---|---|
| 1 | **Fixed.** `### Step 6: Notifications` heading restored before item 35. |
| 2 | **Fixed.** Item 40a (accessibility pass) and item 40b (`docs/MANUAL-CHECKS.md`, the real-phone install and push checklist) added to Step 7. Verification now refers to the checklist. |
| 3 | **Fixed (author decision: "do it together").** `both` is a job done together: one tap completes it for both, and the `DONE` record has `together: true`. The digest now includes `both`. |
| 4 | **Fixed.** Pending proposals are returned with `GET /api/hh/tasks`, so polling picks them up. |
| 5 | **Fixed (author decisions: one-off swaps; schedule + delete need a proposal).** The `change` shapes are defined (`edit`, `swap`, `delete`). Title, notes and checklist edits apply directly, with `EDIT#` history. The server returns `403 proposal_required`. Swaps use `overrideAssignee`/`overrideCycle`, which clear on completion or on any `dueOn` edit. CUJ 6 reworded. |
| 6 | **Fixed (author decision: allow open Auth0 sign-up for now, with alerts).** Login modes explained. Open Auth0 sign-up is recorded as an accepted risk. New "Sign-up alerts" section and item 16a (CloudWatch alarm to SNS email on AWS, log line plus optional webhook in the container). Limiting sign-up added to Future Improvements. |
| 7 | **Fixed.** Hoardwise introduced in the Overview with its path, GitHub link and reference commit. |
| 8 | **Fixed.** A newer `cycleDueOn` returns 409. After undo, a cycle counts as done only while its `DONE` record exists, and kept `ALSO` items show as "also did it". Undo restores `checklistState` from the `DONE` record. |
| 9 | **Fixed.** Alternatives reordered H, H2, H3. |
| 10 | **Fixed.** `discussion_summary.md` linked. "Stage 5 review" and "10 s is mechanical" reworded. `/security-review` explained. "Drafted with EGM" kept as the template's provenance line. |
| 11 | **Fixed.** Undo duration is a per-device client preference, as in Hoardwise. It isn't part of `settings`. |
| 12 | **Fixed.** Shapes defined: `quietHours` (whole hours, wraps past midnight), `startOn` anchors "every N", and one-off tasks can have no date (shown in a "Whenever" group). |
| 13 | **Fixed.** Quiet hours only hold back the other person's pushes. Your own reminders are sent at the hour you chose, and Settings notes any overlap. |
| 14 | **Fixed.** Phases are 2 meal plan, 3 money, 4 calendar and 5 DIY. Hoardwise integration is unscheduled. |
| 15 | **Fixed.** CUJ 8 test named in item 39. |
| 16 | **Fixed.** The cache key uses `userId`. |

---

## Re-audit (2026-11-11, the one allowed re-audit)

**Verdict:** the reviewer could paraphrase every section. 0 Blockers, 2 Major, 5 Nits, all fixed below. The re-audit cap is now used up.

| # | Finding | Resolution |
|---|---|---|
| R1 | 🟡 A proposal goes "stale" based on `updatedAt`, but nothing stores the starting value, and it's unclear which writes change it | **Fixed.** New task field `scheduleVersion`, bumped only by changes to assignee, due date, repeat, overrides, delete or restore, and by completions. Proposals store `baseScheduleVersion`, and accept requires them to match. Title, notes and checklist changes never make a proposal stale. |
| R2 | 🟡 `user_first_seen` has no marker, so it would alert on every request | **Fixed.** `USER#<id>/SEEN` is written put-if-absent, and the event is logged only when that write succeeds. Exactly one alert per new account. |
| R3 | 🟢 Undo needs the date the completion set | **Fixed.** `DONE` stores `setDueOn`. |
| R4 | 🟢 Tombstone rule for tasks unstated | **Fixed.** Any write to a deleted task returns 410 and is dropped. Only a restore brings it back. |
| R5 | 🟢 `EDIT#` history is never shown | **Fixed.** `GET /api/hh/tasks/:id/history` covers completions and edits, shown by `TaskHistory` on the task page. |
| R6 | 🟢 The "Whenever" group and past-due placement are missing from the Views | **Fixed.** Four groups: Today (including past due), This week, Later and Whenever. |
| R7 | 🟢 An unexplained personal term, the open-question history and "Linear" aren't explained | **Fixed.** All three explained in place. |
