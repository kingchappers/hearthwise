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

## Step 2: accounts, households and invites (2026-11-13)

Decisions the spec was silent or inconsistent about; the plan is `docs/superpowers/plans/2026-11-13-phase-1-step-2-accounts-households-invites.md`.

| Spec says | Built | Why |
|---|---|---|
| `POST /api/invites/accept` takes `{ token, confirmMove? }` | Also takes `displayName` (1 to 40 characters); `POST /api/households` too | The MEMBER row needs a name and the server only has the Auth0 subject |
| Local accounts have an email | Also a `displayName`, returned by `GET /api/auth/me` | So the welcome form can prefill it |
| Router has no PATCH | `patch` added, and path parameters are decoded once (malformed escape is 400) | `PATCH /api/hh/members/me` and `DELETE /api/hh/members/auth0%7Cabc` |
| Household name length unspecified | 1 to 60 characters | |
| `GET /api/hh` returns members | Each member as `{ userId, displayName, joinedAt }`; only the caller's own settings come back | The other person's reminder settings are theirs |
| Alerts | SNS topic and email subscription in the main stack, from the repository variable `ALERT_EMAIL`; the IAM user for the Auth0 Action and the deploy role's SNS permissions are in `infra/initialSetup` (applied by hand) | The deploy role cannot create users. AWS emails a confirmation link: **until it is clicked, no alert is delivered** |
| Open invites unlimited | At most 10 per household | Keeps a "move" transaction under DynamoDB's 100-operation limit |
| A link of the wrong shape: 400 or 410 | Always `410 invite_expired`, before any lookup | A garbage token must never become a store key |
| Invited sign-up answers `email_taken` | After 5 such answers the invite is deleted | A valid link must not become a way to list which emails have accounts |
| 410 and 409 messages name the inviter | They say "your partner" | The server sends no inviter or household name; adding one is a server change |
| Auth0 accept is automatic | A small form (name prefilled, **Join household**) | Accept needs a valid display name |
| Show Auth0's error text on a failed sign-in | Only when this tab started the sign-in (a `sessionStorage` marker), and always stripped from the address | A crafted link could otherwise put someone else's words in the panel |

**Unmigrated Step 1 accounts.** Local accounts made in step 1 use the old key scheme and are not migrated. Delete the SQLite file and set up again (`docs/SELF-HOSTING.md`). This is the resolution of the step 1 deviation that kept `reset-password` single-account: it now takes an email, and the unused recovery flag is gone.

**Accepted: the email-existence leak to an invite holder.** Someone holding a valid invite can learn that an email already has an account (`email_taken`). Invites are one-time, trusted links the creator hands to one person, and the 5-answer cap burns a link that is being used to probe.

**Accepted: best-effort limits.** The open-invite cap and the `email_taken` counter are read-then-write, so two simultaneous requests can pass either by one. Nothing depends on the exact number.

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
