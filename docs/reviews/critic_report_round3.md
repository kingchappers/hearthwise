# Stage 7: Critic Review, round 3

*   **Target:** `docs/designs/phase-1-foundation.md`, FeatureRange lines 1–768
*   **Reviewers (fresh context, all completed):**
    - `egm-design`, against `feature-spec-standard.md`
    - `egm-structural`, against `feature-spec-standard.md`
    - `egm-style`, against its own persona rubric
*   **Goldfish context:** as in rounds 1 and 2
*   **Date:** 2026-11-11
*   **Raw counts:** design 1 Blocker, 2 Major, 8 Nit. Structure 0 Blocker, 3 Major, 5 Nit. Style 0 Blocker, 0 Major, 6 Nit.
*   **After deduplication:** 1 Blocker, 5 Major, 19 Nits.
*   **Round status:** not clean (an unsettled Blocker and Majors). Earlier rounds: [round 1](critic_report_round1.md), [round 2](critic_report_round2.md).
*   **Churn check:** none. R3-M2 touches the `both` decision from round 2, but reverting it wouldn't resolve it (the same gap exists for tasks assigned to the removed member's `both` share). The other findings are new gaps, not effects of earlier fixes.
*   **Trend:** Majors down from 17 (round 1) to 13 (round 2) to 5. The style reviewer found no Majors.

**Checked by the author's agent:**
- R3-B1 is real. Hoardwise writes `/config.json` into `build/client` *after* the Vite build (`scripts/build-static-handler.cjs:31`), the container serves it live (`container/adapter.ts:198`), `loadRuntimeConfig` fetches it with `cache: 'no-cache'` (`app/lib/runtimeConfig.ts:31`), and on failure `AuthProvider` shows "The app could not start because its configuration did not load" (`AuthProvider.tsx:34`).
- R3-M4 is real. Hoardwise's password reset is operator-run (`store-cli reset-password`, `src/store/cli.ts:72`), and it ends every session. Its recovery flag reopens setup (`src/auth/local.ts:42`).

---

## 🔴 Blocker

### R3-B1. The app can't start offline, so CUJ 5 fails (design-3-1)
*   **Scope:** lines 67, 135, 260 and 466–470.
*   **Problem:** the SPA reads `/config.json` before anything else, but it isn't a precached build asset and the service worker doesn't serve it. A cold launch in a shop with no signal shows "could not start" and never opens the cached list. Opening the cache also needs the signed-in user id with no network call, which the design doesn't provide.
*   **Proposed fix:** the service worker serves `/config.json` network-first with a cached fallback; the last signed-in user id is kept locally and used to open the cache offline; the step 5 spike adds "cold launch offline, including with an expired access token".

## 🟡 Majors

### R3-M1. Removing a member leaves `both` tasks impossible to change (design-3-2)
*   **Scope:** lines 294 and 440–445.
*   **Problem:** schedule changes, deletion and restore of a `both` task need a proposal to the other member, and after removal there is none. Whether proposals *to* the removed member go stale is also unstated.

### R3-M2. A `repeat` change doesn't say what happens to `dueOn` (design-3-3)
*   **Scope:** lines 339–348, 367, 370 and 449.
*   **Problem:** changing "every Sunday" to "every Wednesday" leaves `dueOn` on a Sunday. Turning an undated to-do into a chore leaves `dueOn` empty, so the next-date maths has no input.

### R3-M3. `<name>` placeholders disappear when rendered (structural-3-1)
*   **Scope:** about 18 lines in the FeatureRange, plus 7 in the plan.
*   **Problem:** outside code spans, `<name>` is read as an HTML tag and GitHub strips it, so "Let <name> know" renders as "Let  know".

### R3-M4. Password reset is mentioned but never defined (structural-3-2)
*   **Scope:** lines 263–268 and 571–580.
*   **Problem:** no route or command is given. Hoardwise's reset is operator-run and ends every session, which contradicts "deletes only that user's sessions" if copied unchanged.

### R3-M5. A success measure from the brief was dropped (structural-3-3)
*   **Scope:** lines 81–84.
*   **Problem:** `discussion_summary.md` lists "Neither user reports that the app causes arguments about who did what". The design's success measure leaves it out, with no reason recorded.

---

## 🟢 Nits

*   **Concurrency (design):**
    - Two undos on the same cycle can drive `alsoCount` to -1: `ALSO` deletes must find the item, and `DONE` updates must match the `completedBy` and `alsoCount` read.
    - A completion can overwrite a `dueOn` edit or accepted swap that lands mid-request: add `ifEquals updatedAt` to the completion update.
    - Undo can silently cancel a swap accepted for the next cycle: refuse it with a 409 in that case.
    - A repeated "also did it" (the caller's `ALSO` exists) has no defined result: return 200 and write nothing.
    - Local-mode invite sign-up already joins, so the separate accept is Auth0-only; a retried accept where `usedBy` is the caller returns 200.
    - The list of what makes a proposal stale should name only the kinds that bump `ruleVersion`.
    - The digest should use the effective assignee (swaps), like lists and nudges.
    - On 401 or `login_required`, keep pending writes paused and ask the person to sign in again, rather than dropping them.
*   **Structure:** blank line after `#### Member settings`; local-auth items noted in the data model; the letter note should also cover the brief's "C"; "(rule 4)" should say where the rule is; Open Questions should map each question from the brief to where it's settled.
*   **Style:** one framing for the 15-second goal; describe the predictability preference as a tendency, not a fixed trait; quote the source's "Frequent and visible" exactly; Alternative C's rejection should say the trial can test intervals but not the two-person parts; drop the unsupported "well below where reading a whole list gets slow"; calibrate "cost almost nothing", "rarely affected" and "Installing protects storage".
