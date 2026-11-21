# Goldfish Review Report

**Target:** `/Users/samuelchapman/Projects/hearthwise/docs/designs/phase-5-diy-projects.md` (`lines 1-708`)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |

Note: the reviewer did not open the phase 1 to 4 design documents. It saw their content only through CLAUDE.md and DECISIONS.md. It checked claims against `src/household/invites.ts`, `src/shopping/*`, `src/meals/addToList.ts`, `src/store/*`, `src/shared/money.ts`, `src/api/{notify,writeRecord}.ts`, `app/lib/calendar.ts` and `app/routes/_index.tsx`. Verdict: the context-sufficiency prerequisite passes and there are no Blockers. Most reuse claims check out (`clampTime`, `THIRTY_DAYS_SECONDS`, `ENVELOPE_KEYS`, `notifyAfter`, `lookupState`, `MAX_FOR_RECIPES_LENGTH`, `MAX_PENCE`, `moveOptions`, and the manual-check line numbers).

## Prioritized Findings (Blockers -> Major -> Nits)

### Materials as a record kind and project-level holds exceed the stated problem - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** "Decisions this plan rests on" (line 206), "Materials and the shopping list" (lines 350-359), Step 3 items 22-25
* **Discrepancy Description**: The brief said materials are plain text lines. The design adds a third prefix, `PMAT#`, with its own write rule, three routes, three mutation kinds and an overlay. It also adds a project-level take and release (two more routes and kinds). Together that is twelve mutation kinds and six pull requests, which the design itself calls phase 2-4 sized.
* **Rationale & Recommendation**: The stated problem is seeing the plan and not starting the same step. Steps 1 and 2 solve that. Try the cheaper form first. The materials box takes pasted lines, and "Add to the shopping list" sends them with client-made line ids once per press, as the meal review does (`addPlanToList` already accepts them). That removes `PMAT#`, `applyMaterial`, three routes and three mutation kinds. If materials must persist, reuse the step record with a `kind` field. Decide whether a project-level "I'm on this" is needed beyond CUJ 4.

### "Pressing twice adds nothing" does not hold in the code - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 353-355, CUJ 7 (line 151), Step 3 item 22
* **Discrepancy Description**: The design says `writeEntry` answers a no-op for an item that exists. In `src/shopping/apply.ts`, `applyItemWrite` on an existing live item applies `text` whenever `at` is newer than `fieldTimes.text`. `addPlanToList` passes `at = clampTime(clientAt ?? nowMs)`, so a second press usually has a newer `at`.
* **Rationale & Recommendation**: The second press is `applied`, not `noop`, and it silently reverts any edit made to the shopping line's text since the first press. Use a deterministic `at` for a copied line, such as the material's own `fieldTimes.text`. Alternatively, skip ids that already exist. Add a test that an edited line survives a second press. Related nits: after the 30-day tombstone expiry a cleared item is created again, so "never added again" is really "for 30 days". The row copy "Already on the list" is inaccurate for a cleared line.

### Take and release can break the "changed only by take and release" rule under races - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** "Data model" (lines 276-277), "Taking a step" (lines 312-319), Step 1 items 4-5, line 558
* **Discrepancy Description**: `done` clears `takenBy`, but a take does not bump `updatedAt`. The put path conditions on `updatedAt` and builds its `remove` list from the record it read, as `updateFor` in `src/shopping/items.ts` does. A take landing between the read and the put leaves `takenBy` on a done step. Setting the step back to `todo` then brings back a stale holder, which breaks the design's own property test. The take update is not conditioned on `deletedAt` being absent, so it can land on a tombstoned step. Project hold versus step hold semantics are undefined.
* **Rationale & Recommendation**: Make take and release also move `updatedAt`, or make `done` conditional on `takenBy` being unchanged. Add `ifMissing: ['deletedAt']` to take. Write one sentence on how a project hold relates to step holds, including finished projects and done steps.

### Planned-day feature puts a step-prefix scan on Today every poll - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** "The planned day on the calendar" (line 364), "Sync, offline and cache" (line 397), Alternative V (line 549), "Limits" (lines 281-297)
* **Discrepancy Description**: `inputsFor` feeds `useTimelineSources`, which `app/routes/_index.tsx` uses for "Now and next". Adding `useProjects()` there runs the full project poll, including the `PSTEP#` prefix query for counts, on Today and on every calendar view. "No step text is read" is a bytes claim. DynamoDB read cost is per item read, so 60 projects of 40 steps (live and tombstoned) are still read each poll, which is the cost Alternative V rejects. The brief's "nothing on Today" decision is not honoured at the data layer, and the design does not say whether project items appear in Now and next.
* **Rationale & Recommendation**: Feed the timeline from a cheaper source, such as a projects query without counts or only projects with a planned day. Compute counts only when the list page is open. Lower the caps or accept the read cost explicitly. State whether project items show in Now and next.

### Tidy-order multi-write rebalance is speculative and contradicts the brief - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Open Questions (line 92), "Tidy order" (line 275), Risks (line 574), "Correctness" (line 558)
* **Discrepancy Description**: The brief said "no automatic rebalance". The design adds one, the only multi-record write in the feature, for a case it calls "not expected in practice". Two phones can run it at once, and a half-finished rebalance mixes with the other person's moves.
* **Rationale & Recommendation**: With at most 40 steps and base-36 midpoints, reaching 64 characters needs hundreds of moves in one gap. Drop the rebalance. At the limit, refuse the move calmly ("Steps are very close together. Move a different step."). Revisit only if it is ever seen. Make "no rebalance" the default answer to the open question.

### Project delete and restore can leave permanent orphans - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 379-380, 576, 537
* **Discrepancy Description**: Children carry no `expiresAt` until the delete batches run. If the batches stop part-way, the unmarked children are never purged. A retry "runs the same steps again", but the project is already tombstoned and a second delete would answer `gone`. Alternative S is rejected because a cleanup job needs a new index, yet `src/calendar/cleanup.ts` and the hourly maintenance tick are precedent.
* **Rationale & Recommendation**: State that delete on a tombstoned project finishes the batches, or accept a bounded leak explicitly. Consider letting a read of a deleted project finish the marking.

### Technical Plan sits at code altitude - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 271-277, 379, 398, 622-633
* **Discrepancy Description**: The Technical Plan carries attribute lists, the midpoint algorithm, batch size 25, the twelve kind names, registry tests and test case lists.
* **Rationale & Recommendation**: Move these to the plan or the code. Keep the architecture sections to components, interfaces and invariants.

### Third and fourth copies of the per-field last-writer-wins rule - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** "What is reused" (line 229), Step 1 items 4-5, Step 3 item 22
* **Discrepancy Description**: The rule already exists in `src/shopping/apply.ts`, `src/meals/applyRecipe.ts`, `src/calendar/applyEvent.ts`, `src/money/applyEntry.ts` and `src/tasks/tasks.ts`. The design adds `applyProject`, `applyStep` and `applyMaterial`, each with an overlay parity test, and says it is "not shared code".
* **Rationale & Recommendation**: Extract one small shared helper ("set a field if newer, record its time, report the stale list"), or state that the duplication is a deliberate repo convention. The new `stale` list would otherwise be written three times.

### Cost display needs a formatter the design does not name - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** CUJ 9, "Costs" (lines 370-374), "Wording"
* **Discrepancy Description**: `formatPounds` in `src/shared/money.ts` always prints pence ("£1,250.00"), but the design's copy is "£1,250 of £4,000". `parsePounds` refuses 0, which the design notes. The reuse table says `formatPounds` is reused.
* **Rationale & Recommendation**: Show pence as the money page does, or add and name a whole-pound formatter.

### Loser notice cannot always say who changed the field - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 305-307
* **Discrepancy Description**: `stale` means the field's write was older than what is stored. The stored value may come from the same person on another device, or from an out-of-order replay. "{name} changed this after you" would then be wrong. The answer carries `updatedBy` only for the whole record.
* **Rationale & Recommendation**: Record per-field authorship, or use copy that is true either way ("This was changed after you wrote it").

### Brittle manual-check line-number references - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 438-453
* **Discrepancy Description**: The numbers match `docs/MANUAL-CHECKS.md` today, but any edit to that file shifts them.
* **Rationale & Recommendation**: Name each check by its first words instead of a number.

## Net advice

Fix the take/release race and the duplicate-press rule first, since they are correctness errors. Decide on materials as a record kind, the Today read cost and the rebalance before Step 1, because they change the number of record kinds and routes. Steps 1 and 2 already answer the stated problem if the rest is cut.
