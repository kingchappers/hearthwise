# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hearthwise is a shared household app for two adults: chores, to-dos and a shopping list, with one set of data and per-person views. React SPA + Auth0 (or built-in login) + AWS Lambda, or a self-hosted container on SQLite. Infrastructure is OpenTofu.

**Status: phase 1, step 1 (scaffold).** The Store, auth, API shell, container, infrastructure, brand and an empty signed-in shell exist. Households, tasks, the shopping list, offline use and notifications arrive in steps 2 to 7. The approved design is `docs/designs/phase-1-foundation.md`; `docs/ROADMAP.md` lists the steps.

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
- **API Lambda** (`api-handler.ts`, `src/api/`): authenticates every request, then dispatches through a small router. Routes register in `src/api/apiRoutes.ts`. There is no PATCH method on the router yet; step 3 adds it with its first PATCH route.
- **Auth** (`src/auth/`): `AUTH_MODE` picks `auth0` (AWS default) or `local` (container default). Local login is single-account until step 2.
- **Static Lambda** (`src/static/`): serves the SPA and falls back to `index.html`.
- **Container** (`container/`): Node server plus Caddy, same handlers, SQLite store, hourly maintenance loop.
- **Frontend** (`app/`): React 19, React Router (SPA, `ssr: false`), Mantine 8, Tailwind. File routes in `app/routes/`. `~/*` maps to `app/*`. `DefaultLayout` wraps each page in `AuthProvider`.
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
