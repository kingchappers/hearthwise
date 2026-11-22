# Hearthwise review: autistic adult (not ADHD), planning DIY jobs with a partner

## 1. Who I reviewed as
A simulation of an autistic adult who wants explicit rules, literal labels, no unannounced change, and a plan the partner can read and trust. It is informed by published practitioner guidance (Scope, St Andrews digital communications guidance, the Kent University study on interface change). It is NOT a substitute for lived experience, and the evidence base for autistic adults and apps is thin, so confidence is marked on each finding. Everything below was seen in the running app on port 8101 (phone 390x844 mainly; 360 "largest" and 1280 desktop once each), with two live browsers (Sam and Alex). Screenshots are in /private/tmp/claude-501/hw-review/shots/autistic-*.png.

## 2. Summary
1. **Feedback appears somewhere other than where you pressed.** A refusal or notice ("Sam already has this", "Already on the list") is a banner at the TOP of the project page, while the button sits at the bottom, so on a phone it is off screen. It also does not say which step. Pressing "Add to the shopping list" the first time gave no visible result near the button at all.
2. **Silent last-writer-wins.** When both people edited one step's words, Alex's save won and Sam's text vanished. Neither person was told. For a person who wants "who wins if we both tap at once?" stated, the app states no rules on screen.
3. **Rules are inconsistent and unstated.** Alex cannot take a project Sam holds (the button is simply absent, no reason given), but can take any step inside it, and can still mark it finished or delete it.
4. **Wording uses one word for several things.** "Done" is a task button, a step status, a checkbox name and a toast. "On it", "I'm on this" and "You're on this" overlap. Finished projects show no "Finished" word on their own page; the button just changes to "Bring back" (bring back what? to where?).
5. **Things move under the hands.** A new banner shifts the whole page down; ticking a shopping item reorders the list; a "Last changed by" line appears and pushes content; steps added in one place appear in the middle of others. The pushes are cryptic ("Sam changed a project / Open the project to take a look.").

**Verdict:** Would probably keep using it for Today, Shopping and Money, which are plain and predictable. Projects is the part that fits the household need, and its core idea (visible who-has-what) is right, but the unstated rules and out-of-sight feedback would make this person wary of using it in front of a partner who "did not trust them". With about 8 small fixes (below) it would be a strong fit. Confidence in the verdict: Medium.

## 3. What works well (protect these)
- **Offline wording is exact.** Offline claim: "1 change waiting to be saved" at the top, "Not saved yet" under the title, and "On it. Not saved yet" on the step itself. Says where, says what, no alarm. Gone cleanly after reconnect. (shots/autistic-offline.png)
- **Money agreement is explicit and literal.** Alex sees "Waiting for you", "Alex's share: £31.25 of £62.50", buttons "Agree" and "Ask Sam to check". Sam sees "Waiting for Alex". Who paid, how split, what happens next are all stated.
- **Shopping-list rule is stated on the button's own page**: "Lines already on the list are left as they are, so pressing this twice adds nothing." Second press says "Already on the list" and each material then shows "On the list". Shopping rows say "for Take down the decking", so the origin is clear.
- **Step controls name their object** via aria-labels ("Move up: Clear the plants", "Done: Lift the boards", "I'm on this: the whole project"). Holder lines name the person: "Alex is on this" / "You're on this".
- **Undo toasts name the thing** for tasks ("Done: Hoover upstairs / Undo") and stay until closed by default (no auto-vanish). Good for predictability.
- **Deleted page is precise**: "Deleted by Sam, Sat 21 Nov. Comes back with 0 steps, 0 materials." plus a 30-day rule.
- **Costs say what they are not**: "Not in Money. This is only for the project." Invalid amount says "Use an amount like 12.50".
- **Per-person visibility rule is on the event form**: "Only you can see the details. Alex sees that you are busy."
- **Settings explain themselves** ("Everything here is off until you turn it on", "Stops sliding and fading...", "Makes text bigger everywhere. It changes straight away."). No horizontal overflow at 360px at largest text.
- Neutral, low-shame wording and a muted palette throughout; empty states are gentle ("No steps yet. Add the first one below.").

## 4. Findings (most severe first)

**AU-1 | Major | High | Project page, 390px | Refusal banner is off screen and does not name the step**
Seen: after both people pressed "I'm on this" on "Check the joists", Alex got a banner at the very top: "Sam already has this" with Dismiss (shots/autistic-race-alex.png). The button pressed was lower on the page; the banner does not say which step, and the page below it moved down. Same for "Already on the list" after the second "Add to the shopping list" (shots/autistic-addlist2.png: the banner is out of view; the bottom shows only the static rule).
Why: autistic users need the result of a tap where the tap was, and a vague message ("this") forces guessing. Also a layout shift with no action by them.
Fix: (medium-small) show the notice inline beside the pressed control, or as a fixed bar at the bottom above the tab bar; word it "Sam already has the step "Check the joists". Nothing was changed." Reserve space or overlay so the page does not shift. Files: `app/lib/mutations.ts` (addNotice, lines ~539, ~558), `app/lib/projectText.ts` (`alreadyHas`), the notice component on ProjectPage.

**AU-2 | Major | High | Step sheet, both people editing the same step | Silent loss of one person's words**
Seen: Sam saved "Drill pilot holes 3mm", Alex saved "Drill pilot holes 4mm" a moment later. Result "Drill pilot holes 4mm" for both. Alex saw no message (shots/autistic-edit-loser.png); I saw nothing for Sam either. No rule on screen says last save wins.
Why: this is the exact "who wins if we both tap at once?" fairness case; the loser cannot know their work was replaced, which for a person who "did not trust that I knew what I was doing" is corrosive.
Fix: (medium) when a save replaces text changed by the other person since the sheet opened, tell the person whose text was replaced: "Alex changed this step to "Drill pilot holes 4mm" after you opened it. Your words were: "Drill pilot holes 3mm". [Put mine back] [Keep Alex's]". At minimum (tiny) add one rule line to the step sheet: "If you both change a step, the later save is kept." Confidence that it is silent: High (I saw only the final text; I did not capture Sam's screen after save).

**AU-3 | Major | High | Project page, holder rules | Unstated, inconsistent rules about who may do what**
Seen: Alex on "Build the garden room" (Sam holds it): the project-level button is simply gone, only "Sam is on this"; no reason is given. Yet Alex's "I'm on this" on a step inside worked ("On it | You're on this"), and "Mark as finished", "Edit project", "Delete project" remain for Alex with no warning. A step taken by Sam can be ticked "Done" by Sam on Alex's step (I ticked "Lift the boards", which Alex held; it became "Done" and the "Alex is on this" line vanished, with no question asked).
Why: the persona reads the missing button as a bug or exclusion; hidden rules are costly.
Fix: (small) add a single rules line under "Steps" or in a "How taking works" disclosure: "Taking a project or step tells the other person you have it. It does not stop them. If you both take a step, the first to save keeps it." Replace the missing button with disabled-looking text "Sam is on this. Ask Sam to free it." Ticking a step someone else holds should say "Alex is on this step. Tick it anyway?" (small-medium).

**AU-4 | Major | High | "Done" / "On it" / "I'm on this" / checkbox | One word, several meanings**
Seen: Today: button "Done" on a task. Project step: status text "Done", checkbox named "Done: Clear the plants", status "On it", holder "You're on this", button "I'm on this". The label "Not started | On it | Done" mixes with who holds it: a step can be "Done" and the other person's "Alex is on this" line vanishes. After ticking, "Lift the boards" read "Done" while the checkbox remained the only way to un-do it, with no label saying how.
Why: literal reader must work out whether "On it" means in progress or held, and whether "Done" is a command or a state.
Fix: (small) Pick one pair. Suggested: status words "Not started / Being done / Finished"; button "Take this step" / "Give this step back"; the tick named "Mark step finished". The brief lists "Free this step" as an idiom; "Give this step back" is more literal. Conflicts: none with brand. `app/lib/projectText.ts`.

**AU-5 | Major | Medium | Project page after "Mark as finished" | No "Finished" state shown on the page itself**
Seen: the button changes from "Mark as finished" to "Bring back"; the title area has no "Finished" text (shots/autistic-finished.png). On the list the card moves under a "Finished" heading and its progress line disappears ("2 of 9 steps done" is dropped). Immediately after pressing, the list still showed it under live projects for about a second, then moved.
Why: "Bring back" has no object or destination; the person cannot tell what state the project is in.
Fix: (tiny) on the page add a line "Finished" under the title; rename the button "Mark as not finished" (or "Reopen this project"); keep the "x of y steps done" line on finished cards.

**AU-6 | Major | Medium | Whole app, push wording ("Let them know") | Pushes are vague**
Seen (source `src/push/events.ts` lines 42-45): title "Sam changed a project", body "Open the project to take a look." Says nothing of what changed or which project; "take a look" is a soft instruction. Shopping's "Let Alex know" help text: "Sends them a short message about the changes you make here." (what changes? when? a message per change or one?)
Why: the persona wants exact statements and fears accusatory vagueness, and dislikes unprompted demands.
Fix: (small) keep titles/figures out (privacy) but say the kind of change: "Sam took a step", "Sam added steps", "Sam marked a project finished", "Sam changed a plan day". Drop the imperative; body: "Open Hearthwise, Plan, Projects to see it." Help text: "Sends Alex one short message each time you save a change on this page. It says what kind of change, never the words."  I did not receive a real push, so the pushed text is from source only.

**AU-7 | Major | Medium | Today, 390px | "Let Alex know" tick shown on every page, state unclear**
Seen on Today, Plan, Calendar, Projects, Shopping, Money as the same checkbox and help line. It is not stated whether it stays ticked, resets after a write, or applies to the page or the whole session. I did not verify reset behaviour.
Why: a silent persistent toggle that decides whether the partner is messaged is a hidden state. 
Fix: (small) after a write, show "Alex was told" or "Alex was not told" in the confirmation; label "Tell Alex when I save a change". Verify reset behaviour with a real person.

**AU-8 | Minor | High | Project page | Layout shifts without action**
Seen: a "Last changed by Sam" line appears under the buttons on Alex's screen after Sam edits (it was absent at first load: shots/autistic-race-alex.png), the "Sam already has this" banner pushes everything down, and shopping rows reorder when ticked (ticked rows moved to the bottom, with "Clear ticked (2)" appearing).
Why: Kent study: even small unannounced changes cost. The 10-second poll can do this while reading.
Fix: (small-medium) reserve a fixed place for the "Last changed" line (always render, "No changes yet"); do not move ticked shopping rows until the person leaves the page or presses an explicit "Tidy up"; if a refresh changes something under them, show a quiet inline note, "Alex changed this step. Show change" rather than swapping text.

**AU-9 | Minor | High | Project delete and restore | No confirmation, no Undo, no "restored" message**
Seen: "Delete project" immediately returned me to the list (no toast text found in the page, even after 900 ms); the list no longer shows it. On /deleted, "Restore" then leaves "Nothing has been deleted." with no "Restored". Steps have "Step deleted / Undo" but projects do not.
Fix: (small) toast "Project "Paint the spare room" deleted. Undo" and on restore "Project restored. It is in Projects." Step toast should also name the step ("Step "Sand edges" deleted").

**AU-10 | Minor | High | Add a step with pasted lines | List markers kept literally**
Seen: pasted "- Sand edges" and "2. Oil the boards"; they were saved with the "- " and "2. " in the step titles. Blank line correctly ignored. The prompt says "One step for each line. Rough notes are fine." which does not warn about this.
Why: the literal reader expects that "2." means order, then finds two orders.
Fix: (small) strip leading "- ", "* " and "1. " / "1) " on add (like `parseIngredientLine` does), or say it in the helper text.

**AU-11 | Minor | High | Project page, step order | Order is not numbered**
Seen: steps have no numbers; order is only position. The partner reading "this is the plan" cannot say "step 4".
Fix: (small) show "Step 1", "Step 2"... in front of each title (also gives "Move up" a clear effect, and lets a message say "Step 3"). Note "Move up/Move down" give no result message; moving "Buy screws" changed the list without a statement.

**AU-12 | Minor | High | Costs | "£1,250.00 of £4,000.00" unlabelled**
Seen on Build the garden room. The reader must guess which is spent and which is estimate, and "of" implies a limit/budget rather than a guess.
Fix: (tiny) "Spent so far £1,250.00. Estimate £4,000.00." (Avoid "left"/"remaining": it implies pressure.) `CostsSection.tsx`/`costLine`.

**AU-13 | Minor | High | Step sheet | "Note" has no explanation**
Seen: sheet shows "Step", "Note", Save, Delete step. The Note did save and display under the step ("Use stainless, the old ones rusted"), which is a strength, but the field does not say who sees it or that it shows on the step. For the "this is why" use it matters.
Fix: (tiny) helper text "Why or how. Alex sees this under the step." and a placeholder. Also the step note shows between status and buttons in small text; fine.

**AU-14 | Minor | High | Calendar day, 5 Dec | Project span shown thinly**
Seen: "Sat 5 Dec | Project: Take down the decking" with no "Sunday also" or what is planned (I set 5 to 6 Dec). Reasonable but "Project:" prefix looks like a label, not a link.
Fix: (tiny) "Project planned today: Take down the decking (5 to 6 December)", and make it a link.

**AU-15 | Minor | High | Plan, Add to shopping list | "Add 0 lines" button**
Seen: sheet says "There are no dinners planned from today on. Nothing needs adding." and still offers the button "Add 0 lines".
Fix: (tiny) hide or disable the button and keep "Cancel".

**AU-16 | Minor | Medium | Today | "Pick something easy", "Show the next thing", "Not now"**
Seen: "Pick something easy" (under Tonight, with "Nothing planned yet": easy meal? or easy task?), "Show the next thing" (what "next"? it then shows "Hoover upstairs" and "Not now"; the button becomes "Show the full list" and the rest of the list is hidden). Task lines say "Anyone" with a button "Done" and no due words.
Why: idiom/ambiguity; the app deciding for them; changing what the page shows.
Fix: (small) "Choose a dinner" (Tonight), "Show one task" / "Show all tasks", "Not now" -> "Show a different task". Mark that choice is the person's: this is a view change, not a command.

**AU-17 | Minor | Medium | Settings | "Reduce motion", "Messages" and notification texts**
Seen: "Daily summary: One message a day with what is due, today and from earlier days" (could be read as shaming: "from earlier days"). "Problems always stay until you close them." ("Problems" is a word to avoid, per the brand.) "Messages / How long messages with an Undo button stay" vs the earlier notion of push "message": the word message means two different things (on-screen toast vs push). The reduce-motion text is exact and good. I did not measure whether animations are actually suppressed.
Fix: (tiny) rename "Messages" to "Pop-up notes on screen"; "Problems always stay" -> "Notes that need you to act stay until you close them"; digest: "what is due today and anything that was due before".

**AU-18 | Minor | Medium | Settings | Time picker lists 24 hours, quiet hours, "Today opens with" options**
Seen: "Daily summary time" lists 00:00...23:00. Fine and literal. "Today opens with: Full list / Next thing / Calendar" lacks an explanation of what each shows; "You can switch on the page any time. This is where it starts." is OK. Minor: "Your items carry this colour, your name and the letter S" is concretely explained (strength).
Fix: (tiny) one short line per option.

**AU-19 | Minor | Medium | Add event sheet | Many choices at once**
Seen: Event/Block toggle, Title, Where, Who, Private, Date, All day, Starts, Length in minutes, Repeat, Notes, Let Alex know, in one sheet; "Block, a routine like Wind down" is jargon-ish.
Fix: (small) group under headings (What / When / Who); explain "Block" as "A repeating part of the day, like Wind down".

**AU-20 | Minor | Medium | Task add sheet | Idioms** 
Seen: "Some days after it's done", "Every few days", "Together", "Anyone". "Together" vs "Anyone" meanings not explained. Fix: (tiny) helper "Together: you both do it. Anyone: whoever is free."

**AU-21 | Minor | Low | Today | Whole-project claim only when already holding steps**
Garden room: project "You're on this" but its steps all say "Not started | I'm on this", so it is unclear whether taking the project means taking every step. Fix: (tiny) holder line "You're on this project. No steps are taken yet." 

**AU-22 | Minor | Low | Project page | Same buttons for finished projects**
After "Mark as finished", "I'm on this", "Edit project", step buttons and "Add a step" all remain active. Not an error, but the page does not signal that it is closed. Fix: (small) show a calm "This project is finished" line and keep controls.

**AU-23 | Minor | Medium | Offline | "Not saved yet" repeated three times; no "Saved" afterwards**
After reconnect all the markers vanished within 5 seconds with no confirmation. Fix: (tiny) show "Saved" for the same duration as a toast, kept until closed.

## 5. Quick wins (tiny/small, in order)
1. AU-1: put refusal/notice next to the pressed button or in a fixed bar; name the step. (small)
2. AU-2 rule line on the step sheet (tiny), then a visible conflict message (medium).
3. AU-3: one rules line under "Steps" and a reason where a button is absent. (small)
4. AU-4: choose one vocabulary for step state and action. (small)
5. AU-5: "Finished" label and "Reopen this project". (tiny)
6. AU-6: push text says the kind of change; no "take a look". (small)
7. AU-12: label the two cost numbers. (tiny)
8. AU-9: toasts for project delete and restore. (small)
9. AU-10: strip pasted list markers. (small)
10. AU-11: number the steps. (small)
11. AU-15: hide "Add 0 lines". (tiny)
12. AU-13: helper text on Note. (tiny)

## 6. Could not check
- Real push delivery and the cryptic text on a device; sound behaviour; whether a push is sent when the person tapped nothing.
- Whether the reduce-motion setting actually stops all animation (I did load dark+reduce-motion screenshots, shots/autistic-dark-project.png, but did not analyse them closely); dark-mode contrast not audited with axe.
- Whether the "Let Alex know" tick resets after a write.
- The 10-second poll moving content while reading (observed only that a banner and "Last changed by" appear after the other person's action).
- Recipes and cooking view, creating recipes, and a planned week with real dinners were not exercised (no recipes in the seed).
- Real autistic users should test: the "Sam already has this" banner on a phone, whether "On it" reads as "in progress" or "taken", whether a missing button is read as exclusion, and how the person feels about a partner seeing "Last changed by" on their steps (can read as monitoring).
