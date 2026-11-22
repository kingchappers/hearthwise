# Hearthwise review: AuDHD adult (audhd), port 8103

## 1. Who I reviewed as
An AuDHD adult who shares a home and plans DIY jobs with a partner. This is a simulation informed by published guidance, not a substitute for lived experience. AuDHD-specific research is thin (lived-experience writing, a BPS Psychologist piece on executive function in autism and ADHD, one adolescent pilot app), so most findings are extrapolated from autism and ADHD guidance and carry Medium or Low confidence unless I saw the behaviour directly. Lenses used: stable frame with flexible content; transitions; inertia and initiation; demand sensitivity; sensory and scanning load; decision load; masking cost; energy; shared-plan communication. I drove phone (390), 360 at largest text, dark mode with reduced motion, two browsers (Sam and Alex), and offline. I did not get through every journey (see section 6).

## 2. Summary
1. **The frame is stable and the words are calm.** Same layout on every project, steps in a fixed list, order changeable, no due dates on steps, no red, no pressure words. This is the right shape for this persona.
2. **Today knows nothing about projects.** Today shows tasks and tonight's dinner only. A claimed step ("Check the joists: You're on this") and the planned weekend never appear there. The person with initiation difficulty must remember to open Plan > Projects > a project. This is the biggest gap (AU-1).
3. **"Low energy" exists only for dinners.** "Pick something easy" is a dinner filter. There is no way to say "little energy today" and see easy tasks or small steps (AU-2).
4. **Claiming is good for visibility but gives no reason and no hand-over.** "I'm on this" / "Free this step" show who has what, but there is nowhere to say why, or "I've started, not finished", and the "On it" label sits above "Alex is on this" in a way that reads as mine (AU-3, AU-4).
5. **Silent changes from the other person.** A losing edit is overwritten without telling the loser, and the changed words just appear on the other screen after the 10-second poll (AU-5). Deleting a project is instant with no confirmation and no Undo toast I could see (AU-6).

**Verdict:** would likely keep using it for the shared plan, because the smallest path for a small job (title only, add steps later) is real and the tone does not nag. Retention risk sits in Today (no projects), no energy control, and no reason/handover language. Confidence Medium.

## 3. What works well (protect these)
- Title-only project: New project dialog has one field ("Title") plus the Let Alex know tick. A plug job can start with no steps ("No steps yet. Add the first one below."). Shot: audhd-new-project.png, audhd-plug.png.
- Paste several lines into "Add a step" ("One step for each line. Rough notes are fine."): each line became a step, blank lines dropped.
- Step list is a stable frame: each step has the same three words of state ("Not started" / "On it" / "Done"), and "Move up / Move down" reorders. Order is flexible, nothing is forced in sequence (you can tick step 4 before step 3).
- No due dates on steps, no counts of lateness. Progress is "1 of 5 steps done", not a percentage or score.
- "Show the next thing" on Today shows one task with "Not now" and "Show the full list": a low-decision path. Good for decision paralysis.
- Materials show "On the list" per line after "Add to the shopping list"; the note "Lines already on the list are left as they are, so pressing this twice adds nothing." removes repeat-press anxiety (audhd-addlist1.png). Shopping shows "for Take down the decking".
- Offline: "1 change waiting to be saved", and on the step "On it. Not saved yet" (audhd-offline.png). Calm and clear.
- Deleted page: "Deleted by Sam, Sat 21 Nov. Comes back with 0 steps, 0 materials." plus Restore; "stay here for 30 days".
- Step delete gives a "Step deleted / Undo" toast, and Undo worked.
- Settings: Text size, Reduce motion, Appearance, toast duration ("Until I close them"), Today opens with Full list / Next thing / Calendar. This is the right kind of per-person control for opposing needs. Dark mode axe run found 0 violations. No horizontal scroll at 360 largest.
- Costs: "Not in Money. This is only for the project." Clear separation.

## 4. Findings
| ID | Sev | Conf | Where | What I saw | Why it hurts | Fix (size) |
|---|---|---|---|---|---|---|
| AU-1 | Major | High | Today `/` | Today lists "Now and next", "Tonight", and tasks ("Book the dentist", "Hoover upstairs", "Take the bins out"). With Sam holding "Check the joists" and the decking planned for 5 to 6 December, nothing about projects appears. | Initiation needs a cue where you already look; if you must recall to open Plan > Projects, inertia wins. Out of sight is gone for ADHD, and the autistic need for one reliable place is broken. | Add a "Your projects" block on Today: only steps you have claimed ("Check the joists, Take down the decking") and a planned day when within the next week. Max 3 lines, opt-out in Settings > Your view. (medium) |
| AU-2 | Major | High | Today and Plan "Pick something easy" | The button opens dinner filters ("20 min / Up to 30 min..."; "No easy dinners yet. Mark a recipe as low energy to see it here."). Settings has no energy control. | Interoception is weak: they need a cheap way to say "little today" and get a short answer. At present low energy means dinner only; tasks and steps cannot be marked easy. | Add an optional "Small" tag on tasks and steps and a Today control "Little energy today" that shows only small things (and easy dinners). One tap, resets tomorrow, never a score. (medium) |
| AU-3 | Major | Medium | Project, step row | A claimed step shows two lines: "On it" then "Alex is on this" (shot audhd-decking.png). My own step shows "On it / You're on this". | "On it" as a status reads as a personal statement, and on Alex's step it can be misread as mine under scanning. State is also the same word for both people. | Make the status line the sentence: "Alex has this" / "You have this", drop the separate "On it". Keep "Free this step". (tiny) |
| AU-4 | Major | Medium | Claim ("I'm on this") and step sheet | Sheet has only Step, Note, Save, Delete step. No reason, no "started", no hand-over wording. Freeing a step is one button. The author's core problem was distrust of the plan. | The other person cannot see why a step is claimed or how far it has got; a partner who does not trust the plan has nothing to read. Hand-over is only "Free". | Show the Note on the card (one line) and give "I'm on this" an optional "Because..." field; add "Hand over to Alex" that sets the claim to them with a prompt for the note. Keep it optional so it adds no demand. (medium) |
| AU-5 | Major | High | Two people editing one step | Sam saved "Sweep the deck first", then Alex saved "Sweep and pressure wash" on the same step. Alex saw no message; after the poll, Sam's screen silently showed Alex's words, and the claim state rode along. | Unannounced content change is a transition shock for autistic users and loses the thread for ADHD. Last writer wins and the loser's wording vanishes. | When a poll changes a step you looked at or edited, show a quiet line on that step: "Alex changed this a moment ago." and keep the old words under "Earlier wording". (medium) |
| AU-6 | Major | High | Project "Delete project" | Pressing Delete project instantly returned to the list; no confirm dialog and I saw no toast (audhd-delproj.png). It was on /deleted. | A mis-tap in a sensory-overloaded moment is permanent-feeling; no warning of the transition. | Add a "Project deleted / Undo" toast like steps have, or a one-line confirm ("Delete this project and its steps? You can bring it back for 30 days."). (small) |
| AU-7 | Minor | High | Two people claim the same step | Racing "I'm on this": first got it; the other's screen silently showed "Sam is on this". Earlier run showed a toast "Sam already has this" with no step name. | The loser may not know which step. The toast should name it. | "Sam already has Buy a bin bag." and a "Ask Sam" / "Pick another" pair. (small) |
| AU-8 | Minor | High | Project page, 360 largest | Top link "All projects" is cut to "All proj" (audhd-largest.png). | Truncated navigation costs scanning effort. | Let the link wrap or move it above the title as a full-width "Back to projects". (tiny) |
| AU-9 | Minor | High | Add a step | Pasted "- Call the council about the skip" kept the dash as part of the step title. | Lists pasted from notes apps usually have bullets or numbers. It makes the list look unfinished. | Strip leading "-", "*", "1." when splitting lines. (tiny) |
| AU-10 | Minor | High | New project | After "New project" you return to the list, not the new project; you must find and tap it again (audhd-new-project.png flow). | An extra step at the moment of initiation, when the energy is spent. | Navigate straight into the new project. (tiny) |
| AU-11 | Minor | High | Mark as finished | The button just becomes "Bring back"; the page has no "Finished" label, the claim button "I'm on this" stays, and no toast confirms (audhd-finished.png). | State change with no signal; they cannot tell if it worked, and a finished project still invites claiming. | Show "Finished" under the title and a toast "Marked finished. Bring back any time"; hide the claim button when finished. (small) |
| AU-12 | Minor | High | Step order controls | "Move up / Move down" are small text links under each step; 5+ steps means 10 near-identical links. | Motor and scanning cost, and many equal-weight choices. | Hide them behind a single "Reorder" toggle, or drag handles with a keyboard fallback. (medium) |
| AU-13 | Minor | Medium | Step row | Tick box, name button, status, claim and two move links stack at about 130 px per step. Long lists mean a long scroll (decking page is about 2000 px at 390). | Scanning load for ADHD, density for autistic sensory limit. | Collapse steps to a single line (box, title, a small claimed-by chip) with the actions in the sheet. (medium) |
| AU-14 | Minor | Medium | Whole-project vs step claim | Project claim "You're on this" appears on the project card and list; steps hold separate claims. Garden room shows "You're on this" with 0 of 2 steps done. | Unclear whether the project claim means all steps are mine; this is exactly the ambiguity of the author's story. | Add one line under the project claim: "This means you are leading it. Steps are claimed one by one." (tiny) |
| AU-15 | Minor | Medium | Add a step | The Add a step button is disabled and grey until text is entered; no hint why. | Greyed controls without a reason raise demand anxiety. | Keep enabled and show the hint "Type a step first" on tap. (tiny) |
| AU-16 | Minor | Low | Settings, times | "Daily summary time" and "Due-day reminder time" are lists of 24 hours, and the first option is 00:00. | Many choices for a setup that must be done before notifications are useful; a default at midnight is odd. | Default to 08:00 and show only "Off" until the person chooses. (small) |
| AU-17 | Minor | Low | Tick/claim feedback | Ticking a step updates without sound or visual flourish; "Done" changes only the label (checked state). | Some will want a tiny reward (the pilot app used rewards); others will not. | Offer an optional "Small cheer on done" display setting, off by default. (small) |
| AU-18 | Minor | Low | Notification wording | "Let Alex know" tick says "Sends them a short message about the changes you make here." and sits on every page. | One tick per page is consistent (good), but it repeats on every screen and persists in view. | Keep, but collapse to one line on Today when the person has never used it. (tiny) |

Conflicts between the two profiles, with a both-serving fix:
- **Strict order vs free choice.** The list order is a suggestion only (nothing blocks a step), so the person who wants strict order gets no assurance. A free-choice person gets no pressure. Fix serving both: an optional "Do in this order" flag per project that shows a gentle "Next" marker on the first undone step without blocking anything. (medium)
- **Reminders vs demand.** Notifications are off by default (good for demand sensitivity), but the pilot testers asked for audio alerts outside the app; the ADHD need to be cued conflicts. Keep off by default with one-tap "Remind me about my claimed steps" in the Settings page. (small)
- **Less visible vs more visible.** AU-1 (show projects on Today) adds clutter for the sensory need; make it a "Your projects" block with one line per claimed step and a Settings toggle.

## 5. Quick wins (priority order)
1. AU-3 "Alex has this" / "You have this" wording (tiny).
2. AU-8 "All projects" no longer truncated (tiny).
3. AU-10 open new project after creating (tiny).
4. AU-6 Undo toast on project delete (small).
5. AU-9 strip bullets when pasting steps (tiny).
6. AU-11 "Finished" label and toast (small).
7. AU-7 name the step in the "already has this" toast (small).
8. AU-14 one line explaining project claim (tiny).

## 6. Things I could not check
- Whether the planned weekend shows on the Calendar day view: `/plan/calendar?day=...` did not jump to the date (it opened Today), and I did not step through days.
- Money flow, recipes cooking view, adding calendar events and the Calendars/feeds wording, and the dinner planned-week shopping add: not run.
- Task add/finish and shopping ticks on Today beyond reading them; the "Let them know" tick I read but did not send.
- Real timing of the 10-second refresh while a sheet is open.
- Needs a real AuDHD person: whether claiming helps initiation or adds a demand; whether "Show the next thing" feels like relief or pressure; whether the Today projects block (AU-1) is welcome or noise; sensory response to the terracotta palette.
