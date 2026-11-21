# Goldfish Review Report (Intermediate Zoom Out, Stage 8)

**Target:** `/Users/samuelchapman/Projects/hearthwise/docs/designs/phase-5-diy-projects.md` (lines 1-708)

Earlier stage reports considered: `zoom_out_report.md` (Stage 5), `comprehension_report.md`, `critic_report.md` (same folder). The document has not been edited since Stage 5; no findings have been applied.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |

## Verdict

The document still passes context sufficiency and has no Blockers. It is already heavy at 708 lines and sits at code altitude in the Technical Plan. Applying about 45 findings as written would add a rebalance spec, a batch route, per-field authorship, extra risk rows and extra CUJs, which pushes it past the zoom-out standard. About two thirds can be applied as one-line wording fixes or deletions. The rest should be declined or deferred to the implementation plan.

Principle for applying:
- Prefer fixes that delete or simplify, or cost one sentence.
- Where reviewers disagree on a mechanism, pick the cheaper one.
- Add no components, routes, record kinds or sections.
- Fix contradictions and false claims. Move missing code-level detail to the implementation plan (Step 1 or 2 items).

## Prioritized Findings (Blockers -> Major -> Nits)

No Blockers.

### Tidy-order rebalance should be declined - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 92, 275, 558, 574
* **Discrepancy Description**: Shared by Stage 5, comprehension and critic. The rebalance is the only multi-record write, with a partial-failure problem, a push-flood problem, two descriptions that disagree (lines 92 and 275) and a risk row. "Not expected in practice" is wrong: length grows with repeated moves into one gap, not step count.
* **Rationale & Recommendation**: Decline the rebalance. Refuse the move calmly at 64 characters and make "no rebalance" the default. This removes the batch-route need and shrinks `positionBetween` to defining equal, inverted and no-room inputs (as property tests in item 1). Biggest scope-reduction lever.

### "Pressing twice adds nothing" is false in code - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 151, 353-355, 425, 579, item 22
* **Discrepancy Description**: Confirmed in `src/shopping/apply.ts`: an existing live item takes the write whenever the write time is newer, so a second press can overwrite an edited line. "Already on the list" is also wrong for a cleared (`gone`) line.
* **Rationale & Recommendation**: Apply in small form. Name one mechanism: the add route skips ids that already exist, or passes the material's own `fieldTimes.text` as `at`. Add one test: "an edited shopping line survives a second press". Reword the cleared-line copy and state "30 days" once. Correctness, not scope growth.

### Take and release race - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 276-277, 312-319, item 5
* **Discrepancy Description**: Take does not guard against a deleted project; Done is not conditioned on the holder it read; the project hold's relation to step holds (and finished projects) is unstated.
* **Rationale & Recommendation**: Add `ifMissing: deletedAt` to take. State one invariant: Done is conditioned on the holder it read, or take and release also bump `updatedAt`. Add one sentence on project versus step holds. Keep detailed condition lists and race tests (take vs done, take vs delete) in item 5.

### Missing record: 404 or `gone` - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 303, 312, 338, 399, Step 1 acceptance (line 620)
* **Discrepancy Description**: The rules disagree on whether a missing record is 404 or a 200 `gone`; `gone` is missing from the enumerated take outcomes. Step 1 acceptance ("refuse nothing with a 4xx the retry rules would drop") conflicts with the 409 limits and the 404.
* **Rationale & Recommendation**: State once: a never-existed project id gets 404 `not_found`; everything under an existing project answers 200 `gone`. Make the four places agree. Add a small take-outcomes table (`taken`, `already_yours`, `held_by_other`, `done`, `gone`, `released`, `not_held`) with what shows for each. Reword line 620 to "answers every take, release and edit of an existing record with a 200 outcome".

### Planned day puts the step-prefix count scan on Today and calendar polls - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 235, 338, 364, 397, 549, 561
* **Discrepancy Description**: "No step text is read" understates cost; counts are read on every Today and calendar poll. Whether project items show in "Now and next" is unstated.
* **Rationale & Recommendation**: Apply in small form. The list route takes an optional flag (or a separate light read); Today and the calendar use a projects-only read with no counts. Replace the claim with an honest cost statement. One line for item 5: count query excludes steps of deleted and finished projects and pages if over 1 MB. Boundary change only, no new component.

### Restore rule contradicts itself for stranded steps - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 306, 380, 575
* **Discrepancy Description**: Line 380 claims absolutely that restore never gives a stranded child an expiry; other lines imply otherwise.
* **Rationale & Recommendation**: One rule: a step written under a deleted project is hidden, and gets an expiry only if the project is deleted again. Drop the absolute claim and align the three places.

### Overclaims in G8, line 473 and the order-independence property - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** G8, line 473, the "any order gives the same project" property
* **Discrepancy Description**: Conflict-safety is overclaimed; the property is false for take and done.
* **Rationale & Recommendation**: Reword to "overwrites are limited to the same field of the same step; the replaced person is told and keeps their text". Limit the property to edit writes and test take and done separately. One sentence each.

### Rollback and mixed-version risk - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Risks, rollout statements (line 399 area)
* **Discrepancy Description**: Only same-version replay is tested; an older app meeting unknown keys drops its queue, which is real data loss for that phone. Line 399 does not state the real retry rule.
* **Rationale & Recommendation**: Reword to the truth and move the rollback decision to Open Questions with "accepted" as default. Do not build an old-app skip mechanism. Line 399: network, timeout and lapsed sign-in retry for ever; 5xx three times; other 4xx are final.

### Risks and Alternatives omissions - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Risks section; Alternatives G, I, M, Q; Decisions
* **Discrepancy Description**: Missing risk rows and technical trade-offs; two decisions lack an alternative.
* **Rationale & Recommendation**: Add one-line rows only: clock skew (accepted), hold never released (either person can release), route isolation and validation (add-to-list `lineIds` read under the guard). Skip partial-tidy (gone) and notice-cleanup rows. Add one-line trade-offs to G, I, M, Q and one-line alternatives for "200 with outcome rather than 409" and "any person may release". Do not link the interview.

### Materials as records and project-level hold - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 206, 350-359, Open Question 7
* **Discrepancy Description**: Scope pressure to cut `PMAT#` records or the project-level hold.
* **Rationale & Recommendation**: Keep both. A text field reintroduces duplicate-press and lost-line problems; CUJ 4 needs the hold. In Open Questions, say Steps 1 and 2 stand alone and materials (Step 3) are the second cut point after costs. Do not restructure.

### Multi-line paste batch route - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** multi-line paste, push behaviour
* **Discrepancy Description**: Critic proposes a batch route.
* **Rationale & Recommendation**: Decline. A paste is N writes, each replayed once. Avoid push floods with a client-side rule: `notify` only on the first write of a group. A partial replay showing the lines that landed is acceptable.

### Net growth risk when applying everything - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** whole document
* **Discrepancy Description**: The additions net about +40 lines unless redundancy and code-level text are cut at the same time.
* **Rationale & Recommendation**: Do one edit pass with additions and deletions together. Target no net growth. Delete duplicated rationale (keep each decision in Decisions and Alternatives, cross-reference elsewhere) and move attribute lists, the alphabet and the batch size (lines 271-277, 379, 398, 622-633) to the plan's test and item lists.

### Orphans on partial delete - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 379-380, 537, 576
* **Discrepancy Description**: Accounts of partial delete differ.
* **Rationale & Recommendation**: Pick one account; say a delete of an already-deleted project finishes the batches (the retry path). Decline the cleanup job. Say where expired rows are removed (existing 30-day sweep).

### Other applicable small fixes - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** various
* **Discrepancy Description**: Many cheap wording and consistency issues.
* **Rationale & Recommendation**: Apply as is: reconcile Status line with line 17; "12 kinds, nine in Step 2 and three in Step 3"; one-line glossary for envelope, `guarded`, `gone`, `outcome`, one term for Finished/archived; Hoardwise defined once (remove line 21 duplicate); align field-time names and say `costBy` has no time of its own; item 21/32 duplicate, G2/G8/G9 mapping; give `projectAdded` text or drop it; drop the CUJ 7 parenthetical and stale hedge; fix the `PROJECTSTEP#` prefix sentence; "On it for 3 weeks"; "13/14 days" as one limit; add "claim" and "assign" to `BANNED_PHASE_5` and the MANUAL-CHECKS "Reading and touch" line; sentinel-test scope limited to logs, push bodies, held pushes; id validation to a fixed character set and length with a test; whole-pence display as the Money page does (avoid a new formatter); "This was changed after you wrote it. Your wording is kept here." instead of naming a person; name manual checks by first words, not line numbers; one clock-skew sentence; one clause pointing to the CLAUDE.md Store entry for `ifMissing`/`ifEquals`; one sentence on the two-member rule for `removeMember`; one line that finished projects count against the limit; one short CUJ for a refused create at a limit; map G9 to a CUJ; name `results.status` values and the meaning of `0`; label the two route tables; Step 1 PR check lists what it checked; Alternative B plainly "not planned to run first"; state the current-member ("Former member", "free") filter once and scope CUJ 12 to holds.

### Per-field rule duplicated a fourth time - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** write-rule sections
* **Discrepancy Description**: Stage 5 suggested extraction.
* **Rationale & Recommendation**: Decline. Add one line that duplication is the repo's deliberate pattern (CLAUDE.md Shopping, Meals, Money, Calendar); a helper would touch five modules.

### Open Questions ordering - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** lines 79-93
* **Discrepancy Description**: After changes only materials, undo as re-add and delete batches remain as Claude decisions.
* **Rationale & Recommendation**: Keep the author's genuine choices first (Today line, planned day, cost shape, word "Project").

## Treatment Summary

| Treatment | Items |
| --- | --- |
| Apply as is | Wording fixes, G8 and property overclaims, sentinel scope, banned words, line 399 rewording, CUJ 7 hedge, prefix sentence, id validation, Status line, "12 kinds", glossary, field-time names, check names |
| Apply smaller | Duplicate-press rule; take/done/delete invariants; planned-day read without counts; 404 vs `gone`; stranded-step restore; Hoardwise once; take outcome table; clock-skew sentence; rollback to Open Questions; Risks rows; Alternatives trade-offs; one limit-refusal CUJ; "changed after you wrote it"; whole-pence display |
| Decline | Tidy rebalance and its batch route; paste batch route; shared LWW helper; per-field authorship; cleanup job; old-app skip mechanism; CUJs for tidy and release; linking the interview; pass threshold; reordering "What is reused" |
| Defer to plan/code | Count-query paging and live-only filtering; race test lists; `positionBetween` edge cases; attribute lists, alphabet, batch size |
| Keep despite pressure | `PMAT#` records; project-level hold; per-field rule duplication; Today-line decision |

Note: the reviewer did not re-read ROADMAP, DECISIONS, brand, MANUAL-CHECKS or phase 1-4 designs; it relied on Stage 5 and critic checks of reuse and line-number claims, and verified the duplicate-press claim in `src/shopping/apply.ts`.
