# Roadmap

## Phase 1: household, chores, to-dos, shopping list

Each step is its own pull request, in this order. Design: [`designs/phase-1-foundation.md`](designs/phase-1-foundation.md).

1. **Scaffold** (built): tooling, Store with conditional update, auth, static and API Lambdas, container, infrastructure, brand, empty signed-in shell.
2. **Accounts, households and invites:** multi-account local login, households, membership guard, invites, member removal, sign-up alerts.
3. **Tasks:** model, repeat rules, completions, proposals, "I did this today", views, task recycle bin.
4. **Shopping list:** list, item recycle bin, "clear ticked".
5. **Offline:** persistence spike, service worker, persisted query cache, persisted paused mutations.
6. **Notifications:** "Let them know", held pushes, opt-in digest and due nudges, settings.
7. **Finish:** accessibility pass, wording review, PWA install and iPhone push check, deployment docs.

## Later phases

Each gets its own design document.

- Phase 2: meal plan feeding the shopping list
- Phase 3: money tracker
- Phase 4: shared calendar
- Phase 5: DIY projects
- Unscheduled: integration with the sibling budgeting app
