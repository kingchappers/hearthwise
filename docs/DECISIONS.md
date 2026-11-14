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
