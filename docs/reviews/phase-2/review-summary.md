# Phase 2 design: review history

Design: [`../../designs/phase-2-meal-plan.md`](../../designs/phase-2-meal-plan.md). Brief: [`../../designs/phase-2-concepts-brief.md`](../../designs/phase-2-concepts-brief.md).

The author was away for all of this. Findings were resolved by Claude, and every decision beyond the author's own words is marked **Claude** in the design's decisions table.

## Stages run (EGM review method)

| Stage | Reviewers | Result | What changed |
|---|---|---|---|
| Brainstorm | Design, codebase details, zoom-out, comprehension, implementation readiness, structural | 3 blockers, many majors | Merge scope cut to one add; `forRecipes` label; new add route with a marker; device-local cooking ticks; plan day shape; staging into six steps |
| 5 Zoom out | Zoom-out | 2 blockers, 7 majors | Ingredients and steps stored as text lines; server double-add check and store transaction limit removed; plan servings fixed when set; recipe purge case defined |
| 6 Comprehension | Comprehension (twice) | 32 findings, then 34 | Glossary, background, tick wording, limits, marker rules, many cross-references |
| 7 Critic | Design, structural, style | 1 blocker, 10 majors | Refetch before "gone"; rounding up; parser cases (`1,500`, "a tin", list markers, notes after a comma); draft kept until the server accepts; payload limits; review tick wording |
| 8 Intermediate zoom out | Zoom-out | no blockers, 4 majors | Parse tables moved to the test table; marker answer trimmed; 50 ms contingency moved to Future Improvements |
| 9 Implementation readiness | Implementation readiness, codebase details, style | 5 blockers, 16 majors | Steps reordered (cooking view before plan); route renamed `recipes.$id_.edit.tsx`; sign-out cleanup moved to `persistedCache.ts`; flat add body; existing tests listed; data shapes pinned |
| 9 re-audit | Implementation readiness | 2 blockers, 14 majors | Review line keys made stable; EasyPicks preview in its sheet; draft key `new`; hook return shapes; exact test files; contract tests item; `sameMeal` |

Each stage got one re-audit at most, as the method requires.

## Findings left as accepted trade-offs

*   **Style nits not applied.** Heading case, a few uses of "never" and "small", and some table cell punctuation. None affects meaning.
*   **Phase 1 code names** (`guarded`, `withWriteRecord`, `clampTime`) are used without a glossary entry beyond the main terms. A reader needs the phase 1 design open beside this one.
*   **Recipes outside the 50 newest deleted** cannot be restored from the app, though they stay in the table for 30 days. Judged rare for two people.
*   **Concurrent adds by both people** can duplicate shopping lines. Accepted, with the extras deleted by hand.
*   **Two people editing one recipe** lose one edit. Accepted. One earlier version is a Future Improvement.
*   **The wording test** only catches banned words introduced in steps 2 to 5 when step 6 extends it. Each pull request can run it locally.
*   **The re-audit's remaining nits** (for example the `POLL_MS` constant being defined three times) were not changed.

## Not yet reviewed by the author

See "Open Questions" in the design: no server check for adding a dinner twice, two onion lines, rounding up, five tabs, the merged line's name.
