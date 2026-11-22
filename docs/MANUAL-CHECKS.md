# Manual checks

Run before phase 1 is called done, and after any change to push, the service worker or the offline code. Two real phones, one Android and one iPhone (iOS 16.4 or later), each signed in as a different member of the same household. Emulators and desktop browsers do not count: they can't show that a push arrives on a locked phone.

Record the date, the app version and the result of each line in the pull request or release notes.

## Install

- [ ] Android (Chrome): open the site, choose Install app. It opens with no browser bar.
- [ ] iPhone (Safari): Share, Add to Home Screen, open it from the Home Screen. Push does not work from a Safari tab.
- [ ] Both phones: sign in, and the Today page loads.
- [ ] After a new version is deployed, the app says "New version ready. It'll load next time." and keeps working until it is reopened.

## Push

- [ ] Settings, Notifications: "Turn on notifications on this device" on each phone. The iPhone shows "Add Hearthwise to your Home Screen" steps until the app is installed.
- [ ] Settings says "Notifications are on for this device." on both phones.
- [ ] From the Android phone, tick "Tell Alex when I save a change" and save a change. The iPhone gets one push, the tick clears, and the box says "Alex was told." Tapping it opens the right page.
- [ ] The same in the other direction.
- [ ] A change made **without** the box ticked sends nothing.
- [ ] Turn on the daily digest for an hour that is a few minutes away. It arrives once, at that hour, and not again.
- [ ] Set quiet hours around the current time, send a push with that tick, and it is held. It arrives when quiet hours end.
- [ ] Choose "Turn off notifications on this device" on one phone. Nothing more arrives there.

## Journeys

- [ ] CUJ 2: complete a chore that repeats after completion. The next due date moves, and the other phone shows it within 15 seconds.
- [ ] CUJ 5, airplane mode: open the shopping list, tick and add items with the network off, then turn it on. Everything appears on the other phone, once.
- [ ] CUJ 5, weak signal: repeat on a slow connection (Network Link Conditioner on iPhone, or throttle on Android). Nothing is lost or doubled, and the "waiting to save" note clears.
- [ ] CUJ 7: tick "I did this today" on the other person's chore. They are told only if the box was ticked.
- [ ] CUJ 8: one person has the full list with a digest, the other "next thing" with reminders off. Each sees their own view of the same tasks. Only the first gets the digest.

## Meals (phase 2)

- [ ] Type a recipe from a real card (Hello Fresh, a website or from memory) on a phone, and time it. Pasting the ingredient list works, and the reading under each line is right or easy to correct.
- [ ] Plan a week on one phone. The other phone shows it within 15 seconds. Both phones show the same dinner for Tonight.
- [ ] Open Tonight and then the cooking view on a real phone. The screen stays awake while you cook, and the ticks are still there after you lock and unlock the phone.
- [ ] Read a recipe, the plan and the shopping list in airplane mode. The last copy each phone saved shows, and a plan change made offline goes through when the signal returns, once.
- [ ] Add a planned week to the shopping list and check the review lines, and the shopping lines they become, against a hand count. The merged amounts, the "for" label and the "already on the list" hints are right, and a line typed by hand is untouched.
- [ ] Add the same week twice by hand (a new review each time): each add makes its own shopping lines, and nothing is lost or doubled by one add.
- [ ] Check that no screen relies on colour alone: the low-energy mark, "On the list", "Not adding" and "Not scaled" all say it in words.
- [ ] The month-later check (the success measure): after a month, the whiteboard is gone and neither person has to decide at 5pm what to eat. If not, note what is still missing.

## Money (phase 3)

Needs two real phones, one signed in as each person.

- [ ] Record a real loan and a real shared expense from each phone, then compare the total on the Money page with a hand count of the same entries. They match to the penny.
- [ ] Agree an entry on the other phone, and ask for a check on another. The waiting entry becomes agreed or stays waiting as expected, and only agreed entries count in the total.
- [ ] Record a repayment against a loan on the other phone. The loan's "paid back" progress moves, and paying back more than is left is allowed and still counted.
- [ ] Change an agreed entry (the amount, then only its description) and delete another. A change to the amount waits for the other person; a description edit does not. Deleted entries show on the Deleted page and can be restored.
- [ ] Use Money in airplane mode: the last copy shows, an entry added offline says it is not saved yet, and it appears once on the other phone when the signal returns.
- [ ] Add the same payment from both phones at about the same time. The hint about a matching entry shows, and nothing is lost or doubled by one add.
- [ ] Check that no screen relies on colour alone: waiting, agreed, declined, "Needs another look" and settled all say it in words.
- [ ] Six tabs at the largest text size (go/no-go): at 360px wide with the largest text size in Settings, all six tab labels (Today, Plan, Recipes, Shopping, Money, Settings) can be read and hit with a thumb, and none is cut off or overlaps. If they do not fit, say so: the design allows moving a tab into a menu.
- [ ] Look at the signed-out page at 360px wide and the largest text size: it does not scroll sideways. (An automated look found it 9px too wide because the large Hearthwise name did not fit beside its mark; that is fixed, so this confirms it on a real phone. Other pages were not traced.)
- [ ] The month-later check (the success measure): after a month, both people have put in their shared expenses and loans, the total matched a hand count, and neither person tracks the balance anywhere else. If not, note what is still missing.

## Calendar (phase 4)

- [ ] **First, before anything else:** copy a real read-only link from each of Google, Outlook, Apple and Proton, and add each under Plan, Calendar, Calendars. Proton first: the design only assumes its link serves an ICS file. Each shows its events with "Updated just now". If a link is refused as "We can read links from Google, Outlook, Apple and Proton calendars.", correct the host and path table in `src/calendar/allowedHosts.ts` from what was found. If Proton does not work, drop it from this phase and say so on the screen.
- [ ] Follow the provider steps on the add form (`PROVIDER_STEPS` in `app/lib/calendarText.ts`) on each provider's real screens. The Outlook, Apple and Proton wording was written from the design, not checked: correct any step that does not match.
- [ ] Change an event in each provider's calendar and time how long Hearthwise takes to show it ("Refresh now", then the hourly refresh). Note each provider's delay. Google can take many hours; the screen says so.
- [ ] Add a feed as "Busy only" on one phone. On the other phone it shows only "Busy", with no title, host or label. Switch it to "Show details" and the other phone shows titles. Do this with the other phone in airplane mode after it has loaded once: nothing it saved holds a title it was not allowed to see.
- [ ] Make an event private on one phone. The other phone shows "Busy" with the person's name, and no title, place or notes, including offline and in any push.
- [ ] Add a typed event with a reminder on a real iPhone (Home Screen app) and time it: it should arrive about at the chosen time, up to five minutes late. Note how late it really is.
- [ ] Across a clock change (the last Sunday in March or October, in the household zone): a daily 09:00 event stays at 09:00, and an event inside the missing or repeated hour shows a sensible time.
- [ ] Remove a feed. Its events go from both phones, and adding the same link again works.
- [ ] Stop a feed's link from working (delete the secret address in the provider, or replace it). The feed keeps its last events and says "Last updated {n} days ago. The link stopped working. You may need a new one from {provider}." in plain words, with no red.
- [ ] Use the calendar in airplane mode after loading it online: today and the weeks around it show, with each feed's age. A week never opened online says "Not saved for offline yet". Adding a feed says "Needs a signal".
- [ ] The Plan tab now holds "Dinners | Calendar". Does the calendar icon on the Plan tab confuse anyone? Note what each person expected it to open.
- [ ] Today, Plan, Calendar (day and week), the add sheet and the Calendars sheet at 360px wide with the largest text size: nothing is cut off, nothing scrolls sideways, and every button is easy to hit with a thumb.
- [ ] Self-hosted: run the container, add a real link, and see its events. Check that outbound access to the four provider hosts is allowed, that `calendar.key` is not inside a backup made with `yarn store-cli backup`, and that a backup restored without the key shows "Link needs to be added again".
- [ ] Check that no screen relies on colour alone: a stopped feed, a busy item, an unsaved event and an approximate time all say it in words.
- [ ] The month-later check (the success measure): after a month, both people look at the calendar instead of asking each other, and a work calendar is on it. Ask both people. If not, note what is missing.

## Projects (phase 5)

Run these on two real phones, one for each person, with phase 5 in place. Design: `docs/designs/phase-5-diy-projects.md`.

- [ ] Both phones offline: each taps "Take this step" on the same step, Alex first, then both reconnect with Sam's tap reaching the server first. Alex's phone then says "Sam has this" and "Sam already has this" in calm words, with no red and nothing shown as failed, and "Take this step" is not offered there. The refused person's notice stays until dismissed.
- [ ] Both phones offline: reorder different steps on each. Both moves are kept and both phones show one order. Move the same step on both: the later one wins and the other person's page still shows one order.
- [ ] Edit the same step's words on both phones offline. The newer wording stays, and the other person sees "This was changed after you wrote it. Your wording is kept here." with their own words below, which they can copy.
- [ ] Add materials on a project and press "Add to the shopping list" twice. Nothing is doubled. Edit a line on the shopping list and press the button again: the edit stays. Clear a line from the list and press again: it says "Added earlier, and since cleared" and is not added again.
- [ ] Give a project a planned day and a span. It shows on the calendar day view for each of those days, and also offline after the calendar has been opened online. It reads "Planned for ..." and nothing changes when the day passes.
- [ ] Add an estimate and an amount spent. The page shows "£1,250.00 of £4,000.00", "Last changed by", and "Not in Money. This is only for the project." The Money page and its total are unchanged.
- [ ] Delete a project and restore it from Deleted. Its steps and materials come back with it, and the row said what would come back (for example "12 steps, 8 materials").
- [ ] An older copy of the app (a phone that has not updated) restores a saved queue that holds project writes: note what happens. This is accepted, not tested: that phone may drop its whole saved queue.
- [ ] The Plan switch ("Dinners | Calendar | Projects") at 360px wide with the largest text size: the three links wrap, nothing is cut off, and each is easy to hit with a thumb.
- [ ] Today's "Coming up": add an event for tomorrow and see it on Today with its day and time; ask Alex to take a step in a project and see "Alex has 1 step in ..."; turn each off in Settings, Your view; turn on "Show how far away dates are" and check that "in 2 days" appears only beside dates still to come, with the exact date beside it.
- [ ] Energy: give a task and a project step a size (Small, Medium, Big) and see "Small job" / "Small step" beside it; on Today turn on "Little energy today" and check the small things come first in the list and in Show one task, that the other person's phone is not affected, and that it is off again the next morning.
- [ ] Planned-day reminder: in Settings turn on "Planned-day reminder", plan a project for tomorrow, and check one push arrives at the chosen hour saying "A project is planned tomorrow" without the project's name, and another the morning of; the other person, who left it off, gets nothing.
- [ ] The month-later check (the success measure): after a month, each person opens the plan instead of asking the other what is next, and neither starts a step the other has. Ask both people. If not, note what is missing.

## Reading and touch

- [ ] Every screen at the largest text size and with reduce motion on (Settings): nothing is cut off, no two controls overlap, and every button is easy to hit with a thumb.
- [ ] No screen uses the words overdue, missed or streak.
- [ ] Phase 2 screens (Plan, Recipes, the cooking view, the add review): the same, and none says forgot, skipped, incomplete, missing or unplanned.
- [ ] Phase 3 screens (Money, an entry, the add sheet): the same, and none says owe, owed, debt, unpaid or behind.
- [ ] Phase 4 screens (Calendar, the add sheet, the Calendars sheet, Now and next): the same, and none says failed, error, alert or warning, and none uses red.
- [ ] Phase 5 screens (Projects, a project, the step and materials sheets, the Deleted page group): the same, and none says over budget, overspent, behind schedule, stuck, blocked, conflict, rejected, lost, claim or assign, and none uses red. A step's state and who is on it are said in words.
