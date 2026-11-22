# Design assessment: Hearthwise for autistic, ADHD and AuDHD adults (assessor)

## 1. Who I reviewed as
A design assessor, not a simulated user. I drove the running app (port 8104) at 390x844, 360x740 with `largest` in dark mode, 320 and 1280 widths, as Sam and Alex together, online and offline, and read the source (read-only) for copy and ARIA. Lenses: W3C COGA "Making Content Usable" (objectives; I recalled it from memory and did not fetch it, so treat my paraphrases as unverified), WCAG 2.2 AA (tested), and neurodivergent design practitioner guidance (practitioner guidance, not trial evidence: e.g. predictability, explicit state, low capture friction). This is a careful assessment, not a substitute for lived experience or user testing with the target people. Profile tags: A = autistic, ADHD, AuDHD, all. Confidence marked per finding.

## 2. Summary
1. **Technically this is unusually strong.** axe-core (wcag2a/aa/21/22aa + best-practice) found zero violations on every main screen at 390px, including the project page; dark mode and `largest` at 360px gave no contrast violations and no horizontal scroll (also none at 320 or with WCAG text-spacing overrides). Focus is never hidden behind the tab bar when tabbing the project page. Calm tone and "state in words" hold throughout.
2. **The biggest gap is feedback on the thing the app exists for: contested ownership and edits.** A lost "I'm on this" shows a notice at the TOP of a long page while the step is far below; a concurrent edit of the same step text left the other person with NO notice at all in my test, and deleting a whole project gives no message and no Undo.
3. **Inconsistent vocabulary and action patterns** (Delete / Remove / Clear; "Done" as button, status, tick label; "Bring back" vs "Restore"; "New project" is both the opener and the submit button) cost AuDHD and autistic people the sameness they rely on.
4. **Capture friction is uneven.** Shopping add is two actions (good). A new task opens a ten-field sheet; a new project asks only for a title (good) but gives no confirmation or landing.
5. **Personalisation is limited to display.** No density, hiding sections, tab order or notification-type control; the "Let Alex know" tick is repeated on seven screens and is per-page, a memory burden.
**Verdict:** suitable for a pair of adults who already trust each other, Autistic 3.5/5, ADHD 3.5/5, AuDHD 3.5/5 (details in section 7). They would likely keep using it for lists and plans; the conflict and delete feedback are what could break trust.

## 3. What works well (protect these)
- Zero axe violations on all 12 screens; no hscroll at 320/360 `largest`; text-spacing override causes no overflow.
- `Text size` really applies (largest at 360 reflowed buttons onto new lines, nothing clipped except see AS-10).
- Focus ring: solid 2px outline; focus order on the project page follows visual order; skip link present; one `<h1>`, `<h2>` for Steps/Materials; `<nav>` and `<main>` landmarks; sheet is `role=dialog aria-modal`, labelled by its title.
- State always in words, not only colour: "Not started", "On it", "Done", "Alex is on this", "Not saved yet", plus "1 change waiting to be saved" as `role=status aria-live=polite` (verified offline).
- Recoverability: toast "Step deleted [Undo]" and "Deleted: Bread [Undo]"; Deleted page with 30-day bin; "Lines already on the list are left as they are, so pressing this twice adds nothing." (preempts the exact worry).
- Calm neutral copy: "Nothing planned yet", "Nothing more today", "Planned for 5 to 6 December" (explicitly not a deadline), "Alex already has this" (no blame), costs "Not in Money. This is only for the project."
- Notification pushes carry fixed bodies for money/calendar/projects ("Open the project to take a look.") and nothing is on until chosen; quiet hours exist.
- Disabled Move up/Move down on the first/last step show the boundary.

## 4. Findings (most severe first)

**AS-1 Delete project is silent and has no Undo. Major, High. All (ADHD worst).**
Framework: COGA "help users avoid mistakes and make it easy to correct them"; "provide feedback"; WCAG 2.2 3.3.4-style reversibility. Seen: `/plan/projects/<id>` > "Delete project" deletes immediately with no dialog, then lands on the list; no toast, no Undo (shot `assessor-delproj.png`; page text has no "deleted"/"Undo"). Steps and shopping deletes DO give Undo, so the pattern is inconsistent. Mechanism: impulsive tap or misplaced tap on a full-width button directly below "Add to the shopping list" erases a whole plan with no signal; the person may not know it is in Deleted. Fix: show the same toast as steps, "Project deleted. [Undo]" and mention "You can bring it back from Deleted." Reuse `deletedProject` copy in `useProjectActions.tsx`. Small.

**AS-2 Concurrent edit of the same step text: the other person got no notice. Major, Medium (single run). All.**
Framework: COGA "ensure processes do not rely on memory"; design goal G8 in `docs/designs/phase-5-diy-projects.md` ("lose no words"). Seen: Sam and Alex saved different wording of one step within a second; after 13s both screens showed Sam's words; Alex had no notice and no copy of "Order skip ALEX words"; only "Last changed by Sam" appears (project-level). The kept-words notice only fires when the server tells the writer it was stale (`mutations.ts:545-551`), but the writer whose edit was overwritten by a LATER write is never told. Mechanism: words silently vanish; the person who finds words hard to produce loses them. Fix: when polling shows a step's text differs from what this person last saved (or a pending write was applied then superseded), raise the same `replaced` notice. Medium. I could not tell which write arrived first, so reproduce with a delay before judging.

**AS-3 Lost "I'm on this" notice is far from the step. Major, High. ADHD, AuDHD.**
Framework: COGA "provide feedback on state", WCAG 3.2.x proximity; 4.1.3 OK (role=status). Seen: after a simultaneous take, "Alex already has this [Dismiss]" appears at the top of the page, above "Planned for..."; the step is below the fold (`assessor-take-sam.png`). The notice does not say WHICH step. Mechanism: attention is on the step just tapped; a notice 600px away is missed, and with several steps taken the person cannot tell which one lost. Fix: put the message in the step row ("Alex already has this") and scroll/focus it; or include the step words: "Alex already has 'Remove the joists'". Small.

**AS-4 Same word, different meaning: "Done". Major, High. Autistic, AuDHD.**
Framework: COGA "use consistent layout and behaviour"; WCAG 3.2.4 consistent identification. "Done" is a button that completes a task (Today), a status line under a ticked step, the tick's accessible name ("Done: Clear the plants"), and a section group. In Today, "Done" is an action; in the step list it is a state. Fix: action = "Mark done" (button), state = "Done". Tiny.

**AS-5 Vocabulary inventory (inconsistent terms). Major, High. Autistic, AuDHD.**
- Remove: "Delete" (step, shopping item, project, material line "Delete line", event), "Remove" (household member, calendar), "Clear" ("Clear ticked (1)", "Clear this day", "Clear the planned day"), "Dismiss" (notice). Four verbs for taking something away, with different reversibility (Delete has Undo or bin; Clear ticked and Remove do not say).
- Restore: "Restore" on Deleted, "Bring back" on a finished project, "Undo" in toasts.
- Take: "I'm on this" / "Free this step" / "You're on this" / "Alex is on this" / "On it" / "On it for 3 weeks" (status). Good internally, but "Free" is unusual: a person may read it as a price.
- Add: "Add a step" is both the label above the box and the button; "Add a cost" opens a form; "Add" in shopping; "New project" is both the list button and the sheet's submit button; "New task" sheet submits with "Save".
- "Done" (see AS-4). "Finished" for a project vs "Done" for a step, "Mark as finished" / "Finished" / "Bring back".
- "Let Alex know" tick vs a push called "asked about a task".
Fix: pick a table (Delete = recoverable, Remove = person leaves, Clear = empties the list; Bring back = Restore everywhere, or the other way), and put it in `docs/brand.md`. Small to medium; most copy is centralised in `projectText.ts`.

**AS-6 New project: sheet submit button repeats the opener name, no confirmation or landing. Minor, High. ADHD, AuDHD.**
Seen: "New project" button opens a sheet whose only button is also "New project"; after saving, the sheet closes on the list with the new card appended at the END, unhighlighted, no toast (my project "Paint the spare room" appeared last). Framework: COGA "help users find what they need", feedback. Fix: submit label "Add project", then open the new project's page (the next obvious task is adding steps), or announce "Project added". Small.

**AS-7 Task capture sheet has ten fields for the smallest task. Minor, High. ADHD.**
Seen: Today > "Add a task" sheet: Title, Notes, Who is it for? (4 options), Repeat (5 options), Due on, Add a step, Let Alex know, Save. Only a title is needed. Framework: COGA "avoid distractions", progressive disclosure. Cost: tap Add a task, type, tap Save = 3 actions, but 10+ visible controls. Fix: show Title + Save, with "More options" disclosing the rest (default Anyone, no repeat). Medium.

**AS-8 "Let Alex know" appears on 7+ screens and resets per page. Major, Medium. ADHD, AuDHD.**
Seen: same checkbox and hint text on Today, Plan, Calendar, Shopping, Money, project page, and in every sheet. It is one tick per page (`letThemKnow.ts`). Mechanism: working-memory load (did I tick it on this page?), and an identical block above the main content on every page pushes the content down. Alert direction is also surprising: "Sends them a short message about the changes you make here." does not say "while ticked" or when it resets. Fix: one account-level default (Off / Ask each time) in Settings, and a per-write "Tell Alex" on the sheet; or collapse the tick into a single quiet control and state "Stays ticked until you leave this page" if that is true. Medium.

**AS-9 "Show the next thing" / "Pick something easy" are not explained. Minor, High. Autistic, AuDHD.**
Seen: Today shows two filled/outlined buttons beside "Add a task": "Show the next thing" (toggles to "Show the full list") and "Pick something easy" in the Tonight card. Neither says what it will do; "easy" is subjective and with no recipes the result is "No easy dinners yet. Mark a recipe as low energy to see it here." (term "Low energy" appears only as a filter). Framework: COGA "help users understand what things are". Fix: "Show only the next task" with a switch-style label; "Pick something easy" > "Choose a low-effort dinner". Tiny.

**AS-10 `largest` clips "All projects" and tab labels stay small. Minor, High. All.**
Seen at 360px, `largest`, dark: the link beside the title reads "All proj" (`assessor-dl_decking.png`); bottom tab labels do not grow with text size. WCAG 1.4.4/1.4.10. Fix: let the title row wrap and put "All projects" on its own line under 400px; scale tab labels with the setting. Small.

**AS-11 Today: "Now and next" card says "Now: nothing on / Nothing more today" and above the actual tasks. Minor, High. ADHD.**
Seen: the first two cards (Now and next, Tonight) both say nothing with a button each, and the actual task list ("Whenever": Book the dentist, Hoover upstairs, Take the bins out) is below the fold at 390x844 (`assessor-_.png`). Three primary-coloured buttons compete (Pick something easy, Add a task, Done x3). Fix: when a card is empty, collapse it to one line; show the first task above the fold. Small.

**AS-12 Task group "Whenever" and "Anyone" are unexplained. Minor, Medium. Autistic.**
"Anyone" under each task (no owner) and "Whenever" (no due date) are not defined; first-run has no tour. Fix: "Not assigned" is banned? ("assign" is banned) so use "Either of you" and "No day set". Tiny.

**AS-13 Project step row: five tab stops and three equal text buttons per step. Minor, High. ADHD, keyboard.**
Seen: per step tab order = tick, step words (opens sheet), Move up, Move down, I'm on this/Free. For 40 steps that is 200 stops. Target: Move up/down are text links beside a bordered button, so they look like links but act as buttons. Fix: a single "..." per row or a reorder mode ("Reorder steps" toggle) that shows Move up/Down only then; keep take/free visible. Medium.

**AS-14 Tick target is 24px, text-link actions are below 44px. Minor, High. All (motor).**
Seen by measurement: step tick 24x24 (passes WCAG 2.5.8 AA at 24, fails the author's 44px aim); Today tick 20x20 inputs, shopping tick 24x24; most buttons are 36px high (Done 73x36, Edit 65x36, Delete 81x36, Add 64x36). Fix: min-height 44 on rows' hit area via padding on the label. Small. (Note `NoticeBar` already uses `minHeight: 44`, so the pattern exists.)

**AS-15 Delete sits beside Edit on every shopping row, no confirmation, same weight. Minor, Medium. ADHD.**
Seen: every row has "Edit" and "Delete" side by side (pale and bordered). Undo exists ("Deleted: Bread [Undo]") but the toast auto-closes at 8s by default and sits just above the tab bar. Setting "How long messages with an Undo button stay" exists (good), default is 8s. Fix: for people who like a longer window, default to 15s and keep the toast above the bottom nav. Tiny.

**AS-16 Toast is announced as role=alert. Minor, Medium. All (screen reader).**
Mantine notifications render `role=alert` (assertive) for "Step deleted"; polite `role=status` is used for the pending banner. Framework WCAG 4.1.3 (met), but assertive interrupts a screen reader user mid-read. Fix: `role=status` for undo toasts. Tiny.

**AS-17 Finished project page shows no "Finished" text in the main area. Minor, Medium. Autistic.**
Seen: after "Mark as finished" the page text changes only the button ("Mark as finished" > "Bring back"), the heading area has no "Finished" label, and "I'm on this" still appears. State must be visible without relying on a button label (COGA "feedback on state"). Fix: a visible "Finished" line under the title. Tiny. (The list card may show it; I did not check the finished list.)

**AS-18 Offline: good wording but the refusal case is unchecked; two different phrases. Minor, Medium. Autistic.**
Seen: "1 change waiting to be saved", "Not saved yet", "Done. Not saved yet"; the last mixes the action word into the state. "Not saved for offline yet" is a third phrase for another idea. Fix: "Waiting to be saved" everywhere, and say once what happens ("It will save when you are back online"). I did not test a queued write that the server refuses; see section 6.

**AS-19 Notification pushes name task titles on a lock screen. Minor, Medium. All.**
`src/push/events.ts`: task and shopping pushes include the task/item text as the body ("Book the dentist"), unlike money/calendar/project (fixed text). Inconsistent privacy for a shared household, e.g. a surprise. Also "did X / is done" implies an achievement report. Fix: fixed bodies for tasks too, or a setting "Show details in messages".  Small.

**AS-20 Notification settings: 24-option select per time, 15 controls, no per-type choices. Minor, High. ADHD.**
Seen (`assessor-settings.png`, `/settings` text): Daily summary time and Due-day reminder time are 24-hour selects ("00:00 ... 23:00"); "Messages the other person sends you wait until quiet hours end"; there is no setting for which types of other-person pushes arrive (task, shopping, plan, money, calendar, project). Defaults are all off, which is right against overload. The failure risk is ignored-notifications after turning all on. Fix: group types ("Things Alex adds / things Alex finishes") with a default of "Tasks for me only", and use friendlier "Morning / Evening" presets. Medium.

**AS-21 Settings page is a long single scroll; no headings hierarchy cue. Minor, Medium. ADHD.**
Seen: Household, Notifications, Your view, Signing in, Deleted, Display, Messages in one page with 13+ controls. "Your view" includes "Today opens with: Full list / Next thing / Calendar" (a good adaptation). Fix: collapse each group; put Display (text size, motion) first since sensory needs are more urgent than notifications. Small.

**AS-22 Plan page lists 4+ weeks of "Nothing planned yet" (28 repeats). Minor, High. ADHD, A.**
Seen: `/plan` text has "Nothing planned yet" 28 times. Scanning cost and a feeling of emptiness. Fix: collapse empty days after this week into one line "Nothing planned for 23 Nov to 20 Dec", expand on tap. Small.

**AS-23 Navigation model: 6 tabs + 3-way Plan switch + Deleted. Minor, Medium. Autistic, AuDHD.**
Seen: "Dinners | Calendar | Projects" under Plan; Deleted is reachable only from Settings > "See deleted tasks" (label says "tasks" but the page holds recipes, events, projects, money). Mismatch of label and content ("Deleted tasks stay for 30 days" in Settings vs "Deleted money entries stay until you restore them" on the page: two retention rules). Fix: label the link "Deleted items" and state each retention once. Tiny. The Plan switch is learnable; recommend keeping order fixed and not letting it reorder.

**AS-24 Reading level is good; two pressure/ambiguity phrases remain. Minor, Medium. Autistic.**
Estimates (Flesch-Kincaid by eye): "Lines already on the list are left as they are, so pressing this twice adds nothing." about grade 6; "Everything here is off until you turn it on." grade 3; "Messages the other person sends you wait until quiet hours end. Your own reminders still arrive." grade 7 (long); Settings "Problems always stay until you close them." grade 6 but uses "Problems" (the app bans error/alert; this is the one noun that names a bad thing). Idiom: "Rough notes are fine." (fine), "take a look" (idiom), "Free this step" (ambiguous), "On it" (idiom: "I'm on it" vs "On it" status). Fix: "Open the project to see what changed."; "Problems" > "Messages that need you"; "Free this step" > "Hand this step back". Tiny.

**AS-25 Wording audit vs `wording.test.ts`: test coverage is by file lists. Minor, Medium. All.**
The phase banned-word tests only scan the phase's own files (`projectFiles()`, `calendarFiles()`), so a new file outside them (e.g. `LetThemKnow.tsx`, `Settings` components) is held only to the global list (`overdue|missed|streak|late|failed to complete`). I found no banned word in rendered text. Gaps I noticed: "Problems always stay until you close them" (Settings), "Couldn't save." and "Retry" in `SaveStatus.tsx` ("Couldn't save" is a failure phrase not in the global list), "asked about a task" push title. Fix: add `couldn't|problem|can't` to the global list or review them. Tiny.

**AS-26 Cross-profile: fixed order and low friction. Medium, Low. AuDHD.**
Autistic needs (same place, same words) favour the fixed 6-tab bar and identical sheets, which the app has. ADHD needs (low friction, novelty) argue for fewer fields and a "what next" hint. Where they conflict: "Pick something easy" (random choice, novelty for ADHD) vs predictability (autistic may want "the same thing as last time"). Fix that serves both: make the choice deterministic with a visible reason ("Shortest first"), plus a "Show another" button. Small.

**AS-27 No sound/haptics (good), but motion of sheets is only reduced by the toggle. Minor, High. A.**
`app.css:100-108` zeroes transitions under `data-reduce-motion`; the app also follows the OS setting (stated in Settings). I verified the tick/sheet interactions with reduceMotion on: no animation errors. No flashing seen. Good; protect it.

**AS-28 Calendar: "Calendars... Add" and "Add" side by side. Minor, Medium. Autistic.**
Seen: `/plan/calendar` header has "Calendars" and "Add" (what to add: event or a feed link?); the add sheet title is "Add to the calendar" while feeds say "Add a calendar" (two adds, one noun). The feed link wording ("We can read links from Google, Outlook, Apple and Proton calendars.") is clear. Fix: "Add event" and "Add a calendar link". Tiny.

**AS-29 Project hold age: "On it for 3 weeks". Minor, Low. Autistic, ADHD.**
Source `projectText.ts:onItFor` gives neutral age text, but it is still a time-based signal beside someone's name, which can read as "you have been slow". I did not see it (the seed holds are fresh). Make it opt-in or phrase "Since 3 weeks ago". Tiny.

**AS-30 Interruption recovery: no draft kept in Add-a-step or New project. Medium, Low. ADHD.**
Recipes keep drafts (per CLAUDE.md), but I did not verify that the Add a step textarea survives navigation. I noted it for testing (section 6).

## 5. Quick wins (tiny/small, in order)
1. AS-1 toast with Undo on project delete.
2. AS-3 move the "already has this" message into the step row, include the step words.
3. AS-4 / AS-5 one verb table; rename "Done" button to "Mark done"; "Bring back" = "Restore".
4. AS-6 "Add project" submit label and open the new project.
5. AS-10 stop "All projects" clipping at `largest`.
6. AS-17 show "Finished" as text.
7. AS-23 "Deleted items" link label.
8. AS-9, AS-12, AS-24 copy clarifications.
9. AS-16 `role=status` on undo toasts.
10. AS-2 notice when your words were overwritten later.

## 6. Scores (out of 5) and suitability
1. COGA objectives: 4. Clear labels and state, consistent landmark use; vocabulary drift (AS-4/5).
2. WCAG 2.2 AA: 4.5. axe clean, reflow, spacing, focus unobscured; targets 24px not 44 (AS-14).
3. Sensory: 4.5. Low saturation, no red, no sound, reduce motion works, dark mode fine.
4. Predictability: 3.5. Navigation learnable; verbs and Done inconsistent; delete project has no undo.
5. Cognitive load: 3.5. Empty cards above the fold, ten-field task sheet, 28 empty days.
6. Executive function: 3.5. Good undo/bin, "waiting to be saved"; weak drafts evidence, repeated tick.
7. Emotional safety/language: 4.5. Neutral and low-shame; few idioms; "Problems", "Couldn't save".
8. Shared use/conflict: 3. First-to-server is calm, but the message is far from the step and overwritten words are silent.
9. Personalisation: 3. Text size, motion, colour, quiet hours, start view; no density/hide/notification types.
10. Cross-profile: 3.5. Mostly compatible; the "random pick" and per-page tick are the friction points.

Overall: Autistic 3.5/5 (to 4: one verb table, deterministic picks, explanations of labels, fixed bodies in pushes). ADHD 3.5/5 (to 4: fewer fields on capture, collapse empty cards, project delete undo, single "tell Alex" setting). AuDHD 3.5/5 (to 4: both sets above, since inconsistency and friction compound).

## 7. Things I could not check
- A queued write that the server refuses (what the person is told) and Alex's offline replay; the take race was tested online only.
- The edit conflict in AS-2 once; the arrival order was unknown.
- Real screen readers (VoiceOver/NVDA); I only inspected roles and live regions.
- Real push messages, quiet-hours holding, and the "30 minutes old" rule.
- Add-a-step textarea draft retention (AS-30), the finished-projects list, the cooking view, money agreement wording, costs, and shopping-list copy from materials (the page text confirms the idempotence note but I did not press it twice).
- Reading-age numbers are my estimates, not computed.
- Needs testing with real autistic, ADHD and AuDHD adults, ideally the author and partner using it for one real project for a week.
