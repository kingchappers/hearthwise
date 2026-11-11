# Goldfish Annotated Review Report

**Target:** `docs/designs/phase-1-foundation.md` (lines 1–591, FeatureRange). Stage 7, round 1.
**Status:** resolved (2026-11-11). The author asked for every proposed fix to be applied (auto accept).
**Source findings:** [critic_report_round1.md](critic_report_round1.md). The ids below match that report. Each entry gives the suggestion and the planned edit. The full discrepancy text is in the critic report.

**Summary:**
- PROPOSE FIX: 19 (B1, B2, M1–M17)
- PROPOSE FIX (Nit groups): 4
- DECLINE: 4
- CONTEST: 0
- ESCALATE: 0

---

## Prioritized Findings & AI Suggestions

### [B1] [`egm-design`] - Severity: Blocker: a completion key can be reused, so an early `after` chore gets stuck
*   **Affected Scope:** lines 290, 323–345 and 380 (Completing a task; Data model; Proposals)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Traced by hand: an `after 1` chore that's due tomorrow and done today writes `DONE#…#tomorrow`, and `dueOn` doesn't move. It's a real defect in the core CUJ 7 flow.
*   ***Proposed Edit:***
    *   Task gets `cycleSeq` (an integer, starting at 1, going up by 1 on every completion).
    *   The completion key becomes `DONE#<taskId>#<cycleSeq>`, with `cycleDueOn` stored as an attribute. The client sends the `cycleSeq` it saw.
    *   Rules 1–5 are rewritten in terms of `cycleSeq`:
        - equal: complete the cycle
        - lower, with a `DONE` record: also done by
        - lower, with no `DONE` record, or higher: 409
    *   For `after` chores, `nextDueOn = max(completionDay + days, cycleDueOn + 1 day)`.
    *   Add tests for early completion and for "an edit moves `dueOn` back".

### [B2] [`egm-design`] - Severity: Blocker: task updates aren't safe to replay
*   **Affected Scope:** lines 322, 345, 393–396 and 445–446
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** `PUT` fully overwrites the task, and checklist state is stored as one value. Both break the "every write is safe to replay" claim the offline design depends on.
*   ***Proposed Edit:***
    *   `POST /api/hh/tasks` creates (put-if-absent). `PATCH /api/hh/tasks/:id` changes only the fields it names. `PUT` is removed.
    *   `title` and `notes` use per-field timestamps (`fieldTimes`), as shopping items do.
    *   The checklist becomes `checklist: [{ id, text }]` plus `checklistState: { [stepId]: { done, at } }`. Ticks are applied per step, using the timestamp.
    *   Schedule fields (`dueOn`, `repeat`, `assignee`) in a `PATCH` must carry `baseScheduleVersion`, or the server returns 409. Only the owner, or the proposal-accept path, can change them.
    *   Completion, undo and proposal accept are the only other writers of `dueOn`.

### [M1] [`egm-style`, `egm-structural`] - Severity: Major: the diagram contradicts the text
*   **Affected Scope:** lines 174–199 (Components)
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Both reviewers caught it independently. The arrow sends sender-chosen pushes through the scheduler.
*   ***Proposed Edit:*** Redraw the diagram so the API sends direct web-push for "Let <name> know", the scheduler sends only digests, nudges and held pushes, delivery arrows run from the push services to the phones' service workers, and the box borders are intact.

### [M2] [`egm-design`] - Severity: Major: a push sent after the response isn't reliable on Lambda
*   **Affected Scope:** lines 412–414
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** A Lambda can be frozen as soon as the handler returns, so work started afterwards may never run.
*   ***Proposed Edit:***
    *   Send the push before returning, with a 2-second timeout. A failure is logged and never fails the request.
    *   Each push gets an idempotency key (the client mutation id), stored put-if-absent as `NOTIFY#<id>` with a 1-day expiry, so a retry doesn't push twice.
    *   The client sends `clientAt`. A replay more than 30 minutes old sends no push.
    *   Batch combining only applies within one request.

### [M3] [`egm-design`, `egm-style`] - Severity: Major: CloudWatch alarms don't fire once per event
*   **Affected Scope:** lines 224–232 and 569
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   On AWS, the API publishes each `security_event` directly to an SNS topic (`ALERT_TOPIC_ARN`) with an email subscription to `alert_email`. Drop the metric filter and alarm.
    *   `noteUserSeen()` runs on every authenticated route, including `/api/households` and `/api/invites/accept`.
    *   The wording becomes "one alert per event".

### [M4] [`egm-design`] - Severity: Major: TanStack persistence isn't shown to work
*   **Affected Scope:** lines 387–402
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Specify `shouldDehydrateMutation` for every pending `household` mutation.
    *   On restore, mark hydrated pending mutations as paused, then call `resumePausedMutations()`.
    *   Set the persister `throttleTime: 0`, and flush on `visibilitychange`/`pagehide`.
    *   The IndexedDB key includes the user id. A mismatch on restore throws the entry away.
    *   Step 5 starts with a spike and tests for: kill during backoff, kill within 1 s of a write, and switching accounts. If the spike fails, use Alternative H2 (the custom queue).

### [M5] [`egm-design`] - Severity: Major: a poll can overwrite pending optimistic ticks
*   **Affected Scope:** lines 65, 135 and 384–400
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   List refetches are skipped while any `household` mutation is pending.
    *   Each mutation's optimistic `onMutate` is re-applied over refetched data until it settles.
    *   Add a test for it.

### [M6] [`egm-design`] - Severity: Major: "Clear ticked" deletes unconditionally
*   **Affected Scope:** lines 351–354
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   A batch delete from "Clear ticked" carries each item's `fieldTimes.ticked` as the client saw it.
    *   The server deletes only if the item is still ticked and its stored `fieldTimes.ticked` is at or before that value.
    *   The response lists skipped ids, and the client shows "1 item kept: it was unticked on another phone".

### [M7] [`egm-design`] - Severity: Major: replayed `after` completions use the server's date
*   **Affected Scope:** lines 320 and 343
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   The complete request carries `completedAt` (client time, clamped to server time + 5 minutes).
    *   The completion day is `completedAt` in the household's timezone.

### [M8] [`egm-structural`, `egm-design`] - Severity: Major: there's no Risks & Mitigations section
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** a new `## Risks and Mitigations` table, after Non-Functional Requirements. One row each for:
    - open Auth0 sign-up
    - client clock skew, including slow clocks
    - iOS storage eviction
    - service worker and data version mismatch (a `schemaVersion` on the persisted cache; a newer build throws away an older cache, but replays its mutations first)
    - an Auth0 outage
    - a single maintainer running two targets
    - polling cost
    - the scale ceiling
    - the iOS push requirement
    - the Tody trial not being run (an accepted risk)

### [M9] [`egm-structural`, `egm-design`, `egm-style`] - Severity: Major: Alternatives don't meet the Alternatives Rule
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Each "Reason" states a concrete trade-off, and links [discussion_summary.md](../../discussion_summary.md) or the review report where the decision was recorded.
    *   C's reason: the trial would test generic apps, not the two-person, mixed-needs model. Recorded as an accepted risk in Risks.
    *   E's reason: the porting cost after the codebases drift apart is higher than building both now.
    *   Renumber A–L, use the Pros/Cons/Reason template throughout, and fix the cross-reference.
    *   Reword unsupported estimates neutrally.

### [M10] [`egm-design`] - Severity: Major: ownership can be bypassed
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Creating a task assigned to the other person, or reassigning any task to them, creates a proposal (`kind: 'assign'`).
    *   Restoring a deleted task owned by the other person creates a proposal (`kind: 'restore'`).
    *   Only `toUserId` can accept or decline.
    *   Add `POST /api/hh/proposals/:id/withdraw`, for the proposer only.

### [M11] [`egm-design`] - Severity: Major: records grow without limit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Done one-off tasks get `expiresAt` 30 days after completion, and the task list leaves out tasks done more than 7 days ago.
    *   `DONE`, `ALSO` and `EDIT` records get a 400-day expiry.
    *   A Store contract test confirms `query` pages past 1 MB.

### [M12] [`egm-design`] - Severity: Major: no way to remove a member or revoke an invite, and the cap isn't atomic
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   `DELETE /api/hh/invites/:hash` (revoke).
    *   `DELETE /api/hh/members/:userId`, for the household creator only, never themselves. It removes that member's `MEMBERSHIP` and `MEMBER` records. Their tasks become `either`.
    *   `HH#/META.memberCount` is checked (`ifEquals 1`) and incremented inside the accept transaction.

### [M13] [`egm-style`] - Severity: Major: the "never comes back" claims are overstated
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** reword lines 65 and 135, and the conflicts section, to "an edit with an older timestamp". Slow clocks go into Risks as an accepted limitation.

### [M14] [`egm-style`] - Severity: Major: the cost claims have no numbers
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Show the arithmetic: 2 requests every 10 s = 720 an hour per visible device. Two devices for 3 hours a day is about 130k a month.
    *   List each allowance: Lambda (1M a month, permanent), DynamoDB (25 read and write units, permanent), API Gateway HTTP API (1M a month, first 12 months only, then about $1 per million).

### [M15] [`egm-style`] - Severity: Major: "task" has two meanings
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** add a glossary line in the Overview (task = any chore or to-do; chore = a repeating task; to-do = a one-off task) and use the terms consistently.

### [M16] [`egm-structural`] - Severity: Major: Future Improvements is under NFR
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** make `### Future Improvements` an H2.

### [M17] [`egm-design`] - Severity: Major: swap undo, transaction conflicts and scheduler hours
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   `DONE` stores the cleared `overrideAssignee`/`overrideCycle`, and undo restores them.
    *   The server retries DynamoDB `TransactionCanceled` with reason `TransactionConflict` up to 3 times.
    *   `MEMBER` stores `lastDigestSent`/`lastNudgeSent` (local date and hour), checked put-if-not-equal before sending.

### [Nits: auth] [`egm-design`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   A password reset deletes only that user's sessions.
    *   Throttle rows get a 1-day expiry.
    *   The invite token moves to `localStorage` with a 1-hour expiry, so it survives email verification opening a new tab.

### [Nits: model] [`egm-design`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   With `cycleSeq`, undated to-dos need no date in their key.
    *   `fixed` edge cases:
        - `dayOfMonth` 29–31 clamps to the month's last day
        - every N weeks is anchored to the week containing `startOn`
        - a late daily fixed chore moves to tomorrow
    *   The digest includes undone items from earlier days.
    *   "Undo on every save" narrowed to completes and deletes.

### [Nits: wording] [`egm-style`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Use the measurable "15 seconds".
    *   Add the quiet-hours exception to the goal at line 58.
    *   Format `either`/`both` as code.
    *   Name Hearthwise explicitly where "It" is unclear.
    *   Move the Google Tasks/OneNote outcome into the success measure.
    *   Drop hedges and repetition (lines 83, 85, 91, 92–97, 103).
    *   Rewrite CUJ 8's "Then" sentence.
    *   Say the 10-second interval was decided by the author.
    *   "In-memory store: an atomic check-then-write".
    *   Give the error `409 household_full` for a third member.
    *   Move the general rules out of the completion steps.
    *   Drop "really", "simply" and "fully".
    *   Use the third person throughout.
    *   Say "replayed paused mutation", not "offline queue".
    *   Retitle the goal to "Changes to the other person's task need their approval".
    *   "Behind nothing" becomes "without a feature flag".
    *   WebSocket trigger: "if users report changes taking more than 15 s to appear".
    *   The no-auto-notify rule's repeats point back to the goal.

### [Nits: structure] [`egm-structural`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:***
    *   Name "the steps in Detailed Implementation Plan".
    *   Give Undo and `nextDueOn` their own sub-headings.
    *   Move Sign-up alerts after Invites.
    *   Put the data model rows in order, and move the settings note out of the field list.
    *   Tidy the API table: grouped, one route per row, full paths, `:id` placeholders.
    *   Link the Apple pages.
    *   Add CUJ 9 (restore from the recycle bin) and CUJ 10 (an expired invite link).

### [Nit] [`egm-structural`] - Severity: Nit: mixed bullet markers
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** Cosmetic. Markdown renders both the same, and changing them touches hundreds of lines without changing meaning.

### [Nit] [`egm-structural`] - Severity: Nit: inconsistent horizontal rules
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** They follow the EGM template, which puts rules around NFR and the implementation plan.

### [Nit] [`egm-structural`] - Severity: Nit: Hoardwise permalinks
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** The Overview already pins commit `b50544f` and the repo link. Permalinks for every file add length without new information.

### [Nit] [`egm-structural`] - Severity: Nit: rename sections to match the standard
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** The reviewer says the standard's labels are non-exhaustive examples, and the section names follow the EGM design template (`references/design_doc.md`).

---

## Resolution log (2026-11-11)

All PROPOSE FIX items were applied to `docs/designs/phase-1-foundation.md`. The 4 DECLINE items were left as they were. After the edits, FeatureRange is lines 1–743 and DetailedRange starts at line 744 (`## Detailed Implementation Plan`).

| Id | Where it landed |
|---|---|
| B1 | Task `cycleSeq`; `DONE#<taskId>#<cycleSeq>` (zero-padded); "Completing a task → Rules" rewritten; `after` uses `max(completion day + days, cycleDueOn + 1)`; tests in items 20 and 23 |
| B2 | New "Task writes" section: `POST` create, `PATCH`-only updates, `fieldTimes` for title/notes/checklist, per-step `checklistState`, schedule fields need `baseScheduleVersion`; `PUT` removed from the API table; replay-safety list updated |
| M1 | Components diagram redrawn with numbered edges and a legend |
| M2 | Push sent before the response with a 2 s timeout; `NOTIFY#<mutationId>` marker; 30-minute replay rule; batch combining scoped to one request (Notifications, items 36 and 38) |
| M3 | Direct SNS publish via `ALERT_TOPIC_ARN`; `noteUserSeen()` on every authenticated route; "one alert per event" (Sign-up alerts, item 16a) |
| M4 | User-keyed IndexedDB entry, `throttleTime: 0`, save on `visibilitychange`/`pagehide`, re-pause on restore, step 5 spike (item 29a) with Alternative K as fallback |
| M5 | Refetch skipped while household mutations are pending; pending optimistic changes applied with `select` (Sync, items 24 and 29) |
| M6 | Conditional "clear ticked" with skipped ids reported (Shopping-list conflicts, items 27–29) |
| M7 | `completedAt` on completion; completion day from it in the household timezone |
| M8 | New "Risks and Mitigations" section with 10 rows |
| M9 | Alternatives renumbered A–N, one per heading, each with a concrete trade-off and a link to where it was decided |
| M10 | `assign` and `restore` proposals; only `toUserId` accepts/declines; withdraw route |
| M11 | Done to-dos expire after 30 days and leave the list after 7; `DONE`/`ALSO`/`EDIT` expire after 400 days; resolved proposals after 30; Store `query` paging contract test |
| M12 | Invite pointer items, list and revoke routes; member removal by the creator; atomic `memberCount` |
| M13 | "Never comes back" claims narrowed to "an edit with an older timestamp"; slow clocks in Risks |
| M14 | Polling arithmetic and per-service allowances in "Performance and cost" |
| M15 | Glossary in the Overview; task/chore/to-do used consistently, including the title |
| M16 | Future Improvements is an H2 |
| M17 | `clearedOverride` on `DONE` and restored by undo; `TransactionConflict` retries in the DynamoDB store; `lastDigestSent`/`lastNudgeSent` with a conditional update |
| Nits: auth | Per-user password reset, 1-day throttle expiry, invite token in `localStorage` for 1 hour |
| Nits: model | No date in completion keys; `fixed` edge cases; digest includes earlier undone tasks; undo narrowed to completions and deletes |
| Nits: wording | All listed items applied |
| Nits: structure | Sign-up alerts after Invites; Rules/Undo/next-due sub-headings; data model rows ordered and settings moved out; API table split into four groups, one route per row; Apple pages linked; CUJ 9 and CUJ 10 added with tests |
