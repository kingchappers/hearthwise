# Hearthwise phase 2: meal plan

* **Author:** kingchappers
* **Date:** 2026-11-14

## Overview

Two adults plan dinners on a whiteboard and build the shopping list from it. The whiteboard only works when you stand in front of it, and it cannot be shared. Phase 2 moves the plan, the recipes and the list-building into Hearthwise, so both people see the same plan on their phones, can open tonight's recipe in one tap, and can turn a planned meal into shopping list lines.

The app is for autistic, ADHD and audhd people. The named hard parts are deciding what to eat, remembering which night is which meal, and remembering recipe steps. The design therefore aims to cut the number of decisions and the amount of upkeep, and it never changes anything by itself.

What phase 2 adds:

- **Recipes.** A household library of breakfast, lunch and dinner recipes, each typed in once. A recipe can be saved with just a name and filled in later. Ingredients are typed one per line ("2 onions", "200 g flour") and the app reads the amount, unit and name from the line. A recipe has steps, a servings number, an optional "low energy" mark, an optional "minutes" number and an optional nutrition note typed by hand.
- **Week plan.** One dinner per day. A day holds a recipe or a plain name ("Takeaway"). Both people can change it. The home screen shows "Tonight" at the top with one tap into the recipe.
- **Cooking view.** The recipe's ingredients as a tick-through list ("get everything out") and its steps as a list. Ticks live on the device only.
- **Add to the shopping list.** For one planned dinner, or the whole week: scale each recipe to the planned servings, merge matching ingredients inside that add into one line with a sum, and show a review list. The person ticks the ingredients they already have, and those are left off. Each new line carries the recipe names. After the add, the list is never touched again by the plan.
- **"Pick something easy."** When nothing is planned, a short list of three recipes marked low energy (and under a chosen time), picked at random from the household library.

Success, as best the author's words allow: after a month the whiteboard is gone and neither person has to decide at 5pm what to eat. That is a self-check, written into `docs/MANUAL-CHECKS.md`, and not something the app measures.

## Analysis

Six Goldfish lenses reviewed the concept against the real code. These are their findings, ranked, with what the brief decides about each. The author was asleep during this pass and asked not to be interrupted, so every decision below that goes beyond the author's own words is marked "Claude's call", and the author can reverse any of them.

### 1. A structured sum does not fit the existing shopping item (blocker, all lenses)

A `ShoppingItem` has free text, a free-text quantity of up to 40 characters, a ticked flag and per-field last-writer-wins times. A sum such as "3 onions" built by adding "2 onions" to an existing line is a read-modify-write on a field two phones can edit offline. A replay would add twice. An absolute value computed on a stale phone would overwrite the other person's edit.

*Failure:* Person A adds Tuesday's dinner offline. Person B edits "onions" on the list. A reconnects and A's sum replaces B's quantity.

*Decision (Claude's call):* Merging happens only among the lines of one add action. The app never merges into a line already on the list, whether hand-typed or from an earlier add. Every line from an add is created new, with an id made on the client, so a replay writes nothing new. The stored item keeps `text` and `quantity` as display strings. One new optional field, `forRecipes`, holds the recipe names as a single string, set when the line is created and never edited. This keeps the author's rule that the list never changes itself, and it removes the race.

### 2. A new field on a shopping item is wiped silently (blocker, codebase and readiness lenses)

`toShoppingItem` copies a fixed list of attributes, and `updateFor` removes every stored attribute that is not on the rebuilt item. A new field that is not added to the type, `toShoppingItem`, the item validator and the client overlay disappears on the first tick or edit.

*Decision:* `forRecipes` is added in every one of those places in the first slice that touches items, with a test that ticks and edits a line that has it and checks it survives. A rollback to a build without the field would drop the label on the next edit. That is accepted, because the label is a convenience and the list text stays correct.

### 3. "Add to list" is a multi-write, offline, two-person action (blocker, design and structural lenses)

The existing batch route writes each entry in its own transaction and writes the retry record last. It is not atomic, and a double press, or a press on each phone, adds the lines twice. DynamoDB also rejects a transaction of more than 100 operations, and the SQLite and in-memory stores do not, so a large add would pass every local test and fail on AWS.

*Decision:*
- The client computes the lines (it needs them offline for the review list and the optimistic list). It sends them to one new route, which validates each line and creates them. Each line is a create with a client-made id and runs in its own transaction, like the batch route. The retry record is written last. The route accepts up to 100 lines. A bigger add is sent as several requests in order.
- The ticked "I already have it" lines are never sent.
- Each planned day records that its dinner was added (`addedAt`, `addedBy`). A second add for that day answers "already added" unless the request says `again: true`. The plan shows a quiet "On the list" marker. Two people pressing at the same moment can still both add. That is accepted, and removing the extras by hand is the stated way to fix it.
- The write record stores ids and counts only, never the lines.
- The stores gain a 100-operation guard and a contract test, so this class of failure shows up locally.

### 4. The merge rule needs exact definitions (blocker, readiness and design lenses)

"Ignoring case and plurals" and "units of the same kind" fail on `leaves`, `tomatoes`, `asparagus`, "tin of tomatoes", and on `g` against `kg`. A wrong merge is invisible and costs a missing ingredient in the middle of cooking. A missed merge shows as two lines and costs nothing.

*Decision:* Merge conservatively.
- A fixed unit list with aliases (g, kg, ml, l, tsp, tbsp, cup, tin, pack, clove, bunch, pinch, slice). Two amounts merge only when the unit is the same canonical unit. `g` and `kg` stay separate lines. No conversion, and no switching 1000 g to 1 kg.
- Names match after lower-casing, trimming, removing punctuation and singularising with a small rule set and an allow-list of exceptions. "Red onion" and "onion" are different names.
- A line with no readable amount ("to taste", "a handful") never scales and never merges.
- Amounts are summed first and rounded last. Counts round to the nearest half, grams and millilitres to the nearest whole number, spoons and cups to the nearest quarter, and show as ½, ¼ and ¾.
- The review list shows how a merged line was made ("2 + 1").
- One pure module in `src/shared/` does all of this, used by the review screen, the optimistic overlay and the server's validation, with a table-driven test file of worked examples.

### 5. Typing recipes is the biggest reason people will quit (blocker, comprehension lens)

A Hello Fresh card has 8 to 12 ingredients and about six steps. Three separate fields per ingredient on a phone keyboard is minutes of work per recipe, and the plan is empty until recipes exist.

*Decision:*
- A recipe saves with only a name.
- Ingredients and steps accept a pasted block (one line each). This is paste, not URL import.
- Each ingredient is one text line, parsed into amount, unit and name, and the parse is shown under the line so it can be corrected. A line that cannot be read is kept as typed, with no amount.
- A day in the plan may be a plain name with no recipe, so the plan is useful on day one.
- A half-typed recipe is kept as a draft on the device until saved.
- "Duplicate recipe" exists.

### 6. The 5pm moment is not designed yet (blocker, comprehension lens)

The goal is to not decide at 5pm. Navigating to the plan, finding today and opening the recipe is four steps at the time of least capacity.

*Decision:* The home screen gets a "Tonight" card at the top: the dinner, its minutes and low-energy mark, one tap into the cooking view. With nothing planned it reads "Nothing planned yet" with a "Pick something easy" button that shows three recipes.

### 7. Cooking-view ticks: shared or local (major, four lenses)

A shared tick list needs reset rules and a new write path, and last week's ticks would pre-tick tonight's list.

*Decision:* Device-only. Saved in `localStorage` per recipe and local date, with a "Start again" button. Steps are not scaled, and the view says which servings they were written for.

### 8. What a plan day points at (major, design, codebase and structural lenses)

If a plan day only holds a recipe id, deleting a recipe leaves a broken day at 5pm, and editing a recipe changes both phones' plans.

*Decision:* A plan day holds the recipe id, a copy of the recipe's title and the planned servings. The screen shows the live title while the recipe exists and the copy after it is deleted. Opening a deleted recipe says "This recipe was deleted" and offers restore from the recycle bin. Shopping lines copy their data and never link to a recipe.

### 9. Two people editing at once (major, design and readiness lenses)

The codebase resolves conflicts per field by timestamp. Lists of ingredients and steps are awkward for that.

*Decision:* Per-field last-writer-wins on `title`, `mealType`, `servings`, `minutes`, `lowEnergy`, `nutrition`, `ingredients` and `steps`, with `ingredients` and `steps` each one field replaced as a whole. Two people editing different steps of one recipe at the same moment lose one edit. That is accepted, because shared recipe editing is rare, and the screen shows who last changed a recipe and a plan day. A plan day is one `meal` field, replaced as a whole, with no tombstone: clearing a day removes the `meal` attribute so the day can be planned again. Recipes use the 30-day recycle bin and the restore route gains `recipe`. Both people edit recipes and the plan directly, with no proposals.

### 10. Existing code that new item types break (major, codebase lens)

- `moveOptions` in `src/household/invites.ts` counts only tasks and items, so a person with ten recipes would be treated as having an empty household when they accept an invite elsewhere, and the recipes would be stranded. It must count `RECIPE#` and `PLAN#`.
- The mutation registry is two closed sets. Recipe, plan and add-to-list writes need their own key sets, runners, overlays and `onSettled` invalidation, or they are lost on reload. Mutation key names are never renamed once shipped.
- The service worker never calls `skipWaiting`, so an old client can talk to a newer server for days. The server keeps accepting every old body shape, and new fields are optional.
- Offline reading relies on the persisted query cache with a 7-day limit, not the service worker. A phone unopened for eight days shows nothing offline. This is stated as a known limit.
- The cache schema version does not change, because every change is additive.

### 11. Cost and payload (major, design lens)

Phase 1 polls the task and item lists every 10 seconds. A library of 100 recipes at 3 to 5 KB is 300 to 500 KB. Recipes are not polled. They load on app open and on focus, are kept fresh for five minutes, and refetch after the person's own writes. Only the plan and the shopping list keep the 10-second poll. Limits: 300 recipes per household, 40 ingredients, 40 steps, 500 characters per step.

### 12. Scope creep (major, zoom-out lens)

The zoom-out lens argued that structured amounts with merging, scaling, a nutrition field, tags, breakfast and lunch recipes and a cooking view are far more than retiring the whiteboard needs, and proposed free-text ingredients with no merging as the first version. The author explicitly asked for merging with sums, scaling, nutrition and breakfast and lunch recipes, so they stay in. The lens's points are taken as staging: the work is split into six slices so the whiteboard can be retired after the plan and add-to-list slices, and the rest can be dropped if it proves unnecessary. Where the lens found a cheaper form of a requested feature, the cheaper form is used: ingredient lines are typed as one line of text, tags are one boolean and one number, nutrition is one free-text note, and merging is limited to the add action.

### 13. Wording and usability for the audience (major, comprehension lens)

- Fixed words: "recipe" for a library entry, "dinner" for a plan slot. No "missing", "forgot", "skipped" or "incomplete".
- Empty states read "Nothing planned yet". No red, in line with `docs/brand.md`.
- Changing a planned dinner whose ingredients are on the list says, once and plainly, "These are already on your shopping list. Changing the dinner won't change the list."
- The review list defaults to every line being added, with ticking meaning "I already have this". A line shows its sources.
- Cooking view: large tap targets, the screen kept awake while it is open, and ticks kept when the phone sleeps.
- "Pick something easy" shows three recipes at random. It never scores, ranks or says anything about how long ago a recipe was cooked.
- A recipe has no "free tags". Only `lowEnergy` and `minutes`.

### 14. Observability (minor, codebase lens)

Each add logs the household id, the mutation id, and the counts of lines created and skipped. No recipe text is logged. The client reports "N of M added" from the per-line results. Error logs include the recipe id or plan day key.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  - A shared recipe library with breakfast, lunch and dinner recipes, typed once, readable offline.
  - A dinner-only week plan visible to both people, with "Tonight" on the home screen.
  - A cooking view with a tick-through ingredient list and steps.
  - Scaling a recipe to a number of servings.
  - Adding a planned dinner, or the week, to the shopping list with merged, scaled lines labelled by recipe, after a review where the person ticks what they already have.
  - "Pick something easy" using `lowEnergy` and `minutes`.
  - A recycle bin for recipes.
* **Out-of-Scope Non-Goals:**
  - Leftovers and cook-once-eat-twice, sharing recipes outside the household, photos on recipes, importing recipes from URLs or photos, pantry or stock tracking, computing nutrition (a typed note is allowed), a second dinner per day, and a plan that rewrites the shopping list.
  - Merging into lines already on the list.
  - Unit conversion.
  - Shared cooking-view ticks.
  - New automatic notifications. Existing opt-in "Let them know" may be ticked on plan and list changes.
  - Planning breakfast and lunch.
  - Free-form tags, a "staple, never add" ingredient flag, and search by ingredient. These can follow if the library grows.

## Alternatives Weighed

- **Free-text ingredient lines with no structure and no merging** (zoom-out lens). Rejected by author: the author asked for merged sums and scaling, which need amounts and units. Partly adopted: the typed form is one line of text.
- **Three fields per ingredient (amount, unit, name).** Rejected by Claude: it is the slowest way to enter a recipe on a phone, and entry effort is the main abandonment risk.
- **Merge into lines already on the list.** Rejected by Claude: it is a read-modify-write on a last-writer-wins field. A replay double-counts, a stale phone overwrites a concurrent edit, and it contradicts "the list never changes itself".
- **Store structured amount, unit and name on the shopping item.** Rejected by Claude: it is only needed to merge into existing lines, which is rejected, and every new field must be added to five places or it is deleted silently.
- **Server computes the merge.** Rejected by Claude: the review step and the optimistic list need the lines offline, and two implementations would flicker when the poll arrives. One shared pure module is used instead.
- **Reuse the existing batch route for the add.** Rejected by Claude: it has no "already added" check and its retry record is separate from its writes. A new route reuses its per-line create pattern with the plan marker added.
- **Pantry inventory.** Rejected by author: upkeep is the main reason such tools are abandoned. The point-of-use tick replaces it.
- **Plan day as a snapshot of the whole recipe.** Rejected by Claude: two copies of the truth. Only the title is copied.
- **Plan day as a link only.** Rejected by Claude: a deleted recipe leaves a blank day at 5pm.
- **Shared cooking ticks.** Rejected by Claude: it needs reset rules and a new write path for one person's session in a kitchen.
- **Free-form tags.** Rejected by Claude: naming decisions slow entry and make filtering unreliable.
- **Merging "g" with "kg" by conversion.** Rejected by author ("never guess a conversion").
- **Planning approvals through the phase 1 proposal model.** Rejected by Claude: a recipe box and a plan are shared by both people equally, and a proposal adds a step with no benefit.

## Key Decisions & Staging for Next Steps

Decisions made with the author: pantry replaced by a point-of-use tick; recipes typed once by hand; dinner-only plan; library for all meal types; scaling; manual nutrition; low-energy and time tags; cooking view; merging with sums and recipe names; the list never changes itself after the add; leftovers, sharing and photos excluded.

Decisions made by Claude while the author was away, each reversible: everything in the Analysis marked "Decision", chiefly merge only inside an add, `forRecipes` as one string, a new add route with an "already added" marker, device-local cooking ticks, the plan-day shape, the conservative merge and rounding rules, the "Tonight" card, and the six slices below.

Staging, one pull request each, like phase 1:

1. **Foundation.** Types, validators, the parse/scale/merge module with tests, recipe keys and routes, store 100-operation guard, `moveOptions` fix.
2. **Recipe library.** Create, edit (name-only allowed, paste blocks, draft, duplicate), delete, recycle bin and restore, filters, offline.
3. **Week plan.** Plan routes, week view, "Tonight" card, "Pick something easy", offline.
4. **Cooking view.** Recipe view, servings, local ticks.
5. **Add to list.** `forRecipes`, the add route, the review list, the plan marker, the overlay.
6. **Finish.** Wording test, accessibility, docs, the manual checks, the roadmap and `CLAUDE.md`.

Slices 3 and 4 can be built in either order. The whiteboard can be retired after slice 5.

Next: `/egm-draft` ingests this brief.

## Changes made while drafting the design

The design in [`phase-2-meal-plan.md`](phase-2-meal-plan.md) supersedes this brief where they differ. The reviews of the first draft changed these decisions:

- **Ingredients and steps are stored as plain text lines.** The amount, unit and name are read from the text whenever it is shown. Nothing parsed is stored.
- **No server check for adding a day twice.** The "On the list" marker on a plan day is display only. The `again` flag and the `already_added` and `plan_changed` answers are gone.
- **The 100-operation store limit is not part of phase 2.** No transaction in the design is large. It is listed under Future Improvements.
- **A plan day stores its servings when it is set**, so a later edit of the recipe's servings does not rescale it.
- **A deleted recipe on a plan day** keeps the day's title. The day cannot be cooked from or added once the recipe is purged.
- **The review shows a hint** when an open shopping item has the same name as a line about to be added.
- **Recipes are not polled.** The other phone sees a new recipe the next time it is opened or brought to the front.
