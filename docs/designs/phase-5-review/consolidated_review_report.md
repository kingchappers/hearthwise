# Consolidated Review Report: Phase 5 (DIY projects)

Status: resolved (2026-11-21). A1 and B1 to B12 applied, with the three recommended defaults. B13 (no net growth) met after a trimming pass: 708 lines before and after (758 before the trim).

**Target:** `docs/designs/phase-5-diy-projects.md` (708 lines; FeatureRange 1-602, DetailedRange 603-708)
**Date:** 2026-11-21
**Preset:** Consolidated report with all review rubrics (the full flow without stopping).
**The design was not edited during the review.** Every finding below is still open.

## Stages and reviewers

| Stage | Report | Reviewers | Status | Counts as the report states them |
| --- | --- | --- | --- | --- |
| 5 Initial zoom-out | `zoom_out_report.md` | `egm-zoom-out` | completed | 0 Blocker, 5 Major, 6 Nit |
| 6 Comprehension | `comprehension_report.md` | `egm-comprehension` | completed (every section could be paraphrased) | 13 Major, 9 Nit (the reviewer's own severities) |
| 7 Critic | `critic_report.md` | `egm-design`, `egm-structural`, `egm-style` | all completed | 0 Blocker, 11 Major, 20 Nit (grouped into 12 entries) |
| 8 Intermediate zoom-out | `intermediate_zoom_out_report.md` | `egm-zoom-out` | completed | 0 Blocker, 12 Major, 4 Nit |
| 9 Implementation readiness | `implementation_readiness_report.md` | `egm-implementation-readiness`, `egm-codebase-details`, `egm-style` | all completed | 1 Blocker, 21 Major, 12 Nit |

No reviewer failed or needed a retry. Stage 5's synthesizer reported back before its reviewer had finished, and the report was written once the reviewer completed, so the reviewer is counted as having run. The comprehension reviewer read the document alone, as its stage requires. The Stage 7 reviewers did not read all of `DECISIONS.md`, the brand file, the manual checks or the earlier designs, and the Stage 8 reviewer relied on Stage 5 and 7 for those checks. The codebase reviewer in Stage 9 confirmed that the files and symbols the plan names exist as described.

## Verdict

The feature design (lines 1-602) has no Blocker and holds up against the code. The reviewers checked that its reuse claims are true. The implementation plan (lines 603-708) is **not ready to build as written**: it has one Blocker and a long list of places where an implementer would still have to decide something. Two of the problems are real correctness errors that the reviewers found independently in several stages: pressing "Add to the shopping list" twice is not a no-op in the code, and take and Done are not fully conditioned.

Stage 8 gives the guiding rule for the fixes: applying all ~45 findings as written would add a rebalance spec, a batch route, per-field authorship, more risk rows and more journeys, which pushes the document past the zoom-out standard. So one edit pass should apply fixes that delete, simplify or cost a sentence, decline the rest, and cut duplicated rationale in the same pass so the document does not grow.

## Consolidated action items

### 🔴 Blocker

**A1. The partition-read audit names a place that reads nothing.** (Stage 9; also Stage 6 finding 13)
Line 616 lists `removeMember` as code that "reads a prefix of a household's partition as a whole". It reads no prefix. Only `moveOptions` enumerates the data kinds, and the design's own line 387 says `removeMember` "rewrites nothing". Line 704 says the new items are "inert to older code", while line 387 says the hazard returns after a rollback. No numbered item performs the audit.
*Fix:* name `moveOptions` only, or say `removeMember` was checked. Add a step 1 item that searches for whole-partition readers (backup, `store-cli`, cleanup, `moveOptions`), so the list comes from a check. Replace "inert" with what is known and unknown.

### 🟡 Major

**B1. Take, release and Done: conditions and project holds are not fully defined.** (Stages 5, 7, 8, 9; comprehension 3)
Take is not conditioned on the record not being deleted. Done clears `takenBy` without a stated condition, so a take landing between a read and a write can leave a holder on a done step, and setting `todo` again brings it back. A project's hold, its relation to step holds, and a finished project are undefined; the `state` condition applies to steps only. The outcome names are listed in three places, `gone` is missing from the take outcomes, and what shows for each outcome is never said.
*Fix:* add `ifMissing: deletedAt` to take; condition Done on the holder it read (or have take and release also bump `updatedAt`); add one small table of record kind, preconditions, update and outcomes (with what shows for each, `gone` included); one sentence on project versus step holds and finished projects. Race tests (take vs Done, take vs delete) belong in item 5. Move the store contract case ahead of item 5 and name the exact combinations (`ifMissing(takenBy)` with `ifEquals(state)` in one update, and `ifEquals(takenBy)` for a departed holder).

**B2. A missing record is a 404 in some places and `gone` in others, and the step 1 acceptance contradicts item 8.** (Stages 7, 8, 9; comprehension 11)
*Fix:* state once: a never-existed project id gets 404 `not_found`, and everything under an existing project answers 200 with an outcome (`gone` included). Make lines 303, 312, 338, 399 and 620 agree. Say what happens to a queued write that hits a limit (a 409 is final and `onError` reports it, then the overlay drops it). State the refusals per step (`material_limit` arrives in step 3).

**B3. "Pressing twice adds nothing" is false in the code.** (Stages 5, 7, 8, 9; comprehension 8)
`applyItemWrite` applies a write whenever its time is newer than the stored one, so a second press with a later `clientAt` rewrites the shopping line's text and undoes an edit made on the list. "Already on the list" is wrong for a cleared line, and a tombstone expires after 30 days.
*Fix:* name one mechanism (skip ids that already exist, or pass the material's own `fieldTimes.text` as `at`). Add a test that an edited line survives a second press. Reword the cleared-line copy. State "30 days" once. Drop the stale hedge in CUJ 7.

**B4. Tidy order: decline the rebalance, and give `positionBetween` a contract.** (Stages 5, 7, 8, 9; comprehension 6)
The rebalance is the only multi-record write, it is described two ways (lines 92 and 275), a partial failure scrambles the order, each write can send a push, and "not expected in practice" is wrong (length grows with repeated moves into one gap, not with step count). It also contradicts the brief.
*Fix (Stage 8's recommendation):* decline it. Refuse the move calmly at 64 characters, and make "no rebalance" the default in Open Questions. This removes the batch-route need. Give `positionBetween` a signature, a return shape and the equal, inverted and no-room cases as property tests. Add one app-side item that owns computing positions from the overlaid list (move up and down, insert between, a pasted multi-line add). For multi-line paste, decline a batch route: send `notify` only on the first write of a group.

**B5. The list poll reads every step, and Today and the calendar inherit it.** (Stages 5, 7, 8, 9)
"No step text is read" is a bytes claim; the read cost is per item, and the count query covers finished projects, tombstones and children of deleted projects, with no paging above 1 MB. `inputsFor` makes Today and every calendar view run the full list poll, and the design does not say whether project items show in "Now and next".
*Fix:* give the list route an optional flag (or a light projects-only read) so Today and the calendar read projects without counts. State the worst-case cost honestly. Say the count query excludes steps of deleted and finished projects, and pages if over 1 MB (an item 5 detail). Say whether project items appear in "Now and next" (the mapper ignores all-day items, so they do not).

**B6. The rule for stranded steps, restore and a retried delete is told three ways.** (Stages 7, 8; comprehension 7)
Lines 306, 380 and 575 disagree, and line 380's absolute claim ("never leaves a restored project whose steps will expire") does not hold for a step written after the delete batches. How a retry passes the conditional tombstone is unstated.
*Fix:* one rule everywhere: a step written under a deleted project is hidden and gets an expiry only if the project is deleted again; a delete of an already-deleted project finishes the batches. Drop the absolute claim. Decline the cleanup job. Say what removes expired rows (the store's own expiry).

**B7. Overclaims in goals, properties and tests.** (Stages 7, 8; comprehension 5)
G8 and line 473 overclaim: same-field newest-write-wins does replace the stored value. The property "any order of the same writes gives the same project" is false for take and Done. The sentinel test cannot pass as worded, because responses carry record text. The notice "{name} changed this after you" can be wrong when a clock is wrong or the stored value came from the same person.
*Fix:* reword G8 to "overwrites are limited to the same field of the same step; the replaced person is told and keeps their text". Limit the property to edit writes and test take and Done separately. Limit the sentinel test to logs, push bodies and held pushes. Use "This was changed after you wrote it. Your wording is kept here." Add one clock-skew sentence (newest device time wins, and a phone set ahead wins).

**B8. Rollback and mixed-version risk is understated, and the named test does not cover it.** (Stages 7, 8; comprehension 22)
An older app meeting unknown keys drops its whole saved queue, including the person's unrelated shopping, task and calendar writes. The named test replays a `schemaVersion` 1 cache on the new app; it does not exercise an old registry. Line 399 does not state the real retry rule.
*Fix:* say "accepted; same-version replay is tested". Move the decision into Open Questions with "accepted" as the default, and do not build an old-app skip mechanism. Reword line 399: network, timeout and lapsed sign-in retry for ever, 5xx three times, other 4xx are final. State the API-before-app order per deploy (steps 3 to 5 combine server and app work).

**B9. Risks and Alternatives omit things the design depends on.** (Stages 7, 8)
Missing risk rows: clock skew, a hold that is never released, route authorisation and validation (the add-to-list `lineIds` read). Several Alternatives (C, G, I, M, Q) are rejected on the author's preference with a thin technical reason, and two decisions have no alternative: take answering 200 with an outcome rather than 409, and either person being able to release.
*Fix:* one-line risk rows for those three (skip partial tidy once the rebalance is declined, and skip notice clean-up). One-line trade-offs on G, I, M and Q, and one-line alternatives for the two decisions. Do not link the interview.

**B10. The implementation plan leaves decisions to the implementer.** (Stage 9; Stage 8 says to keep detail in the plan, not the Technical Plan)
*Fix, by item:*
- **Item 8 (routes).** List the exact step 1 routes, say `GET /projects/{id}` returns `materials: []` until step 3, write out the registration order and place the registration (after the calendar routes).
- **Items 6 and 10 (restore).** Name the `children.ts` delete and restore signatures and the call from `restore.ts`; say which function owns the "deletion seen" check, where the write record goes, and how `project_limit` is counted across a batch; state the `RestoreEntry` change (the `deletedAt` variant) and whether `src/api/tasks.ts` (the restore route) changes.
- **Item 5.** Say whether `holds.ts` takes a record kind or has separate functions (see B1).
- **Items 14 and 15 (notices).** Define a `ProjectNotice` type, its key, cap, dedupe rule, what is kept for non-text stale fields (`position`, `state`, the planned group, a cost figure), and how "who changed it" is found.
- **Item 14 (registry).** Name `ProjectMutationKind`, `ProjectMutationVars`, `PROJECT_RUNNERS`, the refusal list (`project_limit`, `entry_changed`) and where "This household has reached 60 projects." lives.
- **Items 22 and 23 (add-to-list).** List the `results[].status` values and the edge cases (a deleted project or line, an empty or repeated `lineIds`) and add the test for two people adding lines at once. Say what changes in `src/push/events.ts`, and add a route-to-event table (which writes send `projectAdded` and which `projectChanged`, and the `projectAdded` text).
- **Item 20 (`deleted.ts`).** Give the helper's name, signature and return type (reworded to "added through a helper, not a sixth positional argument"), and how counts come from the list.
- **Items 27 and 28 (timeline).** Specify the mapper's item fields and the new `ALL_DAY_ORDER` value; resolve the contradiction that `_index.tsx` is "not changed" while Today starts polling `useProjects()` (mocks in `today.test.tsx` and `pages.test.tsx`); say `holderOf` with the members hides a departed holder.
- **Items 18, 20 and 25 (UI).** Assign delete step, delete material, Undo, "Free this step", "Mark as finished", "Bring back" and the "Finished" section to named files and tests, and say where the text needed for Undo is kept and for how long.
- **Step 3.** Add `children.ts`, `projects.ts` (counts) and `deleted.ts` as Modify items (delete and restore of materials, the "12 steps, 8 materials" count), and a test of `PMAT#` children.
- **Paths.** Replace directory entries ("`app/components/projects/` (Modify)") with exact files, and give each test its path. `projectForm.ts` for the planned-day rules and `parsePounds` belongs to steps 4 and 5.
- **Item 30 (cost 0).** Pin one rule (the form turns 0 into `null`, or the server accepts 0 pence). Add the distinctive-figure case to the sentinel test (item 30 or 31).
- **App tests.** List cases and assertions for items 13 to 21 (axe, 44 px targets, empty and limit states), or say the "two people see and edit the same plan" claim is checked by hand in step 6.
- **Items 33 and 34 (e2e).** The offline spike uses a stub API, so it proves the queue rule and not the real take and move. Say so, name the stub additions, and point the real replay at the registry, overlay and restored-cache tests and the manual checks.

**B11. Terms, glossary and banned-word coverage.** (Stages 6, 7, 8; comprehension 1, 2, 4, 14, 15, 17)
Hoardwise is defined twice and its concrete risk (shared keys or tables) never stated; "Claude" is used before it is defined and the Status line conflicts with line 17 on what was reviewed; undefined terms (envelope, `guarded`, `gone`, `outcome`, stale, holder, tidy order, `ifMissing` and `ifEquals`, "Plan switch", "go/no-go"); "Finished", "archived" and "leaves the list" for one state; "take" vs "I'm on this"; `BANNED_PHASE_5` omits "claim" and "assign" although line 430 says they are never on screen; the manual-checks additions lack a Phase 5 "Reading and touch" line; `projectFiles()` has no path rule.
*Fix:* define each once (a short glossary line, a pointer to CLAUDE.md for the store primitives), keep one term for Finished, add the two words to the list and the missing manual-check line, and give `projectFiles()` its paths.

**B12. Scope pressure was weighed and kept.** (Stages 5, 7, 8)
Stage 5 suggested dropping the `PMAT#` records and the project-level hold. Stage 8 recommends keeping both: a text field brings back the duplicate-press and lost-line problems, and CUJ 4 needs the project hold. *Fix:* keep both. In Open Questions say that steps 1 and 2 stand alone, and that materials (step 3) are the second cut point after costs. Add one line that duplicating the per-field rule is the repository's deliberate pattern (decline a shared helper).

**B13. Net growth.** (Stage 8)
The fixes above net about +40 lines unless the same pass deletes duplication. *Fix:* one edit pass. Keep each decision in Decisions and Alternatives and cross-reference elsewhere (Hoardwise, counts never stored, `forRecipes`, delete batches, undo as re-add, the Today line); move attribute lists, the alphabet, batch size and test-case lists out of the Technical Plan into the implementation plan.

### 🟢 Nits (apply as one-line fixes in the same pass)

- Wording and grammar: "On it since 3 weeks ago" (use "On it for 3 weeks") and add it to the wording table; "13 days" and "14 days" are one limit in two units; "competing" as a noun; unsupported claims ("the common case", "worse than no reading", "about forty lines", "about the size of phases 2 to 4"); "totals" should be "figures"; "Adding a sixth inline is replaced by a helper" is unclear.
- Names and times: `fieldTimes` names (`planned`, `estimate`, `spent`) against the write fields (`plannedAt`, `estimateAt`, `spentAt`), `titleAt` on creates only, and `costBy` has no time of its own.
- Ids and prefixes: validate ids to a fixed character set and length (a `#` in an id could cross prefixes) with a test; rewrite the `PROJECTSTEP#` sentence (the real rule is that each prefix ends in `#`); point the prefix test at the exported constants and list the other prefixes in the partition.
- Where "free" and "Former member" are decided: state the current-member filter once, and scope CUJ 12 to holds.
- Limits: finished projects count against the limit until deleted (note it); one sentence on the two-member rule for `removeMember`.
- Journeys and goals: map G9 to a CUJ; add one short journey for a refused create at a limit; the G2, G4, G7, G8 and G9 item ranges in the goal table; split the row at line 200 (one Author and one Claude decision); name the 0 behaviour.
- Structure: order "What is reused" after "Components" as phases 3 and 4 do, label the two route tables, and note that the manual-checks table is verification material.
- References: name manual checks by their first words, not line numbers; "below" should be "above" in step 6; item 35's "the `moveOptions` list" in CLAUDE.md (there is none: say what is added).
- Plan housekeeping: decide now on `touchTargets.test.ts` and `README.md` (not "if it lists…"); items 21 and 32 both own the cost-file wording check (keep it in item 32); state whether `projectLookup.ts` copies or generalises `recipeLookup.ts`; `clampTime` and `THIRTY_DAYS_SECONDS` come from `src/tasks/record.ts`; rename "Static Analysis" to "Guard tests" and note `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for e2e; reword "so the problem is addressed" (it conflicts with the month-later success check).
- Cost display: use the Money page's whole-pence display, which needs no new formatter (`formatPounds` always prints pence).
- Open Questions: keep the author's genuine choices first (Today line, planned day, cost shape, the word "Project"); after these changes only materials, undo as re-add and delete batches remain as Claude decisions.
- Alternative B: say plainly it is not planned to run first.

## Declined, deferred and kept

| Treatment | Items |
| --- | --- |
| **Decline** | The tidy-order rebalance and its batch route; a batch route for multi-line paste; a shared per-field helper; per-field authorship; a cleanup job for orphaned steps; an old-app skip mechanism; journeys for tidy order and release; linking the interview; a pass threshold for the success measure; reordering "What is reused". |
| **Defer to the plan or the code** | Count-query paging and live-only filtering; race-test lists; `positionBetween` edge cases; attribute lists, the alphabet and the batch size. |
| **Keep despite pressure** | `PMAT#` material records; the project-level hold; the duplicated per-field rule; the no-Today-line default. |

## Decisions the author should make before the edits

1. **Drop the tidy-order rebalance** and refuse the move at 64 characters instead (B4). This reverses a default the design recorded, and it matches the brief's original "no automatic rebalance". It removes the only multi-record write.
2. **Accept the rollback data loss** for a phone on an older app (B8), as the default in Open Questions, or ask for an old-app skip mechanism (the reviewers advise against).
3. **Give Today and the calendar a lighter read** of projects (B5): an optional flag on the list route.

## Traceability matrix

Report abbreviations: S5 = Stage 5 (`zoom_out_report.md`), S6 = comprehension (numbered findings), S7 = critic, S8 = intermediate zoom-out, S9 = implementation readiness.

| Consolidated item | S5 | S6 | S7 | S8 | S9 |
| --- | --- | --- | --- | --- | --- |
| A1 partition-read audit | | 13 | | | Blocker 1 |
| B1 take, release, Done | take and release race | 3 | take and Done races | take and release race | project take, contract test order |
| B2 404 vs `gone` | | 11 | missing record | missing record | step 1 acceptance, route scope |
| B3 pressing twice | pressing twice | 8 | add-to-list, CUJ 7 hedge | pressing twice | twice is a no-op |
| B4 tidy order | tidy order | 6 | tidy and paste, `positionBetween` | rebalance, paste batch | `positionBetween`, tidy owner |
| B5 list poll read cost | planned-day scan | | list poll | planned-day scan | timeline and Today |
| B6 stranded steps, delete | orphans | 7 | restore rule, delete retry | restore rule, orphans | |
| B7 overclaims, notice wording | loser notice | 5 | overclaims | overclaims | |
| B8 rollback | | 22 | rollback | rollback | "API before app" nit |
| B9 risks and alternatives | | 19 | risks, alternatives | risks and alternatives | |
| B10 plan under-specification | code altitude | 12, 20, 21 | | | restore, notices, add-to-list, push, `deleted.ts`, timeline, UI, step 3, paths, e2e, cost 0, step 5, app tests |
| B11 terms and wording | cost formatter, brittle references | 1, 2, 4, 14, 15, 16, 17, 18 | banned words, terms, brittle, wording nits | other small fixes | goal table, step 6 wording |
| B12 scope pressure | materials and project hold | | | materials and project hold | |
| B13 net growth | altitude, third copy | | redundant rationale | net growth | |

## Next step

The design file is unchanged. The next step in the EGM flow is `egm-resolve`, which classifies each finding as propose-a-fix or contest, and applies the edits you approve. The Stage 7 and Stage 9 reports are the inputs, with this report as the guide to what to apply, decline or defer.
