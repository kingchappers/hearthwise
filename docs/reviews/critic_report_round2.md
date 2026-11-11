# Stage 7: Critic Review, round 2

*   **Target:** `docs/designs/phase-1-foundation.md`, FeatureRange lines 1–743
*   **Reviewers (fresh context, all completed):**
    - `egm-design`, against `feature-spec-standard.md`
    - `egm-structural`, against `feature-spec-standard.md`
    - `egm-style`, against its own persona rubric
*   **Goldfish context:** `discussion_summary.md` and the Hoardwise files `CLAUDE.md`, `src/store/types.ts`, `src/auth/localData.ts`, `app/lib/offlineQueue.ts`, `src/push/scheduler.ts` and `public/sw.js`
*   **Date:** 2026-11-11
*   **Raw counts:** design 0 Blocker, 9 Major, 8 Nit. Structure 0 Blocker, 2 Major, 6 Nit. Style 0 Blocker, 4 Major, 21 Nit.
*   **After deduplication:** 0 Blocker, 13 Major, about 30 Nits (grouped below).
*   **Round status:** not clean (unsettled Majors). Round 1 is in [critic_report_round1.md](critic_report_round1.md).
*   **Churn check:** none. No new finding would be resolved by reverting a round 1 fix.

**Checked by the author's agent:** Hoardwise's table uses `billing_mode = "PAY_PER_REQUEST"` (`infra/dynamodb.tf:5`), so the DynamoDB free-tier claim (R2-M12) is wrong as written.

---

## 🟡 Majors

### R2-M1. Proposal accept, decline and withdraw aren't safe to replay and can race (design-2-1)
*   **Scope:** lines 448–449 and 469–474.
*   **Problem:** a retried accept whose first attempt committed finds `scheduleVersion` changed and marks an applied proposal `stale`. Withdraw and accept (or decline and accept) can both win, because neither requires `status = pending`. The replay-safety list leaves proposals out.
*   **Proposed fix:** every transition requires `status = pending`; a repeat call that finds the requested state already set returns 200 with no write; `stale` is only set while still pending; add proposals to the replay-safety list.

### R2-M2. An old checklist tick replayed after a completion re-ticks the new cycle (design-2-2)
*   **Scope:** lines 346, 366, 385 and 411.
*   **Problem:** completion clears `checklistState`, including each step's `at`, so a tick from the previous cycle replayed afterwards passes the "newer" check.
*   **Proposed fix:** ticks carry `cycleSeq` and apply only when it equals `task.cycleSeq`.

### R2-M3. Completions bump `scheduleVersion`, so ordinary use makes proposals and schedule edits stale (design-2-3)
*   **Scope:** lines 344, 367, 385, 449 and 476.
*   **Problem:** a proposal to change a daily chore's repeat rule goes stale as soon as anyone completes it. A repeat-rule edit made while the other person completes the chore gets a silent 409.
*   **Proposed fix:** split the version. `ruleVersion` covers `assignee`, `repeat`, delete and restore. Rule changes check `ruleVersion`; `swap` proposals and `dueOn` edits also check `cycleSeq`.

### R2-M4. User actions rejected with 409 are dropped silently (design-2-4)
*   **Scope:** lines 390 and 476.
*   **Problem:** a completion against a cycle that was undone in the meantime (rule 4, "higher") is thrown away with no message, so the record of who did what loses a real completion.
*   **Proposed fix:** a "higher" `cycleSeq` whose cycle was undone completes the current cycle with the client's `completedAt`. Every other user-initiated write dropped on 409 is shown in the banner ("changed on <name>'s phone, please check"). Add a Risks row.

### R2-M5. Undo erases the other person's completion and can leave false history (design-2-5)
*   **Scope:** lines 80, 388 and 396–403.
*   **Problem:** the first completer's undo reopens a cycle the other person also did. A completer who only has an `ALSO` item can't undo at all, so a retracted completion stays in history.
*   **Proposed fix:** if `ALSO` items exist, the first completer's undo promotes the earliest one to be the `DONE` completer and the cycle stays done. A caller who only has an `ALSO` item can undo it, which deletes that item.

### R2-M6. Skipping refetches while a write is pending can freeze the list in a shop (design-2-6)
*   **Scope:** lines 456, 465 and 478.
*   **Problem:** a write retrying on weak signal blocks every refetch, so CUJ 5's "milk" never appears and the 15-second goal fails quietly.
*   **Proposed fix:** keep refetching and rely on the pending-mutation overlay. Ignore only a response whose request started before the latest mutation settled.

### R2-M7. Creating or assigning a task for the other person is described two ways (design-2-7)
*   **Scope:** lines 436, 446 and 477.
*   **Problem:** one line says the task is created as `either`, another says the request writes nothing. During replay, a `proposal_required` result is both "dropped to the banner" and "the client creates the proposal".
*   **Proposed fix:** the client always sends a create with `either`, then a separate `assign` proposal, as two queued mutations. A `proposal_required` during replay goes to the banner with an "Ask <name>" action, never to an automatic proposal.

### R2-M8. The approval goal contradicts the rule for `both` tasks (design-2-8)
*   **Scope:** lines 74, 335 and 433.
*   **Problem:** either member can reschedule, change or delete a `both` task directly, but a `both` task is a job done together, so the change does affect the other person.
*   **Proposed fix:** an author decision. Either require a proposal for schedule changes and deletion on `both` tasks, or narrow the goal and record the exception.

### R2-M9. Six alternatives cite an unlinked "design-draft review" (design-2-9, structural-2-1, style-2-M2)
*   **Scope:** lines 572, 613, 633, 639, 647, 653 and 659.
*   **Problem:** D, F, G, H, I and J say "Recorded in the design-draft review on 2026-11-10", with no link. The Alternatives Rule requires a link, and line 572 promises one. Line 572 also lists `comprehension_report.md`, which no alternative cites.

### R2-M10. Alternative letters clash with the discussion summary's option letters (structural-2-2)
*   **Scope:** lines 574–592.
*   **Problem:** the linked summary calls the chosen design "option B" and the integration "C". The spec's Alternative B is the integration.

### R2-M11. "`cycleSeq` is never reused" is contradicted by undo (style-2-M1)
*   **Scope:** lines 343 and 403.

### R2-M12. The free-tier claim depends on the DynamoDB billing mode (style-2-M3, design-2-16)
*   **Scope:** lines 704–708 and 725.
*   **Problem:** the 25 RCU/WCU allowance only applies to provisioned capacity. Hoardwise's table is on-demand. The pricing figures have no check date.

### R2-M13. The slow-clock risk is understated (style-2-M4)
*   **Scope:** line 720.
*   **Problem:** a slow clock loses every conflicting edit while it's wrong, not one edit.

---

## 🟢 Nits (grouped)

*   **Concurrency (design):**
    - A completion can land on a task deleted mid-request: add "`deletedAt` missing" to the completion's update condition.
    - Delete should be conditional on the `updatedAt` (or rule version) the client loaded, so a retried delete doesn't undo a restore and can't bypass a just-accepted `assign`.
    - Held pushes should be claimed (deleted `ifPresent`) before sending, and expired ones skipped.
    - Notify only after a successful write; undo deletes a matching `HELD` item.
    - Local-mode invite sign-up should create the account and join the household in one transaction.
    - Warn before signing out with pending writes.
    - Refuse to create an invite when `memberCount = 2`; member removal clears `overrideAssignee` pointing at the removed member; history shows a removed member as "Former member"; an empty digest isn't sent; the service worker update path is stated (no `skipWaiting()` while a page is open).
*   **Diagram (structural):** fix the `┤` glyph at the store box, make arrow 6 two-way or reword legend 6, put label 3 next to its arrow.
*   **Structure:** "Performance" cross-reference (also style); route-group and settings labels as H4s; nested Pros/Cons lists in every alternative; Open Questions holds only "None open."; introduce `PushCheck` by name, and say `docs/MANUAL-CHECKS.md` is created in step 7.
*   **Wording (style):** "Three problems hurt the most"; inferred outcomes in the problem list; "becomes a source of friction"; split the notification goal's sentence and drop its meta line; Non-Goals points to Alternative D for the Apple fee; clarify the requirements-confirmation sentence; "Nothing grows without limit"; "calm" and the uncited design aim; repeated reasons in B and E; "Better offline storage guarantees"; "cost more than"; unsupported superlatives ("most bug-prone", "little extra cost", "lowest-effort"); "meets the 15-second goal"; one scale threshold; where `PushCheck` appears; "wide margin"; Proton hedge; "used for real".
