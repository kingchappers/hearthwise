# Hearthwise: Foundation and Phase 1 (Household, Chores, To-dos, Shopping List)

*   **Author:** kingchappers
*   **Status:** Approved (2026-11-11, after EGM review; see `docs/reviews/consolidated_review_report.md`)
*   **Date:** 2026-11-10 (revised 2026-11-11 after design review)

--------------------------------------------------------------------------------

## Overview

Hearthwise is a shared household app for two adults living together. This document covers its foundation and first phase:

- a **household** that both people belong to, with sign-in and a way to invite the second person
- **sync**, so a change on one phone shows on the other within 15 seconds while the app is open and online
- **chores and to-dos**: repeating chores with their own repeat rules, and one-off to-dos, stored as one model
- a **shared shopping list** that works offline in a shop

**Terms used throughout:** a **task** is any chore or to-do. A **chore** is a task that repeats. A **to-do** is a task that doesn't repeat.

Hearthwise is a new app, separate from **Hoardwise**. Hoardwise is the author's existing personal budgeting app (`~/Projects/hoardwise`, [github.com/kingchappers/hoardwise](https://github.com/kingchappers/hoardwise)), and Hearthwise reuses its patterns and much of its code. "As in Hoardwise" throughout this document refers to that codebase at commit `b50544f`. Hearthwise is built on the same stack and conventions:
- React Router SPA
- AWS Lambda behind API Gateway
- single-table DynamoDB
- OpenTofu

Hearthwise's data belongs to a household rather than to one user.

The two users have different needs. Their preferences for structure, reminders and how much to see at once often differ. Phase 1 has to work for both of them from the start, because these are the features they will use every day.

Later phases each get their own design document:
- phase 2: meal plan feeding the shopping list
- phase 3: money tracker
- phase 4: shared calendar
- phase 5: DIY projects
- unscheduled: integration with Hoardwise

## The Problem

The household's work, and the information about it, is spread across Google Tasks, Apple Reminders, OneNote, a whiteboard and text messages. Neither person can see what needs doing, what's already done, or what to buy, in one place.

Phase 1 addresses three problems:

1. **Chores have no shared record.** When one person hoovers or cleans the bathroom, the other has no way to know. Neither knows when it's next due. The split of work becomes a matter of memory and argument rather than a visible record.
2. **The shopping list lives in messages.** Items arrive as last-minute texts. The person in the shop has no single, current list, so things are missed or bought twice.
3. **To-dos are scattered.** One-off household to-dos sit in Google Tasks or OneNote. OneNote in particular gets forgotten by both of them, so to-dos drop out of sight.

Existing apps solve parts of this. Tody and Sweepy handle chore intervals, and Cozi and FamilyWall handle shared lists. None of them is designed for two people whose needs differ:
- One person may want fixed schedules, few notifications and the full list.
- The other may want flexibility, visible nudges and only the next thing to do.
- Either of them may want different things on different days.

A tool tuned for one of them can create friction for the other.

**Proposed solution:** one shared set of data with per-person views. The tasks and list items are the same for both people. How each person is reminded, how much they see at once, and how a chore's next due date is worked out are settings, not fixed behaviour.

## Goals

*   **One shared household.** Two people sign in to their own accounts and see the same tasks and shopping list. The second person joins through an invite from the first.
*   **Changes show on the other phone within 15 seconds** while the app is open and online.
*   **No surprise notifications.** Nothing notifies the other person automatically. Ticking "Let \<name\> know" on a change sends them one push within a minute. If they're in quiet hours, the push is held until those end. The only other notifications are reminders a person turns on for themselves.
*   **Chores reschedule themselves when completed.** Each chore uses one of two repeat types:
    - **interval after completion** ("hoover: 1 day after it was last done")
    - **fixed schedule** ("bathroom: every Sunday")

    Completing a chore sets its next due date. Completing it twice in quick succession, by either person, moves the date only once.
*   **To-dos** use the same model as chores, with no repeat.
*   **The shopping list works offline.** It opens and stays readable with no signal. Items ticked or added offline sync when the connection returns. An edit with an older timestamp never overwrites a newer one, so the other person's older offline edit can't untick an item.
*   **Per-person settings, independent of each other:**
    - opt-in reminders for the member themselves, all **off by default**:
      - a daily digest at a set hour
      - due-day nudges for tasks assigned to them, `either` or `both`
    - quiet hours, which hold back any "Let \<name\> know" push until they end
    - default view (full list or "next thing" only)
*   **Changes to the other person's task need their approval.** A task can be assigned to one person, to `either` or to `both`. A schedule change, deletion or new assignment that affects the other person creates a proposal they accept or decline, not a silent change.
*   **"I did this today" in one tap.** Either person can record that they did any task today, including one assigned to the other person, with no proposal or other interaction. It completes the task's current cycle.
*   **Neutral, low-shame wording.** No streaks, no red overdue states, no "you missed X". Overdue items read as "due".
*   **Accessibility parity with Hoardwise:**
    - same touch-target minimums
    - same readable-text and contrast tests
    - undo on every completion and delete
*   **Success measure:** within four weeks of phase 1 shipping:
    - both users use Hearthwise for chores and shopping without reminding each other to
    - the whiteboard list and shopping texts stop
    - Google Tasks and OneNote are no longer used for household to-dos
    - neither user reports that the app causes arguments about who did what

## Non-Goals

*   **Meal planning**, recipes, and generating the shopping list from a meal plan. That's phase 2. Nothing for it is built in phase 1.
*   **Money tracker** and who-owes-whom balances. That's phase 3.
*   **Shared calendar** and calendar integrations (Google Calendar, Outlook, Apple iCloud and Proton Calendar). That's phase 4, which has its own design.
*   **DIY projects.** That's phase 5.
*   **Hoardwise integration** of any kind, including shared sign-in. It isn't scheduled to a phase yet.
*   **A chore workload balance or "who did more" view.** Phase 1 records who completed each chore and when, so a balance can be added later. It doesn't display one, because the right form for it isn't settled.
*   **Instant sync over WebSockets.** Polling is the phase 1 approach.
*   **Automatic notifications about the other person's activity.** See the "No surprise notifications" goal.
*   **Households larger than two people, or more than one household per person.** These aren't designed, built or tested.
*   **Native iOS or Android apps, and app store distribution.** Hearthwise is a web app that can be installed as a PWA, as Hoardwise is. See Alternative D.
*   **Gamification**: points, rewards, streaks or leaderboards.
*   **Private items.** Everything in the household is visible to both members in phase 1.

## Open Questions

*   None open. The open questions in [`discussion_summary.md`](../../discussion_summary.md) are settled here:
    - how the second person joins: a one-time invite link ("Invites"; Alternative F)
    - whether self-hosting is needed: yes, in phase 1 (Alternative E)
    - calendar provider integration: deferred to phase 4 (Non-Goals; Future Improvements)
    - how visible the chore workload balance is: not shown in phase 1 (Non-Goals)
    - private items: none in phase 1 (Non-Goals)

## Critical User Journeys (CUJs)

### CUJ 1: Setting up the household

*   **Given**: Neither person has a Hearthwise account.
*   **When**: The first person signs up, creates the household and sends an invite. The second person accepts it and signs up.
*   **Then**: Both accounts belong to the same household and see the same empty task list and shopping list. Each person has their own default settings.

### CUJ 2: Completing a chore that repeats after completion

*   **Given**: "Hoover" repeats one day after completion and is due today. Both people have the app installed.
*   **When**: One person marks it done.
*   **Then**: Its next due date is tomorrow. The completion records who did it and when. The other person's open app shows the change within 15 seconds. No push is sent unless the person who hoovered ticked "Let \<name\> know".

### CUJ 3: Completing a fixed-schedule chore

*   **Given**: "Clean the bathroom" repeats every Sunday.
*   **When**: It's completed on Sunday.
*   **Then**: Its next due date is the following Sunday.

### CUJ 4: Both people complete the same chore at once

*   **Given**: Both open apps show "Hoover" as due.
*   **When**: Both mark it done within a few seconds of each other.
*   **Then**: The next due date moves forward once. Both completions are recorded. Neither person sees an error.

### CUJ 5: Shopping with no signal

*   **Given**: One person is in a shop with no signal. The other is at home.
*   **When**: The shopper opens the app and ticks items. The person at home adds "milk".
*   **Then**: The list opened from the last cached copy. Once the shopper's phone reconnects, the ticks sync and "milk" appears on their list. No tick is undone by an older edit.

### CUJ 6: Proposing a change to the other person's chore

*   **Given**: "Bins" is assigned to the other person.
*   **When**: One person proposes a one-off swap: they'll do the bins this week.
*   **Then**: The owner sees the proposal next time they open the app (or gets a push if the proposer ticked "Let \<name\> know"), and can accept or decline. Nothing changes until they accept. Once accepted, this week's bins show as the proposer's, and next week's go back to the owner.

### CUJ 7: "I did this today" on the other person's chore

*   **Given**: "Bins" is assigned to the other person and is due tomorrow.
*   **When**: One person taps "I did this today" on it.
*   **Then**: The current cycle is completed and recorded as done by them today. The next due date moves on by the chore's rule. No proposal is created, and the owner isn't asked to do anything.

### CUJ 8: Two people, two views

*   **Given**: One person's default is the full list with a 7pm daily digest turned on. The other's is "next thing", with every reminder left off.
*   **When**: Both open the app on the same day.
*   **Then**: Each sees the same tasks in their own chosen view. The first person gets one notification, the 7pm digest. The second person gets none. Neither gets a notification because of the other's activity.

### CUJ 9: Restoring something from the recycle bin

*   **Given**: One person deleted the shopping item "batteries" yesterday, and the undo toast has closed.
*   **When**: The other person opens Settings, then Deleted, and taps Restore on it.
*   **Then**: "Batteries" is back on the list for both people, exactly as it was when deleted.

### CUJ 10: An expired invite link

*   **Given**: An invite link was created 8 days ago and never used.
*   **When**: The invitee opens it and signs in.
*   **Then**: They see "This invite has expired. Ask \<name\> for a new link." They aren't added to the household, and no household is created for them.

### CUJ 11: Signed up before opening the invite

*   **Given**: The second person signed in and created a household before the first person sent the invite. Their household has nothing in it.
*   **When**: They open the invite link.
*   **Then**: They're asked to confirm moving to the invited household. Once they confirm, their empty household is removed and they see the shared lists.

## Technical Plan (Architecture)

### Decisions this plan rests on

| Decision | Choice | Decided by |
|---|---|---|
| Relationship to Hoardwise | Separate app, scaffolding copied from Hoardwise | Author |
| Hosting | AWS (Lambda + DynamoDB) **and** self-hosted (container + SQLite), like Hoardwise | Author |
| Joining a household | One-time invite link | Author |
| Duplicate completions | One completion record per cycle, keyed by a cycle counter and written put-if-absent | Author |
| Offline | Service worker for the app shell, persisted query cache, TanStack Query's persisted paused mutations for offline writes | Author |
| Early completion of a fixed chore | Moves to the next occurrence after the completed cycle; missed cycles don't pile up | Author |
| Partly-ticked checklist | Chore stays due; ticked steps are kept until someone marks it done | Author |
| Phone clock skew | Client timestamps more than 5 min ahead of the server are clamped to server time | Author |
| Live updates | Refetch on focus and poll every 10 s while visible | Author (both the approach and the interval) |
| Notifications | See the "No surprise notifications" goal | Author |
| Changes to `both` tasks | Schedule changes and deletion need a proposal; title, notes and checklist edits apply directly | Author (2026-11-11) |
| AWS account | The same account as Hoardwise, sharing its state bucket and GitHub OIDC provider, with Hearthwise-named roles and SSM paths | Author (2026-11-11) |
| Brand | A new warm palette (terracotta, amber, sage on a warm off-white), not Hoardwise's | Author (2026-11-11) |
| Licence | AGPL-3.0-or-later, as Hoardwise | Author (2026-11-11) |

### Components

```text
 ┌────────────────────────────────────────────────────────────────────┐
 │ Phone A and Phone B: the same installed PWA, own settings each     │
 │ • React Router SPA; TanStack Query polls every 10 s                │
 │ • IndexedDB: persisted query cache and pending mutations           │
 │ • Service worker: app-shell precache, push receive                 │
 └────────┬─────────────────────────────────────────────────┴─────────┘
          │                                                 ▲
          │ [1] HTTPS + Bearer token                        │ [4]
          ▼                                                 │
 ┌──────────────────────────────────────┐    ┌──────────────┴─────────────────┐
 │ AWS: API Gateway                     │ [3]│ Browser push services          │
 │   ├► static Lambda (SPA files)       ├───►│ (Apple, Google, Mozilla)       │
 │   └► API Lambda ► guard ► handlers   │    └──────────────┬─────────────────┘
 │ Self-hosted: one container           │                   ▲
 │   (Node server + Caddy), same code   │                   │
 └────────┬─────────────────────────────┘                   │
          │                                                 │ [5]
          │ [2] Store interface                             │
          ▼                                                 │
 ┌──────────────────────────────────────┐    ┌──────────────┴─────────────────┐
 │ DynamoDB table  /  SQLite            ├◄──►┤ Hourly scheduler: push Lambda  │
 │ (single table, PK + SK)              │ [6]│ or container maintenance loop  │
 └──────────────────────────────────────┘    │ digests, nudges, held pushes   │
                                             └────────────────────────────────┘
```

1. Both phones read and write over HTTPS with a Bearer token.
2. Handlers reach the data through the `Store` interface.
3. "Let \<name\> know" pushes are sent directly by the API, before it responds.
4. The push services deliver to the recipient phone's service worker.
5. The hourly scheduler sends digests, due nudges and held pushes, and nothing else.
6. The scheduler reads members, tasks and held pushes from the store, records what it sent, and deletes the held pushes it releases.

Copied from Hoardwise with little change:
- static file Lambda
- `Store` interface with DynamoDB, SQLite and in-memory versions
- API router
- Auth0 JWT check
- push subscription storage
- VAPID keys
- the push Lambda's scheduling loop
- container server and Caddy setup
- OpenTofu modules
- accessibility test helpers

New code:
- a conditional `update` operation inside Store transactions (see "Store extension" below)
- multi-account local login
- household membership, invites and member removal
- the task and shopping-list domains
- push in the self-hosted container (Hoardwise's container has no push): VAPID keys outside AWS, web-push sending, and a scheduler call from the existing maintenance loop
- service worker caching of the app shell (Hoardwise's `public/sw.js` only handles push notifications, and is only registered once reminders are turned on)
- the persisted query cache
- offline writes through TanStack Query's persisted paused mutations (replacing Hoardwise's transaction-only custom queue)
- sender-chosen "Let \<name\> know" pushes, and opt-in reminders
- household alerts, and a small Auth0 Action for new sign-ups

### Store extension

Hoardwise's `Store.transact` only accepts `put` (optionally if absent) and `delete` (optionally if present). Hearthwise adds a third operation, a **conditional update**. It sets or removes attributes on an existing item, and only applies if every condition on that item holds:
- attributes equal given values
- attributes are missing or null

If any condition in the transaction fails, nothing is written. An update never creates an item. An attribute that isn't set is left out of the item, never stored as `null`, so "missing" means the same on every store. Completions, invite acceptance, completion undo, proposal acceptance, restores, member removal and the write record all use it. DynamoDB supports this directly. The SQLite store builds it from one database transaction. The in-memory store builds it from an atomic check-then-write.

DynamoDB can cancel a transaction with reason `TransactionConflict` when another transaction touches the same item at the same moment. The DynamoDB store retries those up to 3 times with jittered backoff before throwing. A failed condition is never retried by the store.

### Retries: one record per write

Every write request carries a client `mutationId`, the persisted mutation's id, which survives reloads. The handler writes `HH#<hid>` / `MUT#<mutationId>` put-if-absent **in the same transaction** as the write, holding the response status and a summary of the result, with an 8-day expiry (a little over the persisted cache's 7-day `maxAge`). If that put fails, the request is a retry of a write that already landed: the handler returns the stored result and writes nothing. A write that fails stores nothing, so its retry runs again.

This is the only retry check. It covers completions, deletes, restores, proposal accept, decline and withdraw, and "Let \<name\> know" pushes, which are sent only when the write record is new. Field timestamps and the base versions (`baseRuleVersion`, `baseCycleSeq`) handle a different problem: two people's edits arriving out of order.

### Identity and the household guard

- **Login modes.** `AUTH_MODE` picks how people sign in, as in Hoardwise:
  - `auth0` is the default for the AWS deployment: sign-in through an Auth0 tenant the author controls.
  - `local` is the default in the self-hosted container: Hearthwise's own email-and-password login.

  The frontend reads the mode from `/config.json` at runtime. One deployment uses one mode.

- **User id.** In Auth0 mode it's the token's `sub`. In local mode it's `local|<uuid>`, as in Hoardwise.
- **Local login becomes multi-account.** Hoardwise stores one `AUTH#ACCOUNT` record and closes setup after it's created. Hearthwise needs:
  - accounts keyed by normalised email: `AUTH#ACCOUNT#<email>` / `PROFILE`
  - login throttling per email: `AUTH#THROTTLE#<email>`, with a 1-day `expiresAt`
  - sessions in one partition, kept from Hoardwise
  - **password reset**, operator-only: `store-cli reset-password <email>`, adapted from Hoardwise's command. It sets a new password, ends only that user's sessions and clears their lock-out. It never reopens first-run setup, and Hoardwise's recovery flag isn't copied. There's no API route for it.

  First-run setup creates the first account, and still needs Hoardwise's one-time setup code. After that, new accounts can only be created through an invite link. Open sign-up is never available in local mode.
- **Display name.** Taken from the Auth0 profile's `name` (or `nickname`), or entered on the local sign-up form, and editable in Settings. It's the \<name\> in every message.
- **Household guard.** Every `/api/hh/*` request:
  1. resolves the caller's user id
  2. reads `USER#<userId>` / `MEMBERSHIP` to get their household id
  3. returns 403 if there's no membership

  Handlers receive the household id from the guard, never from the URL or request body. A user can't name another household.

### Invites

1. A member calls `POST /api/hh/invites`. The server generates 32 random bytes, which become the link token, and stores only the token's SHA-256 hash. In one transaction it writes:
   - `INVITE#<hash>` / `META` with `householdId`, `createdBy` and `expiresAt` (7 days, also the DynamoDB TTL). `usedBy` is left out until the invite is used.
   - a pointer, `HH#<hid>` / `INVITE#<hash>`, with the same `expiresAt`, so the household can list its open invites

   It returns `409 household_full` instead if `memberCount` is already 2. Otherwise it returns the link `https://<host>/join#<token>`. The token sits after `#` so it never reaches server logs.
2. The invitee opens the link. The SPA keeps the token in `localStorage` with a 1-hour expiry, so it survives an email verification step that opens a new tab, and starts sign-in:
   - Auth0 mode: Auth0 login or sign-up
   - local mode: a create-account form, which is only allowed with a valid token. `POST /api/auth/signup-with-invite` creates the account and joins the household in one transaction, so a failed join never leaves an account with no household.
3. In Auth0 mode, the SPA calls `POST /api/invites/accept` with the token. (In local mode, sign-up has already joined the household.) The server reads the invite first. If it's missing, revoked or past `expiresAt`, it returns `410 invite_expired` (CUJ 10). Otherwise, in one transaction, it:
   - updates the invite: sets `usedBy`, only if `usedBy` is missing
   - updates the household's `META`: sets `memberCount = 2`, only if `memberCount` equals 1
   - deletes the household's invite pointer
   - writes the new member's `MEMBERSHIP` (put-if-absent, so a user already in a household can't join another) and `MEMBER` items

   A second use of the same link fails on `usedBy`. A third member fails on `memberCount` and gets `409 household_full`. A retry from the user who already accepted (`usedBy` is the caller) returns 200. A caller who's already in another household gets `409 already_member`, unless they're its only member and it has no tasks or items. The accept then returns `409 { error: 'already_member', canMove: true }`, the SPA asks them to confirm moving, and a second accept with `confirmMove: true` updates their `MEMBERSHIP` to the new household (only if it still names the old one) and deletes the empty household's `META`, `MEMBER` and invite pointers, in the same transaction as the join (CUJ 11). The no-household screen leads with "Waiting for an invite? Open the link your partner sent you", before "Create a household", so this case is rare. The SPA removes the token from `localStorage` once the accept call returns.
4. **Revoking.** `DELETE /api/hh/invites/:hash` deletes the invite and its pointer. `GET /api/hh/invites` lists open invites from the pointers.
5. **Removing a member.** `DELETE /api/hh/members/:userId` is only allowed for the household's creator (`META.createdBy`), and never on themselves. It's one transaction: delete that member's `MEMBERSHIP` and `MEMBER` items and set `memberCount` from 2 back to 1. Nothing else is rewritten. Instead, `ownership.ts` and the views read the data in the light of who's a member:
   - a task assigned to a non-member, or whose `overrideAssignee` is a non-member, counts as `either`
   - a `both` task in a one-member household counts as `either`, so the remaining member can change it directly
   - a pending proposal from or to a non-member reads as `stale`
   - history shows a non-member as "Former member"

### Sign-up alerts

Open sign-up only exists in Auth0 mode; local mode is invite-only. So the alerts watch Auth0 sign-ups and household changes:
- **New accounts.** An Auth0 post-login Action in the author's tenant runs only on an account's first login (`event.stats.logins_count` is 1), for any sign-in method, and publishes a `user_first_seen` event to the SNS topic below. It needs no Hearthwise API code. Its source is kept in `infra/auth0/first-login.js`, and its AWS credentials are limited to publishing to that one topic and stored as Action secrets.
- **Households.** The API emits a structured `security_event`, `{ event: 'household_created' | 'invite_accepted', userId, householdId, at }`, when a household is created and when an invite is accepted.
- **Delivery.** Every event goes to an SNS topic (`ALERT_TOPIC_ARN`) with an email subscription to the address in the `alert_email` OpenTofu variable, so there's one email per event. A publish failure is logged and never fails the request. In the container, household events are only logged, because local mode has no open sign-up to watch.
- **Privacy.** Alerts carry ids and the event type, never emails or names.

### Data model (single table)

All dates in tasks are **local calendar dates** (`YYYY-MM-DD`) in the household's timezone, which is stored on the household. Chores are due on a day, not at a time.

| Item | PK | SK | Key attributes |
|---|---|---|---|
| Membership lookup | `USER#<userId>` | `MEMBERSHIP` | `householdId` |
| Push subscription | `USER#<userId>` | `PUSHSUB#<hash>` | as in Hoardwise |
| Invite | `INVITE#<sha256>` | `META` | `householdId`, `createdBy`, `expiresAt`, `usedBy` |
| Household | `HH#<hid>` | `META` | `name`, `timezone`, `createdBy`, `createdAt`, `memberCount` |
| Member | `HH#<hid>` | `MEMBER#<userId>` | `displayName`, `settings`, `joinedAt`, `lastDigestSent`, `lastNudgeSent` |
| Open invite pointer | `HH#<hid>` | `INVITE#<sha256>` | `createdBy`, `expiresAt` |
| Task (chore or to-do) | `HH#<hid>` | `TASK#<taskId>` | `title`, `notes`, `fieldTimes`, `assignee`, `overrideAssignee`, `overrideCycle`, `repeat`, `dueOn`, `cycleSeq`, `ruleVersion`, `checklist`, `checklistState`, `status`, `doneAt`, `createdBy`, `updatedAt`, `deletedAt`, `deletedBy`, `expiresAt` |
| Completion | `HH#<hid>` | `DONE#<taskId>#<cycleSeq>` | `cycleDueOn`, `by_<userId>` (one attribute per person who completed it, holding their `completedAt`), `checklistState`, `together`, `clearedOverride`, `setDueOn`, `expiresAt` (400 days) |
| Task edit history | `HH#<hid>` | `EDIT#<taskId>#<at>` | `byUserId`, `fields`, `expiresAt` (400 days) |
| Proposal | `HH#<hid>` | `PROPOSAL#<id>` | `taskId`, `fromUserId`, `toUserId`, `change`, `baseRuleVersion`, `baseCycleSeq`, `status`, `expiresAt` (30 days after it's resolved) |
| Shopping item | `HH#<hid>` | `ITEM#<itemId>` | `text`, `quantity`, `ticked`, `tickedBy`, `fieldTimes`, `updatedAt`, `deletedAt`, `deletedBy`, `expiresAt` |
| Held push | `HH#<hid>` | `HELD#<recipientId>#<createdAt>` | `title`, `body`, `ref` (task and cycle, for a completion), `releaseAt`, `expiresAt` (24 h) |
| Write record | `HH#<hid>` | `MUT#<mutationId>` | `status`, `result`, `expiresAt` (8 days) |

`cycleSeq` is zero-padded to 8 digits inside keys, so completion records sort in order. Local-mode login items (`AUTH#…`) are described in "Identity and the household guard".

Notes on the model:
- **`assignee`** is a member's user id, `either` or `both`:
  - `either`: whoever gets to it.
  - `both`: a job done together, like the big shop or a deep clean. Either person's tap completes it for both, and the `DONE` record sets `together: true` so history credits both members. It uses the normal completion rules; the only addition is the `together` flag. It shows in both people's lists and "next thing", and reads "Together".
- **`repeat`** is one of:
  - `{ type: 'none' }`: a to-do
  - `{ type: 'after', days: N }`: due N days after the cycle is completed
  - `{ type: 'fixed', every: N, unit: 'day' | 'week' | 'month', weekdays?: [...], dayOfMonth?: n, startOn: 'YYYY-MM-DD' }`. `startOn` anchors "every N", and defaults to the date the task was created:
    - days: occurrences are `startOn` plus whole multiples of N days
    - weeks: occurrences fall on the listed `weekdays` in every Nth week, counted from the week containing `startOn`. Weeks start on Monday.
    - months: `dayOfMonth` sets the day (it defaults to `startOn`'s day), and every Nth month from `startOn` counts. A day of 29–31 falls on the month's last day in shorter months.
- **`cycleSeq`** is an integer that starts at 1 and goes up by 1 on every completion. It identifies the current cycle. It only goes back when an undo returns it to the undone cycle, whose `DONE` record the undo deleted. Unlike a date, an early completion or an edit that moves `dueOn` back can't make it collide with an earlier cycle's record.
- **`ruleVersion`** is a counter that goes up by 1 whenever `assignee` or `repeat` changes, or the task is deleted or restored. Completions, `dueOn` edits, swaps, title, notes and checklist edits, and checklist ticks don't change it, so everyday use doesn't make a pending proposal or schedule edit stale. Changes to the current cycle are tracked by `cycleSeq` instead. `updatedAt` changes on every write.
- **`fieldTimes`** holds the client timestamp at which each of `title`, `notes` and `checklist` was last set, as shopping items do for their fields.
- **`checklist`** is a list of steps, `[{ id, text }]`. **`checklistState`** records each step's tick separately: `{ [stepId]: { done, at } }`.
- **`dueOn`** is optional for to-dos. A to-do with no date appears in a "Whenever" group after Later, and "next thing" only shows it once nothing dated is due.
- **`status`** is `open` or `done`. Only to-dos reach `done`, and then `doneAt` is set. Chores stay `open` and their `dueOn` moves on.
- **Ids are created on the client** (UUIDv7) so offline creates can be replayed safely: the server writes them put-if-absent.
- **Deleted tasks and items go to a 30-day recycle bin.** A delete sets `deletedAt`, `deletedBy` and `expiresAt = deletedAt + 30 days` (DynamoDB TTL) on the item itself, which becomes a tombstone. The SQLite store's maintenance job deletes expired rows, as Hoardwise's does. This mirrors Hoardwise's own 30-day trash (`src/api/trash.ts`, `app/routes/deleted.tsx`). Hearthwise keeps the tombstone in place instead of moving it to a separate `TRASH#` item, because clients already need tombstones to drop deleted rows.
- **Records that build up automatically expire.** A done to-do gets `expiresAt = doneAt + 30 days`, and the task list leaves out to-dos done more than 7 days ago. Completion and edit history records expire after 400 days. Resolved proposals expire after 30 days.

#### Member settings

- `digest`: `{ on: boolean, hour: 0–23 }`, off by default
- `dueNudges`: `{ on: boolean, hour: 0–23 }`, off by default
- `quietHours`: `{ start: 0–23, end: 0–23 } | null`, in the household's timezone. `start` greater than `end` wraps past midnight (for example 22 to 7), as Hoardwise's `isQuietHour` handles.
- `defaultView`: `list` or `next`

Defaults for a new member: digest off at 19:00, due nudges off at 08:00, no quiet hours, `list` view. All hours are whole hours, to match Hoardwise's hourly push schedule and its `src/push/select.ts` helpers.

### Task writes

- **Create.** `POST /api/hh/tasks` with a client-made id, written put-if-absent. A replayed create finds the task already there and returns it unchanged. A new task starts with `cycleSeq: 1` and `ruleVersion: 1`.
- **Update.** `PATCH /api/hh/tasks/:id` changes only the fields it names. There's no full-replace route.
  - `title`, `notes` and `checklist` carry a client timestamp each. A field is applied only if its timestamp is newer than the one in `fieldTimes`, so a replayed old edit can't overwrite a newer one.
  - Checklist ticks are sent per step, `{ [stepId]: { done, at } }`. Each step is applied only if its `at` is newer. Two people ticking different steps both keep their ticks. Each tick also carries the `cycleSeq` it was made in, and is dropped (200, no write) if that's no longer the current cycle, so a tick made before a completion can't re-tick the next cycle.
  - **Schedule fields** must come with the versions the client saw. `assignee` and `repeat` carry `baseRuleVersion`. A `dueOn` change on its own carries `baseRuleVersion` and `baseCycleSeq`. The server applies them with a conditional update that requires those to still match, and returns 409 if they don't. An `assignee` or `repeat` change bumps `ruleVersion`.
  - A `repeat` change also carries a suggested `dueOn`, unless the new rule is `none`, and the server returns 400 if it's missing. The task sheet fills it in with the first date the new rule gives on or after today, and the person can change it. On apply, the suggestion is used if it's on or after today. Otherwise the server uses the first date the new rule gives on or after today, so completing the chore in the meantime doesn't make the change fail. The same applies to an `edit` proposal that sets `repeat`.
  - A `repeat` change clears `overrideAssignee` and `overrideCycle`, and the task sheet warns "This cancels \<name\>'s swap" first. A `dueOn` change keeps a swap, because a swap is tied to the cycle, not the date.
  - Timestamps more than 5 minutes ahead of server time are clamped to server time.
  - The handler loads the task, applies the patch and writes it with `ifEquals` on `updatedAt`, retrying up to 3 times if another write got there first.
- **Who writes `dueOn`.** Only a schedule `PATCH`, a completion, a completion undo and a proposal accept. Nothing else changes it.
- **Delete.** `DELETE /api/hh/tasks/:id` carries the `ruleVersion` the client saw, and turns the task into a tombstone only if `ruleVersion` still matches and `deletedAt` is missing. A restore and an assignee change both bump `ruleVersion`, so a retried delete can't undo a restore, and a task that has just become the other member's can't be deleted without their approval. The phone's own earlier edits, ticks and completions don't change `ruleVersion`, so they never block its delete. A delete bumps `ruleVersion`. Deleting a tombstone again does nothing.
- **Tombstones.** Any write to a deleted task returns 410 and is dropped, whether live or replayed. Only a restore from the recycle bin brings a task back.
- **The other person's task.** Some writes need the owner's approval. See "Proposals".

### Completing a task

#### Rules

The client sends `POST /api/hh/tasks/:id/complete` with `{ cycleSeq, completedAt }`. `cycleSeq` is the cycle the client showed. `completedAt` is the client's time of the tap, clamped to at most server time + 5 minutes. The **completion day** is `completedAt` as a date in the household's timezone, so a completion replayed hours later still counts on the day it happened.

The server loads the task (410 if it's deleted), then:

1. **`cycleSeq` equals `task.cycleSeq`** (the current cycle). The server works out `nextDueOn` and runs **one transaction** with two writes:
   - put `DONE#<taskId>#<cycleSeq>`, only if absent. It records `cycleDueOn` (the task's `dueOn`), `by_<caller>: completedAt`, the `checklistState` as it was, `together` for a `both` task, any `overrideAssignee`/`overrideCycle` it clears (`clearedOverride`), and the `dueOn` the update sets (`setDueOn`).
   - update the task, only if `cycleSeq` still equals the sent value, `deletedAt` is missing and `updatedAt` is unchanged since the load: `cycleSeq + 1`, `dueOn = nextDueOn`, clear `checklistState`, `overrideAssignee` and `overrideCycle`. For a to-do, it sets `status = done`, `doneAt` and the 30-day `expiresAt` instead of moving `dueOn`.

   The write record is the transaction's third write. This needs the transaction-level conditional update described in "Store extension".
2. **The transaction fails because the `DONE` record already exists.** Someone else completed this cycle first. The server adds `by_<caller>: completedAt` to the `DONE` record with a conditional update (only if that attribute is missing and the record exists), plus the write record, and returns 200 with the current task. The date doesn't move again. If the caller's attribute is already there, for example from a tap on a second phone, it returns 200 and writes nothing.
3. **`cycleSeq` is lower and that cycle's `DONE` record exists.** Same as rule 2.
4. **`cycleSeq` is higher.** The phone saw a completion that was later undone, so the cycle it shows is ahead of the task. The person still did the chore, so the server completes the current cycle as in rule 1, using the client's `completedAt`.
5. **`cycleSeq` is lower with no `DONE` record.** The phone's copy is out of date. The server returns 409 with the current task. The client refreshes, and the banner shows "Changed on \<name\>'s phone, please check", so the action isn't lost silently.

If the transaction fails and no `DONE` record exists, another write landed between the load and the transaction (for example a delete, a `dueOn` edit or an accepted swap). The server reloads and applies the rules again, up to 3 times, so a task deleted mid-request returns 410.

An edit that moves `dueOn` doesn't change `cycleSeq`, so a phone showing the old date still completes the current cycle.

A retry of a completion that already landed is answered from its write record (see "Retries"), so it never completes the next cycle. The response always includes the `cycleSeq` that was completed, and the undo toast uses it.

#### Undo

`DELETE /api/hh/tasks/:id/completions/:cycleSeq` takes back the caller's own completion of that cycle.
- It has no time limit on the server. How long the undo toast stays is a per-device client preference (10 s, 30 s or until closed), kept from Hoardwise's `undoDuration.ts` and stored in the browser like Hoardwise's other display preferences, not in `settings`.
- It removes the caller's own `by_<caller>` attribute. What else happens depends on who else did it:
  - **The caller has no attribute on that cycle**, for example a retried undo. It returns 200 and writes nothing.
  - **The other member also did it.** One conditional update removes the caller's attribute (only if it's still there). The cycle stays done and the date doesn't move, because the chore was done.
  - **The caller is the only one who did it.** The cycle reopens. Allowed only while the task is still as that completion left it: `cycleSeq` is one higher than the undone cycle, and `dueOn` equals the `setDueOn` on the `DONE` record (or `status` is still `done` for a to-do). It's refused with 409 if a swap was accepted for the next cycle after the completion (`overrideCycle` equals the current `cycleSeq`), so an agreed swap isn't silently lost. One transaction:
    - update the task: `cycleSeq` and `dueOn` back to the undone cycle's values, and `checklistState` and any `clearedOverride` restored from the `DONE` record. For a to-do, `status` goes back to `open`, and `doneAt` and `expiresAt` are removed.
    - delete the `DONE` record, only if the other member's attribute is still missing. If the other member's "also did it" landed at the same moment, the server reloads and applies these rules again.
- From step 6, undoing a completion also deletes any `HELD` push that refers to it, so the other person isn't told about a chore that was taken back.
- A cycle counts as done while its `DONE` record exists. History lists everyone with a `by_` attribute on it, earliest first. If a reopened cycle is completed again later, the new `DONE` record is written with the same `cycleSeq`.

#### Working out the next due date

Pure functions, shared by client and server:
- **`after`**: `nextDueOn = max(completion day + days, cycleDueOn + 1 day)`. A late hoover is next due a day after it was done. A chore done early still moves past the cycle it completed.
- **`fixed`**: the first occurrence of the rule strictly after `cycleDueOn`, then repeatedly the next occurrence until it's after the completion day. Completing "every Sunday" on Friday moves it to the Sunday after the cycle's Sunday, and missed weeks don't pile up as a backlog. A daily fixed chore completed late moves to tomorrow.
- **`none`**: no next date.
- **Partly ticked checklists**: ticking a step saves that step through `PATCH`. The chore only completes when someone marks it done.

### Shopping-list conflicts

Each item has `fieldTimes`, the client timestamp at which each of `text`, `quantity` and `ticked` was last set. When a write arrives, live or as a replayed paused mutation, the server:
- **applies a field only if its timestamp is newer** than the stored one, so an edit with an older timestamp never overwrites a newer one
- **treats a tombstone as final for edits**: an edit to a deleted item is dropped and reported as such. Only an explicit restore from the recycle bin brings an item back (see "Recycle bin").
- **clamps timestamps**: anything more than 5 minutes ahead of server time is set to server time

**"Clear ticked items"** sends one batch. Each entry carries the item's `fieldTimes.ticked` as the client saw it. The server deletes an item only if it's still ticked and its stored `fieldTimes.ticked` is at or before that value. The response lists the ids it skipped, and the client shows, for example, "1 item kept: it was unticked on another phone".

**Deleting one item** is `DELETE /api/hh/items/:id`. It can also be sent as a batch entry. It tombstones the item if it isn't already deleted. A retry of a delete that already landed is answered from its write record, so it can't overturn a later restore.

### Recycle bin

- **Deleted page.** A "Deleted" page (linked from Settings, as Hoardwise's is) lists the household's deleted tasks and shopping items from the last 30 days, with who deleted each one and when. It needs no extra API call: it filters the tombstones that the task and item lists already return.
- **Restoring** is `POST /api/hh/restore` with a list of `{ kind, id }` entries. Each entry is a conditional update that clears `deletedAt`, `deletedBy` and `expiresAt`, and requires `deletedAt` to be present, so restoring twice does nothing. It bumps a task's `ruleVersion`. The item comes back exactly as it was when deleted. Edits made to the tombstone in the meantime were dropped and aren't replayed. A restored done to-do gets its 30-day `expiresAt` back.
- **Who can restore.** Either member can restore any shopping item and any task assigned to themselves or `either`. A task assigned to the other member or to `both` comes back with `proposal_required` for that entry, and the client creates a `restore` proposal (see "Proposals").
- **Restored chores** keep their old `dueOn`, so a chore restored after its due date shows as "due".
- **Undo** on the delete toast, and on "Clear ticked", calls the same route with the ids just deleted.
- **Purge.** After 30 days the item is deleted for good (DynamoDB TTL, or SQLite maintenance). Phase 1 has no "empty bin now" action.

### Proposals

- **A member's own task, or one assigned to `either`:** edits apply directly, except assigning it to the other member or to `both` (below).
- **A `both` task** is a job done together, so it counts as both members' task. Schedule changes and deletion need a proposal; title, notes and checklist edits apply directly. (Author decision, 2026-11-11.)
- **These create a proposal** for the other member (`toUserId`) to accept or decline:
  - on a task assigned to the other member or to `both`: changing its assignee, due date or repeat rule, or deleting it
  - on the other member's task: a one-off swap
  - creating a task for the other member or for `both`, or assigning any task to them. The client sends the create with `assignee: either`, then an `edit` proposal that sets `assignee`, as two queued mutations. The task stays `either` until they accept.
  - restoring a deleted task assigned to the other member or to `both`
- **Always direct:** on the other member's task, title, notes and checklist edits apply directly, and the edit is recorded in the task's history with who made it. Checklist ticks and "I did this today" apply directly too.
- **Proposal `change` shapes:**
  - `{ kind: 'edit', set: { assignee?, dueOn?, repeat? } }`: a permanent change. A `repeat` change includes a suggested `dueOn`, as in "Task writes".
  - `{ kind: 'swap' }`: a one-off swap. The task's current cycle goes to the proposer, and the next cycle reverts to the owner.
  - `{ kind: 'delete' }`
  - `{ kind: 'restore' }`
- **How the server decides.** A `POST`, `PATCH`, `DELETE` or restore that needs a proposal returns `403 proposal_required` without writing anything. The task sheet knows these cases in advance, so the UI shows "Ask \<name\>" instead of "Save" and sends `POST /api/hh/proposals` instead. If a replayed mutation gets `proposal_required` because the task changed hands while the phone was offline, it goes to the banner with an "Ask \<name\>" action. The client never creates a proposal on its own.
- **Delivery.** The recipient sees pending proposals in the app, returned with `GET /api/hh/tasks`. They get a push only if the proposer ticked "Let \<name\> know". The proposer also sees their own proposals resolved in the last 7 days, so a stale one shows "No longer applies: the task changed" instead of disappearing.
- **Who acts.** Only `toUserId` can accept or decline. Only the proposer can withdraw a pending proposal, with `POST /api/hh/proposals/:id/withdraw`.
- **Acceptance.** A proposal records the task's `ruleVersion` when it's made (`baseRuleVersion`). A swap, or an edit that changes `dueOn` without changing `repeat`, also records `cycleSeq` (`baseCycleSeq`). Accepting applies the change in one transaction: a conditional update that requires those to still match, plus marking the proposal accepted, only if its `status` is still `pending`. If the rule changed in the meantime (an assignee or repeat change, a delete or a restore, including through another accepted proposal), or the cycle a swap or date change was about has been completed, the proposal is marked `stale` (again only if still `pending`) and nothing is applied. A completion never makes an edit to the repeat rule or assignee, a `delete` or a `restore` proposal stale.
- **Retries and races.** Accept, decline and withdraw all require `status = pending`. A retried call is answered from its write record, so a retried accept never marks an applied proposal `stale`. If a withdraw and an accept race, whichever lands second gets 409 and the proposal as it now is.
- **One-off swaps.** Accepting a swap sets `overrideAssignee = proposer` and `overrideCycle = task.cycleSeq`. Lists, "next thing" and nudges use `overrideAssignee` while `cycleSeq` still equals `overrideCycle`. Completing that cycle clears both fields and stores them on the `DONE` record, so undoing the completion brings the swap back. A `repeat` change also clears them. A swap can't outlive its cycle, because it only applies while `cycleSeq` equals `overrideCycle`.
- **"I did this today":** a one-tap action on every task, including the other person's. It calls the normal complete route for the task's current cycle, so the same duplicate handling applies. No proposal is needed: doing a chore for someone isn't a change to it. Done before its due date, it still completes the current cycle. An `after` chore counts from today, and a `fixed` chore moves to its next occurrence after the cycle.

### Sync and offline on the client

- **Polling.** The client refetches two lists, `GET /api/hh/tasks` (which also carries pending proposals) and `GET /api/hh/items`, when the app regains focus and every 10 seconds while it's visible. At two members and under 500 records, refetching whole lists costs little (see "Performance & Cost" under Non-Functional Requirements). Each response carries a `serverTime`.
- **Pending writes win over a refetch.** Polling carries on while writes are pending, so the other person's changes keep arriving even while a write retries on weak signal. Each mutation's optimistic change is a pure function, and the list queries apply every pending mutation's change on top of the server data, so a refetch can't hide a pending tick. A refetch response whose request started before the latest household mutation settled is ignored, because it may not include that write.
- **Persisted cache.** The query cache is saved to IndexedDB and restored on launch, so the last-known lists show immediately, even with no signal.
  - The IndexedDB key includes the user id. On restore, an entry whose user id doesn't match the signed-in user is thrown away.
  - At sign-in, the app stores the user id in `localStorage`. On launch it opens the persisted cache with that id before any network call, so the cached lists show with no signal, even if the access token has expired. The cached lists render without waiting for the login provider to finish.
  - The persister saves with no throttle, and the app also saves on `visibilitychange` (hidden) and `pagehide`, so a write made just before the app closes is kept.
  - The saved cache records a `schemaVersion`. See "Risks and Mitigations" for what a new build does with an older one.
- **Service worker.** It precaches the built app shell and assets so the PWA can launch offline. It also caches `/config.json` (the runtime login settings, written after the build), stale-while-revalidate: it answers at once from the cached copy and refreshes it in the background, so a launch with no signal or weak signal starts straight away. That's the only request outside the shell it caches. It also receives push events and shows notifications. API responses are not cached by the service worker. The persisted query cache handles that, so there's one source of cached data. A new service worker waits for the next launch: it doesn't call `skipWaiting()` while a page is open, so an open page never loads files from a different build.
- **Offline writes.** These use TanStack Query v5's built-in paused mutations, not a custom queue:
  - A mutation started while offline is paused, and kept in the same persisted IndexedDB cache as the query data.
  - Every mutation has a key, and its function is registered with `queryClient.setMutationDefaults(key, …)` at start-up, so paused mutations can be replayed after a reload. **A mutation without registered defaults must never be used for household writes.** A test enforces this.
  - All household mutations share `scope: { id: 'household' }`, so they run one at a time, in order.
  - Each mutation reads the base versions it sends (`baseRuleVersion`, `baseCycleSeq`) when it runs, not when it was queued, from the list data with pending mutations applied (the same overlay the views show), so the phone's own earlier pending writes are already counted.
  - **Every pending household mutation is persisted**, whether it's paused or waiting to retry, so a reload during backoff doesn't lose it.
  - On restore, every hydrated pending mutation is marked as paused. Then, after the cache is restored and whenever the connection comes back, the app calls `queryClient.resumePausedMutations()`, then invalidates the task and item queries.
  - The overlay shows each write immediately; the cached server data itself is only changed by refetches.
  - Every Hearthwise write is safe to replay, so an interrupted replay can be retried:
    - a retry of a write that already landed is answered from its write record (see "Retries")
    - creates use client ids, written put-if-absent
    - edits from two people arriving out of order are settled by field timestamps (fields and checklist ticks) and base versions (schedule changes, ticks' `cycleSeq`)
    - deletes, restores, "clear ticked" and proposal transitions are conditional on the state they expect
  - Error handling, in each mutation's `onError`:
    - **409 or 410:** drop the mutation and refetch. A dropped 409 for something the person did (a completion, an edit, a delete) is listed in the banner as "Changed on \<name\>'s phone, please check".
    - **`403 proposal_required`:** drop the mutation and list it in the banner with an "Ask \<name\>" action.
    - **401, or a sign-in error such as Auth0's `login_required`:** the mutation stays paused and the app asks the person to sign in again. Once the same user is signed in, writes resume. A different user never gets them.
    - **Other 4xx:** drop the mutation and show it in a "couldn't save" banner.
    - **Network failure or timeout** (the fetch rejects, or hits the 10-second `AbortSignal.timeout` every API fetch has, often in a shop with weak signal while the browser still reports online): retried until it succeeds, as Hoardwise's `useSaveWithUndo` queues on any network failure. Each attempt backs off, up to 60 seconds apart.
    - **5xx:** retried up to 3 times with backoff, then shown in the banner.
  - **Proven first.** Step 5 starts with a spike that tests this setup against five cases: the app killed during a retry backoff, killed within 1 second of a write, a switch of account on the same browser, a cold launch with no network, including with an expired access token, and a launch on weak signal (throttled, with packet loss). If the spike fails, Hearthwise uses Alternative K (a custom write queue) instead.
- **Signing out** clears the persisted cache, including that user's pending writes. If writes are still pending, sign-out first asks for confirmation and says how many would be lost. Another account's pending writes on the same browser are never restored or sent, as in Hoardwise.

### Notifications

The rule for who gets notified is set by the "No surprise notifications" goal. This section covers how it's built.

- **"Let \<name\> know" (sender-chosen).** Every write route that changes shared data accepts an optional `notify: true`, along with the mutation's id and `clientAt`, the client time of the action:
  - task create, update, delete and complete
  - item writes
  - proposals

  The UI shows a "Let \<name\> know" checkbox, unticked by default, beside the action. When it's ticked, the handler sends one web push to the other member describing the change ("Sam hoovered"), **before** it returns the response:
  - It's sent only after the write itself succeeds. A write that ends in 403, 409 or 410 notifies nobody.
  - The push gets a 2-second timeout. A failure or timeout is logged and never fails the request.
  - It's sent only when the write record is new, so a retry of the same write sends nothing.
  - A replayed write whose `clientAt` is more than 30 minutes old sends no push, because the news is stale.
  - If the recipient is in quiet hours, the push is stored as a `HELD` item, with a reference to the task and cycle for a completion, and sent when their quiet hours end. Undoing a completion deletes its held push.
  - One batch request sends one combined push ("3 items added to the shopping list"). Replayed mutations are sent one at a time, so each sends its own push, subject to the 30-minute rule.
  - Expired subscriptions (404/410) are removed, as in Hoardwise.
- **Opt-in reminders.** The push Lambda runs hourly, as Hoardwise's does (`cron(0 * * * ? *)`). It finds recipients the way Hoardwise does: it lists users with push subscriptions, then looks up each one's household through `MEMBERSHIP`, so there's no scan. In the household's timezone, for each such member:
  - **Digest:** if they turned the digest on, the local hour is their chosen hour (or up to 2 hours after it, in case a run was missed, but never past local midnight), and `lastDigestSent` isn't today, it sends one notification listing what's due today or earlier and not done, assigned to them (the swapped assignee where a swap applies), `either` or `both`. If nothing is due, no digest is sent.
  - **Due nudges:** under the same hour and `lastNudgeSent` rules, it sends one notification per task due today that's assigned to them, `either` or `both`.
  - **Held pushes:** it claims each held push whose release time has passed by deleting it (only if it's still there), and sends it only if that delete succeeded, so overlapping runs can't send it twice. Items past `expiresAt` that TTL hasn't removed yet are skipped.

  Before sending a digest or nudges, the scheduler sets `lastDigestSent` or `lastNudgeSent` to today with a conditional update on the value it read. A duplicate or overlapping run fails that condition and sends nothing.

  Both reminder types are off by default. Quiet hours apply only to "Let \<name\> know" pushes. A member's own digest and nudges are sent at the hour they chose, even if it falls inside their quiet hours. Settings shows a note when it does.
- **Notification tags.** Each push carries a tag, so a phone groups them without hiding any: one per task and day for nudges, one per `mutationId` for "Let \<name\> know", and one per day for the digest.
- **Self-hosted mode.** This is new: Hoardwise's container has no push.
  - VAPID keys come from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` environment variables. If those aren't set, a key pair is generated on first start and saved to `vapid.json` in the data folder (file mode 0600).
  - The container sends web-push directly from the API process for "Let \<name\> know".
  - The scheduler runs from Hoardwise's existing hourly maintenance loop (`startMaintenance` in `container/maintenance.ts`), not a new timer. It only compares the current local hour, so the loop doesn't need to be aligned to the hour.
- **iPhone.** Web push only works once the PWA has been added to the Home Screen, on iOS 16.4 or later. Settings has a `PushCheck` panel, copied from Hoardwise, that shows whether push works on this device and, on an iPhone not installed to the Home Screen, the install steps. The Today page shows a one-time prompt pointing to it.

### Views

- **Full list:** every open task with the assignee shown, in four groups: Today (due today or earlier), This week, Later, and Whenever (to-dos with no date).
- **Next thing:** a single card showing the earliest-due open task assigned to the viewer, `either` or `both`. It has "Done" and "Not now" buttons. "Not now" moves to the next card for this session only. It doesn't change the task, so it never notifies the other person.
- **Overdue wording:** past-due items show "due" and the date, never "overdue". No red states.

### API routes (phase 1)

#### Household, members and invites

| Method and path | Purpose |
|---|---|
| `POST /api/households` | Create a household for a caller with none (first run; outside the household guard) |
| `GET /api/hh` | Household, members and the caller's settings |
| `PATCH /api/hh/members/me` | Update own display name and settings |
| `DELETE /api/hh/members/:userId` | Remove the other member (household creator only) |
| `POST /api/hh/invites` | Create an invite link |
| `GET /api/hh/invites` | List open invites |
| `DELETE /api/hh/invites/:hash` | Revoke an invite |
| `POST /api/invites/accept` | Join with a token (outside the household guard) |

#### Tasks and proposals

| Method and path | Purpose |
|---|---|
| `GET /api/hh/tasks` | `{ tasks, proposals, serverTime }`: tasks (with tombstones from the last 30 days, so clients can drop them, and without to-dos done more than 7 days ago) pending proposals that involve the caller, and the caller's own proposals resolved in the last 7 days |
| `POST /api/hh/tasks` | Create a task (put-if-absent on the client id) |
| `PATCH /api/hh/tasks/:id` | Update named fields: field-timestamped edits, per-step ticks, or schedule fields with their base versions |
| `DELETE /api/hh/tasks/:id` | Tombstone a task |
| `POST /api/hh/tasks/:id/complete` | Complete the current cycle: `{ cycleSeq, completedAt }` |
| `DELETE /api/hh/tasks/:id/completions/:cycleSeq` | Undo a completion (see "Undo") |
| `GET /api/hh/tasks/:id/history` | Completions (everyone who did each cycle, and `together`) and direct edits by the other member, newest first |
| `POST /api/hh/proposals` | Create a proposal |
| `POST /api/hh/proposals/:id/accept` | Accept (recipient only) |
| `POST /api/hh/proposals/:id/decline` | Decline (recipient only) |
| `POST /api/hh/proposals/:id/withdraw` | Withdraw (proposer only) |

#### Shopping list and recycle bin

| Method and path | Purpose |
|---|---|
| `GET /api/hh/items` | Shopping list (tombstones from the last 30 days included, so clients can drop them) |
| `PUT /api/hh/items/:id` | Create or update an item, using field timestamps |
| `DELETE /api/hh/items/:id` | Delete one item |
| `POST /api/hh/items/batch` | Up to 100 item writes at once, including conditional "clear ticked" deletes; returns a result per id |
| `POST /api/hh/restore` | Restore from the recycle bin: `{ entries: [{ kind: 'task' \| 'item', id }] }`, up to 100; returns a result per id |

#### Push and local login

| Method and path | Purpose |
|---|---|
| `POST /api/push/subscriptions` | Subscribe, as in Hoardwise |
| `DELETE /api/push/subscriptions` | Unsubscribe, as in Hoardwise |
| `POST /api/auth/setup` | Local mode only: first-run account |
| `POST /api/auth/login` | Local mode only |
| `POST /api/auth/logout` | Local mode only |
| `POST /api/auth/signup-with-invite` | Local mode only: create an account with an invite token |

## Alternatives Considered

Each decision below is recorded in [`discussion_summary.md`](../../discussion_summary.md) or in [`zoom_out_report.md`](../reviews/zoom_out_report.md), as linked. The letters here are this document's own: `discussion_summary.md` uses "option B" for the chosen design, a separate app, and "C" for what is Alternative B here.

### Alternative A: Build the household features inside Hoardwise

*   **Pros**:
    - Reuses everything with no copying: auth, store, push, offline queue, infrastructure.
    - One app to install, and a natural home for the money tracker later.
*   **Cons**:
    - Hoardwise keys all data to one user (`PK = USER#<id>`). Shared household data would mean a second ownership model running through every handler and test.
    - Hoardwise would grow from a personal budgeting app into a general household app, against its own design aim of being gentle on attention.
*   **Reason for Rejection**: Rejected by the author. Separating them costs copied code that drifts apart, but keeps Hoardwise's data model and focus intact. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Decisions made" 1.

### Alternative B: Separate app with a Hoardwise integration from the start

*   **Pros**:
    - Money-tracker settlements could flow into each person's Hoardwise budget as transactions from day one.
*   **Cons**:
    - Phase 1 has no money tracker, so there's nothing to integrate yet.
    - It ties the two apps' auth and release cycles together early.
*   **Reason for Rejection**: Deferred by the author. The integration delivers nothing until phase 3. The money-tracker data model (phase 3) keeps it possible. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Decisions made" 2.

### Alternative C: Keep using existing apps (FamilyWall or Cozi, plus Tody, plus Splitwise)

*   **Pros**:
    - No build cost.
    - Tody already has completion-based chore intervals.
    - A two-week trial would test the chore-interval requirement cheaply.
*   **Cons**:
    - Still three apps.
    - No DIY projects.
    - None is designed for two people with different needs sharing one set of data.
*   **Reason for Rejection**: Rejected by the author. A trial of single-user chore apps could test chore intervals, but can't confirm or rule out the two-person, mixed-needs parts of the design. Skipping it is recorded as an accepted risk in "Risks and Mitigations". Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Alternatives weighed".

### Alternative D: Native iOS and Android apps

*   **Pros**:
    - Reliable push on iPhone without Home Screen installation.
    - Storage isn't evicted the way Safari can evict data for sites not on the Home Screen.
    - Home Screen widgets.
*   **Cons**:
    - Publishing to the App Store needs the [Apple Developer Program](https://developer.apple.com/programs/enroll/), at US$99 a year, even for a free app, and Apple [doesn't waive the fee](https://developer.apple.com/help/account/membership/fee-waivers/) for individuals. Builds installed from Xcode without it expire after 7 days. Checked 2026-11-10.
    - Two more codebases, or a cross-platform framework, on top of the web app.
*   **Reason for Rejection**: Rejected by the author. A yearly fee and a second codebase outweigh the PWA's push and storage limits, which "Risks and Mitigations" covers. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Decisions made while drafting the design".

### Alternative E: AWS only, no self-hosting

*   **Pros**:
    - Removes the SQLite store, the container, multi-account local login and container push from phase 1. Multi-account local login is the main new security-sensitive code.
*   **Cons**:
    - Hearthwise can't run outside AWS.
    - Adding SQLite and local login later means porting them from Hoardwise after the two codebases have drifted apart.
*   **Reason for Rejection**: Rejected by the author, who chose parity with Hoardwise's deployment options from the start: building both targets now, while the copied code still matches, costs less than porting self-hosting after the codebases drift apart. The middle option (the Store interface now, SQLite and local login later) was rejected for the same reason. Recorded in [`zoom_out_report.md`](../reviews/zoom_out_report.md), finding 7.

### Alternative F: Short join code, or the first member creates both accounts

*   **Pros**:
    - A code can't be forwarded as a link, and works face to face.
    - Pre-creating the account means the second person never has to "join".
*   **Cons**:
    - A code must be long enough, throttled and short-lived to resist guessing, and typing it adds a step.
    - Pre-creating accounts depends on Auth0 email verification matching the entered address, and local mode would still need a one-time link.
*   **Reason for Rejection**: Rejected by the author. A one-time link works the same way in both login modes and needs no guessing protection, at the cost of having to be sent through another app. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Decisions made while drafting the design".

### Alternative G: Version check on the chore for duplicate completions

*   **Pros**:
    - Uses the existing Store as it is: patch the task only if `dueOn` is unchanged.
*   **Cons**:
    - A schedule edit between two taps makes a real completion look like a duplicate, and a replay can't tell the two apart.
*   **Reason for Rejection**: Rejected by the author in favour of one completion record per cycle, which gives an exact, repeatable answer, including for late offline replays, at the cost of a Store extension. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Decisions made while drafting the design".

### Alternative H: Completion log with the due date worked out on read

*   **Pros**:
    - Writes never conflict.
*   **Cons**:
    - A time window decides what counts as a duplicate: too short gives a double move, too long swallows a real repeat.
    - The logic would have to run on both client and server.
*   **Reason for Rejection**: Rejected by the author for the same reason as G: the cycle record is exact, while any time window guesses. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Decisions made while drafting the design".

### Alternative I: Local-first store with a change feed

*   **Pros**:
    - An IndexedDB copy, one `/sync` endpoint and tombstones keep all conflict rules in one place.
*   **Cons**:
    - The sync engine would be new code with nothing to copy from Hoardwise: a change feed, a client merge step and tombstone handling. A bug there can silently lose items or bring deleted ones back.
*   **Reason for Rejection**: Rejected by the author in favour of a persisted query cache with persisted paused mutations. Making every write safe to replay costs some per-route rules, but avoids building and testing a sync engine. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Decisions made while drafting the design".

### Alternative J: Offline for the shopping list only

*   **Pros**:
    - The smallest option.
*   **Cons**:
    - Chores can't be ticked off with weak signal, and widening offline support later repeats the work.
*   **Reason for Rejection**: Rejected by the author. The same mechanism covers both lists. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Decisions made while drafting the design".

### Alternative K: A custom offline write queue (adapted from Hoardwise)

*   **Pros**:
    - Every replay rule is in Hearthwise's own code and directly testable, the same as Hoardwise.
*   **Cons**:
    - It needs a second IndexedDB store that can get out of step with the query cache.
    - It means rewriting most of Hoardwise's transaction-only queue anyway.
*   **Reason for Rejection**: Rejected by the author in favour of TanStack Query's persisted paused mutations: one store instead of two, at the cost of relying on library behaviour that step 5's spike must prove. K is the fallback if the spike fails. Recorded in [`zoom_out_report.md`](../reviews/zoom_out_report.md), finding 5.

### Alternative L: Undo by delaying the delete on the client

*   **Pros**:
    - No restore route or Deleted page; deletes stay final on the server.
*   **Cons**:
    - A delete pending in the undo window is lost if the app closes or goes offline.
    - Nothing can be recovered after the toast closes.
*   **Reason for Rejection**: Rejected by the author in favour of a 30-day recycle bin, matching Hoardwise's trash. The bin costs a restore route and a page, but nothing deleted by mistake is lost for 30 days. Recorded in [`zoom_out_report.md`](../reviews/zoom_out_report.md), finding 4.

### Alternative M: Instant sync (WebSockets with DynamoDB Streams, or AWS AppSync)

*   **Pros**:
    - Changes appear on the other phone in under a second.
*   **Cons**:
    - WebSockets need connection tracking, a Streams consumer and a reconnect path, for two users.
    - AppSync has no equivalent in the self-hosted container.
*   **Reason for Rejection**: Deferred by the author (WebSockets). Polling every 10 seconds keeps the delay under the 15-second goal, with no extra infrastructure. AppSync was rejected because it doesn't work with self-hosting. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Alternatives weighed".

### Alternative N: Automatic notifications about the other person's changes

*   **Pros**:
    - Nobody has to remember to tell the other person. Matches the "Frequent and visible" notification tendency noted in [`discussion_summary.md`](../../discussion_summary.md).
*   **Cons**:
    - Pings the user didn't ask for, which conflicts with the preference for predictability and could cause friction.
*   **Reason for Rejection**: Rejected by the author. Sender-chosen pushes plus opt-in reminders let whoever needs prompts get them without imposing them on the other person, at the cost of the sender having to remember to tick the box. Recorded in [`discussion_summary.md`](../../discussion_summary.md), "Design requirements for different needs".

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security & Privacy**:
    - Every household route takes the household id from the guard, never from the request.
    - Invite tokens are stored only as SHA-256 hashes, are single use, can be revoked, and expire after 7 days.
    - Local mode has no open sign-up after first-run setup.
    - **Auth0 mode allows open sign-up in phase 1 (accepted risk, author decision).** Any Auth0 user can sign in and create their own household. The household guard keeps it separate from every other household. Every new account and every new household raises an alert to the author (see "Sign-up alerts"), so an unexpected one can be removed by hand.
    - Login throttling is per email.
    - Push payloads contain only a short description ("Sam hoovered"), never notes.
    - The new local-auth and invite code gets a dedicated security review before merge (Claude Code's `/security-review` command, plus a human read-through).
*   **Performance & Cost**:
    - Polling makes 2 requests every 10 seconds per visible device: 720 requests an hour. Two devices open for 3 hours a day make about 130,000 requests a month.
    - Lambda: 1 million requests a month are permanently free, so polling uses about 13% of the allowance.
    - API Gateway HTTP API: 1 million calls a month are free for the first 12 months only. After that it's about US$1 per million, so about US$0.13 a month at this rate.
    - DynamoDB: the table uses on-demand capacity, as Hoardwise's does (`billing_mode = "PAY_PER_REQUEST"`), so the permanently free provisioned capacity doesn't apply. Each poll reads a whole list. With 500 records of about 1 KB, a pair of polls reads about 63 read request units (eventually consistent), or about 4 million a month. At about US$0.125–0.15 per million read units, that's under US$1 a month. Writes are a few thousand a month and cost under US$0.01. Storage stays inside the free 25 GB.
    - Prices checked 2026-11-11.
    - No API list is paginated in phase 1. A household is expected to hold under 500 tasks and items. Pagination is added at 500. The Store's `query` pages through results internally, so a partition over DynamoDB's 1 MB page limit still returns everything.
*   **Rollout & Rollback**:
    - A new app with no existing data, so there are no migrations in phase 1.
    - Each step in the Detailed Implementation Plan lands as its own PR on `main`, without a feature flag. The app isn't used day to day until step 7 is merged.
    - Rollback is `tofu apply` of the previous build. The self-hosted container is pinned by image tag.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Open Auth0 sign-up (accepted) | A stranger creates an account and a household in the author's deployment | Households are isolated by the guard. Every new account and household sends an alert. Limiting sign-up is a future improvement. |
| A phone's clock is wrong | A fast clock could win conflicts unfairly. While a phone's clock is slow, its edits lose to any newer-stamped edit of the same field. | Fast clocks are clamped to server time + 5 minutes. A slow clock is an accepted limitation: nothing is corrupted, and phones that set their time automatically stay within seconds of server time. |
| iOS evicts storage for a site not added to the Home Screen | The cached lists and pending writes are lost | On an iPhone not installed to the Home Screen, the Today page shows a one-time install prompt, and `PushCheck` in Settings repeats the steps. Installing exempts the app from that eviction. Pending writes are shown in the banner, so a loss is visible. |
| A new build meets an older persisted cache | Restored data or replayed mutations don't match the new code | The cache records a `schemaVersion`. A newer build first replays the older cache's pending mutations (mutation formats stay compatible for one release), then discards the old query data and refetches. |
| A write is rejected because the task changed on the other phone | A person's action, such as a completion, doesn't take effect | Completions on an undone cycle still count (see "Completing a task", rule 4). Every other rejected action is listed in the banner as "Changed on \<name\>'s phone, please check", never dropped silently. |
| Auth0 outage | Nobody can sign in on the AWS deployment | Existing sessions keep working until their tokens expire, and the cached lists still show. The self-hosted mode doesn't depend on Auth0. |
| One maintainer runs two deployment targets | Fixes land on one target and not the other | Both targets share the same handlers and Store contract tests, and CI builds the container on every PR. |
| Polling cost grows | The monthly bill rises | Polling uses about 13% of the Lambda allowance and under US$1 a month of DynamoDB reads (see "Performance & Cost"). Polling stops when the app isn't visible. |
| Scale ceiling | Polling cost and response time grow with list size | Phase 1 is for one two-person household. Done to-dos and history records expire. Pagination is added if a household reaches 500 records. |
| iPhone push needs a Home Screen install on iOS 16.4+ | Reminders and "Let \<name\> know" don't arrive | `PushCheck` shows install steps. A release checklist, `docs/MANUAL-CHECKS.md` (written in step 7), checks push on a real iPhone. |
| The Tody trial wasn't run (accepted) | The design requirements may not hold in daily use | The author confirmed the requirements in [`discussion_summary.md`](../../discussion_summary.md), "Design requirements for different needs", on 2026-11-10, including proposals, held pushes and due nudges, so they stay in phase 1. Any feature either user finds unwanted is removed in a later change. See Alternative C. |

## Future Improvements

*   **Calendar integrations (phase 4).**
    - Bring-your-own calendars from Google Calendar, Outlook, Apple (iCloud) and Proton Calendar.
    - One option is ICS links: Hearthwise subscribes to each person's secret iCal/ICS URL to show their events. It could also publish a household ICS feed of tasks that any of the four apps can subscribe to. Hoardwise already has `app/lib/ics.ts` for generating ICS.
    - Two-way sync through provider APIs would be a later, per-provider decision.
    - Whether Proton supports more than shared links, given its end-to-end encryption, is checked in the phase 4 design.
*   **Limit Auth0 sign-up** (invite-only, an email allow-list, or turning off sign-ups in the Auth0 tenant), if the alerts show unwanted sign-ups.
*   **Leaving a household** for the member who didn't create it.
*   **A chore workload balance**, once both users have agreed what form it should take. Completion records already hold the data.
*   **WebSocket sync**, if users report changes taking more than 15 seconds to appear.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Approach

Hearthwise starts as a **copy of Hoardwise's scaffolding with the budgeting domain removed**. Paths below are relative to the new repository root (`~/Projects/hearthwise`). "From Hoardwise" means copied from `~/Projects/hoardwise` at commit `b50544f`, then changed as described. Anything in Hoardwise not named below is not copied.

The work is split into **seven steps, one PR each**, in this order. Each step leaves `yarn typecheck`, `yarn test` and `yarn build` passing. These steps become the phase 1 issues in Linear, the issue tracker the project will use.

| Step | Contents | Depends on |
|---|---|---|
| 1 | Scaffold: tooling, store (with the conditional update), single-account auth copied unchanged, static and API Lambdas, container, infrastructure, Hearthwise brand, empty signed-in shell | none |
| 2 | Multi-account local login, households, membership guard, invites, member removal, sign-up alerts | 1 |
| 3 | Tasks: model, repeat rules, write records, completions, proposals, "I did this today", views, task recycle bin | 2 |
| 4 | Shopping list, item recycle bin and conditional "clear ticked" | 3 |
| 5 | Offline: persistence spike, Workbox service worker, persisted query cache, persisted paused mutations | 3, 4 |
| 6 | Notifications: "Let \<name\> know", held pushes, opt-in digest and due nudges, settings UI | 3, 4 |
| 7 | Accessibility pass, wording review, PWA install and iPhone push check, README and deployment docs | 5, 6 |

**Rules that apply to every step:**
- **No nulls for "not set".** An attribute that isn't set is left out of the item, never stored as `null`. So `ifMissing` means the same on every store (DynamoDB `attribute_not_exists`), invites are created without `usedBy`, and a restore *removes* `deletedAt`, `deletedBy` and `expiresAt`.
- **`expiresAt` is in epoch seconds**, as Hoardwise's is and DynamoDB TTL requires.
- **Every household write** requires a `mutationId` (UUID) and goes through `withWriteRecord` (item 21) from step 3 on. Step 2's household routes take an optional `mutationId` and start requiring it in step 3.
- **Input validation** follows the table in item 21a. Invalid input returns `400 { error: 'invalid', field }`.

### Step 1: Scaffold

#### 1. `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `react-router.config.ts`, `postcss.config.cjs`, `.nvmrc`, `.gitignore`, `.dockerignore` (Create, from Hoardwise)

*   **Type / Scope**: Build configuration.
*   **Proposed Changes**:
    - `name: "hearthwise"`, `license: "AGPL-3.0-or-later"` (as Hoardwise).
    - Scripts:
      - `build`: `react-router build && node scripts/build-static-handler.cjs && node scripts/build-api-handler.cjs && node scripts/build-push-handler.cjs` (Hoardwise's, without `check-demo-build`)
      - `dev`, `start`, `typecheck`, `test`, `test:watch`, `build:container` and `store-cli`: unchanged
      - `test:e2e`: `playwright test` (added in step 5)
      - removed: `build:demo`, `docs:generate`, `screenshots`
    - Dependencies: Hoardwise's versions, minus `@mantine/charts`, `@modelcontextprotocol/server` and `recharts`. Dev dependencies: Hoardwise's, minus `@seriousme/openapi-schema-validator`, `ajv`, `ajv-formats`, `ical.js` (kept out until phase 4), `sharp` and `yaml`. AWS SDK packages and `web-push` stay dev dependencies, as in Hoardwise; the bundle scripts (item 5) install the runtime copies.
    - Added:
      - `uuid` (dependency) for UUIDv7 ids
      - `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `idb-keyval` (dependencies, used in step 5)
      - `@aws-sdk/client-sns` (dev, used in step 2)
      - `vite-plugin-pwa`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `@playwright/test` (dev, used in step 5)
    - `vite.config.ts`: remove the `stubServerStores` plugin and its demo comment.
    - `vitest.config.ts`: keep the `api` (node) and `app` (jsdom) projects; `app` excludes `e2e/**`. Add `coverage.thresholds` with `branches: 100` for `src/shared/schedule.ts`, `src/tasks/completions.ts`, `src/tasks/ownership.ts` and `src/shopping/items.ts` (each added in its own step).
    - `.gitignore` copied as is. It already excludes `.env`, `*.tfvars`, `build/` and SQLite files.

#### 2. `src/store/{types,index,dynamo,sqlite,memory,patch,testing,backup,cli}.ts` and `src/store/__tests__/` (Create, from Hoardwise)

*   **Type / Scope**: Store and contract tests.
*   **Proposed Changes**:
    - Copied, then **extended**. Hoardwise's store already pages `query` through `LastEvaluatedKey` (`dynamo.ts`), runs SQLite transactions with `BEGIN IMMEDIATE`, checks every condition before writing in memory, and throws `ConditionFailedError` with `failedIndex`. Those stay as they are.
    - `TxOp` gains `{ update: Key; set?: Record<string, unknown>; remove?: string[]; ifEquals?: Record<string, unknown>; ifMissing?: string[]; mustExist?: boolean }`. `mustExist` defaults to `true`: an update never creates an item. It reuses `planPatch` and `matchesAll` from `patch.ts`.
      - **DynamoDB:** a `TransactWriteItems` `Update` with a `ConditionExpression` (`attribute_exists(PK)` for `mustExist`, `attribute_not_exists(x)` for `ifMissing`, `x = :v` for `ifEquals`). A `TransactionCanceledException` whose reasons include `TransactionConflict` is retried up to 3 times with jittered backoff.
      - **SQLite and memory:** read, check, then write inside the existing transaction.
    - Drop `transfer.ts`.
    - **`cli.ts`** keeps `backup` and `reset-password`; every other command goes. `reset-password` takes the account's email as its one argument (prompting for the new password, never reading it from arguments), uses `deleteSessionsForUser` (item 14), and no longer calls `revokeAllTokens` (access tokens aren't copied). It drops `chooseSqliteFile`'s legacy handling with item 6.
    - Extend the shared contract (`__tests__/contract.ts`, which already runs against memory, SQLite and DynamoDB Local in CI) with `update`:
      - each condition kind passes and fails
      - `mustExist` by default: an update on a missing item fails
      - a stored attribute that's absent satisfies `ifMissing`; the store never writes `null` for a value left out
      - a failure in any op leaves every item unchanged, with the right `failedIndex`
    - A unit test with a stubbed DynamoDB client: a `TransactionConflict` is retried, a failed condition isn't.

#### 3. `src/api/{router,routes,apiRoutes,http,db,dates,constants,types}.ts` and `api-handler.ts` (Create, from Hoardwise)

*   **Type / Scope**: API Lambda.
*   **Proposed Changes**:
    - Copy the router, the JSON body and error helpers, `types.ts` and the store wiring.
    - `routes.ts`: empty the route table except `GET /api/health`.
    - `apiRoutes.ts`: keep only the push routes' registration point (empty until step 6); remove docs, OAuth-consent and token routes.
    - `api-handler.ts`: remove the `src/mcp/*`, `src/oauth/*`, `tokenAuth` and `tokens` imports and their branches. It authenticates with `src/auth` (item 3a) only.
    - `db.ts`: keep `pk`, `PUSH_INDEX_PK` and `pushSubscriptionSk`; remove the budgeting key helpers.
    - `dates.ts` keeps only local-date helpers. Add `clampClientTime(clientMs, serverMs)`, which caps a client timestamp at server time + 5 minutes. Local dates use `localMoment` from `src/push/select.ts` (copied in item 3b).

#### 3a. `src/auth/{index,auth0,local,localData,password,passwordAttempts,failureLimiter,cookies,routes,setupCode,types,prompt}.ts` and `src/auth/__tests__/` (Create, from Hoardwise, unchanged except token removal)

*   **Type / Scope**: Authentication, single-account for now.
*   **Proposed Changes**:
    - Copied so that step 1 builds and the container works. Step 2 makes local login multi-account.
    - Not copied: `tokenAuth.ts`, `tokens.ts`, `src/api/tokens.ts`, `src/api/tokenRouter.ts`. Remove their imports from `local.ts` and `routes.ts`.
    - The tests that cover tokens are dropped; the rest are kept.

#### 3b. `src/push/select.ts` (Create, from Hoardwise, generic parts only)

*   **Type / Scope**: Shared time helpers.
*   **Proposed Changes**: keep `localMoment`, `isQuietHour` and `sendHour`, and their tests. Remove the reminder selection that imports budgeting modules (`reminderFor`, `selectReminders` and their types). Step 6 adds Hearthwise's selection functions.

#### 4. `src/static/` (Create, from Hoardwise)

*   **Type / Scope**: Static file Lambda.
*   **Proposed Changes**: copied as is. Its CSP already allows `worker-src 'self'`, and it already serves `/sw.js` with `no-cache`, so step 5 needs no change here. Hoardwise's root `handler.ts` stub isn't copied: the deployed static Lambda is `src/static/handler.ts`.

#### 5. `scripts/{build-static-handler,build-api-handler,build-push-handler,build-container,build-store-cli}.cjs`, `scripts/setup-vapid-keys.sh`, `scripts/container-smoke.mjs` (Create, from Hoardwise)

*   **Type / Scope**: Build scripts.
*   **Proposed Changes**:
    - App name and output paths changed to Hearthwise.
    - `sdk-runtime-deps.cjs` isn't copied (it lists MCP packages). Each bundle script names its own runtime packages:
      - API Lambda: `jsonwebtoken`, `jwks-rsa`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-sns` (step 2), `@aws-sdk/client-ssm` and `web-push` (step 6)
      - push Lambda: as Hoardwise's, plus `web-push`
      - container: `web-push` (step 6)
    - `build-push-handler.cjs` builds `push-handler.ts`, which in step 1 is a no-op handler that logs and returns; step 6 fills it in.
    - `build-static-handler.cjs` writes `config.json` as Hoardwise's does; step 6 adds `vapidPublicKey`.
    - `setup-vapid-keys.sh`: the SSM parameter becomes `/hearthwise/vapid-private-key` (Hoardwise's is `/budget-app/vapid-private-key`, which must not be touched).
    - Not copied: `api-docs.mjs`, `generate-api-docs.mjs`, `build-demo.cjs`, `check-demo-build.mjs`, `demo-smoke.mjs`, `screenshots/`, `local-auth-check/`, `sdk-runtime-deps.cjs`.

#### 6. `container/{adapter,bin,caddy,config,main,maintenance,recovery,server}.ts`, `container/__tests__/`, `Dockerfile`, `compose.example.yml`, `compose.plain.example.yml` (Create, from Hoardwise)

*   **Type / Scope**: Self-hosting container.
*   **Proposed Changes**:
    - Rename the SQLite file to `hearthwise.sqlite`, and remove the legacy-file handling (`LEGACY_SQLITE_FILE`, `chooseSqliteFile`'s fallback).
    - Keep Caddy, config, and maintenance (expired-row purge and daily backups).
    - `recovery.ts`: keep `createCodeHooks` (the first-run setup code). Remove `consumeResetMarker` and its call in `server.ts`, so nothing reopens setup.
    - `server.ts` serves `/config.json` as `{ auth: 'local' }`; step 6 adds `vapidPublicKey`.
    - Push in the container is added in step 6 (item 38a).

#### 7. `infra/{main,variables,dynamodb,lambda,api-lambda,push-lambda,logs}.tf`, `infra/initialSetup/*.tf`, `infra/terraform.tfvars.example`, `infra/backend.hcl` (Create, from Hoardwise)

*   **Type / Scope**: OpenTofu, deployed into **the same AWS account as Hoardwise** (author decision).
*   **Proposed Changes**:
    - `app_name = "hearthwise"`. Table `hearthwise-data` (resource `hearthwise_data`) with `PK`/`SK`, TTL on `expiresAt`, `PAY_PER_REQUEST`.
    - API, static and push Lambdas, the hourly push schedule, and the API Gateway routes as in Hoardwise, **plus `PATCH /api/{proxy+}`** to the API Lambda (Hoardwise has no PATCH route, so PATCH would reach the static Lambda).
    - Remove the MCP and OAuth routes from `lambda.tf`.
    - `initialSetup/`: copy only the `.tf` files (not `.terraform/`, `terraform.tfvars` or `*.zip`). The state bucket and the GitHub OIDC provider are Hoardwise's: read them as `data` sources. Create a role named `hearthwise-github-actions`, trusted only for the Hearthwise repository and limited to `hearthwise-*` resources and the `/hearthwise/*` SSM path.
    - `backend.hcl` uses Hoardwise's bucket with the key `hearthwise/terraform.tfstate`.
    - No real `terraform.tfvars` is committed. Hoardwise's `.zip` files aren't copied.
    - Smoke check after `tofu apply`: `curl -X PATCH …/api/health` reaches the API Lambda (405 from the router, not the SPA's HTML).

#### 8. `app/root.tsx`, `app/entry.client.tsx`, `app/routes.ts`, `app/routes/_index.tsx`, `app/routes/settings.tsx`, `app/app.css`, `app/components/layout/{DefaultLayout,LoadError,SaveStatus,ResponsiveSheet,ToastAction,TextSize,ReduceMotion,ColorSchemeToggle,SignedOutPanel,Logo}.tsx` (Create, from Hoardwise)

*   **Type / Scope**: React SPA shell.
*   **Proposed Changes**:
    - Keep the layout, text size, reduced motion, colour scheme and save-status components.
    - `root.tsx`: remove the `./demo/flag` import and demo branch. It reads the theme from the new `brand.ts` (item 9a).
    - `entry.client.tsx`: remove the guarded demo import.
    - `DefaultLayout.tsx`: remove `TransactionSheet`, `QuickEntryTips`, `LaunchIntent`, `OfflineQueueBanner`, `GuidedTour`, `connectReturn`, `months`, `useNavTarget` and `isDemo`. Navigation has three entries: Today, Shopping, Settings.
    - `settings.tsx`: remove budgeting sections and `isDemo`. It keeps text size, reduced motion, colour scheme, undo duration and sign-out; step 2 adds members, step 3 links the Deleted page.
    - `_index.tsx` shows an empty "Today" page until step 3.
    - `Logo.tsx` shows the Hearthwise mark (item 11).

#### 9. `app/lib/{api,auth,runtimeConfig,session,sessionLifetime,localAuth,preferences,textSize,undoDuration,apiError,pageTitle,contrast,types}.ts`, `app/hooks/{useProtectedApi,useDocumentTitle}.ts`, `app/components/authentication/` (Create, from Hoardwise)

*   **Type / Scope**: Client libraries and auth UI.
*   **Proposed Changes**:
    - Copied with budget types and calls removed from `api.ts` and `types.ts`.
    - `api.ts`: every fetch gets `signal: AbortSignal.timeout(10_000)`.
    - Not copied: `useSaveWithUndo` (all budget code), `useUndoableDelete` (re-created in step 3), `offlineQueue.ts`, `flushQueue.ts`, `trash.ts`, `queries.ts`.

#### 9a. `app/lib/brand.ts`, `docs/brand.md`, `app/app.css` tokens (Create)

*   **Type / Scope**: Hearthwise brand (author decision: a new palette).
*   **Proposed Changes**:
    - `brand.ts` follows Hoardwise's shape (Mantine tuples plus a `BRAND` object) with new warm tokens. Index 6 of each text-safe tuple is the shade for text and buttons on light backgrounds:

      | Token | Shade 6 | Use | Contrast (checked) |
      |---|---|---|---|
      | `hearth` | `#9C3D22` (terracotta) | Primary actions, links | 6.8:1 on white, 6.3:1 on Ash |
      | `ember` | `#8A5A12` (amber) | Warm accent text; shades 3–4 for the logo flame and fills only | 5.9:1 on white |
      | `sage` | `#3F6448` | "Done" states, calm confirmations | 6.7:1 on white |
      | `gray` | `#5E524A` | Muted text (warm neutral) | 7.0:1 on Ash |

      Full tuples:
      - `hearth`: `#FBF0EB #EBD2CA #DBB4A8 #CC9686 #BC7965 #AC5B44 #9C3D22 #80321B #632614 #461A0E`
      - `ember`: `#FDF5E9 #EADBC5 #D7C1A1 #C4A87E #B08E5A #9D7436 #8A5A12 #724A0E #5A3A0B #432B08`
      - `sage`: `#EFF4EE #D2DCD2 #B4C4B7 #97AC9B #7A947F #5C7C64 #3F6448 #33523B #28402E #1C2E20`
      - `gray`: `#FAF6F2 #E0DBD6 #C6BFBA #ACA49E #928982 #786D66 #5E524A #4E433C #3D342F #2C2622`
      - `dark` (warm charcoal; Mantine reads 7 as page, 6 as card, 0 as text): `#F1E7DF #D9CBC0 #B3A397 #8E7E73 #4E423B #3A302A #2A221E #1E1815 #16110F #0E0B0A`
    - `BRAND`: `ink: '#2A1E18'` (15.1:1 on Ash), `ash: '#FAF6F2'` (app background), `surface: '#1E1815'`, and dark-mode text shades `darkHearthText: '#E8957A'` (7.5:1), `darkEmberText: '#E3B65C'` (9.3:1), `darkSageText: '#8FBF98'` (8.4:1) on the dark surface.
    - There is no red "attention" colour, because nothing in Hearthwise is shown as overdue or failed.
    - `docs/brand.md` records the table, the contrast figures and the mark (item 11).
    - The copied `theme.test.ts` and contrast tests are pointed at the new tokens and keep their thresholds (4.5:1 for text).

#### 10. `app/test-utils/`, `app/__tests__/{touchTargets,theme,fixedLayers,errorBoundary,renderBlocking,decisionText}.test.ts(x)` (Create, from Hoardwise)

*   **Type / Scope**: Accessibility and layout tests.
*   **Proposed Changes**: copied, so every later step is held to the same touch-target, contrast and readable-text rules. `oldNames.test.ts` isn't copied.

#### 11. `public/{manifest.webmanifest,favicon.svg,favicon.ico,apple-touch-icon.png,icons/,splash/}`, `docs/brand/logo/` (Create)

*   **Type / Scope**: PWA metadata and brand assets.
*   **Proposed Changes**:
    - Name and short name "Hearthwise", `start_url: "/"`, `theme_color` `#2A1E18`, `background_color` `#FAF6F2`.
    - The mark: a single-colour hearth glyph (an arch with a small flame in `ember` 4), in light, dark-background and `currentColor` versions. Icons and splash screens are generated from it with the same sizes as Hoardwise's. Final art is out of scope.

#### 12. `.github/workflows/{yarnBuild,codeql,container,trivy-weekly}.yml`, `.github/CODEOWNERS` (Create, from Hoardwise)

*   **Type / Scope**: CI.
*   **Proposed Changes**: same jobs (typecheck, test with DynamoDB Local, build, container build, CodeQL, weekly Trivy scan). Remove `demo.yml` and the `check-demo-build` / `build:demo` steps in `yarnBuild.yml` (Hoardwise lines 78–82). The deploy job assumes `hearthwise-github-actions`.

#### 13. `CLAUDE.md`, `README.md`, `LICENSE`, `SECURITY.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md` (Create)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**:
    - `LICENSE`: AGPL-3.0-or-later, as Hoardwise (author decision).
    - `CLAUDE.md` describes the commands and architecture, in the same format as Hoardwise's.
    - `ROADMAP.md` lists phase 1 (steps 1–7), phase 2 meal plan, phase 3 money tracker, phase 4 shared calendar, phase 5 DIY projects, and Hoardwise integration as unscheduled.
    - `DECISIONS.md` records the decisions table from this design, plus the Stage 9 decisions (same AWS account, new palette, AGPL, Auth0 Action key made by hand).

### Step 2: Accounts, households and invites

#### 14. `src/auth/{localData,local,routes,index}.ts`, `app/components/authentication/{LocalAuthProvider,LocalAuthForm}.tsx`, `app/lib/{auth,localAuth}.ts` (Modify)

*   **Type / Scope**: Multi-account local login.
*   **Proposed Changes**:
    - **`localData.ts`:**
      - Accounts are keyed by email: `AUTH#ACCOUNT#<normalisedEmail>` / `PROFILE` (normalised: trimmed, lower-cased), replacing the single `AUTH#ACCOUNT`.
      - `createFirstAccount(email, password, displayName)` succeeds only while `AUTH#SETUP` / `DONE` is absent, and writes the marker in the same transaction. It still requires Hoardwise's one-time setup code (`setupCode.ts`), so the first visitor to a fresh container can't claim it.
      - `createInvitedAccount(token, email, password, displayName)` checks the invite, creates the account, and joins the household in one transaction (the ops from `acceptInvite`, item 16).
      - Throttling is per email: `AUTH#THROTTLE#<email>`, `expiresAt` 1 day after the last failure.
      - Sessions keep the single `AUTH#SESSIONS` partition. New `deleteSessionsForUser(store, userId)` replaces `deleteAllSessions` for password resets.
    - **`routes.ts`** (where Hoardwise's `/api/auth/*` live): `setup` takes a display name; add `POST /api/auth/signup-with-invite { token, email, password, displayName }`, which returns 410 `invite_expired` or 409 `household_full` like accept.
    - **Client:** `LocalAuthForm` gets a sign-up mode that is only offered on `/join` with a token, and a display-name field. `LocalAuthProvider` and `localAuth.ts` call the new route.
    - **Auth0 mode** is unchanged: the user id is `sub`.

#### 15. `src/auth/__tests__/localData.test.ts`, `local.test.ts`, `routes.test.ts` (Modify)

*   **Type / Scope**: Unit tests.
*   **Proposed Changes**: tests that:
    - first setup needs the setup code; after it, a second `createFirstAccount` fails
    - an account can't be created without a valid, unexpired, unused invite
    - two accounts can each log in, and their sessions are separate
    - throttling on one email doesn't affect the other, and throttle rows carry a 1-day expiry
    - `deleteSessionsForUser` and `store-cli reset-password <email>` end only that user's sessions and never reopen setup

#### 16. `src/household/{households,membership,guard,invites,members}.ts` (Create)

*   **Type / Scope**: API domain modules.
*   **Proposed Changes**:
    - **`households.ts`:** `createHousehold(userId, name, timezone, displayName)` writes `HH#<hid>`/`META` (`createdBy`, `memberCount: 1`), `MEMBER#<userId>` with default settings, and `USER#<userId>`/`MEMBERSHIP` (put-if-absent), in one transaction. A caller who already has a membership gets `409 already_member`. The timezone is checked with Hoardwise's `isValidTimeZone`.
    - **Default settings:** `digest: { on: false, hour: 19 }`, `dueNudges: { on: false, hour: 8 }`, no quiet hours, `defaultView: 'list'`.
    - **Display name:** Auth0's `name` (falling back to `nickname`) or the local sign-up form, trimmed, 1–40 characters. Editable through `PATCH /api/hh/members/me`.
    - **`guard.ts`:** `withHousehold(handler)` resolves the membership and passes `{ userId, householdId, member, members }`. It returns 403 when there's no membership.
    - **`invites.ts`:**
      - `createInvite` returns `household_full` if `memberCount` is 2. Otherwise it makes 32 random bytes (base64url) and, in one transaction, writes the invite (SHA-256 hash, `householdId`, `createdBy`, `expiresAt = now + 7 days`, no `usedBy`) and the household's pointer.
      - `acceptInvite(token, userId, displayName, { confirmMove })`:
        - **Checks first:** the invite exists and `expiresAt` hasn't passed, else `410 invite_expired`. If `usedBy` equals the caller, return 200 (a retry).
        - **No current household:** one transaction: update the invite (`ifMissing: ['usedBy']`, set `usedBy`), update `META` (`ifEquals: { memberCount: 1 }`, set 2), delete the pointer, put `MEMBERSHIP` (if absent) and put `MEMBER`. A failure on `memberCount` returns `409 household_full`; on `usedBy`, `410 invite_expired`.
        - **Already in a household:** if they're its only member and a query finds no `TASK#` or `ITEM#` items, the response is `409 { error: 'already_member', canMove: true }`; otherwise `409 { error: 'already_member', canMove: false }`. With `confirmMove: true` and `canMove` still true, one transaction does the invite, `META` and new `MEMBER` writes above, **updates** the caller's `MEMBERSHIP` (`ifEquals: { householdId: <old> }`, set the new id), and deletes the old household's `META`, `MEMBER` and invite pointers. The emptiness query runs just before the transaction. A task created in that instant is left orphaned under a household nobody can read; the race is accepted because the window is one request long and the data is harmless.
      - `listInvites` and `revokeInvite(hash)`, which deletes the invite and its pointer.
    - **`members.ts`:** `removeMember(callerId, userId)` checks the caller is `META.createdBy` and isn't removing themselves. One transaction deletes the member's `MEMBERSHIP` and `MEMBER` and updates `META` (`ifEquals: { memberCount: 2 }`, set 1). Nothing else is rewritten: `ownership.ts` (item 21) and the views apply the read-time rules in "Invites" (rule 5).

#### 16a. `src/security/events.ts`, `infra/alerts.tf`, `infra/auth0/first-login.js` and tests (Create)

*   **Type / Scope**: Sign-up alerts.
*   **Proposed Changes**:
    - `emitSecurityEvent(event)` writes one JSON log line and, when `ALERT_TOPIC_ARN` is set (AWS), publishes the event with the SNS client. A publish failure is logged and never fails the request. It's called from `createHousehold` and `acceptInvite`.
    - `infra/alerts.tf`: the SNS topic, the email subscription (`alert_email`, documented in `terraform.tfvars.example`), the API Lambda's `sns:Publish` permission and `ALERT_TOPIC_ARN` variable, and an IAM user `hearthwise-auth0-alerts` with a policy allowing only `sns:Publish` on that topic. **No access key is created in OpenTofu** (author decision): the key is made by hand in the AWS console and pasted into the Action's secrets, so it never sits in state.
    - `infra/auth0/first-login.js`: the post-login Action. When `event.stats.logins_count` is 1, it publishes `{ event: 'user_first_seen', userId: event.user.user_id, at }` to the topic, using the Action secrets. It's installed by hand, following `DEPLOYMENT.md` (item 41).
    - Tests:
      - each household trigger emits exactly one event
      - no email or name appears in an event
      - a publish failure doesn't fail the request
      - the Action publishes on a first login only (unit test with a stubbed SNS client)

#### 17. `src/api/households.ts` and route entries in `src/api/routes.ts` (Create / Modify)

*   **Type / Scope**: API handlers.
*   **Proposed Changes**: the routes in the "Household, members and invites" table. `PATCH /api/hh/members/me` validates `displayName` (1–40 characters) and settings: hours, including both `quietHours` values, are integers 0–23, and `defaultView` is `list` or `next`. `POST /api/invites/accept` takes `{ token, confirmMove? }`.

#### 18. `src/household/__tests__/*.test.ts`, `src/api/__tests__/households.test.ts`, `scripts/container-smoke.mjs` (Create / Modify)

*   **Type / Scope**: Unit tests (in-memory store) and container smoke test.
*   **Proposed Changes**: tests that:
    - CUJ 1: creating a household and accepting an invite gives two members who see the same empty lists
    - a user in no household gets 403 on `/api/hh/*`; a household id in the request body is ignored
    - an invite works once, then fails on second use; a retried accept by the same user returns 200
    - CUJ 10: an expired invite returns `410 invite_expired` and creates no membership
    - a revoked invite fails
    - a third member gets `409 household_full`, including when two accepts race; creating an invite in a full household returns `409 household_full`
    - `POST /api/households` by a member returns `409 already_member`
    - CUJ 11: the only member of an empty household gets `canMove: true`, accepts with `confirmMove`, and their old household is deleted; a member of a household with tasks gets `canMove: false`
    - only the creator can remove a member, never themselves; the removed member loses access, and their tasks and `both` tasks read as `either` while their swaps no longer apply
    - settings validation rejects an hour of 24 and an unknown view
    - `container-smoke.mjs`: setup with the setup code, create a household, invite, sign up a second account with the invite, and check both see the same household

#### 19. `app/routes/join.tsx`, `app/routes/welcome.tsx`, `app/components/household/{CreateHousehold,InviteLink,Members}.tsx`, `app/lib/household.ts` (Create)

*   **Type / Scope**: React UI.
*   **Proposed Changes**:
    - **`welcome.tsx`:** shown to a signed-in user with no household. It leads with "Waiting for an invite? Open the link your partner sent you", then "Create a household" with a name, a display name and a timezone (defaulting to the browser's).
    - **`join.tsx`:** reads the token from `location.hash` and keeps it in `localStorage` (`hearthwise-invite`, with a 1-hour expiry).
      - Auth0 mode: starts login with `appState: { returnTo: '/join' }`. After the redirect, `join.tsx` finds the stored token and calls accept.
      - Local mode: shows `LocalAuthForm` in sign-up mode, which calls `signup-with-invite`.
      - On `409 already_member` with `canMove: true`, it asks "Move to \<name\>'s household? Your current household is empty and will be removed." and resends with `confirmMove: true`. With `canMove: false`, it explains that they're already in a household with things in it.
      - The token is removed once accept or sign-up returns. An expired invite shows the CUJ 10 message.
    - **`InviteLink`:** creates the link, copies it, and shares it with the Web Share API. Lists open invites with a Revoke button.
    - **`Members`:** lists both members in Settings, with an edit field for the viewer's own display name. The creator sees "Remove from household" on the other member, with a confirmation.

### Step 3: Tasks

#### 20. `src/shared/schedule.ts` and `src/shared/__tests__/schedule.test.ts` (Create)

*   **Type / Scope**: Pure shared module (imported by API and app).
*   **Proposed Changes**:
    - `nextDueOn(repeat, cycleDueOn, completionDay): string | null`, implementing "Working out the next due date", and `firstOnOrAfter(repeat, day)` for a new or changed repeat rule.
    - `isDue(task, today)`.
    - Tests cover:
      - each repeat type
      - early, on-time and late completion, including an `after 1` chore completed the day before it's due
      - weekday sets, every-N-weeks with weekdays and a Monday week start
      - the 31st in February, and `dayOfMonth` with `startOn`
      - a daily fixed chore completed late moves to tomorrow
      - daylight-saving change days (dates only, so no hour arithmetic)

#### 21. `src/tasks/{tasks,completions,proposals,ownership}.ts`, `src/api/writeRecord.ts` (Create)

*   **Type / Scope**: API domain modules.
*   **Proposed Changes**:
    - **`writeRecord.ts`:** `withWriteRecord(householdId, mutationId, ops, result)` adds `put MUT#<mutationId>` (if absent, 8-day `expiresAt`, holding the status and result) to the transaction. It returns `{ fresh: true, result }`, or `{ fresh: false, result: <stored> }` when the put failed because the record exists. Every household write handler uses it; `fresh` tells step 6 whether to notify.
    - **`tasks.ts`:** implements "Task writes":
      - `createTask` writes put-if-absent with the client UUIDv7, `cycleSeq: 1` and `ruleVersion: 1`.
      - `patchTask` applies field-timestamped edits, per-step ticks for the current `cycleSeq`, and schedule fields with matching base versions. It writes with `ifEquals` on `updatedAt` and retries up to 3 times.
      - `deleteTask` tombstones with `ifEquals: { ruleVersion }` and `ifMissing: ['deletedAt']`, and bumps `ruleVersion`.
      - `listTasks` returns open tasks, tombstones from the last 30 days and to-dos done in the last 7 days, with the read-time membership rules applied.
    - **`completions.ts`:** `completeCycle` implements "Completing a task → Rules", including its transaction conditions. `undoCompletion` implements "Undo"; deleting a held push is added in step 6 (item 36). `DONE` records get a 400-day `expiresAt`; a completed to-do gets `doneAt` and a 30-day `expiresAt`.
    - **`ownership.ts`:** decides, for a create, patch, delete or restore, whether it applies directly or needs a proposal (`proposal_required`), following "Proposals", including `both` tasks. It applies the read-time membership rules from "Invites" (rule 5): a non-member assignee or override counts as `either`, a `both` task in a one-member household counts as `either`, and proposals involving a non-member read as `stale`. Direct title, notes and checklist edits to the other member's task write an `EDIT#` item with a 400-day expiry.
    - **`proposals.ts`:** create, accept, decline and withdraw for the `edit`, `swap`, `delete` and `restore` kinds, as in "Proposals". A resolved proposal gets a 30-day `expiresAt`.

#### 21a. `src/shared/validation.ts` and tests (Create)

*   **Type / Scope**: Input validation, shared by API and client forms.
*   **Proposed Changes**: one validator per request body. Limits:

    | Field | Rule |
    |---|---|
    | ids (`id`, `mutationId`, step ids) | UUID |
    | task `title` | 1–120 characters after trimming |
    | task `notes` | up to 2,000 characters |
    | `checklist` | up to 30 steps, each 1–120 characters |
    | `repeat.days` | integer 1–365 |
    | `repeat.every` | integer 1–52 |
    | `repeat.weekdays` | 1–7 distinct values from `mon`…`sun` |
    | `repeat.dayOfMonth` | integer 1–31 |
    | dates (`dueOn`, `startOn`) | `YYYY-MM-DD`, a real calendar date |
    | client timestamps (`at`, `completedAt`, `clientAt`) | integer milliseconds since epoch, not before 2026-01-01 |
    | item `text` | 1–200 characters |
    | item `quantity` | up to 40 characters (free text, for example "2 kg") |
    | batch and restore lists | 1–100 entries |
    | `displayName` | 1–40 characters |

    Tests: each limit at its edge and one past it.

#### 22. `src/api/tasks.ts`, route entries (Create / Modify)

*   **Type / Scope**: API handlers.
*   **Proposed Changes**:
    - The routes in the "Tasks and proposals" table, each validated by item 21a and wrapped in `withWriteRecord`.
    - Every write route requires `mutationId`. It also accepts optional `notify` and `clientAt`, which are ignored until step 6.
    - Step 2's household write routes start requiring `mutationId` here.

#### 23. `src/tasks/__tests__/*.test.ts`, `src/api/__tests__/tasks.test.ts` (Create)

*   **Type / Scope**: Unit tests.
*   **Proposed Changes**: one test for each task CUJ (2, 3, 4, 6, 7):
    - CUJ 2: hoover goes to tomorrow
    - CUJ 3: bathroom goes to next Sunday
    - CUJ 4: two completions at once move the date once, and both users are recorded as `by_` attributes on `DONE`
    - CUJ 6: a swap applies only on accept, gives this cycle to the proposer, and reverts on the next cycle; it goes stale after the cycle is completed
    - CUJ 7: "I did this today" on the other person's chore, due tomorrow, completes it with no proposal and moves the date past tomorrow

    Plus:
    - an `after 1` chore completed early, then completed again on its new due date, moves both times
    - an edit that moves `dueOn` back, then a completion, moves the date
    - a replayed old title edit doesn't change `dueOn` or reverse a completion
    - two members ticking different checklist steps both keep their ticks; a tick from the previous cycle replayed after a completion is dropped
    - a client timestamp an hour in the future is clamped
    - a repeat-rule `PATCH` with an old `baseRuleVersion` returns 409, but one sent while the other member completed the chore succeeds and gets a valid `dueOn`
    - a `repeat` change without a `dueOn` returns 400; "every Sunday" to "every Wednesday" moves `dueOn` to a Wednesday; an undated to-do changed to a chore gets a date
    - a repeat-rule proposal on a daily chore can be accepted after the chore was completed
    - a retried completion, delete, restore or proposal accept (same `mutationId`) returns the stored result and writes nothing
    - an accept and a withdraw racing leave one winner
    - undo when the other member also did it removes only the caller's attribute; an undo racing the other member's "also did it" leaves the cycle done
    - undo is refused when a swap was accepted for the next cycle; undoing a completion that cleared a swap brings it back
    - a completion with a higher `cycleSeq` after an undo completes the current cycle; a lower one with no `DONE` returns 409
    - a completion racing a delete returns 410 and writes nothing
    - creating a task and deleting it straight away succeeds; a retried delete after a restore leaves the task restored
    - a `dueOn` edit keeps an accepted swap; a `repeat` change clears it
    - rescheduling or deleting a `both` task returns `proposal_required`; a title edit applies
    - deleting the other member's task returns `proposal_required`, while a title edit applies and writes `EDIT#` history
    - creating a task for the other member returns `proposal_required`; the `edit` proposal that sets `assignee`, once accepted, makes it theirs
    - only the recipient can accept or decline, and only the proposer can withdraw
    - a `both` task completed by one member is recorded with `together: true`
    - a completion replayed hours later uses its `completedAt` day
    - a to-do completes to `status: done` and drops out of the list after 7 days
    - a partly-ticked checklist doesn't complete the task
    - `container-smoke.mjs`: create a chore, complete it from both sessions, and check it moved once

#### 24. `app/lib/{tasks,queries,mutations,overlay}.ts` (Create)

*   **Type / Scope**: Client data layer.
*   **Proposed Changes**:
    - **`mutations.ts`** (from this step on): every household mutation has a key, and its function and optimistic change are registered with `queryClient.setMutationDefaults(key, …)` at start-up, with `scope: { id: 'household' }`. Components call `useMutation({ mutationKey })` only. Step 5 adds persistence and retry settings to the same file; no mutation is defined anywhere else.
    - **`overlay.ts`:** each mutation's optimistic change is a pure function `(lists, variables) => lists`. `useTasks()` reads pending mutations with `useMutationState({ filters: { status: 'pending' } })` and applies their changes to the server data in a `useMemo`, so the view updates when either changes. The cached server data is only changed by refetches.
    - **Stale responses:** a counter in `queries.ts` goes up each time a household mutation settles. `queryFn` records the counter when it starts; if it changed by the time the response arrives, `queryFn` returns the previous data instead.
    - **`useTasks()`:** `refetchInterval: 10_000`, `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`. Polling continues while writes are pending.
    - Mutations: create, edit, schedule edit, delete, complete, checklist tick, propose, accept, decline and withdraw. Creating a task for the other member or for `both` queues a create (`either`) followed by an `edit` proposal that sets `assignee`. Every mutation sends a `mutationId`; base versions are read when it runs, from the overlaid data.
    - **`tasks.ts`** holds the view rules as pure functions, with tests:
      - groups: Today (due today or earlier), This week (up to and including the coming Sunday, as weeks start on Monday), Later, Whenever (no date)
      - `effectiveAssignee(task, members)`: swaps, removed members and `both` in a one-member household
      - `nextThing(tasks, viewer)`: earliest `dueOn` first, then the viewer's own before `either` and `both`, then title; undated to-dos only when nothing dated is due
    - Tests: a refetch that returns while a tick is pending doesn't hide the tick; polling continues while a write is retrying; a stale response is discarded; the view rules above.

#### 25. `app/routes/_index.tsx`, `app/routes/tasks.$id.tsx`, `app/hooks/useUndoableDelete.tsx`, `app/components/tasks/{TaskList,NextThing,TaskRow,TaskSheet,RepeatPicker,Checklist,DidThisToday,ProposalBanner,TaskHistory}.tsx` (Create / Modify)

*   **Type / Scope**: React UI.
*   **Proposed Changes**:
    - **Today page.** Shows the viewer's `defaultView`, with a toggle that lasts for the session only.
    - **`TaskList`** and **`NextThing`** use the view rules in item 24. Past-due items read "Due · <date>", with no red. "Not now" is session-only state.
    - **`TaskSheet`:** create and edit, including assignee, repeat and checklist. The `RepeatPicker` fills in the suggested `dueOn` with `firstOnOrAfter`. A repeat change on a swapped task warns "This cancels \<name\>'s swap".
    - **`DidThisToday`:** one tap on every row and card.
    - **`ProposalBanner`:** pending proposals for the viewer, with Accept and Decline. The proposer sees their own pending proposals with Withdraw, and ones resolved in the last 7 days ("No longer applies: the task changed" for `stale`).
    - **`TaskHistory`:** on the task page, completions ("Done by Sam", "Together", "Also did it" for each further `by_` attribute) and the other member's direct edits, from `GET …/history`. A non-member shows as "Former member".
    - **Swap and ask actions:** "Swap this time" on the other person's task. The task sheet shows "Ask \<name\>" instead of "Save" for any change that needs a proposal.
    - **Undo** on complete and delete. `useUndoableDelete` is re-created from Hoardwise's: it calls `POST /api/hh/restore` instead of `useRestoreFromTrash`, and treats a no-op restore as success (Hearthwise has no "already in place" 409). Undo after complete calls `DELETE /api/hh/tasks/:id/completions/:cycleSeq` with the `cycleSeq` from the complete response.

#### 25a. `src/api/restore.ts`, `app/routes/deleted.tsx`, `app/lib/deleted.ts` and tests (Create; a rewrite, since Hoardwise moves rows to `TRASH#` and Hearthwise tombstones in place)

*   **Type / Scope**: Recycle bin, tasks only (items are added in step 4).
*   **Proposed Changes**:
    - `POST /api/hh/restore` validates up to 100 `{ kind, id }` entries. Each entry is its own transaction: an update that removes `deletedAt`, `deletedBy` and `expiresAt`, with `ifEquals: { deletedAt: <value read> }` so it applies only to the deletion it saw, and bumps `ruleVersion`. An entry that isn't deleted is a no-op. A task assigned to the other member or to `both` returns `proposal_required` for that entry. One write record holds the per-id results. In this step `kind: 'item'` returns `invalid`.
    - `app/lib/deleted.ts` builds the Deleted list from the cached task data: rows with `deletedAt`, newest first.
    - The page shows "Deleted by \<name\>, <date>" and one Restore button per row; for the other member's task it reads "Ask \<name\> to restore". Settings links to it.
    - Tests:
      - either member can restore their own or an `either` task; the other member's task needs a `restore` proposal
      - restoring twice is a no-op; a retried restore returns its stored results
      - an edit to a tombstone returns 410 and changes nothing, but a restore succeeds
      - a batch restores only the listed ids
      - the Deleted list excludes rows that aren't deleted

#### 26. `app/components/tasks/__tests__/*.test.tsx` (Create)

*   **Type / Scope**: Component tests.
*   **Proposed Changes**:
    - No text "overdue", "missed" or "streak" appears anywhere in the rendered UI.
    - "Not now" doesn't call the API.
    - Touch targets meet the shared minimum.

### Step 4: Shopping list

#### 27. `src/shopping/items.ts`, `src/api/items.ts`, route entries (Create / Modify)

*   **Type / Scope**: API domain and handlers.
*   **Proposed Changes**:
    - **`applyItemWrite(existing, write, serverNow)`** is a pure function that:
      - clamps each client field timestamp to at most `serverNow + 5 min`
      - applies each field only if its timestamp is newer
      - treats a tombstone as final
      - sets `expiresAt = deletedAt + 30 days` on delete
      - for a "clear ticked" delete, applies it only if the item is still ticked and its stored `fieldTimes.ticked` is at or before the sent value, and otherwise reports `skipped`
    - Single writes load, apply and write with `ifEquals` on the stored `updatedAt`, retrying up to three times, inside `withWriteRecord`.
    - The batch route runs one transaction per entry, then writes one write record holding the per-id results, and returns `{ results: [{ id, status }] }`. A retry of the whole batch returns the stored results; a batch interrupted before its record is written is safe to run again, because each entry is itself conditional.
    - Routes: the shopping routes in the "Shopping list and recycle bin" table, validated by item 21a.
    - `restore.ts` accepts `kind: 'item'` from this step.

#### 28. `src/shopping/__tests__/items.test.ts`, `src/api/__tests__/items.test.ts` (Create)

*   **Type / Scope**: Unit tests.
*   **Proposed Changes**:
    - An older untick doesn't override a newer tick.
    - An edit to a deleted item returns 410 and doesn't bring it back.
    - A timestamp an hour in the future is clamped.
    - A batch "clear ticked" tombstones only ticked items, and skips an item that was unticked or re-ticked on another phone after the clearing phone saw it.
    - A batch interrupted after some entries, then retried, ends with each item written once.
    - A retried delete after a restore is answered from its write record and leaves the item restored.
    - CUJ 5 replayed as a write sequence.
    - CUJ 9: an item deleted by one member is restored by the other and appears in both lists.

#### 29. `app/lib/items.ts`, `app/routes/shopping.tsx`, `app/components/shopping/{ShoppingList,AddItem,ItemRow,ClearTicked}.tsx`, Deleted page Shopping group, and tests (Create / Modify)

*   **Type / Scope**: Client data layer and UI.
*   **Proposed Changes**:
    - `useItems()` with the same polling, stale-response check and overlay as tasks; item mutations registered in `mutations.ts`.
    - Optimistic tick, add, edit and delete, each stamping `fieldTimes` with `Date.now()`.
    - Ticked items move to the bottom.
    - "Clear ticked" sends each item's `fieldTimes.ticked`, shows "N item(s) kept: changed on another phone" for skipped ids, and has undo through the restore route.
    - `app/lib/deleted.ts` adds items, and the Deleted page groups entries into Tasks and Shopping.

### Step 5: Offline

#### 29a. `e2e/offline/`, `playwright.config.ts` (Create, first task of step 5)

*   **Type / Scope**: Spike with browser tests, run by `yarn test:e2e` in CI.
*   **Proposed Changes**:
    - A minimal page in `e2e/offline/` that builds its own small version of the step 5 setup (a persister, two registered mutations, the retry rule) against a stub API served by Playwright, so the spike doesn't depend on items 33 and 34.
    - Playwright tests in Chromium, with WebKit where the API allows:
      - the page is closed during a retry backoff; on reopening, the mutation resumes and is saved
      - the page is closed within 1 second of a write; on reopening, the write is still pending and is saved
      - user A has pending writes, signs out, and user B signs in; A's writes are never sent and B sees none of A's data
      - a cold launch with the network off (`context.setOffline(true)`), including with an expired access token, shows the cached lists within 1 second of load; pending writes wait for sign-in
      - a launch on weak signal (CDP network throttling plus a route that delays and drops 30% of API responses) shows the cached lists within 1 second, and a hung request times out after 10 seconds and is retried
    - If any test can't be made to pass, step 5 switches to Alternative K (a custom write queue) and this design is updated before the rest of step 5 starts.

#### 30. `vite.config.ts`, `app/sw.ts` (Modify / Create)

*   **Type / Scope**: Service worker.
*   **Proposed Changes**:
    - Add `VitePWA({ strategies: 'injectManifest', srcDir: 'app', filename: 'sw.ts', injectRegister: false, manifest: false, injectManifest: { globDirectory: 'build/client', globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'], globIgnores: ['config.json', 'index.js'] } })`. The plugin runs after React Router has written `build/client/index.html`, so it's in the manifest. The existing `manifest.webmanifest` stays the source of truth.
    - `sw.ts`:
      - `precacheAndRoute(self.__WB_MANIFEST)` and `cleanupOutdatedCaches()` (`workbox-precaching`)
      - a `NavigationRoute` to the precached `index.html` (`workbox-routing`), excluding `/api/*`
      - `/config.json` with `StaleWhileRevalidate` (`workbox-strategies`)
      - no caching of `/api/*`
      - the push and `notificationclick` handlers ported from Hoardwise's `public/sw.js`, without its `skipWaiting()`
    - A new version waits for the next launch; nothing calls `skipWaiting()` while a page is open.

#### 31. `app/lib/serviceWorker.ts`, `app/root.tsx` (Create / Modify)

*   **Type / Scope**: Registration.
*   **Proposed Changes**:
    - Offline launch needs the service worker, so unlike Hoardwise (which registers only when reminders are on), Hearthwise registers `/sw.js` on every load.
    - When an update is waiting, show "New version ready. It'll load next time."

#### 33. `app/lib/persistedCache.ts`, `app/root.tsx`, `app/components/authentication/AuthProvider.tsx`, `app/components/layout/DefaultLayout.tsx` (Create / Modify)

*   **Type / Scope**: Client cache.
*   **Proposed Changes**:
    - `PersistQueryClientProvider` with an `idb-keyval` async persister under the key `hearthwise-cache-<userId>`, `maxAge` 7 days and `throttleTime: 0`.
    - The saved entry records the user id and `schemaVersion`. On restore, a user id mismatch discards the entry. An older `schemaVersion` restores only the pending mutations, replays them, then discards the query data and refetches.
    - A listener saves the cache immediately on `visibilitychange` (hidden) and `pagehide`.
    - At sign-in the user id is saved to `localStorage` (`hearthwise-user`). On launch the cache is opened with it before any network call.
    - **Rendering before sign-in:** `AuthProvider` renders its children with a `signedInUser` taken from `hearthwise-user` while the config and login provider load, instead of the "could not start" or loading screen; the error screen only shows when there's no stored user and no cached config. `DefaultLayout` shows the cached lists in that state, with writes queued, and a small "Signing in…" note.
    - The cache is cleared on sign-out. With writes pending, sign-out asks for confirmation first and says how many would be lost.

#### 34. `app/lib/mutations.ts`, `app/lib/persistedCache.ts`, `app/hooks/useResumeOnReconnect.ts`, `app/components/layout/PendingWritesBanner.tsx` and tests (Modify / Create)

*   **Type / Scope**: Offline writes (TanStack built-in).
*   **Proposed Changes**:
    - `mutations.ts` (from item 24) gains, for every household mutation:
      - `networkMode: 'online'`
      - `retry(failureCount, error)`: `true` for a network error (a fetch `TypeError` or the 10-second `TimeoutError`) with no limit; `failureCount < 3` for 5xx; `false` otherwise
      - `retryDelay`: exponential, capped at 60 s
      - `onError` by status:
        - **401, or Auth0 `login_required`:** the mutation is put back in the paused state (`mutation.state.isPaused = true` through the mutation cache's `setOptions`/`dispatch` helper in `persistedCache.ts`), and the app shows a sign-in prompt. `useResumeOnReconnect` resumes only once a user is signed in whose id matches the cache's.
        - **409 or 410:** drop and refetch. A 409 on a person's action goes to the banner as "Changed on \<name\>'s phone, please check".
        - **403 `proposal_required`:** drop, and list in the banner with an "Ask \<name\>" action.
        - **other 4xx:** drop, and list in the banner as "Couldn't save".
        - **5xx after 3 tries:** drop, and list in the banner as "Couldn't save; try again".
    - `persistedCache.ts`: `dehydrateOptions.shouldDehydrateMutation` keeps every pending mutation in the `household` scope, whether paused or retrying. After restore, a helper marks every hydrated pending mutation as paused, using the same `dispatch({ type: 'pause' })` the mutation cache uses internally, wrapped in one function with a test so a TanStack upgrade that changes it fails loudly.
    - `useResumeOnReconnect` calls `resumePausedMutations()` after restore, on the `online` event, on window focus and after sign-in.
    - `PendingWritesBanner` shows the count of pending mutations and lists the dropped ones as above.
    - Tests:
      - every key used by a component has registered defaults
      - mutations paused offline survive a simulated reload and replay in order
      - a fetch that rejects while `navigator.onLine` is true is retried, survives a reload during backoff, and is eventually saved
      - a 401 keeps the mutation and resumes it after the same user signs in; a different user never sends it
      - 409, 410, `proposal_required`, other 4xx and 5xx each end in the right banner entry
      - signing out with pending writes asks for confirmation
      - a different user's persisted cache is never restored
      - an older `schemaVersion` replays its pending mutations and then discards its query data
      - creating then deleting a task offline replays both and the task ends deleted

### Step 6: Notifications

#### 35. `src/push/{vapid,store,select,scheduler}.ts`, `push-handler.ts` (Create / Modify, from Hoardwise)

*   **Type / Scope**: Push.
*   **Proposed Changes**:
    - **`store.ts`:** keep `listSubscribedUsers`, `loadSubscriptions` and `removeSubscription`, and the `PUSHIDX` index from `db.ts`. Remove `loadReminderData` and its budgeting imports. Subscriptions no longer carry per-device settings.
    - **`select.ts`:** add `digestFor(member, tasks, now, timezone)` and `nudgesFor(…)`, using `localMoment`, the effective assignee (item 24's rule, shared through `src/shared/`), and the 2-hour same-date window.
    - **`scheduler.ts`:** `runSchedule(store, sender, now): Promise<void>`, shared by `push-handler.ts` and the container. It lists subscribed users, resolves each household through `MEMBERSHIP`, and in that household's timezone:
      1. sends the digest under "Notifications" rules. Before sending, it sets `lastDigestSent` to today with `ifEquals` on the value read, or `ifMissing: ['lastDigestSent']` the first time, and skips if that fails. An empty digest isn't sent.
      2. sends due nudges the same way with `lastNudgeSent`
      3. claims each `HELD` push whose `releaseAt` has passed with a delete that requires the item to exist (`mustExist`), and sends it only if the delete succeeded; items past `expiresAt` are skipped
    - Each push has a tag: `nudge-<taskId>-<date>`, `notify-<mutationId>`, or `digest-<date>`.
    - `push-handler.ts` calls `runSchedule` (replacing step 1's no-op).

#### 36. `src/push/notifyOther.ts`, its call sites in `src/api/{tasks,items}.ts`, and `src/tasks/completions.ts` (Create / Modify)

*   **Type / Scope**: Sender-chosen push.
*   **Proposed Changes**:
    - `notifyOther({ householdId, fromUserId, event, fresh, clientAt, serverNow })` runs only when the request had `notify: true` and the write succeeded.
    - It returns without sending if `fresh` is false (a retry) or `clientAt` is more than 30 minutes before `serverNow`.
    - It builds a short title and body. A batch request builds one combined body ("3 items added to the shopping list").
    - If the other member is in quiet hours, it writes a `HELD` item with `releaseAt` = the end of their quiet hours and, for a completion, a `ref` to the task and cycle. Otherwise it sends at once.
    - The handler awaits it before returning, with a 2-second timeout. Errors and timeouts are logged with the household id and event type, never thrown.
    - `undoCompletion` deletes any `HELD` item whose `ref` is the undone completion.

#### 36a. `src/push/vapid.ts`, `scripts/build-static-handler.cjs`, `container/server.ts`, `app/lib/runtimeConfig.ts`, `infra/{api-lambda,push-lambda}.tf` (Modify)

*   **Type / Scope**: Push keys and config.
*   **Proposed Changes**:
    - `loadVapid()` picks its source by runtime:
      - **AWS:** the private key from SSM at `VAPID_PRIVATE_KEY_PARAMETER` (`/hearthwise/vapid-private-key`); the public key and subject from `VAPID_PUBLIC_KEY` and `VAPID_SUBJECT`.
      - **Container:** environment variables first, then `<dataDir>/vapid.json`. If neither exists, it generates a key pair with `web-push`'s `generateVAPIDKeys()` and writes it with mode 0600. `VAPID_SUBJECT` defaults to `mailto:admin@localhost`.
    - `/config.json` gains `vapidPublicKey`: written by `build-static-handler.cjs` from `VAPID_PUBLIC_KEY` on AWS, and by `container/server.ts` from `loadVapid()` in the container. `runtimeConfig.ts` parses it, and `app/lib/push.ts` reads it instead of `import.meta.env.VITE_VAPID_PUBLIC_KEY`.
    - `api-lambda.tf`: SSM `GetParameter` on the Hearthwise parameter, and the three `VAPID_*` variables. `push-lambda.tf`: the Hearthwise parameter path, and `UpdateItem`, `PutItem` and `DeleteItem` on the table (Hoardwise's role allows only `Query`, `GetItem` and `DeleteItem`).

#### 37. `src/api/push.ts`, route entries (Create, from Hoardwise)

*   **Type / Scope**: API handlers.
*   **Proposed Changes**: subscribe and unsubscribe, as in Hoardwise, except that the subscription body no longer takes `settings` (hour, quiet hours and timezone now live on `MEMBER` and the household).

#### 38. `src/push/__tests__/*.test.ts`, `src/api/__tests__/push.test.ts` (Create)

*   **Type / Scope**: Unit tests.
*   **Proposed Changes**:
    - No push is sent when `notify` is missing or false, or when the write fails with 403, 409 or 410.
    - The push is sent before the response returns, and a push that times out doesn't fail the request.
    - A retried write with the same `mutationId` pushes once; a replay with `clientAt` more than 30 minutes old sends nothing.
    - A batch sends one combined push.
    - A push during quiet hours is held, then released; two overlapping runs release it once; undoing a completion removes its held push.
    - Digest and nudges are sent only when turned on, at the chosen hour or up to 2 hours after it in the household timezone, using the effective assignee.
    - Two scheduler runs in the same hour send one digest; the first-ever digest uses `ifMissing`; an hour of 22 or 23 isn't sent again after midnight; a missed hour is caught up within 2 hours.
    - The digest includes undone tasks from earlier days, and an empty digest isn't sent.
    - Each push carries the right tag.
    - Nothing is ever sent to the person who made the change.
    - 404 and 410 subscriptions are removed.

#### 38a. `container/push.ts`, `container/maintenance.ts`, `container/server.ts`, `container/__tests__/push.test.ts` (Create / Modify)

*   **Type / Scope**: Self-hosted push.
*   **Proposed Changes**:
    - `container/push.ts` exports `createContainerSender(vapid)`, the `web-push` sender used by `notifyOther` and `runSchedule` in the container.
    - `MaintenanceDeps` gains `runScheduler(now): Promise<void>`. `maintenance.ts` adds `attemptAsync(deps, label, work)`, which awaits and catches, and the hourly tick calls it after the purge. A rejected scheduler is logged and never stops the purge or the backup.
    - Tests (with fake timers and a stubbed sender):
      - each maintenance tick calls the scheduler once
      - a scheduler rejection is logged, and the purge and backup still run
      - a missing `vapid.json` is generated once and then reused; environment variables override the file
      - the private key never appears in logs or in `/config.json`

#### 39. `app/lib/push.ts`, `app/components/settings/{Reminders,QuietHours,DefaultView,PushCheck}.tsx`, `app/components/shared/LetThemKnow.tsx` and tests (Modify / Create)

*   **Type / Scope**: Client UI.
*   **Proposed Changes**:
    - **`app/lib/push.ts`** (adapted from Hoardwise): keep `pushSupport`, `currentEnvironment` and `urlBase64ToUint8Array`; subscriptions no longer send settings.
    - **`LetThemKnow`:** a checkbox ("Let \<name\> know"), unticked by default, on every action that changes shared data: the task sheet (create, edit, delete), complete and "I did this today", the proposal form, and the shopping list's add, edit, tick, delete and "clear ticked". When ticked, the mutation's variables carry `notify` and `clientAt`.
    - **Settings:** digest on/off and hour, due nudges on/off and hour, quiet hours, and default view. When a reminder hour falls inside the member's quiet hours, it shows "Your reminder is still sent at this hour".
    - **`PushCheck`:** uses `pushSupport` to show whether push works on this device; on `'needs-install'` it shows Home Screen install steps. The Today page shows a one-time prompt pointing to it.
    - Tests:
      - CUJ 8: with one member set to the full list and a digest at hour 19, and the other to "next thing" with all reminders off, each sees their own view of the same tasks, and the scheduler sends exactly one notification (the first member's digest) and nothing to the second
      - the "Let \<name\> know" box is unticked by default and present on each action listed
      - the quiet-hours overlap note appears

### Step 7: Finish

#### 40. `app/__tests__/wording.test.ts` (Create)

*   **Type / Scope**: Static test.
*   **Proposed Changes**: scans `app/**/*.tsx` string literals for banned words, matched as whole words and case-insensitive ("overdue", "missed", "streak", "failed to complete", "late"), so "Later" and "template" don't match. It fails the build if any are found.

#### 40a. Accessibility pass (no new files; fixes land in the files they concern)

*   **Type / Scope**: Manual and automated audit.
*   **Proposed Changes**:
    - Run the copied accessibility tests (touch targets, contrast, readable text, fixed layers) across every route added in steps 2–6, and fix any failures.
    - Check each screen by hand at 390 px wide, at the largest text size and with reduced motion on.
    - Results are recorded in the step 7 PR description.

#### 40b. `docs/MANUAL-CHECKS.md` (Create)

*   **Type / Scope**: Release checklist.
*   **Proposed Changes**: a checklist run on two real phones before phase 1 is called done:
    - install the PWA on Android and on an iPhone (Add to Home Screen, iOS 16.4+)
    - subscribe to push on both phones
    - send one "Let \<name\> know" push in each direction
    - receive a digest at the chosen hour
    - CUJs 2, 5 (in airplane mode, and again on weak signal), 7 and 8

    The Verification Plan refers to this file.

#### 41. `README.md`, `docs/SELF-HOSTING.md`, `DEPLOYMENT.md` (Modify / Create)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**:
    - AWS deployment into the shared account: running `initialSetup` with Hoardwise's bucket and OIDC provider as data sources, `tofu apply`, the `alert_email` and `VAPID_*` variables, and `setup-vapid-keys.sh`.
    - Installing the Auth0 first-login Action: create the IAM user's access key by hand in the AWS console, paste it into the Action's secrets, and never store it elsewhere.
    - Container deployment, adapted from Hoardwise, including the setup code and VAPID keys.
    - First-run setup, invite steps, and `store-cli reset-password <email>`.
    - iPhone install-to-Home-Screen instructions for push.

### Verification Plan

*   **Compilation/Build**: `yarn typecheck`, `yarn build` and `yarn build:container` succeed at the end of every step.
*   **Unit Tests**: `yarn test` (Vitest). Server tests run against the in-memory store. The store contract tests also run against SQLite and against DynamoDB Local in CI, as in Hoardwise. Client tests run in jsdom against a stubbed API.
*   **Browser tests**: `yarn test:e2e` (Playwright) runs the step 5 spike in CI.
*   **Static Analysis & Linting**: `tsc` strict mode as in Hoardwise. CodeQL and the weekly Trivy scan in CI. A security review (Claude Code's `/security-review`) on the step 2 PR.
*   **Test Coverage Requirement**: every CUJ (1–11) has at least one automated test. `src/shared/schedule.ts`, `src/tasks/completions.ts`, `src/tasks/ownership.ts` and `src/shopping/items.ts` have 100% branch coverage, enforced by per-file thresholds in `vitest.config.ts`.
*   **E2E/Integration**:
    - `scripts/container-smoke.mjs`, extended in steps 2 and 3: setup with the setup code, create household, invite, sign up a second account, create a chore, complete it from both sessions, and check it moved once.
    - After deploy, a PATCH request reaches the API Lambda (item 7).
    - Manual check on two real phones, following `docs/MANUAL-CHECKS.md` (item 40b).
*   **Success measure** (after release): the four-week usage goal in Goals.

--------------------------------------------------------------------------------

*Drafted with EGM*
