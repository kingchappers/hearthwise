# Implementation Readiness Report

**Target:** `docs/designs/phase-5-diy-projects.md` (lines 603-708, "Detailed Implementation Plan" to the end)
**Test:** Implementation Readiness (Stage 9). The document had not been edited since the earlier stages.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details` | completed |
| `egm-style` | completed |

Overall verdict: not ready to execute as written. There is 1 Blocker and 21 Major findings; the Nits follow at the end. The step order, acceptance lines and pure-rule tests are strong. The gaps are places where an implementer must still decide something.

Verified by the codebase reviewer: the files and symbols the plan names exist as described (`ENVELOPE_KEYS`, `RestoreEntry`, `parseRestoreBody`, `RestoreStatus`, `moveOptions`, `withHousehold`, `notifyAfter`, `replayOf`, `withWriteRecord`, `clampTime`, `writeEntry`, `forRecipes`, the store's `ifMissing` and `ifEquals`, flat-file routing, and the files in the modify lists). The `RestoreStatus` addition breaks no exhaustive map in `app/`. The `MANUAL-CHECKS.md` line numbers cited near lines 440-453 match today's file.

## Prioritized Findings (Blockers -> Major -> Nits)

### Rollback and partition-read audit names a place that reads nothing - Severity: Blocker
* **Reviewer Lens:** `egm-codebase-details`, `egm-style`, `egm-implementation-readiness`
* **Affected Scope:** line 616 (Approach), line 704 (Verification Plan), item 11
* **Discrepancy Description**: Line 616 lists `removeMember` as a place that "reads a prefix of a household's partition as a whole". `removeMember` (`src/household/members.ts:35-50`) reads no prefix; it deletes the membership and member records and conditionally updates the meta item. Design line 387 says the same ("`removeMember` rewrites nothing"). Only `moveOptions` (`invites.ts:127-143`) enumerates data kinds. Line 704 says the new items are "inert to older code", but line 387 says "the hazard returns" after a rollback. No numbered item performs the audit; it is only a pull-request note, and the phrase "reads a prefix ... as a whole" is unclear.
* **Rationale & Recommendation**: Name `moveOptions` only, or say `removeMember` was checked and reads none. Add a step 1 item that greps for whole-partition readers (backup, `store-cli`, cleanup, `moveOptions`) so the list comes from a check. Replace "inert" with what is known and unknown. Use plain wording such as "queries the whole partition or a list of prefixes".

### Step 1 acceptance contradicts item 8 - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-implementation-readiness`
* **Affected Scope:** lines 620, 629 (design line 338)
* **Discrepancy Description**: Line 620 says routes "refuse nothing with a 4xx that the retry rules would drop". Line 629 requires the three `TaskError` refusals, and line 338 names 404 `not_found` and the 409 limits, which are 4xx. "The three" is true only for step 1; `material_limit` arrives in step 3 (line 338 lists four).
* **Rationale & Recommendation**: Reword: "no outcome that can be queued is a 4xx; only `not_found` and the limit codes are". State the refusal count per step.

### Step 1 route scope and registration order are unspecified - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** item 8 (line 629), item 2 (line 623)
* **Discrepancy Description**: Item 8 says "the routes in 'API routes'", but that table (lines 323-336) includes material routes and `add-to-list`, which are step 3. `GET /projects/{id}` returns `materials` (line 348). "Registered in order; the route test pins the exact ordered list" gives no order, and `apiRoutes.test.ts` pins a real ordered list. The position of `registerProjectRoutes` is not stated.
* **Rationale & Recommendation**: List the exact step 1 routes, say `GET /projects/{id}` returns `materials: []` until step 3, write out the order, and place `registerProjectRoutes` (for example after `registerCalendarRoutes`). Item 8 should say "project, step, take, release and restore routes".

### Take and release for a project is undefined - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-style`
* **Affected Scope:** item 5 (line 626), design line 314
* **Discrepancy Description**: Item 5 uses `ifMissing` on `takenBy` plus `ifEquals` on `state`. A project has `status` (`active` or `finished`), not `state`. The `done` outcome is defined for steps only. Not stated: whether a finished or deleted project can be taken, the `ifEquals` guard for a project, whether finishing clears the hold, and whether `holds.ts` takes a record kind or has separate functions.
* **Rationale & Recommendation**: Add a table of record kind, preconditions, update and outcomes, and add the project cases to item 5's tests.

### Project restore through `restore.ts` and `children.ts` is not specified - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** items 6, 10 (lines 627, 631), item 14
* **Discrepancy Description**: `restoreRecord` is one conditional update, but a project restore is N batched transactions plus tombstone removal. The plan does not say how `restore.ts` calls `children.ts`, which function owns the "applies only to the deletion seen" check (`ifEquals: { deletedAt }`), where the write record goes when one request carries several entries, or how `project_limit` is counted across the batch. Item 10 does not say `project` joins the `deletedAt` variant of `RestoreEntry` (the `raw.kind !== 'money' && !== 'event'` branch and the kind check near `taskValidation.ts:335-353`). `restoreRoute` in `src/api/tasks.ts:103-115` logs and notifies per kind and is in no item's list.
* **Rationale & Recommendation**: Name the `children.ts` delete and restore signatures and show the call from `restore.ts`. State the `RestoreEntry` change. Say whether `src/api/tasks.ts` is modified or unchanged.

### `positionBetween` has no contract - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`
* **Affected Scope:** item 1 (line 622)
* **Discrepancy Description**: No signature, no return shape when a tidy is needed ("except where the function says it needs a tidy"), no behaviour for equal inputs or `before >= after`, no alphabet order. The app and the server must not disagree on it.
* **Rationale & Recommendation**: Fix the signature, return shape, error cases and alphabet.

### Tidy order, move up/down, insert between and AddSteps have no owning item - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-implementation-readiness`
* **Affected Scope:** items 1-21 (lines 622-648); design lines 92, 111, 275, 574
* **Discrepancy Description**: The tidy write (up to 40 position writes) is the "only multi-step write". No item says where it lives, how the client computes neighbours from the overlaid, `compareSteps`-sorted list, or how a pasted multi-line add gets successive positions. CUJ 2 needs insertion between two steps, and no insertion UI or position-computing item exists. No test is named for a concurrent move still winning on time.
* **Rationale & Recommendation**: Add an item for the `app/lib/` logic (for example `projects.ts` or `projectForm.ts`) with signatures and tests.

### Delete, Undo, free, finish and "Bring back" UI is unassigned - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`
* **Affected Scope:** items 18, 20, 25
* **Discrepancy Description**: Undo is a re-add under a new id, and a held or done step comes back not started (lines 91, 382). No item names the component or action for delete step, delete material, Undo, "Free this step", "Mark as finished", "Bring back" or the "Finished" section, or where the original text, note, state and position are kept for re-adding and for how long.
* **Rationale & Recommendation**: Assign each to a named file and test.

### Step 3 omits changes to code from steps 1 and 2 - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-implementation-readiness`
* **Affected Scope:** items 22-25 (lines 653-656), step 3 acceptance (line 651)
* **Discrepancy Description**: Materials are children, but step 3 does not modify `src/projects/children.ts` (delete and restore must cover `PMAT#`, and the 100-child test must include materials), `getProject` and `listProjects` (item 5; `listProjects` reads only `PSTEP#`, but the list and the Deleted row "12 steps, 8 materials" at line 381 need counts), or `deleted.ts`. Acceptance does not mention delete or restore of materials. Item 6 does not say whether to test `PMAT#` children now with hand-written records.
* **Rationale & Recommendation**: Add `children.ts`, `projects.ts` and `deleted.ts` as Modify items in step 3, or define a separate count query, with tests.

### Modify lists name directories and tests have no paths - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** items 7, 9, 10, 13, 18, 19, 21, 22, 25, 26, 28-30, 32
* **Discrepancy Description**: "`app/components/projects/` (Modify)" is a directory. Missing paths: which component hosts "Planned for", the costs section and the "Add details" changes; `app/lib/projectForm.ts` (planned-day rules and `parsePounds`) in steps 4 and 5; `src/projects/projects.ts` and `src/api/projects.ts` wiring in steps 4 and 5; and `src/api/__tests__/projects.test.ts` for the new fields. Tests are "a test" or "their tests" with no path (for example item 9 has no `src/push/__tests__/events.test.ts`; item 21's restored-cache test is `app/lib/__tests__/persistedCache.test.ts`). Item 28 puts "`_index.tsx` is not changed" inside a Modify list.
* **Rationale & Recommendation**: Give each exact path with Create or Modify.

### "Twice is a no-op" for add-to-list is not what `writeEntry` does - Severity: Major
* **Reviewer Lens:** `egm-codebase-details`
* **Affected Scope:** item 22 (line 653), acceptance line 651
* **Discrepancy Description**: `applyItemWrite` (`src/shopping/apply.ts:42-58`) returns `noop` only when no field is newer than the stored `fieldTimes.text`. A second press with a later `clientAt` gives `applied`, rewriting the shopping line's text and undoing an edit made on the list. `addPlanToList` avoids this by fixing `clientAt` once per review (`meals/addToList.ts:63`). The plan does not say what `at` is.
* **Rationale & Recommendation**: State the exact value (the material's own `fieldTimes.text` or `createdAt`, or a text-less create-only write). Add a test where the list line's text is edited between two presses and survives.

### App-side refusal mapping, copy and runner types are unstated - Severity: Major
* **Reviewer Lens:** `egm-codebase-details`, `egm-implementation-readiness`
* **Affected Scope:** item 14 (line 640), item 13
* **Discrepancy Description**: `mutations.ts` handles restore refusals through hard-coded lists (for example `EVENT_RESTORE_REFUSALS` near line 443) and `describeFailure` (line 357). Item 14 covers `stale` and `held_by_other` only, not `project_limit` or `entry_changed` for `restoreProject`, nor where "This household has reached 60 projects." lives (`calendarText.ts` holds the calendar equivalent). The `ProjectMutationKind`, `ProjectMutationVars` types and `PROJECT_RUNNERS` map that the typed registry needs are not named.
* **Rationale & Recommendation**: Name the refusal list, the copy home and the types.

### `deleted.ts` helper is not defined - Severity: Major
* **Reviewer Lens:** `egm-codebase-details`, `egm-style`
* **Affected Scope:** item 20 (line 646)
* **Discrepancy Description**: "A helper replaces the sixth positional argument", but `deletedEntries` has five parameters and returns five groups (`deleted.ts:16-19`); no sixth exists (line 383 says one is avoided). The helper's name, signature, return shape and how counts are derived from a `useProjects()` list are unstated.
* **Rationale & Recommendation**: Give the signature and return type, and reword to "added through a helper, not a sixth positional argument".

### Stale-field notice shape is unspecified - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`
* **Affected Scope:** items 14, 15 (lines 640-641), design line 307
* **Discrepancy Description**: No record type, id, key structure, cap or dedupe rule. Not stated what is kept for non-text stale fields (`position`, `state`, the planned group, a cost figure), or how `onSuccess` learns "who changed it" when the answer carries `updatedBy` only.
* **Rationale & Recommendation**: Define a `ProjectNotice` type and per-field rules.

### Add-to-list answer and edge cases are unspecified - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-style`
* **Affected Scope:** items 22, 23 (lines 653-654)
* **Discrepancy Description**: The `results[].status` vocabulary is not given (`created`, `already`, `cleared`, unknown id are candidates). Not stated: behaviour for a deleted project or line, an empty `lineIds`, or duplicate ids. The test for two people adding lines at once that the acceptance promises is not listed. Item 23 modifies `src/push/events.ts` with no stated change.
* **Rationale & Recommendation**: List the vocabulary and edge cases, and say what changes in `events.ts`.

### Push events are not tied to routes - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-style`
* **Affected Scope:** item 9 (line 630)
* **Discrepancy Description**: It does not say which writes send `projectAdded` and which `projectChanged`, the `projectAdded` body, or whether materials and delete routes call `notifyAfter`.
* **Rationale & Recommendation**: Add a route-to-event table.

### Timeline mapper and Today effects are unspecified - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`, `egm-style`
* **Affected Scope:** items 27, 28 (lines 663-664), design line 235
* **Discrepancy Description**: Item 28 says `_index.tsx` is "not changed", but `NowAndNext` uses `useTimelineSources().inputsFor`, so Today starts polling `useProjects()`; `today.test.tsx` and `pages.test.tsx` will likely need project mocks, and line 235 says Today gains a fifth source. Item 27 omits the project's `TimelineItem` fields (`key`, `on`, `endOn`, `who`, `forViewer`, linked id), the new `ALL_DAY_ORDER` value (a non-exported `Record<TimelineType, number>`; dinner is 2), the label ("Project: {title}", design line 363, which `TIMELINE_WORDS` pins), that `nowAndNext` ignores all-day items, and that `holderOf` with the members list must hide a departed holder.
* **Rationale & Recommendation**: Resolve the contradiction and specify the mapper.

### Offline e2e claim overstates what it proves - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-codebase-details`, `egm-implementation-readiness`
* **Affected Scope:** items 33, 34, step 6 acceptance (lines 677, 679), step 2 acceptance (line 637)
* **Discrepancy Description**: `e2e/offline/main.tsx` is a standalone spike with its own stub endpoints (see `DECISIONS.md` phase 4 step 6 rows); it proves the queue rule, not the real take and move. Both `main.tsx` and `offline.spec.ts` need new stub routes and spike UI, and the assertions are not named. The real replay case is the restored-cache test in item 21.
* **Rationale & Recommendation**: State the limitation, name the stub additions, and point the real take and move at the registry, overlay and restored-cache tests plus manual checks.

### Store contract test comes after its use and misses the combination used - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-codebase-details`
* **Affected Scope:** items 5, 12 (lines 626, 633), line 609
* **Discrepancy Description**: Item 5 needs `ifMissing(takenBy)` plus `ifEquals(state)` on different attributes in one update, and design lines 314-316 add `ifEquals(takenBy: <departed holder>)`. Item 12 tests `ifMissing` then `ifEquals` on the same attribute and comes last, breaking the plan's own test-first rule.
* **Rationale & Recommendation**: Move the contract case ahead of item 5 and name the exact combinations on all three stores.

### Cost `0` handling is ambiguous - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-implementation-readiness`
* **Affected Scope:** item 30 (line 671), design lines 233, 372
* **Discrepancy Description**: "`0` as a clear, `null` as a clear" does not say which layer maps 0; `parsePounds` refuses 0.
* **Rationale & Recommendation**: Pin one rule (the form turns 0 into `null`, or the server accepts 0 pence).

### Step 5 has no sentinel-test update - Severity: Major
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** items 30-32, design lines 393, 557
* **Discrepancy Description**: The design requires a distinctive figure in the sentinel test, but item 23 covers only material text.
* **Rationale & Recommendation**: Add it to item 30 or 31.

### App test plan is thin - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-style`
* **Affected Scope:** items 13-21, 24, 28, 33
* **Discrepancy Description**: "A test for each that has behaviour" is unmeasurable. Items 18 and 19 name no cases (axe, 44 px targets, empty and limit states are mentioned loosely). The step 2 claim "two people see and edit the same plan" (line 637) has no test.
* **Rationale & Recommendation**: List cases and assertions per item as in items 1-12, or say the claim is checked manually in step 6.

## Nits

All of these are Severity: Nit.

* **Notices tracked outside the item lists** (`egm-implementation-readiness`; line 614, items 21, 33, 35). `docs/DECISIONS.md` is edited in each step's PR but is in no list except item 35. `touchTargets.test.ts` "if it lists files" and `README.md` "if it lists features" leave decisions to the implementer. Decide now.
* **`projectFiles()` has no selection rule** (item 21, line 647). Say which paths it covers (`components/projects/**`, `lib/project*.ts`, `hooks/useProjectActions.tsx`, `routes/plan.projects*`) and add `PlanSwitch` and `plan.tsx`. "When they exist" for cost files is conditional; keep the banned-word check for cost files in item 32 only (items 21 and 32 duplicate it).
* **Prefix test source** (item 3). Import and name the real exported prefix constants; the partition also holds `MUT#`, `HELD#`, proposal, invite-pointer, member, snapshot and `CALSECRET#` keys, beyond the seven in design line 270.
* **`clampTime` import** (item 4). `clampTime` and `THIRTY_DAYS_SECONDS` are in `src/tasks/record.ts`; say the apply files import them, as `itemOverlay` does for shopping.
* **`projectLookup.ts`** (item 13). State whether it copies or generalises `recipeLookup.ts`.
* **Uncalibrated wording** (line 607). "so the problem is addressed" conflicts with the month-later success check (line 64); use "a usable plan" (line 586). The sentence on `yarn typecheck` duplicates the Verification Plan (lines 699-700).
* **Step 6 wording** (lines 677, 681). "Every real-world check below" should say "above" (lines 436-455). Item 35 says CLAUDE.md gets "the `moveOptions` list", but CLAUDE.md has no such list; say what is added.
* **Line 438 "Line numbers are those of the file today"** goes stale once item 34 inserts lines. Cite by check text.
* **Verification Plan** (lines 697-704). Rename "Static Analysis" to "Guard tests". `yarn test:e2e` needs `PLAYWRIGHT_CHROMIUM_EXECUTABLE` locally.
* **Goal table** (lines 685-695). G7 omits items 24 and 25 (offline materials); G4 omits item 33. Recheck item ranges after new items are added.
* **"The API ships before the app"** (line 616). Steps 3-5 combine server and app work in one pull request; state that the order holds per deploy or split the pull requests.
* **Item 4 and tidy order test** (item 1 and 4): see Major findings above for the owner of each; no further nit.

## Severity Counts

| Severity | Count |
| --- | --- |
| Blocker | 1 |
| Major | 21 |
| Nit | 12 |
