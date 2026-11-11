# Stage 7: Critic Review, round 4

*   **Target:** `docs/designs/phase-1-foundation.md`, FeatureRange lines 1–780
*   **Reviewers (fresh context, all completed):** `egm-design` and `egm-structural` against `feature-spec-standard.md`; `egm-style` against its own rubric
*   **Goldfish context:** as in earlier rounds
*   **Date:** 2026-11-11
*   **Raw counts:** design 0 Blocker, 5 Major, 7 Nit. Structure 0 Blocker, 1 Major, 6 Nit. Style 0 Blocker, 0 Major, 4 Nit.
*   **After deduplication:** 0 Blocker, 6 Major, 15 Nits.
*   **Round status:** not clean. Earlier rounds: [1](critic_report_round1.md), [2](critic_report_round2.md), [3](critic_report_round3.md).
*   **Trend:** Blockers 2 → 0 → 1 → 0. Majors 17 → 13 → 5 → 6. Style has found no Majors for two rounds.

## Churn check: churn detected

Two new Majors sit at the scope of earlier fixes, and reverting those fixes would resolve them:
- **R4-M1** comes from round 3's rule that a `repeat` change must carry a `dueOn` (R3-M2), combined with round 2's cycle check on `dueOn` edits (R2-M3).
- **R4-M2** comes from round 2's `updatedAt` condition on task delete (a round 2 concurrency Nit).

Reverting either would bring back the defect it fixed, so the right move is a better fix, not a revert. A third, **R4-M3**, refines round 3's offline-start fix (R3-B1) rather than reversing it.

**Convergence is no longer possible within the cap.** It needs two clean rounds in a row, and only round 5 remains.

---

## 🟡 Majors

### R4-M1. A repeat-rule proposal goes stale whenever the chore is completed (design-4-1, churn)
*   **Scope:** lines 375, 459 and 467.
*   **Problem:** a `repeat` change must carry a `dueOn`, and an edit that sets `dueOn` is bound to the current cycle. So on a daily chore, a proposal to change the repeat rule is stale by the time the owner accepts it. Line 467 says the opposite.

### R4-M2. A delete queued behind the same phone's own write fails with a false "changed on the other phone" (design-4-2, churn)
*   **Scope:** lines 379, 485, 497 and 759.
*   **Problem:** delete is conditioned on the `updatedAt` the client loaded, and the phone's own earlier pending write changes it. Creating and immediately deleting a duplicate to-do fails, and the banner blames the partner.

### R4-M3. In a shop with weak signal, launch can hang on `/config.json` (design-4-3)
*   **Scope:** lines 478, 481, 501 and 503.
*   **Problem:** network-first doesn't fail on weak signal, it hangs. No fetch timeout is specified, so hung writes also stall the queue.

### R4-M4. A partner who signs up before opening the invite link can never join (design-4-4)
*   **Scope:** lines 115–117, 293, 297–299 and 549.
*   **Problem:** in Auth0 mode, the partner signs in, taps "Create household" (the only option shown), and every later invite returns `already_member`. Nothing can leave or delete a household.

### R4-M5. The catch-up window sends a second digest just after midnight (design-4-5)
*   **Scope:** lines 524–528.
*   **Problem:** a 22:00 or 23:00 digest also matches at 00:00 or 01:00, when "today" is a new date. The same applies to due nudges.

### R4-M6. There's no route or rule for deleting one shopping item (structural-4-1, design-4-N4)
*   **Scope:** lines 429–445 and 574–581.
*   **Problem:** CUJ 9 and the delete toast need it. A retried delete after a restore would also remove the item again.

---

## 🟢 Nits

*   **Design:** a `dueOn` edit silently cancels an accepted swap; rule 4 completions aren't replay-safe and undo may target the wrong cycle; undo with no record for the caller is undefined; notification tags aren't specified (nudges replace each other); the `fixed` rule doesn't say which day weeks start or how `dayOfMonth` and `startOn` combine; proposers never see that their proposal went stale.
*   **Structure:** `discussion_summary.md` link styles; "outside the household guard" missing on `POST /api/households`; the "applies directly" note is nested under "These create a proposal"; "&" vs "and" in NFR labels; the `both` decision missing from the decisions table.
*   **Style (also structure):** Alternative C's sentence repeats "two-person, mixed-needs"; "It needs no extra completion logic"; "One route is links"; "a large new component".
