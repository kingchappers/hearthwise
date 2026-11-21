# Comprehension Report

**Target:** `docs/designs/phase-5-diy-projects.md` (FeatureRange lines 1-602, DetailedRange lines 603-708)
**Reviewer:** `egm-comprehension` (read the document alone, plus its persona file)

## What this proposes

Phase 5 adds a Projects page under Plan where the household's two people keep a shared, ordered list of steps for a DIY job. Each step is its own record, so both people can add and edit steps with no lock and no approval. A person can tap "I'm on this" on a step or a whole project. The first tap to reach the server wins, and the other person is told calmly and sees the holder's name. A project can optionally hold materials lines, which copy to the shopping list once each. It can also hold a planned day, which shows as an all-day item on the calendar, and two cost figures kept apart from the money ledger. If an edit loses to a newer one, the app keeps the loser's text in a device-local notice. The work is split into 6 pull requests, and steps 1 and 2 already give a usable plan.

## How the existing system works, per this document

Hearthwise is a two-person household app with six tabs, run either as AWS Lambdas or as one self-hosted container, from the same code. Every household write carries a client-made `mutationId`. The server stores a write record, so a retry is answered from it. The app queues writes offline and overlays pending ones on cached data. Recipes use per-field last-writer-wins and a tombstone with a 30-day expiry. The recycle bin and its restore, the shopping list (`writeEntry`) and the calendar timeline are built on the device. Tasks have an approval flow, which is why steps are not tasks.

## Findings

1. **Major.** Scope: Overview and "Terms used below" (lines 21 and 44), the term "Hoardwise".
   Both places say "Hoardwise is the author's separate budgeting app". Line 21 uses the name before the glossary defines it, and line 44 repeats the same statement. A reader cannot tell what "touches" or "points at Hoardwise" would mean in practice. The document never says what the concrete risk is, such as shared tables or keys. Line 262 hints at this. State the isolation concern once, in the glossary.

2. **Major.** Scope: lines 4 and 17, and the "Decided by" column (line 197).
   "Claude" and "Author" are used as decision owners. Line 17 defines Claude, but the Status line (line 4) uses the term first. The Status line says "not yet reviewed by independent reviewers" while line 17 says the brief was reviewed by six. Clarify that the brief was reviewed and this design has not been, and say which Claude decisions the reviewers changed.

3. **Major.** Scope: "Taking a step", the "Take" bullet versus CUJ 3 (line 119) and the outcome list.
   The document does not say how "I'm on this" differs from the stored `state`. The outcome names (`taken`, `already_yours`, `held_by_other`, `done`, `gone`, `released`, `not_held`) are first listed in the logs bullet (line 393). The route table says answer `{ record, outcome }`, while the answer table says `{ project | step, outcome }`. The take outcomes are never listed in one place near the routes, and neither is the UI behaviour for each (what shows for `done`, `already_yours` or `not_held`). A reader cannot write the take state machine without assembling it from three sections.

4. **Major.** Scope: "Taking a step" (line 314), "ifMissing", "ifEquals", "ConditionFailedError" (lines 314 and 633).
   These conditional-update primitives are named as if known, with no definition and no link. "Contract tests on all three stores" (line 633) never lists the three stores.

5. **Major.** Scope: "Writes and conflicts", "The loser notice" and CUJ 5 (line 135).
   CUJ 5 says "the newer device time wins". `clampTime` is described only as "stops a time in the future". A phone with a clock hours slow would silently always lose, and the document should state that as a limitation. The notice says "{name} changed this after you", but last-writer-wins by device time does not mean the other person changed it later in real time. The wording can mislead.

6. **Major.** Scope: "Data model", "Position" and "Tidy order" (lines 274 and 275), plus Open Questions (line 92).
   The tidy order is inconsistent. Line 275 says the phone sends "one write for each step". Line 92 says "one write that re-spaces every step in the project". It is unclear whether this is one request or up to 40 mutation records, how a partial failure behaves offline, and whether the order is briefly wrong. Whether a cap of 40 steps makes a 64-character position reachable is not shown ("not expected in practice" is not an argument).

7. **Major.** Scope: "Deleting, restoring and finishing" (lines 379 and 380) and the Risks table (line 575).
   Delete is "a conditional tombstone, followed by setting the same `expiresAt` ... in batches of at most 25 per transaction, followed by the write record", while add-to-list is "no transaction across lines". The relationship between "write record last" and "transaction" is not explained. Neither is how the parent check at read time works, why the children's expiry matters if the parent is hidden, or what actually deletes expired rows and when.

8. **Major.** Scope: "Materials and the shopping list", line 354, versus CUJ 7 (line 151).
   CUJ 7 offers two behaviours for a second press. The Technical Plan chooses "Already on the list", and the CUJ was not updated. Line 354 says a line "ticked and cleared" returns `gone` and shows "Already on the list", which is inaccurate for a cleared line. Ticking and clearing on the shopping list are not described.

9. **Major.** Scope: "Taking a step", the departed-member rule, and CUJ 12 (line 191).
   A holder who "is not a current member" reads as free. But the household is "exactly two people". How a member is removed, what the household looks like with one member and who can then be invited are not explained here. `removeMember` appears only as a function name.

10. **Major.** Scope: "Let them know" and the push section (line 392).
    The push section does not say when `projectAdded` is used instead of `projectChanged`, or what its text is. Line 630 says both have "a fixed body" but only one body is given.

11. **Major.** Scope: Step 1 acceptance (line 620) versus items 1 to 12.
    The acceptance says the routes "refuse nothing with a 4xx that the retry rules would drop", but line 338 lists 404 and three 409 limit refusals, and line 399 says a queued write that meets a 404 is dropped. What happens to a queued write that hits a limit is not stated: retried for ever, or dropped by `onError`? The overlay would keep showing it, which is the hazard line 312 warns about for takes.

12. **Major.** Scope: Sync section (line 398) and Step 2 items 13 to 14, "twelve kinds".
    The diagram says `projectMutationKeys (12 kinds, registered once)`. Step 2 registers nine and step 3 adds three. "Registered once" is misleading.

13. **Major.** Scope: "Approach" (line 607) and Step 1 acceptance (line 620).
    The pull request "lists every place that reads a prefix of a household's partition as a whole". Line 704 asserts every other read is by exact prefix. The document lists only `moveOptions` and `removeMember`, and says `removeMember` "rewrites nothing", so it is unclear why it is on the list. The claim cannot be checked from the document.

14. **Nit.** Scope: undefined project-specific vocabulary.
    Used without definition: "guarded", `replayOf`, `withWriteRecord`, `notifyAfter`, `notifyOther`, `ENVELOPE_KEYS` and "the envelope", `registerSet`, `describeFailure`, `onSuccess`, `invalidate`, `TaskError`, `dayInZone`, `clampTime`, `WRITE_RECORD_SECONDS`, and `gone` (used before it is defined). The envelope is described once at line 301 but used from line 338. Add one-line glossary entries for the envelope, `guarded` and `onSuccess`/`onError`.

15. **Nit.** Scope: "Finished" versus "Status" wording.
    "Finished", "archived" and "leaves the default list" are three terms for one state (glossary, line 378, line 87). Use one.

16. **Nit.** Scope: Limits table (line 295) and the Project data model item (line 266).
    `fieldTimes` names `planned`, `estimate` and `spent`, but the write fields are `plannedAt`, `estimateAt` and `spentAt`. `costBy` is in no `fieldTimes`, so its last-writer rule is undefined. `titleAt` is mentioned for creates only.

17. **Nit.** Scope: Overview line 13 versus the Decisions table (line 217), "Navigation".
    "Plan switch", "PlanSwitch" and "the phase 4 icon check" (line 237) are not explained. The icon check appears only in the manual check table, which refers to line numbers in a file the reader cannot see.

18. **Nit.** Scope: "Existing manual checks this phase could break" (lines 438 to 455).
    Line numbers into `docs/MANUAL-CHECKS.md` go stale as soon as the file changes, and the reader cannot tell what check 38, 54 or 74 says. "Go/no-go for the tab bar" is undefined.

19. **Nit.** Scope: Alternatives B and H, and "Both" (line 493).
    Alternative B is "not chosen" but "stays available as a cheap trial", and it is unclear whether the author expects it to be run first. "Both" is not defined as a data shape.

20. **Nit.** Scope: item 21 (line 647) and Step 2 acceptance (line 637).
    Item 21 checks that the phase 3 list covers the cost files "when they exist", but they do not exist until step 5, where item 32 repeats the check. The sentinel and axe checks in step 2 are described loosely.

21. **Nit.** Scope: "Where each goal is delivered" (lines 685 to 695).
    G8's items miss 5 and 8, G2 omits 14, and G9 skips 18 to 20, so the traceability is incomplete.

22. **Nit.** Scope: Verification Plan (line 704) and "Mixed versions" (line 401).
    A rolled-back app dropping unknown keys is accepted but untested. The text should say so in one place, because the two statements read as if both were tested.

**Sections the reviewer could not paraphrase:** none. The take state machine (finding 3) and the tidy-order write (finding 6) needed more than one section to reconstruct. The main risks are contradictions (findings 6, 8, 11) and undefined vocabulary (findings 1 to 4 and 14).
