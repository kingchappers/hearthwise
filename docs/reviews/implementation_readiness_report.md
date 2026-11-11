# Stage 9: Implementation Readiness Test

*   **Target:** `docs/designs/phase-1-foundation.md`, DetailedRange lines 794–1375
*   **Reviewers (fresh context, all completed):**
    - `egm-implementation-readiness`, against `implementation-readiness-standard.md`: 3 Blocker, 18 Major, 10 Nit
    - `egm-codebase-details`, against Hoardwise at `b50544f`: 3 Blocker, 12 Major, 6 Nit
    - `egm-style`: 0 Blocker, 8 Major, 15 Nit
*   **Date:** 2026-11-11
*   **After deduplication:** 6 Blockers, 24 Majors, about 30 Nits.
*   **Status:** resolved (2026-11-11). The author answered four decisions and asked for every finding to be applied.
*   **Verdict (before fixes):** Not ready to implement. The architecture (lines 1–793) holds; the plan's gaps are almost all about *how to get from Hoardwise's code to it*: imports that cross step boundaries, Hoardwise infrastructure that would collide or doesn't allow a method, and details an implementer would otherwise guess.

**Checked by the author's agent** (in Hoardwise's code):
- `infra/api-lambda.tf:84-110` routes only POST, GET, HEAD, DELETE and PUT to the API Lambda; anything else falls to `$default`, the static Lambda (`infra/lambda.tf:96`).
- `src/store/memory.ts:72` and `src/store/sqlite.ts:124` throw "transact cannot touch the same item twice".
- `/budget-app/vapid-private-key` is hard-coded in `infra/push-lambda.tf:12` and `scripts/setup-vapid-keys.sh:12`.
- `infra/initialSetup/main.tf:133` creates an IAM role named `github-actions`.

---

## 🔴 Blockers

### S9-B1. Step 1 can't build with the files it lists (IR-B1, CD-M1, CD-M2, CD-M5)
`api-handler.ts`, `container/server.ts`, `container/recovery.ts` and `src/store/cli.ts` import `src/auth/*` (step 2), `src/mcp/*`, `src/oauth/*` and token modules. `useUndoableDelete` needs `queries.ts`/`trash.ts`; `useSaveWithUndo` is all budget code. `root.tsx`, `DefaultLayout.tsx`, `settings.tsx` and `entry.client.tsx` import demo, brand, transaction and offline-queue modules. `build` runs `check-demo-build.mjs` and `build-push-handler.cjs`. `src/api/types.ts`, `localAuth.ts`, `sessionLifetime.ts` and `brand.ts` aren't listed.
**Fix:** copy Hoardwise's single-account `src/auth/` unchanged in step 1 (minus token, MCP and OAuth files, with the exact lines to strip from `api-handler.ts`, `apiRoutes.ts`, `local.ts` and `cli.ts`); list the missing files; drop `useSaveWithUndo`; create `useUndoableDelete` in step 3; list every demo removal (`stubServerStores`, `isDemo` imports, `entry.client.tsx`, yarnBuild.yml lines 78–82); give the exact `build` script, with a no-op push handler until step 6.

### S9-B2. Step 3 depends on step 4 (IR-B2)
Item 25a reads `useItems()` (item 29), restores items and tests CUJ 9 with a shopping item; step 4's "clear ticked" undo needs the restore route.
**Fix:** move the item half of 25a (item restore, Shopping group, CUJ 9 test) into step 4, and make step 4 depend on 3.

### S9-B3. The plan's offline error handling contradicts the design (IR-B3)
Item 34's `retry` drops 4xx, so a 401 loses queued writes; "other 4xx", "5xx → banner" and the 10-second fetch timeout have no file or test.
**Fix:** specify `onError` per status class as in the design, how a 401 re-pauses and resumes only for the same user, and put the timeout in `app/lib/api.ts`, with tests.

### S9-B4. AWS has no PATCH route (CD-B1)
`PATCH /api/hh/tasks/:id` and `PATCH /api/hh/members/me` would hit the static Lambda.
**Fix:** item 7 adds `PATCH /api/{proxy+}` (or uses `ANY`), with a smoke check.

### S9-B5. Null versus missing breaks every invite accept (CD-B2, IR-M3)
Invites are written with `usedBy: null`, but `ifMissing` maps to `attribute_not_exists`, which fails on a stored null; Hoardwise's stores keep nulls. The same trap applies to restore and `deletedAt`. `mustExist`'s default isn't defined.
**Fix:** one rule in item 2: absent attributes are never written as null (invites omit `usedBy`; restore uses `remove: ['deletedAt', …]`); `mustExist` defaults to true; contract tests for both. The first `lastDigestSent` uses `ifMissing`.

### S9-B6. CUJ 11 touches `MEMBERSHIP` twice in one transaction (CD-B3)
**Fix:** one `update` on `MEMBERSHIP` with `ifEquals: { householdId: <old> }` setting the new id; delete only the old `META`, `MEMBER` and invite pointers; contract test for the shape.

---

## 🟡 Majors (grouped)

*   **Auth and setup (IR-M1, CD-M3, CD-M4):** list `routes.ts`, `setupCode.ts`, `types.ts`, `prompt.ts`; keep the first-run setup-code gate; keep `createCodeHooks`, drop `consumeResetMarker`; `/api/auth/*` stays in `src/auth/routes.ts`; `deleteSessionsForUser(store, userId)`; `cli.ts` takes an email argument, drops `revokeAllTokens`, and keeps `backup`; add `build-store-cli.cjs`; name the client auth files changed in step 2.
*   **Join flow and CUJ 11 payloads (IR-M2, style 4–5):** Auth0 redirect handling (`appState.returnTo`), `{ token, confirmMove: true }`, `409 { error: 'already_member', canMove }`; the orphaned-task caveat corrected (open tasks don't expire; the race is accepted because the window is one request long).
*   **Batch limits and write records (IR-M4, IR-M12):** batch routes run one transaction per entry, then write one `MUT#` record holding per-id results; item routes and household routes use `withWriteRecord`; `withWriteRecord` returns whether the record was new.
*   **Display names and defaults (IR-M5):** source of `displayName`, editable in welcome, join and settings; default digest and nudge hours and `defaultView`.
*   **Client mutations (IR-M6, IR-M16):** register mutation defaults from step 3 in `app/lib/mutations.ts`; the stale-response check as a settle counter in `queryFn`; the overlay fed by `useMutationState`; how hydrated mutations are paused; `AuthProvider`/`DefaultLayout` changes so cached lists render before sign-in.
*   **Spike and service worker tooling (IR-M7, IR-M8, CD-M12):** the spike runs under Playwright (`yarn test:e2e`) with its own minimal persistence setup; add `@playwright/test`, the `workbox-*` packages and the full VitePWA config; exclude the spike from the jsdom project.
*   **Infrastructure (CD-M6, CD-M7, CD-M8, IR-M18):** runtime dependencies per bundle (`web-push`, SSM, SNS); push role gains `UpdateItem`/`PutItem`; API Lambda gains SSM read and `VAPID_*` env; app-named SSM path; shared-account resources (state bucket, OIDC provider, `github-actions` role); how the Auth0 Action's AWS key is created.
*   **Push (IR-M9, IR-M10, IR-M11, CD-M9, CD-M10, CD-M11):** VAPID public key through `/config.json` with the files to change and a container `VAPID_SUBJECT` default; subscription routes drop per-device `settings`; `push/store.ts` and `select.ts` rewritten keeping the generic helpers; async error isolation in the maintenance loop; tags, combined batch push, quiet-hours overlap note, `LetThemKnow` on every action, with tests.
*   **Validation and views (IR-M14, IR-M15):** a validation table (lengths, ranges, formats, UUIDs, error shapes); view rules as pure functions with tests ("This week" boundary, `NextThing` order, swaps, removed members, stale proposals, "Former member").
*   **Brand (IR-M13):** palette and tokens for `brand.ts`, `docs/brand.md`, and the contrast tests.
*   **Smoke test (IR-M17):** which step extends `container-smoke.mjs`, with scenarios.
*   **Wording that misleads an implementer (style 1–3, 6–8):** "one test for each CUJ" scoped to task CUJs; "'Invites', step 5" renamed to rule 5; `ifPresent` → `mustExist: true`; "changed on another phone"; a bound for "at once"; which back ends the store tests run on (DynamoDB Local already runs in Hoardwise's CI).

## 🟢 Nits (grouped)

*   **Reuse what Hoardwise has (CD-N1–N3):** the store already pages, uses `BEGIN IMMEDIATE`, checks before writing and has `failedIndex`; extend `contract.ts`; reuse `localMoment`, `isQuietHour`, `sendHour`, `isValidTimeZone` and `pushSupport`; items 4 and 32 are already true (drop them); don't copy the root `handler.ts` stub.
*   **Recycle bin differences (CD-N4), removal list (CD-N5), licence, `expiresAt` in epoch seconds, `trivy-weekly.yml`, `initialSetup` exclusions, coverage thresholds, small test gaps (IR-N1–N10).**
*   **Style Nits 9–23.**

---

## Resolution log (2026-11-11)

**Author decisions:** deploy into the same AWS account as Hoardwise; a new warm "hearth" palette; AGPL-3.0-or-later; the Auth0 Action's access key made by hand, never in OpenTofu state.

The Detailed Implementation Plan was rewritten (lines 799–1483). The design sections gained the "no nulls" Store rule, the display name, member setting defaults, the CUJ 11 `MEMBERSHIP` update, and three decisions-table rows.

| Id | Resolution |
|---|---|
| S9-B1 | Step 1 copies Hoardwise's single-account `src/auth/` (item 3a, tokens removed) and the generic push helpers (3b); every demo, MCP, OAuth and budget import is named for removal; `useSaveWithUndo` is dropped and `useUndoableDelete` moves to step 3; the exact `build` script and a no-op push handler keep step 1 building. |
| S9-B2 | Step 3's recycle bin covers tasks only; item restore, the Shopping group and CUJ 9 move to step 4, which now depends on step 3. |
| S9-B3 | Item 34 specifies `retry`, `retryDelay` and `onError` per status class; 401 re-pauses and resumes only for the same user; the 10-second timeout lives in `app/lib/api.ts`. |
| S9-B4 | Item 7 adds `PATCH /api/{proxy+}` and a post-deploy PATCH check. |
| S9-B5 | "No nulls for not set" applies everywhere; `mustExist` defaults to true; contract tests for both; the first digest uses `ifMissing`. |
| S9-B6 | CUJ 11 updates `MEMBERSHIP` with `ifEquals: { householdId: <old> }` instead of deleting and re-putting it. |
| Majors | All applied: auth file list, setup-code gate, `deleteSessionsForUser`, CLI with `backup` kept; join flow payloads and Auth0 `returnTo`; per-entry batch transactions with one write record; display names and defaults; mutation registry from step 3, overlay through `useMutationState`, stale-response counter, pausing helper; cached render before sign-in; Playwright spike with its own setup; Workbox packages and VitePWA config; runtime packages per bundle; push and API Lambda permissions; shared-account bootstrap; VAPID public key through `/config.json`; subscription settings removed; async error isolation in maintenance; push tags, combined batch push, quiet-hours note, `LetThemKnow` on every action; validation table (item 21a); view rules with tests; the new brand (item 9a); container smoke test in steps 2 and 3; the Auth0 key made by hand; and the wording fixes. |
| Nits | Applied: reuse of Hoardwise's store paging, transactions, `failedIndex`, contract tests, `localMoment`, `isQuietHour`, `isValidTimeZone` and `pushSupport`; items 4 and 32 dropped as already true; recycle-bin rewrite noted; removal list, licence, epoch-second `expiresAt`, Trivy, `initialSetup` exclusions, coverage thresholds, and the style Nits. |
