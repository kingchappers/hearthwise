# Goldfish Annotated Review Report

**Target:** `docs/designs/phase-1-foundation.md` (lines 1–768, FeatureRange). Stage 7, round 3.
**Status:** resolved (2026-11-11). The author asked for every proposed fix to be applied (auto accept).
**Source findings:** [critic_report_round3.md](critic_report_round3.md). The ids below match that report. Earlier rounds: [round 1](goldfish_review_report_round1.md), [round 2](goldfish_review_report_round2.md).

**Summary:**
- PROPOSE FIX: 6 (R3-B1, R3-M1–M5)
- PROPOSE FIX (Nit groups): 3
- DECLINE: 0
- CONTEST: 0
- ESCALATE: 0

---

## Prioritized Findings & AI Suggestions

### [R3-B1] [`egm-design`] - Severity: Blocker: no offline cold start
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Verified in Hoardwise's code (see the critic report). Without this, the shopping list's main CUJ fails.
*   ***Proposed Edit:***
    *   Sync and offline: the service worker serves `/config.json` network-first, falling back to the last copy it cached. It's the only non-shell request it caches.
    *   At sign-in the app stores the user id in `localStorage`. On launch, the persisted cache is opened with that id before any network call. An expired access token only stops writes from being sent: they stay paused until the person signs in again (this also covers the 401 Nit).
    *   Step 5 spike gains a fourth case: a cold launch with no network, including with an expired access token, shows the cached lists. Item 30 caches `/config.json`; item 33 reads the stored user id.

### [R3-M1] [`egm-design`] - Severity: Major: removal and `both` tasks
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** the removal pass also rewrites `both` tasks to `either` (bumping `ruleVersion`). Pending proposals from *and to* the removed member are marked `stale`. Test in item 18.

### [R3-M2] [`egm-design`] - Severity: Major: `repeat` changes and `dueOn`
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** a `repeat` change, by `PATCH` or by an `edit` proposal, must carry a `dueOn`, except when changing to `none`. The task sheet fills it in with the first date the new rule gives on or after today, and the person can change it. The server returns 400 if it's missing. Tests in item 23.

### [R3-M3] [`egm-structural`] - Severity: Major: `<name>` stripped on render
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** escape every `<name>` outside code spans as `\<name\>`, in the whole document. Code spans are left alone.

### [R3-M4] [`egm-structural`] - Severity: Major: password reset undefined
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Hoardwise's reset is operator-run and ends every session. Hearthwise needs a per-user version.
*   ***Proposed Edit:*** under "Identity and the household guard": a password reset is operator-only, `store-cli reset-password <email>`, adapted from Hoardwise. It ends only that user's sessions and clears their lock-out. It never reopens first-run setup, and Hoardwise's recovery flag isn't copied. There's no API route. Item 14 updated.

### [R3-M5] [`egm-structural`] - Severity: Major: dropped success measure
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** add "Neither user reports that the app causes arguments about who did what" as the fourth success measure.

### [Nits: concurrency] [`egm-design`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** all items in the critic report's concurrency group: conditional `ALSO` deletes and `DONE` updates in undo; `ifEquals updatedAt` on the completion update; undo refused with 409 when a swap was accepted for the next cycle; a repeated "also did it" returns 200; separate accept is Auth0-only and a retried accept by the same user returns 200; stale list names only `ruleVersion` changes; digest uses the effective assignee. (The 401 item is covered by R3-B1.)

### [Nits: structure] [`egm-structural`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** blank line after `#### Member settings`; a note under the data model table pointing to the local-auth items in "Identity and the household guard"; the letter note also covers "C"; "(see "Completing a task", rule 4)"; Open Questions maps the brief's five questions to where each is settled.

### [Nits: style] [`egm-style`] - Severity: Nit
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Proposed Edit:*** the goal becomes "within 15 seconds while the app is open and online", and Alternative M drops "usual"; "the preference for predictability", described as a tendency; quote "Frequent and visible" exactly; Alternative C's rejection narrowed; drop "well below where reading a whole list gets slow"; "cost under US$0.01 a month"; "stay within seconds of server time"; "Installing exempts the app from that eviction".

---

## Resolution log (2026-11-11)

All PROPOSE FIX items were applied to `docs/designs/phase-1-foundation.md`. After the edits, FeatureRange is lines 1–780 and DetailedRange starts at line 781.

| Id | Where it landed |
|---|---|
| R3-B1 | Sync and offline: the service worker caches `/config.json` network-first; the user id is stored at sign-in and opens the cache offline; 401 and `login_required` keep writes paused; spike gains a fourth case (items 29a, 30 and 33) |
| R3-M1 | Member removal rewrites `both` tasks to `either` and stales proposals from or to the removed member (Invites, items 16 and 18) |
| R3-M2 | Task writes: a `repeat` change must carry a `dueOn`, filled in by the task sheet; same for `edit` proposals; tests in item 23 |
| R3-M3 | 28 `<name>` placeholders escaped as `\<name\>` outside code spans |
| R3-M4 | Identity: operator-only `store-cli reset-password <email>`, per-user, never reopens setup; items 1, 2, 5 and 14 |
| R3-M5 | Fourth success measure added |
| Nits: concurrency | Conditional undo writes, `updatedAt` check on completion, swap-aware undo refusal, idempotent "also did it", Auth0-only accept with idempotent retry and `already_member`, stale-list wording, digest uses the swapped assignee |
| Nits: structure | Blank line, local-auth note under the data model, letter note covers "C", rule 4 reference, Open Questions maps the brief's five questions |
| Nits: style | All listed items applied |
