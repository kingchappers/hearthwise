# Phase 5: DIY projects

* **Author:** kingchappers
* **Date:** 2026-11-21

## Overview

Phase 5 adds a Projects page where the two people in a household keep a shared, ordered plan for a DIY job: redecorating a room, fixing a plug, taking down decking and building a garden room. Either person can add and edit steps. A person can mark a step "I'm on this" so the other can see it is taken. A project can hold a plain materials list that copies onto the shopping list, an optional planned day that shows on the calendar, and optional estimated and actual costs that stay apart from the money ledger.

The problem comes from one person knowing the plan and finding it hard to put into words, while the other cannot see it. The second person then suggests steps that were already in the plan, which reads as "I don't think you know what you are doing", and the two sometimes start the same job. Today the plan and the research live in two heads. The aim is to get the plan out of one head so the other person can look at it. It is not to make anyone approve it.

## Analysis

The author answered the product questions in an interview. Everything else is Claude's reading of the code and the reviewers' findings. Six reviewers read the concept (design, codebase, simplicity, a cold reader, implementation readiness, structure). Their agreed points are below, ranked. A tag says who decided: **[Author]** or **[Claude]**.

**1. Households moving would strand projects. [Claude]**
`moveOptions` (`src/household/invites.ts`) lists each data prefix by hand. A person whose only data is a project looks like they have none, so they can move to another household and the project is lost without any error. The fix is in step 1: add the new prefixes, count tombstones, and test each prefix. The new sort-key roots must not be a string prefix of one another (`PROJECT#` and `PSTEP#` are fine, `PROJECTSTEP#` is a trap). If the API is rolled back after step 1, the older check ignores the new prefixes and the hazard returns. The step 1 pull request says so.

**2. "I'm on this" is first to reach the server wins. [Author]**
Newest-write-wins is wrong for a claim, because the later tap would silently overwrite the earlier one while the earlier phone still shows "mine". The rule is first-writer-wins using the store's `ifMissing`. The server answers with a 200 and a status (`claimed`, `taken`, `released`), never a 4xx, because the offline retry rules drop a write that gets a 4xx and the overlay would keep showing a claim that never happened. The loser sees "{name} already has this". Either adult can release a step, and a release by someone else is visible. A removed member's claim reads as free. A claim never moves a row. The rule is in the step 1 write rule, not left to step 3. "I'm on this" also works on the project as a whole, so a small job with no steps is not invisible.

**3. Edits made at the same time need a visible outcome. [Claude]**
Per-field newest-write-wins is silent in the code today. I told the author the app would tell the person whose edit lost, but nothing does that yet, so the notice is new work. It must say what happened in calm words (no "conflict", "rejected" or "lost"), reach a person who learns of it hours later after reconnecting, and keep the losing text copyable after the notice is dismissed. "Newest" means the device clock at the time of the write, not the order of syncing.

**4. Step order is a position value on each step. [Claude]**
The store compares single values only, and recipe and task lists are rewritten whole, so two people editing different steps would lose one. Each step is its own record with a `position` string (fractional, so inserting between two steps changes one record), computed on the phone from the neighbours it saw, with its own `fieldTimes` entry, a step-id tie-break so both phones show the same order, and no automatic rebalance. A step cap (about 30 to 40) keeps the key short. Two people moving different steps into one slot converge on one order that may not be what either meant, and the design says so. The page offers "Move up" and "Move down", not dragging.

**5. Steps are a new kind of record, not tasks. [Claude, with the author's decision that the plan is opened as its own page and not shown on Today]**
Claiming a task goes through the proposal rule, so it would need the other person's approval, which the author ruled out. A step with a due date would appear in "Due" on Today, and thirty steps would flood it, the digest and the nudges. A task's checklist is a whole-list field. The cost is a new area about the size of phases 2 to 4, each of which took six or seven pull requests. One reviewer suggested trying one task with a long checklist for a week first. The author's problem is competing over the same step, which a task cannot give, so this design builds steps, and the trial is recorded under Alternatives.

**6. A step and a project need a done state and a life cycle. [Claude]**
The first version had claim and "in progress" but no way to finish. A step has three states: Not started, On it (with a name), Done. A finished step stays in place and says so in words (a tick and "Done", not only a strike-through). A project can be marked finished, which takes it out of the default list (not onto the Deleted page). Live records never expire, so without this the list grows for ever.

**7. Deleting a project hides its steps, not tombstones each one. [Claude]**
A cascade is not one atomic write, and a half-finished cascade leaves a mess. The project is tombstoned and its steps are hidden while the parent is deleted. Steps take the parent's expiry at delete time (or a cleanup job like `src/calendar/cleanup.ts` removes them), so they do not outlive it, and restoring the project restores its steps. The Deleted page shows one row per project ("12 steps, 8 materials"), not one per step. A single deleted step gets a short undo.

**8. Materials copy to the shopping list through a new route. [Claude]**
The plan's add-to-list route is meal-specific; only `writeEntry` (`src/shopping/items.ts`) is reusable. A new route, validator, domain function, mutation kind, overlay and push text follow the shape of `addPlanToList`. The recipe parser and merger are not reused, because DIY lines are plain text that nothing scales or merges. The shopping line is labelled with the project title using the existing `forRecipes` field as it stands. A new field would touch about nine places and risks a silent wipe in any one missed. The name is misleading, and `docs/DECISIONS.md` records it. The label is create-only and a snapshot (renaming the project leaves old lines with the old title). The copy is one way. Materials are plain text with no line ids, so pressing "Add" twice would duplicate: the design chooses between ids derived from a hash of the project and the line, and a calm "some of these may already be on the list".

**9. The planned day is an all-day strip item on the device. [Claude]**
It follows the choice phase 4 made for tasks and the dinner: worked out by `buildTimeline`, not stored as an event, so it avoids the privacy projection, reminders and the event limit. It changes a closed pure module (`TimelineType`, `TimelineInputs`, `TimelineItem`), adds a fifth polling source that must be in the saved cache for offline use, and needs a link branch in `TimelineList`. The wording says it is not a deadline and nothing changes when it passes: "Planned for Saturday", "Planned for 3 Nov".

**10. Costs are optional and last. [Author, with reviewers asking to drop them]**
Two reviewers say costs do not serve the stated aim. The author wants them, so they stay as the last functional step and the first thing to cut. They are kept entirely apart from the money ledger, because payment is either from the joint account or by one person with nothing owed. A test shows project costs never change `computeTotal`, `loanProgress` or `settledIds`. The screen says "Not in Money. This is only for the project." Wording is "£740 of £1,200", never "over budget". The shape is the open question below.

**11. Projects live under Plan as a third switch option. [Claude]**
`DefaultLayout.test.tsx` pins six tabs and the six-tabs-at-the-largest-text check is unticked, so there is no seventh tab. The switch becomes "Dinners | Calendar | Projects" at `/plan/projects`. The cost is that it changes the switch that the phase 4 icon check already asks about.

**12. Wording, logs, push and privacy. [Claude]**
A new `BANNED_PHASE_5` list and a `projectFiles()` filter in the wording test (new files get only the global list otherwise). The list covers over budget, overspent, behind schedule, stuck, stalled, blocked and abandoned, and cost lines also pass the phase 3 list. The screen says "I'm on this", never "claim" or "assign". "Claim" is already a defined term in phase 4. Logs hold ids, enums and counts only, with sentinel tests. Push bodies are generic, and only the existing "Let them know" tick sends one. Projects are not private: both people see everything. This is stated as a decision. Nothing points at Hoardwise. There is no infrastructure change, and the design says why.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * A shared, ordered plan that both people can edit with no lock and no approval.
  * Steps with an owner and a state, and "I'm on this" that settles who has a step.
  * A job with only a title works, so a plug is not treated like a garden room.
  * A plain materials list that copies onto the shopping list, labelled with the project.
  * An optional planned day shown on the calendar day view.
  * Optional estimated and actual cost, kept apart from the ledger.
  * Offline use like the rest of the app, and a visible "Not saved yet".
* **Out-of-Scope Non-Goals:**
  * Locking a plan while one person edits it.
  * Approval of a plan by the other person.
  * Steps appearing on Today or in the Due strip, or step due dates.
  * Photos, attachments and sketches.
  * Any link to the money ledger, or splitting project costs.
  * Parsing or merging materials like recipe ingredients.
  * Reminders for a planned day.
  * A seventh tab, and dragging to reorder.
  * Private projects or steps.

## Alternatives Weighed

* **Steps as tasks with a project label.** Rejected by Claude: claiming goes through the proposal rule and needs approval; steps would flood Today and the digest; the checklist is a whole-list field.
* **One task with a long checklist, tried for a week.** Not the design. It cannot give per-step claims or concurrent step edits, which is the problem the author described. It stays as a cheap trial if the author doubts the need.
* **A locking mechanism.** Rejected by Claude, with the author's agreement: it cannot work offline, can get stuck when a phone dies, and blocks the case of both people adding steps.
* **One project record holding steps as a list.** Rejected: two people editing different steps conflict, and a claim conflicts with a reorder.
* **Order in the sort key or as a linked list.** Rejected: a move becomes delete plus put, which breaks claims and idempotency, and concurrent inserts corrupt a list.
* **Claim as newest-write-wins.** Rejected by the author's choice of first to reach the server: the loser is silent.
* **Claim with both names on a step.** Rejected for the first version: it defeats showing a step is taken, but a joint step may turn out to be a real case.
* **A new `forProject` label field.** Rejected for cost: about nine sites and a silent-wipe risk. A single generalised label in a preparatory step is the fallback.
* **The planned day as an `EVENT#` record.** Rejected: it pulls in privacy projection, reminders, restore and the 500-event limit.
* **Costs as a list of purchases, or as a `projectId` on a money entry.** Rejected: the first is a small ledger, and the second ties projects to the ledger the author wants separate (a Future Improvement at most).
* **A seventh tab.** Rejected: the nav test and the unticked six-tab check.
* **Tombstoning every step when a project is deleted.** Rejected: not atomic.

## Key Decisions & Staging for Next Steps

Decisions for the draft to record first, each with "Decided by":

1. Key schema: `PROJECT#<id>` and `PSTEP#<projectId>#<stepId>`, exported prefixes, `moveOptions` and `removeMember` handled in step 1.
2. Claim rule and its outcomes, who may release, former-member claims, the step 1 write rule.
3. Step order by `position`, the step cap, same-slot collisions, a move of a deleted step returning a status.
4. The loser notice and what "newest" means offline.
5. Step states, a finished project, and how it leaves the default read.
6. Delete, restore, expiry, Deleted-page row and cap, restore limit status.
7. Shopping reuse: `forRecipes` as it stands, the new route, the duplicate rule, one-way copy.
8. Timeline: strip item, `projects` input, a fifth saved source, link target.
9. Costs: scope, shape, the "not in Money" line, the totals test.
10. Navigation, limits, wording, logs, push, infra ("none, and why"), the manual checks a phase 5 change could break.

Proposed build order (stacked pull requests, each with an acceptance sentence and numbered items):

1. The plan on the server: projects, steps, `position`, the claim rule, states, restore, `moveOptions`, removed-member behaviour, limits and logs.
2. The Projects page under Plan, with the overlay, "I'm on this" and Move up and down, working offline.
3. Materials: the text list, the label on the shopping line and the copy route.
4. The planned day on the calendar.
5. Optional costs.
6. The finish: wording test, the offline end-to-end case, docs, roadmap and the new manual checks.

The author's must-haves are met after step 4. Costs (step 5) are the first thing to cut. The offline wiring (mutation keys, runners, overlays, a restored-cache test with a pending project write) is part of every step and not left to the end.

**Open questions for the author** (the draft states a default for each, marked Claude):

1. **A Today line.** The author wants nothing on Today. The reviewers say a step claimed by the other person is then visible only to someone who opens the plan. Default: no Today line.
2. **Planned day.** One day, or a start and end (a weekend)? Default: a start day and an optional end day.
3. **Cost shape.** Two project-level figures (estimate, spent) edited by either person, where a concurrent edit loses one and says who last changed it, or a list of spend entries with a computed total (no lost edits, but a small ledger). Default: two figures.
4. **The word "Project".** It sounds big for a plug. "Job" is an option. Default: "Project" in the design, wording reviewed in the draft.
5. **A finished project and tombstones.** Archived out of the default list, and how long a deleted one stays (30 days, as for tasks, items and recipes, or never as for money). Default: archive, 30 days.
6. **"Let them know".** On adding a step only, or also on "I'm on this" and Done. Default: an opt-in tick on any write, and no other push.
7. **Old queued writes.** A phone on an older app after a rollback may hold writes for keys it cannot replay, and they are dropped. Default: accepted and tested.
