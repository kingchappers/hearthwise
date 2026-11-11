# Consolidated Review Report: Hearthwise phase 1 design

*   **Target:** `docs/designs/phase-1-foundation.md`
*   **Review:** EGM, interactive, all rubrics (Stages 5–9), 2026-11-10 to 2026-11-11
*   **Outcome:** every finding resolved, accepted as a risk, or decided by the author. Stage 7 was accepted at round 4 of 5 by the author.

## Stage summary

| Stage | Report | Blockers | Majors | Outcome |
|---|---|---|---|---|
| 5. Initial zoom out | [zoom_out_report.md](zoom_out_report.md) | 1 | 6 | Fixed (Store extension, hourly push, container push, recycle bin, TanStack persistence); two accepted trade-offs |
| 6. Comprehension | [comprehension_report.md](comprehension_report.md) | 0 | 8 | Fixed, plus one re-audit |
| 7. Critic loop, round 1 | [critic_report_round1.md](critic_report_round1.md) | 2 | 17 | Fixed |
| 7. Critic loop, round 2 | [critic_report_round2.md](critic_report_round2.md) | 0 | 13 | Fixed; `both` tasks need proposals (author) |
| 7. Critic loop, round 3 | [critic_report_round3.md](critic_report_round3.md) | 1 | 5 | Fixed |
| 7. Critic loop, round 4 | [critic_report_round4.md](critic_report_round4.md) | 0 | 6 | Fixed; churn noted; loop closed by the author |
| 8. Intermediate zoom out | [intermediate_zoom_out_report.md](intermediate_zoom_out_report.md) | 0 | 5 | Fixed: one write record per mutation, completers on `DONE`, read-time member removal, Auth0 sign-up alerts |
| 9. Implementation readiness | [implementation_readiness_report.md](implementation_readiness_report.md) | 6 | 24 | Fixed; plan rewritten; four author decisions |

The per-round fix proposals are in `goldfish_review_report_round1.md` to `goldfish_review_report_round3.md` and `goldfish_review_report_round4.md`.

## Author decisions made during review

- Extend the Store with a conditional update; build container push; a 30-day recycle bin; TanStack persisted mutations (Stage 5)
- `both` means "do it together"; one-off swaps; schedule changes and deletes on the other person's task need a proposal; open Auth0 sign-up with alerts (Stage 6)
- `both` tasks need a proposal for schedule changes and deletion (Stage 7, round 2)
- Close Stage 7 at round 4 (Stage 7)
- Adopt the Stage 8 simplifications as recommended (Stage 8)
- Same AWS account as Hoardwise; a new warm palette; AGPL-3.0-or-later; the Auth0 Action key made by hand (Stage 9)

## Accepted risks

- Open Auth0 sign-up, with an alert for every new account and household
- Slow client clocks: their edits can lose to newer-stamped ones
- The Tody trial wasn't run
- Self-hosting and multi-account local login stay in phase 1, at roughly a quarter of the new code
- Moving out of an empty household has a one-request race that can orphan a task

## Not yet verified

- The fixes from Stage 7 round 4, Stage 8 and Stage 9 haven't been re-read by a fresh reviewer.
- The offline approach depends on the step 5 spike (item 29a); if it fails, the plan switches to Alternative K.
