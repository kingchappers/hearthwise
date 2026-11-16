# Decisions

Decisions that shape the project, with the reason for each. The design's own decisions come first, then what changed while building step 1. "The sibling app" is Hoardwise, the author's personal budgeting app that Hearthwise copies its scaffolding from (pinned at commit `b50544f`).

## From the design (`docs/designs/phase-1-foundation.md`)

| Decision | Choice | Decided by |
|---|---|---|
| Relationship to the sibling app | Separate app, scaffolding copied | Author |
| Hosting | AWS (Lambda + DynamoDB) and self-hosted (container + SQLite) | Author |
| Joining a household | One-time invite link | Author |
| Duplicate completions | One completion record per cycle, keyed by a cycle counter, written put-if-absent | Author |
| Offline | Service worker for the app shell, persisted query cache, TanStack Query's persisted paused mutations | Author |
| Early completion of a fixed chore | Moves to the next occurrence after the completed cycle | Author |
| Partly-ticked checklist | Chore stays due; ticked steps are kept | Author |
| Phone clock skew | Client timestamps more than 5 minutes ahead are clamped to server time | Author |
| Live updates | Refetch on focus and poll every 10 s while visible | Author |
| Notifications | Nothing notifies the other person automatically; the sender chooses | Author |
| Changes to `both` tasks | Schedule changes and deletion need a proposal | Author (2026-11-11) |
| AWS account | The same account as the sibling app, sharing its state bucket and OIDC provider, with Hearthwise-named roles and SSM paths | Author (2026-11-11) |
| Licence | AGPL-3.0-or-later | Author (2026-11-11) |
| Auth0 Action key | Created by hand in the AWS console, never in OpenTofu state | Author (2026-11-11) |

## Changed or decided while building step 1

### Palette: yellow and green, no neon (author, 2026-11-11)

The design's palette was terracotta, amber and sage. The author asked for yellow (a household favourite) and green or a synthwave neon palette, and asked whether that would move the app away from its calm design. Decision: **terracotta stays the main colour, a soft honey yellow replaces the amber accent, and green gets a little fresher. No neon theme.** Saturated neon is high-arousal, which works against the "no alarm, low-shame" goal.

- The tuple `ember` is renamed `honey`. A bright yellow cannot carry text on a light background (about 1.1:1), so yellow text uses the dark shade 6 (`#7F6200`, 5.8:1 on white); yellow fills use shades 3 and 4 with Ink text on top (11.1:1 and 9.5:1).
- `sage` shade 6 is `#2F6B3B` (6.4:1 on white).
- The design's table in item 9a (`ember` `#8A5A12`, sage `#3F6448`) is superseded. `docs/brand.md` and `app/__tests__/brand.test.ts` hold the current figures.

### Deviations from the design

| Design said | What was built | Why |
|---|---|---|
| `isValidTimeZone` stays in `src/api/push.ts` | Moved to `src/api/dates.ts` | Step 1 does not copy `push.ts`, but step 2 needs it |
| `reset-password` takes an email (step 1, item 2) | Step 1 keeps the single-account, no-argument form | The email form needs `deleteSessionsForUser`, which is step 2 (item 14) |
| `src/store/cli.ts` is part of the Store | It lands with the container work | It imports the auth modules |
| Router returns 405 for PATCH on `/api/health` | 401 or 404 as JSON | The router has no 405 and authenticates first; the post-deploy check is "JSON, not the app's HTML" |
| `GET /api/health` is assumed to exist | New authenticated route | The sibling app has none |
| `api.ts` adds the 10 s timeout | `withTimeout()` lives in `api.ts` and is used in `useProtectedApi` and `localAuth` | That is where the `fetch` calls are |
| Logo lockup image | The mark plus the name as text | No baked-in font; follows the text-size setting |
| Nav has Today, Shopping, Settings; Shopping arrives in step 4 | An empty Shopping page now | So the navigation never leads to a 404 |
| Local login recovery flag | Removed with `RESET_PASSWORD` and `consumeResetMarker` in the container | "Nothing reopens setup" (item 6); the auth module's own recovery code is removed in step 2 |
| Custom hostnames in `lambda.tf` | One optional hostname (`app_domain`, empty by default) | Hearthwise's hostname is undecided |
| Backups named `hoardwise-*` or `budget-*`, session cookie `hoardwise_session` | `hearthwise-*` and `hearthwise_session` | A shared data folder must never lose the other app's backups, and cookies must not carry the other app's name |
| Coverage thresholds in `vitest.config.ts` | As designed, for files that do not exist yet | They apply once step 3 and 4 add those files; if vitest rejects missing files, each moves into the step that creates it |

### Security decisions in the shared AWS account

The deploy role (`hearthwise-github-actions`) lives in an account that also holds another app. A security review of the first draft led to these rules, pinned by `src/infra/__tests__/infraGuards.test.ts`:

- **Trusted from `main` only.** A pull request workflow can be edited by any collaborator, and this role can deploy. Pull requests get no AWS credentials; CI checks formatting and validity without credentials, and deploys in a separate job that runs only on a push to `main`.
- **Cannot change itself.** Its name starts with `hearthwise-`, so the `hearthwise-*` role statements would cover it. An explicit deny stops it.
- **Roles it creates are bounded.** `iam:CreateRole` requires the `hearthwise-lambda-boundary` permissions boundary, which allows only this app's logs, table, SSM parameters and alert topics. It cannot change or remove a boundary. So even a role with a broad inline policy can do no more than the boundary allows. Widening what the Lambdas may do (a new AWS service) is an edit to `infra/initialSetup/main.tf`, applied by hand.
- **State is scoped.** Read and write only under `hearthwise/` in the shared bucket. The bucket and the OIDC provider are read as data sources and never managed here.
- **ACM certificates.** Readable for every certificate; created or changed only when tagged `Application = hearthwise`. These IAM condition keys could not be tested without applying, so check the first apply with a custom domain set: a wrong condition fails closed.
- **No plan artifact.** The repository is public and a saved plan can hold the Auth0 values, so the plan is applied straight away and never uploaded.

**Accepted risk (reviewed 2026-11-13):** API Gateway APIs, CloudWatch Logs resource policies and log deliveries cannot be scoped by name, so the deploy role can act on the other app's resources of those kinds. The real reach for API Gateway is larger than "can see": with `apigateway:POST` on every API and `lambda:AddPermission` on `hearthwise-*` functions, a workflow running on `main` could add an integration to the other app's live API that points at a Hearthwise Lambda, or delete that API, and so capture or break its traffic. The trust boundary is "whoever can push to `main`, or a compromised pinned GitHub Action", so this is hardening left undone, not an open exploit. This API is now tagged `Application = hearthwise` so the permissions can be limited by tag (`aws:ResourceTag/Application`, plus `aws:RequestTag/Application` for creating an API). That condition was **not** added yet because its behaviour on HTTP API child resources (routes, integrations, stages) could not be tested without applying, and a wrong condition would break the first deploy. Do it as a follow-up after the first successful apply, with a guard test.

### Other review outcomes (2026-11-13)

- **State locking:** both backends use `use_lockfile = true` and the deploy job has a `concurrency` group that never cancels a running deploy, so two pushes to `main` cannot apply at once.
- **`ifEquals` is scalar-only:** the Store rejects an object or array condition value, because DynamoDB compares by structure and the in-process stores by identity. Task completion and the other step 3 conditions use scalars.

### Deploy safety: protected deletions (2026-11-13)

The first CI deploy ran with `APP_DOMAIN` set as a GitHub *secret* instead of a *variable*, so `app_domain` was empty and OpenTofu deleted the custom domain, its certificate and its mapping, exactly as the configuration says to for "no domain". The site's address went down until the domain was recreated and the registrar's CNAME was changed by hand.

The deploy job now runs `scripts/check-plan.mjs` between `tofu plan` and `tofu apply`. It fails the deploy if the plan would delete or replace `aws_dynamodb_table` (all the household's data), `aws_acm_certificate`, `aws_apigatewayv2_domain_name` or `aws_apigatewayv2_api_mapping`.

- A deliberate change (for example moving to a new domain) sets the repository **variable** `ALLOW_DESTRUCTIVE_DEPLOY` to `true` for that one deploy, then removes it. Only the exact value `true` counts.
- The check prints resource addresses only. `plan.json` holds variable values (including Auth0's), stays on the runner, is git-ignored, and is never uploaded.
- It guards CI deploys, not a local `tofu apply`; a local apply prints the plan, so read it.
- Tests: `src/infra/__tests__/checkPlan.test.ts` (the check) and `infraGuards.test.ts` (it sits between plan and apply; the override is a variable; the plan is never uploaded).

## Step 3: tasks (2026-11-13)

Decisions the spec was silent or inconsistent about; the plan is `docs/superpowers/plans/2026-11-13-phase-1-step-3-tasks.md`.

| Spec says | Built | Why |
|---|---|---|
| "Delete the `DONE` record only if the other member's attribute is still missing" | An "also did it" write touches the task's `updatedAt`, and an undo's task update requires it unchanged | The Store's `delete` cannot carry a condition on an attribute, so the race is settled through the task's token |
| A swap or a both task is "the other member's" for ownership | Ownership uses the stored assignee, normalised by who is in the household now (a person who left reads as either; both with one member reads as either) | A swap changes who does one cycle, not who owns the task |
| Proposals records `ruleVersion`, and `cycleSeq` for a swap or a date change | Also: a proposal is refused (409) at creation if its base version is already out of date | A proposal built on a stale view would only ever go stale |
| Who made a deletion | A delete applied by accepting a proposal records the accepter as `deletedBy` | They carried it out |
| An assignee who is not in the household | Refused (400 `assignee`) on create, patch and in a proposal's `set.assignee` | A non-member read as either, so a task could be given to someone before they joined, and be theirs without their say (found in security review) |
| Proposal ids | Made by the client (a UUID), so creating one is idempotent | The spec does not say who makes them |
| "Next thing": undated to-dos only when nothing dated is due | Order: due (today or earlier), then undated, then the soonest future-dated task | "Due" read literally |
| A completion's `cycleSeq` | The cycle shown at the tap, not re-read when the write runs; base versions for schedule changes, deletes and proposals are re-read when the write runs, from data that leaves out the write itself | A second tap must not complete the next cycle |
| Step 2's write routes | Now require a `mutationId` (400 otherwise); they are not wrapped in write records | Their own conditions already make them idempotent; the id is there for step 5's replay |
| Household hooks in `app/lib/household.ts` | Still use `useMutation` without a registered key (allowed by a guard test); step 5 moves them into `app/lib/mutations.ts` | Persisting them belongs with the rest of the offline work |
| Time zone for "deleted on" on the Deleted page | The browser's | Keeps the page independent of the household query |

## Step 4: shopping list (2026-11-14)

| Spec says | Built | Why |
|---|---|---|
| `PUT /api/hh/items/:id` "create or update" | A `PUT` to a missing id creates the item and needs `text` with `textAt` (400 `text` otherwise); it answers 200 for a create too | One route for both, as the table says |
| Batch "up to 100 item writes, including conditional deletes" | `{ writes: [put fields with id \| { id, delete: true, ifTickedAt? }], mutationId }`, answering `{ results: [{ id, status }] }` with `created`, `applied`, `noop`, `gone`, `skipped` or `invalid` | The spec gives no wire shape. A bad entry is `invalid` and does not fail the batch |
| An item's ticked state | Defaults to unticked with no ticked time (read as 0 by "clear ticked") | A new item has never been ticked |
| Item type name | `ShoppingItem` | `Item` is already the Store's type |
| Item mutations "registered in `mutations.ts`" | A separate set beside the task ones (`itemMutationKeys`), same file and scope | The task overlay and its types stay as they were |
| Restoring an item | Either member may; it removes the deleted marks and moves `updatedAt` on, nothing else (items have no rule version) | Per the spec's recycle-bin rule |

## Step 5: offline (2026-11-14)

The spike (`e2e/offline/`, Chromium) passed: TanStack Query's built-in persistence holds, so Alternative K (a custom write queue) was not needed. WebKit was not available to test.

| Spec says | Built | Why |
|---|---|---|
| After a restore, mark every pending mutation paused with the mutation cache's `dispatch` | `mutation.continue()` on each restored pending mutation, in order; the household scope makes the rest wait | `Mutation#dispatch` is a private field in the installed TanStack (5.107.1); `continue()` is public and the spike shows it works |
| A 401 puts the mutation back in the paused state | A 401, Auth0's `login_required` and similar are retried with the same backoff (at most a minute) | Same reason; the write stays pending and saved, and the next retry sends it with the renewed token |
| Persist the cache and writes per user | Also: every entry records whose it is, a write is bound to its owner (dropped if someone else is signed in), and **the persister is sealed before the cache is deleted on sign-out** | The spike found that a save already in flight lands after the delete and brings the cache, with the waiting writes, back |
| Clear the cache on sign-out | Also: a different person signing in deletes the previous person's saved cache | Security review: nothing of the previous person should stay on the device |
| Step 2's household hooks move into the registry | They stay as they are | Each needs the server's answer before the screen moves on (creating a household, accepting an invite), so they cannot be queued offline |
| `@tanstack/react-query` | Raised to ^5.107.1 | It was 5.102.8 with its own nested `query-core` while the persist packages used 5.107.1: hydration crossed two copies of TanStack's classes |
| Playwright in CI | A job without AWS credentials, with no artifact upload (a repo guard bans `upload-artifact`); `deploy` needs it | The spike is the safety net for the offline design |
| An older `schemaVersion` replays its writes then drops its data | The persister's restore returns the entry with its lists removed; the app invalidates everything after a restore | Keeps the writes without a second code path |
| Show the saved lists before sign-in has finished | Done, and accepted: nothing checks for a live session first | The same data is already readable in the browser's storage on this device, and showing it at once is what lets a shop launch with no signal work. Clearing it whenever sign-in is not complete would also break "an expired sign-in, then the waiting writes resume" (security review, accepted) |
| Signing out while launching | Ends the session on this device (the Auth0 cache and stored person are cleared, the page reloads); sign-out always happens, and the person is told if the saved copy could not be cleared | Security review: sign-out must never silently do nothing, or fail open |

## Step 6: notifications (2026-11-14)

| Spec says | Built | Why |
|---|---|---|
| "Let <name> know" is a checkbox on every action | One tick per page (Today, the task page, Shopping, the task sheet): unticked by default, never remembered, and off again when the last box leaves the screen. While ticked, every change made on that page carries `notify` | A tick on every row would bury the lists; resetting on leaving means nothing notifies by surprise |
| Subscribe and unsubscribe "as in Hoardwise" | Subscribe takes `{ endpoint, keys }` only (no settings, no mutation id; both routes are idempotent). The endpoint must be on a known push service, https, default port, no credentials, never an IP (checked again at each send); at most ten devices per person (409 `too_many_devices`, and the newest ten are used at send time) | Security review: any signed-in person could otherwise aim the server at an address of their choosing |
| `notifyOther` is called with parsed `notify` and `clientAt` | The route reads them from the request's envelope after the write (`src/api/notify.ts`), leaving the parsers as they were | One place, no parser churn |
| Which actions notify | Task create, edit, delete, complete and propose; item put, delete and batch (clear ticked). Not accept, decline, withdraw, restore or undo | The spec's list of actions stops there; undo takes back a held push instead |
| Digest and nudges | Nudges are tasks due *today*; the digest is tasks due today or on an earlier day; an empty digest is not sent and not claimed; hours are the chosen hour to two hours after, never past local midnight | Spec: "item 35", plus the midnight rule |
| A held push past `expiresAt` is skipped | It is also deleted. One held for someone who has since left the household is deleted and never sent | Security review: a removed member must not keep receiving household content |
| `web-push` in the container | Installed into `build/container/node_modules` by `build-container.cjs` and loaded on first use; the runtime image still has no npm | The image ships no package manager |
| `loadVapid` | Also reads `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY` from the environment in the container; keys that cannot be read or written mean push is off, never a failed start | Spec 36a |
| Quiet hours "end" | The first quarter-hour whose local hour equals the end hour, searched forward from now | Works for time zones with half-hour offsets |
| The push Lambda's table access | Query, GetItem, UpdateItem, PutItem, DeleteItem on the table only (no Scan); the API role gained read of the one VAPID parameter | `infraGuards.test.ts` pins both |
| Push payload parsing in the worker | `app/lib/pushPayload.ts`: a non-JSON push shows as text; the address a push opens is always a path in this app | The step 5 review flagged a throw on a non-JSON payload |

## Phase 2, step 1: foundation (2026-11-15)

| Spec says | Built | Why |
|---|---|---|
| A restore of a recipe is not checked against the 200-recipe limit | A restore is held to the same 200 as a create, counting restores made earlier in the same request; past it the entry's status is `recipe_limit` and the recipe stays deleted | Security review: nothing on the server limits a restore to the 50 listed tombstones, so a cycle of delete, create and restore could take the live count, and the list, past Lambda's response limit |
| A create with no title becomes `TaskError('title_required', 400)` | The same, with `{ field: 'title' }` as its extra, so the answer names the field as every other 400 does | Consistent with the item route's missing-text answer |

## Phase 2, step 2: recipe library (2026-11-15)

| Spec says | Built | Why |
|---|---|---|
| Measure a persisted-cache save with 200 typical recipes and record the time in the pull request | 200 recipes of about 1.7 KB each saved in 0.5 ms (354 KB) against in-memory storage in jsdom. The real IndexedDB write was not measured | The 50 ms threshold is for a mid-range phone, which a test cannot stand in for: measure on a real phone with the release checklist before deciding whether recipes need their own persisted key |
| `markRefused` is called from the registered `onError` | It also reports the failure through the existing `report` toast, as the other sets do | A person who is not on the editor still hears that a queued save was refused |

## Phase 2, steps 3 to 6: cooking view, plan, add to the list, finish (2026-11-15)

| Spec says | Built | Why |
|---|---|---|
| `usePlan` refetches the recipe list once for each missing recipe id, and a day's "gone" waits on that | One refetch per mount for all missing ids (`useRecipeCheck` in `app/lib/recipeLookup.ts`), and any successful answer after the screen mounted counts, including the first load. `lookupState` is shared by the plan, Tonight, the review and the cooking view | The list is one request, so one refetch answers every id. A list that loaded after the screen mounted is already fresh from the server |
| The 4am cooking day and "ticks stay on the same positions" | As specified. An entry from another day reads as nothing and is replaced the next time one is written | Matches the design; recorded because the tests pin the 1am and 4am edges |
| The review gives each review line an id when it opens | Each line gets its id the first time it appears in the review (so a day switched on later gets new ids), and the ids are saved with the review state | A line that was never shown has no need of an id, and a line switched off and on keeps its own |
| `planSet` is a "meals group" key that invalidates `['plan']` | `mealMutationKeys` holds the recipe kinds and `planSet`; `RecipeMutationKind` names the recipe ones, and the registration table takes a function from kind to the queries to refresh | `planSet` shares the offline defaults and owner guard with the recipe kinds but refreshes another query |
| `Tonight` is shown on Today | It is shown only once the plan has loaded, and is left out if the plan could not load | The rest of Today must keep working when the plan cannot load, and "Nothing planned yet" must not flash while it loads |
| Wording test: each fixed phrase appears in the meal files | The test reads quoted strings and text between tags from the meal files and checks each phrase appears | The same reader the existing banned-word test uses |
| `yarn test:e2e` runs the offline case | It passes here with the installed Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE`). `yarn build` passes with placeholder Auth0 build variables. The DynamoDB contract tests were not run here (no DynamoDB Local) | CI runs the DynamoDB tests |

## Phase 3 design (2026-11-15)

The design is `docs/designs/phase-3-money-tracker.md`. The author decided the product (loans first, one total, per-entry splits, hand entry, settled entries hidden, a new entry waits for the other person, the wording "to settle, from {name} to {name}"). Everything else in it is a **Claude** decision, which the author has not yet reviewed:

- The total and loan progress are worked out from the entries every time and never stored; "settled" is worked out too.
- One entry record with three kinds (expense, loan, payment); money in whole pence; only the other person's share is stored, never the split mode; the odd penny stays with the payer.
- The money fields (kind, payer, amount, share, loan) change together under a version number; the description and date use per-field last-writer-wins.
- An agreed entry changes through a change request stored on the entry (one at a time), not through the task proposals. Only agreed, live entries count.
- A restore returns an entry as waiting with a new version. A deleted entry is never purged.
- Writes need exactly two members, and everyone named in the ledger must be one of them.
- No per-entry history. Notifications use the existing opt-in tick, and the text never holds an amount.
- Six tabs (a Money tab); `CACHE_SCHEMA_VERSION` stays 1; three pull requests.

### Phase 3, step 1: the ledger on the server (2026-11-15)

| Spec says | Built | Why |
|---|---|---|
| A put or update of the entry is conditional on `version` and `status` | Every update is conditional on `updatedAt`, `version` and `status`, and on `deletedAt` being absent (a restore is conditional on `deletedAt`). `updatedAt` only moves forward | `version` does not move for a description or date edit of an agreed entry, or for a change request, so on its own it would let an answer to an old request apply. A lost race re-reads and re-decides, so the refusal is the one the rules give |
| `change/respond` and `change/withdraw` are conditional on `pendingChange.id` | The check is made on the entry read (a different id answers 409 `entry_changed`), and the update is conditional on `updatedAt`, which every change request, withdrawal and answer moves | A condition cannot compare a field inside a stored object; `updatedAt` closes the same race |
| 409 codes: `entry_changed`, `needs_agreement`, `needs_two`, `pair_changed`, `money_limit` | Also `entry_changed` for a change request on an entry that is not agreed, already has a request, or is at another version. New codes for refusals the spec leaves open: 403 `forbidden` (the wrong member: not the proposer, answering your own entry or request, withdrawing someone else's), 404 `not_found`, 410 `gone`, 400 `invalid` with `field` for a payer who is not a member or a `loanId` that is not a live, agreed loan borrowed by the sender, and 409 `conflict` after three lost races | The spec names no code for these; the recipe code uses the same ones |
| A create against an id that exists | 409 `entry_changed` with the entry. An edit (no `kind`) of an id that does not exist is 404 | A create and an edit share `PUT`; `kind` tells them apart, and the spec does not say what a clash is |
| The two-member and pair checks are made before the write | They come before the 404 for a missing entry, so one member alone gets `needs_two` for anything | One read of the ledger (ids and `deletedAt` only) serves the pair rule and the live-entry limit |
| `deleteMoney` | Sets `deletedAt` and `deletedBy` and moves `updatedAt`, with no version change. A delete through an agreed change request does raise the version | The spec lists the version bumps and a direct delete is not among them; the change-request path says it raises the version |
| `paidBy` "one of the two members" | A 400 `invalid` with field `paidBy` (`money.paidBy` in a change request) | A bad request body field, not a state conflict |
| Pushes: "{name} added a money entry" and two others | Each has the spec text as its title and the fixed body "Open Money to take a look.", opening `/money`. An edit or delete of a waiting entry sends nothing; a restore sends the first text once, and only if something was restored | A push needs a body; it must not hold an amount |
| Restore logging | The restore route reads each restored entry again to write its `money_write` line (`action: 'restore'`) | The restore answer holds statuses only |
| `src/money/changes.ts`, `entries.ts`, `applyEntry.ts` | As specified. The store helpers shared by both (`writeEntry`, `toEntry`, `restoreMoneyEntry`) are exported from `entries.ts`, and `src/money/log.ts` also holds `withMoneyLog` and `logRestoredMoney` | One write loop for every route; the restore branch needs the same record mapping |
| The "all-square point" uses a running credit | The running credit is taken from the first (sorted) person in the ledger's participants; zero is the same from either side | `computeTotal` takes me and other, but `settledIds` takes only the entries |

### Phase 3, step 2: the app (2026-11-15)

| Spec says | Built | Why |
|---|---|---|
| Files: `moneyKeys`, `moneyOverlay`, `money`, `useMoneyActions` | Also `app/lib/moneyText.ts` (the words) and `app/lib/moneyForm.ts` (what the form types become), each with tests. `moneyFailureText` lives in `moneyText.ts` and `describeFailure` calls it | Keeps the wording in the files the wording test reads, and the form rules pure and testable |
| `useMoney()` returns `{ status; entries; total; loans; settled; unsaved; dataUpdatedAt; refetch }` | Also `me`, `people` (both names), `other`, `canWrite` and `unsavedIds`. `loans` holds every agreed loan with progress capped at its amount; the page filters them with `sectionsFor` | The screens need the pair, whether writes are allowed, and which entries have a queued change |
| `describeFailure(error, kind)` | A third argument, the other person's name, for "Ask {name} to agree to this change." The money set reads it from the cached household. The money codes apply only to money kinds | The wording table has a name in it; the registry has no hook to read it from |
| A restore refused for an entry is a per-entry status in a 200 answer | `MutationSet.onSuccess` also receives the answer, and `moneyRestore` reports `entry_changed`, `needs_two`, `pair_changed` or `money_limit` from it | Otherwise a refused restore would say nothing |
| "Change not made" when a request is declined or withdrawn | Worked out on the client: a request of mine goes away while the entry's version stays the same (`useChangeNotices`, shown once as a message). The server keeps no record of a declined request | There is nothing to read from the server; an agreed request moves the version or deletes the entry, so it is told apart |
| Payment form: sender, amount, date, loan (no "What for?") | A payment's description is made when it is added: "Payment", or "Payment for {loan}" cut to 120 characters. Its words are not editable | The server needs a description of 1 to 120 characters and the spec gives the form no field for it |
| Waiting list buttons "Agree" and "Ask {name} to check" | For a change request the second button reads "Keep as it is". Your own request shows "Withdraw". An entry you declined (the other person's to change) is listed under Entries as "Waiting for {name}" | The table has no words for declining a change, and the spec lists no place for an entry the viewer declined |
| Delete shows no undo | The delete message has no Undo, and Restore on the Deleted page is off while a change to that entry is not saved | A restore must name the deletion time the server stored, which the phone does not know until the write is sent |
| Add sheet: "One Add with three choices" | A radio group (not a segmented control) | Three labels, one of them long, must stay readable at the largest text size on a phone |
| Sheet "uses member names" | The share line uses names for both people ("Sam's share: £31.70" when Alex paid), never "I" or "they". Rows say "Waiting for you" and "Change waiting for you" as in the table | The spec says names; the table's own phrases use "you" |
| Six tabs fit at 360 px and the largest text size (go/no-go) | The tab labels keep the 12px rule. Not checked on a real device in this step | There is no phone in this environment; the check stays in `docs/MANUAL-CHECKS.md` for step 3 |

### Phase 3, step 3: finish (2026-11-15)

| Spec says | Built | Why |
|---|---|---|
| `money-total` takes "me" as the first member and "other" as the second | The members are ordered by `joinedAt`, then user id, so the order is the same on every run. With one member there is no "other": the total counts only what that member paid and says so | The member query alone has no joining order that means anything |
| The tool prints the total and each loan's progress | It also prints the member and entry counts, and lists each agreed, live loan with its progress (not capped at the amount, as `loanProgress` is). The tool is read-only | A check against a hand count needs to see what was read |
| The e2e case registers a `moneyAdd` kind | The spike's stub keeps each mutation id once for `PUT /api/hh/money/{id}`, as it does for recipes and plan days; no app code is used | Same shape as the existing cases |
| Six tabs fit at 360 px and the largest text size (go/no-go) | Still not checked on a device: it is a line in `docs/MANUAL-CHECKS.md` | No phone in this environment |
| Not in the spec | The signed-out page's logo is 48px high, not 64px | At 360px wide and the largest text size, the 64px lockup (mark and name side by side) was 9px wider than the screen, so the page scrolled sideways |

## Phase 4 (shared calendar)

The design is `docs/designs/phase-4-calendar.md`. The author decided the scope, the uses and the privacy rule (private events show to the other person as "busy"). Everything else in it is a **Claude** decision, which the author has not yet reviewed.

### Phase 4, step 1: events on the server (2026-11-15)

| Spec says | Built | Why |
|---|---|---|
| `occurrencesBetween(repeat, from, to, limit)`: window at most 400 days, result at most 500, "flagged `truncated`" | Returns `{ dates, truncated }`. The window is cut at 400 days (not refused) and `truncated` is true when either cut left something out. A rule that is not `fixed` gives no dates | A cut is safer than a throw for a caller that passes a wide window |
| `occurrencesOf(event, from, to)` | Takes a `Schedule` (the group) and returns `{ on, endOn, allDay, startTime?, endTime? }`. A timed item that ends exactly at midnight is not carried into the next day | The timeline needs the end on the wall clock, and an item ending at 00:00 does not touch the next day |
| Create is told from edit by... (not stated) | `kind` in the body means create, as in money. A body with `kind` to an id that exists is applied as an edit (the kind never changes). An edit to an id that does not exist is 404 | Per-group last-writer-wins makes a repeated create harmless |
| `BusyView.owner` is "the creator's name" | The creator's display name, from the household's members | Read literally; the app has the names too |
| Reminder minutes "0 to 1,440" (table) and a fixed list (picker) | The validator takes any whole number 0 to 1,440 for `start`, and only 0 for `end`; more than 3 in a list is 409 `reminder_limit` (the list is capped at 20 before that, 400) | The picker's fixed list is a screen rule; the server keeps the wider table rule |
| 400 for a reminder on an all-day event, `end` on an event | 400 `invalid` with field `list` | Same code and shape as other validation failures |
| `savedAt` | Server time of the save | A replay from a queue after the reminder's moment must not send a late warning |
| A reminder save "writes `CALREM`" | Every save that changed something writes it, in the same transaction, including a save that clears reminders; clearing a list that was already empty writes nothing | The job marks an item empty, so a later save must re-arm it |
| Restore of a private event: only its creator | The other person gets `not_found` (not a refusal) for it | They cannot see it, so it must not be confirmed to exist |
| Removed member's cleanup "started by `removeMemberRoute`", hourly sweep finishes | `purgeNonMemberData` in `src/calendar/cleanup.ts` (private events, reminder entries; at most 1,000 items; never throws). It reads the current member records itself after the removal commits (and always counts the removed user as gone, since the query may be stale), never an earlier list, so a person who joined meanwhile keeps their data. The route calls it after the removal. The sweep inside `runCalendarRefresh` is not built (it is step 6); reads hide the data meanwhile (tested) | `runCalendarRefresh` does not exist yet. "Unsent meanwhile" is tested with the reminder job in step 3 |
| `moveOptions` gains `CALFEED#` and `EVENT#` | Done, with tests for an event, a deleted event and a feed | |
| Event routes through `withWriteRecord`, result holds ids | The record holds `{ id }`; the route reads the event again and projects it for the caller. Replays are therefore not byte-identical to the first answer if the event changed in between | The write record must never hold text another person could be given |
| `src/calendar/log.ts` | Added: `calendar_write` and `calendar_reject` lines with ids and enums only | Same as `money/log.ts` |
| Push texts | `eventAdded`, `eventChanged`: title "{name} added an event" / "{name} changed an event", body "Open the calendar to take a look.", opening `/plan/calendar`. Nothing when the event is private after the write, whoever asked. A no-change edit and a delete send nothing | A push needs a body, and it must not hold a title |
| Restore route | An event's restore is logged as `calendar_write` with action `restore`; the entry carries `deletedAt` and `RestoreStatus` gains `event_limit` | As the money restore |

### Phase 4, step 3: reminders (2026-11-15)

Security decision: the push Lambda gains a second EventBridge rule, `hearthwise-push-reminders` (`rate(5 minutes)`), with its own target (input `{ "job": "reminders" }`) and its own `aws_lambda_permission` (statement `AllowEventBridgeInvokePushReminders`, `source_arn` that rule only). No IAM, boundary, SSM or deploy-role change is needed: the deploy role already covers `rule/hearthwise-*` and `AddPermission` on `function:hearthwise-*`, and the reminders read and write only the table items the push role already may. `infraGuards.test.ts` pins the hourly rule unchanged and without input, the five-minute rule and its input, one permission for each rule with its own statement, and exactly two rules and two permissions. The step-4 changes (calendar key, 512 MB) are not in this step.

| Spec says | Built | Why |
|---|---|---|
| A loader in `src/household/guard.ts` that takes a household id | `loadHousehold(store, householdId)` returns the meta and the members; `loadContext` now uses it. It is not a `HouseholdContext`, because there is no caller | The job starts from the `CALREM` index and has no user |
| `runReminders(store, sender, now)` | Same, and it returns a summary (`households`, `due`, `claimed`, `sent`, `stale`, `failed`) and logs it once as `calendar_reminders`. Each send logs `calendar_reminder` with the household, event, date and outcome | The test and the log read the same counts. `stale` counts reminders that just fell out of the 15 minute window (the last run's window) or that were set after their moment, not every old occurrence |
| Window `(now - 15 minutes, now]` | The same: an instant exactly 15 minutes old is skipped | |
| Text `"{title} starts in {n} minutes"` | Whole hours and one day read as "1 hour", "2 hours", "1 day" and "1 minute"; other counts stay in minutes. Zero is "is starting"; the end of a block is "ends now" | "starts in 1,440 minutes" reads badly on a lock screen |
| The claim records the instant and the rule (`normal`, `gap_forward`, `first_of_two`) | Done. The rule is found by reading the zone's clock at the chosen instant and an hour or so after it | For debugging only |
| A person without push gets no reminder | The check is made before the claim, so turning push on later sends a reminder still inside its 15 minutes | The claim must not be used up by a send that never happened |
| A household whose `CALREM` item is `empty` is skipped, and the job marks it empty when it finds no reminders | An event counts as holding a reminder if any current member has a non-empty list on it, deleted or not, past or not. The item is marked empty only by `patch` with `ifEquals` on the `updatedAt` it read (a save that landed meanwhile wins) | Restoring a deleted event, or editing a past event into the future, does not write `CALREM`, so the job must not mark the household empty on those |
| An end-of-block reminder for blocks only | Enforced at send time as well as by the validator | A stored `end` reminder on an event must not send |
| `MaintenanceDeps` gains `runReminders` and `runCalendarRefresh` | Only `runReminders`; `runReminderTick` and a second 5-minute interval beside the hourly one, both cleared by `stop()` | `runCalendarRefresh` is step 6 |
| `push-handler.ts` takes `job`, a missing one meaning hourly | Same. A `job` that is present and not exactly `reminders` logs one line and does nothing, before the store or push keys are loaded | An unknown job must not run the hourly work by accident |
| `ReminderPicker.tsx` and the offline e2e case (items 12 and 13) | Not built in this step's server work; they are in `app/` and `e2e/` | The step was limited to the server, infrastructure and container |

### Phase 4, step 4: the safe fetcher, the key and the infrastructure (2026-11-16)

Security decision (infrastructure): the SSM policy of the API role (`api_ssm`) and of the push role (`push_ssm`) each now names exactly two parameters, `/hearthwise/vapid-private-key` and `/hearthwise/calendar-key` (`ssm:GetParameter` only, two exact ARNs, no wildcard, no `GetParametersByPath`). Both Lambdas get `CALENDAR_KEY_PARAMETER` (the name, never the value). The push Lambda goes from 256 to 512 MB for the parser. The permissions boundary in `infra/initialSetup/main.tf` already allows `/hearthwise/*` and is unchanged; the deploy role is unchanged. `infraGuards.test.ts` now pins exactly these two parameters in each role, no wildcard, the variable on both Lambdas, no variable that could carry the key, and 512 MB.

| Spec says | Built | Why |
|---|---|---|
| `fetchFeed(url, previous)` | `fetchFeed(link)`. It returns `{ ok: true, text, bytes }` or `{ ok: false, internal, code }` and never throws or logs | There are no conditional requests, so `previous` has nothing to carry |
| The tests give the fetcher the resolver, the request function and the trusted certificates | Also `extraHosts` and an optional `limits` (connect, idle, total, DNS times). The real instance is built from `realDeps` with the default limits and the environment's extra hosts, and nothing in production passes anything else | The time tests need short limits; the seam is only reachable by building a new fetcher |
| The request is made with `https.request` to port 443 | Tests wrap `request` to change only the port and the lookup, after recording the options the fetcher chose; the pinned lookup is also tested on its own with real sockets under Node 24 (`all: true`) | The test server cannot listen on 443 or at a public address |
| `lookup` returns only the checked address | `pinnedLookup(name, address)` answers both shapes, and answers any other name, or a family that does not match, with an error | A second lookup can never change the target |
| Resolve with `resolve4` and `resolve6` under a 3 second timeout | Both run at once under their own 3 second limit and the shared 15 second total. One family failing is fine if the other answers; none is `dns`; any returned address not allowed is `blocked_address`. An IPv4 address is connected to in preference to IPv6 | A flaky AAAA lookup should not stop a fetch. An address that was never returned is never connected to |
| Userinfo, port and path rules | A user name or password (also an empty `:@`), or any port but 443 (the parser drops an explicit 443), is `not_supported`. An unparseable link, one with a space or control character, or over 2,000 characters, is `bad_link`. The request uses `https://<host><path><query>` from the parser, with no fragment | The serialised form is the only thing requested |
| `CALENDAR_EXTRA_HOSTS` is read in the container only | `extraHostsFrom(env)` returns nothing when `AWS_LAMBDA_FUNCTION_NAME` or `AWS_EXECUTION_ENV` is set. Entries must be lower-case ASCII names with a dot, not an address; others are dropped. An extra host has no path prefix | Exact names only, as the design says |
| Internal `status` and codes | As the table. A 3xx that is not a redirect status (300, 304) is `unreachable` | |
| gzip only | `gzip` and `x-gzip`, or none or `identity`; anything else (including `gzip, br`) is `not_calendar`. Input and output are both counted, and a gzip body is read with back-pressure and stopped at the first byte past 2 MB | |
| The key in the container: `CALENDAR_KEY` or the file | Also made on first start (mode 0600, written with `wx`) when there is neither, as the push keys are. A key that is not 32 bytes of base64 is never replaced, and gives "no key". On AWS there is no fallback from the parameter | A restored backup without the key file shows "Link needs to be added again" |
| `calendar_key_missing` | A log line `{ event: "calendar_key_missing", reason }` with a short reason (`not_set`, `invalid`, `unreadable:<ErrorName>`, `file:<ErrorName>`) | A person on call must be able to tell why, without the value |
| The no-other-fetch test covers `src` and `container` | See the test: it ignores `import type`, and allows `container/server.ts` (the inbound `http` server and the `child_process` that starts Caddy) and `container/adapter.ts` (types only) by name | They do not fetch anything |
| `src/calendar/feeds.ts` receives the fetcher as a parameter | Not built here: `feeds.ts` is step 6 | |


### Phase 4, step 5: the parser (2026-11-16)

`ical.js` is pinned at **2.2.1** (the latest release, published 2025-08-08, well over two weeks old), exactly, in `package.json` and in each generated dependency list (API, push, container). It is ESM-first with a `require` export (`dist/ical.es5.cjs`): a plain `import ICAL from 'ical.js'` compiles to `require('ical.js')` in the CommonJS builds and works, so no dynamic `import()` is needed. (Requiring the package folder by absolute path picks the ESM file and fails; the bare name is right.)

| Spec says | Built | Why |
|---|---|---|
| `parseIcs(text, window)` with `from`, `to`, `now` | The window also carries `zone`, the household's IANA zone | Times with no zone are read there |
| Count `BEGIN:VEVENT` lines before `ical.js` sees the text | Done on the unfolded text. The same scan drops every block but `VEVENT` (VTIMEZONE, alarms, anything nested) and every property we do not read, and drops a line over 64 KB. `ical.js` then parses one event at a time, so one bad event is skipped and counted and does not lose the file | Nesting depth costs one counter, and a hostile property never reaches the library |
| Our own loop around `ical.js`'s iterator counts every `next()` call | `ical.js` is used only to read the text into components and property values (`ICAL.parse`); its repeat iterator is **not used**. `src/calendar/expandRule.ts` expands rules in wall-clock days from an allow-list: DAILY, WEEKLY, MONTHLY and YEARLY with INTERVAL, COUNT, UNTIL, WKST, BYMONTH, BYMONTHDAY and BYDAY (a numbered weekday only in MONTHLY, or YEARLY with BYMONTH, and only 1 to 5 either way; a negative BYMONTHDAY not in a DAILY rule; no BYMONTHDAY in WEEKLY). Anything else (BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR, BYMINUTE, BYSECOND, a month and day that never meet) is refused: the event is skipped and counted in `skipped`, never guessed at. COUNT includes the start, as the standard says | Review findings: one `next()` call cannot be interrupted from its own thread and `FREQ=DAILY;BYMONTHDAY=-1` made the library's iterator abort the whole process (exit 134), which the worker limits do not stop; `BYWEEKNO` and `BYDAY=53MO` gave wrong dates. With our own loops every loop ends at a day we choose |
| 1,000 steps an event, 20,000 a file | A step is one occurrence handed on from the window (the earlier ones are only counted for a COUNT); RDATE values count too. Separately, periods stepped through (days, weeks, months or years) are limited to 60,000 an event and 600,000 a file, and the clock is read every 256 periods against a 3.5 s budget. Distinct wall-clock conversions are limited to 40,000 and cached | The per-event step limit cannot be reached by a rule today (a window holds at most about 135 days); it stays as a guard |
| A daily event from years ago still shows | A rule with no COUNT starts at the period holding the window, by arithmetic; with a COUNT it steps through every period from the start | The count has to be exact |
| Never trust RRULE | Every number is range-checked and lists are cut at 400 values | |
| (Review) a deny-list of spinning rules | Not kept: the allow-list above replaced it. The worker's 5 s `terminate()` and 128 MB ceiling remain the backstop for anything else, and are tested on a worker that never answers and one that exhausts memory. **Residual risk**: the memory ceiling and the timer stop a runaway thread, but a fault that aborts the process from inside native code (as the library's did) is not caught by either; with the library's iterator out of the path, the remaining library code is its text parser, which a few hundred random rules, 24 hostile files and the fuzz test did not break | |
| (Review) a semaphore | `parseIcs` runs at most 2 workers at once and queues the rest; a place is freed when a worker answers, fails, is killed or cannot be started. The timer starts when the worker does | The container and Lambda would otherwise start a worker for every feed at once |
| (Review) fuzz the real parser | `parseFuzz.test.ts` bundles `parseIcs` and the worker with esbuild and runs about 800 random and hand-picked rules (including `FREQ=DAILY;BYMONTHDAY=-1` with three starts) in a child process: exit 0, each answered inside 4 s, none needing the worker killed | A process abort cannot be seen from inside the test run |
| EXDATE and RDATE | At most 500 values of each for an event (more is counted as skipped). Each conversion is counted and cached | A huge list is cheap to send and must not be cheap to spend |
| `UNTIL` in universal time is converted to wall-clock | Also: a date-only UNTIL on a timed event covers all of its last day | Some providers write it that way |
| `RANGE=THISANDFUTURE` ignored and counted | Same | |
| The worker is started with `env: {}` | Also `execArgv: []` and `maxYoungGenerationSizeMb: 16`, `stackSizeMb: 2` beside the 128 MB old space | No inherited flags |
| `parseWorker.ts` added to each `tsc` command | `parseIcs.ts` is added too, because nothing imports it yet and the build tests start it | Step 6 will import it |
| Build tests start the worker from each output | `buildOutputs.test.ts` runs the compiled worker in a child process with an empty environment, on a good file, six hostile files and a good file again. It skips when the output is absent unless `REQUIRE_BUILD_OUTPUT=1`; `yarn test:build` sets that and CI runs it after the builds (the container build is added to that step) | `yarn test` runs before the builds in CI |
| API and push outputs have no `package.json` | They now carry `{ "type": "commonjs" }`, as the container output already did | The repository is `"type": "module"`, so a compiled `.js` (and its worker) is read as ESM when run from `build/` here. On Lambda there is no parent `package.json`, so nothing changes |
| Container smoke parses a fixture | Parses a three-day London fixture across the 2026-03-29 clock change with the compiled `parseIcs` in the running image. Runs inside the existing smoke job | |
| Provider fixtures | Hand-written files shaped like Google, Outlook (Windows zone names, `Customized Time Zone`), Apple (nested alarms, structured location) and Proton | No network |
| Output shape | `{ allDay: false, startMs, endMs, title, free, approx }` or `{ allDay: true, startOn, endOn (inclusive), title, free }`, and counts `events`, `skipped`, `approx`, `truncated` | The snapshot chunk tuples are made from this in step 6 |
| Windows zone table | About 140 names from CLDR's primary mapping, written from memory of the list, each checked to be a zone the runtime knows. Names are matched ignoring case | Not downloaded; a name not in it is read in the household zone and marked approximate |
| Identifiers named `window` | Avoided in non-test code (`range`, `span`) | The no-other-fetch scan treats a `window` alias as a possible `fetch` |
### Phase 4, step 2: the app, typed events (2026-11-15)

| Spec says | Built | Why |
|---|---|---|
| `plan.tsx` becomes a layout with the "Dinners \| Calendar" switch; `h1` not stated | `plan.tsx` holds the switch (links with `aria-current`) and an `Outlet`; each child keeps its own `h1` ("Plan", "Calendar") and its own page title | A child page tested alone still has one `h1` |
| Reminders on the add or edit sheet (views list) | Not built: the reminder picker is step 3 (item 12). `setReminders` is registered, has its overlay and an action, but no screen calls it | Items 10 to 12 own reminders |
| "Next" on Today: "Dentist, Alex, 10:30" and "Wind down at 21:30" (two forms) | One form: "Next: {title} at {time}", with ", {name}," after the title when the item is not the viewer's or both | One rule for both examples |
| Both-person label "Sam and Alex" (CUJ 3) or "Both" (Timeline) | "Both" | The Timeline section is the rule |
| "Now" read with `zonedInstant` | Also reads yesterday's items, and an item that starts inside a clock-change gap and ends at the same moment is not "now" | Overnight items at 00:30 |
| Not stated | The strip and the page re-read the clock each minute (`useNow`) | A screen that says "now" must not go stale |
| Not stated | An all-day event's last day is a field on the sheet; week view starts on the day chosen (today), not on Monday | Server supports `endOn`; CUJ 11 says "the next seven days" |
| Not stated | The detail sheet and the edit sheet act on the event as it was when opened; actions are disabled while that event has an unsaved write; a restore is disabled for the same reason | Phase 3 review lessons |
| Not stated | Busy items are not tappable; the other person's private event has no id to open | Nothing to act on |
| 360 px and largest text are manual lines in step 7 | Also checked in Chromium against the dev server with a stubbed API: no sideways scroll on Today, Plan, Calendar day and week, or the add sheet at 360 px, standard and largest text | Cheap to do now; the real-phone check stays in step 7 |
