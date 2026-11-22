# Hearthwise design assessment: inclusive design and cognitive accessibility

## 1. Who I reviewed as

A design assessor (inclusive design and cognitive accessibility), not a user. I assessed the running app on port 8104 as sam and alex, at 390x844 (main), 360x740 at the "largest" text size, dark mode, reduce motion, and 1280x800. I am a careful simulation informed by published guidance, not a substitute for lived experience. Findings carry a confidence rating (High / Medium / Low).

Lenses used, all **from memory (I did not fetch the documents)**: W3C COGA "Making Content Usable for People with Cognitive and Learning Disabilities" (its objectives: understand what things are and how to use them; find what you need; clear content; do not rely on memory; avoid distraction; avoid mistakes and make correction easy; adaptation and personalisation; consistency; feedback on state); WCAG 2.2 AA; and practitioner guidance on autistic, ADHD and AuDHD adults (for example interaction-cost, predictability, task-initiation and time-blindness guidance). Note that COGA and the neurodivergent-UX material are **practitioner and standards guidance, not controlled research**; the research base for ADHD/autism-specific interface design is thin. WCAG items are tested, not recalled. I did not read the docs folder or earlier reports.

## 2. Coverage table

| Area | What I did | Found |
|---|---|---|
| Today (`/`) | Read, axe, keyboard tab order, add task, done/undo, "Show the next thing", "Not now", "Pick something easy", delete, 4 viewports/modes | Calm and short; stale detail page (A-3), draft loss (A-2), assign wording (A-1) |
| Task detail (`/tasks/:id`) | Done, edit, delete, history, two people at once | No state change after Done (A-3), delete lands on "couldn't find" page (A-7), silent last-writer-wins (A-8) |
| Plan / Dinners (`/plan`) | Read, axe, open filled and empty day, "Add to shopping list" sheet | 5 weeks of "Nothing planned yet" repeated about 30 times; shopping review with "I have this" is good |
| Calendar (`/plan/calendar`) | Day and week views, Add sheet, private event as sam then viewed as alex, Calendars sheet | Private event shows alex "Busy" (works well); "Block" is jargon (A-12) |
| Projects (list, detail, new, claim step, add cost, finish) | Used all of them | Step rows crowded (A-11); "Mark as finished" has an in-place "Bring back" |
| Recipes (list, detail cook mode, new form) | Read, ticks, servings, "Start again", form | Cook mode is a strong pattern; `Start again` has no confirmation |
| Shopping | Add, tick, edit sheet, delete, clear ticked, offline add | Delete next to Edit, undo exists; ticked sort to bottom |
| Money | Add sheet, entry detail, delete, restore, offline add, alex's view | Delete toast without Undo (A-6); good offline per-entry state |
| Settings | Read all 9 sections, display settings, axe | Long page, display settings at the bottom (A-10) |
| Deleted (`/deleted`) | Read, restored tasks, item and money entry | Works; money restore says "It waits for the other person to agree" |
| Sheets (about 17) | axe on every one at phone width, Escape, close | Only landmark duplicates (A-14) |
| Offline | Offline add on Shopping and Money, per-entry "Not saved yet", reconnect | Good queue; no standing offline message (A-9); cold navigation offline hit the browser's error page, no service worker was registered in this instance (Low confidence, may be the test build) |
| Dark mode, largest text, reduce motion, desktop | axe on all 10 pages in each; screenshots | Zero axe violations on pages in all three modes; reduce motion genuinely applies to sheets |
| Not covered | `/welcome` (first-run) redirects to `/` for a person who has a household; sign-up, invite creation, real push, feed link from a provider, Remove from household, Sign out | Cannot assess first-run or onboarding here |

## 3. Summary

The five things that matter most:

1. **The "Let Alex know" tick on every page** is an unexplained, per-page, off-by-default control repeated in the page and again in every sheet. It is the biggest source of ambiguity and forgetting (A-4).
2. **State does not update where you are looking**: the task page after Done is unchanged (still a "Done" button, history "Nothing has happened to this yet"), and a closed sheet loses what you typed (A-2, A-3).
3. **Terminology drifts** (Today/Home; Anyone/Together/Both of you; Edit/Change; Done/Mark as finished/On it/I'm on this; easy/low energy; Waiting for them/you/Alex) and one assignment sentence is wrong (A-1, A-5).
4. **Undo is uneven**: tasks and shopping have Undo, money entries and projects behave differently, and nothing says which is which (A-6).
5. The base is unusually strong: calm palette, zero axe violations on every page and sheet in light, dark, largest text and desktop, truthful reduce-motion, no timers, low-shame wording, a "Busy" privacy model that works.

**Overall verdict:** a calm, well-built app whose weaknesses are consistency and feedback, not sensory or compliance problems. Suitable now for all three profiles with fixes in the findings below.

## 4. What works well (protect these)

- Accessibility floor: axe found **no violations on any of the 10 pages in light, dark, 360px/largest text, or desktop**; only landmark noise in sheets. No horizontal scroll at 360px with largest text or with WCAG 1.4.12 text spacing applied (`assessor2-spacing.png`). Focus is a 2px solid terracotta outline on every stop. Names and headings are sound; skip link present.
- Reduce motion really works: sheet transition is 0.25s normally and 0.00001s with the setting; no animations running; no sound or flashing seen.
- Language is low-shame: "Nothing planned yet", "Nothing more today", "Whenever" instead of overdue, "Some days after it's done". "Get everything out" in cook mode.
- **Private events**: alex sees "Busy | Sam" for sam's private event (`assessor2-e-cal-alex.png`). Stating this on the form ("Alex sees that you are busy") is exactly the predictability autistic users want.
- Task assignment is a request, not a command: sam's button changes to "Ask Alex"; alex sees Accept / Decline; sam can Withdraw.
- Offline money entry shows per-entry "Not saved yet" and a count, then settles on reconnect without duplicates.
- "Show the next thing" with "Not now" is a good single-focus view for ADHD; "Pick something easy" shows exactly one recipe plus Shuffle.
- Settings give text size, theme, reduce motion, how long Undo messages stay, and quiet hours. The dark toggle is one tap in the header.
- "Add to shopping list" shows computed lines with an "I have this" button on each, which offloads working memory.
- Deleted items are recoverable for 30 days, in one place.

## 5. Findings (most severe first)

Profile key: A = autistic, D = ADHD, AD = AuDHD.

### A-1 Major, High: The assignment confirmation sentence is wrong
- **Where**: `/`, after Add task, Who is it for = Alex, press "Ask Alex" (390px).
- **Saw**: Sam's own screen says: `Waiting for them` / `You asked Alex to give "Fix the gate" to Alex`. The same request on alex's screen reads correctly: `Sam asks to give "Fix the gate" to you`. Meanwhile the task still sits in Sam's list as "Anyone" with a Done button.
- **Why**: A literal reader parses "asked Alex to give X to Alex" as an error; and "them" is ambiguous when only two people exist. A task that is "Anyone" while also "waiting" is two states at once (COGA: feedback on state; consistency). Affects A, AD most.
- **Fix** (small): requester text `You asked Alex to take "Fix the gate". Waiting for Alex.`; recipient text `Sam asks you to take "Fix the gate"`. Hide or label the pending task's "Anyone" as "Asked of Alex" until answered.

### A-2 Major, High: Closing a sheet throws away what you typed
- **Where**: Today, Add a task; every sheet.
- **Saw**: typed Title `Draft test task` and Notes, pressed Close, reopened: `Title = ""`. Escape closes without warning too. (I did not test whether a tap on the dimmed backdrop does the same.)
- **Why**: Interruptions are routine for ADHD and AuDHD; re-entering is a 3.3.7 redundant-entry and COGA "do not rely on memory / make mistakes easy to correct" problem. A sheet is the capture surface, so losing a half-typed thought discourages capture.
- **Fix** (medium): keep an in-memory draft per sheet (cleared on Save) and show it again on reopen; or confirm on Close only when the form is dirty: `Keep what you wrote? Keep / Throw away`.

### A-3 Major, High: The task page does not change after Done, and does not follow the other person
- **Where**: `/tasks/:id`, 390px.
- **Saw**: after pressing Done the toast says `Done: Hoover upstairs` / Undo, but the page still shows the same Done button and `History: Nothing has happened to this yet.`; only after reload did it read `Done by Sam | Sat 21 Nov`. When alex pressed Done on a task sam had open, sam's page was unchanged after about 110 seconds, and sam could press Done on it again and got another `Done:` toast with no hint it was already done. (`assessor2-t-detail-after-done.png`.)
- **Why**: WCAG 4.1.3 and COGA "feedback on state". Two people with weak shared-awareness are the app's reason for existing. A screen saying nothing happened contradicts the toast and breaks trust; autistic users will re-check, ADHD users will press again.
- **Fix** (medium): after Done show a completed state on the page (`Done by you, just now` and a visible Undo); refetch history; poll the open detail page like the list, and if the task changed under you say `Alex marked this done 2 minutes ago`.

### A-4 Major, High: "Let Alex know" is on every page, unexplained, and easy to forget
- **Where**: Today, Plan (Dinners), Calendar, Shopping, Money, task and project pages, and again inside each sheet. Unticked by default each time.
- **Saw**: `Let Alex know / Sends them a short message about the changes you make here.` It sits above the content before there are any changes. It is 20x20 px (`/` at 390px). Notifications are off by default in Settings, but the tick is shown regardless.
- **Why**: "The changes you make here" is vague (which? how many? until when?). Page and sheet copies make it unclear which one applies. Per-page reset relies on memory (COGA objective 4) and a person who forgets silently fails to inform their partner, the exact failure the app targets. Rule-seeking autistic users cannot predict outcomes; ADHD users will forget it.
- **Fix** (medium): one household-level setting, `Tell Alex when I change things: Always / Ask me each time / Never`, default Ask me each time on the save button (`Save` plus `Tell Alex` as a secondary action), instead of a free-floating checkbox. Say what is sent: `Sends Alex one message when you save.` Hide the control entirely when the other person has notifications off, or say so.

### A-5 Major, High: Terminology drifts; several ideas have many names and several names have many meanings
- **One idea, many terms**:
  - Home screen: nav `Today`, 404 page `You can go back to Home` / `Go to Home`, missing task `Back to Today`.
  - Who a task is for: tasks `Anyone / Together / You / Alex`, calendar `Sam (you) / Alex / Both of you`, money `Sam / Alex`. "Together" and "Both of you" are one idea.
  - Finishing: `Done` (task), `Mark as finished` (project), `On it` and `Not started` (step), `Bring back`.
  - Taking something: `I'm on this`, `You're on this`, `On it`, `Alex is on this`, `Free this step`, `Free this project`.
  - Changing something: `Edit` (task, item, project) vs `Change` (money entry).
  - Removing: `Delete`, `Delete line`, `Remove`, `Clear this day`, `Clear ticked`, `Remove from household`, `Withdraw`, `Decline`.
  - Easy meals: `Pick something easy` vs recipe tag `Low energy`.
  - Pending: `Waiting for Alex`, `Waiting for them`, `Waiting for you`, `1 change waiting to be saved`, `1 change not saved yet`.
- **One term, many meanings**: `Today` (nav item, day-view button, a heading, Today's date); `Plan` (nav item, page title, and a tab bar containing "Dinners", "Calendar", "Projects"); `Calendar` (page) vs `Calendars` (list of linked feeds); `Add` (calendar, money, shopping, each a different object); `Block` (calendar object type, unexplained).
- **Why**: COGA consistency and "understand what things are". Autistic users take distinct words as distinct things; AuDHD users pay twice (look up, then forget).
- **Fix** (small to medium): pick one word per idea and apply it in one pass. Suggested: `Today` everywhere; `Both of you` (or `Together`) everywhere; `Done` for finishing everything and `I'll do this` / `Alex is doing this` for claiming; `Edit` everywhere; `Delete` for things that can be restored and `Clear` only for emptying; `Waiting for X` with the name; rename the nav item "Plan" to `Plan` and its page heading to `Dinners` or retitle the tab group.

### A-6 Major, High: Undo is uneven and not explained
- **Saw**: task delete: `Deleted: Hoover upstairs` with Undo; shopping delete: `Deleted: Bread` with Undo; **money delete**: toast `Deleted: Weekly shop` with no Undo (restore only via `/deleted`, three taps away); `Start again` in cook mode clears ticks with no undo or confirm; `Clear this day` and `Mark as finished` act at once (project has `Bring back` in place). Delete next to Edit on each shopping row with no confirmation (Undo covers it for 30 seconds or until closed, per the Messages setting).
- **Why**: COGA "avoid mistakes and make correction easy". The rule a person learns ("everything can be undone") fails exactly on the entry that involves money and the other person's agreement. Alex was not told the entry vanished.
- **Fix** (small): give money delete the same Undo toast; add one sentence in the sheet or detail before destructive actions that says what happens: `Delete this expense? It comes back from Deleted for 30 days.` Make `Start again` undoable.

### A-7 Minor, High: A deliberate delete lands on a "not found" page
- **Saw**: deleting a task from its page leaves you on `We couldn't find that task.` / `Back to Today` with the Undo toast overhead (`assessor2-b-task-delete.png`).
- **Why**: Reads as a fault right after a correct action; autistic users may think something broke.
- **Fix** (tiny): after delete navigate to Today and keep the toast.

### A-8 Major, Medium: Simultaneous edits are silently last-writer-wins and views diverge
- **Saw**: sam and alex both opened Edit on the same task and saved different titles. Sam saved second: sam's page showed `(Sam)`; alex's page still showed `(Alex)` six seconds later. No message either side. The history stayed `Nothing has happened to this yet.` (earlier history showed only the Done event after reload; I did not confirm whether edits are ever listed).
- **Why**: Conflict design for two people: silent overwrite plus a stale view means each person trusts a different truth (D: loses things; A: conflict with no explanation).
- **Fix** (medium): on save, if the item changed since opened, say `Alex changed this while you were editing: keep yours / keep theirs`; show edits in History (`Alex renamed it`).

### A-9 Major, Medium: No standing offline message; the reason for a queued change is not given
- **Saw**: with the network off, Today and Shopping showed no sign of being offline until a change was made; then `1 change waiting to be saved` appears as plain text above the heading; Money shows both that and `1 change not saved yet` plus per-entry `Not saved yet`. No `You are offline` wording, no reassurance that it will save by itself. Not tested: what is shown when the server refuses a queued change (I could not trigger one).
- **Why**: COGA feedback on state; autistic users need the cause, ADHD users need to know it is safe to leave.
- **Fix** (small): a calm persistent strip `Offline. Changes are kept on this phone and save when you are back.` with `role="status"`; use one phrase for queued changes everywhere. Add the reason for any refusal: `Alex changed this first, so we kept theirs. Yours is below if you want to add it again.`

### A-10 Minor, High: Display and sensory settings are at the bottom of a long Settings page
- **Saw**: Settings has 9 sections; `Display` (text size, appearance, reduce motion) is near the end, after two 24-option time dropdowns each repeated. The header says `Display settings are saved on this device.` at the top, which suggests where the controls are but not where.
- **Why**: People who need text size or reduce motion are the people least able to scroll for them (COGA adaptation and personalisation).
- **Fix** (tiny): move `Display` to the top, or add a jump line at the top: `Text size, dark mode and motion are lower on this page.` Replace the time selects with a time field or fewer options.

### A-11 Minor, Medium: Project steps pack five controls into each row
- **Saw**: each step has a tick, state words (`Done`, `On it`, `Not started`), `Alex is on this`, `Free this step` or `I'm on this`, and `Move up / Move down`; at 390px these wrap to a second and third line (`assessor2-e-proj-finish.png`). A disabled `Move up` is a grey filled button while enabled ones are links.
- **Why**: Equal-weight controls and inconsistent control styling raise load (COGA avoid distraction; consistency).
- **Fix** (medium): one primary action per step (the tick); put claim and reorder into a row menu; show state once. Make disabled/enabled styles consistent.

### A-12 Minor, High: "Block, a routine like Wind down" is jargon and the calendar Add form is long
- **Saw**: Add to the calendar has Event/Block radio, Title, Where, Who, Private, Date, All day, Starts at, Length in minutes, Repeat (3 options), Notes, Let Alex know, Add: about 12 fields (`assessor2-n-cal-add.png`). The primary Add button is below the fold at 390x844 and the sheet scrolls under a sticky header; the Money Add sheet is the same (button at y=861 of 844).
- **Why**: Task initiation cost (D); an unknown word (A). Not an insuperable length, but the smallest event costs 4 inputs and a scroll.
- **Fix** (medium): progressive disclosure: Title, Date, Time visible; Where, Repeat, Notes, Private under `More`. Rename `Block` to `Routine`, or explain on first use. Make the Add button sticky at the sheet bottom.

### A-13 Minor, Medium: Today has many equal-weight controls and repeated "nothing" cards
- **Saw**: Today at 390px: `Open the calendar`, `Pick something easy` (filled), `Add a task` (filled), `Show the next thing`, the "Let Alex know" tick, and a `Done` per task; two cards say `Now: nothing on / Nothing more today` and `Nothing planned yet`. Every task shows `Anyone` under it, which adds no information when most tasks are Anyone. Dinners page: about 30 `Nothing planned yet` buttons across five weeks.
- **Why**: Density and equal-weight primary actions (COGA avoid distraction). For ADHD the two filled buttons compete; for autistic users the repeated card text is noise but predictable.
- **Fix** (small): one filled primary per screen (Add a task); make `Pick something easy` secondary; hide `Anyone` when it is the default; on Dinners collapse empty days into `Nothing planned Tue 24 to Fri 27` or show two weeks with a "More weeks" control.

### A-14 Minor, High: Sheet header creates a second banner landmark; avatar menu has an axe ARIA issue
- **Saw**: axe on every sheet: `landmark-no-duplicate-banner` and `landmark-unique` on the sheet `<header class="mantine-Drawer-header">`. The avatar menu: `aria-required-children` (critical in axe) because the Mantine menu dropdown has an empty focus div as a child. The avatar's accessible name is `SASamsam@example.com` (initials, name and email run together).
- **Why**: Real but low impact (screen reader users). Library-level behaviour.
- **Fix** (tiny): render the sheet title as a `<div role="heading">` instead of `<header>`; label the avatar `Account: Sam`.

### A-15 Minor, Medium: Small targets and fixed bottom bar at large text
- **Saw**: `Let Alex know` checkbox is 20x20 px (below WCAG 2.5.8's 24px unless its label is part of the target; I did not click-test the label); shopping tick 24x24; Edit 65x36 and Delete 81x36, adjacent. All pass the AA minimum of 24px (2.5.8) but not the 44px that helps hand tremor and ADHD impulsive taps. At 360px and "largest", the fixed bottom nav covers about 70px, the `Hearthwise` wordmark disappears from the header, and `Show the next thing` is partly hidden in full-page capture (the fixed bar is a screenshot artefact in part).
- **Fix** (tiny): 44px minimum for the tick and Delete; extra spacing between Edit and Delete; keep the tick/label as one target.

### A-16 Minor, Medium: Toast sits over content and is announced assertively
- **Saw**: `Done: Book the dentist / Undo` overlays the third task row above the nav (`assessor2-b-done-toast.png`) and has `role="alert"`. Success messages with `role=alert` interrupt screen readers (WCAG 4.1.3 prefers `status` for success).
- **Fix** (tiny): `role="status"` for successes, `role="alert"` for problems only; lift the toast above any covered row or place at top.

## Cross-profile conflicts (area 10)

| Tension | Autistic need | ADHD need | Recommendation |
|---|---|---|---|
| Notifications and "Let Alex know" | Predictable, opt-in, explained | Reminders that do not rely on memory | Setting: ask each time vs always; explain what is sent (A-4) |
| Fewer, repeated empty states | Stable, same layout every day | Less noise and less scrolling | Keep layout, collapse empty rows (A-13) |
| Confirm before destructive acts | Clarity about the result | Fewer taps, speed | Undo everywhere instead of confirm (A-6); serves both |
| Strict wording consistency | One word per thing | Short, scannable words | One pass on terms (A-5); serves both |
| Show everything vs one thing | Full picture, no hidden state | One next step | Already served by "Show the full list / next thing", with the choice remembered (a setting exists: "Today opens with") |
| Time display | Exact times | Time-blindness help ("in 20 minutes") | The app shows exact times only; add an optional relative-time setting. Not built. |

## 6. Area scores (out of 5)

1. COGA fit: **3.5** Clear wording and low shame, but terminology and state feedback let it down.
2. WCAG 2.2 AA: **4.5** Zero axe violations across pages in 4 modes, landmark noise in sheets, minor target sizes.
3. Sensory design: **4.5** Muted palette, no red, true reduce motion, text size works; serif-only body font and 12px helper text are the only misses.
4. Predictability and consistency: **3** Navigation is learnable (5 tabs, one sub-nav) but vocabulary and Undo vary.
5. Cognitive load and attention: **3.5** Per-screen counts reasonable; Today has 2 filled primaries; long sheets.
6. Executive-function support: **3.5** Next-thing view, easy-meal picker, "I have this"; loses drafts, no relative time, task page stale.
7. Emotional safety and language: **4.5** Reading age roughly 9 to 11 for most copy (for example "Sends them a short message about the changes you make here."), 12 to 13 for the reduce-motion paragraph; no blame or lateness; one wrong sentence (A-1).
8. Shared-use and conflict: **3** Requests, "Busy" privacy and the money agreement are good; silent overwrite and stale pages are not.
9. Personalisation and control: **4** Text size, theme, reduce motion, undo duration, quiet hours, start view, colour; missing a font choice, relative time, and a notify-by-default setting.
10. Cross-profile balance: **3.5** The app serves both already with its choices; fixes in A-4, A-5 and A-6 serve both.

## Overall suitability by profile

- **Autistic: 3.5/5.** Calm, literal wording and a predictable privacy model help. To reach 4: one term per idea (A-5), correct and explain the notify tick (A-4), give uniform Undo (A-6), state what each button will do.
- **ADHD: 3.5/5.** Low shame, single-next-thing views and recoverable deletes help. To reach 4: keep sheet drafts (A-2), make the detail page reflect Done (A-3), a quieter Today with one primary action (A-13).
- **AuDHD: 3.5/5.** Gets both sets of strengths and both sets of friction (terminology plus forgetting). To reach 4: A-2, A-4, and A-5 together; they remove the two hardest costs (re-entering and re-deciding).

## 7. Quick wins (priority order)

1. Fix the sentence `You asked Alex to give "X" to Alex` (A-1, tiny).
2. Add Undo to the money delete toast (A-6, tiny/small).
3. Navigate to Today after deleting a task (A-7, tiny).
4. Show a completed state and refreshed History after Done on the detail page (A-3, small).
5. Pick one word each for Today/Home, Together/Both of you, Edit/Change (A-5, small).
6. Replace the per-page "Let Alex know" with a clear control and an explanatory line (A-4, small to medium).
7. Standing offline strip with `role="status"` (A-9, small).
8. Move Display settings to the top of Settings (A-10, tiny).
9. Use `role="status"` for success toasts (A-16, tiny).
10. Sheet header landmark and avatar label (A-14, tiny).

## 8. Not checked, and what a real person should test

- First-run and onboarding (`/welcome`, sign-up, invite creation and acceptance): not reachable with an existing household.
- Real push notifications, quiet hours, daily summary and due-day reminders (the default times are not verified): need a real device and permission.
- Calendar feeds from a real provider (online-only, external).
- What is shown when the server refuses a queued change after reconnecting: I could not provoke it.
- Whether a tap outside a sheet (backdrop) closes it without warning; whether the sheet keeps its place when the phone keyboard opens (headless Chromium has no on-screen keyboard).
- Real screen reader (VoiceOver/TalkBack) behaviour, voice control, switch access.
- Cold-start offline: no service worker was registered in this instance, so I could not confirm that the installed app opens offline; test on the real build.
- A real autistic, ADHD or AuDHD person should judge: whether the muted terracotta palette is comfortable for light sensitivity; whether the serif body face helps or hinders reading; whether the pace of Undo messages feels adequate; whether "Ask Alex" feels like a request or pressure inside a relationship; how the money wording lands (the wording avoids "owe" but "Waiting for Alex" appears three times on one screen).
