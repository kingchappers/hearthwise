# Phase 4: shared calendar

* **Author:** kingchappers
* **Date:** 2026-11-15

## Overview

Phase 4 adds a shared calendar for the two people in a household. It does three jobs. It shows who is where, so each person can see what the other has on. It holds shared plans and appointments, with reminders. It holds time blocks and routines: repeating blocks of the day that give structure and warn before a change of activity.

Events come from two places. A person can paste a read-only subscription link (ICS or webcal) from Google, Outlook, Apple or Proton Calendar, and Hearthwise shows those events. A person can also type events into Hearthwise. Task due dates and dinners from the plan appear on the same timeline, but they stay owned by their own screens.

There is no sign-in to Google, Microsoft, Apple or Proton, and Hearthwise never writes back to those calendars. Today the two keep their calendars in four different apps, so neither can see the other's day without asking. Success is that each person opens one page and sees both days, and that a routine reminder arrives before a transition.

## Analysis

The author answered three product questions (scope, uses, privacy). Everything else here is Claude's reading of the code and the reviewers' findings. Six reviewers read the concept (design, codebase, simplicity, a cold reader, implementation readiness, structure). Their agreed points shape the design and are listed first, numbered so the decisions below can refer to them. A tag says who decided: **[Author]** or **[Claude]**.

**Terms.** Hearthwise today has six tabs (Today, Plan, Recipes, Shopping, Money, Settings). Plan is the week's dinners. Tasks have due dates and the repeat rules in `src/shared/schedule.ts`. The hourly scheduler (`src/push/scheduler.ts`) sends opt-in digests and nudges, and holds pushes during a person's quiet hours. An "occurrence" is one appearance of a repeating event on one date. A "feed" is one subscription to an outside calendar. A "snapshot" is what was read from a feed at its last fetch. A "block" is a repeating timed stretch of the day, such as "Wind down". "Now and next" is a strip on Today showing what is on now and what comes next.

**1. Fetching a link a person typed is the main risk. [Claude]**
The server fetches it. On AWS that is a Lambda in a shared account with credentials in its environment and the push signing key. In the container it is the home network. Any signed-up user can reach the route. The reviewers added: accept only the four providers' exact calendar hosts and paths (every redirect must land on a listed host), resolve the name in our own code, allow only public addresses, connect to the checked address with Node's `https` and a fixed `lookup` (global `fetch` cannot pin), restrict to port 443, rewrite `webcal://` to `https://` first, cap the bytes after decompression, set a total deadline as well as socket timeouts, and never keep or log a library's error text, because it can contain the host. The refusals for "not a supported site" and "could not be reached" are worded differently only where the difference is harmless.

**2. The link is a secret and has no key to be encrypted with yet. [Claude]**
Neither Lambda role can read any key but the push key, and the infrastructure guard test pins that. A second SSM parameter, read by both roles, is a recorded security decision. The container uses a key file next to the push key file. A backup holds only the encrypted link. The link is sent once in a request body, never in a path (API Gateway logs paths), never in the offline write queue (adding a feed is online only), and never returned: the feed shows its host and "link hidden".

**3. Imported events are stored as a snapshot and never edited. [Claude]**
The server fetches, parses and expands repeating events into a window of 14 days back to 120 days ahead, and stores plain occurrences (title, start, end, all-day, free) in chunks, with a generation id so a half-written refresh is never read. The app never parses a file. The screen says "Updated {time}" from the server's clock. Providers update their links slowly, so the wording says so.

**4. Calendar files are untrusted input, and the parser is synchronous. [Claude]**
Repeat rules can describe billions of occurrences, and `ical.js` cannot be stopped by a timeout in the same thread. The parse runs in a worker thread with a time and memory limit. Our own counter bounds expansion. Time zones arrive as IANA names, Windows names, embedded definitions or nothing; embedded definitions are ignored, Windows names use a table, and an unreadable zone shows the household zone with a note on that event. All-day events are dates. `ical.js` is a new dependency in both Lambda builds and the container build, and each build is tested for it.

**5. Hearthwise's own events use wall-clock times in the household zone. [Claude]**
"Wind down at 21:30" means 21:30 every day, also when the clocks change. An event stores a date, a start time and a length in wall-clock minutes. It repeats with the chore `fixed` rule, plus an end date and skipped dates (the chore rule has neither, and `after` makes no sense for events). Only the reminder job turns a wall-clock time into an instant. A time inside the spring gap goes at the first moment after the gap; a time that happens twice goes at the first.

**6. Privacy is decided on the server, through one function. [Claude, from the author's rule]**
A private event, and a feed set to "busy only", reach the other person as a start, an end and "Busy". The text is never sent, so it cannot sit in the other phone's cache, a push, a held push, a log or a write record. The other person cannot change a private event. A flip to private clears the other phone's copy at its next poll. New feeds default to "busy only".

**7. Reminders need a finer clock, their own index and a claim. [Claude]**
The hourly scheduler cannot send "10 minutes before". A second job runs every five minutes on the push Lambda (its own EventBridge rule and permission) and in the container (its own timer). It finds households through a small index partition, not a scan, and only for people with push on. Each reminder is claimed before it is sent, so it is at most once; a reminder more than 15 minutes late is skipped. Each person sets their own reminders, so nobody is notified because the other person asked. Reminders ignore quiet hours because the person chose that time; the form says so. Only Hearthwise events have reminders.

**8. Feeds are found through an index partition. [Claude]**
The refresh job cannot scan the table. One partition, `CALFEEDS`, lists every feed by household and feed id, as `PUSHIDX` does for subscriptions. A feed is claimed before it is fetched, backs off after repeated failures, and keeps its last good snapshot on any failure. A person can refresh by hand once every five minutes.

**9. The timeline is built on the device from separate sources. [Claude]**
Events, imported occurrences, tasks due that day and the dinner each keep their own cache. One pure function combines them: all-day items in a strip, timed items in start order, overlaps listed in order, never drawn side by side. Each item says whose it is in words. Tasks and dinners are not events and open their own screens.

**10. No new tab. [Claude]**
Six tabs already strain a 360 px screen at the largest text size. The Plan tab gets a "Dinners | Calendar" switch, the calendar lives at `/plan/calendar` (so the tab stays lit), and Today gets "Now and next".

**11. Rollout and operations. [Claude]**
New key prefixes (`EVENT#`, `CALFEED#`, `CALSECRET#`, `CALSNAP#`, `CALREM` (an index partition), `REMIND#`) are added to the household-move check, the member-removal path and the backup checks in the same change. New mutation keys are registered before anything is restored and never renamed. The cache version stays 1. Each fetch and each reminder run logs one line of ids, enums and counts, never a link, host, title or name. A store tool command prints each feed's state. Both Lambdas' memory and build scripts change, and the push Lambda gets a second rule.

**12. Build typed events first. [Claude]**
Reviewers noted that import is about half the work and nearly all the risk. The author asked for it, so it stays, but it is built last and as a gated block. After step 3 the household has a working shared calendar with reminders.

**Risks not settled by design.** A hostile file may still parse slowly; the hostile-file tests decide. Proton's link format is unverified. Reminders that ignore quiet hours are a new exception to a promise the app made.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  - Subscribe to read-only calendar links from Google, Outlook, Apple and Proton, with no sign-in, and say when each was last updated.
  - Type events into Hearthwise: one-off, repeating, all-day, and timed blocks, for one person or both, with a place.
  - One day view and one week view showing both people, with tasks due and dinners.
  - Per-event private, and per-feed "busy only", enforced on the server.
  - Each person's own reminders before an event, and at its end for blocks.
  - A "Now and next" strip on Today.
  - Read offline. Typed events can be written offline like the rest of the app.
  - Safe fetching of links, with the limits and wording above.
* **Out-of-Scope Non-Goals:**
  - Two-way sync, OAuth, or writing to any outside calendar.
  - Reminders for imported events.
  - Invitations, other attendees, RSVP, video links, and locations or descriptions of imported events.
  - A month grid, dragging, free-busy search, travel time.
  - A time zone for each person.
  - Publishing a Hearthwise feed for other apps.
  - Links to other providers or to addresses on a home network.
  - Moving one occurrence of a repeating event (skipping one is in scope).

## Alternatives Weighed

- **Sign in to each provider (OAuth).** Rejected by the author: no sign-in, read-only links only. [Point 1]
- **Fetch the link in the browser.** Rejected: most servers send no CORS headers, and the link would pass through saved browser data. [1, 2]
- **Fetch on every page view.** Rejected: slow, rate-limited by providers, and every poll would become an outbound request. [1, 3]
- **Accept any https host.** Rejected: it is an open proxy for anyone who can sign up. The four providers' hosts are listed instead; self-hosters can add exact names. [1]
- **Store the raw file and parse on read.** Rejected: a hostile file would be parsed on every read. [3, 4]
- **Store imported repeating events as rules.** Rejected: expansion bombs would reach the phone. [3, 4]
- **Parse in the request thread.** Rejected: `ical.js` is synchronous and cannot be interrupted. [4]
- **Write a parser.** Rejected: folding, zones and repeat rules are well covered by `ical.js`. [4]
- **Reject an event whose time zone cannot be read.** Rejected: one odd event would hide a calendar. It shows in the household zone with a note. [4]
- **Store all times as instants.** Rejected for typed events: "every day at 21:30" would move by an hour across a clock change. [5]
- **Use an RRULE for typed events.** Rejected: the chore `fixed` rule is already built and tested, and the form already exists. [5]
- **Send everything and hide it in the app.** Rejected: the hidden text would sit in the other phone's cache. [6]
- **Reuse or retime the hourly scheduler.** Rejected: "10 minutes before" cannot be hourly, and running the digest code every five minutes would load every person's tasks 288 times a day. [7]
- **One scheduled entry per reminder (EventBridge Scheduler).** Rejected: an entry per edit and repeat, a new permission, and nothing like it in the container. [7]
- **The creator sets reminders for both people.** Rejected: it would notify the other person without their choice. [7]
- **Scan the table for feeds.** Rejected: the push role may not scan. An index partition is used. [8]
- **Store or merge the timeline on the server.** Rejected: a second source of truth and a combined offline cache. [9]
- **A seventh tab.** Rejected: six already strain 360 px. [10]
- **A separate fetcher Lambda with its own role.** Not taken: more infrastructure, and the container has no such split. Listed for the author to check. [1]
- **Typed events only, import later.** Rejected by the author's scope, but the build order keeps the option open. [12]

## Key Decisions & Staging for Next Steps

Decided by the author:
- Read other calendars through read-only links, no sign-in, no sync back.
- Events typed in Hearthwise as well.
- Uses: who is where, shared plans and appointments with reminders, time blocks and routines.
- Events visible to both, with a per-event private option shown to the other as "busy".

Decided by Claude, from the review, and open to change (each refers to the point above): 1 the fetch rules and the host list; 2 the key and write-only link; 3 snapshots and chunks; 4 the worker thread and zone handling; 5 wall-clock events; 6 server-side privacy and the busy-only default; 7 the five-minute job, per-person reminders and the quiet-hours exception; 8 the feed index; 9 the device-built timeline; 10 no new tab; 11 rollout; 12 the build order.

Still to decide (settled in the design with a number, but the author may want another):
- Limits: 6 feeds a household, 500 events, 3 reminders per person per event, 2,000 occurrences per feed.
- How long a feed may go without updating before the screen says more than "Last updated".
- Whether reminders for a private event of the creator's should show the title on the lock screen.

Staging, seven pull requests (each with an acceptance statement in the design). 1: events on the server, with privacy. 2: the app: day and week views, the Today strip, offline writes (this alone meets "each person sees both days"). 3: reminders and the five-minute job. 4: the safe fetcher, the key and the infrastructure; its adversarial tests are the merge gate. 5: the parser. 6: feeds on the server and in the app. 7: finish (offline test, manual checks, docs).
