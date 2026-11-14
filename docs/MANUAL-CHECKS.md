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

## Reading and touch

- [ ] Every screen at the largest text size and with reduce motion on (Settings): nothing is cut off, no two controls overlap, and every button is easy to hit with a thumb.
- [ ] No screen uses the words overdue, missed or streak.
