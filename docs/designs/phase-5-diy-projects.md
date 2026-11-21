# Hearthwise: Phase 5 (DIY Projects)

* **Author:** kingchappers
* **Status:** Built (steps 1 to 6), reviewed in five stages by independent reviewers with the fixes applied (see "Review history"). The author approved the design and the build; the real-phone checks are still to run. The author has agreed the decisions marked **Author**; every decision marked **Claude** (Claude is the AI assistant that drafted this design) stands unless the author changes it.
* **Date:** 2026-11-21

--------------------------------------------------------------------------------

## Overview

Phase 5 adds a Projects page where the two people in a household keep a shared, ordered plan for a DIY job: redecorating a room, fixing a plug, taking down decking, building a garden room. Either person can add and edit steps. A person can mark a step "I'm on this", so the other can see it is taken and leave it alone. A project can also hold a plain materials list that copies onto the shopping list, an optional planned day that shows on the calendar, and optional estimated and actual costs that stay apart from the money ledger.

The feature reuses the household, write-record, offline-queue, recycle-bin and notification machinery from phases 1 to 4 (see [`phase-1-foundation.md`](phase-1-foundation.md), [`phase-2-meal-plan.md`](phase-2-meal-plan.md), [`phase-3-money-tracker.md`](phase-3-money-tracker.md) and [`phase-4-calendar.md`](phase-4-calendar.md)). It adds no outside service and no infrastructure. The new work is a new kind of record (a step), a rule for two people taking the same step, and a way to keep a step order that two phones can change at once. The roadmap is [`../ROADMAP.md`](../ROADMAP.md).

### How this design was made

The author was interviewed one question at a time about what a DIY project is for them, and the answers set the problem, the scope, the choice to keep costs apart from the ledger, and the rule that the first person to reach the server takes a step. A brief ([`phase-5-diy-projects-concepts-brief.md`](phase-5-diy-projects-concepts-brief.md)) was then read against the code by six independent reviewers (design, codebase, simplicity, a cold reader, implementation readiness, structure), and their findings are in the brief. This design was then reviewed in five stages (see "Review history"). Every other decision is marked **Claude** in the decisions table. "Open Questions" lists the ones to check first.

### The app today (for a reader new to the project)

Hearthwise is a web app for one household of exactly two people. It runs either as an API Lambda and a push Lambda on AWS, or as one self-hosted container (a Node server on SQLite), from the same code. Its tabs are Today (what is due now), Plan, Recipes, Shopping, Money and Settings. Plan has a "Dinners | Calendar" switch. Tasks (chores and to-dos) have an owner, a due date, an optional repeat rule and a proposal flow when one person wants to change the other's task. Each person can turn on push notifications; nothing is sent unless a person asked for it. The app saves its data and its pending writes on the device, so it works with no signal.

### Terms used below

| Term | Meaning |
|---|---|
| CUJ | Critical user journey: one end-to-end scenario, in the section of that name. |
| Project | A DIY job with a title and, optionally, steps, notes, materials, a planned day and costs. A job with only a title is a project. |
| Step | One piece of work inside a project. It is its own stored record. |
| Take, taken | What "I'm on this" does: it records who has a step or a project (the holder) and shows a step as "On it". Internally "take"; the screen says "I'm on this". The word "claim" is not used, because phase 4 already uses it for a send-once record. |
| Holder | The person recorded as having taken a step or project. Only a current member counts; anyone else reads as no holder. |
| State | A step is Not started, On it, or Done. Only `todo` and `done` are stored; "On it" is `todo` with a holder. |
| Position | A short text value on each step that sorts the steps. Moving one step rewrites only that step. |
| Finished | A project can be marked finished (`status` `finished`). It leaves the default list, is shown under "Finished", and is not deleted. This is the only word used for the state. |
| Envelope | The three fields every write carries: `mutationId`, `clientAt` and `notify` (`ENVELOPE_KEYS` in `src/shared/taskValidation.ts`). |
| Outcome | What a write, take or release answers with a 200. Writes: `created`, `applied`, `noop`, `gone`. Takes and releases: `taken`, `already_yours`, `held_by_other`, `done`, `gone`, `released`, `not_held`. `gone` means the record is deleted, or is not there under a project that exists. |
| Stale field | A field whose write was older than the stored value and so changed nothing. |
| Conditional update | A `transact` update with `ifEquals`, `ifMissing` or `mustExist`: the store applies it only if the condition holds, else it throws `ConditionFailedError`. See CLAUDE.md, "Store". |
| Materials | A plain list of text lines on a project ("6 lengths of 47x100 timber, 2.4m"). Nothing reads or scales them. |
| Planned day | An optional date, or a start and an end date, on a project. It is not a deadline. |
| Recycle bin | What the app calls the list of deleted items that can be restored. The data rows call a deleted item a tombstone. |
| Write record | Every write carries a client-made `mutationId`. The server stores a `MUT#<id>` record so a retry is answered from the record and writes nothing (`src/api/writeRecord.ts`). |
| Mutation queue, overlay | The app saves every household write and sends it when online (registered once in `app/lib/mutations.ts`). The overlay lays pending writes over cached data so a change shows before the server confirms it. |
| Per-field last-writer-wins | Each field stores the client time it was last set; an older write never overwrites a newer one. |
| Household guard | `withHousehold` wraps every household route and supplies the household id, which never comes from the request. |
| Household move check | `moveOptions` in `src/household/invites.ts`: a person alone in a household with no data may move to another household, so every prefix that holds data is listed in it. |
| Plan switch | The "Dinners \| Calendar" links at the top of Plan (`PlanSwitch.tsx`). |
| Guard tests | The checks that run on every `yarn test` and pin a rule (wording, registry, touch targets, accessibility, infrastructure). |
| Timeline | The day's items in order: events, imported items, tasks due and the dinner. It is worked out on the device each time and never stored (`src/shared/timeline.ts`). |
| Let them know | The tick on a write (`notify` in the request) that sends the other person a push. |
| Hoardwise | The author's separate budgeting app, the sibling that Hearthwise's scaffolding came from. The two share an AWS account, so "nothing points at it" means no shared table, key, parameter or resource name: every key here is under `HH#<hid>` and every name starts with `hearthwise`. |

## The Problem

The two people do DIY work together, and the jobs vary from a plug to a garden room. The plan for a job lives in one person's head, and so does the research. The person who holds the plan finds it hard to put into words, and the other person cannot see it. So the second person suggests steps that were already in the plan, which reads as "I don't think you know what you are doing". They also sometimes start the same job, because neither can see who has it.

Both people want a plan. What they lack is a way to share and collate it: one place that shows the steps in order, who has each one, and what is left. Both people are autistic, ADHD or both, so the place has to be quick to fill in with rough notes, calm in its wording, and free of anything that turns a plan into something to be approved.

## Goals

*   **G1.** Give each project a shared, ordered list of steps that either person can add to, edit, reorder and tick off, with no lock and no approval.
*   **G2.** Let a person mark a step or a whole project "I'm on this", and show the other person who has it. The first person to reach the server holds it.
*   **G3.** Keep a small job small: a project with only a title works, with no steps, no date and no materials.
*   **G4.** Let a project hold a plain materials list, and copy it onto the shopping list with each line labelled with the project.
*   **G5.** Let a project have an optional planned day (or start and end days) that shows on the calendar's day view.
*   **G6.** Let a project optionally record an estimated and an actual cost, with the figures shown as figures and never as a verdict, and kept apart from the money ledger.
*   **G7.** Work offline like the rest of the app, with a visible "Not saved yet" state, and replay each write once.
*   **G8.** Limit what two people editing at once can overwrite to the same field of the same step, and lose no words: the person whose edit is replaced is told in calm words and keeps their text so it can be copied.
*   **G9.** Use neutral, low-shame wording, no red, and say state and ownership in words, never only in colour.

Success measure, checked by asking the two people after a month (as `docs/MANUAL-CHECKS.md` does for phases 2 to 4): each opens the plan instead of asking the other what is next, and neither starts a step the other has. If not, note what is missing.

## Non-Goals

*   A lock on a plan while one person edits it. It cannot work offline, can get stuck, and blocks the case of both people adding steps.
*   Approval of a plan or a step by the other person.
*   Steps on Today, in the Due strip, in the digest or in nudges, and due dates on steps.
*   Photos, attachments and sketches.
*   Any link to the money ledger, splitting project costs, or recording who paid.
*   Parsing, scaling or merging materials like recipe ingredients.
*   Reminders for a planned day.
*   A seventh tab, and dragging to reorder (the page offers "Move up" and "Move down").
*   Private projects or steps. Both people see everything.
*   Changing the household's other data, or anything that points at Hoardwise.

## Open Questions

Decisions the author has not yet reviewed. Each has a default, marked Claude, that stands unless the author changes it. They are in the order most worth a look.

*   **A Today line.** The author does not want Today cluttered, so the plan is opened from Plan. The reviewers point out that a step the other person has taken is then visible only to someone who opens the plan. Default: no Today line. A single quiet line ("1 step is yours on Fix the fence") is an easy later change.
*   **The planned day.** One day, or a start day and an end day (a weekend)? Default: a start day and an optional end day.
*   **The cost shape.** Two project-level figures (estimate and spent) that either person edits, where a concurrent edit of one figure loses one and the screen says who changed it last; or a list of spend entries with a computed total, which loses nothing but is a small ledger. Default: two figures. Costs are the last functional step and the first to cut.
*   **The word "Project".** It sounds large for a plug. "Job" is the alternative. Default: "Project", with the wording reviewed in the draft.
*   **A finished project and how long a deleted one stays.** Default: a finished project leaves the default list, and a deleted project stays in the recycle bin for 30 days (as tasks, items and recipes do; money entries never expire).
*   **"Let them know".** On adding a step only, or also on "I'm on this" and Done. Default: an opt-in tick on any write, and no other push.
*   **Old queued writes.** A phone on an older app after a rollback drops its whole saved queue when it meets a key it cannot replay, including that person's unrelated shopping, task and calendar writes. Default: accepted. Replay on the same version is tested; there is no skip mechanism for old apps.
*   **Materials are records, not one text field.** The brief said plain text lines. The Technical Plan makes each line its own record, so two people adding lines at once lose none, and so the shopping item can use the line's id and a second press skips lines already there. It costs one more record kind and prefix. The alternative is one text field with a lost-edit notice, and a calm "some of these may already be on the list". Default: records.
*   **Undo of a deleted step is a re-add.** It writes the same text again under a new id, so a held or done step comes back not started. The alternative is a restore kind for steps and materials, which widens the Deleted page and the restore code. Default: re-add.
*   **Tidy order.** Decided with the review: there is no automatic re-spacing, as the brief said. A move that would need a position over 64 characters is refused on the phone with a calm line, and the person moves a different step. Default: refuse.
*   **Where to cut.** Steps 1 and 2 are a usable plan on their own. Costs (step 5) are the first cut and materials (step 3) the second.

## Critical User Journeys (CUJs)

### CUJ 1: Sam writes down the decking plan

*Goals: G1, G7.*

*   **Given**: Sam is signed in and knows the order of work for taking the decking apart, but finds it hard to say aloud.
*   **When**: Sam opens Plan, then Projects, then "New project", calls it "Take down the decking", and adds steps as short lines: "Clear the plants", "Lift the boards", "Check the joists", "Remove the joists". Sam adds a note to "Check the joists" and moves a step up.
*   **Then**: The page shows the steps in order, each "Not started". Alex opens the same project within 15 seconds and sees them all. Nothing asked Alex to approve anything.

### CUJ 2: Alex adds a step Sam missed

*Goals: G1.*

*   **Given**: Alex has the project open on another phone.
*   **When**: Alex adds "Ring the council about the skip" between two steps.
*   **Then**: Sam's page shows the new step in that place, with "Added by Alex". No lock stops either person. If both add a step at the same moment, both steps are there.

### CUJ 3: Both take the same step

*Goals: G2, G7, G8.*

*   **Given**: Sam and Alex both have no signal and both see "Lift the boards" as Not started.
*   **When**: Alex taps "I'm on this" first, then Sam does, and the phones reconnect with Sam's tap reaching the server first.
*   **Then**: The server accepts the first tap to reach it and answers the other with a status, not an error. Alex's phone then shows "Sam is on this" with a calm note, "Sam already has this", and "I'm on this" is not offered there. Nothing is lost and nothing is shown as failed. Either person can release a step; a release by someone else is shown.

### CUJ 4: A plug

*Goals: G3, G2.*

*   **Given**: A plug needs fixing.
*   **When**: Alex adds a project called "Fix the hall socket" with a title only, and taps "I'm on this" on the project.
*   **Then**: The list shows "Fix the hall socket, Alex is on this". There are no steps, no date and no materials, and none are asked for. Alex can mark it finished when done.

### CUJ 5: Two edits to one step

*Goals: G8.*

*   **Given**: Sam and Alex both reword "Check the joists" while offline, Alex later than Sam.
*   **When**: Both phones reconnect.
*   **Then**: Alex's wording stays (the newest device time wins; a phone with its clock set ahead wins). Sam's page shows "This was changed after you wrote it. Your wording is kept here." with Sam's own wording below it so Sam can copy it, and the step says "Last changed by Alex". The notice stays until Sam dismisses it, and the words "conflict", "rejected" and "lost" are not used.

### CUJ 6: Reordering

*Goals: G1, G7.*

*   **Given**: The steps are in an order Alex thinks is wrong.
*   **When**: Alex taps "Move up" on "Remove the joists" twice, on a phone with no signal.
*   **Then**: The step moves on Alex's screen at once and is marked "Not saved yet". When the signal returns it is saved once, and Sam's page shows the same order. If Sam moved a different step at the same time, both moves are kept.

### CUJ 7: Materials to the shopping list

*Goals: G4.*

*   **Given**: Sam has typed materials on the project: "6 lengths of 47x100 timber, 2.4m", "1 box of 75mm screws".
*   **When**: Sam taps "Add to the shopping list".
*   **Then**: Each line becomes a shopping item labelled "for Take down the decking". A line typed by hand on the shopping list is untouched. Ticking an item on the list does not change the project's materials. Pressing the button again skips every line already added, says "Already on the list", and leaves a line Sam edited on the list as Sam left it.

### CUJ 8: A planned day

*Goals: G5.*

*   **Given**: Sam picks Saturday 5 December for the decking.
*   **When**: Sam sets "Planned for" on the project.
*   **Then**: The calendar day view for that Saturday shows "Project: Take down the decking" in the strip with tasks due and the dinner, and it links to the project. The day passing changes nothing and uses no word like due or late. A project with no day does not appear on the calendar.

### CUJ 9: Costs

*Goals: G6.*

*   **Given**: Sam and Alex want to see what the garden room is costing.
*   **When**: Sam adds an estimate of £4,000 and later enters £1,250 as spent.
*   **Then**: The project shows "£1,250 of £4,000" and "Last changed by Sam". The screen says "Not in Money. This is only for the project." The Money page and its total are unchanged. A project with no figures shows no cost area.

### CUJ 10: Finishing, deleting and restoring

*Goals: G1, G3.*

*   **Given**: The decking is down.
*   **When**: Sam marks the project finished, and later Alex deletes a different project by mistake.
*   **Then**: The finished project leaves the default list and can be found under "Finished". The deleted project and its steps appear on the Deleted page as one row ("12 steps, 8 materials") and come back together when restored.

### CUJ 11: No signal

*Goals: G7.*

*   **Given**: Sam is in the garden with no signal.
*   **When**: Sam opens a project already loaded, ticks a step Done and adds a step.
*   **Then**: Sam sees the saved plan, the tick and the new step show at once, each marked "Not saved yet", and both go through once when the signal returns. Adding materials to the shopping list works the same way. Sam never sees a step marked gone merely because it was not in the saved copy.

### CUJ 12: The other person leaves

*Goals: G2.*

*   **Given**: A step is marked "Alex is on this" and Alex is later removed from the household.
*   **When**: Sam opens the project.
*   **Then**: The step reads as free, so Sam can take it. No hold shows a name that no longer belongs to the household. (`createdBy` of a step Alex wrote still reads "Former member".)

### CUJ 13: A household at the limit

*Goals: G3, G9.*

*   **Given / When**: The household has 60 projects and Sam saves a new title.
*   **Then**: The page says "This household has reached 60 projects." in plain words and keeps Sam's title in the sheet. Nothing is shown as failed.

## Technical Plan (Architecture)

### Decisions this plan rests on

| Decision | Choice | Decided by |
|---|---|---|
| What a plan is | A project with ordered steps. Either person edits; no lock, no approval. | Author |
| Conflicts: no lock | No lock on a plan. | Author (rejected a lock after hearing the trade-offs) |
| Conflicts: how | Each step is its own record with per-field last-writer-wins, as recipes have. | Claude |
| Taking a step | The first person to reach the server holds it. | Author |
| The answer to a refused take | A 200 with an outcome (`held_by_other`), not a 409, because a 4xx is final in the retry rules. | Claude |
| Who can release | Either person; a release by someone else is shown. | Claude |
| Where the plan is opened | Its own page. Steps are not tasks and do not appear on Today. | Author |
| Money | Costs are optional, estimated and actual, and never touch the ledger. | Author |
| Planned day | Optional, shown on the calendar day view. | Author |
| Steps as records | `PSTEP#<projectId>#<stepId>`, not tasks. | Claude |
| Materials as records | `PMAT#<projectId>#<lineId>`, one per line, unordered. This changes the brief, which said plain text lines. It is the cheapest way to lose no line when both people add at once, and to copy to the shopping list once. | Claude |
| Step order | A `position` string on each step, worked out on the phone, with its own field time and an id tie-break. A move that needs over 64 characters is refused on the phone; nothing is re-spaced. | Claude |
| Step states | Stored `todo` or `done`. "On it" is not stored: it is `todo` with a holder. | Claude |
| A hold | `takenBy` and `takenAt`, outside the field times, changed only by a conditional update. A project's hold and its steps' holds are separate. | Claude |
| Replaced edits | The write answer lists the stale fields; the app keeps the person's text on the device until dismissed. | Claude |
| Finished | A project has `status` `active` or `finished`. Finished projects stay in the list under "Finished". | Claude |
| Deleting a project | Tombstone the project; steps and materials are hidden by it and given the same 30-day expiry in bounded batches. Restore un-marks them first. | Claude |
| Deleting a step or material | A tombstone, not listed on the Deleted page. "Undo" writes the same text again under a new id. | Claude |
| Label on the shopping line | The existing `forRecipes` field, holding the project title. | Claude |
| Material copied to the list | The shopping item's id is the material's id, and the route skips any id whose item already exists, so a second press writes nothing. | Claude |
| Planned day on the calendar | An all-day strip item built on the device by `buildTimeline`, not an event. | Claude |
| Navigation | A third option on the Plan switch, `/plan/projects`. No seventh tab. No Today line. | Claude |
| Reads | A list route with derived step counts (and `?counts=0` for Today and the calendar, which need no counts), and a detail route for one project. | Claude |
| Notifications | An opt-in tick (the existing "Let them know"). The text is fixed and holds no title. | Claude |
| Privacy | Projects are not private. Both people see everything. | Claude |
| Infrastructure | None. | Claude |
| Cache version | `CACHE_SCHEMA_VERSION` stays 1. Every change is additive. | Claude |

### What is reused, and what each reuse costs

| Reused | How | Cost |
|---|---|---|
| Household guard, `guarded`, router, `withWriteRecord`, `replayOf` | Every route is `withHousehold` and every write is a `mutationId` write, unchanged. | None. |
| The recipe write rule (`applyRecipe.ts`, `recipes.ts`) | Copied in shape: per-field times, a tombstone final for edits, `clampTime`, the `updateFor` diff, three attempts on a lost race. | New code that looks like recipes. It is not shared code, because a recipe's fields are fixed and these differ. |
| `writeEntry` (`src/shopping/items.ts`) | Called once per material line from the new add route, as `addPlanToList` does. | The plan's own route and validator are meal-specific, so a sibling route, validator, mutation kind and overlay are new. |
| `forRecipes` on a shopping line | Holds the project title. `toShoppingItem` and `ItemRow` already show it as "for {title}". | The field name is misleading in the code. `docs/DECISIONS.md` records it. A new `forProject` field would touch about nine places and risks a silent wipe where one is missed. |
| Tasks (`src/tasks`) | `clampTime` and `THIRTY_DAYS_SECONDS` (from `src/tasks/record.ts`), `TaskError`, the restore batch, `effectiveAssignee`-style handling of a departed member. Steps are not tasks. | A task claim goes through `needsProposal`, so taking the other person's task would need their approval. A step with `dueOn` would show as "Due" on Today and in digests. A task checklist is one whole list that two people overwrite. So the task machinery is not used for steps. |
| `parsePounds`, `formatPounds`, `MAX_PENCE` (`src/shared/money.ts`) | Cost figures are whole pence and are read and shown the same way. | `parsePounds` refuses 0, so the form turns 0 into a clear. `formatPounds` always prints pence, so a figure reads "£1,250.00" (the examples below drop the pence). |
| `buildTimeline` (`src/shared/timeline.ts`) | One new all-day item type, `project`. | `TimelineType` is a closed union, so adding it forces edits to `ALL_DAY_ORDER`, `TimelineInputs` and `TimelineItem`, and `TimelineList` gains a link branch. The calendar and Today gain a fifth source to poll and to save for offline use. |
| Restore (`src/tasks/restore.ts`, `RestoreEntry`) | `project` is added as a restore kind. | The union and its closed check, `RestoreStatus`, `describeFailure` and `deleted.tsx` all change. |
| Mutation registry, overlays, `deviceKeys.ts`, `PlanSwitch` | New keys, overlays, a notices key, one more switch entry. | `PlanSwitch` changes the "Dinners \| Calendar" switch that the phase 4 icon check (manual check "The Plan tab now holds…") already asks about. |

### Components

```text
App (React SPA)                                       Server (API Lambda, or container)
---------------------------------------------         ----------------------------------------------------
Projects list   /plan/projects                       GET    /api/hh/projects                 list + counts
Project page    /plan/projects/{id}                  GET    /api/hh/projects/{id}            one project
useProjects()   <-- polled every 10 s                PUT    /api/hh/projects/{id}            create, edit
useProject(id)  <-- polled every 10 s, open page     DELETE /api/hh/projects/{id}
projectOverlay  (same rule as the server)            POST   /api/hh/projects/{id}/take|release
projectMutationKeys (9 kinds in step 2, 12 by 3)     PUT    /api/hh/projects/{id}/steps/{sid}
projectNotices  (device-local, per person)           DELETE /api/hh/projects/{id}/steps/{sid}
buildTimeline gains 'project' items                  POST   /api/hh/projects/{id}/steps/{sid}/take|release
                                                     PUT    /api/hh/projects/{id}/materials/{lid}
                                                     DELETE /api/hh/projects/{id}/materials/{lid}
                                                     POST   /api/hh/projects/{id}/materials/add-to-list
                                                     POST   /api/hh/restore   gains { kind: 'project' }
                                                     withHousehold -> guarded -> withWriteRecord
                                                     src/projects/{applyProject,applyStep,applyMaterial,...}
```

### Data model (single table)

All keys are under `HH#<hid>`.

| Item | SK | Attributes |
|---|---|---|
| Project | `PROJECT#<id>` | `title` (1 to 80), `notes?` (up to 1,000), `status` (`active` or `finished`), `plannedOn?`, `plannedEndOn?`, `estimatePence?`, `spentPence?`, `costBy?`, `takenBy?`, `takenAt?`, `fieldTimes` (`title`, `notes`, `status`, `planned`, `estimate`, `spent`; each is set by the write field of the same name plus `At`, and `costBy` is set by the winning cost write and has no time of its own), `createdBy`, `createdAt`, `updatedAt`, `updatedBy`, `deletedAt?`, `deletedBy?`, `expiresAt?` |
| Step | `PSTEP#<projectId>#<stepId>` | `text` (1 to 120), `note?` (up to 500), `state` (`todo` or `done`), `position`, `takenBy?`, `takenAt?`, `doneBy?`, `doneAt?`, `fieldTimes` (`text`, `note`, `state`, `position`), `createdBy`, `createdAt`, `updatedAt`, `updatedBy`, `deletedAt?`, `deletedBy?`, `expiresAt?` |
| Material | `PMAT#<projectId>#<lineId>` | `text` (1 to 120), `fieldTimes` (`text`), `createdBy`, `createdAt`, `updatedAt`, `updatedBy`, `deletedAt?`, `deletedBy?`, `expiresAt?` |

*   The three prefixes `PROJECT#`, `PSTEP#` and `PMAT#` are exported from `src/projects/keys.ts`. Each ends in `#` and none is a string prefix of another or of an existing sort-key prefix in a household's partition (`TASK#`, `ITEM#`, `RECIPE#`, `PLAN#`, `MONEY#`, `EVENT#`, `CALFEED#`, `MUT#`), so a query on one never returns another. A project's steps are read with `skPrefix: PSTEP#<projectId>#`. Ids are checked to `[A-Za-z0-9_-]` and at most 64 characters, so an id holding `#` cannot cross prefixes.
*   An attribute that is not set is left out and never stored as `null`. The optional ones are `notes`, `plannedOn`, `plannedEndOn`, `estimatePence`, `spentPence`, `costBy`, `takenBy`, `takenAt`, `note`, `doneBy`, `doneAt` and the three tombstone fields. Clearing a planned day or a cost is a write whose value is `null` in the request, which removes the attribute, as `minutes` is cleared on a recipe.
*   `expiresAt` is epoch seconds. A live record has none. A deleted one has its deletion plus 30 days.
*   Dates are calendar dates in the household zone (`dayInZone`), the same as tasks. `plannedEndOn`, if set, is on or after `plannedOn` and at most 13 days after it (a span of 14 days).
*   **Position.** A string from a fixed ordered alphabet that sorts as text. The phone computes it with `positionBetween(before, after)` (`src/shared/projectRules.ts`) from the neighbours it saw, and sends it with the write. It returns a position strictly between the two, or says there is none of at most 64 characters (equal or inverted neighbours included). The server checks the alphabet and the length and nothing else. Ties (two steps with one position, which two phones can produce) are broken by step id, so both phones show one order.
*   **No re-spacing.** When `positionBetween` finds no room, the phone refuses the move with a calm line and writes nothing. Length grows by repeated moves into one gap, not with the number of steps, so it is rare. There is no multi-record write for ordering.
*   **Holding.** `takenBy` and `takenAt` are not in `fieldTimes`. They change only through take, release and Done, which are conditional on what was read (see "Taking a step"). A step shows as "On it" when it is `todo` and its holder is a current member (`holderOf`). A project's hold is separate: it means "I'm on the whole job" (CUJ 4), taking it does not take its steps and a step's hold does not take the project. Finishing a project leaves its hold as it is, and a finished project's hold is not shown on the list.
*   `done` clears `takenBy` and `takenAt` in the same update, and sets `doneBy` and `doneAt`. Setting `todo` again clears `doneBy` and `doneAt`.

### Limits

| Limit | Value |
|---|---|
| Live projects per household (active and finished; a finished project counts until it is deleted) | 60, also on restore |
| Live steps per project | 40 |
| Live materials per project | 60 |
| Project title | 80 characters |
| Step text | 120 characters |
| Step note, project notes | 500 and 1,000 characters |
| Material text | 120 characters (the shopping item's own limit is 200) |
| Position | 64 characters |
| Planned span | 14 days (the end is at most 13 days after the start) |
| Cost figure | `MAX_PENCE` (£1,000,000.00) |
| Rows in one add-to-list | 60 |
| Deleted projects listed | 50 newest |

Counts are read, then the write is made, so two creates passing the limit together can leave a household a few over. The limit is soft, as it is for recipes and events, and a restore is checked against it again. Over-long text is refused, never cut.

### Writes and conflicts

Every write route carries the envelope `mutationId`, `clientAt` and `notify`, runs through `withWriteRecord`, and is read with `replayOf` first. Field values carry their own time (`textAt`, `noteAt` and so on, the client time the field was set). `clampTime` stops a time in the future. The write rule for each record is a pure function (`applyProject.ts`, `applyStep.ts`, `applyMaterial.ts`) that the app's overlay also imports, as `itemOverlay.ts` imports the shopping rule.

*   **Per-field last-writer-wins.** A field is written only if its time is newer than the one stored; the newer write replaces the stored value. "Newest" means the device clock at the time of the write, clamped by the server, not the order of arrival, so a phone with its clock set ahead wins and one set behind loses (the loser's words are kept in the notice). This is the rule recipes use. A create needs the title or text; a write to a missing record that is not a create answers `gone`.
*   **Which fields belong together.** Project: `title`, `notes`, `status`, the planned group (`plannedOn` and `plannedEndOn` change together), `estimate` and `spent` separately. Step: `text`, `note`, `state` and `position`. Material: `text`.
*   **The answer.** `{ project | step | material, outcome, stale }` (outcomes are in the glossary). The app uses `stale` for the notice below. The write record holds this answer, which holds no private text, because nothing here is private.
*   **A write to a deleted record.** A tombstone is final for edits: the answer is `gone` with a 200, not an error. A step, material or project write whose parent project is deleted also answers `gone`. The route reads the project first (consistently) to know. A step written in the moment after the parent is deleted is hidden by the parent. It has no expiry unless the project is deleted again (see "Deleting, restoring and finishing"); a restore brings it back live. This is accepted.
*   **The loser notice.** When `stale` is not empty, the app's registered `onSuccess` for that kind (the only code that runs for a write replayed after a restart) saves a notice on the device: what, where, the person's own text for each stale field, and who last changed it (from the record's `updatedBy`, shown as "Last changed by {name}", which may be the same person). It lives in `localStorage` under a key that ends with the user id (`projectNoticesKey` in `app/lib/deviceKeys.ts`, cleared at sign-out like the others). The project page shows it: "This was changed after you wrote it. Your wording is kept here." with the text, "Copy" and "Dismiss". It stays until dismissed. The words "conflict", "rejected" and "lost" are not used.
*   **A move or an edit of a step that was deleted.** `gone`, with a notice that keeps the person's text.

### Taking a step

The rule, for a step and for a project, is first to reach the server holds it. The routes are `POST .../take` and `POST .../release`, with the envelope and no other body. Both answer 200 with `{ project | step, outcome }`, never a 4xx, because the retry rules treat a 4xx as final and the overlay would go on showing a hold that never was. Each reads the record and the household's members first, and a lost race re-reads and decides again, up to three times, so the second of two near-simultaneous takes gets `held_by_other`. Every update also carries `ifMissing(deletedAt)`, so a delete that lands between the read and the write wins.

| Action | Update, applied only if | Outcomes and what shows |
|---|---|---|
| Take | `takenBy` is still absent (`ifMissing`), and for a step `state` is still `todo` (`ifEquals`). If the stored holder has left the household, `ifEquals(takenBy, that id)` replaces the absent check, so a departed person's hold does not block anyone. | `taken` ("{name} is on this"), `already_yours` (no change), `held_by_other` ("{name} already has this"), `done` ("This step is done"), `gone` ("This step was deleted") |
| Release | `takenBy` is still the holder that was read (`ifEquals`). Either person may release. | `released`, `not_held` (nothing shown), `gone` |
| Done (a step `state` write) | `takenBy` is still what was read (`ifEquals`, or `ifMissing` if there was none), so a take that lands in between is neither wiped nor left on a done step. Done clears the holder in the same update. | The ordinary write outcome. A failed condition re-reads and decides again. |

*   **A release by someone other than the holder** is visible: the step reads "Last changed by {name}", and the other person's push, if the tick was on, says that something changed.
*   **The write record.** All outcomes, including `held_by_other`, are recorded with the record, so a retry of a refused take answers the same, and is not turned into a success by a later release.
*   **The overlay.** A pending take shows the step as the caller's, marked "Not saved yet". When the answer is `held_by_other` the registered `onSuccess` saves a notice ("{name} already has this"), the step's query is refreshed, and the overlay drops, so the page shows the other person's name. The step row says who holds it in words, with the person's colour as a second sign (`app/lib/calendarPeople.ts`).
*   A hold never moves a row, never changes `position` and never changes `state`.
*   A write record lasts 8 days (`WRITE_RECORD_SECONDS`). A take replayed after longer than that is no longer answered from its record and is read again as a new take. For a take this is harmless: the outcome is decided again from what is stored.

### API routes (phase 5)

| Method and path | Purpose |
|---|---|
| `GET /api/hh/projects` | Live projects with derived counts, and the 50 newest deleted ones |
| `GET /api/hh/projects/{id}` | One project with its live steps (in order) and materials; a deleted project answers with its tombstone and no children |
| `PUT /api/hh/projects/{id}` | Create or edit a project |
| `DELETE /api/hh/projects/{id}` | Delete (a tombstone and the children's expiry) |
| `POST /api/hh/projects/{id}/take`, `/release` | Take or release a whole project |
| `PUT /api/hh/projects/{id}/steps/{stepId}` | Create or edit a step |
| `DELETE /api/hh/projects/{id}/steps/{stepId}` | Delete a step (a tombstone) |
| `POST /api/hh/projects/{id}/steps/{stepId}/take`, `/release` | Take or release a step |
| `PUT /api/hh/projects/{id}/materials/{lineId}` | Create or edit a material line |
| `DELETE /api/hh/projects/{id}/materials/{lineId}` | Delete a material line |
| `POST /api/hh/projects/{id}/materials/add-to-list` | Copy materials onto the shopping list |
| `POST /api/hh/restore` | Gains `{ kind: 'project', id, deletedAt }` |

Every route is wrapped in `withHousehold` and `guarded`, is validated by `src/shared/projectValidation.ts`, and rejects unknown keys (the envelope keys come from `ENVELOPE_KEYS`). Refusals thrown as `TaskError`: 404 `not_found` for a project id that has never existed, and 409 `project_limit` (step 1), `step_limit` (step 1) and `material_limit` (step 3). Everything under a project that exists answers 200 with an outcome, `gone` included. A queued write that meets a refusal is final: the retry rules do not retry a 4xx, `onError` reports it once through `describeFailure`, and the overlay drops it.

The list is polled, so it is kept light: `GET /projects` reads the `PROJECT#` prefix and, for the counts, the `PSTEP#` prefix with only `SK`, `state` and `deletedAt` (and the `PMAT#` prefix with `SK` and `deletedAt`). The bytes are small but the read cost is per item, so at the limits (60 projects of 40 steps) it is up to 2,400 items per poll per open phone. The count query skips steps of deleted and finished projects, and pages when a read passes 1 MB. `GET /projects?counts=0` skips the step query; Today and the calendar use it, since they need only titles, days and holders. Counts are worked out on each read and never stored, because a stored counter races.

| Route | Body, in addition to the envelope | Answer |
|---|---|---|
| `PUT /projects/{id}` | create: `title`, `titleAt`; edit: any of `notes`, `status`, `plannedOn`, `plannedEndOn` (with `plannedAt`), `estimatePence` (`estimateAt`), `spentPence` (`spentAt`), each with its time | `{ project, outcome, stale }` |
| `PUT /projects/{id}/steps/{sid}` | `text`, `note`, `state`, `position`, each with its time; a create needs `text` and `position` | `{ step, outcome, stale }` |
| `PUT /projects/{id}/materials/{lid}` | `text`, `textAt` | `{ material, outcome, stale }` |
| `POST .../take`, `.../release` | none | `{ project \| step, outcome }` |
| `POST .../materials/add-to-list` | `lineIds` (up to 60) | `{ results: [{ id, status }] }`, `status` one of `created`, `already`, `cleared`, `missing` |
| `GET /projects` (`?counts=0` leaves out the counts) | none | `{ projects, deleted, serverTime }` |
| `GET /projects/{id}` | none | `{ project, steps, materials, serverTime }` |

### Materials and the shopping list

*   Each material line is a record with a stable id. Adding a line is a create of a new id, so two people adding lines at once lose nothing. Editing the same line is last-writer-wins with the notice above. A person can paste several lines at once: each line becomes one write, and `notify` is sent on the first write of the paste only, so one paste is one push.
*   `POST .../materials/add-to-list` follows `addPlanToList`: for each line id it reads the material, then reads the shopping item with **the material's id as its id**. If that item exists (live or deleted) the line is skipped and nothing is written. Otherwise it calls `writeEntry` with the material's id, the text, and `forRecipes` set to the project title (at most 200 characters, `MAX_FOR_RECIPES_LENGTH`). Ten at a time, no transaction across lines. It then writes the write record last, with `withWriteRecord` and no other operations, so a crash leaves some lines created and no record, and a retry skips those and creates the rest. Statuses: `created`, `already` (the item exists), `cleared` (it exists as a deleted item), `missing` (the line is gone or deleted).
*   Because a skipped line is never written, a second press cannot undo an edit made to the line on the list (`applyItemWrite` would otherwise apply a newer `at`). The row says "Already on the list" for `already`, and "Added earlier, and since cleared" for `cleared`. A cleared item is kept for 30 days; after that a press adds the line again. A line wanted again sooner is a new material line. This is the whole duplicate rule, and it needs no hash and no list of what was copied.
*   The label is a snapshot made when the line is created. Renaming the project leaves old shopping lines labelled with the old title. The copy goes one way: ticking an item on the list does not tick or change the material, and deleting the project leaves what was copied.
*   A material line is not read, scaled or merged. `parseIngredientLine` and `buildLines` are deliberately not used, and a line that happens to be "6 x 2.4m timber" is just text.
*   The shopping list shows "On the list" beside a material when the shopping query holds an item with that id. It is read on the device from the list the app already has.
*   Logging: one `project_materials` line with counts only (`lines`, `created`, `already`, `cleared`).
*   The overlay marks the lines "Not saved yet" while the add is pending. It does not add shopping lines optimistically: they appear when the write lands.

### The planned day on the calendar

*   `plannedOn` (and optionally `plannedEndOn`) is on the project. It is read by `buildTimeline`: `TimelineInputs` gains `projects`, `TimelineType` gains `'project'`, `TimelineItem` gains `projectId`, and `ALL_DAY_ORDER` gains an entry that puts it after the dinner. An active, undeleted project appears on each day from `plannedOn` to `plannedEndOn` (or the one day) as an all-day strip item labelled "Project: {title}", with the holder's name as `who` (or none), opening `/plan/projects/{id}`. A finished project does not appear. This is the same approach as tasks and the dinner, and not an `EVENT#` record, which would pull in the privacy projection, reminders, restore and the 500-event limit.
*   `app/lib/calendar.ts` (`inputsFor`) reads the projects list through `useProjects()` with the light read (`?counts=0`), so the calendar and Today poll no step counts. That query is persisted like the others, so an offline calendar still shows project days. `TimelineList` hides the time range for a `project` item as it does for `task` and `dinner`, and links to the project. A project item does not appear in "Now and next", because that list ignores all-day items. The `who` is the holder through `holderOf`, so a departed holder shows as none.
*   The words say it is not a deadline: "Planned for Saturday 5 December", "Planned for 5 to 6 December". Nothing changes when the day passes, and a past day reads the same way ("Planned for 3 November").
*   Reminders are not offered for a planned day.

### Costs

*   A project can hold `estimatePence` and `spentPence`, each optional and each its own field with its own time, in whole pence. Totals are not stored: the page shows "£1,250 of £4,000" from the two figures. If only one is set it shows that one ("Estimated £4,000" or "£1,250 spent so far").
*   Either person can change either figure. A concurrent edit of one figure replaces the other, and the loser notice applies. `costBy` holds the person who last changed either, and the page shows "Last changed by Sam".
*   `0` is a clear: the form turns 0 into `null`, and the server accepts only a whole number of pence of 1 or more, or `null`. Figures are shown with `formatPounds`.
*   The page says "Not in Money. This is only for the project." A test fixes that no project write touches an item under `MONEY#`, and that `computeTotal`, `loanProgress` and `settledIds` give the same answer before and after any project cost change.
*   No screen says over budget, overspent, who paid or settle. A link from a project cost to a ledger entry is a Future Improvement.

### Deleting, restoring and finishing

*   **Finishing** is an ordinary edit of `status`. A finished project stays in the list under "Finished", can be brought back, and is hidden from the calendar. It is not on the Deleted page. A finished project's steps stay as they were.
*   **Deleting a project** is a conditional tombstone on the project (`deletedAt`, `deletedBy`, `expiresAt` 30 days ahead), followed by setting the same `expiresAt` on every live child (steps and materials without their own `deletedAt`), in batches of at most 25 per transaction, followed by the write record. The tombstone is written first, so everything is hidden at once by the parent check at read time and a half-finished batch changes nothing the person can see. A delete of a project that is already deleted is not refused: the tombstone condition fails, and the route carries on to give expiry to any child that has none, so a retry finishes the batches. The project has no `expiresAt` until the tombstone, so a live project never expires. The store's own expiry (`expiresAt`) removes the rows, as for tasks.
*   **Restoring a project** (`POST /restore`, `{ kind: 'project', id, deletedAt }`) removes `expiresAt` from the children first, in the same batches, and only then removes the tombstone from the project, so if the batches stop part-way the project stays deleted and the person can try again. A restore that would pass 60 live projects answers `project_limit`. The update is applied only to the deletion it saw, so restoring twice does nothing. Children with their own `deletedAt` are left alone. A step written under the project after the delete batches ran has no expiry, so it comes back live with the project; if the project is deleted again it is marked then.
*   **The Deleted page** gains a Projects group. A row names the project and says what would come back ("12 steps, 8 materials"), counted from its live children. There is no row for a deleted step or material.
*   **Deleting a step or material** is a tombstone with its own 30-day expiry, final for edits. "Undo" in the app writes a new record with the same text, note, state and position under a new id. It does not use restore, and a step that was held or done comes back not started. This keeps `RestoreEntry` to one new kind.
*   `deletedEntries` in `app/lib/deleted.ts` takes five positional arguments and returns five groups today. The projects group is added through a helper, not a sixth positional argument, and `app/routes/deleted.tsx` (whose copy and "nothing deleted" test are hard-coded) is updated for the new group.

### Moving households

`moveOptions` in `src/household/invites.ts` lists each prefix by hand, and is the one place known to read a household's partition by data kind. A person alone in a household whose only data is a project would otherwise look empty, could accept an invite and move, and the project would be stranded with no error. Step 1 first searches the code for any other whole-partition reader (backup, `store-cli`, cleanup) and records the result in its pull request, so the list comes from a check. It then adds `PROJECT#`, `PSTEP#` and `PMAT#` to `moveOptions`' `Promise.all` and its `||` chain, updates the comment above it, and tests one household for each prefix, including a tombstone. If the API is rolled back after step 1, the older check ignores the new prefixes and the hazard returns; the pull request says so. `removeMember` reads no prefix and rewrites nothing. It leaves one member, so the household is one person until someone is invited (phase 1); a hold by the removed person reads as free (see "Taking a step"), and `createdBy` shows as "Former member".

### Privacy and notifications

*   Projects are not private. Both people see every project, step, material, note and cost. This is a decision. The one case it does not cover is a surprise (a gift made in the garden room), and it is listed under Future Improvements, with the calendar's private events as the model.
*   **Push.** Every write route accepts `notify`, and `notifyAfter` sends the other person a push only when the tick was on, the write was fresh and `clientAt` is under 30 minutes old (`notifyOther`). The text is fixed, as for money and the calendar. `projectAdded` ("{name} added a project") is used when a project create carries `notify`; `projectChanged` ("{name} changed a project") for every other write that does. Both have the body "Open the project to take a look." and open `/plan/projects/{id}`. They never hold a title, a step, a material or a figure. Taking, releasing and ticking Done send nothing unless the tick is on. `src/push/events.ts` gains the two events. The existing per-page "Let them know" tick (`app/lib/letThemKnow.ts`) is used.
*   **Logs.** `src/projects/log.ts` holds ids, enums and counts only, as `src/money/log.ts` and `src/calendar/log.ts` do: `project_write { householdId, kind, outcome }`, `project_take { householdId, kind, outcome }` with the outcome as the enum (`taken`, `already_yours`, `held_by_other`, `done`, `gone`, `released`, `not_held`) and `project_materials` as above. Never a title, text, note, figure, label or name. A sentinel test writes a distinctive title, step, material and figure and checks every log line, every push body and every held push, as the calendar's sentinel tests do. Responses carry record text by design (nothing here is private), so they are not part of it.

### Sync, offline and cache

*   `GET /projects` is polled every 10 seconds while the app is visible, and `GET /projects/{id}` every 10 seconds while that page is open, as tasks and the plan are. Both are saved in the persisted cache. A project never opened online reads "Not saved for offline yet". The client never decides a project or step is gone from absence alone: it uses the same lookup rule as recipes (`recipeLookup.ts`), and only a tombstone from the server, or a `gone` outcome, says so.
*   Writes are registered once in `app/lib/mutations.ts` through `app/lib/projectKeys.ts` as `projectMutationKeys`, run in the `household` scope, and are replayed after a restart. The kinds are `putProject`, `deleteProject`, `restoreProject`, `takeProject`, `releaseProject`, `putStep`, `deleteStep`, `takeStep` and `releaseStep` in step 2, and `putMaterial`, `deleteMaterial` and `materialsToList` in step 3, twelve in all in one registered set. Each has a runner, an overlay in `app/lib/projectOverlay.ts` that applies the same pure rule as the server to pending writes (`src/projects/apply*.ts`), a `describeFailure` mapping, and a case in `app/__tests__/mutationRegistry.test.ts`, which requires an overlay for every kind. `onSuccess` is where notices are saved and `onError` is where a refusal (a limit) is reported, registered there and not in a component so they run after a replay.
*   The retry rules (`retryRules.ts`): network, timeout and lapsed sign-in retry for ever, a 5xx three times, any other 4xx is final. A write is never lost to a bad connection or a lapsed sign-in. See "API routes" for the few refusals that are final.
*   **Mixed versions.** The service worker never calls `skipWaiting`, so a phone can run an older app. The API ships before the app; steps 3 to 5 combine server and app work, so each deploys its server commit first. If the app is rolled back, an older app that meets a saved write for a key it does not know drops that phone's whole saved queue, including unrelated shopping, task and calendar writes, and the other phone's data is unaffected. This is accepted (Open Questions). A test restores a saved cache with `schemaVersion` 1 that holds a pending project write and checks that it replays on the new app; rollback itself is not tested.

### Views

*   **Plan switch.** "Dinners | Calendar | Projects" (`PlanSwitch.tsx`), the open page in bold with a bar under it, which is not colour alone. The Plan tab stays highlighted for `/plan/projects` because the tab matches on the start of the path. The three links wrap at the largest text size and each is at least 44 px high.
*   **Projects list** (`/plan/projects`). Active projects, each showing the title, "3 of 8 steps done", who is on it (name and the person's colour mark), and its planned day; then "Finished". An empty state ("No projects yet. Add one when you start a bigger job."). "New project" opens a sheet that asks only for a title; "Add details" shows notes, a planned day and costs.
*   **Project page** (`/plan/projects/{id}`). The title and, if set, the planned day; "I'm on this" and "Mark as finished". The steps in order, each with a tick, its text, who is on it, "Move up" and "Move down", and a tap to open its sheet (text and note). A finished step stays in place, marked "Done" in words with a tick, and does not jump to the bottom. A line to add a step, where pasting several lines makes one step for each. Then, each shown only once used or asked for: Materials (the lines, "Add materials", "Add to the shopping list", "On the list" on a line), and Costs ("Add a cost").
*   Every screen says state and ownership in words. Time is shown with the existing "Not saved yet" wording for queued writes. A step shows its age neutrally ("On it for 3 weeks") and never as stale.

### Wording

A copy table in `app/lib/projectText.ts`, pinned by the wording test. Examples:

| State | Text |
|---|---|
| Step states | "Not started", "On it", "Done" |
| Holding | "I'm on this", "{name} is on this", "Free this step", "On it for 3 weeks" |
| A refused take | "{name} already has this" |
| A newer change | "This was changed after you wrote it. Your wording is kept here.", "Last changed by {name}" |
| Planned day | "Planned for Saturday 5 December", "Planned for 5 to 6 December" |
| Cost | "£1,250 of £4,000", "Estimated £4,000", "£1,250 spent so far", "Last changed by Sam", "Not in Money. This is only for the project." |
| Materials | "Add to the shopping list", "On the list", "Already on the list", "Added earlier, and since cleared" |
| Lifecycle | "Mark as finished", "Finished", "Bring back" |
| Empty and limits | "No projects yet. Add one when you start a bigger job.", "This household has reached 60 projects." |
| Offline | "Not saved yet", "Not saved for offline yet" |

The words "claim" and "assign" are never on screen. The wording test gains `BANNED_PHASE_5` (over budget, overspent, overrun, behind schedule, stuck, stalled, blocked, abandoned, unfinished, undone, conflict, rejected, lost, claim, assign) and a `projectFiles()` filter (`app/lib/project*.ts`, `app/components/projects/**`, `app/routes/plan.projects.*`, `app/hooks/useProjectActions.tsx`), because new files are covered only by the global list otherwise. The cost files also pass `BANNED_PHASE_3` (owe, debt, unpaid, behind). The palette has no red, and a person's colour comes from `colour` on the member (`app/lib/calendarPeople.ts`), always beside their name.

### Existing manual checks this phase could break

All of these are still unticked in `docs/MANUAL-CHECKS.md`. The ones that are at risk are named, by the first words of the check, so they are run with phase 5 in place, and not before it. This table is verification material, not design.

| Phase | Check | Why a phase 5 change could break it |
|---|---|---|
| 2 | "Read a recipe, the plan and the shopping list in airplane mode" | The mutation registry and the persisted cache gain keys and queries. |
| 2 | "Add a planned week to the shopping list…", "Add the same week twice by hand…" | These run through `writeEntry`, `toShoppingItem` and `ItemRow`, which this phase calls but does not change. Run them as a regression after step 3. |
| 2, 3, 4 | The three "no screen relies on colour alone" checks | Every new screen must say state and ownership in words. |
| 3 | "Change an agreed entry… and delete another" (Deleted page and restore) | `RestoreEntry`, `deletedEntries` and `deleted.tsx` change. |
| 3 | "Use Money in airplane mode" | Shared offline and persistence code gains project keys. |
| 4 | "Add a feed as Busy only…" and "Make an event private…" | `TimelineInputs` changes. The privacy projection is not touched, and the sentinel tests still run. |
| 4 | "Use the calendar in airplane mode…" | `inputsFor` reads a new, persisted query. A project day must show offline. |
| 4 | "The Plan tab now holds Dinners \| Calendar…" | The switch gains a third option, so the question now covers three. |
| 4 | "Today, Plan, Calendar (day and week)… at 360px" | The Plan switch and the strip gain items. |
| General | The largest-text and reduce-motion check, the banned-words check and the phase 4 screens check | The largest text, reduce motion, banned words and no red apply to the new screens. |

New lines to add in the finish step: two phones take the same step offline and one is told, calmly; two phones reorder offline and both moves are kept; add materials to the list twice and nothing is doubled; a planned day appears on the calendar day view and offline; a project is deleted and restored with its steps; an older app restores a queue that holds new keys; the Plan switch at 360 px and the largest text; and a month-later question to both people.

### Infrastructure and operation

None. The routes ride the existing `/api/{proxy+}` route, the data is in the existing table, and there is no new key, parameter, schedule or permission. `src/infra/__tests__/infraGuards.test.ts` is not changed. The container runs the same handlers on the same SQLite store, and a backup (the whole SQLite file) holds the new items with no change.

## Alternatives Considered

### Alternative A: Steps as tasks with a project label

Rejected. Taking a task goes through `needsProposal`, so taking a step that is the other person's, or "both", would need their approval, which the author ruled out. A step with `dueOn` appears as "Due: ..." in `buildTimeline` and in the digest, and thirty steps would flood Today. A task's checklist is one whole list that two people overwrite. Reusing tasks would mean changing a shared type that phases 1 and 4 depend on. The cost of not reusing them is a new area of code about the size of phases 2 to 4.

### Alternative B: One task with a long checklist, tried for a week

Not chosen as the design, and not planned to be run first. It costs almost nothing and would show whether the missing piece is seeing the plan or taking steps one by one. It cannot give a hold on each step or let two people edit different steps at the same time, and holding a step is the problem the author described (two people going for the same piece of work). It stays available as a cheap trial if the author doubts the need.

### Alternative C: A lock while one person edits

Rejected by the author after hearing the trade-offs. A lock needs a server answer, so it cannot work offline, and the app queues writes and replays them. A phone that dies or is put down mid-edit can leave it stuck. It also turns "both of us add to the plan" into taking turns. Separate step records with per-field newest-write-wins prevent one person's edit silently overwriting the other's without a lock.

### Alternative D: One project record holding the steps as a list

Rejected. Two people editing different steps would retry against each other on one record, a hold on one step would conflict with a reorder of another, and `ifEquals` takes single values only, so the list cannot be conditioned. A recipe's steps are already a whole-field list that loses a concurrent edit.

### Alternative E: Order as a linked list, a list on the project, or the sort key

Rejected. A linked list is corrupted by two inserts or a delete at once. A list on the project is whole-field newest-write-wins. Putting the order in the sort key makes a move a delete plus a put, which breaks holds, write records and per-field times. A `position` string on each step moves one record and converges on one order.

### Alternative F: A hold as newest-write-wins

Rejected. The later tap would silently overwrite the earlier one, and the earlier phone would go on showing "mine" until it synced. That recreates the competition for a step that the feature exists to stop. The author chose first to reach the server.

### Alternative G: A hold that lets the later tap take over, with a note

Rejected by the author's choice of first to reach the server. It never refuses and is calm, but the person displaced finds out later and the step changes hands twice, and a hold that can be taken over is not a hold. First-come is calmer when the aim is to stop two people starting the same job.

### Alternative H: Both names on a step

Not chosen for the first version. Nothing is ever refused, but it defeats showing that a step is taken. A job both people do together is a real case, and it can be a step "Both" later (Future Improvements).

### Alternative I: Approval of a plan or a step by the other person

Rejected by the author. The problem began with one person feeling their plan was not trusted, and an approval step turns "can you see my plan" into a gate. It would also need a pending state on every step and push for each one.

### Alternative J: A new `forProject` field on a shopping line

Rejected. A clearer name, but it touches about nine places, and phase 2 found that a new field is wiped silently wherever one place is missed. If the name proves confusing, one shared label field is the fallback (Future Improvements).

### Alternative K: Materials as one text field

Not chosen. It is the least code, and two people editing it at once lose one edit. Two people adding lines at once is a case the author named, so a person's lines would vanish. A line with no id also cannot be copied to the shopping list once, so a second press would duplicate unless ids were derived from the text. Records cost one more prefix and a write rule, and remove both problems.

### Alternative L: Materials read, scaled and merged like recipe ingredients

Rejected. `parseIngredientLine` and `buildLines` exist to merge "2 onions" and "1 onion". A DIY line ("6 lengths of 47x100 timber, 2.4m") merges with nothing, and a wrong reading of a quantity would put a wrong number on the shopping list.

### Alternative M: A cost on the money ledger, or a `projectId` on a money entry

Rejected by the author: payment is either from the joint account, or one person pays with no expectation on the other, so there is nothing to split or record. Money entries need exactly two members, a share and the other person's agreement, so each £60 of timber would become a request and would change the balance between them. A link from a project cost to a ledger entry stays a Future Improvement.

### Alternative N: Costs as a list of purchases

Rejected. It loses no concurrent edit, but it is a small ledger and invites "send it to Money". Two figures keep costs a planning aid. The cost is that a concurrent edit of one figure loses one, with the notice.

### Alternative Q: A Today line for active projects

Not chosen, by the author's wish to keep Today uncluttered. The cost is that a step the other person has taken is visible only to someone who opens the plan, and Today would also have needed the project list on every poll (the light read avoids that for the calendar). A single quiet line is an easy later change and is in Open Questions.

### Alternative R: Tombstoning every step on delete, or a cleanup job for orphans

Rejected. A cascade is not one atomic write and a half-finished one leaves a visible mess. A cleanup job needs a new index partition, an hourly job and a rule that a missing project means orphans. The project's tombstone hides its children at once and batches set their expiry (see "Deleting, restoring and finishing").

### Alternative T: Restore kinds for steps and materials

Rejected. It would widen `RestoreEntry`, `RestoreStatus` and the Deleted page for an "undo" used straight after a delete. The cost is that a held or done step comes back not started.

### Alternative X: Re-space every step when a position gets long

Rejected. It is the only multi-record write in the design, a partial failure scrambles the order, and each write could send a push. A move refused at 64 characters costs the person one different move.

### Alternative Y: A refused take answers 409

Rejected. The retry rules treat a 4xx as final, so the write would be dropped, but the overlay would be told nothing and would go on showing a hold that never was. A 200 with an outcome lets the app save the notice and drop the overlay.

### Alternative Z: Only the holder can release

Not chosen. A step held by a person who has put the phone down for a week would stay held. Either person can release, it is shown, and a push says something changed if the tick was on.

## Non-Functional Requirements

*   **Correctness.** The pure rules have property tests: any order of the same edit writes gives the same project (take and Done are tested separately, with races); `positionBetween` always sorts strictly between its inputs and says there is no room rather than pass 64 characters; ties break by id; per-field times never go backwards; a hold changes only through take, release and Done.
*   **Accessibility.** Every new route passes the axe check at 360 px and at the largest text size. State and ownership are in words. Every control is at least 44 px high. Reordering is by buttons, not dragging.
*   **Performance.** The list poll reads the project prefix and, unless `?counts=0`, the step prefix with three attributes. A project of 40 steps and 60 materials is about 100 small items. The notice store is one `localStorage` object per person.
*   **Cost.** No new schedule, function, parameter or permission. Table reads rise by the project list poll (one project query and, with counts, one step query every 10 seconds per open phone; Today and the calendar make only the project query) and by the project page poll while it is open.

## Risks and Mitigations

| Risk | Effect | Mitigation |
|---|---|---|
| A household moves and strands a project | A person's plan is lost with no error | `moveOptions` lists all three prefixes from step 1, with a test per prefix and a note on the rollback hazard. |
| Two people take one step | One wastes effort on a job the other started | First to reach the server holds it; the other is told in words and sees the holder's name. |
| A replaced edit loses a person's words | They retype something they wrote offline | The answer lists the stale fields, and the app keeps the person's text in a notice until it is dismissed. |
| Two people move steps into one slot | An order neither meant | One order on both phones by id tie-break; stated, and either person can move a step again. |
| A position grows long | A move cannot be saved | A cap of 64; the phone refuses that move calmly and the person moves another step. |
| A project is deleted while someone writes a step | A hidden step without an expiry | The route reads the project first; the step is hidden by the parent, comes back live on a restore, and is marked if the project is deleted again. Accepted. |
| Delete or restore stops part-way | A few hidden children never expire, or a restored project whose steps will expire | The tombstone hides everything at once and a retry of the delete finishes the batches. Restore un-marks children first and removes the tombstone last, so a failure leaves the project deleted and retryable. |
| A clock is wrong on one phone | That person's edits always win or always lose | Stated in "Writes and conflicts"; the loser's words are kept in the notice, and `clampTime` stops a time far in the future. |
| A hold is never released | A step stays held by someone who has moved on | Either person can release it, it is shown, and a departed member's hold reads as free. |
| A route is called with a bad id or body | A cross-prefix read or a wrong write | `withHousehold` on every route, ids checked to a fixed character set, bodies validated, unknown keys refused, and `lineIds` read only by exact key. |
| The label "for {project}" reads as a recipe | A line looks mislabelled | Accepted and recorded in `docs/DECISIONS.md`. The title is a snapshot and not renamed. |
| A material copied, ticked and cleared | The line looks as if it vanished | `cleared` shows "Added earlier, and since cleared". A line wanted again is a new line. |
| Two people edit one cost figure | One figure is replaced | A notice keeps the person's number, and "Last changed by" says who. |
| A planned day reads as a deadline | Pressure, the feeling the app avoids | Wording says "Planned for", nothing changes when it passes, no reminder is offered. |
| The Plan switch has three items at the largest text | A label is cut off or overlaps | The links wrap and are 44 px high; a manual check line covers it. |
| Notices are device-local | A person who changes phone loses a notice | Accepted. The notice holds the person's own text, and the project still shows the current value. |
| A queue with new keys meets an older app | That phone's whole saved queue is dropped after a rollback | The API ships before the app; a test replays a saved cache on the new version; accepted if the app is rolled back (Open Questions). |
| Projects feel too large for a plug | The feature is not used for small jobs | A title alone is enough, and "I'm on this" works on the project. Materials, dates and costs appear only after "add". |

## Future Improvements

*   **A Today line** for a project with a step that is yours, if the author finds the plan hard to notice.
*   **A step done by both** ("Both"), if a job two people do together turns out to be real.
*   **Private projects**, with the projection used for private events, for a surprise.
*   **A link from a project cost to a ledger entry**, for the times one person pays and wants it counted. It would need the other person's agreement like any entry.
*   **Photos and sketches** on a step, which needs file storage that Hearthwise does not have.
*   **One shared label field** on a shopping line in place of `forRecipes`, if the name proves confusing.
*   **A restore for a single step**, if re-adding it proves too rough.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Approach

Six pull requests, stacked in this order. Steps 1 and 2 give the household a working shared plan with holds, before materials, a date or a cost exists. Items are numbered across all steps, so "item 14" names one thing. Each step passes `yarn typecheck`, `yarn test` and `yarn build`, and the contract tests with `DYNAMODB_ENDPOINT=http://localhost:8000`. The rules that apply to every step:

*   each test is written before the code it covers;
*   the CLAUDE.md rules apply (write records, `withHousehold`, no `null` attributes, `withTimeout()`);
*   wording follows `docs/brand.md` and the phase 5 list in the wording test;
*   a step's pull request adds its "Spec says / Built / Why" rows to `docs/DECISIONS.md` where the code differs from this design.

File names are taken from the current code. Where one differs when a step starts, the code wins and the pull request records it. Domain code follows `src/meals/applyRecipe.ts` and `src/meals/recipes.ts`. The API ships before the app. Duplicating the per-field write rule for each record kind is the repository's deliberate pattern (recipes, items, events), so no shared helper is added. Item 11 holds the search for places that read a household's partition as a whole.

### Step 1: Projects, steps and holds on the server

**Acceptance:** with the app unchanged, the routes create, edit, reorder, delete and restore projects and steps, take and release a step or a project with the outcomes in "Taking a step", hide children of a deleted project and bring them back, and refuse with a 4xx only what "API routes" lists for this step (a never-existed project id, `project_limit`, `step_limit`). A household whose only data is a project cannot move away. Every rule below has a test.

1.  `src/shared/projectRules.ts` and `src/shared/__tests__/projectRules.test.ts` (Create). `POSITION_ALPHABET` (digits, then lower-case letters), `MAX_POSITION` (64), `positionBetween(before: string | undefined, after: string | undefined): { ok: true; position: string } | { ok: false }`, `compareSteps` (position, then id), `holderOf(record, members)` (a holder who is not a current member reads as none) and the project and step limits as exported constants. Property tests: strictly between for any two ordered inputs and for either end; equal, inverted and no-room inputs give `ok: false`; repeated moves into one gap reach the cap and refuse; order-independence of a set of edit writes (take and Done are item 5); ties by id.
2.  `src/shared/projectValidation.ts` and its test (Create). Parsers for the project put (title, notes, status, with times), the step put (text, note, state, position, with times), the take and release bodies and the delete body, in the style of `mealValidation.ts`. Unknown keys are refused using `ENVELOPE_KEYS` from `src/shared/taskValidation.ts`, text is trimmed and refused (not cut) over its limit, ids match `[A-Za-z0-9_-]{1,64}` (a test refuses an id holding `#`), a create needs its title or text and position, and `null` clears an optional field. Planned days, costs and materials are added by the later steps.
3.  `src/projects/types.ts` and `src/projects/keys.ts` (Create). The record types, the three prefixes (`PROJECT#`, `PSTEP#`, `PMAT#`), key builders and `stepPrefixFor(projectId)`. A test imports the exported prefixes and asserts that each ends in `#` and that none is a string prefix of another or of the other prefixes in a household's partition (listed in the test).
4.  `src/projects/applyProject.ts`, `src/projects/applyStep.ts` and `src/projects/__tests__/apply*.test.ts` (Create). The pure write rules: per-field newest-write-wins with `clampTime`, a tombstone final for edits, the `stale` list, `done` clearing the holder and setting `doneBy`, `todo` clearing `doneBy`, and `outcome` (`created`, `applied`, `noop`, `gone`). The app's overlay imports these.
5.  `src/projects/projects.ts`, `src/projects/steps.ts`, `src/projects/holds.ts` and `src/projects/__tests__/*.test.ts` (Create). The domain, written like `src/meals/recipes.ts`: `replayOf` first, a consistent read, the three-attempt loop on a lost race, the project read before a step write (`gone` for a deleted parent), the limits (60 live projects, 40 live steps, counted by prefix queries with only the needed attributes, which skip steps of deleted and finished projects and page over 1 MB), `listProjects` (derived counts, 50 newest deleted, `counts` off for the light read), `getProject`. `holds.ts` exports `takeRecord` and `releaseRecord`, each taking a kind (`project` or `step`; the step adds the `state` condition) and following the table in "Taking a step" exactly, with `ifMissing(deletedAt)` on every update. `steps.ts` makes Done conditional on the holder it read. Tests, written first: two takes made together give one `taken` and one `held_by_other`; take against Done; take against delete; take against release; a departed holder's hold is replaced.
6.  `src/projects/children.ts` and its test (Create). `deleteProjectTree(store, ctx, id, deletedAt)` tombstones the project (`ifMissing(deletedAt)`; on an already-deleted project it carries on) and sets the expiry on its live children in batches of 25; `restoreProjectTree(store, ctx, id, seenDeletedAt)` removes the expiry from the children first and the tombstone last, and owns the "deletion seen" check (`ifEquals` on `deletedAt`). The write record is written last by the calling route's `withWriteRecord`. Tests: a retry finishes a half-done delete, a failed batch on restore leaves the project deleted, a child with its own `deletedAt` is left alone, a step written after the delete batches comes back live, a project of 100 children.
7.  `src/projects/log.ts` and its test (Create). `project_write`, `project_take` and, later, `project_materials`, with ids, enums and counts only. A sentinel test over every log line the domain writes.
8.  `src/api/projects.ts` and `src/api/__tests__/projects.test.ts` (Create), `src/api/apiRoutes.ts` and `src/api/__tests__/apiRoutes.test.ts` (Modify). The step 1 routes only, each wrapped in `withHousehold` and `guarded`: `GET /projects`, `GET /projects/{id}` (which returns `materials: []` until step 3), `PUT` and `DELETE` of a project, take and release of a project, `PUT` and `DELETE` of a step, take and release of a step, and the `restore` branch. They are registered after the calendar routes, in the order of the table in "API routes"; the route test pins the exact ordered list. Tests for every outcome as a 200, the three `TaskError` refusals, unknown keys, and replay.
9.  `src/push/events.ts` (Modify) and a test: `projectAdded` (a project create with `notify`) and `projectChanged` (every other write with `notify`), each with a fixed body and no title, opening `/plan/projects/{id}`. The routes call `notifyAfter` as the money and calendar routes do. Sentinel test: a title never reaches a push or a held push.
10. `src/shared/taskValidation.ts` (Modify: `RestoreEntry` gains a `{ kind: 'project', id, deletedAt }` variant and `parseRestoreBody` accepts it), `src/tasks/restore.ts` (Modify: the `project` branch calls `restoreProjectTree`, with `project_limit` counted across the request's entries as `recipe_limit` is, and the live count), and their tests. `RestoreStatus` gains `project_limit`. The restore route in `src/api/tasks.ts` changes only if it lists kinds by hand (check; the pull request records which).
11. `src/household/invites.ts` and `src/household/__tests__/invites.test.ts` (Modify). First, search the code for any other reader of a household's partition as a whole (backup, `store-cli`, cleanup, `moveOptions`) and put the result in the pull request. Then `moveOptions` gains the three prefixes in its `Promise.all` and its `||` chain, the comment above it is updated, and a test for each prefix, including a tombstone, shows a person with only that data cannot move. `src/household/members.ts` is not changed; a test shows a removed member's hold reads as free through `holderOf` and a take replaces it.
12. `src/store/__tests__/contract.ts` (Modify), done before item 5. A case on all three stores for the take pattern: `ifMissing(takenBy)` with `ifEquals(state)` in one update, `ifEquals(takenBy)` for a departed holder, and two concurrent updates where one fails with `ConditionFailedError`.

### Step 2: The Projects page

**Acceptance:** two people see and edit the same plan on `/plan/projects` and `/plan/projects/{id}`; a pending write shows through the overlay marked "Not saved yet"; a take that loses shows "{name} already has this"; a replaced edit shows a notice that keeps the person's words; the new routes pass the axe check in jsdom (`app/test-utils/accessibility.ts`); and an offline take, move and add replay once (the end-to-end case is in step 6). Whether "two people see and edit the same plan" holds on real phones is a manual check in step 6.

13. `app/lib/projectKeys.ts`, `app/lib/projectOverlay.ts`, `app/lib/projects.ts`, `app/lib/projectLookup.ts` and their tests (Create). The key set (`putProject`, `deleteProject`, `restoreProject`, `takeProject`, `releaseProject`, `putStep`, `deleteStep`, `takeStep`, `releaseStep`; the other three come in step 3), the overlay that applies `applyProject` and `applyStep` to pending writes (with a parity test against the server, as `itemsFromPlanParity.test.ts` does), `useProjects({ counts })` and `useProject(id)` with their polling, and a lookup rule that never says a project or step is gone from absence alone (`projectLookup.ts` copies `recipeLookup.ts`'s rule for projects and steps and does not generalise it).
14. `app/lib/mutations.ts` and `app/__tests__/mutationRegistry.test.ts` (Modify). Define `ProjectMutationKind`, `ProjectMutationVars` and `PROJECT_RUNNERS` in `projectKeys.ts`, and register the set with `registerSet`: runners, `invalidate`, `onSuccess` (saves a notice for `stale` fields and for `held_by_other`) and `onError` (the refusals `project_limit` and `step_limit` through `describeFailure`, with "This household has reached 60 projects." in `projectText.ts`). The registry test gets its own block for the project set.
15. `app/lib/projectNotices.ts` and its test (Create), `app/lib/deviceKeys.ts` (Modify). A `ProjectNotice` is `{ id, kind, recordId, projectId, field, text, changedBy, at }`, kept per person under `projectNoticesKey(userId)`, at most 50 (the oldest go first), one per record and field (a newer one replaces it). For a field that is not text (`position`, `state`, the planned group, a cost) the notice keeps the person's value in words ("Moved below 'Check the joists'", "Done", "£900"). `changedBy` is the stored `updatedBy`. `projectNoticesKey` is added to `clearDeviceKeys`, so sign-out clears it. Reads and writes are inside `try/catch`. Tests: a notice survives a reload, is cleared at sign-out, a second person on the same phone never sees the first's, and the cap and the dedupe hold.
16. `app/hooks/useProjectActions.tsx` (Create). The one place the screens run project mutations, with the per-page "Let them know" tick (`app/lib/letThemKnow.ts`).
17. `app/lib/projectText.ts` and `app/lib/projectForm.ts` (Create). The copy table, the state words, the "who is on it" phrase, ages in neutral words, and the form rules (a title is enough). `projectForm.ts` also owns the position rule on the phone: `positionFor(steps, move)` takes the steps as overlaid and compared with `compareSteps`, and the move (up, down, insert between, or a pasted multi-line add), calls `positionBetween`, and returns a position or "no room". Tests: move up and down, insert between, a paste of several lines (positions in order, one `notify`), no room.
18. `app/components/projects/` (Create), one file and one test each for: `ProjectList.tsx`, `ProjectCard.tsx`, `NewProjectSheet.tsx`, `ProjectPage.tsx`, `StepRow.tsx` (tick, "Move up", "Move down", "I'm on this", "Free this step"), `StepSheet.tsx` (text, note, "Delete step" with Undo), `AddSteps.tsx` (one step for each pasted line), `HolderMark.tsx` (name in words, the person's colour as a second sign from `app/lib/calendarPeople.ts`), `NoticeBar.tsx` (shows the kept text with "Copy" and "Dismiss"), `FinishedSection.tsx` ("Finished", "Bring back") and the "Mark as finished" control in `ProjectPage.tsx`. Undo of a deleted step keeps the deleted step's fields in memory on the page for as long as the page is open; leaving the page ends it. Cases: axe at 360 px, 44 px targets, the empty state, the limit state, and each outcome of a take.
19. `app/routes/plan.projects._index.tsx` and `app/routes/plan.projects.$id.tsx` (Create), `app/components/calendar/PlanSwitch.tsx` (Modify: the third link and wrapping), the tests for the switch and each route, and a route test for the empty state and a limit state.
20. `app/lib/deleted.ts`, `app/routes/deleted.tsx` (Modify). `deletedEntries` keeps its five positional arguments and returns five groups; a new `deletedProjectGroup(projects, counts)` returns the sixth, from the list's counts. The Projects group shows one row for each project with what would come back; the copy and the "nothing deleted" test are updated. Tests.
21. `app/__tests__/wording.test.ts` (Modify): `BANNED_PHASE_5` and `projectFiles()` (paths in "Wording"), and the phase 5 copy table. `app/__tests__/touchTargets.test.ts` (Modify: add the new component files). A restored-cache test holds a pending project write and replays it.

### Step 3: Materials

**Acceptance:** a person types or pastes materials on a project, both people can add lines at once without losing one, "Add to the shopping list" creates each line once with its "for {project}" label, pressing it twice writes nothing and leaves an edited line as edited, and a line cleared from the list is not added again.

22. `src/projects/applyMaterial.ts`, `src/projects/materials.ts`, `src/projects/addToList.ts` and tests (Create). The write rule, the domain (limit 60), and the add route's domain: for each line id, read the material, read the shopping item by that id and skip it if it exists, else `writeEntry` with the material's id as the item id and `forRecipes` set to the project title, ten at a time, the write record last. Tests: twice writes nothing, a line edited on the list survives a second press, a cleared item answers `cleared`, a deleted project or line answers `missing`, an empty or repeated `lineIds` (the repeat is handled once), a crash and retry creates the rest, two people adding lines at once, the label length, an unknown line id.
23. `src/shared/projectValidation.ts`, `src/api/projects.ts`, `src/api/__tests__/projects.test.ts`, `src/api/__tests__/apiRoutes.test.ts`, `src/projects/log.ts`, `src/push/events.ts` (Modify). The three material routes, `material_limit`, the `project_materials` log, `notify` on the first write of a paste only; `GET /projects/{id}` now returns the materials. `src/push/events.ts` needs no new event (the route-to-event rule is in item 9). A sentinel test for a material's text.
24. `app/lib/projectKeys.ts`, `app/lib/projectOverlay.ts`, `app/lib/mutations.ts`, `app/__tests__/mutationRegistry.test.ts` (Modify). Add `putMaterial`, `deleteMaterial` and `materialsToList` (its `invalidate` is the project and the shopping list, as `itemsFromPlan` also refreshes the plan). The overlay marks lines "Not saved yet" and adds no shopping lines.
25. `app/components/projects/MaterialsSection.tsx` (Create) and a test, `StepRow.tsx`'s sibling `MaterialRow.tsx` (Create, with "Delete line" and Undo, the text kept as in item 18), and `app/lib/projectText.ts` (Modify). The section is shown once used or asked for; "Add materials" (one line for each pasted line), the copy button, "On the list" read from the shopping query by item id, "Already on the list" and "Added earlier, and since cleared". Step 3 also modifies `src/projects/children.ts` (delete and restore cover `PMAT#` children, with a test), `src/projects/projects.ts` (the materials count) and `app/lib/deleted.ts` (the "12 steps, 8 materials" count).

### Step 4: The planned day

**Acceptance:** a project with a planned day (or a start and an end) shows on each of those days in the calendar's day view, opens the project, appears offline from a saved copy, and a finished or deleted project does not appear. Nothing changes when the day passes.

26. `src/shared/projectValidation.ts`, `src/projects/applyProject.ts` (Modify) and their tests. The planned group (`plannedOn` and `plannedEndOn` together, one time, `null` clears, an end on or after the start, at most 13 days after).
27. `src/shared/timeline.ts` and `src/shared/__tests__/timeline.test.ts` (Modify). `TimelineInputs.projects`, `TimelineType` `'project'`, `TimelineItem.projectId`, and `ALL_DAY_ORDER` gains `project: 3` (after the dinner at 2). A `projectItems` mapper, like `taskItem`, gives each day from `plannedOn` to `plannedEndOn` an item with `type: 'project'`, `label: "Project: {title}"`, `key: project:{id}:{day}`, `who` (the holder's name through `holderOf`, or none), `projectId` and no time; finished and deleted projects give none. Tests: each day of a span, order independence, a finished project absent, the label, a departed holder shows as none.
28. `app/lib/calendar.ts` (Modify: `inputsFor` reads `useProjects({ counts: false })`), `app/components/calendar/TimelineList.tsx` (Modify: no time range for a project, a link branch). Today (`app/routes/_index.tsx`) gains the same read through the timeline's inputs, so its source is not edited but `app/__tests__/today.test.tsx` and `app/__tests__/pages.test.tsx` mock the new query. Tests: a project day on the day and week views, and a restored-cache test that shows it offline.
29. `app/components/projects/ProjectPage.tsx`, `NewProjectSheet.tsx` (Modify) and `app/lib/projectText.ts`, `app/lib/projectForm.ts` (Modify): the "Planned for" field, its rules (end on or after start, at most 13 days) and its wording, in the sheet's "Add details" and on the page.

### Step 5: Costs

**Acceptance:** a project can hold an estimate and an amount spent, each optional, the page shows them as figures with "Last changed by", and no project cost changes the Money page or `computeTotal`, `loanProgress` or `settledIds`.

30. `src/shared/projectValidation.ts`, `src/projects/applyProject.ts` and their tests (Modify). `estimatePence` and `spentPence` as separate fields with their own times and `costBy`, `MAX_PENCE`, a whole number of pence of 1 or more, or `null` to clear (the form, `app/lib/projectForm.ts` with `parsePounds`, turns 0 into `null`).
31. `src/projects/__tests__/costsLedger.test.ts` (Create). Fixed inputs give the same `computeTotal`, `loanProgress` and `settledIds` before and after project cost writes, and no project write touches a `MONEY#` item. The sentinel test (item 7) gains a distinctive figure.
32. `app/components/projects/CostsSection.tsx` (Create) and a test, `app/lib/projectText.ts` (Modify), `app/__tests__/wording.test.ts` (Modify). The costs section ("Add a cost"), "£1,250 of £4,000", "Not in Money. This is only for the project.", and the check that the cost files do not say over budget, overspent, who paid or settle, or any `BANNED_PHASE_3` word (this is the only place the cost-file check lives).

### Step 6: Finish

**Acceptance:** the offline end-to-end cases pass, and `docs/MANUAL-CHECKS.md` holds every real-world check above, with the existing checks named in "Existing manual checks this phase could break".

33. `e2e/offline/main.tsx` and `e2e/offline/offline.spec.ts` (Modify): an offline take and move on a project replay once; a saved project reads offline. The spike runs against a stub API, so this proves the queue rule and not the real take and move: the stub gains take and move handlers, and the real replay is covered by the registry, overlay and restored-cache tests and the manual checks. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an installed Chromium.
34. `docs/MANUAL-CHECKS.md` (Modify): a Projects (phase 5) section with the new lines in "Existing manual checks this phase could break", and the Reading and touch section gains a phase 5 line (the words of `BANNED_PHASE_5`, no red).
35. `docs/ROADMAP.md` (Modify): a Phase 5 block with these steps above "Later phases", and the "Later phases" line for phase 5 with its design link. `CLAUDE.md` (Modify): the status line, a Projects line in Architecture (the prefixes, the take rule, the overlay and notices, `forRecipes` reuse), and a mention that `moveOptions` now lists `PROJECT#`, `PSTEP#` and `PMAT#`. `docs/DECISIONS.md` (Modify): the phase 5 design decisions and "Spec says / Built / Why" rows, including the `forRecipes` naming choice. `README.md` (Modify only if it lists features; check when this step starts).

### Where each goal is delivered

| Goal | CUJs | Items |
|---|---|---|
| G1 | 1, 2, 6, 10 | 1 to 6, 8, 13 to 20 |
| G2 | 3, 4, 12 | 1, 5, 8, 11 to 19 |
| G3 | 4, 10, 13 | 2, 17, 18, 19 |
| G4 | 7 | 22 to 25 |
| G5 | 8 | 26 to 29 |
| G6 | 9 | 30 to 32 |
| G7 | 1, 3, 6, 11 | 13, 14, 20, 21, 33 |
| G8 | 3, 5 | 4, 5, 8, 14, 15, 18 |
| G9 | 13 (and every journey) | 17 to 21, 32, 34 |

### Verification Plan

*   **Compilation/Build**: `yarn typecheck` and `yarn build` pass after every step.
*   **Unit Tests**: `yarn test` passes, including the pure rules, the write rules, the take and delete and restore tests, the overlay parity test, the sentinel tests and the contract tests (`DYNAMODB_ENDPOINT=http://localhost:8000 yarn test`).
*   **Guard tests**: the wording test (with `BANNED_PHASE_5`), the mutation-registry test, the touch-target test, the route accessibility test, and the infrastructure guard test, which is unchanged and must still pass.
*   **E2E**: `yarn test:e2e` runs the offline cases added in step 6 (against a stub API, see item 33).
*   **Manual**: the new lines in `docs/MANUAL-CHECKS.md` on two real phones, and the existing checks named above, run with phase 5 in place.
*   **Compatibility**: a test restores a saved cache with `schemaVersion` 1 that holds a pending project write, and it replays on the new app. Rollback is not tested. What is known: item 11's search found the whole-partition readers listed in its pull request, and `moveOptions` is the one that ignores the new prefixes after a rollback. What is not known: any reader added since. An older app ignores the new routes and drops a queue that holds keys it does not know (accepted, Open Questions).

--------------------------------------------------------------------------------

## Review history

*   **Brief:** reviewed by six independent reviewers (design, codebase, simplicity, a cold reader, implementation readiness, structure) before this design was written; findings are in the brief.
*   **This design:** five stages (initial zoom-out, comprehension, critic, intermediate zoom-out, implementation readiness); reports are in `phase-5-review/`, and `consolidated_review_report.md` ranks the findings. One Blocker (the partition-read audit named a place that reads nothing) and thirteen Majors were applied in one edit pass, with the author's agreement to the three defaults: no tidy-order re-spacing, accepted rollback loss, and a light projects read for Today and the calendar.
*   **Declined:** a batch paste route, a shared per-field helper, an orphan cleanup job, an old-app skip mechanism. **Kept:** one record per material line, and the project-level hold.

--------------------------------------------------------------------------------

*Drafted with EGM*
