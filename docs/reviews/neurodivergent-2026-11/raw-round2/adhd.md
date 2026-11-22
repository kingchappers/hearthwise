# Hearthwise review: adult with ADHD (port 8102)

## 1. Who I reviewed as
A careful simulation of an adult with ADHD (not autistic) sharing the home with a partner. It is not lived experience. Lenses: Humane by Design on ADHD, the 2026 interview study (arXiv 2603.17258), and practitioner writing on why ADHD adults drop task apps. The shame and streak reasoning is mostly practitioner opinion, so I mark confidence honestly. This was a time-boxed pass. Mostly phone width 390, one pass at 360 with largest text, one offline test.

## 2. Coverage table
| Area | What I did | Found |
|---|---|---|
| Today (/) | Read it, added a task, completed one, "Show the next thing", "Pick something easy", offline Done | Calm, good; no upcoming view; add-task draft lost (F1, F2) |
| Add task sheet | Opened, typed, Escape, reload | Text lost with no warning (F1) |
| Task detail | Opened Hoover upstairs | Clear; Done/Edit/Delete; History empty state fine |
| Shopping | Add by Enter, delete | Fast; Delete is immediate with Undo toast (F5) |
| Plan / Dinners | Read the 6-week list | Long, mostly "Nothing planned yet" (F4) |
| Calendar day/week, Add, Calendars | Opened all, read the add form | Day view empty state fine; add form long (F3); week view good |
| Projects, project detail | Opened, read steps, materials | Good chunking; many equal buttons per step (F6) |
| Recipes list, new recipe | Opened, typed, navigated away and back | Draft is kept with "Continue your draft" (good) |
| Money | Read list and Add form | Neutral wording; not tested further |
| Settings | Read all of it | Notification times are plain selects from 00:00 (F7); calm wording |
| Deleted | Read | Empty state OK; wording "Nothing has been deleted." |
| Offline | Pressed Done offline | "1 change waiting to be saved", good |
| Largest text 360px | Home screenshot | Layout holds; bottom nav overlaps content at the fold |
| Dark mode, reduce motion, desktop, Alex's view, real push messages | Not covered | Out of time; real push delivery cannot be tested headless |
| Money add (submit), recipe cooking mode, feed link import | Not covered | Out of time |

## 3. Summary
1. Wording is genuinely low-shame: a past-due task reads "Anyone · Due · Wed 18 Nov" in the Today group, with no red, no streaks, no "overdue".
2. The add-task sheet loses half-typed text on Escape or reload, while recipes keep a draft. Inconsistent, and the worst working-memory failure I found.
3. Today shows only the current day. Tomorrow's dentist (Tue 24 Nov, in the calendar) never surfaces on Today ("Nothing more today"): time blindness.
4. Capture is mostly fast (shopping: type and Enter), but a task needs a sheet with many fields.
5. Completion has a small reward (a "Done: X" toast with Undo), but nothing marks progress after the list shrinks.
Verdict: good fit on tone and calm; weakest on time-blindness surfacing and draft safety. Fix F1 and F2 first.

## 4. What works well (protect)
- "Show the next thing" plus "Not now": one item at a time, a real anti-paralysis tool.
- "Pick something easy" with a time filter and Shuffle; the "Low energy" recipe tag.
- Done and delete toasts with Undo, and a setting to keep them until closed.
- Deleted page with explicit retention text ("stay here for 30 days").
- Offline writes show "1 change waiting to be saved".
- Recipe draft kept with "Continue your draft / Start again".
- Notifications "Everything here is off until you turn it on".
- No red, neutral empty states ("Nothing planned yet", "Nothing on").
- Project pages: "0 of 2 steps done", "You're on this", step statuses.

## 5. Findings
**F1 (Major, High). Half-typed task is lost.** /, Add a task sheet, 390px. I typed "Call the plumber about the", pressed Escape, reopened: title was "". Same after reload. Mechanism: interruption (a call, a tap outside) wipes the thought, and the user must recall it. Fix (small): keep the new-task sheet's fields in per-person device storage as recipes do (`app/lib/deviceKeys.ts`, cleared at sign-out); on reopen show "Continue your draft" or restore silently with a small "Start again". Do the same for the calendar add form and money add.

**F2 (Major, Medium). Nothing upcoming on Today.** Today shows "Now: nothing on / Nothing more today". The calendar has Dentist (both of you) on Tue 24 Nov and Work call Wed 25 Nov, and dinner plans, none of which appear until you open Calendar. Mechanism: out of sight is out of mind. Fix (medium): under "Now and next", add "Coming up" listing the next 2 or 3 items within 3 days, with the day word ("Tuesday 10:30 Dentist"). Keep it to three lines and no more.

**F3 (Minor, Medium). Calendar add form is long.** Fields shown at once: type, title, where, who, date, all-day, start, length, repeat, notes. Fix (small): show title, date and time first; fold "Where", "Repeat" and "Notes" behind "More options".

**F4 (Minor, Medium). Plan page is a six-week wall.** /plan lists 42 days, most "Nothing planned yet". Fix (small): show this week and next only, then "Show more weeks"; collapse runs of empty days.

**F5 (Minor, Low). Shopping delete has no confirmation and sits beside Edit on every row.** Undo exists, but only until the toast is closed or timed out. Fix (tiny): put Delete inside the Edit view or a row menu, which also cuts the equal-weight button pairs per row.

**F6 (Minor, Medium). Project steps carry up to four buttons each** ("I'm on this", "Move up", "Move down"...). Fix (small): move reorder into an "Arrange" mode.

**F7 (Minor, Medium). Notification times are 24-entry selects defaulting to 00:00 (summary).** A time picker defaulting to a sensible morning hour is easier; the digest and due reminder are separate, which is a good balance. Fix (tiny): default summary to 08:00 and show it as "8:00 am".

**F8 (Minor, Low). The "Let Alex know" checkbox and its sentence repeat on every page.** Mild clutter. Fix (tiny): a single line "Let Alex know" with the help text behind an info toggle.

**F9 (Minor, Low). Bottom nav covers content at the fold at 360px largest text** (adhd2-largest-home.png). Add bottom padding to the page.

## 6. Quick wins
1. F1 draft persistence (small).
2. F7 default time (tiny).
3. F8 shorten checkbox help (tiny).
4. F5 move Delete (tiny).
5. F9 padding (tiny).
6. F3 and F4 (small).

## 7. Not checked / for a real person to test
Real push notifications and quiet hours, real calendar feeds, dark mode, Alex's view of Sam's changes, money entry flows, and whether the toast time setting suits distraction-prone use. A real ADHD adult should test whether the Done toast feels rewarding or ignorable, and living with the app for a week for notification fatigue.
