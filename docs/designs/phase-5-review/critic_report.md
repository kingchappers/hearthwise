# Goldfish Review Report

**Target:** `/Users/samuelchapman/Projects/hearthwise/docs/designs/phase-5-diy-projects.md` (`lines 1-602`; the Detailed Implementation Plan, lines 603-708, was out of scope)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-design` | completed |
| `egm-structural` | completed |
| `egm-style` | completed |

Severity counts after deduplication: 0 Blockers, 11 Major, 20 Nit.

Coverage notes: the design reviewer did not read DECISIONS, brand, MANUAL-CHECKS or the phase 1-4 designs. The structural reviewer did not check claims against `src/` or `app/`. The style reviewer spot-checked `forRecipes` sites, MANUAL-CHECKS line numbers, `deletedEntries` arity, `MAX_PENCE`, `MAX_FOR_RECIPES_LENGTH`, `WRITE_RECORD_SECONDS` and `retryRules.ts`, and they held. The design reviewer confirmed that `ifMissing`/`ifEquals`, `WRITE_RECORD_SECONDS`, `clampTime` and `batchItems` behave as described. The required sections of the standard are all present.

## Prioritized Findings (Blockers -> Major -> Nits)

### Restore rule contradicts itself for stranded steps - Severity: Major
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 306, 380, 575`
* **Discrepancy Description**: Line 306 says a step stranded under a deleted project "is given the parent's expiry when the project is restored". Line 575 says it is marked "when the project is restored or deleted again". Line 380 says restore removes `expiresAt` from children and "never leaves a restored project whose steps will expire". A stranded step written after the delete batches has no expiry, so removal does nothing to it.
* **Rationale & Recommendation**: State one rule in all three places, for example "a stranded child is only given an expiry by a second delete; after restore it is live". Calibrate the absolute claim on line 380.

### A missing record has two outcomes: 404 or `gone` - Severity: Major
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 303, 312, 338, 399`
* **Discrepancy Description**: Take and release are said to answer 200 and never a 4xx (312). Line 303 says a write to a missing record answers `gone` (200). Line 338 says a never-existed project id gives 404 `not_found`, and line 399 says a queued write meeting a 404 is dropped. Line 312 gives that dropping as its reason for avoiding 4xx.
* **Rationale & Recommendation**: State per record kind what a never-existed id gets, and make 303, 312, 338 and 399 agree. Also add `gone` to the enumerated take outcomes (314), since it appears in the log enum (393).

### Tidy order and multi-line paste are non-atomic and described two ways - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 34, 92, 275, 407`
* **Discrepancy Description**: Line 92 says "one write that re-spaces every step". Line 275 says one write per step, up to 40 mutations, each with its own id and `clientAt`, and calls it "the only multi-step write". Line 34 says a move "rewrites only that step". If a phone drops out part-way, some steps carry fresh positions and some old ones, so the order is scrambled on both phones. Two phones can tidy at once. Each write may carry `notify`, so a tidy or a multi-line paste (407, up to 40 writes) can send many pushes. Push tags are per mutation, so they do not collapse.
* **Rationale & Recommendation**: Send tidy and multi-line paste as one batch route (like `batchItems`/`addPlanToList`), or send `notify` only on the first write of a group. If it stays N writes, say so plainly and say what a partial replay shows. Reword "only multi-step write" to "only case that writes more than one step record", and add "except tidy order" to line 34.

### List poll reads every step of every project - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-style`
* **Affected Scope:** `Lines 235, 338, 349, 364, 397, 545, 549, 561-562`
* **Discrepancy Description**: Alternative V rejects a whole-response design because of about 2,400 records per poll, but `GET /projects` still queries the whole `PSTEP#` prefix, including finished projects, tombstones and hidden children of deleted projects. Projecting four attributes shrinks the response, not the DynamoDB read cost, and a query page is capped at 1 MB with no mention of pagination. The calendar and Today also use `useProjects()`, so the query runs there only to find planned days. The Cost line is qualitative and gives no worst-case read figure (the design reviewer estimates roughly 700 KB, about 180 read units, per poll per phone at the limits). "No step text is read" does not support the Performance and Cost claims.
* **Rationale & Recommendation**: State a worst-case read estimate. Restrict the count query to live steps of active projects, or page it. Give the calendar and Today a lighter read. Say how steps of deleted projects are excluded from the counts. Calibrate the wording to "smaller response".

### `positionBetween` is under-specified for cases the design creates - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-style`
* **Affected Scope:** `Lines 274-275, 558`
* **Discrepancy Description**: Ties are allowed (274) and neighbours can be stale after concurrent moves, but only "strictly between its inputs" is promised. Behaviour for equal inputs, inverted inputs, or a pair with no room is undefined, so the property test on line 558 cannot pass as worded. The claim that exceeding 64 characters is "not expected in practice" because of the 40-step cap does not follow: length grows with repeated moves between the same neighbours, not with live step count.
* **Rationale & Recommendation**: Specify equal, inverted and no-room cases (for example, lower neighbour plus a suffix, or force a tidy) and add them to the property tests. Give a growth rate, or drop the "not expected" claim.

### Take and Done races are not fully conditioned - Severity: Major
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 277, 306, 314-315, 340-345, 379`
* **Discrepancy Description**: Take is conditional on `takenBy` absent and `state == todo`, but not on `deletedAt` being absent, so a concurrent delete can leave a hold on a tombstone or on a step under a deleted parent. Take on a finished project is unspecified. The Done write clears `takenBy`/`takenAt` with no stated condition, so a plain per-field update racing a take could clear a just-granted hold, or leave a `done` step with a holder, since the hold sits outside `fieldTimes`.
* **Rationale & Recommendation**: State the conditions for each update (`ifMissing: deletedAt`, the Done update's `ifEquals`/`ifMissing`) and add race tests for take versus done and take versus delete.

### Rollback and mixed-version risk is understated and untested - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-style`
* **Affected Scope:** `Lines 89, 401, 584`
* **Discrepancy Description**: An old app drops saved writes for unknown keys "with the rest of that queue", yet the text says the other phone's data is unaffected. The dropped queue also holds that person's own unrelated writes (shopping, tasks, calendar), which is real data loss. The named test (401) restores a schemaVersion 1 cache on the new app and checks replay; it does not exercise an old registry meeting unknown keys. "Accepted and tested" overstates this. The mitigation also assumes the API ships before the app, which nothing enforces. Line 399 ("a write is never lost to a bad connection or a lapsed sign-in") is also incomplete against `retryRules.ts`: network, timeout and lapsed sign-in retry forever, 5xx three times, and other 4xx are final.
* **Rationale & Recommendation**: Either test the rollback path and state exactly what is dropped, or have the old app skip only unknown mutations. Say "accepted, replay on the same version is tested" otherwise. Put the decision in Open Questions, not only in Risks. Reword 399 to the actual rule.

### Risks section omits risks the design depends on - Severity: Major
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** `Risks and Mitigations (lines 565-586)`
* **Discrepancy Description**: Missing rows: clock skew (newest device time wins, 303, and `clampTime` stops only future times, so a phone set minutes ahead still wins); a hold that is never released and blocks the other person (315); authorisation and household isolation of the new routes, input validation, and the `lineIds` read in add-to-list; a partial tidy-order write. The loser notice (307, 583) is device-local with no clean-up rule for notices whose record is later deleted.
* **Rationale & Recommendation**: Add rows for each, with a mitigation. The standard asks for security implications explicitly.

### Alternatives rejected on the author's preference - Severity: Major
* **Reviewer Lens:** `egm-structural`, `egm-design`
* **Affected Scope:** `Alternatives C, G, I, M, Q (lines 473, 489, 497, 529); decisions at 312 and 315`
* **Discrepancy Description**: Several rejections read "by the author's choice" or "wish", with a thin technical reason (G's "calmer", I's feelings, Q's cost with no scope comparison). The interview (17) is not linked or recorded. Two decisions have no alternatives entry: take/release answering 200 with an outcome rather than 409 (312), and either person being able to release (315, versus only the holder).
* **Rationale & Recommendation**: Give each rejection a stated trade-off, such as the size of the displacement-notice code for G. Link or append a short record of the interview. Add short alternatives for the two missing decisions.

### Overclaims in goals, tests and wording - Severity: Major
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 61, 305, 393, 473, 557, 558`
* **Discrepancy Description**: G8 "lose nothing when two people edit at once" and line 473 "prevent one person's edit silently overwriting" overclaim: same-field newest-write-wins does replace the stored value (the design admits this at 90, 371, 517). The property "any order of the same writes gives the same project" (558) is false for take (first to arrive wins) and for Done, which clears the hold. The sentinel test (393) is said to check "every route's response to the other person", but responses carry record text, so as worded it cannot pass; line 305's "holds no private text, because nothing here is private" does not follow.
* **Rationale & Recommendation**: Reword G8 to "overwrites are limited to the same field of the same step, and the person replaced is told and keeps their text". Limit the property to edit writes and test take and Done separately. Limit the sentinel test to logs, push bodies and held pushes.

### Banned-word coverage is inconsistent - Severity: Major
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 28-34, 60-61, 411-430, 455`
* **Discrepancy Description**: Line 430 says "claim" and "assign" are never on screen, but `BANNED_PHASE_5` omits both. The proposed additions to MANUAL-CHECKS (455) lack a Phase 5 line under "Reading and touch" for banned words, colour alone and no red. The term "take" is used while the goals say "I'm on this", and line 87 says "archived" where the rest says "Finished".
* **Rationale & Recommendation**: Add the words to the list or say where they are enforced, add the MANUAL-CHECKS line, and settle one term for each concept.

### Stale hedge in CUJ 7 contradicts the decision - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Line 151 (against 90, 354, 425)`
* **Discrepancy Description**: "or, if the author prefers, says some may already be on the list" reopens a settled default.
* **Rationale & Recommendation**: Drop the parenthetical.

### Add-to-list duplicate rule is simpler than it behaves - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 354, 358, 425`
* **Discrepancy Description**: `writeEntry` answers `gone` for a tombstoned item, including one the person deleted, so "Already on the list" is wrong there. Tombstones expire after 30 days, so a later re-press re-adds the line. Editing a material after copying does not update the shopping line, and this is unstated.
* **Rationale & Recommendation**: Use different text for the `gone` case, and state the 30-day limit and the no-update behaviour.

### Id format and prefix-safety claims are unproven - Severity: Nit
* **Reviewer Lens:** `egm-design`, `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 259-270, 338`
* **Discrepancy Description**: Ids are client-made and used in `PSTEP#<projectId>#<stepId>`, so a `#` in an id could make a prefix query match another project's steps. The prefix claim on 270 lists only some existing prefixes (the partition also holds `DONE#`, `EDIT#`, `PROPOSAL#`, `MUT#`, `HELD#`, `REMIND#`, `CALSNAP#`, `CALSECRET#`, `MEMBER#`, `INVITE#`, `PUSHSUB#`), and the `PROJECTSTEP#` sentence is muddled: it does not start with `PROJECT#`, so the real rule is that each prefix ends in `#`.
* **Rationale & Recommendation**: Validate ids to a fixed character set and length, test it, rewrite the prefix rule, and point to where it is tested (for example `src/*/keys.ts`).

### Where "free" and "Former member" are decided - Severity: Nit
* **Reviewer Lens:** `egm-design`, `egm-style`
* **Affected Scope:** `Lines 191, 276, 338, 387`
* **Discrepancy Description**: "Reads as free" is computed on the client, but the server list counts `takenBy`; where the current-member filter applies is unstated. CUJ 12 says nothing shows "Former member", while line 387 shows it for `createdBy`.
* **Rationale & Recommendation**: State where the filter applies and scope the CUJ 12 sentence to holds.

### Finished projects count against the limit forever - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 283, 297`
* **Discrepancy Description**: There is no way to clear finished projects except deleting them. The 30-day child expiry also assumes the project tombstone cannot expire before its children's batches finish, which holds only while they share an `expiresAt`.
* **Rationale & Recommendation**: Note both in the limits or Future Improvements.

### Delete-batch crash recovery is described two ways - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 379, 537, 576`
* **Discrepancy Description**: Line 537 accepts "a few hidden children" after a crash; line 576 says a retry finishes the batches. How a retry passes the conditional tombstone is not stated.
* **Rationale & Recommendation**: Pick one account and state the retry path.

### CUJ and goal coverage gaps - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 61-64, 183, 200, 342, 346, 372, 392`
* **Discrepancy Description**: G9 is not mapped to any CUJ. No CUJ covers release by the other person, a refused create at a limit (409 `project_limit`, `step_limit`, `material_limit`), tidy order, or contested whole-project take. CUJ 11 says shopping lines work "the same way" but line 359 says they are not optimistic. Line 200 mixes an Author decision and a Claude decision in one row. Line 342 omits `title` from the edit column although it has a field time; `results.status` values (346) and the push title for `projectAdded` (392) are not listed. Line 372 is ambiguous on whether typing 0 clears or is refused, and "totals" should be "figures".
* **Rationale & Recommendation**: Add the missing journeys and G9 mapping, split the row on 200, and name the status values, push text and the 0 behaviour.

### Terms, structure and ordering - Severity: Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** `Lines 21, 25-44, 77, 79-93, 224-239, 321-348, 436-455, 563`
* **Discrepancy Description**: Hoardwise is defined at 21 and 44 and mentioned at 77 and 563. The Open Questions intro (81) says defaults are "marked Claude", but the bullets say only "Default:". Terms used but undefined for a cold reader: envelope, stale, outcome, holder, `guarded`, `ifMissing`/`ifEquals`, tidy order, overlay. "What is reused" (224) precedes "Components" (239), unlike phases 3 and 4. The manual-checks table (436-455) reads like verification-plan material, and the API routes section (321-348) has two overlapping tables without a sub-heading.
* **Rationale & Recommendation**: Define each term once, add the tag or reword the intro, reorder, and merge or label the route tables.

### Brittle and forward references - Severity: Nit
* **Reviewer Lens:** `egm-design`, `egm-style`, `egm-structural`
* **Affected Scope:** `Lines 387, 438, 443, 455, 586`
* **Discrepancy Description**: MANUAL-CHECKS references use line numbers that will drift before the finish step. "Step 1", "step 3", "step 5" and "the finish step" appear before the steps are defined (they exist at lines 618-675, so the references resolve).
* **Rationale & Recommendation**: Cite check names or ids, and add a pointer to the implementation plan.

### Wording and calibration nits - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 234, 273, 291, 295, 373, 383, 407, 411, 465, 485, 489, 505, 509, 551`
* **Discrepancy Description**: "On it since 3 weeks ago" is ungrammatical (use "On it for 3 weeks" or a date) and is missing from the wording table. "None, and that is the point:" and "A test fixes that" are filler. "The competing the feature exists to stop" uses "competing" as a noun. Alternative G is "calmer" with no support, and line 489 contradicts G9. "Adding lines at once is the common case" (505), "worse than no reading" (509) and "about forty lines" (551) are unsupported. Line 465 ("about the size of phases 2 to 4") is vague and may echo the brief's "six or seven pull requests", which is wrong for phase 3. Line 383 is unclear ("Adding a sixth inline is replaced by a helper"). Line 295 "One small item" is not a limit and repeats 561. Lines 273 and 291 state "13 days" and "14 days" as the same limit in two units.
* **Rationale & Recommendation**: Fix, drop or mark each as an estimate.

### Redundant rationale across sections - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Whole document`
* **Discrepancy Description**: The same points are repeated in several sections: nothing points at Hoardwise (21, 44, 77, 263, 459, 563); counts are never stored (338, 543, 545); the `forRecipes` label (214, 231, 354, 499, 578); delete batches (93, 212, 379, 531, 535, 576); undo as re-add (91, 213, 382, 541); the Today line (83, 410, 529, 590). Line 232 puts the reason steps are not tasks in a "How" cell.
* **Rationale & Recommendation**: Keep each decision in one place and cross-reference it. Move rationale to the Alternatives.

### Success measure and pass threshold - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Line 64`
* **Discrepancy Description**: The success measure is "asking the two people". This matches phases 2-4, but there is no pass threshold.
* **Rationale & Recommendation**: Optional: say what answer counts as success.
