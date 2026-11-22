# Hearthwise review: adult with ADHD, shares a home, plans DIY with a partner

## 1. Who I reviewed as
A simulated adult with ADHD (not autistic) who shares a home with a partner and plans DIY jobs with them. This is a careful simulation informed by published guidance, NOT lived experience. Lenses: Humane by Design on ADHD, the arXiv 2603.17258 interview study (task management is co-constructed and relational; tools assume stable attention), and practitioner writing on why ADHD adults drop task apps. The shame/streak/overdue reasoning is mostly practitioner and vendor opinion, not controlled studies (confidence low to medium on that part). Tested at 390x844 (main), 360 with largest text, and 1280x800, on port 8102, with Sam and Alex in two browsers. Screenshots are in /private/tmp/claude-501/hw-review/shots/adhd-*.png.

## 2. Summary
Top five:
1. **Typed words are thrown away on an outside tap.** The Edit step sheet and the New task sheet both close when you tap the dimmed area, and the half-typed text is gone. The "Add a step" box also loses its draft if you leave the page and come back. This is the biggest working-memory hit.
2. **The other person's work is invisible unless you open the project.** Today says "Now: nothing on / Nothing more today" even with a project planned for 5-6 Dec and Alex on a step. The project list shows only project-level "You're on this", never "Alex is on 2 steps". This is the household's core problem (competing to do the same thing), and it is only half solved.
3. **Quiet state changes.** Finishing a project gives no message, and the finished project then looks identical to an active one in the list (no "Finished" word). Deleting a project asks nothing and shows no Undo (recovery is only via Settings > Deleted, whose link says "See deleted tasks"). A lost step-race and a lost word-edit give the loser little or no explanation.
4. **The step row is busy but mostly well chosen.** One main action per row plus two same-weight text links, small 24px tick box. Fine, but "Move up / Move down" times N rows is a lot of repeated noise.
5. **The wording is genuinely low-shame everywhere I looked**, and offline wording is excellent. This is the strongest part.

Verdict: with caveats, this person would keep using it for shopping, tasks and the shared project plan, because it is calm and never nags. The risk is the thought-loss moments (sheets closing, drafts) and the "out of sight, out of mind" Projects tab, which an ADHD person will forget exists unless Today points at it.

## 3. What works well (protect these)
- Banned-word discipline holds on every screen I read: "Whenever" (tasks with no date), "Not started", "On it", "Done", "Already on the list", "Comes back with 0 steps, 0 materials". No overdue, streak or red anywhere.
- Offline is clear and unscary: banner "1 change waiting to be saved", a row note "Done. Not saved yet", and the tick still shows immediately. After reconnecting it just syncs.
- "Show the next thing" + "Not now" on Today is a good anti-paralysis control (shows one task, with an easy way to skip it).
- Add to shopping list from materials: each material line then reads "On the list"; on Shopping the new lines read "for Take down the decking"; pressing twice gives "Already on the list" and no duplicates (adhd-addlist1.png, adhd-shopping-after.png).
- Project cards give "2 of 8 steps done": a neutral count of progress, not of what is left.
- Shopping add is type + Enter, field clears, item appears: 2 actions.
- Empty project state: "No steps yet. Add the first one below." Clear invitation.
- Step delete shows "Step deleted" + Undo; Deleted page says "Comes back with 0 steps, 0 materials", honest about what restore does.
- "Let Alex know" is unticked, never remembered, and explained ("Sends them a short message about the changes you make here"). Notification settings say "Everything here is off until you turn it on." Quiet hours exist. Push text is short, and "Sam changed a project" is non-judgmental.
- Calendar day 5 Dec shows "Project: Take down the decking" with the owner's name and letter, so a planned day is findable on the calendar.
- Reduce motion, text size, message length (Undo toasts) are all offered.

## 4. Findings (most severe first)

**AD-1. Major / High. Sheets lose typed text when closed by an outside tap.**
Where: Edit step sheet (Plan > Projects > decking > a step) and New task sheet (Today > Add a task), 390px. Saw: typed "Use the long bar, ask Alex about the nails" in Note, tapped the dimmed area at (5,300): sheet closed; reopening gave Note "" . Same for New task: Title "Fix the tap washer" typed, outside tap, reopen gave Title "". (adhd-sheet.png shows the sheet with text before the tap.) Why: a mis-tap or an interruption destroys a half-formed thought, which is the one thing an ADHD person cannot rebuild. Fix: set the Mantine drawer/modal `closeOnClickOutside={false}` when the form is dirty (or ask "Keep what you typed?"), or keep an in-memory draft per sheet keyed by step/task id and restore it on reopen. Small.

**AD-2. Major / High. "Add a step" draft is lost on leaving the page.**
Saw: typed four lines into Add a step, went to Settings and back: the box was empty. Why: a very likely ADHD pattern is to start listing steps, remember something, switch screen. Fix: keep the draft in sessionStorage/localStorage keyed by user and project id (recipe drafts already work this way per `app/lib/deviceKeys.ts`); clear on add. Small.

**AD-3. Major / Medium. Projects are invisible from Today, including what the other person took.**
Saw: Today for Sam reads "Now and next / Now: nothing on / Nothing more today / Open the calendar" while Take down the decking is planned 5-6 Dec and Alex is on "Lift the boards" (adhd-today.png). The Projects list shows only project-level "You're on this"/nothing; it never shows "Alex is on 2 steps". Time blindness: a planned day 2 weeks away will not be seen until opened. Mechanism: the household's main conflict (both start the same step) needs the other person's step claims visible without hunting. Fix: on Today (and a Projects card line) show a single quiet line, e.g. "Take down the decking: Alex is on 1 step" and, when a planned day is within 7 days, "Take down the decking: planned for Sat 5 Dec" under Now and next. Respect the author's reason (keep Today calm) by showing at most one line per project and only when a step is taken by the other person or a planned day is within a week; or make it a setting. Medium.

**AD-4. Major / High. Finished projects look like active ones in the list.**
Saw: after "Mark as finished", Paint the porch stays in the Projects list between active ones with no word at all (adhd-projects-after-finish.png). On the project page the button simply swaps to "Bring back" and no message appears. Why: no sense of completion/reward, and the list cannot tell you state, so the project is "lost" in plain sight. Fix: show a quiet "Finished" line on the card, sort finished projects to a "Finished" group at the bottom (collapsed), and show a short message on finishing ("Marked as finished. Bring back" with Undo). Small.

**AD-5. Major / High. Deleting a project has no confirmation or Undo message, and the Deleted link says "tasks".**
Saw: Delete project removed it from the list at once; no toast captured (adhd-delproject.png). Settings > Deleted says "Deleted tasks stay for 30 days" and the link reads "See deleted tasks", though the page also holds projects (Deleted page: "Deleted projects stay here for 30 days"). Step delete does have Undo, so project delete is inconsistent. Mechanism: panic "where did it go" and no path home. Fix: reuse the "Project deleted. Undo" toast and rename the link "See deleted things". Tiny/small.

**AD-6. Major / Medium. A lost race on "I'm on this" is explained far from where you tapped, or not at all.**
Saw: project-level race: Alex's page got "Sam already has this | Dismiss" at the top of the page (scrolled off if you tapped a step lower down). Step-level race (Sand the rail, both tapped together): Alex's page ended showing "Sam is on this" on that step with no message I could capture in adhd-steprace-alex.png and -top.png (2s after). I could not tell if a message was shown and gone; low-medium confidence. Why: the loser may think their tap failed or the app is buggy, and may start the step anyway. Fix: show the message on the row itself ("Sam took this step just now. Pick another?"), keep it until dismissed. Small.

**AD-7. Major / High. Same-step word edits are silent last-writer-wins.**
Saw: Sam saved "Remove the joists (Sam)", then Alex saved "Pull out the joists (Alex)" from an older view: Alex's words replaced Sam's with no notice on either screen; Sam's poll later showed Alex's wording. Why: for people who find putting plans into words hard, having your wording replaced without a word feels like a dismissal and fuels the "who is right" problem. Fix: when a save overwrites a newer other-person edit, show to the loser "Alex changed this at 14:02. Yours: '...' Keep mine / Keep theirs", or at minimum a note on the row "Changed by Alex". Medium.

**AD-8. Minor / High. Creating a project does not open it.**
Saw: New project > title > "New project" button: you stay on the list (URL stays /plan/projects) and have to find and tap the new card to add steps. Extra tap at the moment of intent. Fix: navigate to the new project's page with the cursor in "Add a step". Small.

**AD-9. Minor / High. Pasted list prefixes are kept in the step text.**
Saw: pasting "- Paint the rail" and "1. Clean brushes" produced steps with the literal "- " and "1. " (adhd-added-steps.png / adhd-delete-step.png), though the hint says "Rough notes are fine." Fix: strip leading `-`, `*`, `•`, `1.`, `1)` and `[ ]` when splitting lines. Tiny.

**AD-10. Minor / High. Tick box is small (24x24 px) and the row reflows when ticked.**
Saw: bounding box 24x24 for the step tick; when a step is done the "I'm on this" button disappears and the row shrinks, so rows below jump (adhd-tick2.png). Why: ADHD motor impulsivity and mis-taps; shifting content pulls attention. Fix: add a 44px hit area around the tick (label tap area), and keep row height stable (leave the space, or animate with reduce-motion respected). Small.

**AD-11. Minor / High. Ticking a step has no moment of reward.**
Saw: tick shows a filled box and "Done" and nothing else; no progress shown on the project page itself ("2 of 8 steps done" only appears on the list card, not on the page you are working on). Fix: add "2 of 8 steps done" under the title on the project page (calm and neutral, still no streaks), and when the last step is ticked, one line: "All steps done. Mark as finished?" Small.

**AD-12. Minor / Medium. Step row noise.**
Saw: each open step row shows tick, text, state word, I'm on this, Move up, Move down (and "On it / Alex is on this / Free this step"). On a 9-step project that is 18+ equal-weight links (adhd-decking.png). The most useful action does not stand out from reorder links. Fix: collapse Move up/down into the step sheet or a "Reorder" mode toggle; keep only "I'm on this" visible on the first not-started step, or make it a text link on others. Medium.

**AD-13. Minor / Medium. Undo toasts sit over the bottom nav and the main button.**
Saw: "Step deleted | Undo" overlaps the Add a step button and sits just above the tab bar (adhd-delete-step.png), and by default stays until closed ("Until I close them"). An Undo that blocks the thing you do next gets dismissed or ignored. Fix: place toasts above the nav with margin, make the default 30 seconds so they clear themselves. Small.

**AD-14. Minor / High. "All projects" link is cut off at 360 with largest text.**
Saw: reads "All proj" (adhd-largest-decking.png). Fix: allow the header row to wrap or use a back arrow with "Projects". Tiny.

**AD-15. Minor / Medium. Adding to shopping list gives no confirmation on the first press, and no link to Shopping.**
Saw: first press: no toast at all, only each line quietly gets "On the list". Second press: two stacked "Already on the list | Dismiss" toasts (ADD2). Fix: first press toast "Added 2 to Shopping" with a "See Shopping" link; show one toast not two. Small.

**AD-16. Minor / Medium. Push text for projects says nothing about the change.**
Source: src/push/events.ts: title "Sam changed a project", body "Open the project to take a look." For an ADHD person this is a bland nag (opens, finds nothing new, learns to mute). Fix: include the project name and what happened, for example "Sam is on 'Lift the boards' in Take down the decking" and for planned day "Planned for Sat 5 Dec". Keep ids/names out of logs per `log.ts`. Small.

**AD-17. Minor / Medium. No way to be reminded about a project step or planned day at the right moment.**
Saw: Settings notifications are Daily summary ("what is due, today and from earlier days"), Due-day reminders ("each task of yours that is due today") and Quiet hours. Projects and planned days are not in either. The two time pickers are 24-hour dropdowns listing every hour. Fix: let a planned day produce one gentle reminder the day before and the morning of ("Take down the decking is planned for tomorrow") as an off-by-default switch, and let step "I'm on this" optionally carry a reminder. Medium. (Fits the author's constraint: off by default, one tick.)

**AD-18. Minor / Low. "from earlier days" and "Problems always stay until you close them".**
Saw (Settings): "One message a day with what is due, today and from earlier days." and "Done and deleted messages. Problems always stay until you close them." Mild judgement hints: "earlier days" reads like a backlog, "Problems" is close to the banned "error". Fix: "what is due today, and anything still waiting" and "Messages that need a decision stay until you close them." Tiny.

**AD-19. Minor / Medium. Long Settings page for something an ADHD person visits in a bad moment.**
Saw: the Settings page is 2500px tall (adhd-settings.png) with Display (text size, motion) at the very bottom, and the 24 hour dropdowns. Fix: put Display first or add short jump links; group notifications behind one master switch. Small/medium.

**AD-20. Minor / Medium. "Let Alex know" appears on every page, and in every sheet, and has to be reconsidered each time.**
Saw: Today, Shopping, Calendar, project page, New project sheet, Add task sheet. It is unticked and never remembered by design (`app/lib/letThemKnow.ts`), which prevents nagging but also means that wanting to tell them is a repeated decision, easy to forget at the moment it matters (for example just after taking a step). Fix: on "I'm on this" for a step, offer the tick next to the button or default it on for claims only (since the claim is the information the partner needs), still off for everything else. Medium; may conflict with the author's "nothing is sent unless asked" rule, so make it a Settings option.

**AD-21. Minor / Low. Task list: ticked tasks vanish, no done section.**
Saw: "Done: Book the dentist | Undo" toast and the task left Today. Satisfying and calm, but if the toast closes there is no visible "done today" count. Fix: optional "Done today" folded section ("2 done today"), neutral. Small.

**AD-22. Minor / Low. Projects list order is not obvious.**
Saw: Build the garden room, Paint the porch (new), Fix the hall socket, Take down the decking. No visible reason (I think held ones first, then by name). New project appears second. Fix: show most recently touched first, or put "You're on this" ones first with a small heading. Small.

**AD-23. Minor / High (strength to keep, note only). Offline/online and shortage of motion.**
Nothing animates on its own that I could see; the 10 second polling did not move content in my tests (the same row text persisted). I did not measure small layout shifts when the other person's change arrives.

## 5. Quick wins (tiny or small, in priority order)
1. AD-1: do not close sheets on outside tap when they hold typed text.
2. AD-2: keep the "Add a step" draft across navigation.
3. AD-5: "Project deleted. Undo" message and rename "See deleted tasks" to "See deleted things".
4. AD-4: "Finished" label on cards, finishing message.
5. AD-9: strip "- ", "1." from pasted steps.
6. AD-11: show "2 of 8 steps done" on the project page.
7. AD-6: put the lost-race message on the row.
8. AD-8: open the new project after creating it.
9. AD-10: bigger tick hit area, stable row height.
10. AD-13, AD-14, AD-15, AD-18: toast position and default, header wrap, shopping confirmation, softer settings words.

## 6. Things I could not check
- Real push delivery (headless, no notification permission), so the actual feel of "Sam changed a project" is from source (src/push/events.ts) only.
- Whether a lost step-race message appears briefly: my snapshot was 2s after the race, so I cannot rule out a toast that had cleared.
- Dark mode, the dinner/recipe and Money journeys, and calendar event adding were not covered in depth in this pass; I read the Calendar and Settings text only, and did not add a feed link.
- Desktop (1280) was captured (adhd-desktop-decking.png) but not analysed beyond layout.
- Real ADHD users should test: abandoning a sheet halfway and returning an hour later; whether they remember the Projects tab exists without Today pointing at it; whether "I'm on this" is a trusted signal or just another tap; whether the planned day on the Calendar gets noticed a week out.
