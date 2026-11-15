# Hearthwise

A shared household app for two adults: repeating chores, one-off to-dos, a shopping list that works offline in a shop, a recipe library with a dinner plan that feeds the list, and a money tracker for loans and shared expenses. One set of data, with each person's own settings for reminders and how much they see at once.

**Status:** phases 1, 2 and 3 are built and waiting on the checks in [`docs/MANUAL-CHECKS.md`](docs/MANUAL-CHECKS.md). Phase 1 has households of two with invite links, chores and to-dos (including proposing a change to the other person's chore), a shopping list that works offline, and opt-in notifications. Phase 2 adds recipes typed in once, a cooking view with a tick-through ingredient list and steps, a dinner plan both people see, and adding a planned week to the shopping list with matching ingredients summed. Phase 3 adds a money tracker: loans, shared expenses and repayments, each agreed by the other person, with one total ("to settle, from Sam to Alex") worked out from the entries and a progress bar for each loan. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

- Design: [`docs/designs/phase-1-foundation.md`](docs/designs/phase-1-foundation.md), [`docs/designs/phase-2-meal-plan.md`](docs/designs/phase-2-meal-plan.md), [`docs/designs/phase-3-money-tracker.md`](docs/designs/phase-3-money-tracker.md)
- Brand: [`docs/brand.md`](docs/brand.md)
- Auth0 tenant setup for the deployed site: [`docs/AUTH0.md`](docs/AUTH0.md)
- Deploying to AWS: [`DEPLOYMENT.md`](DEPLOYMENT.md). Self-hosting: [`docs/SELF-HOSTING.md`](docs/SELF-HOSTING.md)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Run it locally

```bash
yarn install
yarn dev
```

Tests: `yarn test` (add `DYNAMODB_ENDPOINT=http://localhost:8000` with DynamoDB Local running to include the DynamoDB tests). Self-hosting with Docker is described in `compose.example.yml`.

## Licence

AGPL-3.0-or-later. See [`LICENSE`](LICENSE).
