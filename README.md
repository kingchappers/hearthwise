# Hearthwise

A shared household app for two adults: repeating chores, one-off to-dos and a shopping list that works offline in a shop. One set of data, with each person's own settings for reminders and how much they see at once.

**Status:** phase 1 in progress. Step 1 (the scaffold) is built: sign-in, a Store that supports conditional updates, the container and AWS infrastructure, the brand, and an empty signed-in shell. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

- Design: [`docs/designs/phase-1-foundation.md`](docs/designs/phase-1-foundation.md)
- Brand: [`docs/brand.md`](docs/brand.md)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Run it locally

```bash
yarn install
yarn dev
```

Tests: `yarn test` (add `DYNAMODB_ENDPOINT=http://localhost:8000` with DynamoDB Local running to include the DynamoDB tests). Self-hosting with Docker is described in `compose.example.yml`.

## Licence

AGPL-3.0-or-later. See [`LICENSE`](LICENSE).
