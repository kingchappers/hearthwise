# Roadmap

## Phase 1: household, chores, to-dos, shopping list

Each step is its own pull request, in this order. Design: [`designs/phase-1-foundation.md`](designs/phase-1-foundation.md).

1. **Scaffold** (built): tooling, Store with conditional update, auth, static and API Lambdas, container, infrastructure, brand, empty signed-in shell.
2. **Accounts, households and invites** (built): multi-account local login, households, membership guard, invites, member removal, sign-up alerts.
3. **Tasks** (built): model, repeat rules, completions, proposals, "I did this today", views, task recycle bin.
4. **Shopping list** (built): list, item recycle bin, "clear ticked".
5. **Offline** (built): persistence spike, service worker, persisted query cache, persisted paused mutations.
6. **Notifications** (built): "Let them know", held pushes, opt-in digest and due nudges, settings.
7. **Finish** (built, except the real-phone checks): wording test, accessibility checks on every route, deployment docs, and the release checklist [`MANUAL-CHECKS.md`](MANUAL-CHECKS.md) for the PWA install and iPhone push check.

## Phase 2: meals

Each step is its own pull request, in this order. Design: [`designs/phase-2-meal-plan.md`](designs/phase-2-meal-plan.md).

1. **Foundation** (built): ingredient reader, scaling and merging, recipe domain and routes, `forRecipes` on a shopping line, restore of recipes.
2. **Recipe library** (built): recipes list and editor with drafts, the Recipes tab, recipes on the Deleted page.
3. **Cooking view** (built): the tick-through ingredient list and steps, servings, wake lock.
4. **Week plan** (built): the plan, the day sheet, Tonight on Today, "Pick something easy".
5. **Add to the shopping list** (built): the review, merged shopping lines labelled with their recipes, "On the list".
6. **Finish** (built, except the real-phone checks): wording test, offline case, docs, and the release checklist in [`MANUAL-CHECKS.md`](MANUAL-CHECKS.md).

## Phase 3: money

Each step is its own pull request, in this order. Design: [`designs/phase-3-money-tracker.md`](designs/phase-3-money-tracker.md).

1. **The ledger on the server** (built): the pure ledger rules, money entries, change requests, the routes, restore, the logs.
2. **The app** (built): the Money tab and page, the add sheet, entries, change requests, offline use, the Deleted page group.
3. **Finish** (built, except the real-phone checks): `yarn store-cli money-total`, the offline e2e case, and the release checklist in [`MANUAL-CHECKS.md`](MANUAL-CHECKS.md).

## Later phases

Each gets its own design document.

- Phase 2: meal plan feeding the shopping list. Design: [`designs/phase-2-meal-plan.md`](designs/phase-2-meal-plan.md) (built, not yet reviewed by the author, and waiting on the checks in [`MANUAL-CHECKS.md`](MANUAL-CHECKS.md))
- Phase 3: money tracker. Design: [`designs/phase-3-money-tracker.md`](designs/phase-3-money-tracker.md) (built, not yet reviewed by the author, and waiting on the checks in [`MANUAL-CHECKS.md`](MANUAL-CHECKS.md))
- Phase 4: shared calendar
- Phase 5: DIY projects
- Unscheduled: integration with the sibling budgeting app
