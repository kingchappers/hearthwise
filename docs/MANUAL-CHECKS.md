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
- [ ] From the Android phone, tick "Let them know" on a change. The iPhone gets one push. Tapping it opens the right page.
- [ ] The same in the other direction.
- [ ] A change made **without** the box ticked sends nothing.
- [ ] Turn on the daily digest for an hour that is a few minutes away. It arrives once, at that hour, and not again.
- [ ] Set quiet hours around the current time, send a "Let them know" push, and it is held. It arrives when quiet hours end.
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
- [ ] Look at the signed-out page at 360px wide and the largest text size. In an automated look the page was about 9px wider than the screen. It was not the tab bar and the cause was not traced; check whether the page scrolls sideways and note what is wider than the screen.
- [ ] The month-later check (the success measure): after a month, both people have put in their shared expenses and loans, the total matched a hand count, and neither person tracks the balance anywhere else. If not, note what is still missing.

## Reading and touch

- [ ] Every screen at the largest text size and with reduce motion on (Settings): nothing is cut off, no two controls overlap, and every button is easy to hit with a thumb.
- [ ] No screen uses the words overdue, missed or streak.
- [ ] Phase 2 screens (Plan, Recipes, the cooking view, the add review): the same, and none says forgot, skipped, incomplete, missing or unplanned.
- [ ] Phase 3 screens (Money, an entry, the add sheet): the same, and none says owe, owed, debt, unpaid or behind.
