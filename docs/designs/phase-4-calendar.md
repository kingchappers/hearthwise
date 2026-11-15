# Hearthwise: Phase 4 (Shared Calendar)

* **Author:** kingchappers
* **Status:** Drafted from the author's product decisions and reviewed by seven independent reviewers (see "Review history"). The author has not yet reviewed the decisions marked **Claude** in the decisions table under "Technical Plan".
* **Date:** 2026-11-15

--------------------------------------------------------------------------------

## Overview

Phase 4 adds a shared calendar for the two people in a household. It has three jobs: show who is where, hold shared plans and appointments with reminders, and hold time blocks and routines that give structure and warn before a change of activity.

Events come from two places. A person can paste a read-only subscription link (ICS or webcal) from Google, Outlook, Apple or Proton Calendar, and Hearthwise shows those events. A person can also type events into Hearthwise. Task due dates and dinners from the meal plan appear on the same timeline but stay owned by their own screens. There is no sign-in to any outside service, and nothing is written back to any outside calendar.

The feature uses the household, write-record, offline-queue, recycle-bin and notification machinery from phases 1 to 3 (see [`phase-1-foundation.md`](phase-1-foundation.md), [`phase-2-meal-plan.md`](phase-2-meal-plan.md) and [`phase-3-money-tracker.md`](phase-3-money-tracker.md)). It adds the first code in Hearthwise that fetches an address a person typed, so most of this document is about doing that safely. The roadmap is [`../ROADMAP.md`](../ROADMAP.md).

### How this design was made

The author answered three product questions: the scope (read other calendars through read-only links, no sign-in, no two-way sync, plus events typed into Hearthwise), the main uses (who is where, shared plans and appointments with reminders, time blocks and routines), and privacy (events visible to both, with a per-event private option that shows to the other person only as "busy"). The author was away for the rest, so every other decision is marked **Claude** in the decisions table (Claude is the AI assistant that drafted the design). "Open Questions" lists the ones to check first. A brief ([`phase-4-calendar-concepts-brief.md`](phase-4-calendar-concepts-brief.md)) and this design were then read against the code by independent reviewers, and the findings were fixed. "Review history" at the end says what changed.

### The app today (for a reader new to the project)

Hearthwise is a web app for one household of exactly two people. It runs either as an API Lambda and a push Lambda on AWS, or as one self-hosted container (a Node server on SQLite), from the same code; both deployments are covered here. Its tabs are Today (what is due now), Plan (the week's dinners), Recipes, Shopping, Money and Settings. Tasks (chores and to-dos) have a due date and an optional repeat rule (`src/shared/schedule.ts`). Each person can turn on push notifications, a daily digest, due nudges and quiet hours; nothing is sent unless a person turned it on. The hourly scheduler (`src/push/scheduler.ts`) sends digests and nudges and releases held pushes. The app saves its data and pending writes on the device so it works with no signal. Dates are calendar dates in the household's time zone. Hoardwise is the author's separate budgeting app; nothing here touches it.

### Terms used below

| Term | Meaning |
|---|---|
| CUJ | Critical user journey: one end-to-end scenario, in the section of that name. |
| Event | A calendar entry typed into Hearthwise. It is stored as a definition (a date, a time, a length and a repeat rule), not as separate occurrences. |
| Block | An event with `kind: 'block'`: a repeating stretch of the day such as "Wind down" or "School run". It differs from an event only in how it is labelled and in the end-of-block reminder. |
| Occurrence | One appearance of an event or block on one date. |
| Feed | A subscription to one outside calendar through its link. It belongs to the person who added it. The app calls it a "calendar" ("Add a calendar"); this document says feed. |
| Imported event | An item read from a feed. It is not an "Event" (which is typed into Hearthwise) and is never edited. |
| Routine | A block that repeats. It is not a separate kind. |
| Reminder | A push a person asked for before an event or at the end of a block. This document uses no other word for it (not alert, prompt or warning). |
| Recycle bin | What the app calls the list of deleted items that can be restored. The data rows call a deleted item a tombstone. |
| Claim | A put-if-absent item written before a send so a second run sends nothing. |
| Catch-up window | How late a reminder may be sent after its moment: 15 minutes. |
| Instant | A moment as a count of milliseconds, with no zone. |
| Guarded, TaskError | `guarded` wraps a route so a thrown `TaskError` becomes a status and a code. |
| PUSHIDX | The index partition that lists every person with a push subscription, queried by key. |
| Let them know | The tick on a write (`notify` in the request) that sends the other person a push. |
| Household move check | `moveOptions` in `src/household/invites.ts`: a person alone in a household with no data may move to another household, so every prefix that holds data is listed in it. |
| Hoardwise | The author's separate personal budgeting app, the sibling that Hearthwise's scaffolding came from. Nothing here touches it. |
| Link | The ICS address of a feed. Anyone who holds it can read that calendar, so it is a secret. |
| Snapshot | The occurrences taken from a feed the last time it was fetched. Imported events are only ever read from a snapshot. |
| Allowed hosts | The fixed list of Google, Microsoft, Apple and Proton host names a link may point at (`src/calendar/allowedHosts.ts`). |
| Fetcher | The one module that makes outbound requests to a link (`src/calendar/fetcher.ts`). |
| Timeline | The day's items in order: events, imported occurrences, tasks due and the dinner. It is worked out on the device each time and never stored. |
| Busy | What the other person sees for something private: a start, an end and the word "Busy". |
| Wall-clock time | A time as it reads on a clock in the household's time zone ("21:30"). It is not converted to a universal instant until a reminder must be sent. |
| Household zone | `household.timezone`. Every calendar time is shown in it. |
| SSRF | Server-side request forgery: tricking the server into requesting an address the person should not reach, such as an internal service or the cloud credential endpoint. |
| Write record | Every write carries a client-made `mutationId`. The server stores a `MUT#<id>` record so a retry is answered from the record and writes nothing (`src/api/writeRecord.ts`). |
| Mutation queue, overlay | The app saves every household write and sends it when online (registered once in `app/lib/mutations.ts`). The overlay lays pending writes over cached data so a change shows before the server confirms it. |
| Per-field last-writer-wins | Each field group stores the client time it was last set; an older write never overwrites a newer one. |
| Household guard | `withHousehold` wraps every household route and supplies the household id, which never comes from the request. |
| Held push | A push stored for a person in quiet hours and released later (`HELD#`). |
| Scheduler | `runSchedule` (`src/push/scheduler.ts`): the hourly job that sends digests, nudges and held pushes. Phase 4 adds a second, five-minute job. |
| ICS | The iCalendar file format (RFC 5545). `webcal://` is the same address with a different scheme. |
| RRULE, EXDATE | The repeat rule, and the dates excluded from it, inside an ICS file. |
| `ical.js` | The library used to read ICS files. Phase 1 kept it out until this phase. |

## The Problem

The two people keep their calendars in different apps (Google, Outlook, Apple and Proton), so neither can see the other's day without asking. Shared appointments are sent by text. Routines live in a head or on a whiteboard, and a change of activity can arrive with no notice. Both people are adults who are autistic, ADHD or both, and advance notice of a change helps them. They need one page that shows both days in plain words, reminders that each person turns on for themselves, and no pressure.

## Goals

*   **G1.** Show events from a Google, Outlook, Apple or Proton calendar through its read-only link, with no sign-in, and say when each was last updated.
*   **G2.** Let either person type events into Hearthwise: one-off, repeating, all-day or timed, for one person or both.
*   **G3.** Let a person make an event private, and a feed "busy only". The other person then sees only "Busy", and the server never sends the hidden text.
*   **G4.** Hold time blocks and routines: repeating blocks with an optional heads-up before the start and a prompt at the end.
*   **G5.** Show one day view and one week view with both people, together with tasks due that day and the dinner.
*   **G6.** Let each person set their own reminders on an event. Nobody is reminded because the other person asked.
*   **G7.** Show "Now and next" on Today.
*   **G8.** Read the calendar offline, and write Hearthwise events offline like the rest of the app, with a visible "Not saved yet" state.
*   **G9.** Fetch links safely (section "Fetching a link"), and fail in kind words.
*   **G10.** Say whose each item is in words, not only colour, and say where a Hearthwise event is when it has a place ("who is where").
*   **G11.** Get times right on the days the clocks change, for reminders and for "Now and next".

Success measure, checked by asking the two people after a month (as `docs/MANUAL-CHECKS.md` does for phase 3): each opens the calendar instead of asking the other what they have on, and at least one routine reminder is one that a person asked for and has kept.

A short description of the problem for the people involved: advance notice of a change of activity helps both of them.

## Non-Goals

*   Two-way sync, OAuth, or writing to any outside calendar.
*   Reminders for imported events. The person's own calendar app already reminds them.
*   Invitations, people outside the household, RSVP, video links, attendees, locations on imported events, and descriptions of imported events.
*   A month grid, dragging to move, free and busy search, and travel time.
*   A time zone for each person. All times show in the household zone.
*   Publishing a Hearthwise feed for other apps to subscribe to.
*   Links to addresses on a home network (see Alternative K).
*   Editing a single occurrence of a repeating event beyond skipping it (see Alternative L).
*   A checklist inside a block (see Future Improvements).
*   Two-way edits of task due dates and dinners from the calendar. They open their own screens.

## Open Questions

Decisions the author has not yet reviewed, in the order the author should look at them (the first two are the largest and hardest to undo). Every decision marked Claude in the decisions table stands unless the author changes it; these are the ones most worth a look.

*   **Reading other calendars at all, for now.** One reviewer judged the import half (about half the work and nearly all the risk) too much for two people, and suggested typed events only for this phase. This design keeps it because the author's scope asked for it, and builds it last, so stopping after step 3 leaves a working shared calendar. The author may want to defer import to its own phase after seeing the size of steps 4 to 6.
*   **The server fetches a person's link.** Hearthwise's servers request an address a person typed. The browser cannot do it (Alternative B). The controls are in "Fetching a link": exact calendar hosts, address checks, pinned connections, size and time limits, and a parser in a worker thread with no secrets. For the author to check first.
*   **Only four providers' calendar addresses are allowed.** A link is accepted only if its host and path are one of the published-calendar addresses of Google, Microsoft (Outlook), Apple (iCloud) or Proton (the table is in "Fetching a link"), and every redirect must land on a listed host. This removes most of the risk and matches the author's scope. It means a link from another provider (Fastmail, Nextcloud, a NAS) is refused with "We can read links from Google, Outlook, Apple and Proton calendars". The path shapes come from the providers' help pages and are confirmed by hand before step 4 merges. Adding a host is a code change, and a self-hoster can add exact names with `CALENDAR_EXTRA_HOSTS` (see Alternative K).
*   **Fetching runs inside the existing Lambdas.** The API Lambda (add, replace, "Refresh now") and the push Lambda (hourly refresh) both hold the push signing key. A separate fetcher Lambda with a role that holds nothing else would limit the damage of a mistake. This design does not add one (Alternative P): the allowed-host list and address checks are the control, and the container has no such split anyway. Check whether you want the extra function.
*   **Imported feeds default to "busy only".** A person adds a work calendar and the other sees only "Busy" until they choose "Show details". The author said events are visible to both. The default is the safer one and is one tap to change.
*   **Reminders ignore quiet hours.** A reminder is sent at the time the person chose, even in their quiet hours. The form says so. Skipping or holding would silently lose a reminder for a 07:00 appointment.
*   **Reminders are per person.** Each person sets their own reminders on an event. Nobody can set one for the other. This keeps "nothing notifies unless a person asked".
*   **No seventh tab.** Calendar is a second page under Plan ("Dinners | Calendar", route `/plan/calendar`) and Today gets a "Now and next" strip. The Plan tab already uses a calendar icon for dinners, so the switch must be clear.
*   **A five-minute reminder job.** A second schedule on the push Lambda. Reminders arrive 0 to 5 minutes after the chosen time (more if the phone's push service is slow), and the form says "about".
*   **Proton.** Proton Calendar offers a read-only "share via link". This design assumes it serves an ICS file that Hearthwise can read at `calendar.proton.me`. This is not verified here; the author checks it by hand before step 4 merges (and it is the first line in `docs/MANUAL-CHECKS.md`). If Proton's links need a key in the page or are not ICS, Proton is dropped from this phase and the screen says so.
*   **Limits.** At most 6 feeds per household (3 per person), 500 live events, 3 reminders per person per event and 30 events with reminders per person. The numbers are in "Limits".
*   **Times that cannot be read** show in the household zone with a note on each affected event ("Time may be an hour out").
*   **Changing the household time zone** moves every event's real moment, because events are stored as wall-clock times. It is accepted and the settings page is not changed.
*   **A member who leaves** has their feeds and private events deleted. Shared events they made stay.

## Critical User Journeys (CUJs)

### CUJ 1: Sam adds a Google calendar

*   **Given**: Sam is signed in and has Google's "Secret address in iCal format" copied.
*   **When**: Sam opens Plan, then Calendar, then "Add a calendar", pastes the link, calls it "Sam's work", leaves "Busy only" selected and saves.
*   **Then**: The page says "Checking the link..." and then "Sam's work: 42 events, updated just now". Sam sees all 42. Alex sees the same times as "Busy". The pasted link never appears again: the feed shows "calendar.google.com, link hidden".

### CUJ 2: A link that does not work

*   **Given**: Sam pastes a link that points at an address inside a network, or one that points at a site that is not one of the four providers.
*   **When**: Sam saves.
*   **Then**: For an internal address or any site that is not one of the four providers' calendar addresses, Sam sees "We can read links from Google, Outlook, Apple and Proton calendars." For a link at one of those addresses that cannot be reached, Sam sees "We could not read that link. Check that you copied the whole address from the calendar's sharing settings." Nothing is stored in either case.

### CUJ 3: Alex adds a shared appointment

*   **Given**: Alex and Sam are in one household.
*   **When**: Alex adds Event, "Dentist", Thursday 10:30 for 45 minutes, for both of us, and sets a reminder "30 minutes before".
*   **Then**: The day view on both phones shows "10:30 to 11:15 Dentist, Sam and Alex". Alex's phone sends a push at about 10:00 ("Dentist starts in 30 minutes"). Sam gets none, because Sam did not set one. Sam can set one from the event.

### CUJ 4: A private appointment

*   **Given**: Sam adds an event "Counselling", Tuesday 17:00 for 1 hour, and ticks "Private".
*   **When**: Alex opens Tuesday.
*   **Then**: Alex sees "17:00 to 18:00 Busy, Sam". Alex cannot open it or change it. Alex's phone never received the word "Counselling".

### CUJ 5: An evening routine

*   **Given**: Sam wants a wind-down every weekday.
*   **When**: Sam adds Block, "Wind down", 21:30 for 30 minutes, repeating Monday to Friday, with "10 minutes before" and "At the end".
*   **Then**: Today shows "Next: Wind down at 21:30". At about 21:20 Sam gets "Wind down starts in 10 minutes", and at about 22:00 "Wind down is finishing". At 21:35 Today reads "Now: Wind down, until 22:00".

### CUJ 6: The clocks change

*   **Given**: A block "Early walk" is at 01:30 every day, with a reminder at the start. (The dates here are the 2026 changes in London, used as test fixtures; the next ones are 28 March and 31 October 2027.)
*   **When**: The clocks go forward (29 March 2026), and 01:30 does not exist that night.
*   **Then**: The calendar still lists "01:30 Early walk". The reminder is sent at the first moment after the gap (02:00 British Summer Time). When the clocks go back, the reminder is sent once, at the first 01:30.

### CUJ 7: Offline

*   **Given**: Sam has no signal.
*   **When**: Sam opens Calendar and adds an event.
*   **Then**: Sam sees the days already loaded, including imported events, with "Updated 3 hours ago" for each feed. The new event is marked "Not saved yet", and is sent once when the signal returns. Sam cannot add a feed offline: the button says "Needs a signal".

### CUJ 8: A feed goes quiet

*   **Given**: Alex's Outlook link was switched off in Outlook.
*   **When**: Hearthwise's hourly refresh gets "not found".
*   **Then**: The events from the last good fetch stay. The feed shows "Last updated 2 days ago. The link stopped working. You may need a new one from Outlook." Alex can replace the link or remove the feed. No red or other alert colour is used on a stale or stopped feed.

### CUJ 9: An event that repeats every second

*   **Given**: A link contains an event that repeats every second without end.
*   **When**: Hearthwise fetches it.
*   **Then**: That event is skipped, the rest of the calendar is shown, and the feed says "1 event repeats too often to show".

### CUJ 10: Removing a feed

*Goals: G1, G3.*

*   **Given**: Sam has a feed.
*   **When**: Sam taps "Remove this calendar".
*   **Then**: The stored link and the snapshot are deleted at once. Both phones stop showing the events.

### CUJ 11: Seeing both days

*   **Given**: Sam has a feed with a work meeting at 14:00, Alex has a dentist event at 10:30 "At the surgery", a task "Bins" is due today for Sam, and the plan has chilli for dinner.
*   **When**: Sam opens Today and then Plan, then Calendar.
*   **Then**: Today shows "Now: nothing on. Next: Dentist, Alex, 10:30". The day view shows a strip "Due: Bins (Sam)" and "Dinner: Chilli", then "10:30 Dentist, Alex, at the surgery" and "14:00 Work meeting, Sam". The week view lists the next seven days the same way, one day to a row. *Goals: G5, G7, G10.*

## Technical Plan (Architecture)

### Decisions this plan rests on

| Decision | Choice | Decided by |
|---|---|---|
| Scope | Read other calendars through read-only links (Google, Outlook, Apple, Proton), no sign-in, no sync back. Events can also be typed into Hearthwise. | Author |
| Uses | Who is where, shared plans and appointments with reminders, time blocks and routines. | Author |
| Privacy | Events visible to both. A per-event private option shows to the other person as "busy". | Author |
| Where a link is fetched | On the server, only in `src/calendar/fetcher.ts`, in the API Lambda, the push Lambda and the container. | Claude |
| Allowed sites | Exact calendar hosts of Google, Microsoft, Apple and Proton, with each provider's published-calendar path on the first request; every redirect lands on a listed host. | Claude |
| Link rules | `https` or `webcal` (rewritten to `https`), port 443, a DNS name, no user name or password. | Claude |
| Address checks | Resolve the name in our own code, allow only public unicast addresses, connect to the checked address, check every redirect again, at most 3 redirects. | Claude |
| Limits | 2 MB downloaded and 2 MB after decompression, 15 seconds in total, 5 seconds idle, and the rest of the list in "Limits". | Claude |
| Conditional requests | None (no `ETag` or `Last-Modified`), so a snapshot always slides. | Claude |
| Rate limits | 10 adds per person per hour, 60 per hour on the platform, 100 feeds on the platform, 2 fetches at once per Lambda instance. | Claude |
| Errors | Nine user-facing codes, and a finer internal list for the logs. | Claude |
| Link storage | Encrypted with AES-256-GCM (with the household and feed as additional data) under a key in SSM (AWS) or the environment or a file (container). No key rotation in this phase. Write-only: no route returns it. Never logged, never in a URL, a queued write or the app's cache. | Claude |
| Infrastructure change | A second SSM parameter on the API and push role policies (the boundary is unchanged), a `CALENDAR_KEY_PARAMETER` variable, and the push Lambda at 512 MB. | Claude |
| Adding a feed | Online only, one request, not queued. | Claude |
| Parser | `ical.js` in a worker thread with a time and memory limit, caps before parsing, and our own bound on expansion. | Claude |
| What is stored for a feed | Occurrences from 14 days back to 120 days ahead, chunked by month; title (120 characters), start, end, all-day, free and approximate-time flags only. | Claude |
| Time zones in imported files | `VTIMEZONE` ignored; IANA names, a Windows-name table, then the household zone with a note on that event. Repeats expand in wall-clock time. | Claude |
| Finding feeds to refresh | A single index partition `CALFEEDS`, queried by key (not scanned), as `PUSHIDX` is. | Claude |
| Feed refresh | Hourly, in the push Lambda and the container tick, with a per-feed claim, backoff after failures, and a manual "Refresh now". | Claude |
| Feed privacy | Each feed is "busy only" (default) or "show details", projected by the server. A busy-only feed's label is hidden from the other person. | Claude |
| A removed member's data | Their feeds, private events and reminders are deleted by a bounded cleanup after the removal; reads hide them meanwhile. | Claude |
| Hearthwise event times | Wall-clock date, start time and length in wall-clock minutes, in the household zone. | Claude |
| Repeats | The `fixed` `Repeat` rule in `src/shared/schedule.ts` (not `after`), plus an end date and skipped dates. | Claude |
| Event edits | Per-field last-writer-wins: title, place and notes each; the schedule as one group; people and privacy as one group. | Claude |
| Private events | Only the creator can change one. The server never sends the other person its text. No push is sent about one. | Claude |
| Write records | A calendar write's stored result holds only ids. The response is read again and projected for the caller. | Claude |
| Deleting | A tombstone and the recycle bin, as recipes do. | Claude |
| Task due dates and dinners | Shown in a strip above the timed items, built on the device by a pure function. Not events. | Claude |
| Reminders | Per person, on Hearthwise events and blocks only, 3 per person per event and 30 events per person; minutes 0 to 1,440 before the start, or at the end of a block. Sent even in quiet hours. At most once, with a 15-minute catch-up window. | Claude |
| Finding reminders | An index partition `CALREM` with one item per household that has reminders. | Claude |
| Reminder clock | A second EventBridge rule, every 5 minutes, on the existing push Lambda. | Claude |
| Navigation | No new tab: Calendar is under Plan, and Today gets "Now and next". | Claude |
| Cache version | `CACHE_SCHEMA_VERSION` stays 1. Every change is additive. | Claude |
| Client polling | Events every 10 seconds while visible; imported windows of 42 days on focus and every 5 minutes. | Claude |
| Staging | Seven pull requests, typed events first and the fetcher last (see "Detailed Implementation Plan"). | Claude |

### Components

```text
App (React SPA)                                     Server (API Lambda, push Lambda, or container)
-------------------------------------               ------------------------------------------------
Calendar page /plan/calendar (day, week)           GET    /api/hh/calendar                events
Calendars sheet, Today: Now and next               PUT    /api/hh/calendar/{id}           create, edit
useCalendar()  <-- polled every 10 s                DELETE /api/hh/calendar/{id}
useImported()  <-- window, 5 min, on focus          GET    /api/hh/calendar/imported       occurrences
buildTimeline (pure, shared)                        GET    /api/hh/calendar/feeds          feed state
applyPendingEvents (overlay)                        POST   /api/hh/calendar/feeds          add (online only)
calendarMutationKeys (events only)                  POST   /api/hh/calendar/feeds/{id}/replace
                                                    PATCH  /api/hh/calendar/feeds/{id}     rename, privacy
                                                    POST   /api/hh/calendar/feeds/{id}/refresh
                                                    PUT    /api/hh/calendar/{id}/reminders
                                                    DELETE /api/hh/calendar/feeds/{id}
                                                    withHousehold -> guarded
                                                    fetcher.ts -> parseIcs.ts -> snapshot items
                                                    runCalendarRefresh (hourly)   runReminders (5 min)
```

### Fetching a link

This is the part that can hurt, so it comes first. Every rule is tested before any route that uses it exists.

**Where the risk is.** The API and push Lambdas run outside any VPC, so they reach the public internet and nothing private in the account. They still hold temporary credentials (served on a loopback address and in environment variables), the push signing key (SSM), and read and write access to the table, and the roles are bounded by `hearthwise-lambda-boundary`. The container runs on the household's own network, where `192.168.1.1` or the host's own services are reachable, and shares a process with the database and secrets. Any signed-in person can add a feed, and anyone can create a household, so the route must be safe against a hostile caller. A link is also a bearer secret.

**What the fetcher does, in order** (`fetchFeed(url, previous)` in `src/calendar/fetcher.ts`):

1.  **Rewrite, then parse.** A leading `webcal://` is swapped for `https://` in the text, before the URL parser sees it (`webcal:` is not a "special" scheme, so the parser would not lower-case or normalise its host). The link is parsed, and the request uses only the parser's own serialised form. The scheme must then be `https:`. `http:`, `file:`, `ftp:`, `data:` and everything else are refused. Refuse a user name or password, a port other than 443 (or none), and a link over 2,000 characters. The host is converted to its ASCII form (punycode) and lower-cased first.
2.  **Allow only the four providers' calendar addresses.** The host must be an exact match from a short list, and on the first request the path must start with that provider's published-calendar prefix: `calendar.google.com` (`/calendar/ical/`), `outlook.office365.com`, `outlook.office.com` and `outlook.live.com` (`/owa/calendar/`), `pNN-caldav.icloud.com` where NN is digits (`/published/`), and `calendar.proton.me` (`/api/calendar/v1/url/`). A redirect hop must land on a host from the same list (the path prefix is checked on the first request only). The list is one table in `src/calendar/allowedHosts.ts`, with a fixture for each provider's real link shape. The shapes come from the providers' help pages and are confirmed with real links in the manual check; a wrong shape fails closed with `not_supported`. Whole domains (`google.com`, `microsoft.com`) are not allowed, because anyone can host a page there (Apps Script, shared files), and a hostile caller could point the fetcher at a slow server of their own. The container adds exact host names from `CALENDAR_EXTRA_HOSTS` if set; the Lambdas ignore it. A link that fails this step gives `not_supported`, including an internal address, `localhost` or an unlisted host.
3.  **Refuse an address in place of a name.** Refuse anything that is an IPv4 or IPv6 address in any form (decimal, hex, octal, shortened, bracketed), `localhost`, a name with no dot, and a trailing-dot name. The exact-host list already excludes these; this second check means a mistake in the list cannot allow one.
4.  **Resolve the name in our code.** With `dns.resolve4` and `dns.resolve6` under their own 3 second timeout (`dns.lookup` uses a small shared thread pool that a slow resolver could stall for the whole Lambda, and cannot be cancelled). If any returned address is not allowed, refuse the whole request. The rule is an allow-list: an IPv4 address must not be in the blocked table below, and an IPv6 address must be in `2000::/3` and not in the blocked IPv6 ranges. Both live in `src/calendar/addressRules.ts`, and a test walks the IANA special-purpose address registries and checks that every entry is refused. Blocked IPv4: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16` (this holds the cloud metadata address and the Lambda credential address), `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.88.99.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4`. Blocked IPv6, inside `2000::/3`: `2001::/23` (Teredo and the IETF protocol assignments), `2001:db8::/32`, `2002::/16` (6to4), `3fff::/20`; and outside it, everything, which already excludes `::`, `::1`, `::ffff:0:0/96` (IPv4-mapped), `64:ff9b::/96` and `64:ff9b:1::/48` (NAT64), `100::/64`, `fc00::/7`, `fe80::/10` and `ff00::/8`. Forms that embed an IPv4 address are refused outright, not unwrapped.
5.  **Connect to the address that was checked.** The request is made with Node's `https.request`, `agent: false` (a new connection for each hop, never a kept-alive socket) and a `lookup` function that returns only the address from step 4, in either callback shape (single address or `all: true`), so a second lookup (DNS rebinding: a name that answers with a public address first and an internal one next) can never change the target. The `Host` header, the TLS server name and the certificate check still use the original name. Certificate errors are never ignored. Global `fetch` is not used, because it cannot pin an address.
6.  **Handle redirects by hand.** A 301, 302, 303, 307 or 308 is followed at most 3 times, and each new address goes through steps 1 to 5 again from the start (including the allowed-host list). A redirect to `http:` or to another scheme is refused.
7.  **Limit the exchange.** Connect timeout 5 seconds, idle timeout 5 seconds, 15 seconds in total across all hops (an `AbortSignal`, so a slow server cannot hold the request). The request sends `Accept-Encoding: gzip`, no cookies, no authorisation header and no referrer, and a fixed `User-Agent` of `Hearthwise-calendar/1`. The body is streamed and counted; at 2 MB the request is aborted. Only `Content-Encoding` of `gzip` or none is accepted (`br` and `deflate` are refused). A gzip body is decompressed through a stream that stops at 2 MB of output, so a compressed bomb is stopped as well. The socket is destroyed on every redirect and every refusal.
8.  **Accept only a calendar.** Only status 200 is read. There are no conditional requests (`ETag`, `Last-Modified`): with at most 6 feeds a household the traffic saved is small, and a "not modified" answer would leave a snapshot whose window never slides. The content type is not trusted. After removing a byte-order mark and spaces, the body must start with `BEGIN:VCALENDAR`.
9.  **Return a code and no detail.** The text of an underlying error is never kept or logged, because Node's errors contain the host and the address.

**Codes.** The person sees one of nine, by this table (the internal value is what the logs hold):

| Internal | Cause | The person sees |
|---|---|---|
| `blocked_host` | scheme, host or path not allowed, or a redirect to an unlisted host | `not_https` for a non-https scheme, `bad_link` for an unparseable link, otherwise `not_supported` |
| `blocked_address`, `dns`, `connect`, `timeout`, `tls` | the resolved address is not allowed, or the connection failed | `unreachable` |
| `redirect` | more than 3 redirects, or a redirect with no usable location | `unreachable` |
| `status` | 401, 403, 404, 410 | `link_stopped` |
| `status` | 429, 5xx | `provider_busy` |
| `status` | any other status | `unreachable` |
| `not_calendar` | the body does not start with `BEGIN:VCALENDAR` | `not_calendar` |
| `parse` | the parser failed or was stopped | `not_calendar` |
| `too_big` | over 2 MB, or more than 3,000 events | `too_big` |
| `limit` | a rate limit or feed limit | `provider_busy` (and the add form says "Try again later") |

The nine user codes are: `ok`, `not_https`, `bad_link`, `not_supported`, `unreachable` `link_stopped`, `provider_busy`, `not_calendar` and `too_big`. The finer internal values let a person on call tell why a feed fails without seeing the link. No library error text is ever logged: both undici and `ical.js` errors can echo the address or file content.

**Why the network failures look the same.** Someone who can add feeds must not be able to use the form to map the server's network. Because only the four providers' own addresses are ever reached, there is little to map; a blocked address, a refused connection and a timeout all give `unreachable`, and no response body is ever returned to the person. The codes `link_stopped`, `provider_busy` and `not_calendar` tell the person what a provider's server answered, which is low in value to an attacker for these hosts.

**The link is a secret.**

*   It is sent once, in the body of `POST /api/hh/calendar/feeds`, never in a path or a query string, so API Gateway access logs (which log the path) do not hold it. The route handler never logs the body.
*   It is encrypted with AES-256-GCM before it is stored, with the household id, feed id and version as the additional authenticated data (so a ciphertext copied to another feed does not decrypt). The envelope carries a version field `v: 1`. Rotating the key is not supported in this phase: a new key means every person pastes their links again. The key is 32 random bytes, base64: SSM parameter `/hearthwise/calendar-key` on AWS (the parameter name is in the environment variable `CALENDAR_KEY_PARAMETER`, as `VAPID_PRIVATE_KEY_PARAMETER` names the push key), and in the container the environment variable `CALENDAR_KEY` or else the file `<dataDir>/calendar.key` (mode 0600), loaded as `loadVapid` loads its keys. If the key is missing, add and refresh answer a kind "Calendars are not set up on this server" and nothing crashes. The encrypted link is stored in a separate item (`CALSECRET#<feedId>`), so it is never returned with feed data. `store-cli backup` holds only the encrypted form, and the key file is not part of the backup (the self-hosting doc says to keep them apart: a backup restored to a new machine shows feeds as "Link needs to be added again" if the key is not copied).
*   The API role and the push role both read `/hearthwise/calendar-key`. The boundary in `infra/initialSetup/main.tf` already allows every parameter under `/hearthwise/`, so it does not change. What changes are the two role policies, `api_ssm` in `infra/api-lambda.tf` and `push_ssm` in `infra/push-lambda.tf`, which today name exactly one parameter each (the push key), plus the environment variable on both Lambdas. The infrastructure guard test currently asserts one parameter per role; it is changed to assert exactly these two, and no wildcard. This is a security decision recorded in `docs/DECISIONS.md`. The parameter is created by hand, like the push keys, with a line added to `docs/DEPLOYMENT.md`.
*   No route returns the link. The feed item holds `host` (for example `calendar.google.com`) for display, and the screen says "link hidden". To change a link a person pastes a new one. The other person never sees `host`.
*   It is never in the mutation queue or the query cache: adding or replacing a feed is not a queued mutation but one online request, and the persister's dehydrate step is tested to never hold it. If the person is offline the button says "Needs a signal". Write records for feed routes hold ids only.
*   It never reaches a log line. Log lines hold `feedId`, the outcome codes, bytes, event count and milliseconds.
*   The paste field is masked, with a "Show" switch, and has `autocomplete="off"`.
*   Removing a feed, removing the member who added it, or deleting the household deletes the feed, the encrypted link, the snapshot chunks and the index item at once. A rejected link is never echoed in a validation error, a 400 response or a write record.

**Limits on who can fetch.** The store has only exact-match conditions, so a counter works as a read, then a `patch` with `ifEquals` on the count just read, retried once, and refused if it loses twice. Adding or replacing a feed is limited to 10 attempts per person per hour (item PK `CALRATE`, SK `<userId>#<hour>`) and 60 per hour for the whole platform (SK `all#<hour>`), both with `expiresAt` 2 hours ahead. An add that finds its feed id already stored is a retry and is not charged. "Refresh now" is once per feed per 5 minutes (the same read-and-swap on `lastAttemptAt`). The platform holds at most 100 feeds (counted from the `CALFEEDS` index), and an add beyond that is refused with `limit`. Each Lambda instance runs at most 2 fetches at once. The hourly job claims each due feed before fetching it, works through feeds oldest first with 4 at a time, and stops when 15 seconds of the Lambda's time remain. After 5 failures in a row a feed is fetched every 6 hours instead of hourly; after 20 it is fetched only when a person asks.

**What it does not defend against.** A hostile server at one of the listed calendar addresses can see Hearthwise's egress address and the time of each fetch, and can return a hostile file (see the next section). Anyone with a Google or Microsoft account can publish a calendar there, and it is parsed like any other. Running the fetch inside the API and push Lambdas (see "Where fetching runs") means a flaw in the fetcher could reach the push signing key; Alternative P and Open Questions cover that choice.

### Reading a calendar file

`src/calendar/parseIcs.ts` takes the text and a window (`from`, `to`, `now`) and returns occurrences and counts of what it skipped. It runs after the fetcher has capped the body at 2 MB.

*   **A worker thread.** `ical.js` is synchronous, so a timeout in the same thread cannot stop it. The parse runs in a `worker_threads` worker with `resourceLimits` (128 MB old space) and a 5 second wall-clock limit enforced by `terminate()`. The worker is started with an empty environment (`env: {}`), is given only the text and the window, and returns plain data, so it never holds the Lambda credentials or the keys; it never loads SSM or the calendar key. The 2 MB input cap, not the memory limit, bounds memory outside the JavaScript heap. The parsing logic is in `src/calendar/parseCore.ts`, a plain function that the unit tests call directly (a worker cannot load a `.ts` file under the test runner); `src/calendar/parseWorker.ts` is a thin wrapper that calls it. The Lambda builds are plain `tsc` runs, so each build script adds `parseWorker.ts` to its `tsc` command, and a new build test starts the compiled worker from each output. A worker that is killed or runs out of memory gives the internal value `parse` (shown as `not_calendar`), and the feed keeps its last good snapshot.
*   **Caps before parsing.** At most 3,000 `BEGIN:VEVENT` lines, counted by a scan before `ical.js` sees the text. More gives `too_big`.
*   **Skip what cannot matter.** A one-off event that ended before the window starts is dropped as soon as it is read. `STATUS:CANCELLED` events are dropped. An event marked `TRANSP:TRANSPARENT` (shown as free) is kept and marked `free`.
*   **Repeat rules (RRULE, RDATE, EXDATE).** Each repeating event is expanded only inside the window (14 days back to 120 days ahead), in wall-clock time (the file's own date and time, with no zone applied), and each occurrence is then converted to an instant on its own with the zone rules below. A daily 09:00 event therefore stays at 09:00 across a clock change. `DTEND` or `DURATION` gives the length; a timed event with neither is zero length, and an all-day event with neither is one day. `UNTIL` in universal time is converted to wall-clock first. `RANGE=THISANDFUTURE` overrides are ignored and counted. Expansion is driven by our own loop around `ical.js`'s iterator: it counts every `next()` call, stops an event at 1,000 calls and the whole file at 20,000, so a rule that never matches (`BYSETPOS` with `BYDAY`) cannot spin. A frequency finer than daily (`SECONDLY`, `MINUTELY`, `HOURLY`) is skipped and counted. `COUNT` and `UNTIL` are honoured. `EXDATE` and `RECURRENCE-ID` overrides are applied (an override replaces its occurrence, and a cancelled override removes it). At most 2,000 occurrences per feed are kept; the nearest to today win, and the feed shows "Showing the nearest 2,000".
*   **Time zones.** The `VTIMEZONE` blocks inside the file are ignored (they are another thing a hostile file controls). For a time with a `TZID`: (1) an IANA name (Google, Apple, Proton) is converted with `Intl.DateTimeFormat`; (2) a Windows name (Outlook writes "W. Europe Standard Time") is looked up in the table in `src/calendar/windowsZones.ts` (about 140 names, from the Unicode CLDR list) and then converted; (3) anything else is read as a time in the household zone and the occurrence is marked `approx`. A time ending in `Z` is universal time. A time with no zone ("floating") is read in the household zone. Results are stored as an instant in milliseconds and shown in the household zone. An `approx` occurrence shows "Time may be an hour out" on the item itself, and the feed shows a count. The container image has full ICU data (`node:24-bookworm-slim`), and a test checks that `Intl` knows `Europe/London`, `America/New_York` and `Australia/Sydney`.
*   **All-day events** (`VALUE=DATE`) are dates, not instants. They are stored as `allDay: true` with `startOn` and an inclusive `endOn` (the file's end date is exclusive, so one day is taken off). They are never converted between zones, so an all-day birthday stays on its date.
*   **Text.** Titles are stripped of control characters, bidirectional-override characters and zero-width or format characters (U+200B to U+200F, U+2060, U+FEFF), and cut to 120 characters. They are only ever rendered as text. Nothing else from the event (description, location, attendees, links, attachments) is stored. A missing title becomes "Busy" for feeds that show details.
*   **Failure.** If parsing fails the feed keeps its last good snapshot and records the outcome. A failure never blanks a feed.

A hostile-file test set is checked in: nested folding, thousands of events with expansion rules, a rule that never matches, a billion-occurrence `COUNT`, a huge `RDATE` list, a one-line 2 MB file, a huge `DTSTART`, a bad `TZID`, a byte-order mark and control characters in titles. Each is parsed through the worker. The pass condition is that the worker returns a result or is terminated by its own 5 second limit (the test asserts the outcome, not the elapsed time, so it is not flaky), and that the test process keeps running and can parse a good file next. London fixtures for 2026-03-29 and 2026-10-25 cover imported events as well as typed ones.

### Where fetching runs

*   **Add, replace and "Refresh now"**: the API Lambda. They answer with the feed's state, not with events.
*   **The hourly refresh**: `runCalendarRefresh(store, now, deadlineMs)` in `src/calendar/refresh.ts`, called from the push Lambda's hourly invocation (`push-handler.ts` passes the time left from the Lambda context) and from the container's hourly maintenance tick, after `runSchedule`. It queries the `CALFEEDS` index partition (see Snapshots), takes feeds whose `nextFetchAt` has passed, claims each with the read-and-swap on `lastAttemptAt` before fetching (so two runs never fetch one feed), and fetches them 4 at a time until 15 seconds of the Lambda's time remain. A feed whose household or owner no longer exists is deleted from the index. The push Lambda has 120 seconds, and `runSchedule` runs first, so its own time is not budgeted; the refresh uses what is left, and an unrefreshed feed is picked up on the next hour.
*   **Memory.** The push Lambda's memory goes from 256 to 512 MB for the parser, a change in `infra/push-lambda.tf` made in step 4 (with the key). A failure for one feed never stops the rest. Each run logs one summary line of counts.
*   The three build scripts (`scripts/build-api-handler.cjs`, `build-push-handler.cjs`, `build-container.cjs`) each write a `package.json` of runtime dependencies into their output and run `npm install`. `ical.js` is added to all three, with an exact version (a change from the caret ranges used there today). It is not added to the app bundle, and `build-store-cli.cjs` must not import the parser (the `calendar-feeds` command reads stored state only). The container's `Dockerfile` copies the built folder as it is, so it does not change. New build tests require `ical.js` and start the compiled worker from each output, and `scripts/container-smoke.mjs` gains a step that parses a fixture in the built image, so a missing module fails the build, not the first refresh.

### Snapshots

A feed's occurrences are stored apart from the feed item so a read of the feed list stays small.

| Item | PK | SK | Attributes |
|---|---|---|---|
| Feed | `HH#<hid>` | `CALFEED#<feedId>` | `label` (1 to 60), `ownerId`, `host`, `share` (`busy` or `details`), `status` (a code), `lastOutcome` (the internal enum), `fetchedAt`, `lastAttemptAt`, `lastGoodAt`, `nextFetchAt`, `consecutiveFailures`, `eventCount`, `skippedCount`, `approxCount`, `etag`, `lastModified`, `snapshotId`, `createdAt` |
| Secret | `HH#<hid>` | `CALSECRET#<feedId>` | `v`, `iv`, `tag`, `data` (the encrypted link) |
| Snapshot chunk | `HH#<hid>` | `CALSNAP#<feedId>#<snapshotId>#<yyyy-mm>` | One chunk for each month that has occurrences (an occurrence is in the month it starts). `items`: an array of `[startMs, endMs, flags, title]` (flags: all-day, free, approx), or `[startOn, endOn, flags, title]` for all-day; `expiresAt` |
| Feed index | `CALFEEDS` | `<hid>#<feedId>` | `nextFetchAt` |
| Rate counter | `CALRATE` | `<userId>#<hour>` or `all#<hour>` | `count`, `expiresAt` |
| Reminder claim | `HH#<hid>` | `REMIND#<eventId>#<date>#<from>#<minutes>#<userId>` | `instant`, `rule`, `expiresAt` |

A refresh writes the new chunks, then updates the feed item with the new `snapshotId` under `ifEquals` on the old one, then deletes the old chunks. Chunks are by month so a read of a 62-day window touches at most 3 of them, and each stays small (2,000 occurrences over 4.5 months is at most a few hundred a month, an estimate of 100 KB or less a chunk at about 200 bytes an occurrence, well under the 400 KB item limit). Chunks carry `expiresAt` 150 days ahead: the live snapshot of a feed that has stopped refreshing stays until the feed is removed, and a chunk left by a crash between steps (never read, because no feed names its `snapshotId`) is cleared by the store's expiry. A read gets the feed's `snapshotId`, queries the chunks for the months it needs with that id only, then reads the feed item again and retries once if the `snapshotId` changed, so a half-written refresh is never read. Reads also ignore any chunk whose `expiresAt` has passed, because expiry in the store can lag. A failed refresh does not touch the snapshot.

The index partition `CALFEEDS` is the way the refresh job finds feeds without scanning: it is queried by its key, as `PUSHIDX` is for subscriptions. With 6 feeds per household it stays small. The push role already has `Query` on the table, so no new permission is needed, and the contract tests cover the access on DynamoDB, SQLite and the memory store.

"Updated {time}" is `fetchedAt`, set by the server, not by the device clock.

A snapshot is 14 days back to 120 days ahead and is replaced at each successful refresh, so the window slides. A feed that has stopped refreshing keeps showing its last events with "Last updated {n} days ago", and a day outside its snapshot shows "Not in this calendar's last update".

The household-move check in `src/household/invites.ts` (`moveOptions`) gains `CALFEED#` and `EVENT#` (and its comment is updated), so a person who holds only a feed or an event does not look like an empty household. `removeMember` (`src/household/members.ts`) is today one fixed transaction of three operations, and there is no household delete and no way to leave voluntarily: only the household's creator can remove the other person. Removing a person's calendar data can touch more items than one DynamoDB transaction allows (up to 3 feeds with their secrets, chunks and index items, up to 500 events, and reminder entries), so it runs after the removal as a bounded sequence of deletes, retried by the hourly refresh (which deletes any feed whose owner is no longer a member). Until it finishes, every read leaves out a feed whose owner is not a current member, and the routes project private events of a non-member as hidden. `store-cli backup` copies the whole SQLite file, so it needs no prefix list.

### Limits

| Limit | Value |
|---|---|
| Feeds | 6 per household, 3 per person, 100 on the platform |
| Link length | 2,000 characters |
| Download | 2 MB, and 2 MB after decompression |
| Time | 5 s connect, 5 s idle, 15 s in total; parse 5 s |
| Redirects | 3 |
| Events in a file | 3,000 |
| Occurrences per feed | 2,000, in a window of 14 days back and 120 days ahead, stored by month |
| Title | 120 characters imported, 80 typed |
| Typed events | 500 live per household; notes 500 characters; place 80 |
| Reminders | 3 per person per event; 30 events with reminders per person |
| Feed add or replace | 10 per person per hour, 60 on the platform per hour |
| Manual refresh | 1 per feed per 5 minutes |
| Hourly job | 4 feeds at a time, until 15 seconds of the Lambda's time remain |
| Imported window read | 62 days |
| Deleted events listed | 50 newest |

### Events (typed into Hearthwise)

| Item | PK | SK | Attributes |
|---|---|---|---|
| Event | `HH#<hid>` | `EVENT#<id>` | `kind`, `title`, `place?`, `notes?`, `who`, `private`, `startOn`, `allDay`, `startTime?`, `durationMin?`, `endOn?` (all-day, inclusive), `repeat`, `repeatEndsOn?`, `skipOn[]`, `reminders` (a map from user id to up to 3 `{from, minutes}`), `fieldTimes`, `createdBy`, `createdAt`, `updatedAt`, `updatedBy`, `deletedAt?`, `deletedBy?`, `expiresAt?` |
| Reminder index | `CALREM` | `<hid>` | `updatedAt`. One item per household with at least one reminder. |

*   `kind`: `event` or `block`. `who`: a user id or `both` (the validator rejects `either`, which tasks allow), so the page can say whose it is. `private`: a boolean. Only the creator may set or clear `private`, and a private event has `who` equal to its creator. `place` is the "where" in "who is where": a short text such as "Dentist" or "Home". Imported events have no place.
*   `title` 1 to 80 characters, `place` up to 80, `notes` up to 500.
*   A timed event has `startTime` (`HH:MM`) and `durationMin` (1 to 1,440). Its end is the start plus the minutes **on the wall clock**. It is not adjusted when the clocks change: a block that runs "480 minutes from 23:00" ends at 07:00 on the wall clock every night, even on a night that is 7 or 9 hours long. An event that ends after midnight belongs to the day it starts on; the day view shows it there as "23:00 to 07:00 (next day)". An all-day event has `endOn` on or after `startOn`, up to 31 days.
*   `repeat` is the `Repeat` type in `src/shared/schedule.ts`: `none` or `fixed`, with `every` from 1 to 52 and the unit day, week or month (so there is no yearly repeat). `after` (a repeat counted from completion) is refused for events. A `fixed` rule carries its own `startOn`; the event's `startOn` is the authoritative one, and the validator requires them to be equal on every write to the schedule group. A month rule on day 31 uses the last day of a shorter month, as chores do. `repeatEndsOn` ends the repeat. `skipOn` holds up to 50 dates to leave out ("Skip this day"). Last-weekday-of-month and "third Thursday" are not offered (Future Improvements).
*   `fieldTimes` has keys `title`, `place`, `notes`, `schedule` and `people`. The schedule group is `startOn`, `allDay`, `startTime`, `durationMin`, `endOn`, `repeat`, `repeatEndsOn`, `skipOn`, and it changes together: a write to a group applies only if its time is newer, so two people's edits never mix into a time nobody chose. The people group is `who` and `private`. This is per-field last-writer-wins as for recipes, with a whole group as the unit (a lost edit is a wrong appointment time, not a wrong amount, so a refused-edit step as in phase 3 is not used). A write to a private event by anyone but its creator is refused, also when it replays from a queue.
*   `reminders` holds, for each person, `{ savedAt, list }`. It is written only by `PUT /calendar/{id}/reminders` and only for the caller's own user id, so it is never in a group and two people's offline reminder edits cannot overwrite each other. Either person may set reminders on a non-private event, including one that is `who` the other person; only the creator may on a private one (403 `private`). A response holds only the caller's own entry. Saving a reminder sets the `CALREM` item. Nothing deletes `CALREM` on a write: the reminder job deletes it, with `ifEquals` on its `updatedAt`, when it finds the household has no reminders, so a person removing their last reminder cannot race another person adding one. Making an event private, in the same write, removes every other member's entry from `reminders`.
*   `expiresAt`: a one-off event gets its end date plus 400 days (a year of history, as completion records keep, plus a margin). A repeating event has none. A deleted event gets `deletedAt` plus 30 days. At most 500 live events.
*   When the household's creator removes the other member: that member's feeds, their private events and their entries in `reminders` are deleted by the bounded cleanup described in "Snapshots". Shared events they made stay.
*   The household's time zone is read from `household.timezone`. If it is changed, every event keeps its wall-clock time, so its real moment shifts.

**Shared repeat expansion.** `src/shared/schedule.ts` gains `occurrencesBetween(repeat, from, to, limit)`, which returns the dates a `fixed` rule gives in a window by testing each day with `occursOn` (a private function today that the step exports). The window is at most 400 days and the result at most 500 dates, and a result cut at the limit is flagged `truncated`, so an event cannot expand without bound, and the day search that `firstOnOrAfter` does is not used. `src/shared/calendar.ts` holds `occurrencesOf(event, from, to)`, which applies `skipOn`, `repeatEndsOn` and the all-day span. It looks back 31 days for a multi-day event and 1 day for an overnight one, so an item that started earlier and is still running is found. `parseRepeat` in `src/shared/taskValidation.ts` is reused for the rule, with `after` refused.

**Wall-clock to instant.** `src/shared/zoned.ts` holds `zonedInstant(day, hhmm, timeZone)`, with minute accuracy (the existing `localMoment` is by the hour). A time that does not exist (spring forward) gives the first instant after the gap. A time that happens twice (fall back) gives the first one. It is the algorithm of the reminder job and of "Now and next" (comparing a time with the clock), and is tested on both clock-change days. The day view itself never converts. It is minute-accurate: it starts from the wall-clock minute, finds the zone's offset with `Intl.DateTimeFormat` at that instant and the instants an hour either side, and chooses by the two rules above.

### Privacy: what each person receives

All privacy rules are applied by one function, `projectFor(viewer, ...)` in `src/calendar/project.ts`, which is plain shared code (`src/` is imported by the app, as the overlays import the write rules). Its output types are `EventView` (the full event for the viewer), `BusyView` (the shape in the table) and `ImportedView`. Every route, the reminder job and the client overlay read events through it. Nothing else reads a raw event.

| Thing | The person who made it sees | The other person sees | Who can change or delete it |
|---|---|---|---|
| Event, not private | Everything | Everything | Either person |
| Event, private | Everything | `{ id, busy: true, owner, startOn, allDay, startTime, durationMin, endOn, repeat, repeatEndsOn, skipOn }`: the creator's name (`owner`, from `createdBy`), the times and the repeat rule (needed to place it on the days), and "Busy". No title, place, notes, `who`, kind or reminders. | The creator only (403 `private` for anyone else, also on replay) |
| Imported occurrence, feed "show details" | Title, start, end | Title, start, end | The feed's owner (the feed, not single events) |
| Imported occurrence, feed "busy only" | Title, start, end | Start, end and "Busy". Not sent if the occurrence is free. | The feed's owner |
| A feed | Label, host, status, last updated, counts, "busy only" or "details" | Owner, status, last updated, "busy only" or "details", and the label only if the feed shows details (otherwise "{owner}'s calendar", because a label can be private). No host. | The owner (rename, change visibility, replace link, remove) |
| Reminders on an event | Their own | None (never the other's) | Each person, their own only |

*   "Private" and "busy only" are two settings of the same idea: a private event hides one event, "busy only" hides a whole feed. On the add sheet, "Private" reads "Only you can see the details. {name} sees that you are busy." On a feed, "Busy only" reads the same.
*   A person can mark their own feed busy-only without the other's say. The other person sees that the feed exists (its label and owner) but not what is in it.
*   `reminders` in a response holds only the caller's own entry.
*   A calendar push to the other person never holds a title: "{name} added an event" or "{name} changed an event". A private event sends no push to the other person at all, whatever was ticked. Held pushes therefore never hold private text. A person's own reminder holds the event's title, but the reminder job builds its text through `projectFor` for that person, so a person who is not allowed to see a title (a private event made private after they set a reminder) gets nothing: their entry is also removed in the write that made it private, and a test sets a reminder as the other person, makes the event private, advances the clock and asserts no push.
*   A write record for a calendar write stores only ids. A retry re-reads the event and projects it for the caller, so a record never holds text that another person could be given. A queued write by a non-creator to an event that has since become private is refused with 403 `private`; the app shows it in the pending list as "Not saved: this event is now private" and drops it.
*   A test checks that a sentinel title in a private event, a busy feed and another person's reminder never appears in the other member's response from any route, in the logs, in a push, or in a held push, and that the app's overlay applies the same projection.

A person's saved cache can hold a copy of an event for up to 7 days. The app replaces cached events wholesale on every fetch, so if the creator makes an event private the other phone's copy is gone at the next poll (10 seconds online). Offline, the old copy stays until then. This is accepted and stated in "Risks". It also holds for a feed changed to "busy only".

### API routes (phase 4)

| Method and path | Purpose |
|---|---|
| `GET /api/hh/calendar` | Live events (projected for the caller), and the 50 newest deleted ones the caller made |
| `PUT /api/hh/calendar/{id}` | Create or edit an event or block |
| `DELETE /api/hh/calendar/{id}` | Delete (a tombstone) |
| `PUT /api/hh/calendar/{id}/reminders` | Set the caller's own reminders on an event |
| `GET /api/hh/calendar/imported?from=&to=` | Imported occurrences in the window (at most 62 days), projected for the caller |
| `GET /api/hh/calendar/feeds` | Feed state: label, owner, share, status, last updated, counts |
| `POST /api/hh/calendar/feeds` | Add a feed: the link, a label and `share`. Not queued. |
| `POST /api/hh/calendar/feeds/{id}/replace` | Replace the link. Not queued. |
| `PATCH /api/hh/calendar/feeds/{id}` | Change the label or `share`. Owner only. |
| `POST /api/hh/calendar/feeds/{id}/refresh` | Fetch now (once per 5 minutes) |
| `DELETE /api/hh/calendar/feeds/{id}` | Remove the feed. Owner only. |
| `POST /api/hh/restore` | Gains `{ kind: 'event' }` |

Every route is wrapped in `withHousehold` and `guarded` (`guarded` is the wrapper in `src/api` that turns a thrown `TaskError` into a status and code), validated by `src/shared/calendarValidation.ts`, and rejects unknown keys. Domain refusals are thrown as `TaskError` with these codes: 403 `private`, 403 `not_owner` (a feed route by someone who is not its owner), 404 `not_found`, 409 `event_limit` (500 live events, also on restore), 409 `reminder_limit` (3 per event, 30 events), 409 `feed_limit`, 429 `slow_down` (a rate limit), 503 `calendar_key_missing`.

**Event routes** carry the envelope (`mutationId`, `clientAt`, `notify`) and run through `withWriteRecord`. **Feed routes** are online only and never queued, because the link must not be saved on the device: add and replace carry a client-made feed id (a retry of an id already stored answers the stored state, ignores the body, and is not charged against a rate limit), `PATCH`, `DELETE` and "Refresh now" carry only a `mutationId`, and none of them carries `clientAt` or `notify`.

| Route | Body, in addition to the envelope | Answer |
|---|---|---|
| `PUT /calendar/{id}` | create: `kind`, `title`, `place?`, `notes?`, `who`, `private`, the schedule group, with `titleAt`, `placeAt`, `notesAt`, `scheduleAt`, `peopleAt` (client times for the field groups). Edit: any group with its time. | `{ event }` |
| `PUT /calendar/{id}/reminders` | `list` (up to 3 of `{ from, minutes }`) | `{ event }` |
| `GET /calendar` | none | `{ events, deleted, serverTime }` |
| `GET /calendar/imported?from=&to=` | none | `{ occurrences, feeds, serverTime }` |
| `POST /calendar/feeds` | `id`, `link`, `label`, `share` | `{ feed }` |
| `POST /calendar/feeds/{id}/replace` | `link` | `{ feed }` |
| `PATCH /calendar/feeds/{id}` | `label?`, `share?` | `{ feed }` |
| `POST /calendar/feeds/{id}/refresh` | none | `{ feed }` |
| `POST /restore` `{ kind: 'event' }` | `entries` of `{ kind: 'event', id, deletedAt }` | `{ results }` |

A restored event is refused if it would pass 500 live events (`event_limit`), and only its creator can restore a private one. The list of deleted events holds the 50 newest the caller may see (a non-private event of either person, and the caller's own private ones), as recipes list theirs (`DELETED_LISTED` in `src/meals/recipes.ts`). The `RestoreEntry` union and `parseRestoreBody` in `src/shared/taskValidation.ts` gain `event`, and `RestoreStatus` gains `event_limit`.

`notify` on an event write sends the other person a push of the kind in "Privacy" ("{name} added an event", "{name} changed an event"), which opens `/plan/calendar`, and nothing at all for a private event. The write bodies allow `notify` through `ENVELOPE_KEYS`.

The app's page is `/plan/calendar` (a file route `app/routes/plan.calendar.tsx`), so the Plan tab stays highlighted, because the tab matches on the start of the path.

### Reminders

*   Each person sets reminders from an event: up to 3 of `{ from: 'start', minutes }` with minutes 0, 5, 10, 15, 30, 60, 120 or 1,440, plus, for blocks only, `{ from: 'end', minutes: 0 }` ("at the end", the prompt for the next change of activity). The minutes are elapsed time before the instant of the start, so across a clock change "60 minutes before" is 60 real minutes. A person may have reminders on at most 30 events. The sheet says "about", and that the reminder is sent even in quiet hours. It shows "This reminder time has already passed" when the chosen instant is in the past.
*   A job, `runReminders(store, sender, now)` in `src/calendar/reminders.ts`, runs every 5 minutes. On AWS it is a second EventBridge rule (`rate(5 minutes)`) on the push Lambda with the input `{ "job": "reminders" }`, and it has its own `aws_lambda_permission` (the existing permission names only the hourly rule). `push-handler.ts` takes no input today and the existing rule sends none, so the handler treats a missing `job` as the hourly job (`runSchedule` then `runCalendarRefresh`), `{ "job": "reminders" }` as `runReminders` only, and any other value as nothing. A run of one kind never does the other's work, so digests and nudges are never sent twice. The new target has its own `aws_lambda_permission` with its own `statement_id` and `source_arn`. In the container, `MaintenanceDeps` (`container/maintenance.ts`) gains `runReminders` and `runCalendarRefresh`, `container/server.ts` wires them next to `runScheduler` (line 132 today), `startMaintenance` starts a second 5-minute interval beside the hourly one, `stop()` clears both, and both use the same `attemptAsync` failure isolation. The container loads the calendar key where it loads the push keys. Timers start at boot, not on the hour, which the 15-minute catch-up and the claims absorb.
*   **Finding what is due.** It queries the `CALREM` partition (one item per household that has reminders; `CALREM` and `CALFEEDS` are exported from one `keys.ts`, as `PUSH_INDEX_PK` is), and intersects with the people who have a push subscription (`listSubscribedUsers`, read once per run). A person without push gets no reminder, and the sheet says so with a link to Settings. Entries stay if a subscription is removed and send again if it is turned back on. For each such household it loads the household and queries `EVENT#` once. A household with no reminders is not read at all. The cost is one small query per run plus one read per household with reminders, which is accepted.
*   For each event it expands the occurrences for yesterday to tomorrow (in the household zone), computes each reminder instant from the wall-clock time with `zonedInstant`, and picks those in `(now - 15 minutes, now]`. The 15 minutes is the catch-up: a run that was missed or late still sends, and a reminder older than that is skipped, so an outage never produces a storm of old warnings. A reminder is sent only if its instant is at or after the person's `savedAt` for that list, so an event created or edited, or a write replayed from a queue, after the reminder's moment never sends a late warning for it.
*   **At most once.** The claim is a put-if-absent of the item `REMIND#<eventId>#<occurrenceDate>#<from>#<minutes>#<userId>` (partition `HH#<hid>`, `expiresAt` 2 days ahead), made before the send, and the send happens only if the claim succeeded, as the digest claim in `src/push/scheduler.ts` works. A lost send is not retried. This is the same trade as digests (a missed reminder is better than a repeated one). The key holds the occurrence's wall-clock date and not its time, so a time moved after a reminder was sent does not send a second one that day (accepted), and a fall-back repeated hour cannot make two keys. For an overnight block the date is the day it starts, and the window above is applied to the instant. The claim also records the computed instant and the rule used (`normal`, `gap_forward`, `first_of_two`), for debugging.
*   It does not send for a deleted event or for a person who is no longer a member.
*   **The clock change.** For a time inside the spring-forward gap (01:30 on 29 March 2026 in London) the reminder goes at the first moment after the gap. For a time that happens twice (01:30 on 25 October 2026) it goes once, at the first. A person in another zone has no special case, because the household zone is the only one used.
*   Text: title "{title} starts in {n} minutes", "{title} is starting" or "{title} ends now" (for the end of a block), with no body. It opens `/plan/calendar`. The title is the person's own, including for a private event. The lock screen shows it, and the sheet says so. There is no cap on the number per day beyond the 3 per event and 30 events.
*   Reminders are sent even in the person's quiet hours (see Open Questions). Imported events have no reminders.
*   Each run logs one summary line: households read, reminders due, claimed, sent, skipped as stale, and failed. Each send logs the event id, the occurrence date and an outcome, never the title.
*   One-shot EventBridge Scheduler entries for each reminder are not used (Alternative Q).

### Timeline

`src/shared/timeline.ts` holds `buildTimeline(day, inputs, viewer)`, a pure function used by the app's day and week views and by the Now and next strip. Its inputs are the caller's projected events, the imported occurrences for the day, the open tasks due that day, the plan's dinner for that day, and the household's members.

*   Items are timed (events, blocks, imported with times) or all-day (all-day events, imported all-day events, tasks due, the dinner). All-day items go in a strip at the top. Timed items are sorted by start, then by who.
*   Every item says who it is for as text ("Sam", "Alex", "Both"). Direction and state are never shown by colour alone. Busy items read "Busy".
*   A task shows as "Due: {title}" with its assignee, and opens the task. It appears on its due date only. Earlier due tasks stay on Today as they do now. A dinner shows as "Dinner: {title}" and opens the plan.
*   "Now and next": given the current wall-clock time in the household zone, "Now" is the timed item in progress for the viewer (or for both), and "Next" is the next one that starts today. If nothing is left it says "Nothing more today".
*   Overlapping items are listed in start order, one after another, never drawn side by side. An overnight event shows on the day it starts. Dates and times are read from the household zone with `dayInZone`, and "Now" is compared with `zonedInstant`. If the device's zone differs from the household's, the page says "Times are shown in {zone name}".

### Sync, offline and cache

*   The timeline is built from four sources that each keep their own cache and poll: events (this route), tasks and the plan (already polled), and the imported window. Each source's age is known, and imported items show their feed's "Updated {time}". `GET /api/hh/calendar` is polled every 10 seconds while the app is visible, like tasks and the plan; it is small (typically a few dozen events). It returns definitions, not occurrences, so the app expands them with the shared function.
*   `GET /calendar/imported` is fetched per window: the app prefetches today minus 7 days to today plus 35 days (42 days, inside the 62-day route limit), refetches on focus and every 5 minutes, and saves each window in the persisted cache. Offline, a day inside a saved window shows; a day outside shows "Not saved for offline yet".
*   Event writes are registered once in `app/lib/mutations.ts` through a keys file `app/lib/calendarKeys.ts` (as `moneyKeys.ts` and `recipeKeys.ts` are) as `calendarMutationKeys`: `createEvent`, `editEvent`, `deleteEvent`, `setReminders` and `eventRestore`. They run in the `household` scope and are replayed after a restart. Each has an overlay in `app/lib/calendarOverlay.ts` that applies the same rule as the server (`src/calendar/applyEvent.ts`) to pending writes, because the mutation-registry test requires one for every kind. There are no feed keys: feed routes are online only.
*   Add feed, replace link and "Refresh now" are not queued. The link must not be saved in IndexedDB.
*   Sign-out already clears the whole query cache, the mutation cache and the saved copy (`signOutCleanup`), so new keys need nothing there. The cache version stays 1.

### Views

*   **Calendar page** (`/plan/calendar`), under the Plan tab. A two-option switch at the top of the Plan tab, "Dinners | Calendar", moves between the meal plan and the calendar; the calendar's own switch "Day | Week" opens on Day. Today's "Now and next" strip and each dinner and task row link in. A day view (the default) and a week view. The week view lists seven days as rows, not a grid, so it works at 360 px and at the largest text size.
*   **Add or edit sheet**: kind, title, who, date, all-day, start time, length, repeat (the chore form's repeat control), "Ends on", private, "Let them know", and reminders for the person.
*   **Calendars sheet**: the feeds with label, owner, "busy only" or "details", last updated and status, and Add, Replace link, Refresh now and Remove. The Add form has short steps for each provider ("In Google Calendar: Settings, your calendar, Integrate calendar, Secret address in iCal format").
*   **Today**: a "Now and next" strip. It links to the calendar.
*   **Deleted page**: gains an Events group.

### Wording

A copy table in `app/lib/calendarText.ts`, pinned by the wording test, covers the statuses and errors. Examples:

| State | Text |
|---|---|
| `ok` | "Updated {n} minutes ago" |
| `not_supported` | "We can read links from Google, Outlook, Apple and Proton calendars." |
| `bad_link` | "That does not look like a link. Copy the whole address from the calendar's sharing settings." |
| `unreachable` | "We could not read that link. Check that you copied the whole address from the calendar's sharing settings." |
| `link_stopped` | "The link stopped working. You may need a new one from {provider}." |
| `provider_busy` | "{provider} did not answer. We will try again soon." |
| `not_calendar` | "That address did not give us a calendar." |
| `too_big` | "That calendar is too big for us to read." |
| `not_https` | "We need a link that starts with https:// or webcal://." |
| Slow provider | "Google can take many hours to show changes on its links." |
| Stale | "Last updated {n} minutes ago", "{n} hours ago" or "{n} days ago" (one pattern for every state) |
| Other strings | "1 event repeats too often to show"; "Showing the nearest 2,000"; "Needs a signal"; "Link needs to be added again"; "Calendars are not set up on this server"; "Not in this calendar's last update"; "Not saved for offline yet"; "Time may be an hour out"; "Try again later" |
| Private | "Only you can see the details. {name} sees that you are busy." (the one source for this text; the add sheet and the feed form use it) |

There is no red and no "failed", "error" or "overdue". A feed that is stale shows its last-updated time in plain words.

### Logging and checking

*   Each fetch logs `{ event: 'calendar_fetch', householdId, feedId, outcome, userCode, bytes, events, skipped, ms }`, where `outcome` is the internal enum and `userCode` the nine-code value. It never holds a link, a host, a title, a place or a name, and it never holds the text of a library error: only the error's name.
*   A refused link logs `{ event: 'calendar_link_refused', householdId, feedId, outcome }` and no more. It does not use `emitSecurityEvent`, whose event types are a closed list and which sends one email per event, so a hostile person could send the author an email for each refused link.
*   The hourly refresh and the reminder run each log one summary line (see above). There are no alarms on them yet (Future Improvements), so a stopped job is visible only by reading the logs or by `calendar-feeds`.
*   A test checks the log output of every fetch outcome, the parser failures and the reminder runs for a sentinel link, host and title.
*   `yarn store-cli calendar-feeds <householdId>` prints each feed's `status`, `lastOutcome`, `consecutiveFailures`, `fetchedAt`, `nextFetchAt` and counts, with no link. It writes nothing. The existing `backup` holds the encrypted link only.

## Alternatives Considered

### Alternative A: Sign in to each provider (OAuth)

Rejected by the author: no sign-in, read-only links only. It would also need an app registration with each provider.

### Alternative B: Fetch the link in the browser

Rejected. Most calendar servers do not send the headers a browser needs (CORS). The link would pass through the browser's saved data and the persisted cache. A server fetch can also be limited and logged without the link.

### Alternative C: Fetch on every page view

Rejected. It is slow, providers limit it, and every 10-second poll would become an outbound request.

### Alternative D: Store the raw file and parse on read

Rejected. A hostile file would be parsed again on every read, and the whole file would be stored.

### Alternative E: Store imported repeating events as rules

Rejected. Expansion bombs would reach the phone. Occurrences in a bounded window are stored.

### Alternative F: Reuse the hourly scheduler for reminders

Rejected. A "10 minutes before" reminder cannot be sent by a job that runs on the hour. Changing the existing rule to every 5 minutes was also considered. It would make the digest and nudge code load every subscribed person's tasks 288 times a day, so a separate job on its own index is used.

### Alternative G: The creator sets reminders for both people

Rejected. It would notify the other person without their own choice, which the app has promised not to do. A "remind us both" tick was considered as a form of "Let them know". Per-person reminders cost only a per-person map, so the stricter rule is kept.

### Alternative H: A seventh tab

Rejected. Six tabs already strain a 360 px screen at the largest text size.

### Alternative I: Write a calendar parser

Rejected. Line folding, time zones and repeat rules are covered by `ical.js`, and a hand-made parser is a second thing to test against hostile files.

### Alternative J: Send every field and hide it in the app

Rejected. The hidden title would sit in the other phone's saved cache. The server sends nothing it should not.

### Alternative K: Allow any https host, or home-network hosts

Rejected for this phase. Any-host fetching is the open-proxy form of the risk. The allowed list matches the author's four providers and leaves the address checks as a second layer. Self-hosters with a Nextcloud or NAS calendar can add exact host names with `CALENDAR_EXTRA_HOSTS`, which then still passes the address checks. Private addresses stay blocked, so a calendar on the home network is not reachable. Allowing a private address for a named host is a later, separate decision.

### Alternative L: Edit one occurrence of a repeating event

Rejected for this phase. "Skip this day" covers the common case. Moving one occurrence needs an exceptions model.

### Alternative M: Parse in the request thread

Rejected. `ical.js` is synchronous, so a time limit cannot interrupt it. A worker thread with a time and memory limit is used.

### Alternative N: Store the timeline, or merge it on the server

Rejected. A stored or server-merged timeline is a second source of truth for tasks, the plan and events, and would need a combined offline cache. Each source keeps its own cache and the device combines them.

### Alternative O: Store all times as universal-time instants

Rejected for Hearthwise events. "Every day at 21:30" would move by an hour across a clock change. Imported events are instants because their providers send them that way.

### Alternative P: A separate fetcher Lambda with its own role

Not taken. It would hold only the table prefixes it needs, not the push key, which limits the damage of a mistake. It adds a function, a role, a log group, a boundary change and a hand-off between the API and the fetcher, and the container has no such split. The allowed-host list, the address checks and the worker thread are the controls. Listed in Open Questions.

### Alternative Q: One scheduled entry for each reminder (EventBridge Scheduler)

Rejected. It would need an entry created, changed and removed on every event edit and every repeat, a new service permission in the boundary, and nothing similar exists in the container.

### Alternative R: Reject an event whose time zone cannot be read

Rejected. A calendar with one odd event would show nothing. The event is shown in the household zone with "Time may be an hour out" on the item.

### Alternative S: Ship typed events only and leave import to a later phase

Considered because the import is about half the work and nearly all the risk. Rejected because the author asked for it. The build order (typed events first, fetcher last) keeps the option: the household has a working calendar after step 3 and import is a separate, gated block of three steps.

## Non-Functional Requirements

*   **Security.** The fetcher is the only module that makes outbound requests to a person's address. A test (`src/calendar/__tests__/noOtherFetch.test.ts`) fails if any file in `src` other than the fetcher imports `https`, `http`, `net`, `undici` or uses `fetch`. All rules in "Fetching a link" have a test, including each blocked range, address forms, redirect to a blocked address, rebinding, oversize and compressed bombs, and no secret in logs, responses or the queue.
*   **Correctness.** Pure functions for expansion, time zones and the timeline, with property tests: any order of the same events gives the same timeline; expansion never exceeds its limit; a repeat rule's occurrences match the `occursOn` rule.
*   **Time.** Tests run on 2026-03-29 and 2026-10-25 (London) and on a zone with no daylight saving.
*   **Offline.** Saved windows are readable offline, and writes queue and replay once.
*   **Privacy.** No hidden text reaches another person's response, cache, push or log.
*   **Accessibility.** Every new route passes the axe check. State is in words. Every control is at least 44 px. The week view is a list.
*   **Performance.** 500 events is about 300 KB in one list. The feed list and the imported window are fetched at most every 5 minutes. The reminder job reads one small partition per run and nothing for a household with no reminders.
*   **Cost.** Two scheduled rules. About 8,640 five-minute runs a month (288 a day for 30 days), each short. The push Lambda's memory doubles to 512 MB. Neither is expected to change the bill noticeably, and the first month's bill is checked.
*   **Isolation.** All keys are under `HH#<hid>`. Nothing points at Hoardwise.

## Risks and Mitigations

| Risk | Effect | Mitigation |
|---|---|---|
| The fetcher is used to reach an internal address | Credentials or internal services exposed | An allowed list of four providers' hosts, then the address rules, pinned connection, per-hop checks, a single fetch module, rate limits, no VPC, and tests for each rule. |
| The link leaks | Someone reads a calendar | Encrypted at rest, never logged, never in a URL path, the queue or the cache, masked in the app, deleted with the feed. The person can make a new link at the provider. |
| A hostile ICS file | The Lambda runs out of time or memory | Size and event caps before parsing, a worker thread with time and memory limits, expansion bounded by our own counter, a hostile-file test set. |
| The fetch holds an API request | A slow host ties up an API slot for up to 15 s | Allowed hosts only, 10 adds an hour per person, 5-minute refresh limit. |
| A wrong time | A person misses an appointment | Wall-clock storage for Hearthwise events, a tested conversion for reminders, "Time may be an hour out" on the item for an imported time that could not be read. |
| A private title reaches the other phone | Privacy broken | One projection function, the sentinel test over every route, push and log, no push about a private event. |
| A flipped event stays in the other phone's cache | The other person sees the old text offline until the next poll | Wholesale replacement at each fetch. Accepted and stated. |
| A provider's link is slow to update | Stale events | "Updated {time}" and a note about slow providers. |
| Proton links are not readable | Proton is not supported | The manual check is first; the screen says so and Proton is dropped from the allowed list's claims. |
| The reminder job is late or stops | A reminder arrives late or not at all | "About" in the wording, a 15-minute catch-up window, one log summary per run. No alarm yet, so a stopped job shows only in logs (Future Improvements). |
| A reminder is lost after the claim | No reminder | At-most-once is chosen over twice. Same trade as digests. |
| Push delivery is slow on a phone | A reminder is late | The wording says "about". The real-phone check in `MANUAL-CHECKS.md` measures it. |
| A removed member's data remains | Their calendar stays visible | Removal deletes the member's feeds, snapshots, private events and reminders in the same change. |
| The key is lost | Stored links cannot be read | Feeds show "Link needs to be added again". The person pastes the link again. |
| An event series grows for ever | Large list | 500 live events, one-off events expire, a repeating event counts once. |
| The household changes its time zone | Events move by hours | Accepted and listed in Open Questions. |
| Two edits of one event | One person's change is lost | Field groups with last-writer-wins, so a lost edit is a plain older value, never a mixed time. |
| The person's own reminder shows a title on the lock screen | A private title is visible to anyone who sees the phone | The sheet says so before it is saved. |
| A hostile server at a listed address | Learns the egress address and fetch times, and can send a hostile file | Accepted; the parser limits apply. |
| `GET /calendar` is polled every 10 seconds | At the 500-event limit about 300 KB (an estimate: 500 events at about 600 bytes) per poll per phone | A typical household has a few dozen events. A revision check is a future change. |
| Two creates pass the 500-event check together | A few over the limit | The limit is soft and is checked again on restore. |
| Duplicates (an event typed and imported) | The same thing twice | Accepted. Imported items are labelled with their calendar's name. |

## Future Improvements

*   **Reminders for imported events**, if a person asks for them.
*   **A checklist in a block**, linked to a task, so a routine has steps.
*   **Edit one occurrence** of a repeating event, and rules such as "last Friday of the month".
*   **A month grid.**
*   **A household feed** other apps can subscribe to (Hearthwise tasks and events as ICS, using the `app/lib/ics.ts` approach from the sibling app).
*   **More providers and home-network hosts** for self-hosters, by exact name and with an explicit warning.
*   **A separate fetcher Lambda** with its own role (Alternative P).
*   **Alarms** on the refresh and reminder runs, with the rest of the job alarms (nothing has alarms yet).
*   **A time zone for each person**, for travel.
*   **Two-way sync** through provider APIs, decided per provider.

## Detailed Implementation Plan

### Approach

Seven pull requests, in this order. Typed events, the app, and reminders come first, so the household has a working shared calendar before any code fetches an outside address (steps 1 to 3). Step 4 is the safe fetcher, with the key and the infrastructure it needs. Step 5 is the parser. Step 6 is feeds on the server and in the app. Step 7 is the finish. Items are numbered across all steps, so "item 14" names one thing. Each step passes `yarn typecheck`, `yarn test` and `yarn build`. The phase 1 rules apply to every step:

*   each test is written before the code it covers;
*   every event write route carries a `mutationId` and runs through `withWriteRecord`; the feed routes are online only and idempotent;
*   an attribute that is not set is left out and never stored as `null`;
*   every `fetch` in the app goes through `withTimeout()`;
*   wording follows `docs/brand.md`.

File names are taken from the current code. Where one differs when a step starts, the code wins, and the pull request records "Spec says / Built / Why" in `docs/DECISIONS.md`. Domain code follows `src/meals/applyRecipe.ts` and `src/meals/recipes.ts`. The deploy role is trusted from `main` only, so the infrastructure changes in steps 3 and 4 cannot be exercised before merge; each is covered by the infrastructure guard test and checked after the first deploy. The two infrastructure changes are separate pull requests because each can be reverted on its own.

**Before step 4 merges**, the author checks, by hand, a real link from each of the four providers against the host and path table (Proton first, because it is unverified), and the table is corrected from what is found. Step 4's automated tests use fixtures of those shapes.

### Step 1: Events on the server

**Acceptance:** with the app unchanged, the routes create, edit, repeat, delete and restore an event, hide a private event's text from the other person, refuse the other person's changes to it, and every rule below has a test.

1.  `src/shared/schedule.ts` (Modify): export `occursOn`, add `occurrencesBetween`; `src/shared/zoned.ts` (Create): `zonedInstant`; tests for both, including the gap and the repeated hour on 2026-03-29 and 2026-10-25 (London), a zone with no daylight saving, and day 31 in a short month.
2.  `src/shared/calendar.ts`, `src/shared/calendarValidation.ts` (Create), `src/shared/taskValidation.ts` (Modify: the `RestoreEntry` union and `parseRestoreBody` gain `event`; `parseRepeat`, `parseDay`, `parseUuid` and `ENVELOPE_KEYS` are reused), tests: `occurrencesOf` (skip dates, end date, all-day span, overnight, look-back), validators (reject `after` and `either`, unknown keys, the equal `startOn` rule, limits).
3.  `src/calendar/types.ts`, `keys.ts` (Create): `EVENT#`, `CALREM`, `CALFEEDS`, `CALRATE`, `REMIND#`.
4.  `src/calendar/applyEvent.ts`, `events.ts`, `project.ts` (Create), tests: the pure write rule (field groups, tombstone, creator-only `private`, `private` forcing `who`, removal of other members' reminders), the domain written like `src/meals/recipes.ts` (the write result holds ids only), and `projectFor` with the sentinel tests for events (a private title never reaches the other person from any route, push, held push or log).
5.  `src/api/calendar.ts` (Create), `src/api/apiRoutes.ts` and `src/api/__tests__/apiRoutes.test.ts` (Modify: the test pins the exact ordered route list), `src/push/events.ts` (Modify: the two push texts, none for private), `src/api/__tests__/calendar.test.ts`: the event and reminder-save routes (the save writes `CALREM`), with the error codes in "API routes".
6.  `src/tasks/restore.ts` (Modify: reuse `restoreRecord`, add `event_limit` and a live count), `src/household/invites.ts` (Modify: `moveOptions`), `src/store/__tests__/contract.ts` (Modify: cases for the `CALREM` partition on all three stores), tests beside each. The pull request records which existing code lists a prefix as a whole (`moveOptions`, `removeMember`), because rollback depends on nothing else doing so.

### Step 2: The app (typed events)

**Acceptance:** two people see each other's day on `/plan/calendar` and on Today; a private event shows as "Busy, {name}"; events can be added offline and are sent once; the page passes the axe check (the existing route accessibility test, run for the new route) at 360 px and at the largest text size.

7.  `app/lib/calendarKeys.ts`, `calendarOverlay.ts`, `calendar.ts`, `calendarText.ts`, `app/lib/mutations.ts` (Modify: re-export `calendarMutationKeys`, register the five kinds with `registerSet`, each with an overlay, as `app/__tests__/mutationRegistry.test.ts` requires), `app/lib/deleted.ts` (Modify: a calendar argument), `app/hooks/useCalendarActions.tsx` (Create), tests: hooks, overlay (the same rule and projection as the server), registration, and a restored-cache test with a pending event write.
8.  `src/shared/timeline.ts` (Create), tests: `buildTimeline` over events, tasks due and the dinner, overlaps (listed in order), overnight events found at 00:30, and "Now and next" (including "Nothing more today" and a person's own private event against the other's busy item).
9.  `app/routes/plan.tsx` (Modify: it renders the dinners page with no `<Outlet />`, so a `plan.calendar.tsx` child would never render; the dinners page moves to `app/routes/plan._index.tsx` and `plan.tsx` becomes a layout with the "Dinners | Calendar" switch and an `<Outlet />`, and the `./+types/plan` import is updated), `app/routes/plan.calendar.tsx`, `app/components/calendar/` (Create), `app/routes/_index.tsx` (Modify: Now and next), `app/routes/deleted.tsx` (Modify), `app/__tests__/wording.test.ts` (Modify: the calendar copy table; the existing ban on "overdue", "missed" and "late" already covers app source), the touch-target test, and the route accessibility test.

### Step 3: Reminders

**Acceptance:** a person who sets "30 minutes before" on an event gets one push about 30 minutes before, only that person, once, also on the clock-change days; a person without push is told to turn it on; the hourly path sends no reminders and the five-minute path sends no digests.

10. `src/calendar/reminders.ts` (Create), tests: the window and catch-up, the claim (two runs give one send), `savedAt` (a reminder set after its moment sends nothing), the gap and repeated-hour days, no reminder for a deleted event or a person who is no longer a member, a private flip after another person set a reminder, a household with no reminders not read and `CALREM` removed with `ifEquals`, and no title in any log line.
11. `infra/push-lambda.tf` (Modify: a second rule `rate(5 minutes)` with the input `{ "job": "reminders" }`, its own target and `aws_lambda_permission`), `push-handler.ts` (Modify: route on `job`, a missing one meaning hourly, an unknown one doing nothing), `src/infra/__tests__/infraGuards.test.ts` (Modify), `container/maintenance.ts`, `container/server.ts` and `container/__tests__/maintenance.test.ts` (Modify: the deps, the 5-minute timer and `stop()`).
12. `app/components/calendar/ReminderPicker.tsx` (Create): the choices, "about", "sent even in quiet hours", the lock-screen note, "This reminder time has already passed", the link to Settings when push is off.
13. `e2e/offline/main.tsx`, `e2e/offline/offline.spec.ts` (Modify): an offline event add.

### Step 4: The safe fetcher, the key and the infrastructure

**Acceptance (the merge gate):** every adversarial test in this step passes: each allowed host and path, look-alike hosts, each blocked address range and every entry of the IANA special-purpose registries, address forms, a redirect to a blocked address or an unlisted host, a rebinding resolver, an `all: true` lookup under Node 24, oversize and compressed bombs, the codes table, and no host, address, link or library error text in a log or an error; the no-other-fetch test passes.

14. `src/calendar/allowedHosts.ts`, `addressRules.ts` (Create), tests: the host and path table (fixtures of each provider's link shape, look-alikes such as `calendar.google.com.evil.example`, punycode, `webcal://` forms and mixed case), `CALENDAR_EXTRA_HOSTS` (read only in the container), and the address rules as above.
15. `src/calendar/fetcher.ts` (Create), tests with a local test server and an injected resolver and port (the test build can inject them; production cannot): every rule in "Fetching a link", the codes table, and the semaphore.
16. `src/calendar/secret.ts` (Create), tests: encrypt and decrypt with the additional data, key loading (`CALENDAR_KEY_PARAMETER` through SSM, `CALENDAR_KEY`, or `<dataDir>/calendar.key`), a missing key (`calendar_key_missing`), a wrong key, a changed byte, and a ciphertext moved to another feed.
17. `infra/api-lambda.tf` and `infra/push-lambda.tf` (Modify: the SSM policy of each role names the calendar key as well as the push key, the `CALENDAR_KEY_PARAMETER` variable on both, and the push Lambda's memory 512 MB), `src/infra/__tests__/infraGuards.test.ts` (Modify: assert exactly these two parameters and no wildcard, and update the test titles), `infra/initialSetup/main.tf` is not changed (its boundary already allows `/hearthwise/*`), `docs/DEPLOYMENT.md` (the by-hand key), `docs/DECISIONS.md` (the security decision).
18. `src/calendar/__tests__/noOtherFetch.test.ts` (Create): fails if any non-test file in `src` or `container` imports `http`, `https`, `http2`, `net`, `tls`, `dns`, `dgram`, `child_process`, `undici`, `axios` or `got` (with or without the `node:` prefix, as an import, a `require` or a dynamic `import()`), or calls `fetch`, other than `src/calendar/fetcher.ts`. The existing push code reaches the network only through the `web-push` library, whose addresses `src/shared/pushEndpoint.ts` limits to known push services.

### Step 5: The parser

**Acceptance:** the parser fixtures pass for Google, Outlook, Apple and Proton-shaped files, the hostile-file set is parsed or stopped by the worker's own limit with the process still healthy, and the compiled worker starts from the API, push and container outputs.

19. `package.json`, `scripts/build-api-handler.cjs`, `scripts/build-push-handler.cjs`, `scripts/build-container.cjs` (Modify: `ical.js` at an exact version in each generated dependency list, `parseWorker.ts` added to each `tsc` command), `scripts/container-smoke.mjs` (Modify: parse a fixture in the built image), new build tests that require `ical.js` and start the worker from each output. `ical.js` v2 is ESM-first and these builds emit CommonJS, so the first task is to check which import form works, and the pull request records it.
20. `src/calendar/parseCore.ts`, `parseWorker.ts`, `windowsZones.ts` (Create), tests: fixtures; IANA, Windows, ignored `VTIMEZONE`, floating and `Z` times; all-day events with exclusive end dates; `RRULE` with `COUNT`, `UNTIL`, `EXDATE`, `RDATE` and overrides; wall-clock expansion across both London clock changes; `DURATION` and no end; frequencies finer than daily; every cap; the title clean-up; the worker killed on time; and the hostile-file set.

### Step 6: Feeds on the server and in the app

**Acceptance:** with fixtures of the four providers' link shapes, a person adds a feed, sees "Updated just now" and the events, the other person sees "Busy" or details as chosen, a feed that stops working keeps its events and says so in the words of the copy table, and removing a feed deletes the feed, its secret, its snapshot chunks and its index item (each asserted). The real-link check is a manual line in step 7.

21. `src/calendar/feeds.ts`, `snapshots.ts`, `refresh.ts` (Create), tests: add, replace, rename, remove, the `CALFEEDS` index, the read-and-swap counters and the claim, the platform and household limits, chunking by month and the swap, the read race, backoff, the sentinel tests for a busy feed and its label, the removal of a removed member's data (`src/household/members.ts` Modify), "key missing", and that an orphaned index item is deleted.
22. `src/api/calendar.ts` (Modify), `src/api/__tests__/calendar.test.ts`: the feed routes and the imported route, with the no-link-in-response, no-link-in-log and no-link-in-error tests (including a 400).
23. `push-handler.ts`, `container/maintenance.ts`, `container/server.ts` (Modify): the hourly invocation also calls `runCalendarRefresh`. `src/store/cli.ts` (Modify): `calendar-feeds`. `src/infra/__tests__/selfHostingDoc.test.ts` and `docs/SELF-HOSTING.md` (Modify: `CALENDAR_EXTRA_HOSTS`, `CALENDAR_KEY`).
24. `app/lib/calendar.ts`, `calendarText.ts` (Modify): `useImported()`, the windows, their saved cache, the fetch-status copy, and a test that the persister never holds a link; `src/shared/timeline.ts` (Modify): imported items and their feed's age; `app/components/calendar/` (Modify): the Calendars sheet and the add form with provider steps; the wording test; the route accessibility test.

### Step 7: Finish

**Acceptance:** the offline test passes and `docs/MANUAL-CHECKS.md` holds every real-world check below.

25. `e2e/offline/*` (Modify): a saved imported window read offline.
26. `docs/MANUAL-CHECKS.md`: a real link from each of Google, Outlook, Apple and Proton (and each provider's refresh delay); a reminder on a real iPhone, timing it; the clock change; two phones for privacy (make an event private, and a feed busy-only, and look at the other phone with no signal); the "Dinners | Calendar" switch, to see whether the Plan tab's calendar icon confuses; 360 px at the largest text; the self-hosted container fetching a real link; a month-later question to both people.
27. `docs/ROADMAP.md`, `CLAUDE.md` (Architecture: Calendar line; status line), `docs/DECISIONS.md` (the Claude decisions, and "Spec says / Built / Why" rows), `README.md`, `docs/SELF-HOSTING.md` (keeping the key file apart from backups, outbound access).

### Verification Plan

*   **Compilation/Build**: `yarn typecheck` and `yarn build` pass after every step. The build tests require `ical.js` and start the worker from the API, push and container outputs.
*   **Unit Tests**: `yarn test` passes, including the fetcher, parser, projection, expansion, reminder and timeline tests, and the contract tests with `DYNAMODB_ENDPOINT=http://localhost:8000 yarn test`.
*   **Static Analysis**: the wording test, the mutation-registry test, the touch-target test, the infrastructure guard test, the self-hosting doc test and the no-other-fetch test.
*   **E2E**: `yarn test:e2e` runs the offline cases added in steps 3 and 7. The route accessibility test runs on every new route at 360 px and at the largest text size.
*   **Manual**: the new lines in `docs/MANUAL-CHECKS.md` on two real phones and with real links, including the Proton check and the reminder timing.
*   **Compatibility**: a test restores a saved cache with `schemaVersion` 1 that holds a pending event write, and it replays. For rollback, the pull request for step 1 lists every place that reads a prefix as a whole (`moveOptions` and `removeMember`); every other read is by exact prefix, so the new items are inert to older code, and an older app ignores the new routes.

## Review history

Seven independent reviewers (architecture and security, codebase, simplicity, a cold reader, implementation readiness, structure, style) read the first full draft on 2026-11-15, after six had read the brief. The findings that changed the design:

*   **Security.** The allowed-host list was whole domains, which anyone can publish pages on; it is now exact calendar hosts with a path shape. The `webcal://` rewrite now happens before parsing. The IPv6 rule is an allow-list. The pinned lookup handles the `all: true` form that Node 24 uses. DNS now has its own timeout. The worker thread starts with no environment. Conditional requests were removed (a "not modified" answer would stop the snapshot sliding and let its chunks expire). Rate limits gained a platform total, a read-and-swap pattern the store can do, and a feed ceiling. Encryption gained additional data bound to the feed.
*   **Privacy.** A reminder could still send a title after an event was made private; reminders now go through the projection and are removed in the same write. Only the creator can set `private`. A busy-only feed's label is hidden from the other person. Write records hold ids only.
*   **Code facts.** The infrastructure change is in the two role policies, not the boundary. There is no way to leave a household, no household delete and no restore code, so those claims were corrected, and removal of a member's data became a bounded cleanup. Sign-out already clears every key. `plan.tsx` has no outlet, so the dinners page moves to `plan._index.tsx`. The push handler takes no input, so a missing one means the hourly job. The container needs `server.ts` changes. The build scripts are plain `tsc` runs with no bundler, and the `Dockerfile` does not change. `emitSecurityEvent` has a closed list of types and sends an email each, so it is not used.
*   **Correctness.** Reminder semantics were made exact (minutes before the start, "at the end" for blocks, a claim keyed by date, `savedAt` instead of a "late event" rule). The `CALREM` index no longer has a delete race. Snapshot chunks are by month and live until the feed is removed. Overnight items are found for "Now". Imported repeats expand in wall-clock time.
*   **Structure.** Items are numbered across steps, the plan is seven steps with acceptance statements, a before-step-4 Proton check was added, the decisions table gained the missing rows, terms were defined, and the error codes have one table.
*   **Not changed.** The simplicity reviewer judged the import half too large for two people. The design keeps it because the author asked for it, builds it last, and lists the choice in Open Questions.

--------------------------------------------------------------------------------

*Drafted with EGM*
