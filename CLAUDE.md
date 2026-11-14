# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hearthwise is a shared household app for two adults: chores, to-dos and a shopping list, with one set of data and per-person views. React SPA + Auth0 (or built-in login) + AWS Lambda, or a self-hosted container on SQLite. Infrastructure is OpenTofu.

**Status: phase 1, step 5 (offline).** The Store, auth, API shell, container, infrastructure, brand, households, invites, chores and to-dos with proposals, the shopping list, and offline use exist. Notifications and the finishing pass arrive in steps 6 and 7. The approved design is `docs/designs/phase-1-foundation.md`; `docs/ROADMAP.md` lists the steps.

Hearthwise began as a copy of the scaffolding of a sibling app, Hoardwise, and shares an AWS account with it. Nothing here may point at the sibling's resources: see "Shared AWS account" below.

## Commands

```bash
yarn install          # Install dependencies
yarn dev              # Dev server with hot reload
yarn typecheck        # react-router typegen + tsc
yarn test             # Vitest (api project: node; app project: jsdom)
yarn build            # react-router build, then the static, API and push Lambda bundles
yarn build:container  # Compile the self-hosting server (container/) to build/container/
yarn store-cli        # Build and run the store command line tool (backup, reset-password)
```

`yarn test` runs the DynamoDB contract tests only when `DYNAMODB_ENDPOINT` is set (CI sets it). To run them locally: `docker run -d -p 8000:8000 amazon/dynamodb-local`, then `DYNAMODB_ENDPOINT=http://localhost:8000 yarn test`.

`yarn build` needs `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` and `VITE_AUTH0_AUDIENCE` for the AWS build. Container image: `docker build -t hearthwise:dev .` then `node scripts/container-smoke.mjs hearthwise:dev [--proxy|--tls]`.

## Architecture

- **Store** (`src/store/`): one interface over DynamoDB, SQLite and an in-memory store, shared contract tests. `transact` takes `put`, `delete` and a conditional `update` (`ifEquals`, `ifMissing`, `mustExist`). An attribute that is not set is left out, never stored as `null`. `expiresAt` is epoch seconds.
- **API Lambda** (`api-handler.ts`, `src/api/`): authenticates every request, then dispatches through a small router. Routes register in `src/api/apiRoutes.ts`. The router has `get`, `post`, `patch` and `delete`, and decodes path parameters once (a malformed escape is a 400).
- **Auth** (`src/auth/`): `AUTH_MODE` picks `auth0` (AWS default) or `local` (container default). Local login has one account per email; after first-run setup the only way to make one is an invite link (`signup-with-invite`).
- **Households** (`src/household/`, routes in `src/api/households.ts`): households, members, invites. **Every household route is wrapped in `withHousehold`** (`guard.ts`), which reads the caller's membership and hands the handler a `HouseholdContext`; the household id never comes from the request. Request fields are checked with the validators in `src/shared/validation.ts`.
- **Tasks** (`src/tasks/`, routes in `src/api/tasks.ts`): `tasks.ts` (create, edit, delete, list), `completions.ts` (complete, undo), `ownership.ts` (who a task belongs to and what needs the other person's say), `proposals.ts`, `restore.ts`, `history.ts`. Dates and repeat rules are pure and shared: `src/shared/schedule.ts`; request validation: `src/shared/taskValidation.ts`. **Every write route carries a `mutationId` and runs through `withWriteRecord`** (`src/api/writeRecord.ts`): the write and its `MUT#` record are one transaction, so a retry is answered from the record and writes nothing. Read the record first (`replayOf`), then the task.
- **Shopping** (`src/shopping/`, routes in `src/api/items.ts`): `apply.ts` is the pure write rule (field timestamps, tombstones, clear-ticked), `items.ts` the domain (single writes inside `withWriteRecord`; a batch is one transaction per entry plus one record). Restore of an item is in `src/tasks/restore.ts`. The app reuses it: `app/lib/itemOverlay.ts` applies the same rule to pending writes, and item mutations (`itemMutationKeys`) are registered beside the task ones.
- **Security events** (`src/security/events.ts`): `emitSecurityEvent` logs and publishes to SNS (`ALERT_TOPIC_ARN`); ids and event types only, never emails or names.
- **Auth0 tenant:** `docs/AUTH0.md`; the first-login Action is `infra/auth0/first-login.js`.
- **Static Lambda** (`src/static/`): serves the SPA and falls back to `index.html`.
- **Container** (`container/`): Node server plus Caddy, same handlers, SQLite store, hourly maintenance loop.
- **Frontend** (`app/`): React 19, React Router (SPA, `ssr: false`), Mantine 8, Tailwind. File routes in `app/routes/`. `~/*` maps to `app/*`. `DefaultLayout` wraps each page in `AuthProvider` and is the household gate: a signed-in person with no household goes to `/welcome` (or `/join` if an invite is waiting); `/join` is the only public page. Household data hooks are in `app/lib/household.ts`. Tasks: `useTasks()` (`app/lib/queries.ts`) polls the list and lays pending writes over it (`app/lib/overlay.ts`, pure); **every household mutation is registered once in `app/lib/mutations.ts` and used by key only** (`useHouseholdMutation`), so step 5 can persist and replay them; `app/hooks/useTaskActions.tsx` is the one place the screens run them. View rules (groups, next thing) are pure: `app/lib/tasks.ts`.
- **Offline** (`app/lib/persistedCache.ts`, `householdRuntime.tsx`, `retryRules.ts`, `app/sw.ts`): the query cache and every pending household write are saved to IndexedDB per person (`hearthwise-cache-<userId>`, with `hearthwise-user` in `localStorage` saying whose to open at launch). `HouseholdProvider` makes one client per stored person, **registers the mutations before anything is restored**, and RegisterMutations plugs the request function in later. Writes are `networkMode: 'online'` and retried by `shouldRetry` (network, timeout and lapsed sign-in for ever; 5xx three times). A restored write is resumed with `mutation.continue()` once the person it belongs to is signed in (`useResumeOnReconnect`). **Sign-out must seal the persister first** (`signOutCleanup`), or a save in flight brings the cache back; every write is bound to its owner and dropped if someone else is signed in. The worker precaches the app, never `/api/*`, never calls `skipWaiting`. `yarn test:e2e` runs the offline spike in `e2e/offline/` (Chromium; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use one already installed).
- **Infrastructure** (`infra/`): OpenTofu. `infra/initialSetup/` creates the deploy role and its permissions boundary and is run by hand once.

## Conventions

- Every `fetch` goes through `withTimeout()` (`app/lib/api.ts`): ten seconds, then it fails and can be retried.
- Wording is neutral and low-shame. No "overdue", "missed" or "streak"; an item past its date reads "Due". The palette has no red (`docs/brand.md`).
- Display preferences are per device and saved under `hearthwise.preferences`. Anything the household shares is saved on the server.
- Copy from the sibling app only from the pinned commit named in the design, and never change the sibling.
- Conventional commits, imperative, under 72 characters. Write the failing test first.

## Shared AWS account

The same AWS account, state bucket and GitHub OIDC provider as the sibling app are in use. So:

- Every resource name starts with `hearthwise` (`app_name`). The table is `hearthwise-data`; the SSM path is `/hearthwise/*`; state is under `hearthwise/` in the bucket.
- The deploy role is trusted from `main` only, cannot change itself, and can only create roles under the `hearthwise-lambda-boundary` permissions boundary. A pull request never gets AWS credentials.
- The deploy job fails if the plan would delete the data table or the custom domain (`scripts/check-plan.mjs`); `ALLOW_DESTRUCTIVE_DEPLOY=true` (a repository variable) overrides it for one deliberate deploy. `APP_DOMAIN` must be a repository variable, not a secret.
- `src/infra/__tests__/infraGuards.test.ts` pins these rules. A change to them is a security decision: record it in `docs/DECISIONS.md`.

## Security

Follow `SECURITY.md`. Never commit secrets, `*.tfvars` (only `*.tfvars.example`), `.env`, state, or Lambda zips. The repository is public: do not upload plan files or other build artefacts that can hold secrets.
