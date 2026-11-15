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

## Later phases

Each gets its own design document.

- Phase 2: meal plan feeding the shopping list. Design: [`designs/phase-2-meal-plan.md`](designs/phase-2-meal-plan.md) (drafted, not yet reviewed by the author)
- Phase 3: money tracker
- Phase 4: shared calendar
- Phase 5: DIY projects
- Unscheduled: integration with the sibling budgeting app
