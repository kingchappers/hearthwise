# Hearthwise review: AuDHD adult (autistic and ADHD together)

## 1. Who I reviewed as
An AuDHD adult using the app with a partner, on a phone (390x844 mainly). I am a careful simulation, not lived experience. Research on AuDHD design is thin (lived-experience writing, a BPS Psychologist piece on executive function in autism and ADHD, one adolescent pilot app whose testers asked for audio alerts outside the app and links to other tools), so most of what follows is **extrapolated from separate autism and ADHD guidance**; I mark confidence per finding. Central frame: the profiles pull in opposite directions, so I look for a stable frame with flexible content and for places where fixing for one profile hurts the other. Instance: port 8103, sam and alex both used.

## 2. Coverage table
| Area | What I did | Found |
|---|---|---|
| Today (`/`) | Read, Add a task, Show the next thing, Not now, Done + Undo, Pick something easy, large text 360px, dark | Calm, low density. Findings F1, F3, F4, F6 |
| Task detail (`/tasks/{id}`) | Opened, Delete | F2 (dead end after delete) |
| Add task sheet | Opened, filled, assigned to Alex | "Ask Alex" button; good (W3). F5 |
| Proposals (sam to alex) | Sam asked Alex to take a task, read both sides | Wording F5; arrives for Alex only after a refresh gap |
| Shopping | Add, Edit, Delete + Undo, offline add | Delete is instant with Undo toast; offline works (W6) |
| Recipes list, detail, new | Read, cooking view, Low energy tag, New recipe form | Cooking tick view is excellent (W4) |
| Plan / Dinners | Read, 5 weeks of days | Long scroll of "Nothing planned yet" (F8) |
| Calendar (day, week, Add, Calendars, Add a calendar) | Opened every sheet. Block toggle: my click did not visibly change the form, not verified | F7 |
| Projects list, 3 project pages | Read steps, claim ("I'm on this"), costs, materials | Good claim model (W5). F9 |
| Money list, add sheet, entry, Alex's view | Read both sides | Gentle wording (W2). F10 |
| Settings | Read all sections | W7, F11 |
| Deleted | Read | Fine |
| Dark mode, largest text at 360px | Today, Calendar, Add task | Holds up; no clipping seen |
| Offline | Alex offline on Shopping, added item | "1 change waiting to be saved" (good). Cold navigation to an unvisited page offline gave the browser's own dino page; low confidence (headless, service worker may not have been ready) |
| Not covered | Reduce motion behaviour, real push notifications (needs real device), quiet hours effect, join/welcome flows, recipe edit and plan assignment flows, real feed link, desktop width | Time |

## 3. Summary
1. The frame is stable and the wording is genuinely low-demand ("Nothing planned yet", "Not now", "Waiting for you", "Ask Alex"). This is the app's biggest strength for this persona.
2. Starting is well supported by "Show the next thing" and "Pick something easy", but both are narrow: "Pick something easy" is recipes only, so there is no way to say "low energy" for tasks.
3. Deleting a task lands you on "We couldn't find that task." (F2): an unannounced state change and an error-sounding line after a deliberate action.
4. Cross-profile tension: "Show the next thing" gives choice-free order (helps ADHD decision load) but the order is not explained, and "Not now" cycles silently (F3).
5. The "Let Alex know" checkbox is on every screen at the same weight as primary content (F6): repeated, equal-weight, and it implies social obligation.

Verdict: good fit overall; a calm, predictable app. Fixes are mostly small wording and transition changes, plus one energy setting.

## 4. What works well (protect these)
- W1. Today screen at 390px is short: two cards, two buttons, a "Whenever" list. Low clutter (`audhd2-_.png`). Holds at 360px largest text (`audhd2-L_.png`).
- W2. Money wording: "All square", "Waiting for Alex" / "Waiting for you", "Ask Sam to check". No owe/debt language.
- W3. Assigning to the partner turns the button into "Ask Alex": respects autonomy and avoids imposed demands (`audhd2-afterwho.png`).
- W4. Recipe cooking view: "Get everything out", tickable ingredients and numbered steps, "Start again". Great for initiation and for working memory (`audhd2-recipe.png`).
- W5. Projects: "I'm on this" / "Free this step" / "Alex is on this", steps "Not started / On it / Done", "Rough notes are fine." Claiming is soft and visible.
- W6. Offline: "1 change waiting to be saved" with the item shown immediately.
- W7. Settings: "Everything here is off until you turn it on", "Today opens with: Full list / Next thing / Calendar", text size, appearance, reduce motion, and undo-message duration ("Until I close them" up to 10 seconds). A real set of sensory and pacing controls.
- W8. Deleting shopping items and tasks has an Undo toast ("Deleted: Bread  Undo  X").
- W9. "Low energy" tag on recipes ("Easy to make when you are short of time, energy or ingredients").
- W10. Private calendar events: "Only you can see the details. Alex sees that you are busy."

## 5. Findings

### F1. No way to say "low energy" for tasks (Major, confidence Medium; extrapolated)
Where: `/`, "Pick something easy". It opens "Pick something easy / Time: Any time ... Up to 60 min" and shows only recipes ("Cheese on toast, 10 min"). Tasks have no size, time or energy attribute (add-task form: Title, Notes, Who, Repeat, Due on, steps).
Why: Interoception is unreliable, and an energy-aware app is exactly what helps. But "Pick something easy" on a Today page that is mostly chores reads as covering chores, then only offers dinner. With no task effort field, the "next thing" can be the heaviest thing.
Fix (medium): add an optional "Effort: small / medium / big" (or "Low energy" like recipes) on tasks, and a Today toggle "Low energy day" that makes "Show the next thing" prefer small tasks and hides big ones behind "Show everything". Make it per person and per device and clear itself the next morning. Conflict note: an autism-minded setting for fixed order would fight this; keep default order as is and make it opt in.

### F2. After deleting a task you land on "We couldn't find that task." (Major, confidence High)
Where: `/tasks/{id}` at 390px, Delete. Body text: "Deleted: Take the bins out / Undo" then "We couldn't find that task. / Back to Today" (`audhd2-deltask.png`).
Why: An unannounced change of state straight after a deliberate action; the error-style sentence reads as if something broke. With autistic inertia, you then have to navigate away, and Undo is a floating toast on a page that no longer shows the task.
Fix (small): after delete, navigate to Today (or back) automatically and keep the "Deleted: X  Undo" toast there; if the page is reached for a deleted id, say "This one was deleted. Undo or go back to Today."

### F3. "Show the next thing" and "Not now" cycle without saying how or why (Minor, Medium)
Where: `/`. "Show the next thing" shows one task with "Done" and "Not now". I pressed "Not now" and the next appeared (Hoover, then Bins). There is no "2 of 3", no hint what happens at the end.
Why: Autism wants to know the rule; ADHD wants one thing. A hidden queue with no end state is unpredictable, and "Not now" with no re-surface rule invites avoidance.
Fix (small): show "Next of 3" under the card and, at the end, "That's all for now. Show the full list". Add a one-line note "Not now puts it at the back, nothing changes for Alex." Keep the single-card default (serves ADHD); the counter serves autism.

### F4. Today's top card says "Now: nothing on / Nothing more today" while the calendar has things on other days (Minor, Medium)
Where: `/` (`audhd2-_.png`). Week view shows "Tue 24 Nov: Dentist 10:30 to 11:30" and dinner on Monday.
Why: "Now and next" with no next-day lookahead removes advance warning; transitions help when announced. Two empty cards also use a lot of screen on quiet days.
Fix (small): when today is empty, show "Next: Dentist, Tue 24 Nov, 10:30" (calendar only, no pressure wording). Collapse the card if nothing is on.

### F5. Proposal wording is garbled and the task looks assigned when it is not (Minor, High)
Where: `/` as sam after "Ask Alex": "You asked Alex to give "Sort the post" to Alex" with Withdraw; the task still appears below under "Whenever" as "Anyone / Done". As alex: "Sam asks to give "Sort the post" to you / Accept / Decline" (`audhd2-alextoday2.png`).
Why: Literal reading; "give to Alex" in a message to Alex is confusing, and a task you can also tick "Done" while it is pending adds ambiguity. Alex also did not see it until a later refresh (about 6 seconds).
Fix (tiny): sender text "You asked Alex to take "Sort the post"."; receiver "Sam asks if you can take "Sort the post"." Mark the pending task "Waiting for Alex" in the list.

### F6. "Let Alex know" checkbox repeats on every page and in every sheet (Minor, Medium)
Where: Today, Shopping, Calendar, Plan, Money, project pages, each add/edit sheet; text "Sends them a short message about the changes you make here."
Why: Adds one constant extra decision and a faint obligation ("should I tell them?") in every context; sameness helps, but the repetition is clutter. Autism-wise it is predictable; ADHD-wise it is noise.
Fix (small): put one household-level default in Settings ("Tell Alex about my changes: Never / Ask each time"), default Never; keep the per-write box only inside sheets when set to "Ask". Setting serves both.

### F7. Calendar add sheet is long, with many equal-weight fields (Minor, Medium)
Where: `/plan/calendar`, Add (`audhd2-caladd.png`, `audhd2-block.png`): What are you adding, Title, Where, Who, Private, Date, All day, Starts, Length, Repeat, Notes, Let Alex know.
Why: Decision load; on first use it needs scrolling to find "Add".
Fix (small): show Title, Date, Starts at and Add first; fold Where, Private, Length, Repeat, Notes under "More". "Block, a routine like Wind down" is a good structure idea; consider an example sentence.

### F8. Plan lists five weeks of "Nothing planned yet" (Minor, High)
Where: `/plan` Dinners: 35 days, about 30 saying "Nothing planned yet".
Why: Repeated "yet" is a soft implied expectation; long scroll is visual noise.
Fix (small): show this and next week open; later weeks collapsed ("Week of 30 Nov: nothing planned"). Replace "yet" with "Free" or leave blank.

### F9. Project page ends in two big buttons side by side with unlike effects (Minor, Medium)
Where: `/plan/projects/{id}`: "Mark as finished" and "Edit project" at the top; "Delete project" full-width at the bottom (`audhd2-proj-Takedownthedecking.png`). I did not test whether Delete asks to confirm.
Why: Destructive action styled like routine ones; also the bottom nav overlaps content in a full-page capture (probably a capture artefact, not a finding).
Fix (tiny): make Delete a text link at the end of "Edit project", with an undo toast (deleted projects stay 30 days, which is a good rule: say so in the toast).

### F10. Money asks for a response with a status chip on both screens (Minor, Low)
Where: `/money`: "Waiting for Alex"; Alex sees "Waiting for you / Agree / Ask Sam to check".
Why: "Waiting for you" is a gentle demand but still a standing open loop that sits on the page.
Fix (tiny): let the person say "Later" (hide for today), and word it "Sam added this. Agree when you're ready."

### F11. Settings is one long page including 48 time options (Minor, Medium)
Where: `/settings`: Daily summary time and Due-day reminder time each list 00:00 to 23:00.
Why: Long scroll, density, and the setting names ("Daily summary", "Due-day reminders") are two near-duplicates.
Fix (small): group under collapsible headings (Notifications, Your view, Display); time as a native time picker. Note: ADHD benefit (reminders) vs autism demand sensitivity: keep everything off by default as now, and add "Reminder wording: Plain / Gentle".

### F12. No outside-the-app alerts for time-based needs (Low confidence, extrapolated from the pilot study)
The pilot's testers asked for audio alerts outside the app and links to other tools. Here the calendar can import feeds (read-only), but nothing exports; push needs setup. Suggest (medium, later): an ICS feed of your own events and "due today" so your phone's alarm apps can ring.

## Cross-profile conflicts and proposed dual fixes
- Fixed order (autism) vs one thing at a time (ADHD): keep "Show the next thing", add counter and end state (F3); never auto-reorder the full list.
- Predictable reminders vs novelty: the Today page start choice (Full list / Next thing / Calendar) already lets each partner choose; extend with "Low energy day" (F1).
- Partner A wants strict order, partner B free choice: "I'm on this" claim model and "Ask Alex" already allow it; add per-person display setting, not a household one.
- Notifications help ADHD but are a demand for autism: all off by default (good), per person (good); add gentle wording.

## 6. Quick wins (priority)
1. F2 redirect and wording after delete (small).
2. F5 proposal wording (tiny).
3. F3 counter and end state (small).
4. F9 de-emphasise Delete project (tiny).
5. F4 next-day lookahead when today is empty (small).
6. F6 household default for "Let Alex know" (small).
7. F8 collapse empty weeks (small).

## 7. Not checked
Reduce motion in use, real phone push and quiet hours, join and welcome flows, recipe edit, assigning a recipe to a plan day, adding a real calendar feed, desktop width, Block creation, Money loan and payment flows, project delete confirmation. A real AuDHD person should test: starting a day from Today with the Next-thing mode, a low-energy day, a week of "Waiting for you" items piling up, and whether "Not now" feels like avoidance being made easy or pressure being lifted.
