# Discussion Summary: Hearthwise (shared household app)

*   **Author:** kingchappers
*   **Date:** 2026-11-10
*   **Source:** Research and decisions from the chat session, with no `egm-brainstorm` run. This file stands in for a concepts brief. It was revised after a self-review on the same day.

## Problem

Two adults share one household. The work, and the information about it, is spread across several tools. Neither person can see the whole picture in one place.

| Need | Current tool | What goes wrong |
|---|---|---|
| General to-dos | Google Tasks | One of several places a task could be |
| Who paid for what / who owes whom | Apple Reminders | A reminders app is being used as a ledger. Nothing adds up the balance. *(inferred, not stated by the users)* |
| Minor tasks | OneNote | Both people forget it exists |
| Weekly meal plan | Physical whiteboard | Only visible at home. The shopping list has to be copied from it. |
| Shopping list | Last-minute text messages | No single list both people can check |
| Chores | Nothing shared | No record of what's done or due, so it's hard to split the work |

The two users have different needs, and those needs often pull against each other. Existing apps are built around one person's way of working, or for a typical family. A tool that suits one person can create friction for the other.

## Feature areas

From the users' own list, plus the general to-dos they currently keep in Google Tasks and OneNote:

1. **Chores.** Recurring tasks, each with its own interval. Completing one sets the next due date and syncs to the other person. The users' examples:
   - hoovering is due again the next day
   - the bathroom is due again next week
2. **Meal plan and shopping list.** The weekly plan replaces the whiteboard. The shopping list is built partly from the plan and partly by hand, and is shared live.
3. **Shared calendar.** *(Added 2026-11-10.)* Each person brings their own calendar. The aim is integrations with **Google Calendar, Outlook, Apple (iCloud) Calendar and Proton Calendar**. Using each provider's "live link" features (subscribing to or publishing an iCal/ICS URL) is acceptable where a full two-way API isn't available or worth it.
4. **DIY projects.**
5. **Money tracker.** Records who paid for shared things and who owes whom, in either direction, so the split stays fair.
6. **One-off to-dos.** *(Added in review.)* The user's list didn't include these, but they're what Google Tasks and OneNote hold now. If Hearthwise doesn't cover them, those two apps stay in use and the fragmentation remains. Chores could share the same task model, treating a to-do as a chore that doesn't repeat.

## Market research findings

- No existing app covers all five areas. The closest combination is FamilyWall or Cozi, plus Tody or Sweepy for chores, plus Splitwise for money. That's still three apps.
- **Tody and Sweepy** schedule each chore from its last completion. That's the behaviour wanted for chores.
- **No app covers DIY projects**: stages, a "waiting on" state, and materials feeding a shopping list.
- **Apps built for particular needs** (FreshChores, Dopami, Tidy, Chore Focus) are designed for one person and one way of working. None is designed for two people with different needs sharing data.
- Most comparison articles are written by the app vendors and are not independent.

## Design requirements for different needs

Guiding principle: **shared data, personal views.** Chores, lists and balances are the same for both people. How each person sees them, gets notified and completes them is set per person.

**Review caveat: a two-profile split is too neat.** Either person may want predictability *and* flexibility, and which one can change from day to day or from chore to chore. So the design shouldn't assign a fixed "profile" to each person. Every behaviour below should be a separate setting, chosen per person, and per chore where that makes sense. The table shows typical tendencies, not rules.

| Tension | Tendency toward predictability | Tendency toward flexibility | Proposed handling |
|---|---|---|---|
| Structure | Fixed, predictable schedules | Flexible, no penalty for a missed day | Each chore has a repeat type: fixed date, or N days after last completion. Overdue chores are shown as "due", not in red. |
| Change | No surprise changes | Swap tasks based on energy | A change to a task the other person owns must be accepted by them. Swaps are proposals. |
| Notifications | Few and predictable | Frequent and visible | Nothing notifies the other person automatically. The sender chooses "Let <name> know" per change. Each person can opt in, for themselves only, to a daily digest and/or due-day nudges (both off by default), with quiet hours. *(Updated during design drafting.)* |
| What counts as done | Explicit criteria | Partial credit | Optional checklist per chore. Each step can be ticked separately. |
| Amount shown | Full overview | One item at a time | Two views of the same data: full list, or "next thing" only. Each person picks their default and can switch at any time. |
| Wording | Direct and literal | Low-shame | Neutral, literal wording. No streaks, no "you missed X". |
| Fairness | Clear accounting | Recognition without scorekeeping | See the risk below. |

**Review risk: a visible workload balance can make conflict worse.** A running "who did more" figure helps someone who wants clear accounting. For someone sensitive to feeling judged, it can read as a scoreboard they're losing. The money balance has to be exact and visible, because it's a real debt. The chore balance doesn't. Options to settle in the design:
- off by default
- shown only as a trend over weeks
- visible only on request

The requirements in this section, including this risk, were confirmed by the author on 2026-11-10.

## Practical requirements found in review

- **Conflicting updates.** Both people may tick the same shopping item or complete the same chore within seconds of each other. Completing something twice must not push the next due date out twice. A tick that arrives after an item was deleted must not bring the item back.
- **Offline use in shops.** Supermarkets often have weak signal. The shopping list must stay readable when offline, and ticks must queue and sync later. Hoardwise's offline queue covers sending entries, but not reading cached data on launch: its roadmap lists offline launch as a follow-up.
- **Platform and notifications.** Hoardwise is an installable web app (PWA). On iPhone, web push only works once the app has been added to the Home Screen, and it needs iOS 16.4 or later. Both users need to install it this way, or reminders won't arrive.
- **Private vs shared items.** Everything in the household is assumed to be visible to both people. It's undecided whether either person needs private to-dos.
- **Copying Hoardwise code.** Option B copies Hoardwise's scaffolding instead of sharing a package. Fixes made in one app later won't reach the other on their own. That cost is accepted for now.

## How we'll know it works

- Within four weeks of phase 1 shipping, both users use Hearthwise for chores and shopping without reminding each other to.
- The whiteboard shopping list and last-minute shopping texts stop.
- Once one-off to-dos are covered, Google Tasks and OneNote are no longer used for household items.
- Neither user reports that the app causes arguments about who did what.

## Decisions made

1. **Separate app (option B).** A new repository built on the same stack and conventions as Hoardwise (`~/Projects/hoardwise`):
   - React 19 + React Router v8 SPA (the version Hoardwise now uses), Mantine + Tailwind
   - static and API Lambdas behind API Gateway
   - single-table DynamoDB, with a SQLite store for self-hosting
   - OpenTofu
   - Auth0 or local login
   - Vitest
2. **Hoardwise integration is deferred.** Later, money-tracker settlements may be sent to each person's Hoardwise as transactions. For now, the money tracker's data model should keep that possible but not build it.
3. **One central database** that both devices read and write. DynamoDB is the hosted store.
4. **Sync approach, first version:** refetch when the app regains focus, plus short polling (5–15 s) while it's open. Web push is sent only when the person making a change ticks "Let <name> know", or for the opt-in reminders each person sets for themselves. *(Updated during design drafting.)*
5. **Name and location:** the app is called **Hearthwise**, as a sibling to Hoardwise. The project lives at `~/Projects/hearthwise`.
6. **Delivery in phases**, following Hoardwise's one spec and one PR per sub-project:
   1. household sharing, chores, shopping list
   2. meal plan feeding the shopping list
   3. money tracker
   4. shared calendar, with Google, Outlook, Apple and Proton integrations
   5. DIY projects

   One-off to-dos were moved into phase 1, sharing the chore model.

## Decisions made while drafting the design

Made by the author at the drafting checkpoints for [`docs/designs/phase-1-foundation.md`](docs/designs/phase-1-foundation.md) on 2026-11-10, unless dated otherwise. The letters match that document's Alternatives.

- **No native apps (Alternative D).** Hearthwise is a web app with a PWA install. The Apple Developer Program's yearly fee, and a second codebase, outweigh the PWA's push and storage limits.
- **One-time invite link (Alternative F).** Chosen over a short join code or pre-created accounts, because it works the same way in both login modes.
- **One completion record per cycle (Alternatives G and H).** Chosen over a version check on the chore and over a completion log worked out on read, because it gives an exact answer for duplicate and late offline completions.
- **Persisted query cache with replay-safe writes (Alternatives I and J).** Chosen over a local-first store with a sync engine, and over making only the shopping list work offline.
- **`both` tasks need a proposal for schedule changes and deletion** (2026-11-11, design review round 2). A job done together belongs to both people, so changing it is treated like changing the other person's task.

## Hoardwise patterns to reuse

- Recurring-item logic (monthly only in Hoardwise; needs daily, weekly and "N days after completion")
- Web push subscriptions
- Offline entry queue
- PWA install metadata and launch shortcuts
- Undo on save and delete
- Accessibility tests: touch targets, readable text, contrast, decision text
- Store abstraction (DynamoDB / SQLite)
- MCP server and OAuth routes (not needed in phase 1)

## Alternatives weighed

- **A. Build inside Hoardwise.** Rejected by author. Hoardwise stores data per user (`PK = USER#<id>`). Shared household data would affect every handler, and it would change Hoardwise from a personal budgeting app into something broader.
- **C. Separate app plus a Hoardwise integration now.** Deferred by author. The integration is not needed to solve the core problem, and it adds a dependency between the two apps early on.
- **Use existing apps** (FamilyWall/Cozi + Tody + Splitwise). Not chosen: they keep the fragmentation, have no DIY support, and don't handle two people with different needs sharing data. **Strongest counter-argument:** a two-week trial of Tody plus a shared list app would test the design requirements at almost no cost, before anything is built. That trial hasn't been run.
- **API Gateway WebSockets + DynamoDB Streams for instant sync.** Deferred: more infrastructure than two users need at first. Revisit if polling feels slow.
- **AWS AppSync subscriptions.** Rejected: they don't work with the self-hosted SQLite path.

## Open questions

- How does the second person join the household? Invite link, invite code, or both accounts created by one person?
- Is self-hosting (container + SQLite) needed for this app, or is AWS enough? If AWS is enough, dropping the SQLite store would cut work.
- Calendar (phase 4): for each provider (Google, Outlook, Apple/iCloud, Proton), is a read-only ICS subscription enough, or is two-way sync needed? Proton's end-to-end encryption may limit it to shared links. Check each provider's current capabilities when phase 4 is designed.
- How visible should the chore workload balance be?
- Does either person need private items?
