# Hearthwise review: autistic adult (not ADHD)

## 1. Who I reviewed as
An autistic adult sharing the home with a partner, who needs predictability, literal wording, low sensory load, stated rules and no pressure. This is a simulation drawn from published practitioner guidance (Scope, St Andrews digital communications, Kent study on interface change). It is not lived experience. The evidence for autistic adults and apps is thin, so confidence is rated on each finding. I drove instance 8101 as sam and alex (390px main; 360px largest text, dark, reduce motion once; offline once). Desktop 1280 not done.

## 2. Coverage table
| Area | What I did | Found |
|---|---|---|
| Today (/) | Read, Add a task, Show the next thing, Not now, Pick something easy, Done + toast, Let Alex know | F1, F3, F5, F7, F10 |
| Task detail/edit | Opened, edit sheet, repeat options | F8 |
| Proposals (ask/accept/decline) | Sam asked Alex to take a task; Alex declined | F1, F2 |
| Plan > Dinners | Week list, choose recipe, Add to shopping list sheet | F11, F12 |
| Plan > Calendar | Add event (private), day/week as both people, Calendars sheet (empty only) | F9, F13 |
| Plan > Projects | List, detail, I'm on this, add to shopping, delete project | F4, F6, F14 |
| Recipes | List, filters, new recipe form (read only; not saved) | no issues |
| Shopping | Add, tick, delete + undo, sync to other person, offline add and reconnect | F7, F15 |
| Money | Both views, Agree / Ask to check, add form (read) | F2, F3 |
| Settings | Read all text | F16 |
| Deleted | Read | OK |
| Dark / 360 largest / reduce motion | Screenshots + axe on 5 pages | No axe violations, no horizontal scroll |
| Offline | Shopping add then reconnect | Good, see section 4 |
| Not covered | Real push notifications (headless), adding a calendar feed link, desktop width, join/welcome/sign-up pages, recipe edit/cooking mode, Money loan/payment submit, task repeat completion over time. |

## 3. Summary
Top five:
1. Messages that name people wrongly or ambiguously ("You asked Alex to give "Clean oven" to Alex"; "Waiting for Sam" meaning opposite things). F1, F2.
2. Silent outcomes: delete project, add to shopping list, Ask to check, Decline give no confirmation or reason. F4, F2.
3. Money "Ask Sam to check" and "Decline" have no way to say why, so the other person gets a blank signal. F2.
4. Idiom and status-as-button labels: "Free this step", "I'm on this", "Pick something easy", "All square", "Show the next thing". F5, F6, F3.
5. Things that change by themselves or sticky hidden state: lists reorder when the other person edits; the "Let Alex know" tick stays on. F7, F10.
Verdict: calm palette, low motion, good offline wording and consistent navigation. Unusually careful about privacy and shame. But the proposal and money flows are where this persona will hit literal-reading and "what just happened?" friction. Fixing wording, with a few confirmations, would make it a good fit.

## 4. What works well
- Palette, no red, no flashing; dark mode and 360px/largest text had no overflow and no axe violations.
- Offline: "1 change waiting to be saved", then it clears on reconnect, item appears immediately.
- Undo toasts: "Done: Book the dentist  Undo", "Deleted: Bread  Undo" with a close X; never auto-vanish by default.
- Add to shopping list sheet states outcomes: "Not adding", button "Add 6 lines".
- Shopping buttons have item names in aria-labels ("Edit: Apples").
- Privacy is explained where chosen: "Only you can see the details. Alex sees that you are busy." Alex saw "Busy / Sam".
- Projects page states the rule: "Lines already on the list are left as they are, so pressing this twice adds nothing."
- "Not in Money. This is only for the project." Rules stated plainly.
- Consistent bottom nav and sub-tabs (Dinners / Calendar / Projects); Settings text says what is yours alone.
- Task assigning to the other person turns "Save" into "Ask Alex" (a fair rule, though see F1).

## 5. Findings
**F1 Major, High.** Proposal wording garbles who and what. Today (390). Sam's view: heading "Waiting for them", text `You asked Alex to give "Clean oven" to Alex`. Alex's: `Sam asks to give "Clean oven" to you`. After decline Sam: `Alex declined: give "Clean oven" to Alex`. Shots: autistic2-sam-after-ask.png, autistic2-alex-declined.png. Mechanism: "give X to Alex" reads as Alex giving it to Alex; "them" is unresolved; literal reader cannot tell who does the work. The task also still shows in the list as "Anyone" with a Done button while pending. Fix (small): templates like `You asked Alex to take "Clean oven". Waiting for Alex to answer.` / `Sam asks you to take "Clean oven".` / `Alex said no to taking "Clean oven". It is still on your list.` and show "For: Alex (asked, not yet answered)" on the row. Also explain on the form, under the select, "Choosing Alex sends a request. They can accept or decline." (tiny). Same for the "Save" to "Ask Alex" button change.

**F2 Major, High.** Money check and declines have no explanation channel. Alex taps "Ask Sam to check": no confirmation; card says "Waiting for Sam" (the same words Sam saw earlier meaning waiting for Alex). Sam sees "Alex wants to check this one" with only Change / Delete and no reason. Task "Decline" likewise has no reason and no toast for the decliner. Mechanism: no clear, non-accusatory way to say what is wrong; an unexplained "wants to check" can read as accusation; autistic users cannot infer the reason. Fix (medium): optional one-line note ("What should Sam look at?") on Ask to check and Decline, shown to the other person. Also (tiny) show a toast "You asked Sam to check Weekly shop" and use distinct text: "You asked Sam to check this" vs "Waiting for Alex to agree".

**F3 Minor, Medium.** Idiom/vague labels. "All square" shown at top of Money while an unagreed entry exists (reads as "nothing to settle", which may be untrue); "Pick something easy" (picks a dinner at random; "easy" unexplained; button is a shuffle); "Show the next thing" / "Not now" (swaps list for one task, "Not now" has no stated effect); "Agree" doesn't say to what. Fix (tiny): "All square so far (1 entry waiting)"; "Suggest a low-energy dinner"; "Show one task" / "Show all tasks"; "Skip this task for now (it stays on your list)"; "Agree to this share".

**F4 Major, High.** Silent destructive/bulk actions. Project page: "Delete project" removes it at once, navigates away, no confirm and no toast/undo (autistic2-proj-del2.png). "Add to the shopping list" on a project gave no message at all (no status text; the lines only appear on the Shopping page as "for Take down the decking"). Fix (small): toast "Deleted project: Fix the hall socket. Undo" and "Added 2 lines to the shopping list (see Shopping)". Also say on the project page where deleted things go.

**F5 Minor, High.** Step wording. Buttons "I'm on this", "Free this step"; status line "On it" plus "Alex is on this". "Free" is literally "costs nothing"; "I'm on this" is a statement, not an instruction, and duplicates the status. Fix (tiny): "Take this step" / "Give this step back"; status "Sam is doing this" / "Nobody yet".

**F6 Minor, Medium.** Project costs: "£1,250.00 of £4,000.00" does not say which number is spent and which is the budget. Fix (tiny): "£1,250.00 spent of £4,000.00 budget". The "Add a step" heading and button share a name, and "Change costs" vs "Add a cost" differ for one concept.

**F7 Major, Medium.** Unannounced change. With Alex's Shopping open, after Sam added Apples and Butter and ticked Tomatoes, Alex's list rearranged itself within about 15 seconds (new rows at the top, Tomatoes moved to the bottom) with no notice and no "who". Ticking also moves the row to the bottom on your own screen, so tap targets shift. Today: Done removes the task row and shifts the page; the toast sits over list rows above the nav. Fix (medium): show "Sam changed the list. Show changes" before moving rows, or a quiet line "Updated just now by Sam"; keep ticked items in place until "Clear ticked". Add "added by Sam" small text. (small) reserve toast space above the nav.

**F8 Minor, Medium.** Repeat options are vague and inconsistent across forms: "Some days after it's done", "Every few days", "Every few weeks, on set days", "Every few months, on a set day"; "few" is imprecise and the first two sound the same. Fix (small): "Some days after I finish it" vs "Every N days, whether or not it is done", with an example line under the choice.

**F9 Minor, Medium.** Calendar jargon and layout. "Block, a routine like Wind down" is unexplained jargon. Week view starts on today (Sat 21 Nov) while Plan weeks start Monday 16 Nov; its title says "Today, Sat 21 Nov" in a week view, and the three week buttons wrap to two rows (autistic2-cal-alex-week.png). Fix (small): "Routine (repeats, like Wind down)"; start weeks on one fixed day everywhere; heading "Week from Sat 21 Nov".

**F10 Major, Medium.** Hidden sticky state: the "Let Alex know" tick stays ticked after sending, so every later change also messages Alex (confirmed: still checked after saving a task). It sits on every page, and its text "Sends them a short message about the changes you make here" leaves "them" and "here" unresolved. Fix (small): "Tell Alex when I save a change on this page" and either untick after each save or show state "Alex will be told about each change you save (on)". One shared setting per page is better than a box repeated in every sheet.

**F11 Minor, High.** Plan page is a wall: 5 weeks, 35 identical "Nothing planned yet" rows including past days (Mon 16 Nov to Fri 20 Nov). Fix (small): hide past days, collapse empty days into "No dinners planned for Tue 24 Nov to Sun 29 Nov" or show 2 weeks with a "Show later weeks" button.

**F12 Minor, Medium.** "I have this" button in the shopping sheet toggles a line to "Not adding" but its label never changes. Include toggle for "Takeaway" is greyed with "No recipe" and no reason. Fix (tiny): "I have this, don't add" and after pressing "Add it back"; "Nothing to add: Takeaway has no recipe."

**F13 Minor, Low.** Calendar Add: "Who is it for? Both of you" combined with the separate "Private" switch can contradict (private + both). I created a Sam-only private event; the rule is clear in that case but not for Both. Fix (tiny): disable Private with text when Both is chosen, or explain.

**F14 Minor, Medium.** "All projects" link text clips at the right edge on 390px (autistic2-proj-detail.png). Fix (tiny): wrap or shorten to "Projects" with a back arrow.

**F15 Minor, Medium.** Shopping row layout: quantity drops to its own line under the name with Edit/Delete shifting left, so rows differ (autistic2-shop-tick.png). Delete and Edit are plain text links next to each other with no space; delete is only recoverable with the Undo toast. Fix (small): consistent columns, name and quantity on one line.

**F16 Minor, Low.** Settings: the first line "Display settings are saved on this device." sits above Household and Notifications, which are not; the rule is stated but in the wrong place. Time dropdowns list 00:00 to 23:00 without saying what is the default; "Quiet hours" controls were not read. Fix (tiny): put the sentence above the Display section only.

## 6. Quick wins (priority order)
1. F1 proposal and decline wording (small).
2. F4 toasts and undo for Delete project and Add to shopping list (small).
3. F10 reword and reset "Let Alex know" (small).
4. F2 distinct text for who is waiting; toast on Ask to check (tiny).
5. F5 / F3 label changes (tiny).
6. F6, F14, F13, F12, F16 wording and layout (tiny).
7. F11 collapse empty past days (small).
8. F8 repeat option wording (small).

## 7. Not checked / for a real person to test
Push notifications as received (wording, sound, timing, quiet hours); adding a real calendar feed; sign-up/join/welcome flows; recipe cooking and edit views; Money loan/payment forms and what the other person is told; long-term behaviour of repeating tasks and the daily summary; desktop layout; whether unexpected list reordering (F7) bothers a real user in practice, since evidence for this is from general practitioner guidance (confidence Medium).
