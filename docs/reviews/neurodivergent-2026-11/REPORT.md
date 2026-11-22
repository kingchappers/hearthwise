# Hearthwise review for autistic, ADHD and AuDHD adults (2026-11-21)

Two rounds, four reviewers each: an autistic persona, an ADHD persona, an AuDHD persona and a design assessor (COGA, WCAG 2.2 AA, sensory, predictability, cognitive load, executive function, language, shared use, personalisation). Each had its own browser and its own seeded copy of the app, run locally from the container build of `phase-5-step-6-finish`.

- **Round 1** (`raw-round1/`) was briefed on the household's DIY-plan problem and pointed at the newest feature, Projects. It went deep on Projects and thin on the rest.
- **Round 2** (`raw-round2/`) was briefed only with what the app is for (a shared household app for two neurodivergent adults) and told to cover everything, with a coverage table. It found more in the older areas and nothing new about Projects beyond round 1, which is itself useful: Projects findings were confirmed independently, not just reflected from the brief.

Reviewers' screenshots are in `/private/tmp/claude-501/hw-review/shots/` and `shots2/` (not kept in the repo).

## How far to trust this

- **These are simulations** informed by published guidance, not people. Most sources are practitioner guidance; for AuDHD the research is thin, and reviewers marked confidence on each finding. Treat findings as strong hypotheses to test with the two of you.
- **Findings I confirmed myself** (in the source or by driving the app): the wrong proposal sentence for the requester, the dead-end page after deleting a task, the task page staying unchanged after Done (still shows "Done", history "Nothing has happened to this yet" 15 seconds later), the "Let Alex know" tick staying ticked after a save, "All square" being shown when no entry is agreed yet, the planned weekend showing on the calendar, and that a later edit replacing yours is never reported to you.
- **Rejected:** round 1's AuDHD claim that the planned weekend was missing from the calendar (it is there; the reviewer used a URL parameter that does not exist).
- **Unconfirmed:** a reviewer saw the browser's offline error page when opening an unvisited page offline. The service worker registers on every non-dev load (`serviceWorker.ts`), so this is probably a headless timing artefact. Check on the deployed build on a real phone.
- **Still not covered by any reviewer:** a queued change that the server refuses, real push messages and quiet hours, real calendar feeds, sign-up/join/welcome and invite creation, Sign out, Money loan and payment forms, recipe editing, real screen readers, and an actual person of each profile. Round 2 reviewers also ran out of time on several areas (listed in their coverage tables).

## Verdict

| Profile | Assessor score, round 1 / round 2 | Would they keep using it? |
|---|---|---|
| Autistic | 3.5 / 3.5 | Yes for Today, Shopping, Money. Task proposals, the Projects rules and feedback need wording and placement fixes before it is trusted in front of a partner. |
| ADHD | 3.5 / 3.5 | Yes: calm and never nags. Risks are lost half-typed text, nothing upcoming on Today, and Projects being easy to forget. |
| AuDHD | 3.5 / 3.5 | Yes: a stable frame, low demand, real settings. Risks are no energy control for tasks, silent changes, and the dead ends. |

Assessor area scores (round 1 / round 2, out of 5): COGA 4 / 3.5, WCAG 2.2 AA 4.5 / 4.5, sensory 4.5 / 4.5, predictability 3.5 / 3, cognitive load 3.5 / 3.5, executive function 3.5 / 3.5, language 4.5 / 4.5, shared use and conflict 3 / 3, personalisation 3 / 4, cross-profile 3.5 / 3.5. The round 2 assessor saw the whole app and scored predictability and COGA lower because of vocabulary drift and uneven feedback.

The technical base is strong in both rounds: axe-core found zero violations on every main page in light, dark, largest text and desktop; no horizontal scroll at 320 or 360 px with the largest text or with WCAG text-spacing overrides; reduce motion genuinely zeroes transitions; no red, no sound, no flashing. The weakest area in both rounds is feedback when two people act on the same thing, and consistency of words and Undo.

## What to protect

- Calm, low-shame wording everywhere ("Nothing planned yet", "Whenever", "Nothing more today"); a past-due task reads "Due · Wed 18 Nov" with no red.
- Offline: "1 change waiting to be saved", "Not saved yet", and per-entry "Not saved yet" on Money, settling without duplicates.
- Task assignment as a request ("Ask Alex", Accept, Decline, Withdraw) and the private-event rule stated on the form ("Alex sees that you are busy", Alex sees "Busy").
- "Show the next thing" with "Not now"; "Pick something easy" with Shuffle; the "Low energy" tag; the recipe cooking view ("Get everything out", ticks, "Start again") and the recipe draft ("Continue your draft").
- Add to shopping list review with "I have this", "Not adding", "Add 6 lines"; material lines "On the list" and "Lines already on the list are left as they are, so pressing this twice adds nothing."
- Undo toasts that name the thing, with the Messages setting; the Deleted page with 30-day rule and what comes back.
- Settings: text size, appearance, reduce motion, Undo duration, quiet hours, "Today opens with"; notifications off until chosen.
- A title-only project; pasting lines makes steps; no due dates on steps; "Not in Money. This is only for the project."; "Planned for ..." wording.

## Findings by theme

R1 = round 1, R2 = round 2, with the reviewer's ID (AU autistic, AD ADHD, AH AuDHD, AS/A assessor, F round 2 persona finding). Sizes: tiny / small / medium. Fixes that touch earlier phases are marked "ph1–4".

### A. Wrong or confusing sentences and dead ends (confirmed)
1. **Wrong proposal sentence (Major).** The requester sees `You asked Alex to give "Clean oven" to Alex`, under "Waiting for them", and after a decline `Alex declined: give "Clean oven" to Alex`; the task still shows "Anyone" with a Done button while pending. Cause: `describe()` in `app/components/tasks/ProposalBanner.tsx` words the change from the recipient's side. Seen by four reviewers (R2 F1, F5, A-1). Fix (small): requester "You asked Alex to take "Clean oven". Waiting for Alex."; recipient "Sam asks you to take "Clean oven""; declined "Alex said no to taking "Clean oven". It is still on your list."; label the pending row "Asked of Alex". ph1.
2. **Delete a task lands on "We couldn't find that task." (Major).** The Undo toast has no home and the line reads like an error (R2 F2, A-7). Fix (tiny/small): navigate to Today after delete and keep the toast; if a deleted id is opened say "This one was deleted. Undo or go back to Today." `app/routes/tasks.$id.tsx`. ph1.
3. **The task page does not update after Done (Major).** Still shows Done, "History: Nothing has happened to this yet."; the other person's Done does not appear on an open page, and a second Done just shows another toast (R2 A-3). Fix (medium): show "Done by you, just now" with Undo, refetch history, poll the open task page and say "Alex marked this done 2 minutes ago". ph1.
4. **"All square" shown while nothing is agreed yet (Minor, confirmed).** Only agreed entries count, so "All square" can be untrue (R2 F3). Fix (tiny): "All square so far (1 entry waiting)". ph3.
5. **"Waiting for Alex / Waiting for Sam / Waiting for them / Waiting for you" mean different things on one screen**; "Ask Sam to check" gives no confirmation and Sam sees "Alex wants to check this one" with no reason (R2 F2). Fix: distinct text ("You asked Sam to check this" vs "Waiting for Alex to agree"), a toast on asking, and an optional one-line "What should Sam look at?" note on Ask to check and on Decline (medium, optional). ph3.

### B. Feedback far from the action, or missing (Projects, round 1 and 2)
6. **Refused "I'm on this"** shows "Sam already has this" in a banner at the top of the page, not on the step, and does not name the step; "Already on the list" likewise. First "Add to the shopping list" press gives no message; second shows two stacked toasts (R1 AU-1/AS-3/AD-6; R2 F4). Fix (small): notice on the step row, name the step, one toast, first-press "Added 2 to Shopping" with a link. Files `NoticeBar.tsx`, `ProjectPage.tsx`, `mutations.ts` (`saveProjectNotices`), `projectText.ts`. ph5.
7. **A later edit replacing yours is never reported to you (Major, confirmed gap vs design goal G8).** Applies to project steps (R1 AU-2/AS-2/AD-7/AH-5) and tasks (R2 A-8: both edited a task, each person's view diverged for 6+ seconds, no message). Fix (medium): remember on the device what you last saved per field; when a poll shows the field changed by the other person to something else, show the kept-words notice with Copy; tiny first step, a rule line on the sheet ("If you both change this, the later save is kept"). ph1 and ph5; the design should record the gap.
8. **Deleting, finishing and restoring a project give no signal (Major).** Delete returns to the list with no toast or Undo; finishing swaps the button to "Bring back" with no "Finished" word on the page or card, and the claim button stays; restore shows nothing; the Settings link says "See deleted tasks" (R1 AS-1/AU-5/AD-4/AD-5/AH-6/AH-11; R2 F4, AH F9). Fix (small): toast "Project 'X' deleted. You can bring it back from Deleted." with Undo; visible "Finished" line and card label, keep "x of y steps done"; toast on finish; hide "I'm on this" when finished; "Project restored. It is in Projects."; link "See deleted items". ph5 and ph1.
9. **Money delete has no Undo** while task, shopping and project-step deletes do; "Start again" in cook mode and "Clear this day" act at once (R2 A-6). Fix (small): the same Undo toast for money delete, and an Undo for "Start again" and "Clear this day"; state the rule once ("Deleted things come back from Deleted for 30 days"). ph2–3.
10. **Layout moves without an action:** a banner pushes the page down; ticked shopping rows jump to the bottom; the other person's additions reorder your list within ~15 seconds with no "who" (R1 AU-8; R2 F7). Fix (small to medium): reserve space for banners; keep ticked rows in place until "Clear ticked"; a quiet "Sam changed the list. Show changes" note instead of silent reordering. ph1 and ph5.

### C. Typed words and drafts are lost (Major)
11. Escape, an outside tap, Close, reload or leaving the page wipes a half-typed task, step note, "Add a step" or new-task title; recipes keep a draft, so it is inconsistent (R1 AD-1/AD-2; R2 F1, A-2; the calendar and money add forms too). Fix (small): per-person device drafts as recipes do (`deviceKeys.ts`, cleared at sign-out) with "Continue your draft / Start again"; or `closeOnClickOutside={false}` with a confirm only when dirty. `ResponsiveSheet.tsx`, `AddSteps.tsx`, the task, calendar and money sheets. ph1–5.

### D. What Today shows
12. **Nothing upcoming on Today (Major for ADHD and AuDHD, Medium confidence).** "Now: nothing on / Nothing more today" while the calendar has Dentist on Tuesday and a work call on Wednesday, and a project planned for the weekend with a step taken by the other person (R1 AD-3/AH-1; R2 AD F2, AH F4). Fix (medium): a short "Coming up" list (next two or three items within three days, with the day word), and one quiet line per project when the other person took a step or a planned day is within a week, off-able in Settings > Your view. This reverses the design's recorded default ("No Today line"); a decision.
13. **Empty cards above the tasks, and two filled primary buttons** (R1 AS-11; R2 A-13). Fix (small): collapse empty cards to one line; make "Add a task" the only filled button; hide "Anyone" when it is the default (or say "Either of you").
14. **"Show the next thing" / "Not now" cycle with no rule** (R2 AH F3). Fix (small): "Next of 3", an end state "That's all for now. Show the full list", and "Not now puts it at the back. Nothing changes for Alex."
15. **Energy only exists for dinners** (R1 AH-2; R2 AH F1). Fix (medium): an optional effort tag on tasks and steps and a Today "Little energy today" that prefers small things; per person, clears itself next morning. A decision.

### E. Words, consistency and idiom
16. **One idea, many words; one word, many meanings** (R1 AS-4/AS-5; R2 A-5): Today/Home; Anyone/Together/Both of you; Edit/Change; Done (task button, step status, tick label, toast) vs "Mark as finished"; Delete/Remove/Clear/Withdraw/Decline; Restore vs "Bring back"; "Pick something easy" vs "Low energy"; "On it", "I'm on this", "You're on this", "Free this step" (read literally as a price); "Block" unexplained; "Add" for four different objects. Fix (small to medium): one table, applied in one pass, recorded in `docs/brand.md`. Suggested: "Today" everywhere; "Both of you"; "Edit"; holder sentence "Alex has this" / "You have this" (drop the separate "On it"); "Give this step back"; Today's task button "Mark done" and state "Done"; Delete = comes back from Deleted, Remove = a person or link leaves, Clear = empties; "Restore" everywhere; "Routine, like Wind down" for Block. Update the wording-test phrase lists with any renamed words.
17. **Idioms and vague labels** (R1 AS-9/AS-24; R2 F3, F8, F12): "Pick something easy", "Show the next thing", "take a look", "Some days after it's done" / "Every few days" (R2 F8: two options sound the same), "Agree" without saying to what. Fix (tiny): "Choose a dinner", "Show one task / Show all tasks", "Open Hearthwise, Plan, Projects to see it", "Some days after I finish it" vs "Every N days, whether or not it is done" with an example line.
18. **Rules not stated:** what a project hold means, why a button is absent for the other person, what ticking a step someone else holds does (R1 AU-3, AH-4/14). Fix (small): one line under Steps ("Taking a step or project tells the other person you have it. It does not stop them. If you both take one at once, the first to save keeps it."), "Sam is on this." where a button is absent, a confirm for ticking a step someone else holds. ph5.
19. **Costs read "£1,250.00 of £4,000.00"** with nothing saying which is spent (R1 AU-12; R2 F6). Fix (tiny): "Spent so far £1,250.00. Estimate £4,000.00." (no "left" or "remaining"). ph5.
20. **Settings wording:** "Problems always stay until you close them", "from earlier days" (digest), "Messages" meaning both pop-ups and pushes, the "Display settings are saved on this device" line sitting above sections that are not (R1 AD-18/AS-24; R2 F16). Fix (tiny): "Notes that need you stay until you close them", "what is due today, and anything still waiting", "Pop-up notes"; move the sentence to Display. ph1.

### F. Settings, notifications and "Let Alex know"
21. **The "Let Alex know" tick** repeats on every page and in every sheet, 20 px, "Sends them a short message about the changes you make here" (who is "them"? which changes?), and stays ticked after a save so later changes also notify (confirmed). Three reviewers want a household-level setting; ADHD reviewers want it easy to use at the moment it matters (R1 AS-8/AU-7/AD-20/AH-18; R2 F10, F6, A-4). Fix (small to medium, a decision because it touches "nothing is sent unless ticked"): label "Tell Alex when I save a change on this page" with the state shown ("Alex will be told about each change you save"), untick after each save or say it stays on; optionally a Settings default "Tell Alex: Ask each time / Never" and a visible "Alex was told" after a write.
22. **Pushes** say too little ("Sam changed a project / Open the project to take a look.") and tasks/shopping carry the task text on a lock screen while money, calendar and projects do not (R1 AU-6/AD-16/AS-19). Fix (small): fixed kinds, no titles, no imperative ("Sam took a step", "Sam marked a project finished"); decide task and shopping bodies. `src/push/events.ts`.
23. **Settings page:** Display at the bottom of a 2,500 px page; two 24-option time lists that default to 00:00 (R1 AS-21/AH-16; R2 A-10, F11). Fix (tiny/small): Display first or a jump line; default 08:00 shown as "8:00 am" and "Off" until chosen; collapse sections.

### G. Layout, size and density
24. **Project step rows** hold tick, words, state, take, Move up, Move down (R1 AS-13/AD-12; R2 A-11). Fix: a 44 px tick area and a stable row height (small), number the steps and show "2 of 8 steps done" on the page (small), Move up/down behind a "Reorder" mode (medium).
25. **Pasted list markers are kept** in step titles (and materials): `- `, `1. ` (R1, four reviewers). Fix (tiny): strip `-`, `*`, `•`, `1.`, `1)`, `[ ]` in `splitLines`.
26. **New project and creation:** "New project" opens a sheet whose only button is also "New project", and saving stays on the list (R1 AS-6/AD-8/AH-10). Fix (tiny/small): "Add project", then open it with the cursor in "Add a step".
27. **Plan page is a wall of "Nothing planned yet"** (28 to 35 rows, six weeks, including past days) (R1 AS-22; R2 AU F11, AD F4, AH F8). Fix (small): hide past days, show this week and next, collapse the rest ("Nothing planned Tue 24 to Fri 27"), and consider dropping "yet".
28. **Calendar and money add sheets** show about 12 fields at once, the Add button below the fold; "Private" can contradict "Both of you" (R2 A-12, AU F13, AD F3). Fix (medium): Title, Date, Time first; the rest under "More"; make the Add button sticky; disable Private with a reason when Both is chosen. Week view starts today while Plan weeks start Monday (R2 AU F9): choose one.
29. **Targets and small things:** tick boxes 20 to 24 px (the author aims for 44), Delete beside Edit on every shopping row, "All projects" clips to "All proj" at the largest text, "Add 0 lines" offered with nothing to add, Undo toasts over the tab bar and `role=alert` for successes, the Note field unexplained, sheet header makes a second banner landmark and the avatar menu fails `aria-required-children` and reads "SASamsam@example.com" (R1 AS-14/AS-16; R2 A-14, A-15, A-16). Fix (tiny each): 44 px hit areas, Delete into the edit view or a row menu, wrap the title row, hide the button, toasts above the nav with `role=status`, helper text on Note, sheet title as a heading, avatar label "Account: Sam".
30. **Standing offline message** missing: no sign of being offline until a change is made, and no stated reason for a queued change; refusal wording untested (R2 A-9). Fix (small): a calm strip "Offline. Changes are kept on this phone and save when you are back." with `role=status`; one phrase for queued changes everywhere ("Waiting to be saved"); a "Saved" note after reconnect.

## Decisions (2026-11-22)

| Question | Decision |
|---|---|
| What Today shows (D12) | Add a short "Coming up" list (next two or three calendar items within three days) and one quiet project line only when Alex took a step or a planned day is within a week. Both can be switched off in Settings. This reverses the phase 5 default of "No Today line". |
| "Let Alex know" (F21) | Keep the per-page tick but rename it "Tell Alex when I save a change on this page", untick it after each save, and show "Alex was told" afterwards. "Nothing is sent unless ticked" stays. |
| Energy for tasks (D15) | Build it: an optional small / medium / big tag on tasks and steps, and a Today control "Little energy today" that prefers small things; per person, clears itself the next morning. |
| Extras | Build all four: a planned-day reminder (optional, off by default), a "Do in this order" flag on projects (a "Next" marker, blocks nothing), a relative-time setting (exact times stay the default), and an optional "Because..." note when taking a step or asking the other person to check something. |

## Where one profile's fix hurts another

- **Stated rules (autistic) vs low clutter (ADHD):** put each rule in one short line at the point of use, not a panel or tour.
- **Confirm before destructive acts (autistic) vs speed (ADHD):** use Undo everywhere instead of confirm dialogs (serves both).
- **Fixed order vs one thing at a time:** keep "Show the next thing", add the counter and end state, never auto-reorder the full list.
- **Reminders vs demand:** keep off by default; add one-tap "Remind me about my steps" and an optional planned-day reminder, off until chosen.
- **Showing upcoming things on Today vs sensory calm:** short lists (three lines), opt-out in Settings.
- **Random "Pick something easy" (novelty) vs predictability:** deterministic with a visible reason ("Shortest first") and "Show another".
- **Exact times (autistic) vs relative time (ADHD time blindness):** an optional relative-time setting; not built.
- **Strict order vs free choice between the two people:** an optional per-project "Do in this order" flag with a "Next" marker that blocks nothing (later).

## Suggested order

1. **Quick and small (one pull request each, mostly copy and placement):** A1, A2, A4, B6, B8, B9, E16–E20, G25–G29, the "Let Alex know" label and state (F21), Settings reorder and defaults (F23).
2. **Small to medium:** C11 (drafts), A3 and B7 (the task page update and the replaced-edit notice, with a design note), B10 (layout moves), G24 (step rows), F22 (pushes), the standing offline strip (G30), the "Coming up" list (D12).
3. **Decided, to build (see Decisions):** the Today "Coming up" list and project line, the clearer "Let Alex know" tick, the effort tag and "Little energy today", the planned-day reminder, the "Do in this order" flag, the relative-time setting, and the "Because..." note. These are features, each with its own design note and pull request.
4. **Another pass:** the areas no reviewer reached (refused queued change, real push, feeds, sign-up and invite, Money loan and payment forms, recipe editing, Sign out), then the two of you using it for one real project for a week, which no simulation replaces.

## Constraints check

None of the fixes needs red, an overdue-style word, a streak, new infrastructure or a pointer to Hoardwise. Wording-test phrase lists (`PROJECT_PHRASES`, `BANNED_PHASE_5`, the earlier phases' lists) must be updated with any renamed words. F21 touches "nothing is sent unless ticked"; D12 reverses a recorded default.
