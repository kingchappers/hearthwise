# Hearthwise

A shared household app for two adults: repeating chores, one-off to-dos and a shopping list that works offline in a shop. One set of data, with each person's own settings for reminders and how much they see at once.

**Status:** phase 1 is built and waiting on the checks in [`docs/MANUAL-CHECKS.md`](docs/MANUAL-CHECKS.md). It has households of two with invite links, chores and to-dos (including proposing a change to the other person's chore), a shopping list that works offline, and opt-in notifications. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

- Design: [`docs/designs/phase-1-foundation.md`](docs/designs/phase-1-foundation.md)
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
