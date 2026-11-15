# Hearthwise: Phase 2 (Meal Plan)

*   **Author:** kingchappers
*   **Status:** Draft
*   **Date:** 2026-11-14

--------------------------------------------------------------------------------

## Overview

Phase 1 ([`phase-1-foundation.md`](phase-1-foundation.md)) built a shared household app for two adults: chores, to-dos and a shopping list, with one set of data and a view for each person. It is installed on both phones as a web app (PWA) and keeps working offline. Phase 2 adds the roadmap item "meal plan feeding the shopping list" ([`docs/ROADMAP.md`](../ROADMAP.md)). It has four parts:

1.  **Recipes.** A shared library of breakfast, lunch and dinner recipes. Each is typed in once, and can be saved with only a name.
2.  **Week plan.** One dinner per day, Monday to Sunday, visible on both phones. The Today page opens with a "Tonight" card.
3.  **Cooking view.** A recipe's ingredients as a tick-through list ("get everything out") and its steps as a list, with the servings adjustable.
4.  **Add to shopping list.** Planned dinners become shopping lines. Amounts are scaled to the planned servings. Matching ingredients inside that one add are merged into a sum. Each line is labelled with its recipe names. A review step lets the person mark the ingredients they already have, and those are left off.

Phase 1's data and code are reused with small extensions. Recipes and plan days are new record types in the same single table. The shopping list gains one optional field, `forRecipes`. The offline write queue, the write record, the household guard and the notification path are used as they are, apart from the registration loop, which is generalised once to cover a third set of writes.

### How this design was made

The author made the product decisions in conversation. Independent reviewers then checked a brief ([`phase-2-concepts-brief.md`](phase-2-concepts-brief.md)) and this design against the code. The author was away while the findings were resolved, so Claude (the AI assistant that drafted the design) marked every decision beyond the author's own words as **Claude** in the decisions table. The author can reverse any of them. "Open Questions" lists the ones to look at first.

### Terms used below

| Term | Meaning |
|---|---|
| CUJ | Critical user journey: one end-to-end scenario, in the section of that name. |
| Recipe | One entry in the recipe library. |
| Plan day | One date in the week plan. Its `meal` field holds the dinner planned for that date. |
| Dinner | What is planned on a plan day: a recipe, or a plain name such as "Takeaway". A "dinner recipe" is a recipe whose `mealType` is dinner. |
| Ingredient line | One typed row in a recipe's ingredients, such as "2 onions". |
| Shopping line | One entry on the shopping list. It is stored as a shopping item. |
| Review line | One merged row in the add-to-list review. Adding turns each review line that is not marked "I have this" into a shopping line. |
| Household guard | `withHousehold` wraps every household route. It reads the caller's membership and supplies the household id, which never comes from the request. |
| Write record | Every write carries a client-made `mutationId`. The server stores a `MUT#<id>` record in the same transaction as the write, so a retry is answered from the record and writes nothing (`src/api/writeRecord.ts`). |
| Mutation queue | The app saves every household write to IndexedDB and sends it when online. Writes are registered once, by key, in `app/lib/mutations.ts`, and run one at a time, in order (the `household` scope). |
| Overlay | A pure client function that lays the pending queued writes over the cached data, so a change shows before the server confirms it. |
| Per-field last-writer-wins | Each field has the client time it was last set (`fieldTimes`). A write to a field applies only if its time is newer than the stored one. |
| Tombstone and recycle bin | A delete marks the record (`deletedAt`) instead of removing it. It stays for 30 days, can be restored from the Deleted page, and is then purged. |
| Persisted cache | The query cache saved in IndexedDB per person, kept for seven days. It is why lists show with no signal. |
| "Let them know" | The existing opt-in tick that sends the other person a push notification about a change. It is off unless the person ticks it, and it resets when they leave the page. |
| On-the-list marker | The `addedAt` and `addedBy` fields on a plan day, shown as "On the list". |
| `CLAUDE.md` | The project's guide for the coding assistant. Step 6 updates it. |

## The Problem

The household plans dinners on a whiteboard with the days of the week and builds the shopping list from it. Three things do not work:

*   **You have to be at the whiteboard to know what is on it.** Neither person can check the plan from the shop, and the plan cannot be shared.
*   **The shopping list is not built from the plan.** Whoever plans a meal has to know which ingredients the recipe needs and which of them the household already has.
*   **Cooking asks for memory.** There is no checklist to get the ingredients out together, and the steps live on a card or in someone's head.

Both people are autistic, have ADHD, or both. The author named three hard parts: deciding what to eat, remembering which night is which meal, and remembering a recipe's steps. A plan decided in advance and visible on the phone covers the first two at about 5pm, when they come up. A cooking view covers the third. The design also has to avoid creating new work. Typing recipes, keeping an inventory and tidying a list that rewrites itself are things people with these conditions often abandon, so none of them is asked for.

## Goals

*   **G1. See the plan anywhere.** Both phones show the week's dinners, readable with no signal. The Today page opens with "Tonight" and one tap into its recipe.
*   **G2. Type a recipe once, quickly.** A recipe saves with only a name. Ingredients and steps accept a pasted block, one per line. A half-typed recipe survives the phone going to sleep.
*   **G3. Cook from the phone.** A tick-through ingredient list and a list of steps, with servings that can be changed, ticks that survive a locked screen, and the screen kept awake.
*   **G4. Turn a plan into a list without upkeep.** Adding dinners to the shopping list scales and merges ingredients, shows where each line came from, lets the person mark what they already have, and does not change the list again afterwards.
*   **G5. Help with "what shall we eat?"** The author asked for options that take low energy and about 20 minutes. Recipes can be marked low energy and given a time in minutes, and a "Pick something easy" button shows up to three at random.
*   **G6. No surprises.** The plan does not write to the shopping list after an add. A recipe edit does not change a list that was already built. Nothing sends a notification unless a person ticks "Let them know".

Supporting behaviours: the recipe recycle bin and restore (CUJ 9), conflict handling for two people (CUJ 10 and 12), and the household-move check (see "Moving households"), which protects recipes a person has typed, serve G1, G2 and G6.

**Success measure.** After a month the whiteboard is gone and neither person has to decide at 5pm what to eat. This is a self-check written into `docs/MANUAL-CHECKS.md` in step 6. The app does not measure it. The household can start using the plan and stop using the whiteboard once step 5 of the Detailed Implementation Plan is released. Step 6 holds the checks that must pass before phase 2 is called done.

## Non-Goals

*   Leftovers and cook-once-eat-twice.
*   Sharing recipes outside the household, photos on recipes, importing recipes from URLs or photos. Pasting text into a recipe is supported. Importing is not.
*   Pantry or stock tracking. The "I have this" mark at the time of adding replaces it.
*   Computing nutrition. A recipe has one optional free-text note, shown per serving and never scaled.
*   More than one dinner per day, and breakfast or lunch slots in the plan. Breakfast and lunch recipes exist in the library. A person can still choose any recipe, including a breakfast or lunch recipe, as a day's dinner with "Show all recipes".
*   Merging into a shopping line that is already on the list, converting units, and changing the list when the plan changes.
*   Shared cooking-view ticks. They stay on one device.
*   New automatic notifications. The existing opt-in "Let them know" tick appears on the day sheet and on the add review, and applies to plan changes and to adding to the list.
*   Free-form tags, searching by ingredient, and a "staple, never add" flag on an ingredient.
*   Proposals for recipes or plan days. Both people edit them directly.

## Open Questions

Decisions the author has not yet reviewed, listed roughly by the cost of changing each, highest first.

*   **No server check for adding the same dinner twice.** The "On the list" marker and the review's defaults prevent it in normal use. Two people adding at the same moment can both add, and the extras are deleted by hand. A server check would need two new error codes and still miss that case.
*   **Two onion lines.** Adding never merges into a shopping line already on the list, so a hand-typed "onions" and an added "onions, 3" sit side by side. The review shows a hint so it is visible. Merging into the existing line would need a new server operation.
*   **Rounding up.** Shopping amounts round up to the next step for their unit, so 2.2 onions becomes 2½, to avoid under-buying. The cooking view rounds to the nearest step.
*   **Five tabs.** Today, Plan, Recipes, Shopping, Settings. At 360 px wide each tab is 72 px, and the existing test requires at least 44 px. If five feels crowded, Recipes moves under Plan.
*   **Which name does a merged line use?** The name from the first recipe that listed it ("onions", quantity "3"). A different rule is a one-line change in `buildLines`.

## Critical User Journeys (CUJs)

### CUJ 1: Typing a recipe once

*   **Given**: A household with no recipes. A person has a Hello Fresh card.
*   **When**: They open Recipes, tap "New recipe", type a name and save. Later they open it, paste the ingredients (one per line) and the steps, and save.
*   **Then**:
    - After the first save the recipe is in the library with no ingredients.
    - After the second save each ingredient line shows beneath it as the app reads it. "2 onions" shows as amount 2, no unit, name "onions". "200 g flour" shows as amount 200, unit g, name "flour". A line the app cannot read ("salt to taste") is kept as typed, with no amount.
    - Bullets and numbers at the start of pasted lines are removed, and a paste over the limits is refused with a plain message that keeps the text.
    - The other phone shows the recipe the next time the app is opened or brought to the front, because recipes are not polled.
    - If the first person's phone sleeps halfway through typing, the half-typed recipe is there when they return.

### CUJ 2: Planning the week

*   **Given**: Six recipes exist. It is Sunday evening.
*   **When**: A person opens Plan, taps tomorrow (Monday) and picks a recipe. The servings start at the recipe's own number. They type "Takeaway" for Friday with no recipe.
*   **Then**: Monday shows the recipe's title and Friday shows "Takeaway". Both appear on the other phone within 15 seconds. Days with nothing planned read "Nothing planned yet". Opening Plan with no signal shows the last copy this phone saved.

### CUJ 3: Tonight, at 5pm

*   **Given**: Today's dinner is planned.
*   **When**: A person opens the app.
*   **Then**: The top of Today is a "Tonight" card with the dinner's name, its minutes and a low-energy mark if it has them. One tap opens the cooking view. If nothing is planned, the card reads "Nothing planned yet" and has a "Pick something easy" button (CUJ 8).

### CUJ 4: Cooking

*   **Given**: A recipe written for 2 servings, planned for 4.
*   **When**: The person opens it from the Tonight card.
*   **Then**:
    - The view opens at 4 servings with every amount doubled, rounded to the nearest step for its unit. A line that cannot be scaled shows "Not scaled".
    - Ingredients can be ticked as they come out, and steps as they are done.
    - The screen stays awake while the page is open, and again after the phone is unlocked.
    - If the phone locks and is opened again, the ticks are still there.
    - A note says "Steps are written for 2 servings", because step text is not scaled.
    - "Start again" clears the ticks and puts the servings back to the planned number. The ticks are also cleared at 4am, so cooking past midnight keeps them.

### CUJ 5: Adding the week to the list

*   **Given**: Monday's chilli (2 onions) and Wednesday's pasta bake (1 onion and 400 g tomatoes) are planned. The shopping list already has "onions", typed by hand.
*   **When**: The person taps "Add to shopping list" on Plan, leaves both days included, and marks the tomatoes "I have this".
*   **Then**:
    - The review shows "onions, 3", with "2 + 1 from Chilli, Pasta bake" and the hint "You already have onions on the list". The tomatoes row is struck through and says "Not adding".
    - Tapping "Add 1 line" creates one shopping line "onions", quantity "3", labelled "for Chilli, Pasta bake". The hand-typed "onions" is untouched, so the list has two onion lines.
    - The tomatoes are not added. Monday and Wednesday show "On the list". Nothing else on the list changes.
    - Tapping the button twice, or the sheet redrawing, does not add the lines twice.

### CUJ 6: Adding the same dinner twice

*   **Given**: Monday's dinner is already on the list.
*   **When**: Either person opens "Add to shopping list".
*   **Then**: The review leaves Monday off with "On the list". If the person includes it, it is added again, as they chose. If both people add Monday at the same moment, both adds land and the list has the lines twice. Either person can delete the extra lines, and the recycle bin restores a line deleted by mistake.

### CUJ 7: In the shop, no signal

*   **Given**: Both phones were opened in the last seven days.
*   **When**: One person opens Shopping, Plan and a recipe with the network off.
*   **Then**: All three show the last saved data. Ticking shopping lines, editing a recipe and changing a plan day are saved on the phone and sent once when the signal returns. A phone not opened for more than seven days shows nothing offline until it is online again.

### CUJ 8: Picking something easy

*   **Given**: Nothing is planned tonight. Four dinner recipes are marked low energy, and two of them take 20 minutes or less.
*   **When**: The person taps "Pick something easy" and chooses "Up to 20 min". Choosing a time is optional.
*   **Then**: The two matching recipes show. With no time chosen, three of the four show at random, and "Shuffle" picks three again from the same four, so a recipe can repeat. Tapping one opens it with a "Make this tonight" button that plans it. The design stores no cooking history, so nothing says when a recipe was last cooked.

### CUJ 9: Deleting and restoring a recipe

*   **Given**: A recipe is planned for Thursday.
*   **When**: A person deletes it, then looks at Thursday.
*   **Then**:
    - Thursday still shows the recipe's name, from the copy kept on the plan day.
    - Opening it shows the recipe read-only with "This recipe was deleted" and a Restore button. The Deleted page lists the 50 most recently deleted recipes from the last 30 days, and a recipe outside those 50 cannot be restored from the app.
    - After that the recipe is purged. Opening the day says "This recipe is gone", and the plan day behaves as a plain-name day. It cannot be cooked from or added to the list, and the person can pick another recipe for it.
    - A day is only called "gone" after the app has fetched the recipe list and the recipe is not in it. Until then it shows "Checking the recipe…".

### CUJ 10: Two people change the same day

*   **Given**: Both phones show Tuesday as "Chilli".
*   **When**: Person A sets Tuesday to "Curry" at 18:00. Person B, offline at the time, sets it to "Soup" at 18:05 and reconnects later.
*   **Then**: The write with the later client time (B's, 18:05) wins, as with every other field, and both phones settle on it within 15 seconds. The day shows "Last changed by" the person who made it. No error is shown.

### CUJ 11: Changing the dinner after adding it

*   **Given**: Wednesday's dinner is on the list.
*   **When**: A person changes Wednesday to a different recipe, or changes only its servings.
*   **Then**: Each time the picker opens for a day that is on the list, it says "These ingredients are already on your shopping list. Changing the dinner won't change the list." The list is not touched. Wednesday's "On the list" marker goes away, because it no longer describes the day, so the new dinner or servings can be added.

### CUJ 12: Two people edit the same recipe

*   **Given**: Both phones have the same recipe open for editing.
*   **When**: Person A changes step 2 and saves. Person B, who had not seen that, changes step 5 and saves a little later.
*   **Then**: B's save, which has the later client time, replaces the whole steps list, so A's change to step 2 is gone. The recipe shows "Last changed by" B. A save sends only the fields the person changed, so a title-only save does not touch the steps. The design accepts this loss. Recipes are edited rarely and by one person at a time. Alternatives K and Q explain why a per-line merge and a refusal of out-of-date saves were rejected.

## Technical Plan (Architecture)

### Decisions this plan rests on

| Decision | Choice | Decided by |
|---|---|---|
| Know what the household already has | A mark at the time of adding ("I have this"). No inventory. | Author |
| Recipe entry | Typed once by hand. No URL or photo import. | Author |
| Recipe library | Breakfast, lunch and dinner recipes. The plan is dinner only. | Author |
| Scaling and nutrition | Scale by servings. Nutrition is an optional hand-typed note. | Author |
| Tags | `lowEnergy` (yes or no) and `minutes` (a number) | Author (low-energy and 20-minute options); Claude (the shape) |
| Merging | Same name and same unit are summed. Never converted. Each line shows its recipe names. | Author |
| After the add | The list does not change itself, and a plan change does not touch it. | Author |
| Excluded | Leftovers, sharing, photos, pantry, nutrition computing | Author |
| Merge scope | Inside one add only. Never into a shopping line already on the list. | Claude |
| Shopping-line label | One optional string, `forRecipes`, set at creation and never edited. | Claude |
| Ingredients and steps | Stored as plain text lines. The amount, unit and name are read from the text whenever it is shown. | Claude |
| Merge, rounding and plural rules | See "Scaling, rounding and merging". Shopping amounts round up. | Claude |
| Add route | A new route that creates the shopping lines and marks the plan days. Not the existing batch route. | Claude |
| Double-add protection | A display-only marker on each plan day, cleared when its `meal` changes. No server check. | Claude |
| Plan day shape | One `meal` field replaced as a whole: recipe id, a copy of the title, and the servings fixed when the day was set. | Claude |
| Recipe conflicts | Per-field last-writer-wins. A save sends only changed fields. `ingredients` and `steps` are each one whole field. | Claude |
| Recipe list size | Whole recipes in one list, with limits that keep it to about 3 MB. Not polled, refetched on every focus. | Claude |
| Recipe recycle bin | 30 days. Restore through the existing restore route with a new kind. | Claude |
| Cooking ticks | On the device only, per person, recipe and day, by line position. | Claude |
| "Tonight" and "Pick something easy" | A card on Today and a shortlist of up to three. | Claude |
| Notifications | None new. "Let them know" can be ticked on plan changes and on the add. | Claude |
| Cache version | `CACHE_SCHEMA_VERSION` stays 1. Every change is additive. | Claude |
| Who edits | Both people, directly. | Claude |
| Staging | Six pull requests (see "Detailed Implementation Plan"). | Claude |

### Components

```text
 ┌────────────────────────────────────────────────────────────────────┐
 │ Phone: the installed PWA                                           │
 │  Today ► Tonight card        Plan ► week, day sheet, add review    │
 │  Recipes ► library, editor   Recipe ► cooking view (local ticks)   │
 │  Pure modules in src/shared/ (also imported by the server):        │
 │    ingredients.ts   read a line, units, names, amount formatting   │
 │    shoppingLines.ts scale, merge, round, build review lines        │
 │  Query cache (IndexedDB): recipes, plan, items, tasks              │
 │  Mutation queue (IndexedDB, scope "household")                     │
 └───────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS + Bearer token
                                 ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │ API Lambda / container: household guard ► routes (src/api/meals.ts)│
 │ Domain: src/meals/ (keys, types, applyRecipe, recipes, plan,       │
 │         addToList)                                                 │
 └───────────────────────────────┬────────────────────────────────────┘
                                 │ Store (get, put, query, transact)
                                 ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │ DynamoDB / SQLite single table:                                    │
 │   HH#<hid> RECIPE#<id>   HH#<hid> PLAN#<yyyy-mm-dd>                │
 │   HH#<hid> ITEM#<id> (gains forRecipes)   HH#<hid> MUT#<id>        │
 └────────────────────────────────────────────────────────────────────┘
```

**Dependencies run one way:**

*   The recipe domain knows nothing about the plan or the list.
*   The plan holds a recipe id, a copy of its title and a servings number. It also stores a display-only "added to the list" marker, written by `addToList`. It never reads shopping items.
*   The cooking view reads a recipe and owns local ticks only.
*   `addToList` is the only code that reads recipes and plan days and writes shopping items. It sits on top of the pure `shoppingLines` module.
*   The shopping domain gains one optional field and imports nothing from recipes or plans.

### API routes (phase 2)

| Method and path | Purpose |
|---|---|
| `GET /api/hh/recipes` | List recipes and recent tombstones |
| `PUT /api/hh/recipes/{id}` | Create or change a recipe |
| `DELETE /api/hh/recipes/{id}` | Delete (tombstone) |
| `GET /api/hh/plan?from=` | List plan days |
| `PUT /api/hh/plan/{day}` | Set or clear a day |
| `POST /api/hh/plan/add-to-list` | Create shopping lines, mark days |
| `POST /api/hh/restore` | Gains `{ kind: 'recipe' }` |

Every route is wrapped in `withHousehold` and `guarded`, and is validated by `src/shared/mealValidation.ts` against the limits below. Unknown request keys are rejected.

### Data model additions (single table)

A plan day is a local calendar date (`YYYY-MM-DD`) in the household's time zone. The time zone is a setting stored on the household when it is created. `dayInZone` (in `src/shared/schedule.ts`) turns an instant into a date there, as for task dates. The week starts on Monday.

| Item | PK | SK | Key attributes |
|---|---|---|---|
| Recipe | `HH#<hid>` | `RECIPE#<id>` | `title`, `mealType`, `servings`, `minutes`, `lowEnergy`, `nutrition`, `ingredients`, `steps`, `fieldTimes`, `createdBy`, `updatedAt`, `updatedBy`, `deletedAt`, `deletedBy`, `expiresAt` |
| Plan day | `HH#<hid>` | `PLAN#<yyyy-mm-dd>` | `meal`, `fieldTimes`, `addedAt`, `addedBy`, `updatedAt`, `updatedBy`, `expiresAt` |
| Shopping item | `HH#<hid>` | `ITEM#<id>` | the existing attributes, plus optional `forRecipes` |

**Recipe fields**

*   `title`: 1 to 120 characters.
*   `mealType`: `breakfast`, `lunch` or `dinner`. A new recipe is `dinner` unless it says otherwise.
*   `servings`: a whole number from 1 to 50. A new recipe has 2.
*   `minutes`: an optional whole number from 1 to 600, left out when not set.
*   `lowEnergy`: a boolean. A new recipe has `false`.
*   `nutrition`: optional text of up to 300 characters, labelled "per serving" on screen.
*   `ingredients`: up to 30 text lines, each up to 120 characters, stored as typed ("2 onions"). `parseIngredientLine` reads the amount, unit and name whenever a recipe is shown or scaled. The server stores no parsed values, so a better reader improves every saved recipe.
*   `steps`: up to 30 text lines, each up to 300 characters.
*   `fieldTimes`: the client time each of `title`, `mealType`, `servings`, `minutes`, `lowEnergy`, `nutrition`, `ingredients` and `steps` was last set.
*   `updatedBy`: the user id of the last writer, shown as "Last changed by" with their name.
*   A deleted recipe is tombstoned in place, with a 30-day `expiresAt`.

**Plan day fields**

*   `meal` is `{ recipeId?, title, servings? }`, replaced as a whole.
*   `title` is 1 to 120 characters. It is a copy of the recipe's title, or the plain name typed ("Takeaway").
*   `servings` is a whole number from 1 to 50. It is present only when `recipeId` is. It starts as the recipe's own servings unless the person changes it, and it is fixed when the day is set, so a later edit to the recipe's servings does not rescale a planned day.
*   Clearing a day removes `meal` and keeps `fieldTimes.meal`, so a slower, older write cannot bring the old meal back. A plan day is never tombstoned, so a cleared day can be planned again.
*   `addedAt` and `addedBy` say the day's dinner was added to the list. They are display only. Any write that changes `meal` (a different dinner, different servings, or a clear) removes both, and the update changes `updatedAt` as every plan write does.
*   `expiresAt` is the day's date plus 60 days, in epoch seconds.

**Other rules**

*   A recipe id is a client-made UUID, as shopping item ids are, so offline creates replay safely. A plan day's id is its date.
*   An attribute that is not set is left out, never stored as `null`.
*   `recipeKey` and `planKey` are created in step 1 in `src/meals/keys.ts`. `src/tasks/keys.ts` stays for tasks, and the write record's `mutKey` stays where it is.

### Limits

| Thing | Limit |
|---|---|
| Recipes per household | 200 |
| Ingredient lines per recipe | 30, each up to 120 characters |
| Step lines per recipe | 30, each up to 300 characters |
| Title (recipe or plan meal) | 120 characters |
| Nutrition note | 300 characters |
| Servings | 1 to 50 |
| Minutes | 1 to 600 |
| `forRecipes` on a shopping line | 200 characters |
| Lines in one add | 100 |
| Days in one add | 35 |
| Plan days a person can set | from 14 days before today to 60 days after |
| Largest stored recipe | about 13 KB of text (30 × 120 + 30 × 300 + 120 + 300 characters). DynamoDB's item limit is 400 KB. |
| Deleted recipes in the list | The 50 most recently deleted. Older deleted recipes stay in the table until their 30 days end, but are not listed and cannot be restored from the app. |
| Largest recipe list | 200 live and 50 deleted recipes, about 3.3 MB of text in the worst case. A typical recipe is 3 to 5 KB. Lambda's response limit is 6 MB. |

Breaching a limit returns 400 naming the field, except the recipe limit, which returns 409 `recipe_limit` (see "Recipes: routes, writes and conflicts"). The editor checks the same limits before it queues a save (see "Views").

### Scaling, rounding and merging

Two pure modules in `src/shared/` hold this logic. They use no React and no store access. The client uses them for the review, the list as it shows before the server confirms, and the cooking view. The client computes the shopping lines. The server validates and stores them, using the same limits for `quantity` and `forRecipes`. Spelling lists, the singularising rules and the full case tables live in the code and its table-driven tests (step 1), not here.

#### Reading an ingredient line

`parseIngredientLine(text)` returns `{ name, note?, amount?, unit? }`:

*   **Amount.** A whole number, a decimal (`1.5`, or `1,5` when one or two digits follow the comma), a number with a thousands comma (`1,500` is 1500), a fraction (`1/2`), a mixed number (`1 1/2`), or `½ ¼ ¾ ⅓ ⅔`. "A" or "an" counts as 1, but only when a unit follows ("a tin of tomatoes", "a pinch of salt"). A range such as `2-3`, or an amount of 0, is not read as an amount.
*   **Unit.** Matched in any case, spaced or glued to the number (`200g`, `200 G`), with an optional "of" after it.
*   **Name and note.** The name is the text up to the first comma. The text after the comma is the note ("1 onion, diced" has name "onion" and note "diced"). Only the name is used to merge and to label a shopping line.
*   **No readable amount.** The whole line is the name, with no amount, unit or note. It is not scaled or summed.
*   **Count.** An amount with no known unit is a count ("2 onions"). A word that is not a unit is part of the name ("2 large onions" is amount 2, name "large onions").

The units are `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, `tin`, `pack`, `clove`, `bunch`, `pinch` and `slice`. Each also accepts its common spellings and plurals (for example "grams", "tablespoons", "can" for `tin`, "packet" for `pack`), and the app shows the unit in the form listed here.

Examples: `2 onions` is amount 2, no unit, name `onions`. `200 g flour` and `200g flour` are amount 200, unit `g`, name `flour`. `a tin of tomatoes` is 1 `tin` of `tomatoes`. `1 onion, diced` is 1 `onion` with note `diced`. `salt to taste` and `2-3 carrots` have no amount and stay as typed. The full table of cases is the test table in step 1.

#### Names that count as the same

`normaliseName(name)` decides only whether two lines merge. It does four things: it lower-cases and trims the name, removes punctuation except hyphens, makes the last word singular with a small set of rules (a trailing `s`, `ies`, `oes`, `ches`, `shes`, `xes`, and a few irregular forms such as `leaves`), and leaves words such as `asparagus` and `hummus` alone. Words before the last stay as typed, so `red onion` and `onion` are different names.

Cases that must merge: `onion` and `onions`, `tomato` and `tomatoes`, `leaf` and `leaves`, `pea` and `peas`. Cases that must stay apart: `red onion` and `onion`, `chicken breast` and `chicken`, and `asparagus`, `cress` and `hummus` as written. A missed merge costs a second line. A wrong merge costs a missing ingredient. The rule therefore stays small, and any case it does not cover stays apart.

#### Scaling

The factor for a recipe is `planned servings ÷ recipe servings`, where planned servings are those fixed on the plan day. Each ingredient's exact scaled amount is `amount × factor`. A line with no amount is not scaled. When the factor is not 1, the cooking view marks an ingredient line with no amount "Not scaled", and the review marks the review line "Not scaled" too, so an unscaled line is visible.

#### Merging (`src/shared/shoppingLines.ts`)

`buildLines(meals)` takes the planned dinners included in this add, each with its recipe and servings, and returns the review lines:

1.  Scale every ingredient of every included recipe.
2.  Group the lines that have an amount by `normaliseName(name)` and unit (no unit counts as its own value). Lines in a group are summed exactly. Lines with no amount are never grouped: each is its own line.
3.  Round each group's total up (below), after the sum, so rounding does not accumulate.
4.  Give each review line:
    - `text`: for a line with an amount, the name as typed in its first source. For a line with no amount, the full line as typed.
    - `quantity`: the formatted amount and unit, such as `3` or `400 g`, left out for a line with no amount.
    - `forRecipes`: the recipe titles as they are at the time of the add, in order of first appearance, joined with `, ` and cut at 200 characters with `…`.
    - `from`: each source's recipe title and scaled amount, for the review ("2 + 1 from Chilli, Pasta bake"). It is not stored.
5.  A plan day with no recipe, or whose recipe is deleted or purged, contributes nothing.

Two amounts do not merge when their units differ, even for related units: `500 g` and `1 kg` are two lines. Nothing is converted.

| Sources (scaled) | Result lines | Note |
|---|---|---|
| `2 onions` + `1 onion` | `onions`, `3` | "2 + 1" |
| `400 g tomatoes` + `400 g tomatoes` | `tomatoes`, `800 g` | |
| `500 g rice` + `1 kg rice` | two lines | units differ |
| `1 tin tomatoes` + `400 g tomatoes` | two lines | units differ |
| `1 red onion` + `1 onion` | two lines | names differ |
| `salt to taste` + `salt to taste` | two lines | no amount |
| `1 egg` at factor 1.5 | `egg`, quantity `1½` | the amount is 1.5 before formatting |

#### Rounding and showing amounts

A shopping amount is rounded up to the next step for its unit, so the list is never short. An amount already on a step stays as it is, and the arithmetic allows for small floating-point errors. The cooking view rounds to the nearest step instead, because a cook can taste as they go.

| Unit | Step |
|---|---|
| none (a count), `tin`, `pack`, `clove`, `bunch`, `slice` | 0.5 |
| `tsp`, `tbsp`, `cup`, `pinch` | 0.25 |
| `g`, `ml` | 1 |
| `kg`, `l` | 0.05 |

The smallest result is one step, in both rounding modes. Halves and quarters show as `½ ¼ ¾` (`1½`). Whole numbers show whole. `kg` and `l` show with up to two decimal places. Thirds are accepted when typed and are rounded to the step for their unit.

### Recipes: routes, writes and conflicts

*   `GET /api/hh/recipes` returns `{ recipes, serverTime }`: every live recipe and the 50 most recently deleted recipes from the last 30 days, in id order, as `listItems` does for shopping items. It returns whole recipes, because the cooking view can open a deleted recipe read-only.
*   `PUT /api/hh/recipes/{id}` creates or changes a recipe. The body has the fields to set, each with its own `<field>At` client time, plus the standard write fields (`mutationId`, `clientAt`). A recipe write ignores `notify`.
    - **Dirty fields only.** A save sends only the fields the person changed. A title-only save does not send, and so does not overwrite, the steps.
    - **Create.** A put to a missing id creates the recipe. It needs `title` and `titleAt`, and the other fields take their defaults.
    - **Clear.** `minutes: null` clears the time. An empty `nutrition` clears the note.
    - **Conflicts.** A field applies only if its time is newer than the stored one. The server clamps client times more than 5 minutes ahead of its own clock to its own time. A put on a deleted recipe returns 410 and writes nothing.
    - **Response.** `{ recipe }`.
*   **The recipe limit.** Before a create, the route counts the household's live recipes with a query that reads only the sort key and `deletedAt`, and counts the records with no `deletedAt`. A create at 200 returns 409 `recipe_limit`. Two creates at the same moment can reach 201. The design accepts that.
*   `DELETE /api/hh/recipes/{id}` tombstones the recipe (`deletedAt`, `deletedBy`, and `expiresAt` 30 days on). A repeat delete does nothing. A retry is answered from its write record.
*   Restore is `POST /api/hh/restore` with `{ kind: 'recipe', id }` entries. Either person may restore any recipe. A restore is not checked against the 200-recipe limit. The size bound still holds, because a restore turns a listed deleted recipe into a live one, and a create is refused until the live count is below 200 again. It is a conditional update on the `deletedAt` it saw, as `restoreItem` is.
*   Every write reads the write record first (`replayOf`) and then runs through `withWriteRecord`.
*   `ingredients` and `steps` are each one field, replaced as a whole (CUJ 12). The recycle bin restores a deleted recipe. It does not restore overwritten steps.
*   The pure write rule is `src/meals/applyRecipe.ts` (`applyRecipeWrite`, `applyRecipeDelete`). The server and the client's overlay both use it.

### Plan: routes, writes and conflicts

*   `GET /api/hh/plan?from=<day>` returns `{ days, serverTime }`: every plan day from `from` (a real date, default 14 days before today in the household's zone) onwards. A plan day lives at most 60 days past its date and can be set 60 days ahead, so with the default `from` the answer is at most about 75 records.
*   `PUT /api/hh/plan/{day}` sets or clears a day. The body is `{ meal: { recipeId?, title, servings? } | null, mealAt, mutationId, clientAt, notify? }`.
    - **Range.** The day must be a real date from 14 days before to 60 days after the date of `clientAt` in the household's zone, or the answer is 400 `day`. A `day` that is not a real date at all is 404, as below. `clientAt` is optional, and an absent one is the server's time. The window is judged at `clientAt`, so a write made offline and replayed later is not rejected for the time it spent waiting.
    - **Conflicts.** It applies only if `mealAt` is newer than `fieldTimes.meal`.
    - **Writing.** A missing day is created with a write that succeeds only if the day does not exist. An existing day is changed with a conditional update on `updatedAt`, retried up to three times when another write changed it first.
    - **The marker.** Any write that changes `meal` removes `addedAt` and `addedBy`.
*   `recipeId` must be a UUID but is not checked against the recipes. A day may point at a recipe that is later deleted or purged, and the copy of the title is what shows then.
*   The plan routes use `guarded([])`, so a refusal becomes a 4xx and not a 500. The handler answers 404 for a day that is not a real date, because a day is not a UUID.
*   **A recipe that is not in the cache.** `usePlan` starts the check below, so the Plan screen and the Tonight card on Today both get it. A plan day's recipe can be missing from the recipe list because the list has not loaded, because the list was loaded before the other phone created the recipe, or because the recipe is purged. A rule based only on whether the list has loaded misses the second case, so the client never decides "gone" from absence alone:
    - If a plan day's `recipeId` is not in the cache, the client refetches the recipe list once.
    - While that runs, or if it fails (for example offline), the day shows "Checking the recipe…". It checks again the next time the app is brought to the front. The review lists the day with its include switch off, and says "Checking the recipe…".
    - If the refetch finishes and the recipe is not in the list, it is purged, and the day shows "This recipe is gone". If the recipe is in the list as a deleted recipe, the day shows "This recipe was deleted".
    - In both cases the day is a plain-name day for cooking and adding.

### Add to the shopping list

`POST /api/hh/plan/add-to-list` body:

```text
{ mutationId, clientAt, notify?,
  days:  [{ day: "2026-11-16", recipeId?, title, servings? }, ...],  // 1 to 35: the days being added, as the client saw them
  lines: [{ id: uuid, text, quantity?, forRecipes? }] }              // 1 to 100: the review lines not marked "I have this"
```

The request is validated as a whole. Any invalid field in any day or shopping line makes the whole request a 400 naming the field, and nothing is written. A day listed twice, or a shopping line id listed twice, is also a 400.

The server:

1.  Reads the write record first. A retry returns the first answer and writes nothing.
2.  Creates each shopping line with the id the client chose, as `batchItems` does: one create per line, in its own transaction, with `writeEntry` from `src/shopping/items.ts` (exported for this) and `forRecipes` as a create-only field. A create succeeds only if the id does not exist, so a line that already exists (a replay) is a no-op. The creates run ten at a time, because their ids are distinct and they do not interact. A hundred lines are expected to take about a second (ten rounds of one round trip each, at roughly 100 ms), which is inside the client's ten-second timeout.
3.  Marks each listed day. For a day it reads the stored `meal`. If the stored `meal` equals the one the client listed (the same title, the same `recipeId` or none in both, and the same `servings` or none in both), it sets `addedAt` and `addedBy` with a conditional update on `updatedAt`. If the day is missing, its `meal` differs, or the update loses a race, the server skips the day and counts it. This is not an error, because the marker only says what to show, and a marker is never written on a dinner that was not the one added.
4.  Writes the write record, holding ids and counts only, never the lines' text.

The answer is `{ results: [{ id, status }] }`. The counts of marked and skipped days go to the log, because the client does not use them.

*   **At least once, safe to repeat.** The route is not one transaction. A crash after some lines and before the record leaves those lines created. The retry finds them as no-ops, creates the rest, sets the markers again (setting a marker twice is harmless), and writes the record. A client timeout can start a second run while the first is still going. Both runs are safe to repeat, and the lines they create have the same ids.
*   **The notification.** `notifyAfter` runs when the request is the first to write the record, using the number of lines in the request (not only the number newly created, since a replay finds them already there). The push tag is built from `mutationId`, so two runs cannot send two notifications.
*   **The marker and deleted shopping lines.** Deleting the shopping lines that an add created does not clear the marker. The day still says "On the list", and the person can switch it on in the review to add it again.
*   **Double taps.** The client makes the `mutationId` and the line ids once per review session, keeps them while the sheet is open, and disables the Add button after the first tap. A second tap or a redraw therefore sends the same ids, which the server answers from the write record or finds as no-ops. A person who adds again by hand, in a new review session, makes new ids and so new lines. That is what "add again" means.
*   **Two people adding at once** can both create lines (CUJ 6).
*   **Why not the existing batch route.** It cannot set `forRecipes`. It also writes its write record in a separate, empty transaction after the lines. The new route reuses its per-line create and adds the markers.
*   **Size.** Each transaction is one operation, so no limit of DynamoDB's is near.
*   **Logging.** Each call logs one line: `{ event: 'plan_add', householdId, mutationId, days, lines, created, skipped }`. It never logs recipe text.

### The shopping item gains `forRecipes`

`ShoppingItem` gets `forRecipes?: string`, up to 200 characters, set when the shopping line is created from a plan and never changed by an edit.

*   **Risk.** The first tick or edit of a shopping line deletes a new attribute. `toShoppingItem` copies a fixed list of fields, and `updateFor` removes every stored attribute that is not on the rebuilt item.
*   **Mitigation.** The field is added in all of these places in one change:
    - `ShoppingItem` and `ItemWrite` (create-only, with no timestamp) in `src/shopping/types.ts`.
    - `toShoppingItem` in `src/shopping/items.ts`. `toRecord` already spreads the item's fields.
    - `applyItemWrite` in `src/shopping/apply.ts`. A create copies it, and an edit of an existing item ignores it.
    - The client overlay in `app/lib/itemOverlay.ts`, and the shopping row (`app/components/shopping/ItemRow.tsx`), which shows it as a small second line: "for Chilli, Pasta bake".
*   **Test.** A test creates a labelled line, ticks it, edits its text, deletes it and restores it, and checks the label after each step.
*   `src/shared/itemValidation.ts` is not changed. The existing item routes still reject `forRecipes` as an unknown key, and only the new route accepts it, through its own parser.
*   **Rollback.** A build without the field drops the label on the next edit of such a line. The text and quantity stay correct, so this is accepted.

### Sync, offline and cache

*   **Mutation kinds.** Six new keys, all scoped `household` with the shared offline defaults and the owner guard, registered in `app/lib/mutations.ts`. Five are in a new "meals" set: `recipeAdd`, `recipeEdit`, `recipeDelete`, `recipeRestore` and `planSet`. The sixth, `itemsFromPlan`, joins the item set because it adds shopping lines. The registration loop is refactored so that the task, item and meals sets use the same code. A key is never renamed once shipped.
*   **Refresh after a write.** Each set invalidates its own query when a write settles: recipe kinds invalidate `['recipes']`, `planSet` invalidates `['plan']`, and `itemsFromPlan` invalidates `['items']` and `['plan']`, so the "On the list" marker does not flicker when the overlay drops. Refetches that overlap are shared by the query library, so ten replayed recipe edits do not cause ten downloads at once.
*   **Persistence.** `shouldDehydrateMutation` saves every pending mutation whose scope is `household`, so the new kinds persist with no list to update. A test saves and restores one of each.
*   **Overlays.** Pure functions lay pending writes on the cached data and reuse the server's write rules. They are `recipeOverlay.ts`, `planOverlay.ts` (which also reads `itemsFromPlan` to show the marker) and a new case in `itemOverlay.ts` (`itemsFromPlan` creates the shopping lines).
*   **Queries.**
    - `useRecipes()` (`['recipes']`) is not polled. It loads when the app opens, when a screen that shows recipes mounts, and whenever the app is brought to the front (it is never treated as fresh), and it refetches after the person's own recipe writes.
    - `usePlan()` (`['plan']`) polls every 10 seconds while visible, like tasks and shopping.
    - Both use the existing `noteMutationSettled` guard so a refetch that started before a write finished does not undo it.
*   **Offline reading.** Recipes and plan days are saved in the persisted cache with the lists, for seven days.
*   **Cache cost.** The persisted cache is one IndexedDB value, saved at each change with no delay. Adding up to about 3 MB of recipes makes each save larger. Step 2 measures a save with 200 typical recipes and records the time in its pull request. If it takes more than 50 ms on a mid-range phone, moving the recipe list to its own persisted key becomes the next change (see Future Improvements).
*   **Cache schema version stays 1.** Every change is additive: new query keys that a version 1 cache does not have, new mutation kinds, and one optional field.
*   **Old client, new server.** The service worker never calls `skipWaiting`, so an app version that was installed before a deploy can keep running for days. No existing route rejects anything it accepted before. An old app version cannot queue the new mutation kinds, because it has no code that creates them.
*   **Device-local storage.** The recipe draft, the cooking ticks and the review state are kept in `localStorage`, keyed by the signed-in person's user id, and cleared by `signOutCleanup` with the rest of that person's data. A second person on the same phone does not see the first person's drafts.

### Moving households

`moveOptions` in `src/household/invites.ts` decides whether a person alone in their household may move to another by checking that it has no tasks or shopping items. It also queries `RECIPE#` and `PLAN#` after this change. Without that, a person whose household holds only recipes and plan days would look as if it were empty, and a move would strand those recipes.

### Views

*   **Nav.** Today, Plan, Recipes, Shopping, Settings. The Recipes tab arrives in step 2 and the Plan tab in step 4. The tab row keeps the 44 px touch target.
*   **Today.** A "Tonight" card above the existing content (CUJ 3).
*   **Plan** (`/plan`).
    - The current week and the next four, Monday to Sunday.
    - Each day shows the dinner's name, its minutes and its low-energy mark. A day on the list shows "On the list". A day with nothing planned shows "Nothing planned yet". Today is marked. Earlier days of the current week appear and can be changed.
    - The name shown is the recipe's current title while the recipe exists, and the copy stored on the day after it is deleted.
    - Tapping a day opens a sheet. The person can choose a recipe (dinner recipes first, with "Show all recipes"), type a plain name, change the servings, or clear the day. The sheet shows "Last changed by" and, for a day on the list, the note in CUJ 11.
    - "Add to shopping list" opens the review. The day sheet and the review each have one "Let them know" tick.
*   **Add to shopping list review** (a `ResponsiveSheet`).
    - **Two controls, one meaning each.** A day has an "Include" switch. A review line has an "I have this" button. Pressing "I have this" strikes the line through and shows "Not adding". Pressing it again undoes that. A line that is not struck through will be added.
    - **Days.** One row for each plan day from today onwards that has a dinner, up to 35, in date order. The switch is on for every day that has a usable recipe and is not on the list. A day on the list is off and says "On the list". A day with no usable recipe is off and says "No recipe". A day whose recipe is being checked is off and says "Checking the recipe…".
    - **Lines.** The merged lines from `buildLines`, each with its quantity, a "Not scaled" label where that applies, the "I have this" button, and beneath it how it was made ("2 + 1 from Chilli, Pasta bake"). When an open shopping line has the same normalised name, a hint says "You already have onions on the list". The comparison reads the shopping line's text with `parseIngredientLine`, so "2 onions" and "Onions" both match. The hint changes nothing.
    - **Buttons.** "Add N lines" and "Cancel". N is the number of lines not marked "I have this". Nothing is written until the person taps "Add N lines". If every line is marked, the button is off and the sheet says nothing needs adding. The review adds at most 100 lines at a time. Marking review lines "I have this" and switching days off both lower the count. Above 100 it says "That's a lot for one go. Add some days now and the rest after." and keeps the Add button off.
    - **Interruptions.** The sheet keeps its state on the device for an hour (`hearthwise.review`, per person), so a phone call mid-review does not lose it. It is cleared when the add is sent or the person cancels.
*   **Recipes** (`/recipes`).
    - A search by title and a meal type filter (All, Breakfast, Lunch, Dinner).
    - A "Low energy" toggle and an "Up to … min" choice (10, 20, 30, 45, 60).
    - A "New recipe" button. Each row shows the title, minutes and the low-energy mark.
*   **Recipe** (`/recipes/:id`): the cooking view, with a menu for Edit, Duplicate and Delete.
*   **Recipe editor** (`/recipes/new`, `/recipes/:id/edit`).
    - Title is the only required field. Meal type, servings, minutes, low energy and nutrition follow.
    - Ingredients are a text box with one ingredient per line. Pasting a block fills it. The paste removes bullets (`-`, `*`, `•`) and list numbers from the start of each line, and drops blank lines. A list number is digits followed by `.` or `)` and then a space (`1. `, `2) `), so a decimal such as `1.5 kg flour` is not touched.
    - Under each ingredient line the app shows how it read it ("2 · onions", "200 g · flour", or "Kept as typed. It won't be scaled or added up." for a line with no amount). Correcting a line means editing the text. Nothing blocks saving.
    - Steps are a text box with one step per line, cleaned the same way on paste.
    - **Limits.** The editor checks the shared limits before it queues a save. A recipe over a limit is not saved and is not cut short. The editor says what to change in neutral words, for example "A recipe can hold 30 ingredient lines. This has 34. Remove or combine 4, or keep the extra lines in the notes." The text stays in the box.
    - **Drafts.** The editor saves a draft on the device every few seconds and when the page is hidden (`hearthwise.recipeDraft`, per person and recipe). The draft is removed only after the server accepts the save, by the registered mutation's success handler, which still runs after a reload. If the server refuses the save, the draft stays, and the editor offers "Continue your draft" the next time it opens, with a message in plain words for the cause.
    - "Duplicate" saves a copy at once (the title ends with " (copy)") and opens the copy in the editor.
    - If a save for this recipe is still waiting in the queue, the editor does not offer the draft. It offers "Continue your draft" only when no save is waiting, or when the server refused the save.
*   **Cooking view.**
    - Two labelled sections on one scroll: "Get everything out" and "Steps". The ingredient list shows the scaled amounts, rounded to the nearest step. A servings control starts at the planned servings when opened from the plan, and otherwise at the recipe's own.
    - Each ingredient and step has a tick, saved on the device in `hearthwise.cooking` (per person, recipe and day, by line position). A day runs from 4am to 4am in the phone's time zone. "Start again" clears the ticks. If the recipe is edited the same day, ticks stay on the same positions.
    - The view asks the browser to keep the screen awake (`navigator.wakeLock`) while it is open. It asks again when the page becomes visible, because browsers release the lock when a page is hidden. Where the lock is unsupported, nothing happens.
    - When the servings differ from the recipe's own, a note says "Steps are written for N servings."
    - A deleted recipe opens read-only with "This recipe was deleted" and a Restore button. A purged one cannot be opened.
    - Tap targets are at least 44 px.
*   **Pick something easy** (on Today when nothing is planned, and on Plan).
    - A sheet with an optional "Up to … min" choice (10, 20, 30, 45 or 60, as in the Recipes filter). A recipe with no `minutes` never matches a chosen time. then up to three dinner recipes marked low energy (and within the time, if chosen), picked at random by the client from the cached recipes.
    - "Shuffle" picks again. Each recipe opens with "Make this tonight".
    - With no matches it says "No easy dinners yet. Mark a recipe as low energy to see it here."
*   **Deleted page.** Gains a Recipes group beside Tasks and Shopping.
*   **Shopping row.** Shows `forRecipes` as a small second line.

### Wording

The phase 1 wording rules apply (`docs/brand.md`): no red, and none of "overdue", "missed" or "streak". Fixed terms: "recipe" for a library entry, "plan day" for a date, "dinner" for what is planned on it. Fixed phrases: "Nothing planned yet", "Tonight", "Pick something easy", "Make this tonight", "Add to shopping list", "I have this", "Not adding", "On the list", "Not scaled", "Get everything out", "Steps", "Start again", "Kept as typed", "Checking the recipe…", "This recipe was deleted", "This recipe is gone" and "Last changed by". The app does not use the words "forgot", "skipped", "incomplete", "missing" or "unplanned".

### Notifications

None are new. "Let them know" can be ticked on a plan change (`planSet`) and on the add. A plan change sends "<name> changed the plan" with the day and dinner and opens `/plan`. The add sends the existing "N items added to the shopping list" and opens `/shopping`. Recipe edits do not notify. A push notification contains no recipe steps or notes. As for every "Let them know" push, one whose `clientAt` is more than 30 minutes old is not sent, so a change replayed after a long wait notifies nobody. It does contain the dinner's title, which is text the household typed and which can show on a lock screen.

## Alternatives Considered

### Alternative A: Free-text ingredient lines, no merging

*   **Pros**: Smallest build. Nothing can merge wrongly.
*   **Cons**: It cannot scale by servings or add amounts, which the brief ([`phase-2-concepts-brief.md`](phase-2-concepts-brief.md), "Decisions made with the author") records as wanted.
*   **Reason for Rejection**: Rejected by author, because merged sums and scaling were requested. One part is kept: ingredients are stored as the text typed.

### Alternative B: Three fields per ingredient (amount, unit, name)

*   **Pros**: No reading of text. The structure is exact.
*   **Cons**: On a phone, a 10-ingredient recipe means 30 fields. Typing effort is the main reason people stop using a tool like this.
*   **Reason for Rejection**: Rejected by Claude, because of entry effort. One line, read and shown back, is faster to type and easy to correct.

### Alternative C: Store the reading of each ingredient with its text

*   **Pros**: No reading work on each screen.
*   **Cons**: The server would have to check that the stored parts match the text, or trust the client. A later improvement to the reader would not reach saved recipes.
*   **Reason for Rejection**: Rejected by Claude, because the reading is a pure function that runs whenever a recipe is shown.

### Alternative D: Merge into shopping lines already on the list

*   **Pros**: One onion line, however many adds.
*   **Cons**:
    - A sum into an existing line is a read-modify-write on a last-writer-wins field.
    - A replay adds twice. A stale phone's total overwrites the other person's concurrent edit.
    - Merging with a hand-typed "onions" or "2 large onions" needs parsing of free text.
    - It edits a line the person may have already ticked.
*   **Reason for Rejection**: Rejected by Claude, because it needs a new server operation and breaks "the list does not change itself". Two onion lines with a hint is an accepted cost.

### Alternative E: Structured amount, unit and name stored on the shopping item

*   **Pros**: A later feature could merge into stored lines.
*   **Cons**: Every new attribute must be added to the type, the loader, the validator and the overlay, or the next edit deletes it. The structure is only needed to merge into existing lines, which is rejected.
*   **Reason for Rejection**: Rejected by Claude, because it has no use today and carries a risk of data loss with no error.

### Alternative F: The server computes the lines

*   **Pros**: One implementation, always current with the recipes.
*   **Cons**: The review and the list as it shows before confirmation need the lines offline. A second copy of the logic on the client could differ from the server's, and the lines could change when the next poll arrives.
*   **Reason for Rejection**: Rejected by Claude. One pure module is used on both sides, and the server validates.

### Alternative G: Reuse `POST /api/hh/items/batch` for the add

*   **Pros**: No new route.
*   **Cons**: It cannot set `forRecipes` and cannot mark the plan days.
*   **Reason for Rejection**: Rejected by Claude. The new route reuses its per-line create and adds the markers.

### Alternative H: One queued shopping-line add per line

*   **Pros**: No new route or mutation kind. Shows progress offline.
*   **Cons**: Up to 100 mutations and 100 write records per add. A sign-out could leave the queue half-applied. The route could not mark plan days.
*   **Reason for Rejection**: Rejected by Claude. One mutation per add is simpler to retry and to report.

### Alternative I: A snapshot of the recipe on the plan day

*   **Pros**: A plan day would never depend on the recipe list, so the "not in the cache" case would not exist.
*   **Cons**: Two copies of the truth, up to 13 KB on every plan day, and a corrected quantity in the recipe would not reach the plan.
*   **Reason for Rejection**: Rejected by Claude. Only the title is copied, and the client refetches the recipe list before it decides a recipe is gone.

### Alternative J: A plan day as a link only

*   **Pros**: One source of truth for the title.
*   **Cons**: A deleted recipe leaves a blank day at 5pm.
*   **Reason for Rejection**: Rejected by Claude. The plan keeps a copy of the title, and the screen shows the live title while the recipe exists.

### Alternative K: Per-line timestamps for ingredients and steps

*   **Pros**: Two people editing different lines both keep their edits.
*   **Cons**: Lines are inserted, moved and deleted, which timestamps per line do not resolve. It adds a second conflict model for a rare case.
*   **Reason for Rejection**: Rejected by Claude. The recipe shows who last changed it, and a save sends only the fields that changed.

### Alternative L: Shared cooking-view ticks

*   **Pros**: Both people see progress.
*   **Cons**: A shared tick needs reset rules (last week's ticks would pre-tick tonight) and a write and write record for each tick, for one person's session in a kitchen.
*   **Reason for Rejection**: Rejected by Claude. Ticks stay on the device.

### Alternative M: Pantry inventory

*   **Pros**: Adding to the list could skip what is in stock.
*   **Cons**: Keeping stock up to date is upkeep that is abandoned first, especially with ADHD. The brief records this as the author's reason.
*   **Reason for Rejection**: Rejected by author. A mark at the time of adding replaces it.

### Alternative N: Free-form tags

*   **Pros**: The household can label recipes any way it likes.
*   **Cons**: Naming a tag is a decision, filtering is unreliable, and a tag editor is more to build.
*   **Reason for Rejection**: Rejected by Claude. Only `lowEnergy` and `minutes`.

### Alternative O: Proposals for recipes and plan days

*   **Pros**: Reuses the phase 1 proposal model.
*   **Cons**: Both people already have equal rights to the recipe box and the plan, and an approval step adds work.
*   **Reason for Rejection**: Rejected by Claude. Both people edit directly.

### Alternative P: A third-party plural library

*   **Pros**: A maintained inflection library covers more words.
*   **Cons**: It is a new dependency for one small job, and a library's guesses can merge two different things.
*   **Reason for Rejection**: Rejected by Claude. A small rule with a test table of the cases that matter, where anything unlisted stays apart.

### Alternative Q: Refuse a recipe save made from an out-of-date copy

*   **Pros**: Nothing is overwritten without the person knowing.
*   **Cons**: A save made offline and replayed later would be refused, and the person would have to retype it. Retyping is the cost this design works to remove.
*   **Reason for Rejection**: Rejected by Claude. Saves send only changed fields, and one earlier version of ingredients and steps is a Future Improvement.

### Alternative R: A summary list for recipes with a request per recipe

*   **Pros**: A small list payload, and details fetched when a recipe opens.
*   **Cons**: A second route, a per-recipe cache, and recipes unreadable offline unless opened first.
*   **Reason for Rejection**: Rejected by Claude. Tighter limits keep the whole list to about 3 MB, and it stays readable offline.

## Non-Functional Requirements

*   **Security and privacy**:
    - Every new route is wrapped in `withHousehold`, so the household id comes from the guard, never from the request.
    - `src/shared/mealValidation.ts` validates every request field against the limits above and rejects unknown keys.
    - A push contains only a short description, never steps or notes. Logs carry ids and counts, never recipe text.
    - Drafts, cooking ticks and review state on the device are per person and are cleared at sign-out.
    - No new secret and no new IAM permission are expected, because the table, its expiry and the Lambda roles are not specific to key prefixes. Step 1 confirms this with the store contract tests and the infrastructure guard test.
*   **Performance and cost**:
    - Phase 1 polled two lists: 2 requests per 10 seconds per visible device. For two devices open three hours a day that is about 130,000 requests a month, about 13% of Lambda's permanent free allowance of 1 million.
    - The plan adds a third, small list: 3 requests per 10 seconds, about 195,000 a month, about 20% of the allowance. DynamoDB reads stay under US$1 a month on the phase 1 figures.
    - Recipes are not polled. They load on open and on focus. A library of 100 typical recipes (3 to 5 KB each) is 300 to 500 KB.
    - The recipe list is bounded by the 200-recipe limit and the plan by its 60-day expiry. Phase 1's statement that no list is paginated still holds.
*   **Rollout and rollback**:
    - The change is additive, with no data migration. Existing shopping items stay valid, because `forRecipes` is optional.
    - Each of the six steps lands as its own pull request on `main`, without a feature flag. The new screens are reached from new tabs, and Today gains the Tonight card. A person who does not use meal planning sees two extra tabs and one extra card.
    - To roll back, run `tofu apply` with the previous build, or deploy the previous container tag. A rollback leaves recipes and plan days in the table, unread. A shopping line created with a label loses the label on its next edit under the older build.
    - Self-hosted SQLite needs no migration, because the single-table shape is the same. The contract tests run the new key prefixes on all three stores. A backup is the whole SQLite file, so recipes and plans are included.
*   **Accessibility and sensory**:
    - Every new route gets the axe (automated accessibility) check the phase 1 routes have.
    - The existing test checks touch targets of at least 44 px.
    - Text size and reduce-motion preferences apply. Nothing moves on its own.
    - Colour is not the only signal. "On the list", "Low energy", "Not adding" and "Tonight" are words. The accessibility pass in step 6 checks this.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A wrong merge | A shopping line says 3 where 2 are needed | Merge only the same name and the same unit. Use a table of known cases. Show "2 + 1 from ..." in the review. Convert nothing. When unsure, keep the lines apart. |
| Rounding down | Too little is bought | Shopping amounts round up. The cooking view rounds to the nearest step. |
| An unscaled ingredient line | Under-buying when servings change | "Not scaled" is shown in the review and the cooking view. |
| Typing recipes is too slow | The plan stays empty and the tool is dropped | Name-only recipes, pasted blocks, draft saving, Duplicate, plain-name plan days. The plan works on day one. |
| A recipe save is refused | The typed text is lost | The editor checks the limits first, keeps the text, and removes the draft only after the server accepts the save. |
| Two people add the same dinner at once | Shopping lines appear twice | The marker covers the usual case. The rare race is accepted and fixed by deleting. |
| A double tap on Add | Shopping lines appear twice | One `mutationId` and one set of line ids per review session, and the button is disabled after the first tap. |
| Two people edit one recipe at once | One edit is lost | A save sends only changed fields. The recipe shows "Last changed by". Accepted. |
| A recipe missing from the cache | A planned dinner looks gone | The client refetches the list before it decides, and shows "Checking the recipe…" meanwhile. |
| A new field is deleted by an edit | Labels vanish | The field is added to every place in one change, with a test that ticks, edits and restores a labelled line. |
| An add is slow | The client times out and retries | The creates run ten at a time, and a retry is safe to repeat. |
| Old cache, new build | Restored data does not match | Additive only. Schema version unchanged. A test restores a version 1 cache that holds a recipe write. |
| An older app version runs after a deploy | A queued write has no handler | An older version cannot queue the new kinds. The server accepts every old body. |
| A phone unopened for over seven days | Nothing to read offline | Stated limit. The plan refetches on open. |
| A recipe is purged while planned | A day cannot be cooked from | The day keeps its title, says "This recipe is gone", and acts as a plain-name day. |
| Changing a plan day surprises a person | They expect the list to change | The note in CUJ 11, and "On the list" shows what was added. |
| Wording makes a person feel judged | A person feels watched | The wording test, fixed phrases, and no cooking history. |
| Recipe data grows | Slower cache writes | The 200-recipe limit, and a measurement in step 2. A save over 50 ms is followed by moving recipes to their own persisted key. |
| Security or privacy | Recipe text in logs or pushes, or another person's drafts on a shared phone | See "Security and privacy" above. |

## Future Improvements

*   **Merging into an existing line**, if the household reports duplicate shopping lines as a problem. The safe form is an additive server operation with its own conditional update.
*   **One earlier version of a recipe's ingredients and steps**, so an overwritten edit can be restored.
*   **A separate persisted key for recipes**, if the step 2 measurement of a cache save is over 50 ms.
*   **A "staple" flag on an ingredient** (salt, oil), so the review leaves it off by default.
*   **Search by ingredient**, and a household "favourites" mark.
*   **Planning breakfast and lunch**, if the library grows and the household wants it.
*   **A 100-operation limit in the in-memory and SQLite stores**, so a transaction DynamoDB would refuse also fails in local tests. Nothing in this phase needs it, because no transaction here is large.
*   **Leftovers**, **recipe photos** and **URL import**, which the author has excluded from this phase.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Approach

The work is six steps, each in its own pull request. Each step must pass `yarn typecheck`, `yarn test` and `yarn build` before merge. The steps run in order, because each depends on the one before. The household can stop using the whiteboard once step 5 is released. The phase 1 rules apply to every step:

*   each test is written before the code it covers;
*   every write route carries a `mutationId` and runs through `withWriteRecord`;
*   an attribute that is not set is left out and never stored as `null`;
*   `expiresAt` is epoch seconds;
*   every `fetch` goes through `withTimeout()`;
*   wording follows `docs/brand.md` (the project's wording and palette rules).

File names are taken from the current code. Where one differs when a step starts, the code wins, and the step's pull request records the difference in `docs/DECISIONS.md` as "Spec says / Built / Why", as phase 1 did. In this plan, "line" has a qualifier: ingredient line, shopping line or review line. "The marker" is the `addedAt` and `addedBy` fields on a plan day, shown as "On the list".

**Device-local storage keys.** Three keys, each holding one JSON object, each suffixed with the signed-in person's user id: `hearthwise.recipeDraft.<userId>` (drafts by recipe id), `hearthwise.cooking.<userId>` (cooking state by recipe id) and `hearthwise.review.<userId>` (the add review's state). Item 15 defines `recipeDraft`, item 20 defines `cooking`, item 29 defines `review`, and item 16 clears all three. Every read and write is inside `try/catch`, so blocked or full storage never breaks a page.

### Step 1: Foundation (types, pure logic, recipe domain and routes)

#### 1. `src/shared/ingredients.ts` (Create), `src/shared/__tests__/ingredients.test.ts` (Create)

*   **Type / Scope**: Pure module.
*   **Why**: One reader of ingredient lines for the editor, the cooking view, the review and the server's limits, so they cannot disagree.
*   **Proposed Changes**:
    - Export `UNITS`, `Unit`, `parseIngredientLine(text)`, `normaliseName(name)` and `formatAmount(amount, unit)`.
    - **Units and spellings** (matched in any case, with an optional trailing full stop). Nothing else is a unit, so `oz`, `lb` and `handful` are part of the name. "8 oz cheese" reads as amount 8, name "oz cheese", and merges only with the same text.
        - `g`: g, gram, grams.
        - `kg`: kg, kilo, kilos, kilogram, kilograms.
        - `ml`: ml, millilitre, millilitres, milliliter, milliliters.
        - `l`: l, litre, litres, liter, liters.
        - `tsp`: tsp, tsps, teaspoon, teaspoons.
        - `tbsp`: tbsp, tbsps, tablespoon, tablespoons.
        - `cup`: cup, cups.
        - `tin`: tin, tins, can, cans.
        - `pack`: pack, packs, packet, packets.
        - `clove`: clove, cloves.
        - `bunch`: bunch, bunches.
        - `pinch`: pinch, pinches.
        - `slice`: slice, slices.
    - **Reading rules** are those in "Reading an ingredient line". Where the design is silent: a line with no name left after the amount and unit (`2`, `200 g`) has no amount, and its name is the whole text. A line that starts with a comma has no amount, and its name is the whole text. Everything before the first comma is the name.
    - **`formatAmount(amount, unit)`** returns the text stored as `quantity`. Whole numbers show as digits. A half, quarter or three-quarter shows as `½`, `¼` or `¾` after the whole part (`1½`, `¾`). `kg` and `l` show up to two decimals with no trailing zeros (`0.35 kg`). The unit follows after one space (`400 g`), and a count has no unit (`3`).
    - **`normaliseName`** holds the singularising rules, the list of words left unchanged and the list of irregular plurals.
    - **Tests** (one table, plus one property test):
        - the examples in "Reading an ingredient line": `2 onions`, `200 g flour`, `200g flour`, `1,500 g flour` (1500, `g`, `flour`), `1 1/2 tbsp olive oil` (1.5, `tbsp`, `olive oil`), `a tin of tomatoes`, `1 onion, diced`, `2 large onions`, `a handful of basil` (no amount, name is the whole text), `salt to taste`, `2-3 carrots`, `0 eggs` (no amount, name is the whole text);
        - mixed numbers, unicode fractions, `1,5`, `200 G`, "a" and "an" with and without a unit, a unit with a full stop, a word that is not a unit, empty text;
        - the required name cases in "Names that count as the same";
        - `normaliseName(normaliseName(x))` equals `normaliseName(x)`;
        - `formatAmount` for `1.5` (`1½`), `0.35 kg`, `400 g`, `3`.

#### 2. `src/shared/shoppingLines.ts` (Create), `src/shared/__tests__/shoppingLines.test.ts` (Create)

*   **Type / Scope**: Pure module.
*   **Why**: Scaling, rounding and merging in one place, used by the review, the overlay and the cooking view.
*   **Proposed Changes**:
    - Export `scaleFactor(plannedServings, recipeServings)`, `roundAmount(amount, unit, mode)` where `mode` is `up` or `nearest`, `buildLines(meals: { recipe: Recipe; servings: number }[])` (in plan-day order), and the limits `MAX_LINES` (100) and `MAX_FOR_RECIPES` (200). Floating-point comparisons use a tolerance of `1e-9`, so an amount already on a step stays put.
    - **`buildLines` returns** `{ key: string; text: string; quantity?: string; forRecipes: string; from: { title: string; amount?: number; unit?: Unit }[]; notScaled: boolean }[]` in order of first appearance.
        - `key` is `` `${normaliseName(name)}|${unit ?? ''}` `` for a review line with an amount, and `` `raw:${text.trim().toLowerCase()}|${k}` `` for one without, where `k` is how many earlier no-amount review lines have the same lower-cased text (0 for the first). A key does not depend on which days are included, so a review line that appears or disappears when a day is switched keeps every other line's key. `reviewState` uses the keys to remember "I have this".
        - `notScaled` is true when a review line has no amount and the factor of at least one source is not 1.
        - `forRecipes` lists each recipe title once, even if the recipe is planned on two days.
    - **Tests**: the merge table in "Merging"; rounding up and to the nearest step at every unit; an amount already on a step stays put; the smallest-step rule; summing before rounding; `g` against `kg`; a unit against none; ingredient lines with no amount are never merged; `forRecipes` order, de-duplication and truncation; a plan day with no usable recipe; factor 1.5 on a count; `notScaled`.

#### 3. `src/meals/types.ts` (Create), `src/meals/keys.ts` (Create)

*   **Type / Scope**: Types and key helpers.
*   **Why**: Steps 1 to 5 share one definition of a recipe and a plan day, on the same key scheme (`hhPk`) as shopping lines.
*   **Proposed Changes**: `Recipe`, `MealType`, `RecipeWrite` (each field `{ value, at }`; `minutes` is `{ value: number | null; at }` and an empty-string `nutrition` clears it), `Recipe` (`id` plus every attribute in the data model table), `PlanDay` (`{ day, meal?, fieldTimes: { meal?: number }, addedAt?, addedBy?, updatedAt, updatedBy, expiresAt }`), `PlanMeal` (`{ recipeId?, title, servings? }`), `RecipesData` (`{ recipes: Recipe[]; serverTime: number }`) and `PlanData` (`{ days: PlanDay[]; serverTime: number }`). `RECIPE_PREFIX`, `PLAN_PREFIX`, `recipeKey(householdId, id)` and `planKey(householdId, day)`.

#### 4. `src/meals/applyRecipe.ts` (Create), `src/meals/recipes.ts` (Create), `src/meals/__tests__/recipes.test.ts` (Create)

*   **Type / Scope**: Domain, written like `src/shopping/apply.ts` and `src/shopping/items.ts`.
*   **Why**: The server and the client's overlay use one write rule, so a pending edit loses to a newer one on screen exactly as it will on the server.
*   **Proposed Changes**:
    - `applyRecipeWrite(existing: Recipe | undefined, id: string, write: RecipeWrite, userId: string, serverNow: number): { result: WriteResult; recipe?: Recipe }` and `applyRecipeDelete(existing, userId, serverNow)` are pure. A create with no `title` returns `noop`, and `putRecipe` turns that into `TaskError('title_required', 400)`. They apply per-field times, `clampTime`, the defaults on create, `updatedBy`, and tombstones final for edits.
    - `toRecipe(raw)` copies every attribute, so an update does not drop any.
    - `putRecipe`, `deleteRecipe` and `listRecipes` follow `putItem`, `deleteItem` and `listItems`: read the write record, read the recipe consistently, build the transaction, run it in `withWriteRecord`, and retry up to three times on a lost race.
    - A create counts live recipes with a query on `skPrefix 'RECIPE#'` and `attributes ['SK', 'deletedAt']`, counting the records where `deletedAt` is undefined. At 200 it throws `TaskError('recipe_limit', 409)`.
    - `listRecipes` returns every live recipe and the 50 most recently deleted recipes from the last 30 days, so the list stays under about 3.3 MB.
    - **Tests**: create; replay; an older field time loses; a newer one wins; a tombstone returns `gone`; two phones' edits to different fields both land; a title-only write leaves the steps alone; list fields replace as a whole; the limit counts live recipes and not tombstones; only the 50 newest tombstones are listed.

#### 5. `src/shared/mealValidation.ts` (Create), `src/shared/__tests__/mealValidation.test.ts` (Create)

*   **Type / Scope**: Validators, in the `Parsed<T>` style that names the failing field.
*   **Why**: One set of limits for the server and the editor. This file creates all three parsers, so steps 4 and 5 do not modify it. Build item 6 first, because this file imports what item 6 exports.
*   **Proposed Changes**:
    - `parseRecipePut`, `parsePlanPut` and `parseAddToList`, reusing `parseEnvelope`, `ENVELOPE_KEYS`, `parseUuid`, `parseClientTime`, `trimmedText`, `unknownKey` and `parseDay`, with every limit in "Limits". Lengths are counted in code points (`Array.from(text).length`) after trimming, as the existing validators do.
    - A stamped field (`<field>At`) is parsed with the existing `parseStamped`, exported in item 6.
    - `minutes: null` and an empty `nutrition` clear their fields. A `<field>At` without its field, or a field without its time, is rejected. `servings` must be present exactly when `recipeId` is.
    - **The add body is flat**: `days[i] = { day, title, recipeId?, servings? }` and `lines[i] = { id, text, quantity?, forRecipes? }`. Any invalid field in any day or shopping line makes the whole request a 400 naming the field (for example `lines[3].text`). There is no per-line "invalid" result. A day listed twice, or a shopping line id listed twice, is a 400 on `days` or `lines`. The text and quantity limits are `MAX_TEXT` (200) and `MAX_QUANTITY` (40), exported by item 6. A shopping line's `quantity` is at most 40 code points and `forRecipes` at most 200.
    - The editor imports the same limits. It drops blank ingredient and step lines and trims each line before it counts lines and characters.
    - **Tests**: each limit at and over; unknown keys; a duplicate day; a duplicate shopping line id; `servings` without `recipeId`.

#### 6. `src/shared/itemValidation.ts` (Modify), `src/shared/taskValidation.ts` (Modify)

*   **Type / Scope**: Exports.
*   **Why**: The add parser must use the same text and quantity limits as the item parser, and the stamped-field parser, instead of copies.
*   **Proposed Changes**: Export `MAX_TEXT` and `MAX_QUANTITY` from `itemValidation.ts`, and `parseStamped` from `taskValidation.ts`. No behaviour changes. The existing tests must still pass.

#### 7. `src/api/meals.ts` (Create), `src/api/apiRoutes.ts` (Modify), `src/api/__tests__/meals.test.ts` (Create), `src/api/__tests__/apiRoutes.test.ts` (Modify)

*   **Type / Scope**: Routes.
*   **Why**: Exposes the recipe domain. `apiRoutes.test.ts` asserts the exact route list, so each step that adds routes updates it, in registration order.
*   **Proposed Changes**: `registerMealRoutes(router)` registers `GET /api/hh/recipes`, `PUT /api/hh/recipes/{id}` and `DELETE /api/hh/recipes/{id}`, each as `withHousehold(guarded(['id'], ...))`. `PUT` answers 200 for a create and for an edit, as items do. `DELETE` answers 200 with `{ recipe }`, and 404 for a missing id. `apiRoutes.ts` calls `registerMealRoutes`. The plan and add routes arrive in steps 4 and 5.
*   **Tests**: status codes; 400 naming the field; 404 for a non-UUID id; 410 on a tombstone; 409 `recipe_limit`; replay through the write record; one household cannot read another's recipes.

#### 8. `src/shopping/types.ts` (Modify), `src/shopping/items.ts` (Modify), `src/shopping/apply.ts` (Modify), `src/shopping/__tests__/items.test.ts` (Modify), `src/shopping/__tests__/apply.test.ts` (Modify)

*   **Type / Scope**: Shopping domain.
*   **Why**: Adds the label without the first edit deleting it (see "The shopping item gains `forRecipes`").
*   **Proposed Changes**: Add `forRecipes?: string` to `ShoppingItem`, and a create-only `forRecipes?: string` (no timestamp) to `ItemWrite`. `toShoppingItem` copies it. `applyItemWrite` copies it on create and ignores it on an edit. Export `writeEntry(store, ctx, entry, nowMs)` from `items.ts`, with `entry` typed `Exclude<BatchEntry, { invalid: string }>`.
*   **Tests**: create a shopping line with `forRecipes`, tick it, edit its text, delete it and restore it, and check `forRecipes` is intact in the item and in the stored record after each step.

#### 9. `src/household/invites.ts` (Modify), `src/household/__tests__/invites.test.ts` (Modify)

*   **Type / Scope**: Household move.
*   **Why**: A person alone in a household that holds only recipes or plan days must not be offered a move that would strand them.
*   **Proposed Changes**: In `moveOptions`, add two queries to the `Promise.all` list, using `RECIPE_PREFIX` and `PLAN_PREFIX` from `src/meals/keys.ts` (a deliberate import from household to meals, accepted). The condition adds `recipes.length > 0 || plan.length > 0`. Tombstoned recipes count as records.
*   **Tests**: a person alone with a recipe; a person alone with a plan day. Neither is offered a move.

#### 10. `src/tasks/restore.ts` (Modify), `src/shared/taskValidation.ts` (Modify), `src/tasks/__tests__/restore.test.ts` (Modify), `src/shared/__tests__/taskValidation.test.ts` (Modify)

*   **Type / Scope**: Restore.
*   **Why**: Recipes use the existing recycle-bin route instead of a new one.
*   **Proposed Changes**: Widen the `kind` union to `'task' | 'item' | 'recipe'` in `restoreEntries` (`restore.ts`) and in `parseRestoreBody` (`taskValidation.ts`, where it appears in three places). Generalise the private `restoreItem` to take a key builder, and use it for items and recipes. A restore removes `deletedAt`, `deletedBy` and `expiresAt`, sets `updatedAt` forward, and sets `updatedBy` to the person who restored. Either member may restore.
*   **Tests**: restore; restore twice (no-op); a missing id (`not_found`); restore after a later delete (no-op).

#### 10a. `src/store/__tests__/contract.ts` (Modify)

*   **Type / Scope**: Store contract tests.
*   **Why**: The design says the new key prefixes work on all three stores, and that no infrastructure change is needed. The contract tests prove the first. `src/infra/__tests__/infraGuards.test.ts` is run, not changed.
*   **Proposed Changes**: Add cases that put recipe and plan records, query by `skPrefix 'RECIPE#'` with `attributes ['SK', 'deletedAt']`, and query `PLAN#`, on the memory, SQLite and (with `DYNAMODB_ENDPOINT`) DynamoDB suites.

### Step 2: Recipe library

#### 11. `app/lib/mutations.ts` (Modify), `app/lib/__tests__/mutations.test.ts` (Modify)

*   **Type / Scope**: Client write registry.
*   **Why**: Every household write is registered once, by key, so it can be saved and replayed.
*   **Proposed Changes**:
    - Add a "meals" group of keys, `mealMutationKeys`, with these variables (each `<field>At` sent to the server is `v.at`):
        - `recipeAdd: Common & { recipe: { id; title; mealType?; servings?; minutes?; lowEnergy?; nutrition?; ingredients?; steps? } }`, sent as `PUT /api/hh/recipes/{id}`.
        - `recipeEdit: Common & { recipeId; changes: { title?; mealType?; servings?; minutes?: number | null; lowEnergy?; nutrition?; ingredients?; steps? } }`, sent as `PUT /api/hh/recipes/{id}` with only the changed fields.
        - `recipeDelete: Common & { recipeId }`, sent as `DELETE`.
        - `recipeRestore: Common & { recipeIds: string[] }`, sent as `POST /api/hh/restore` with `{ kind: 'recipe', id }` entries.
        - `planSet` arrives in step 4 and `itemsFromPlan` in step 5.
    - Refactor the registration loop once. It loops over a table of `{ keys, runners, invalidate: (kind) => QueryKey[] }` entries. The task set keeps its `getData` argument. `recipeAdd`, `recipeEdit`, `recipeDelete` and `recipeRestore` invalidate `['recipes']`.
    - `useMealMutation(kind)` returns `useMutation({ mutationKey })` for a meals key, as `useItemMutation` does.
    - The registered `onSuccess` for `recipeAdd` and `recipeEdit` calls `removeDraft(userId, recipeId)` from item 15, so it still runs after a reload. For `recipeAdd` it also removes the draft stored under the fixed key `new`. The registered `onError` calls `markRefused(userId, recipeId, message)` when the server refuses the write with a 400, 409 or 410 (a 410 is a queued edit to a recipe deleted meanwhile). `userId` is `variables.by`, and the recipe id is `v.recipe.id` for `recipeAdd` and `v.recipeId` for `recipeEdit`. The message comes from `describeFailure(error, kind)`.
    - `describeFailure(error, kind?)` gets the mutation kind as a second argument, and the registered `onError` passes it. It checks `recipe_limit` before the existing `status === 409` line and answers "This household has reached 200 recipes." For `kind` `recipeAdd` or `recipeEdit` with status 400 it answers "That recipe couldn't be saved. Please check its length." Other kinds keep their current messages.
*   **Tests**: each new key has a registered default with scope `household`; `describeFailure` for `recipe_limit` and for a recipe 400, and unchanged for an item 400.

#### 12. `app/lib/recipes.ts` (Create), `app/lib/recipeOverlay.ts` (Create), `app/lib/__tests__/recipes.test.ts` (Create, includes the cache-save measurement), `app/lib/__tests__/recipeOverlay.test.ts` (Create)

*   **Type / Scope**: Client data.
*   **Why**: Cached recipes with pending writes laid on top, and the pure rules for filtering and shortlisting.
*   **Proposed Changes**: `RECIPES_KEY`, and `useRecipes()`, which returns `{ status: 'loading' | 'ready' | 'error'; recipes: Recipe[]; dataUpdatedAt: number | undefined; refetch }` with pending writes laid on top. It is not polled and is never treated as fresh, so it refetches on mount and on focus, with the `noteMutationSettled` guard. Pure `filterRecipes({ search, mealType, lowEnergy, maxMinutes })` (search is a case-insensitive substring of the title; a recipe with no `minutes` never matches a chosen time), `sortRecipes` (by title with `localeCompare`) and `easyShortlist(recipes, { maxMinutes? }, random)` (dinner and low energy, within the time, shuffled with Fisher-Yates, then the first three). `random` is `() => number` in [0, 1), passed in so tests are deterministic. `recipeOverlay.ts` exports `applyPendingRecipes(data: RecipesData, pending)`, which applies pending recipe writes with `applyRecipeWrite` and `applyRecipeDelete`. A test measures saving the persisted cache with 200 typical recipes and records the time in the pull request. The measurement does not change the code in this step.

#### 13. `app/lib/deleted.ts` (Modify), `app/routes/deleted.tsx` (Modify), `app/lib/__tests__/deleted.test.ts` (Modify), `app/lib/__tests__/items.test.tsx` (Modify), `app/routes/__tests__/deleted.test.tsx` (Modify)

*   **Type / Scope**: Deleted page.
*   **Why**: Recipes are restored from the same recycle-bin page as tasks and shopping lines.
*   **Proposed Changes**: `deletedEntries(tasks, items, recipes)` returns `{ tasks, items, recipes }`, where recipes are those with `deletedAt` defined, newest deletion first. The `recipes` argument is required, and the two existing callers pass it. `deleted.tsx` passes `useRecipes().recipes`. It shows a "Recipes" group: the title, "Deleted by <name>, <date>", and a Restore button with `aria-label` "Restore: <title>". Its helper line reads "Deleted tasks, shopping items and recipes stay here for 30 days." (the existing test for the old text changes), and "Nothing has been deleted." shows only when all three groups are empty.

#### 14. `app/hooks/useRecipeActions.tsx` (Create)

*   **Type / Scope**: The one place screens run recipe mutations, like `useItemActions`.
*   **Why**: Builds each mutation's variables in one place.
*   **Proposed Changes**: `add`, `edit` (takes only the changed fields), `remove`, `restore` and `duplicate`. Each builds `mutationId`, `at` and `by` as the item actions do. `remove` queues `recipeDelete`, shows an Undo toast that restores, and navigates to `/recipes`. `duplicate(recipe)` queues `recipeAdd` with a new UUID and the same fields, with the title cut to 112 code points plus " (copy)" so it stays within 120, then navigates to `/recipes/<newId>/edit`.

#### 15. `app/lib/recipeDraft.ts` (Create), `app/lib/__tests__/recipeDraft.test.ts` (Create)

*   **Type / Scope**: Device-local drafts.
*   **Why**: A half-typed recipe survives a sleeping phone, and a refused save is not lost.
*   **Proposed Changes**:
    - Storage in `hearthwise.recipeDraft.<userId>`, an object keyed by recipe id.
    - `saveDraft(userId, recipeId, draft)`, `readDraft(userId, recipeId)`, `removeDraft(userId, recipeId)` and `markRefused(userId, recipeId, message)`.
    - A draft is `{ recipeId, base, fields, refused? }`. `base` is the recipe as it was when the editor opened (empty for a new recipe). `fields` are the form values. An edit's changed fields are those whose form value differs from `base`.
    - A draft for a recipe that is not saved yet is stored under the fixed key `new`, and its `recipeId` field holds the UUID the editor made when it opened. `readDraft(userId, 'new')` finds it after a reload and the editor reuses that UUID. On `recipeAdd` success both `removeDraft(userId, 'new')` and `removeDraft(userId, id)` run.
    - `readDraft` returns `refused` so the editor can show the cause in plain words after a reload.
*   **Tests**: a draft survives a remount; it is removed only by `removeDraft`; a refused save keeps it and sets `refused`; a storage that throws does not break saving; drafts are separate per user.

#### 16. `app/lib/persistedCache.ts` (Modify), `app/lib/__tests__/persistedCache.test.ts` (Modify)

*   **Type / Scope**: Sign-out and person-change cleanup.
*   **Why**: A second person on a shared phone must not find the first person's drafts, cooking state or review state. `signOutCleanup` and `clearUserCache` live in this file, not in `app/lib/signOut.ts`.
*   **Proposed Changes**: Add `clearDeviceKeys(userId)`, which calls `localStorage.removeItem` for the three keys in "Device-local storage keys", inside `try/catch`, and call it from `clearUserCache`. `signOutCleanup` already calls `clearUserCache`, and `DefaultLayout.tsx` (lines 184 to 189) calls `clearUserCache(previous)` when a different person signs in without signing out, so one call covers both paths.
*   **Tests**: after `signOutCleanup(userId)` and after `clearUserCache(userId)` (called with the fake `storage` the existing tests pass, so no real IndexedDB is used) none of the three keys remains; another user's keys are untouched.

#### 17. `app/components/meals/RecipeList.tsx`, `app/components/meals/RecipeFilters.tsx`, `app/components/meals/RecipeForm.tsx`, `app/components/meals/IngredientLines.tsx`, `app/components/meals/StepsEditor.tsx`, `app/components/meals/RecipeMenu.tsx` (Create), `app/routes/recipes._index.tsx`, `app/routes/recipes.new.tsx`, `app/routes/recipes.$id_.edit.tsx` (Create), `app/components/meals/__tests__/RecipeList.test.tsx`, `RecipeForm.test.tsx` and `IngredientLines.test.tsx` (Create)

*   **Type / Scope**: Screens and routes.
*   **Why**: The library and the editor, as in "Views". The route is named `recipes.$id_.edit.tsx` (with the trailing underscore) so React Router's flat routes do not nest it inside `recipes.$id.tsx` when step 3 adds that file. Its types import is `./+types/recipes.$id_.edit`.
*   **Proposed Changes**:
    - Each route has a `meta` title ("Recipes – Hearthwise").
    - `IngredientLines` reads each ingredient line with `parseIngredientLine` and shows the reading beneath it. The paste handler removes list markers and blank lines.
    - `RecipeForm` checks the shared limits from `mealValidation.ts` before queuing, and keeps the text on a refusal. It uses the draft helpers from item 15.
    - In step 2 a library row links to `/recipes/:id/edit`, and `recipes.$id_.edit.tsx` renders `RecipeMenu` (Duplicate and Delete). Step 3 changes the row link to `/recipes/:id` and renders `RecipeMenu` in `recipes.$id.tsx` instead. The editor keeps a Delete button.
*   **Tests**: a name-only save; pasting ten ingredient lines with bullets; a paste over a limit is refused with the text kept; an unreadable ingredient line is kept and shown as such; a draft is removed only after success; a failed save keeps the draft and shows its cause; Duplicate; the filters.

#### 18. `app/components/layout/DefaultLayout.tsx` (Modify), `app/components/layout/__tests__/DefaultLayout.test.tsx` (Modify)

*   **Type / Scope**: Navigation.
*   **Why**: Adds the Recipes tab. The existing test asserts the tab bar is exactly Today, Shopping and Settings.
*   **Proposed Changes**: Insert Recipes after Today in `NAV_ITEMS` (icon `IconToolsKitchen2`). Step 4 inserts Plan after Today (icon `IconCalendar`), giving the order Today, Plan, Recipes, Shopping, Settings. Update the tab-bar assertions and the stale comment "The same three places on every device". `app/__tests__/touchTargets.test.ts` already checks that five tabs fit and is not changed.

#### 19. `app/__tests__/mutationRegistry.test.ts` (Modify), `app/lib/__tests__/persistedCache.test.ts` (Modify), `app/routes/__tests__/pages.test.tsx` (Modify)

*   **Type / Scope**: Guard tests.
*   **Why**: The existing registry test only scans sources for `useMutation` with a `mutationFn`. It does not check kinds or overlays, so these are new checks.
*   **Proposed Changes**:
    - For each key in `mealMutationKeys`, `client.getMutationDefaults(key)` has a `mutationFn` and `scope.id` `household`.
    - For each recipe key, `applyPendingRecipes` with a pending entry of that kind changes the data.
    - `persistedCache.test.ts` saves, restores and resumes one pending write of each recipe kind, from a cache written with `schemaVersion` 1.
    - Step 4 adds `planSet` to the loop. Step 5 adds `itemsFromPlan` to a loop over `itemMutationKeys` and checks that `applyPendingItems` and `applyPendingPlan` each change the data for it.
    - `pages.test.tsx` renders `/recipes` and the editor, and runs the axe check from `app/test-utils/accessibility.ts`. The axe check is new for this file.

### Step 3: Cooking view

#### 20. `app/lib/cookingState.ts` (Create), `app/lib/wakeLock.ts` (Create), `app/lib/__tests__/cookingState.test.ts` (Create), `app/lib/__tests__/wakeLock.test.ts` (Create)

*   **Type / Scope**: Device-local state.
*   **Why**: Ticks survive a locked phone and a remount, and the screen stays awake while cooking.
*   **Proposed Changes**:
    - `cookingState.ts` stores in `hearthwise.cooking.<userId>` an object by recipe id holding `{ day, ingredients: number[], steps: number[], servings }`. Its functions take `now: () => number` (default `Date.now`). The day is the phone's local date, with the hours before 4am counted as the previous day. An entry is replaced when its day differs from today's.
    - A servings value stored today wins over `?servings=`. "Start again" clears the ticks only, and resets servings to `?servings=` or the recipe's own.
    - `useWakeLock()` requests a screen wake lock when available, releases it on unmount, asks again when the page becomes visible, and does nothing where it is unsupported.
*   **Tests**: ticks survive a remount; reset on a new day; kept at 1am; separate per user; a storage that throws; the lock is released and requested again after the page is hidden and shown.

#### 21. `app/components/meals/CookingView.tsx` (Create), `app/routes/recipes.$id.tsx` (Create), `app/components/meals/RecipeList.tsx` (Modify), `app/routes/recipes.$id_.edit.tsx` (Modify), `app/components/meals/__tests__/RecipeList.test.tsx` (Modify: the row links to `/recipes/<id>`), `app/components/meals/__tests__/RecipeForm.test.tsx` (Modify: the Duplicate test moves), `app/components/meals/__tests__/CookingView.test.tsx` (Create)

*   **Type / Scope**: Screen and route.
*   **Why**: Cooking, as in "Views". Links to it carry the planned servings: `/recipes/<id>?servings=<n>&day=<yyyy-mm-dd>`. Tonight and the plan day sheet build the link (step 4). `day` is only the plan day the link came from, and is not used for ticks. A `servings` value that is not a whole number from 1 to 50 is ignored.
*   **Proposed Changes**:
    - Scaled amounts use `scaleFactor`, `roundAmount` (to the nearest step) and `formatAmount`. An ingredient line with no amount shows "Not scaled" when the factor is not 1. A note says "Steps are written for N servings."
    - A deleted recipe is read-only with a Restore button. If the id is not in the list after a refetch, the page says "This recipe is gone" with a link to `/recipes`, and while the refetch runs it says "Checking the recipe…". `RecipeMenu` (Edit, Duplicate, Delete) is rendered here.
    - The library row link changes from `/recipes/:id/edit` to `/recipes/:id`. The Duplicate and Delete menu moves here from the editor, and the editor keeps a Delete button.
*   **Tests**: doubled amounts; unreadable ingredient lines shown as typed and labelled "Not scaled" when the factor is not 1; ticks persist; "Start again"; the deleted state; axe.

### Step 4: Week plan

#### 22. `src/shared/schedule.ts` (Modify), `src/shared/__tests__/schedule.test.ts` (Modify)

*   **Type / Scope**: Date helper.
*   **Why**: One Monday rule for tasks and the plan.
*   **Proposed Changes**: Add and export `weekStart(day)` beside the private `mondayIndex`, returning the Monday on or before `day`. Tests: each weekday, a month boundary, a year boundary.

#### 23. `src/meals/applyPlan.ts` (Create), `src/meals/plan.ts` (Create), `src/meals/__tests__/plan.test.ts` (Create)

*   **Type / Scope**: Domain.
*   **Why**: The pure plan write rule, shared by the server and the overlay, and the server writes around it.
*   **Proposed Changes**:
    - `applyPlanWrite(existing: PlanDay | undefined, day, write: { meal: PlanMeal | null; mealAt: number }, userId, serverNow)` is pure and returns `{ result: 'created' | 'applied' | 'noop'; day?: PlanDay }`. A newer `mealAt` wins. Any change to `meal` (a different dinner, different servings or a clear) removes `addedAt` and `addedBy`. A clear removes `meal` and keeps `fieldTimes.meal`.
    - `setPlanDay(store, ctx, day, input, nowMs)`: clamps `mealAt` and `clientAt` with `clampTime` (an absent `clientAt` is server time). It judges the day range at `clientAt` in the household's zone (`dayInZone`). A missing day is created with a write that succeeds only if the day does not exist. An existing day is changed with a conditional update on `updatedAt`, retried up to three times. `expiresAt` is the day plus 60 days.
    - `applyPlan.ts` also exports `sameMeal(a: PlanMeal | undefined, b: PlanMeal): boolean` (same title, the same `recipeId` or both absent, the same `servings` or both absent). `addPlanToList` and `applyPendingPlan` both use it.
    - `listPlan(store, ctx, from, nowMs)` queries `skPrefix 'PLAN#'` (the store has no range query), drops days before `from` and days whose `expiresAt` is in the past (the store's expiry can lag by up to two days), and sorts by day.
*   **Tests**: set; clear; set after clear; an older write loses to a newer clear; an out-of-range day is a 400; a write made offline and replayed after the window moved is accepted; replay; the marker is removed by a change of dinner and by a change of servings; a recipe id that matches no recipe is accepted; expired days are dropped.

#### 24. `src/api/meals.ts` (Modify), `src/push/events.ts` (Modify), `src/api/__tests__/meals.test.ts` (Modify), `src/api/__tests__/apiRoutes.test.ts` (Modify)

*   **Type / Scope**: Routes and notification wording.
*   **Why**: Exposes the plan.
*   **Proposed Changes**: Register `GET /api/hh/plan` and `PUT /api/hh/plan/{day}` with `guarded([])`. `PUT` answers 200. A `day` that is not a real date is 404, and a bad `from` is 400. `planChanged(actor, dayLabel, title | undefined, mutationId)` returns `base('plan.changed', mutationId, `${actor} changed the plan`, title === undefined ? `Cleared ${dayLabel}` : `${dayLabel}: ${title}`, '/plan')`. The route builds `dayLabel` as the weekday name and day of the month in the household's zone ("Friday 20"), and defaults `from` to 14 days before today in that zone. `notifyAfter` sends it. `notifyOther` drops a push whose `clientAt` is more than 30 minutes old, so a plan change replayed after a long wait sends nothing. That is accepted.
*   **Tests**: `GET` returns days from `from`; `PUT` set, clear, a non-date day (404), a bad `from` (400) and an out-of-range day (400 `day`); replay through the write record; another household cannot read the plan; `planChanged` text for a set and a clear; a push is dropped when `clientAt` is over 30 minutes old; the route list in `apiRoutes.test.ts` includes both routes in registration order.

#### 25. `app/lib/mutations.ts` (Modify), `app/lib/plan.ts` (Create), `app/lib/planOverlay.ts` (Create), `app/hooks/usePlanActions.tsx` (Create), `app/lib/__tests__/plan.test.ts` (Create), `app/lib/__tests__/planOverlay.test.ts` (Create), `app/hooks/__tests__/usePlanActions.test.tsx` (Create)

*   **Type / Scope**: Client data and actions.
*   **Why**: The plan on the phone, with pending writes laid on top.
*   **Proposed Changes**:
    - Add `planSet: Common & { day: string; meal: { recipeId?: string; title: string; servings?: number } | null }` to the meals group, sent as `PUT /api/hh/plan/{day}` with `meal` and `mealAt` set to `v.at`. It invalidates `['plan']`.
    - `PLAN_KEY = ['plan']`. `usePlan()` polls every 10 seconds and returns `{ status; days; today; recipesCheckedAt: number | undefined }`. It reads `household.data.household.timezone` for today's date, as `useTasks` does, and that zone is also the one the Tonight card uses.
    - Pure helpers: `weekDays(start, count)` over `weekStart`; `displayTitle(day, recipes)` (the live title while the recipe exists and is not deleted, otherwise the stored copy); `recipeState(day, recipes, fetchedAt)`. Here `recipes` is the cached list (undefined while it has never loaded) and `fetchedAt` is the `dataUpdatedAt` of the recipe query when the refetch that the plan screen triggered finished, or undefined if none has finished. `recipeState` returns `found` if a non-deleted recipe has the id, `deleted` if a deleted recipe has it, `checking` if the id is absent and `fetchedAt` is undefined, and `gone` if the id is absent and `fetchedAt` is defined.
    - `usePlan` keeps a ref of the recipe ids it has already refetched for, to avoid repeat calls, and calls `queryClient.refetchQueries({ queryKey: RECIPES_KEY })` once per mount for each missing id. `recipesCheckedAt` is React state set when that call resolves successfully, and is passed to `recipeState` as `fetchedAt`. If the refetch fails or the phone is offline, it stays undefined, so the day keeps showing "Checking the recipe…".
    - `applyPendingPlan(data: PlanData, pending)` in `planOverlay.ts` applies `planSet` with `applyPlanWrite`. In this step it handles `planSet` only.
    - `usePlanActions` offers `set(day, meal)` and `clear(day)`.
*   **Tests**: `weekDays`; `displayTitle`; `recipeState` in all four outcomes; the refetch fires once per missing id; the overlay applies a pending set and a pending clear; the registry test of item 19 covers `planSet`.

#### 26. `app/components/meals/WeekPlan.tsx`, `app/components/meals/DaySheet.tsx`, `app/components/meals/Tonight.tsx`, `app/components/meals/EasyPicks.tsx` (Create), `app/routes/plan.tsx` (Create), `app/routes/_index.tsx` (Modify), `app/components/layout/DefaultLayout.tsx` (Modify), `app/components/meals/__tests__/WeekPlan.test.tsx`, `DaySheet.test.tsx`, `Tonight.test.tsx` and `EasyPicks.test.tsx` (Create), `app/routes/__tests__/today.test.tsx`, `app/routes/__tests__/pages.test.tsx` and `app/components/layout/__tests__/DefaultLayout.test.tsx` (Modify)

*   **Type / Scope**: Screens and routes.
*   **Why**: The plan, the Tonight card and "Pick something easy", as in "Views".
*   **Proposed Changes**:
    - `plan.tsx` has the `meta` title "Plan – Hearthwise" and the `Route` types import used by the other routes.
    - `Tonight` renders on Today and links to `/recipes/<id>?servings=<n>&day=<yyyy-mm-dd>`. `EasyPicks` is shared by Today and Plan. Tapping a recipe in it shows that recipe inside the same sheet: its title, minutes, the low-energy mark, a "Make this tonight" button (which calls `usePlanActions.set(today, { recipeId, title, servings })` and closes the sheet) and an "Open recipe" link to `/recipes/<id>`. A back control returns to the shortlist. `DaySheet` shows an "Open recipe" link, built as in item 21, whenever `recipeState` is `found` or `deleted`. A plain-name dinner on the Tonight card opens nothing.
    - The Plan tab is added to `NAV_ITEMS` after Today.
    - Update `app/routes/__tests__/today.test.tsx`, which mocks only `~/lib/queries` and `~/lib/household`: the Tonight card needs `usePlan` and `useRecipes` mocked. Update the `DefaultLayout` tab-bar assertions again.
*   **Tests**: a planned day; a plan day with nothing planned; a plan day with a plain-name dinner; "Tonight" with and without a dinner; a shortlist with fewer than three matches; the CUJ 11 note; "Last changed by" for another person; a plan day whose recipe is not yet in the cache shows "Checking the recipe…" and is not called gone; a plan day whose recipe is deleted and one whose recipe is purged; axe on `/plan`.

### Step 5: Add to the shopping list

#### 27. `src/meals/addToList.ts` (Create), `src/api/meals.ts` (Modify), `src/meals/__tests__/addToList.test.ts` (Create), `src/api/__tests__/meals.test.ts` (Modify), `src/api/__tests__/apiRoutes.test.ts` (Modify)

*   **Type / Scope**: Domain and route.
*   **Why**: The add, as in "Add to the shopping list".
*   **Proposed Changes**:
    1.  `addPlanToList(store, ctx, input, nowMs)` reads the write record first.
    2.  It creates each shopping line ten at a time through `writeEntry`, with `{ id, write: { text: { value: text, at }, quantity?: { value, at }, forRecipes? } }`, where `at` is `clampTime(clientAt, nowMs)` and `clientAt` defaults to `nowMs`. Statuses are those `writeEntry` returns (`created` or `noop`).
    3.  It marks each listed plan day. The stored `meal` equals the listed one when the title, the `recipeId` (or both absent) and the `servings` (or both absent) are all equal. If they are equal it runs `{ update: planKey, set: { addedAt: nowMs, addedBy: userId, updatedAt: max(nowMs, old updatedAt + 1) }, ifEquals: { updatedAt } }`. A missing day, a different `meal` or a lost race is skipped and counted.
    4.  It writes the record with ids and counts only.
    - The route passes `itemsBatch(ctx.member.displayName, lines.length, 0, mutationId)` to `notifyAfter`, using `fresh` from the outcome. `notifyOther` drops a push older than 30 minutes, so an add replayed after a long wait sends nothing. That is accepted. The route logs one `plan_add` line. `POST /api/hh/plan/add-to-list` is registered with `withHousehold(guarded([], ...))` and answers 200 with `{ results }`, passing through any status `writeEntry` returns, and 400 for any invalid field.
*   **Tests**:
    - replay writes nothing and returns the same answer;
    - a retry after a crash between the shopping lines and the record completes (a store wrapper throws on the Nth `transact`), notifies once, and sets the markers again;
    - two parallel adds both succeed;
    - 100 shopping lines pass and 101 are a 400;
    - a bad shopping line is a 400 and writes nothing;
    - a duplicate day or shopping line id is a 400;
    - a plan day that expired, or whose `meal` changed, is skipped without failing and gets no marker;
    - a hand-typed "onions" already on the list is not touched;
    - the write record holds no shopping line text.

#### 28. `app/lib/mutations.ts` (Modify), `app/lib/itemOverlay.ts` (Modify), `app/lib/planOverlay.ts` (Modify), `app/lib/__tests__/mutations.test.ts` (Modify), `app/lib/__tests__/itemOverlay.test.ts` (Modify), `app/lib/__tests__/planOverlay.test.ts` (Modify)

*   **Type / Scope**: Client.
*   **Why**: The add shows at once and survives a reload.
*   **Proposed Changes**: Add `itemsFromPlan: Common & { days: { day; title; recipeId?; servings? }[]; lines: { id; text; quantity?; forRecipes? }[] }` to the item group, sent as `POST /api/hh/plan/add-to-list`. It invalidates `['items']` and `['plan']`. In `itemOverlay.ts` it creates the shopping lines with `applyItemWrite`, including `forRecipes`. In `planOverlay.ts`, for each listed plan day whose cached `meal` passes `sameMeal`, it sets `addedAt` to `v.at` and `addedBy` to `v.by`. The server sets the marker under the same rule. Step 1 added `forRecipes` to the server types, and this item adds it to the overlay. No screen shows `forRecipes` until the `ItemRow` change in item 29, and the split is deliberate.
*   **Tests**: the shopping lines the overlay shows equal the shopping lines the server stores; a failed add removes them when it settles; a cache saved with `schemaVersion` 1 and a pending `itemsFromPlan` restores and replays; `itemsFromPlan` has a registered default and changes both overlays (the registry test of item 19).

#### 29. `app/components/meals/AddToListSheet.tsx`, `app/components/meals/ReviewLine.tsx`, `app/lib/reviewState.ts` (Create), `app/components/shopping/ItemRow.tsx`, `app/components/meals/WeekPlan.tsx` (Modify), `app/components/meals/__tests__/AddToListSheet.test.tsx`, `app/lib/__tests__/reviewState.test.ts` (Create), `app/routes/__tests__/shopping.test.tsx` (Modify, for the `forRecipes` line)

*   **Type / Scope**: Screens.
*   **Why**: The review, as in "Views".
*   **Proposed Changes**:
    - The sheet shows plan days with Include switches and review lines from `buildLines` with the "I have this" button, the "2 + 1 from ..." line, the "Not scaled" label, the "You already have ... on the list" hint (an open shopping line whose text, read with `parseIngredientLine`, has the same normalised name), the "Add N lines" button (N counts the review lines not marked), and the message shown above 100 review lines to add.
    - The `mutationId` and the shopping line ids are made once when the sheet opens and kept while it is open. The button is disabled after the first tap.
    - `reviewState.ts` keeps the sheet's state in `hearthwise.review.<userId>` as `{ savedAt: number; included: Record<day, boolean>; have: string[]; mutationId: string; ids: Record<key, uuid> }`, where `have` holds the keys of review lines marked "I have this" and `ids` gives each review line a stable shopping line id, so a line switched off and on keeps its id. It is ignored and removed when `savedAt` is more than an hour old, and cleared when the add is sent or cancelled.
    - The review lists every plan day from today onwards that has a dinner, up to 35, in date order. `WeekPlan` gets the "Add to shopping list" button that opens it. Tapping Add queues `itemsFromPlan`, clears the saved state, closes the sheet and shows a toast "Added N lines to the shopping list". Cancel closes it and clears the state. The days sent are those whose Include switch is on and that have a usable recipe, each with `recipeId`, `title` and `servings` as the client saw them.
    - `ItemRow` shows `forRecipes`. `WeekPlan` shows "On the list".
*   **Tests**: CUJ 5 end to end with the hand-typed "onions" untouched; CUJ 6; a double tap sends the shopping lines once; the state survives a remount; marking every review line leaves the button off; above 100 review lines to add disables Add, and marking some "I have this" enables it again; a plan day whose recipe is being checked cannot be included; Cancel writes nothing.

### Step 6: Finish

#### 30. `app/__tests__/wording.test.ts` (Modify)

*   **Type / Scope**: Wording test.
*   **Why**: The existing test already scans every file under `app/` for one banned regex (`overdue|missed|streak|late|failed to complete`). Adding the new words to it would fail on existing code, such as the "Forgot your password?" text in `LocalAuthForm.tsx`.
*   **Proposed Changes**: Add a second regex, `BANNED_PHASE_2 = /\b(forgot|skipped|incomplete|missing|unplanned)\b/i`, tested only against `app/components/meals/**`, `app/routes/recipes*.tsx`, `app/routes/plan.tsx`, `app/lib/{recipes,recipeOverlay,plan,planOverlay,cookingState,reviewState,recipeDraft,wakeLock}.ts` and `app/hooks/{useRecipeActions,usePlanActions}.tsx`. Add a test that each fixed phrase in "Wording" appears in the readable text of at least one file in that set.

#### 31. `docs/MANUAL-CHECKS.md` (Modify)

*   **Type / Scope**: The release checklist, run by a person on two real phones.
*   **Why**: Some behaviour can only be checked on a real phone.
*   **Proposed Changes**: Add these checks:
    - Type a recipe from a real card on a phone and time it.
    - Plan a week and see it on the other phone.
    - Open Tonight and the cooking view on a real phone: the screen stays awake and the ticks survive a lock.
    - Read a recipe, the plan and the list in airplane mode.
    - Add a planned week to the list and check the review lines, and the shopping lines they become, against a hand count.
    - Check that no screen relies on colour alone.
    - Run the month-later check (the success measure).

#### 32. `e2e/offline/main.tsx` (Modify), `e2e/offline/offline.spec.ts` (Modify)

*   **Type / Scope**: Offline test.
*   **Why**: The spike page in `e2e/offline/main.tsx` is a standalone stub that "does not use any app code", with only the kinds `add` and `rename`, so the spec alone cannot test recipes.
*   **Proposed Changes**: In `main.tsx`, add two registered kinds, `recipeAdd` and `planSet`, and make the stub API handle `PUT /api/hh/recipes/{id}` and `PUT /api/hh/plan/{day}`, recording each by `mutationId`. In `offline.spec.ts`, add a case: with the network off, queue a recipe add and a plan set, close the page during backoff, reopen it, go online, and check that each `mutationId` is stored once. This checks the queue behaviour only. The real recipe and plan screens are covered by the Vitest tests in steps 2 to 5.

#### 33. `docs/ROADMAP.md`, `CLAUDE.md`, `docs/DECISIONS.md`, `README.md` (Modify)

*   **Type / Scope**: Documentation.
*   **Why**: The project's own guides must describe phase 2.
*   **Proposed Changes**: `ROADMAP.md` gets a Phase 2 list with these six steps. `CLAUDE.md` gets a "Meals" line in its Architecture list beside the Tasks and Shopping lines (`src/meals/`, routes in `src/api/meals.ts`, the two pure modules), and its status line moves to phase 2. `DECISIONS.md` gets "Phase 2 design (2026-11-14)" with the decisions Claude made while the author was away, and "Spec says / Built / Why" rows wherever a step differs. `README.md` lists recipes, the plan and the cooking view.

#### 34. `docs/designs/phase-1-foundation.md` (Modify)

*   **Type / Scope**: Design.
*   **Why**: Phase 1's cost section assumed two polled lists.
*   **Proposed Changes**: In "Performance & Cost", note that polling is now 3 requests per 10 seconds (tasks, shopping items and plan days), with a link to this design. Nothing else in phase 1 changes.

### Verification Plan

*   **Compilation/Build**: `yarn typecheck` and `yarn build` pass after every step.
*   **Unit Tests**: `yarn test` passes. The reading, scaling, rounding and merging tests are table-driven. The store contract tests also run against DynamoDB Local with `DYNAMODB_ENDPOINT=http://localhost:8000 yarn test`.
*   **Static Analysis and Linting**: The wording test, the mutation-registry test, the touch-target test and the infrastructure guard test pass, with the changes this plan makes to the first two.
*   **Test Coverage Requirement**: Every new domain function has a failing test written first. The pure modules have a test for every row in the worked examples and every limit.
*   **E2E/Integration**: `yarn test:e2e` runs the offline case added in step 6. The axe check runs on every new route.
*   **Manual**: Run the new lines in `docs/MANUAL-CHECKS.md` on two real phones before phase 2 is called done, including the one-month check.
*   **Compatibility**: A test restores a saved cache with `schemaVersion` 1 that holds a pending recipe write and a pending shopping-line add, and both replay.

--------------------------------------------------------------------------------

*Drafted with EGM*
