# Stage 7: Critic Review, round 1

*   **Target:** `docs/designs/phase-1-foundation.md`, FeatureRange lines 1–591
*   **Reviewers (fresh context, all completed):**
    - `egm-design`, against `feature-spec-standard.md`
    - `egm-structural`, against `feature-spec-standard.md`
    - `egm-style`, against its own persona rubric
*   **Goldfish context:** `discussion_summary.md` and the Hoardwise files `CLAUDE.md`, `src/store/types.ts`, `src/auth/localData.ts`, `app/lib/offlineQueue.ts`, `src/push/scheduler.ts` and `public/sw.js`
*   **Date:** 2026-11-11
*   **Raw counts:** design 2 Blocker, 11 Major, 9 Nit. Structure 5 Major, 9 Nit. Style 4 Major, 19+ Nit.
*   **After deduplication:** 2 Blocker, 17 Major, about 30 Nits (grouped below).

**Checked by the author's agent:** B1 was traced by hand and is real. An `after 1 day` chore that's due tomorrow and completed today gets `nextDueOn` = tomorrow = `cycleDueOn`. It writes `DONE#…#<tomorrow>` and leaves `dueOn` where it is. Tomorrow's real completion then takes the "also done by" path, so the date never moves again.

---

## 🔴 Blockers

### B1. A completion key can be reused, so an `after` chore completed early gets stuck (design-1-B1)
*   **Scope:** lines 290, 323–345 and 380; CUJ 7.
*   **Problem:**
    - `DONE` is keyed by `<taskId>#<cycleDueOn>`.
    - For `after` chores, `nextDueOn = today + days` can be equal to or earlier than `cycleDueOn` when the chore is done early. That's CUJ 7's own flow.
    - An edit that moves `dueOn` back onto a date that already has a `DONE` record hits the same collision.
    - Real completions are then swallowed as duplicates, which is the same flaw the design gives for rejecting Alternative G.
*   **Proposed fix:**
    - Key cycles by a value that's never reused. The task gets a `cycleSeq` counter that goes up on every completion. The client sends the `cycleSeq` it saw, and `DONE#<taskId>#<cycleSeq>` records the date as an attribute.
    - Require `nextDueOn > cycleDueOn` for `after` chores, and push the date on if it isn't.
    - Add tests for early completion of an `after` chore, and for an edit that moves `dueOn` back.

### B2. Task updates aren't safe to replay and can silently reverse completions (design-1-B2)
*   **Scope:** lines 322, 345, 393–396 and 445–446.
*   **Problem:**
    - `PUT` fully overwrites a task with no condition. A replayed offline title edit can:
      - restore an old `dueOn`, reversing the other phone's completion
      - bring back swap fields the completion had cleared
      - leave an orphaned `DONE` record
    - `PATCH checklistState` overwrites the whole value. Two people ticking different steps lose ticks.
    - "Create or update" turns a replayed create into a blind overwrite.
*   **Proposed fix:**
    - Split create (`POST`, put-if-absent) from update (`PATCH` only).
    - Plain edits can't change schedule fields. Only completion, undo, proposal accept, and the owner's own schedule edit can, and the last of these must carry `baseScheduleVersion`, returning 409 if it doesn't match.
    - Title and notes use per-field timestamps, like shopping items.
    - Checklist ticks are stored per step, with per-step timestamps.

---

## 🟡 Majors

### M1. The components diagram contradicts the text and is malformed (style-1-2, structural-1-4)
*   **Scope:** lines 174–199.
*   **Problem:**
    - The `web-push ("Let <name> know")` arrow points into the hourly scheduler, but the text sends these pushes directly from the API.
    - There's no edge for push delivery back to the phones.
    - Box borders are broken at lines 179–181.
*   **Proposed fix:** redraw the diagram so that:
    - the API sends direct pushes to the push services
    - the scheduler sends only digests, nudges and held pushes
    - delivery arrows go back to the phones' service workers

### M2. "Let <name> know" is sent after the response, which Lambda doesn't guarantee (design-1-M1)
*   **Scope:** lines 412–414.
*   **Problem:**
    - A Lambda can freeze as soon as the handler returns, so the push may never be sent.
    - Replayed offline mutations would push hours late.
    - Retries could push twice.
    - TanStack replays mutations one at a time, so the "one combined push" for a batch doesn't hold during replay.
*   **Proposed fix:**
    - Send the push before returning, with a 2-second timeout. A push failure is logged and never fails the request.
    - Give each notify an idempotency key (the mutation id), stored put-if-absent, so a retry doesn't push twice.
    - Have the client send `clientAt`. Replays more than 30 minutes old send no push.
    - Drop the batch-combining claim during replay.

### M3. CloudWatch alarms don't alert on every event (design-1-M2, style-1-16)
*   **Scope:** lines 224–232 and 569.
*   **Problem:**
    - Alarms notify on a change of state, so sign-ups that come close together produce one email or none.
    - The emails carry no ids.
    - "Exactly one alert per account" ignores the separate household event.
    - The SEEN marker is written in the guard, but `/api/households` and `/api/invites/accept` are outside it.
*   **Proposed fix:**
    - Publish each `security_event` directly to SNS from the API. The SNS topic is set by OpenTofu, and the email subscription comes from `alert_email`.
    - Write SEEN from a shared `noteUserSeen()` that runs on every authenticated route, not only in the guard.
    - Narrow the wording to one alert per event type.

### M4. TanStack persistence behaviour isn't shown to work (design-1-M3)
*   **Scope:** lines 387–402.
*   **Problem:**
    - A mutation that was retrying when the app closed may not resume after hydration (`isPaused: false`).
    - Writes saved by the persister are throttled to about one a second, so the last write before closing can be lost.
    - Keeping each user's cache separate is stated, not designed.
*   **Proposed fix:**
    - Specify `shouldDehydrateMutation`, and on restore reset hydrated pending mutations to paused before calling `resumePausedMutations()`.
    - Set the persister throttle to 0 for mutation changes, or flush on `visibilitychange`/`pagehide`.
    - Key the IndexedDB entry by user id, and drop it on sign-out or a user mismatch.
    - Make a spike with tests the first task of step 5. If it fails, fall back to Alternative H2.

### M5. A poll can overwrite pending optimistic ticks, so ticked items reappear (design-1-M4)
*   **Scope:** lines 65, 135 and 384–400.
*   **Proposed fix:**
    - Skip list refetches while any `household` mutation is pending.
    - After a refetch, re-apply pending mutations on top of the fresh data.
    - Add a test.

### M6. "Clear ticked" deletes unconditionally (design-1-M5)
*   **Scope:** lines 351–354.
*   **Proposed fix:**
    - A batch delete from "Clear ticked" only applies if the item is still ticked and `fieldTimes.ticked` is at or before the clearing client's value.
    - Skipped items are reported.

### M7. `after` completions use the server's "today" when replayed (design-1-M6)
*   **Scope:** lines 320 and 343.
*   **Proposed fix:**
    - The client sends `completedAt`, clamped like item timestamps.
    - "Today" for `nextDueOn` is worked out from `completedAt` in the household's timezone.

### M8. There's no Risks & Mitigations section (structural-1-1, design-1-M7)
*   **Proposed fix:** add an H2 section with a table of risks, impact and mitigation:
    - open Auth0 sign-up
    - client clock skew, including slow clocks (style-1-1)
    - iOS storage eviction for sites not added to the Home Screen
    - service worker update and version mismatch with persisted data
    - an Auth0 outage
    - a single maintainer running two deployment targets
    - polling cost
    - the scale ceiling
    - the iOS push requirement

### M9. Alternatives don't meet the Alternatives Rule (structural-1-2, structural-1-3, design-1-M8, style-1-23)
*   **Problem:**
    - Rejections have no linked decision record.
    - C says the counter-argument is unanswered.
    - E and H2 give preferences, not trade-offs.
    - Some estimates aren't supported.
    - The labels H2 and H3 collide with heading levels.
    - H points to the wrong alternative.
    - G and H don't use the template.
*   **Proposed fix:**
    - Link `discussion_summary.md` and the review reports for each decision.
    - Give each rejection a concrete trade-off.
    - Move C's trial to Risks as an accepted risk, with the reason.
    - Renumber A–L, use the template throughout, and fix the cross-reference.

### M10. Ownership can be bypassed (design-1-M9)
*   **Problem:**
    - Either person can assign a task *to* the other without consent.
    - A non-owner can restore the owner's deleted task.
    - Who may accept or decline a proposal isn't defined.
    - There's no way to withdraw a proposal.
*   **Proposed fix:**
    - Assigning, or creating, a task for the other person makes a proposal.
    - A restore of a task owned by the other person makes a proposal.
    - Only `toUserId` can accept or decline.
    - Add `POST /api/hh/proposals/:id/withdraw`, for the proposer only.

### M11. Done one-off tasks and per-task records grow without limit (design-1-M10)
*   **Proposed fix:**
    - Done one-off tasks get `expiresAt` 30 days after completion, and drop out of the poll after 7 days.
    - `DONE`, `ALSO` and `EDIT` records get a 400-day expiry.
    - A Store contract test confirms that `Store.query` pages through results.

### M12. Members can't be removed, and an invite can't be revoked (design-1-M11)
*   **Problem:** the two-member cap isn't enforced atomically.
*   **Proposed fix:**
    - Owner-only "revoke invite" and "remove member".
    - `memberCount` on `HH#/META`, checked and incremented with a conditional update inside the accept transaction.

### M13. "No ticked item ever comes back" is overstated (style-1-1)
*   **Proposed fix:** narrow the wording to "an edit with an older timestamp". Record slow client clocks as an accepted limitation in Risks.

### M14. The cost claims have no numbers (style-1-3)
*   **Proposed fix:** show the polling arithmetic, list each service's free tier, and note that the API Gateway free tier expires after 12 months.

### M15. "Task" is used with two meanings (style-1-4)
*   **Proposed fix:** add a one-line glossary (task = any chore or to-do; chore = a repeating task; to-do = a one-off task) and use the terms consistently.

### M16. Future Improvements is nested under Non-Functional Requirements (structural-1-5)
*   **Proposed fix:** make it an H2.

### M17. Swap, undo and scheduler gaps (design-1-N1, N6 and N7, grouped as Major because they affect CUJs)
*   **Problem:**
    - Undoing a completed swap loses the swap.
    - A DynamoDB `TransactionConflict` would surface as an error.
    - There's no protection against a duplicate or skipped scheduler hour.
*   **Proposed fix:**
    - Undo restores the swap fields from the `DONE` record.
    - The server retries transaction conflicts up to 3 times.
    - A `MEMBER` record stores `lastDigestSent`/`lastNudgeSent` (the local date and hour), checked before sending.

---

## 🟢 Nits (grouped)

*   **Auth (design):**
    - With multiple accounts, a password reset must delete only that user's sessions.
    - Throttle rows get a 1-day expiry.
    - An invite token in `sessionStorage` is lost if email verification opens a new tab. Keep it in `localStorage` with a 1-hour expiry.
*   **Model (design):**
    - Sentinel `cycle` for one-off tasks with no date.
    - `fixed` rules: `dayOfMonth` 29–31 clamps to the month's last day. Every N weeks with weekdays is anchored to the week containing `startOn`. A late daily fixed chore moves to tomorrow.
    - The digest's "due today" includes earlier undone items, to match the Today group.
    - "Undo on every save" is narrowed to completes and deletes. Task edits keep their history.
*   **Wording (style):**
    - Use the measurable "15 seconds".
    - Add the quiet-hours exception at line 58.
    - Format `either`/`both` as code.
    - Name "Hearthwise" where "It" is unclear.
    - Move the Google Tasks outcome into the success measure.
    - Drop unverifiable hedges and repetition (lines 83, 85, 91, 92–97, 103).
    - Rewrite CUJ 8's "Then" sentence.
    - "Decided by" for the 10-second interval.
    - The in-memory store has no database.
    - Give the error code for "third member".
    - Move the general rules out of the completion steps.
    - Drop "really", "simply" and "fully".
    - Use one voice (third person).
    - Say "replayed paused mutation", not "offline queue".
    - Retitle the "Ownership" goal.
    - "Behind nothing" becomes "without a feature flag".
    - Define the WebSocket trigger.
    - Shorten repeated statements of the no-auto-notify rule.
*   **Structure (structural):**
    - Name the section that "steps below" refers to.
    - Give Undo and `nextDueOn` their own sub-headings.
    - Move Sign-up alerts after the guard section.
    - Put the data model rows in order, and move the settings note out of the field list.
    - Tidy the API table: group routes, one route per row, full paths, `:id` placeholders.
    - One bullet marker per level.
    - Use horizontal rules consistently.
    - Link the Apple pages and use Hoardwise permalinks.
    - Rename sections to match the standard ("Problem Statement", "Proposed Architecture").
*   **CUJ coverage (structural, out of scope):** no CUJs for restoring from the recycle bin, a push held during quiet hours, or a failed invite.
