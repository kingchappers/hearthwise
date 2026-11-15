# Hearthwise: Phase 3 (Money Tracker)

* **Author:** kingchappers
* **Status:** Drafted from the author's product decisions and reviewed by seven independent reviewers. The author has not yet reviewed the decisions marked **Claude**.
* **Date:** 2026-11-15

--------------------------------------------------------------------------------

## Overview

Phase 3 adds a money tracker to Hearthwise for the two people in a household. It is built around loans. A loan shows its own progress ("£30.00 of £50.00 paid back"). Shared expenses are entries beside it. One total across all entries says who pays whom and how much, or "All square".

The two people enter everything by hand, in pounds, at whatever time suits each of them. Repayments are bank transfers made outside the app, and the app records them. A new entry with a share for the other person to pay does not count until that person agrees. The feature uses the household, write-record, offline-queue and notification machinery that phases 1 and 2 built (see [`phase-1-foundation.md`](phase-1-foundation.md) and [`phase-2-meal-plan.md`](phase-2-meal-plan.md)). It does not touch Hoardwise, the author's separate budgeting app. The roadmap is [`../ROADMAP.md`](../ROADMAP.md).

### How this design was made

The author decided the product in a design session: loans are the focus, one total across everything, a per-entry split, by-hand entry, settled entries hidden from the main lists, a new entry waits for the other person's agreement, and the total reads "to settle, from {name} to {name}". Reviewers then checked a brief ([`phase-3-concepts-brief.md`](phase-3-concepts-brief.md)) and this design against the code. The author accepted the decisions the brief marked as Claude's (Claude is the AI assistant that drafted the design). The author asked for the design to be written and reviewed in one run, so every decision not made by the author is marked **Claude** in the decisions table. "Open Questions" lists the ones to check first.

### Terms used below

| Term | Meaning |
|---|---|
| CUJ | Critical user journey: one end-to-end scenario, in the section of that name. |
| Entry | One record in the ledger. It is a shared expense, a loan or a payment. |
| Shared expense | Something one person paid for that both share. It has a total and the other person's share of it. |
| Loan | Money one person lent the other. It has an amount and a progress. |
| Payment | A bank transfer one person made to the other, recorded in the app. It may name a loan it repays. |
| Payer | The person whose money went out: who paid the expense, who lent the money, or who sent the payment. |
| Share | The part of an entry that the person who is not the payer owes the payer, in pence. For a loan or a payment it is the whole amount. |
| Proposer | The person who put the entry into the waiting state: its creator, or whoever restored it. The other member is the responder. Only the proposer can edit a waiting or declined entry. |
| Waiting, agreed, declined | The three states of an entry. Only agreed entries count in the total. The app shows "declined" as "{name} wants to check this one", and the decline button as "Ask {name} to check". |
| Change request | A proposed change to the money of an agreed entry, or a proposed delete. The member who did not ask responds. |
| Total | The one figure shown at the top: who pays whom and how much. It is worked out from the entries each time and never stored. |
| All square | The total is exactly zero. |
| Settled | An entry the rules in "Settled and tucked away" mark as finished. The app hides settled entries from the main lists ("tucked away") and shows them again with "Show settled". |
| Ledger | All the entries of one household. |
| Household guard | `withHousehold` wraps every household route. It reads the caller's membership and supplies the household id, which never comes from the request. |
| Write record | Every write carries a client-made `mutationId`. The server stores a `MUT#<id>` record so a retry is answered from the record and writes nothing. For most writes the record is in the same transaction as the write (`src/api/writeRecord.ts`). |
| Mutation queue | The app saves every household write to IndexedDB and sends it when online. Writes are registered once, by key, in `app/lib/mutations.ts`, and run one at a time, in order (the `household` scope). |
| Overlay | A pure client function that lays the pending queued writes over the cached data, so a change shows before the server confirms it. |
| Per-field last-writer-wins | Each field stores the client time it was last set (`fieldTimes`). A write to a field applies only if its time is newer than the stored one. Money uses it only for the description and date. |
| Deleted entry | An entry with `deletedAt` set (a tombstone). Unlike tasks and recipes, a deleted entry is never purged. |
| Persisted cache | The query cache saved in IndexedDB per person, kept for seven days. It is why lists show with no signal. |
| "Let them know" | The existing opt-in tick that sends the other person a push notification about a change. |
| Hoardwise | The author's separate personal budgeting app. Nothing in Hearthwise may point at its resources. |
| Pence | Money is stored as a whole number of pence. £12.50 is 1250. |
| `CLAUDE.md` | The project's guide for the coding assistant. Step 3 updates it. |

## The Problem

Two people share a home and its costs. When both pay from Monzo, Monzo's split feature works. When one pays from another card, they work out the split by hand and request money from each other. No running total is shown, so neither person can see the balance. Sometimes one lends the other money, and what they want to know is how much has been paid back so far.

The tracker is for two adults who are autistic, ADHD or audhd (the author's requirement). That means exact, literal figures, wording that does not assign blame, and no repeated reminders.

## Goals

*   **G1.** Record loans, and show each loan's progress ("£30.00 of £50.00 paid back").
*   **G2.** Record shared expenses with a split chosen per entry: equal, a fixed share, one person covers it all, or a percentage.
*   **G3.** Record payments, each optionally naming the loan it repays.
*   **G4.** Show one total across all entries, with the wording in "Wording".
*   **G5.** A new entry with a positive share waits for the other person's agreement before it counts. This includes an entry where the other person is the payer, so each person confirms every figure that involves them. An entry with a zero share counts at once and shows "No agreement needed".
*   **G6.** After an entry is agreed, a change to its money, or a delete, needs the other person's agreement. A change to its description or date does not.
*   **G7.** Hide settled entries from the main lists, and show them again on request.
*   **G8.** Show on each entry who added it, who agreed to it and when it last changed.
*   **G9.** Work offline like the rest of the app, with a visible "Not saved yet" state.

Success measure: the two people put in all their shared expenses and loans, the app's total matches a hand count of the same entries, and after a month neither person tracks the balance anywhere else.

## Non-Goals

*   Budgets, categories, reports, charts, receipt photos and bank import.
*   Splitting the total by purpose, such as rent against groceries.
*   Any link to Hoardwise or to bank data. Entries keep who paid and who it is for, so a later link stays possible, but nothing is built toward it.
*   More than two people. Currencies other than pounds.
*   Reminders or repeated notices about money.
*   Recording the bank transfer itself. Transfers happen outside the app.
*   A per-entry history list. G8 shows the entry's own fields only (see Future Improvements).
*   Starting a new ledger with a new partner (see Open Questions).

## Open Questions

Decisions the author has not yet reviewed, listed roughly by the cost of changing each, highest first.

*   **Who can change an agreed entry.** The author's rule is "only the person who added an entry can change it, or by agreement". Combined with "a new entry waits for the other person's agreement", this design applies one rule: once the other person has agreed to the money of an entry, any change to that money (by either person) needs their agreement. The proposer edits a waiting or declined entry directly. A description or date change never needs agreement.
*   **An agreement is final unless the proposer agrees to a change.** If the responder agrees by mistake, the proposer can decline any change request. There is no further route. This follows the author's rule, and the manual checks ask whether it causes trouble.
*   **A new partner.** If a member leaves and someone new joins, the old ledger belongs to the old pair. Money routes then refuse writes, and the app says the ledger is between the remaining member and a former member. There is no way to start a new ledger in this phase.
*   **Opt-in notifications.** A new entry never counts until the other person opens Money, and a push is sent only if the adder ticks "Let them know". The tick could default on for money. This design keeps the app-wide rule that nothing notifies unless asked.
*   **Six tabs.** Today, Plan, Recipes, Shopping, Money, Settings. The tab labels must fit at the largest text size (the existing touch-target test pins the label size for five tabs). Checking this at 360 px is a go/no-go before item 9 merges. If six do not fit, Recipes moves under Plan in the same pull request.
*   **The odd penny stays with the payer.** An equal split of 1001 pence gives the other person 500.
*   **Restore needs agreement again.** A restored entry returns as waiting, so the other person can agree again, because it changes what they pay.
*   **Limits.** At most 2,000 live entries, and amounts up to £1,000,000. Only the 50 newest deleted entries are listed, and older deleted entries cannot be restored in the app.
*   **Counts.** Entries and amounts are logged, with no description or name.

## Critical User Journeys (CUJs)

### CUJ 1: Sam lends Alex money

*   **Given**: Sam and Alex are in one household with no entries.
*   **When**: Sam taps Add, chooses Loan, types "Rent shortfall", £50.00, and saves.
*   **Then**: The entry shows to Sam as "Waiting for Alex". The total still reads "All square", because Alex has not agreed. Alex opens Money and sees "Rent shortfall, £50.00 from Sam" under "Waiting for you". Alex taps Agree. The total on both phones reads "£50.00 to settle, from Alex to Sam", and the loan reads "£0.00 of £50.00".

### CUJ 2: A shared expense paid from another card

*   **Given**: CUJ 1 is done.
*   **When**: Sam adds Shared expense, "Weekly shop", £63.40, with Sam as payer and the split on Equal.
*   **Then**: The form shows "Alex's share: £31.70". After Alex agrees, the total reads "£81.70 to settle, from Alex to Sam".

### CUJ 3: Alex pays some back

*   **Given**: The total is £81.70 from Alex to Sam.
*   **When**: Alex makes a bank transfer of £20.00 and adds Payment, £20.00, with Alex as sender, naming the loan "Rent shortfall".
*   **Then**: The payment waits for Sam, because it changes what Alex owes. When Sam agrees, the loan reads "£20.00 of £50.00" and the total reads "£61.70 to settle, from Alex to Sam".

### CUJ 4: Paying back more than is left on a loan

*   **Given**: The loan reads "£20.00 of £50.00" and the total is £61.70 from Alex to Sam.
*   **When**: Alex records a payment of £35.00 against the loan, and Sam agrees.
*   **Then**: The loan reads "£50.00 of £50.00, paid back" (progress shows at most the loan's amount) and is hidden as settled. The £5.00 above the loan counts in the total like any other payment, so the total reads "£26.70 to settle, from Alex to Sam".

### CUJ 5: The other person asks to check an entry

*   **Given**: Sam has added a £63.40 expense with an equal split, and it waits for Alex. The right amount is £36.40.
*   **When**: Alex taps "Ask Sam to check".
*   **Then**: Sam sees the entry under "Needs another look" with "Alex wants to check this one". Sam opens it, changes the amount to £36.40, chooses Equal again (the share becomes £18.20), and saves. The entry waits for Alex again. When Alex agrees, the total counts £18.20.

### CUJ 6: Changing an agreed entry

*   **Given**: The £63.40 expense is agreed.
*   **When**: Sam taps Change on it and enters £36.40 with Equal.
*   **Then**: The entry shows "Change waiting for Alex: £63.40 to £36.40", and Alex sees it under "Waiting for you". The total still counts £63.40. When Alex agrees, the entry becomes £36.40 and the total moves. If Alex declines, or Sam withdraws, nothing changes and the entry shows "Change not made".

### CUJ 7: No signal in the shop

*   **Given**: Sam has no signal.
*   **When**: Sam adds an expense.
*   **Then**: It appears on Sam's phone marked "Not saved yet" and is sent when the signal returns. It does not appear on Alex's phone until then. A retry or a double tap makes one entry. While changes are unsaved, Sam's page says "1 change not saved yet". The total does not change until Alex agrees, because a waiting entry does not count.

### CUJ 8: Both people record the same payment

*   **Given**: Alex sent £20.00 and added the payment.
*   **When**: Sam also starts a payment of £20.00 from Alex on the same date.
*   **Then**: Before Sam saves, the form says "There is already a £20.00 payment from Alex on this date. Is this a different one?" If Sam saves anyway, both entries stand. Each person can delete their own waiting entry. An agreed duplicate is removed with a delete request that the other person agrees to.

### CUJ 9: Deleting and restoring

*   **Given**: An entry is agreed.
*   **When**: Sam asks to delete it.
*   **Then**: Alex sees the request under "Waiting for you". When Alex agrees, the entry leaves the total and shows in Deleted. Either person can restore it. It returns as waiting, and counts again when the other person agrees. It is never purged.

### CUJ 10: All square

*   **Given**: The loan is paid back and the expenses are settled up, so the agreed entries add up to zero.
*   **When**: A person opens Money.
*   **Then**: The total reads "All square". The page says "Everything is settled. {n} entries are hidden." with a "Show settled" switch.

### CUJ 11: The other person has left

*   **Given**: The household has one member.
*   **When**: The remaining person opens Money.
*   **Then**: The entries and the total show, with the other person's name as "Former member", and a note that adding or agreeing needs two people. Nothing can be added or agreed.

## Technical Plan (Architecture)

### Decisions this plan rests on

| Decision | Choice | Decided by |
|---|---|---|
| Focus | Loans, with each loan's own progress. Shared expenses are secondary. | Author |
| Total | One total across everything, in pounds. | Author |
| Splits | Per entry: equal, fixed share, one person covers it all, or percentage. | Author |
| Entry | By hand, by either person, at any time. | Author |
| Repayments | Recorded in the app, paid by bank transfer outside it. | Author |
| Who may change an entry | The adder, otherwise the other person agrees. | Author |
| New entries | Wait for the other person's agreement before they count. | Author |
| Settled entries | Hidden from the main lists, shown on request. | Author |
| Wording | "£30.00 to settle, from Alex to Sam", and "All square" at zero. | Author |
| Hoardwise | Separate. Nothing is built toward a link. | Author |
| Total and progress | Worked out from the entries each time, never stored. | Claude |
| Entry shape | One kind of record with three kinds (expense, loan, payment), each with an amount and a share, in whole pence. | Claude |
| Split storage | Only the other person's share in pence is stored. The form works it out from the chosen mode. | Claude |
| Rounding | The odd penny stays with the payer. | Claude |
| Payment and loan | A payment names a loan or none. Only linked payments count toward a loan's progress. | Claude |
| Overpayment | A payment above what is left on a loan counts in the total like any payment. | Claude |
| Money fields | Kind, payer, amount, share and loan are one unit, changed together under a version number. | Claude |
| Edits to agreed entries | A change request. Description and date change without one. | Claude |
| Change requests | A request stored on the entry itself, one at a time. Not the task proposals. | Claude |
| What counts | Only agreed, live entries count. | Claude |
| Agreement | The member who is not the proposer responds. An entry with a zero share needs no agreement. | Claude |
| Settled | Worked out from the entries, never stored. | Claude |
| Deletion | Never purged, restorable. An agreed entry is deleted through a change request. | Claude |
| Restore | Puts the entry back as waiting, with a new version. | Claude |
| Pair | Writes need exactly two members, and every person named in the ledger must be one of them. | Claude |
| History | None in this phase. The entry shows its own fields. | Claude |
| Notifications | The existing opt-in tick. The text never contains an amount. | Claude |
| Navigation | A Money tab, giving six tabs. | Claude |
| Cache version | `CACHE_SCHEMA_VERSION` stays 1. Every change is additive. | Claude |
| Staging | Three pull requests (see "Detailed Implementation Plan"). | Claude |

### Components

```text
App (React SPA)                                    Server (Lambda or container)
-------------------------------------              ---------------------------------------
Money page                                         GET  /api/hh/money
  total, waiting, loans, entries                   PUT  /api/hh/money/{id}
Add and edit sheet                                 POST /api/hh/money/{id}/respond
useMoney()  <-- cached, polled every 10 s          POST /api/hh/money/{id}/change
  applyPendingMoney (overlay)                      POST /api/hh/money/{id}/change/respond
  ledger.ts (total, progress, settled) <--same-->  POST /api/hh/money/{id}/change/withdraw
moneyMutationKeys (queued, persisted)              DELETE /api/hh/money/{id}
                                                   POST /api/hh/restore { kind: 'money' }
                                                   withHousehold -> guarded -> withWriteRecord
                                                   Store: MONEY#<id>      ledger.ts (also in store-cli)
```

### API routes (phase 3)

| Method and path | Purpose |
|---|---|
| `GET /api/hh/money` | List the live entries and the 50 newest deleted entries |
| `PUT /api/hh/money/{id}` | Create an entry, edit one that is waiting or declined, or change an entry's description or date |
| `POST /api/hh/money/{id}/respond` | The responder agrees to, or declines, a waiting entry |
| `POST /api/hh/money/{id}/change` | Ask to change the money of an agreed entry, or to delete it |
| `POST /api/hh/money/{id}/change/respond` | The member who did not ask agrees to or declines the request |
| `POST /api/hh/money/{id}/change/withdraw` | The member who asked takes the request back |
| `DELETE /api/hh/money/{id}` | The proposer deletes an entry that is waiting or declined |
| `POST /api/hh/restore` | Gains `{ kind: 'money' }` |

Every route is wrapped in `withHousehold` and `guarded`, and is validated by `src/shared/moneyValidation.ts`. Unknown request keys are rejected. Domain refusals are thrown as `TaskError`, as the recipe code does, so `respondTo` turns them into the status and code. Every route that writes needs exactly two household members and a ledger whose people are all current members (see "The pair"), or answers 409 `needs_two` or 409 `pair_changed` and writes nothing. `GET` works for any number of members.

**Request and response bodies.** Every write body carries `mutationId`, `clientAt` and an optional `notify` (the envelope). Every write answers `{ entry }` with the entry as stored, except restore, which answers `{ results }` as it does today.

| Route | Body, in addition to the envelope |
|---|---|
| `PUT /money/{id}` | `kind`, `paidBy`, `amountPence`, `sharePence`, `loanId?`, `description`, `descriptionAt`, `on`, `onAt` on create (all required except `loanId`). On edit, any of: the money group (`paidBy`, `amountPence`, `sharePence`, `loanId?`, with `baseVersion`), and `description` with `descriptionAt`, and `on` with `onAt`. `kind` cannot change. |
| `respond` | `response` (`agree` or `decline`) and `version` |
| `change` | `version`, and exactly one of `money` (`paidBy`, `amountPence`, `sharePence`, `loanId?`) or `delete: true` |
| `change/respond` | `response` and `requestId` |
| `change/withdraw` | `requestId` |
| `DELETE /money/{id}` | the envelope only. It carries no version: it can only delete the caller's own waiting or declined entry, which the status and proposer checks bound. |
| `POST /restore` (money entries) | `entries` of `{ kind: 'money', id, deletedAt }`, where `deletedAt` is the deletion the person saw |

`GET` answers `{ entries, serverTime }`.

### Data model additions (single table)

| Item | PK | SK | Key attributes |
|---|---|---|---|
| Entry | `HH#<hid>` | `MONEY#<id>` | `kind`, `paidBy`, `amountPence`, `sharePence`, `loanId`, `description`, `on`, `fieldTimes`, `status`, `version`, `createdBy`, `createdAt`, `proposedBy`, `agreedAt`, `agreedBy`, `pendingChange`, `updatedAt`, `updatedBy`, `deletedAt`, `deletedBy` |

An entry has no `expiresAt`.

**Entry fields**

*   `kind`: `expense`, `loan` or `payment`.
*   `paidBy`: the user id of the payer. The other member is the person the entry is for. The server checks that `paidBy` is one of the two members.
*   `amountPence`: a whole number from 1 to 100,000,000 (£1,000,000).
*   `sharePence`: from 0 to `amountPence` for an expense. Equal to `amountPence` for a loan or a payment. The server stores it and checks the range. It does not store the split mode.
*   `loanId`: only on a payment, and optional. It must name a live, agreed loan in the same household. The payment's sender must be the loan's borrower, which is the member who is not the loan's payer. A payment cannot name a loan that is waiting, declined or deleted.
*   `description`: 1 to 120 characters. `on`: the date the money moved, `YYYY-MM-DD`, chosen on the form (today by default).
*   `fieldTimes`: the client time `description` and `on` were last set, for per-field last-writer-wins.
*   `status`: `waiting`, `agreed` or `declined`.
*   `version`: starts at 1 and goes up each time the money fields change, each time a waiting or declined entry is edited, when an entry is restored, and when an entry becomes agreed or declined.
*   `createdBy`: the creator, for display. `proposedBy`: who put the entry into waiting (the creator, or whoever restored it). `agreedAt` and `agreedBy`: set when the responder agrees. An entry that needed no agreement has `agreedAt` and no `agreedBy`, and the entry page says "No agreement needed".
*   `pendingChange`: absent, or `{ id, by, at, money?, delete? }`. `id` is the `mutationId` of the request that made it.
*   `deletedAt`, `deletedBy`: set when the entry is deleted.

**What each kind means**

| Kind | Payer | Share (what the other member pays the payer) |
|---|---|---|
| Expense | The member whose card paid | Their part of the total, from 0 to the amount |
| Loan | The lender | The whole amount |
| Payment | The sender | The whole amount. It reduces what the sender owes. |

**The total**

For the two members A and B, `credit(A)` is how much B owes A, worked out from the agreed, live entries:

*   an expense or loan paid by A adds `sharePence` to `credit(A)`, and one paid by B subtracts it;
*   a payment sent by A adds `amountPence` to `credit(A)`, and one sent by B subtracts it.

If `credit(A)` is above zero, B pays A that much. If it is below zero, A pays B. If it is zero, the total is "All square". Check against CUJ 3: Alex (B) sends £20.00, so `credit(Sam)` falls from £81.70 to £61.70.

The total is one pure function, `computeTotal(entries, me, other)`, in `src/shared/ledger.ts`. It returns `{ direction: 'square' | 'toMe' | 'fromMe'; pence }`, where `toMe` means the other member pays me. The server's check tool, the app and the overlay all use it. The same entries in any order give the same total.

**Loan progress**

`loanProgress(entries, loanId)` is the sum of `amountPence` of agreed, live payments whose `loanId` is that loan and whose sender is the loan's borrower (not the loan's payer, so a later change of the loan's payer cannot make old payments count). A loan is paid back when its progress is at least its amount. The page shows progress up to the loan's amount. A payment above the amount still counts in the total, because the total ignores `loanId`.

**Other rules**

*   An entry id is a client-made UUID, so offline creates replay safely.
*   An attribute that is not set is left out, never stored as `null`.
*   `moneyKey` is created in `src/money/keys.ts`.

### The pair

A ledger belongs to the two people named in it. `participants(entries)` is the set of user ids in `paidBy`, `createdBy`, `proposedBy` and `agreedBy` of all entries, including deleted ones. A write is refused with 409 `pair_changed` if any participant is not a current member. So if a member is removed and a new person joins, the new person sees the old ledger read-only, and the other side is shown as "Former member". The other member's id for reading is the participant who is not the caller, and the display name falls back to "Former member" when that person is not a member. The two-member check is a read before the write. A removal racing a write can slip through, and that is accepted because the data stays correct (see Risks).

### Limits

| Thing | Limit |
|---|---|
| Live entries for a household | 2,000. Deleted entries do not count. |
| Amount | 1 penny to £1,000,000 |
| Description | 120 characters |
| Change request | One at a time for each entry |
| Deleted entries listed | The 50 most recently deleted |
| Largest list | 2,050 entries of about 0.5 KB, so about 1 MB. Lambda's response limit is 6 MB. |

Breaching a limit returns 400 naming the field, except the entry limit, which returns 409 `money_limit`. `Store.query` has no limit option, so the list reads the whole `MONEY#` prefix and slices the deleted entries in code, as `listRecipes` does. The form checks the same limits before it queues a save.

### Money in whole pence

`src/shared/money.ts` is the one place that reads and shows money.

*   `parsePounds(text)` works on the text, not on a decimal number. It accepts an optional `£`, digits with optional thousands commas in groups of three (`1,000`), and an optional full stop followed by one or two digits (`12`, `12.5`, `12.50`, `.50`). It refuses everything else with a message: empty, `12.` , `12,50` ("Use a full stop, like 12.50"), more than two decimal places, zero, negative, text, and above the limit.
*   `formatPounds(pence)` shows `£12.50` and `£1,000.00`, always with two decimals.
*   `shareFor(mode, totalPence, value)` works out the share for the form, from the payer's side. `equal` gives half, rounded down. `payerCovers` gives zero. `otherCovers` gives the total. `fixed` takes the share typed. `percent` takes a whole percentage for the other member and gives the total times the percentage divided by 100, rounded down. The odd penny therefore stays with the payer.

The mode is not stored. When an entry is opened to edit, the form shows the current share as a fixed share, and the person can choose a mode again to recompute it from the new amount.

### Settled and tucked away

Nothing here is stored. `settledIds(entries)` returns the ids of settled entries.

*   A loan is paid back when its progress is at least its amount. The loan and the payments linked to it are settled.
*   Agreed, live entries are put in order by `on`, then id. Their running `credit` is worked out in that order. The last point where it is exactly zero is the all-square point. Every agreed entry up to it is settled, except an open loan (an agreed, live loan that is not paid back), the payments linked to it, and any entry with a change request.
*   A waiting, declined or deleted entry is never settled.
*   "Show settled" shows everything. A late edit changes the entries, so the result is worked out again, and an entry that matters again shows again.
*   When every entry is settled, the page says so and the total reads "All square" (CUJ 10). Settled entries stay in the total. The page says how many are hidden.

### Writes and conflicts

*   Every write reads the write record first (`replayOf`) and runs through `withWriteRecord`, with the entry's update at index 0 so a lost race is reported as `failedIndex 0`, as in `putRecipe`. A put or update of the entry is conditional on `version` and `status`, and a retry runs up to three times.
*   **The money fields are one unit.** An edit sends the whole money group with the `baseVersion` it was based on. The update is conditional on that version. If the entry changed since, the answer is 409 `entry_changed` with the current entry in the response. Fields are never merged one by one. Description and date use per-field last-writer-wins by `fieldTimes`. On an agreed entry, editing them does not change `version`, because they change no one's debt.
*   **Create.** A put to a missing id creates the entry as `waiting`, with the caller as `createdBy` and `proposedBy`. If `sharePence` is zero (only an expense can have that) the entry is `agreed` at once, because the other person pays nothing. A loan or a payment always has a positive share, so it always waits: the payee agrees that the money arrived.
*   **Who may do what**, by the caller and the entry:

| Caller | Entry | Can do |
|---|---|---|
| Proposer | waiting or declined | Edit any field, and delete it. An edit of a declined entry puts it back to waiting. If the share becomes zero, the entry becomes agreed. |
| Responder | waiting | Agree, or decline (the app says "Ask {name} to check") |
| Either member | agreed | Change the description or date. Ask to change the money, or to delete it. |
| Either member | an agreed entry with a change request | Change the description or date. The money and status stay as they are until the request is answered or withdrawn. |
| Member who did not ask | the request | Agree or decline |
| Member who asked | the request | Withdraw |
| Either member | deleted | Restore. Nothing else is allowed on a deleted entry (410 `gone`). |

*   **Agreeing.** `respond` is conditional on the `version` the responder saw, so agreeing to an entry that was edited, declined or restored since answers 409 `entry_changed`. On a waiting or declined entry every edit, including description and date, raises `version`, so a person only agrees to what they saw. On an agreed entry, editing the description or date does not raise it. `change/respond` and `change/withdraw` carry the request's `requestId`. They are conditional on `pendingChange.id`, so a queued agreement cannot apply to a different request made after the person saw the first.
*   **A declined entry** stays in the ledger, shown to the proposer under "Needs another look". Any save by the proposer puts it back to waiting.
*   **A payment's loan.** A change to a loan's amount or payer, or a delete of a loan, does not touch the payments linked to it. They keep counting in the total. The delete request says so: "Payments recorded against this loan will stay in the total."

### Change requests

An agreed entry can carry one change request. It is stored on the entry as `pendingChange` with `id`, `by`, `at`, and either `money` (a proposed `paidBy`, `amountPence`, `sharePence` and `loanId`, with the per-kind share rules and the loan rules above) or `delete: true`.

*   `POST /change` is conditional on the entry being agreed, live, without a pending change, and at the `version` the person saw. Otherwise 409. The `kind` cannot change.
*   `change/respond` is made by the member who did not ask. Agreeing applies the change in one transaction: it replaces the money, raises `version` and removes `pendingChange`. For a delete request it sets `deletedAt` and `deletedBy`. Declining removes `pendingChange`. The answer names what happened.
*   `change/withdraw` removes the request.
*   Nothing expires. There are no reminders. A request waits until it is answered.
*   While a request is pending, the money and status cannot change. The description and date can.

### Deleting and restoring

*   The proposer deletes a waiting or declined entry directly. An agreed entry is deleted through a change request.
*   A deleted entry leaves the total at once and shows in Deleted. It is never purged.
*   Restore is `POST /api/hh/restore` with `{ kind: 'money', id, deletedAt }` entries, where `deletedAt` is the deletion the person saw. Either member may restore. The restore of each entry is its own transaction, conditional on that `deletedAt`, so a restore queued before the entry was restored, edited and deleted again answers `entry_changed` and applies nothing the person did not see, like `restoreRecord`, and the write record is stored once at the end, as the restore route does today. It removes `deletedAt`, `deletedBy`, `agreedAt`, `agreedBy` and `pendingChange`, raises `version`, sets the status to `waiting` with the restorer as `proposedBy` (or `agreed` if the share is zero). `RestoreStatus` gains `needs_two`, `pair_changed`, `money_limit` and `entry_changed`, which the money branch returns per entry, and the live-entry limit is checked as the recipe limit is.
*   A payment whose loan is deleted keeps its `loanId`. It counts in the total, and the loan view ignores it while the loan is deleted.

### Sync, offline and cache

*   **Mutation kinds.** A new "money" set in `app/lib/mutations.ts`, all scoped `household` with the shared offline defaults and owner guard: `moneyAdd`, `moneyEdit`, `moneyRespond`, `moneyChange`, `moneyChangeRespond`, `moneyChangeWithdraw`, `moneyDelete` and `moneyRestore`. The set has its own variables type, runner table and `useMoneyMutation`, like the meals set, and its keys and query key live in `app/lib/moneyKeys.ts` so the registry can name them without a cycle. Each invalidates `['money']` when it settles. A key is never renamed once shipped.
*   **Persistence.** `shouldDehydrateMutation` saves every pending mutation whose scope is `household`, so these persist with no list to update. A test saves and restores one of each.
*   **Overlay.** `app/lib/moneyOverlay.ts` lays pending writes over the cached entries with the same pure rules as the server (`src/money/applyEntry.ts`). The total is worked out from the overlaid entries, so an agreement or a zero-share entry moves it as soon as the person acts. When pending money writes exist the page says "{n} changes not saved yet", because the other phone shows the total without them.
*   **Query.** `useMoney()` (`['money']`) is polled every 10 seconds while visible, like tasks, shopping and the plan, with the existing `noteMutationSettled` guard.
*   **A stale write.** A queued edit, response or change that arrives after the entry changed is refused with 409 `entry_changed`. The queue drops it, and the app shows "That entry changed. Please look at it again." There is no draft for money in this phase: the person reopens the entry and acts again.
*   **Offline reading.** Entries are saved in the persisted cache with the other lists, for seven days.
*   **Cache schema version stays 1.** Every change is additive.
*   **Old client, new server.** The service worker never calls `skipWaiting`, so an older app can keep running after a deploy. No existing route changes, and an old app cannot queue money writes.
*   **Rollback.** Stored money data stays. Routes stay for at least one release. A queued money write that finds no route is shown in the "couldn't save" message, never dropped silently.

### Moving households

`moveOptions` in `src/household/invites.ts` checks that a household holds nothing before its only member is moved. It also queries `MONEY#` after this change. Without that, a person whose household holds only a loan would look empty, and a move would strand it.

### Views

*   **Nav.** Today, Plan, Recipes, Shopping, Money, Settings.
*   **Money** (`/money`).
    - **Total** at the top, as a card (see "Wording"). Under it, the number of unsaved changes if there are any.
    - **Waiting for you**: entries the other person added that wait for your agreement, and change requests waiting for your response. Each shows who, what, the amount, your share, and two buttons, "Agree" and "Ask {name} to check". They are in one list, with no counts on the tab and no reminders.
    - **Waiting for {name}**: your entries and change requests that they have not answered.
    - **Needs another look**: your entries that they declined, with "Change" and "Delete".
    - **Loans**: each open loan with a text line "£20.00 of £50.00" and a bar. A paid-back loan says "paid back" and is hidden as settled.
    - **Entries**: the rest, newest first, with description, date, amounts and the state.
    - **Show settled**: a switch that includes settled entries.
    - An **Add** button opens the add sheet.
*   **Add and edit sheet** (a `ResponsiveSheet`, also opened to edit). One "Add" with three choices: "Shared expense", "Loan" and "Payment". Defaults: the caller as payer, today's date, an equal split. The sheet uses member names, not "I" and "they".
    - **Shared expense.** "Who paid?" (a name), "What for?", "How much?", "On what date?", "Split" with these options for payer X and other member Y: "Equal", "{X} covers it all", "{Y} covers it all", "A fixed share for {Y}", "A percentage for {Y}". The form shows "{Y}'s share: £31.70". A share above the total shows "A share can't be more than the total, £50.00."
    - **Loan.** "Who lent it?", "What for?", "How much?", "On what date?".
    - **Payment.** "Who sent it?", "How much?", "On what date?", "Which loan is it for?" (the open loans the sender borrowed, and "None, just a payment").
    - **Duplicate hint.** A payment with the same sender, amount and date as a live payment (waiting, agreed or declined) shows "There is already a £20.00 payment from Alex on this date. Is this a different one?". It does not block saving.
    - The `mutationId` and the entry id are made once when the sheet opens and kept while it is open, so a double tap makes one entry.
*   **Entry** (`/money/:id`): the money, the payer, each person's share in words ("Alex's share: £31.70 of £63.40"), who added it and when, who agreed and when, its state, and the buttons that apply: Agree, "Ask {name} to check", Change, Delete, Withdraw. A pending change request shows beside the figure it would change.
*   **Deleted page.** Gains a Money group beside Tasks, Shopping and Recipes, listing the 50 newest deleted entries. The helper line says "Deleted money entries stay until you restore them." beside the 30-day text for the rest.
*   **With one member, or a changed pair.** The entries and total show, with "Adding or agreeing needs the two people this ledger is between." The buttons are off.

### Wording

The phase 1 wording rules apply (`docs/brand.md`): no red, and none of "overdue", "missed" or "streak". Direction is never shown by colour alone.

| State | Words |
|---|---|
| Total, one way | "£30.00 to settle, from Alex to Sam" |
| Total at zero | "All square" |
| Unsaved changes | "1 change not saved yet", "2 changes not saved yet" |
| Everything settled | "Everything is settled. {n} entries are hidden." |
| No entries yet | "No money entries yet. Add one when you share a cost or lend money." |
| Waiting for the other person | "Waiting for Alex" |
| Waiting for me | "Waiting for you" |
| Declined | "Alex wants to check this one" |
| A request to change | "Change waiting for Alex: £63.40 to £36.40" |
| A request to delete | "Delete waiting for Alex" |
| Request not made | "Change not made" |
| Not synced | "Not saved yet" |
| Loan, nothing paid | "£0.00 of £50.00" |
| Loan, paid back | "£50.00 of £50.00, paid back" |
| Deleting a loan | "Payments recorded against this loan will stay in the total." |
| Entry changed meanwhile (`entry_changed`) | "That entry changed. Please look at it again." |
| Money change on an agreed entry (`needs_agreement`) | "Ask {name} to agree to this change." |
| Needs two people (`needs_two`, `pair_changed`) | "Adding or agreeing needs the two people this ledger is between." |
| Entry limit (`money_limit`) | "This household has reached 2,000 entries." |

In the money files the words "owe", "owes", "owed", "debt", "unpaid" and "behind" are not used, and neither are "late" or "overdue" (the existing test covers them app-wide) or "forgot", "skipped", "incomplete", "missing" and "unplanned". The Wording test is the authority.

### Notifications

The existing opt-in "Let them know" tick appears on the add and edit sheet and on the buttons that respond. A push never contains an amount, a description or a loan's name. It contains the actor's display name, as every push does. Three texts, each opening `/money`:

| Event | Text |
|---|---|
| A create, or a restore | "{name} added a money entry" |
| A response (agree or decline), or a response to a change request | "{name} replied to a money entry" |
| A change request, a delete request, or a withdrawal | "{name} asked about a money entry" |

Edits and deletes of a waiting entry send nothing. As for every "Let them know" push, one whose `clientAt` is more than 30 minutes old is not sent. A push held for quiet hours stores the same text, with no amount. The write bodies allow `notify` through `ENVELOPE_KEYS`.

### Logging and checking

*   Each fresh money write logs one line: `{ event: 'money_write', householdId, mutationId, action, kind, amountPence, sharePence, status }`. It holds ids, enums and pence. It never holds a description or a name.
*   Each refusal logs `{ event: 'money_reject', householdId, mutationId, reason }`, where the reason is the error code (`entry_changed`, `needs_two`, `pair_changed`, `needs_agreement`, `money_limit`). The helpers are in `src/money/log.ts`. The money routes wrap their handlers so that a `TaskError` is logged and then rethrown for `respondTo`.
*   A test checks that no description or name reaches the log or a push.
*   `yarn store-cli money-total <householdId>` reads a household's entries and members and prints the total and each loan's progress, using `src/shared/ledger.ts`. It writes nothing.

## Alternatives Considered

### Alternative A: Store a running balance and a paid-so-far counter

*   **Rejected.** Two people write offline at different times. A counter updated by read-modify-write drifts, or fails on a conflict, and cannot stay in step with edits, deletes, restores and change requests. The total is a sum over at most 2,000 entries, and property tests cover it.

### Alternative B: Reuse the task proposals for change requests

*   **Rejected.** `src/tasks/proposals.ts` is built around task ids, rule versions, cycles and assignees. Bending it would risk the tested task paths. A pending change on the entry shares no state with it.

### Alternative C: Store the split mode and its values

*   **Rejected.** Four modes mean four validation paths and rounding rules on the server, and a change to a rule would change the meaning of old entries. Storing the share needs one range check.

### Alternative D: A stored "settled" flag

*   **Rejected.** It is a second source of truth that can disagree with the entries after a late edit or a restore.

### Alternative E: Field-by-field last-writer-wins for money fields

*   **Rejected.** A merge of one person's amount with the other's share could record an entry nobody wrote. Money fields change together under a version number, so a stale write is refused and shown.

### Alternative F: Apply a new entry at once

*   **Rejected by the author.** One person could create a debt for the other without their agreement.

### Alternative G: Expire deleted entries after 30 days

*   **Rejected.** It would change the total with nobody acting.

### Alternative H: One ledger item holding every entry

*   **Rejected.** Every write by either person would update the same item, which causes write conflicts on DynamoDB, and the item would grow with every entry.

### Alternative I: Split the total by category or purpose

*   **Rejected by the author.**

### Alternative J: Use Monzo's split feature, or Splitwise

*   **Rejected by the author.** Monzo's split works only when both pay from Monzo and shows no running total.

### Alternative K: Link to Hoardwise now

*   **Deferred by the author.**

### Alternative L: Any number of members

*   **Rejected.** The household is two people, and "who pays whom" is one signed figure.

### Alternative M: A history list for each entry

*   **Deferred.** It adds a record type, a key prefix and a route, and the author did not ask for it. The entry shows who added it, who agreed and when it last changed.

### Alternative N: An edit to an agreed entry sends it back to waiting

*   **Rejected.** The entry would drop out of the total until agreed again, so an edit would change the total with nobody agreeing to that. A change request keeps the agreed figure counted until the response.

## Non-Functional Requirements

*   **Correctness.** The total and loan progress are worked out by pure functions from the agreed, live entries and never stored. Property tests check that any order of the same entries gives the same total, that a delete then a restore and agreement gives the original total, and that each counted payment is in at most one loan's progress.
*   **Whole pence.** Money is whole pence everywhere. A fraction of a penny is refused.
*   **Offline.** Entries are readable with no signal, and writes queue and replay once.
*   **Privacy.** No description or name reaches a log. No amount, description or loan name reaches a push. Pence figures are logged, because triage of a wrong total needs them.
*   **Accessibility.** Every new route must pass the axe check. Direction and state are in words. Every control must be at least 44 px.
*   **Performance.** About 2,050 entries is about 1 MB in one list. Money, tasks, shopping and the plan each poll every 10 seconds, so a visible app makes four requests every 10 seconds.
*   **Isolation.** The new key prefix is under `HH#<hid>`. Nothing points at Hoardwise.

## Risks and Mitigations

| Risk | Effect | Mitigation |
|---|---|---|
| A wrong total | A trust problem about money | One pure function shared by the server, the app, the overlay and the check tool, with property tests. The check tool recomputes any household's total. |
| The same payment entered twice | The total is wrong by that amount | A duplicate hint on a matching sender, amount and date. A duplicate is deleted and can be restored. |
| An entry waits for ever | A payment or loan never counts | There are no reminders by design. Waiting entries are in one list. A push is opt-in (see Open Questions). |
| A stale write after a long outage | An old edit or response applies to a changed entry | Every response carries the version or request id it was based on. A stale one is refused and shown. |
| The two phones show different totals | A person acts on a figure the other does not see | The page says how many unsaved changes the total includes. |
| The other person leaves, or a new person joins | The ledger has the wrong counterpart | Writes are refused with `pair_changed`. The ledger is read-only and names a "Former member". |
| A member removal races a write | One write lands with a member who has just left | The data stays correct and the ledger becomes read-only afterwards. Accepted. |
| A household move strands a loan | Entries are lost | `moveOptions` checks `MONEY#`. A test covers it. |
| A restored entry changes the total | Surprise | A restore returns the entry as waiting. It counts only when agreed again. |
| The entry list grows | A slow list | A 2,000 live-entry limit, deleted entries excluded and listed 50 at a time, and a 6 MB response ceiling. |
| The wording reads as blame | The tool feels accusing | The wording the author chose, and a wording test over the money files. |

## Future Improvements

*   **A history for each entry.** Who changed what and when, if "why did the total change?" comes up in use.
*   **Start a new ledger.** For when a member leaves and a new one joins.
*   **A cheap poll.** A revision check before the full list, if the list grows.
*   **Archive old settled entries.** A carried balance, if a household reaches the entry limit.
*   **Alarms on the money logs.** A metric filter on `money_reject`, sent to the existing alert topic. No route has alarms yet, so this belongs with the rest.
*   **An export** of the entries as a file.
*   **A link to Hoardwise.** A separate design.
*   **Recurring entries** for a fixed regular cost.

## Detailed Implementation Plan

### Approach

The work is three pull requests, in this order. Step 1 is the whole server side and has no screens, so it can be merged and tested alone. Step 2 is the whole app, so nothing ships that a person cannot recover from. Each step must pass `yarn typecheck`, `yarn test` and `yarn build` before merge. The phase 1 rules apply to every step:

*   each test is written before the code it covers;
*   every write route carries a `mutationId` and runs through `withWriteRecord`;
*   an attribute that is not set is left out and never stored as `null`;
*   every `fetch` goes through `withTimeout()`;
*   wording follows `docs/brand.md`.

File names are taken from the current code. Where one differs when a step starts, the code wins, and the pull request records the difference in `docs/DECISIONS.md` as "Spec says / Built / Why". Domain code follows `src/meals/applyRecipe.ts` and `src/meals/recipes.ts`, and the other person is found as `otherMemberId` (`src/tasks/ownership.ts`) does.

### Step 1: The ledger on the server

#### 1. `src/shared/money.ts` (Create), `src/shared/__tests__/money.test.ts` (Create)

*   **Type / Scope**: Pure module.
*   **Why**: One reader and writer of money for the form and the server.
*   **Proposed Changes**: `MAX_PENCE`, `parsePounds`, `formatPounds` and `shareFor`, as in "Money in whole pence".
*   **Tests**: accepted inputs (`12`, `12.5`, `12.50`, `£12.50`, `1,000`, `£1,000.50`, `.50`) and the float traps `1.15` (115), `0.29` (29) and `19.99` (1999); refused inputs (`12.`, `12,50`, `1,00`, `1,0000`, `12.505`, `0`, `-5`, empty, text, above the limit); `formatPounds` for 0, 5, 1250 and 100000000; `shareFor` for each mode, including 1001 pence equal (500), 33 percent of 1000 (330), 0 and 100 percent.

#### 2. `src/money/types.ts` (Create), `src/money/keys.ts` (Create)

*   **Type / Scope**: Types and keys.
*   **Proposed Changes**: `MoneyEntry`, `MoneyKind`, `MoneyStatus`, `MoneyUnit` (`kind`, `paidBy`, `amountPence`, `sharePence`, `loanId?`), `PendingChange`, `MoneyData` (`{ entries, serverTime }`), `MONEY_PREFIX` and `moneyKey(householdId, id)`.

#### 3. `src/shared/ledger.ts` (Create), `src/shared/__tests__/ledger.test.ts` (Create)

*   **Type / Scope**: Pure module.
*   **Why**: The total, loan progress and settled set in one place, used by the server, the app and the check tool.
*   **Proposed Changes**: `computeTotal(entries, me, other)`, `loanProgress(entries, loanId)`, `isCounted(entry)` (agreed and live), `settledIds(entries)` and `participants(entries)`, as in the sections above.
*   **Tests**: the worked examples in CUJ 1 to 4 and CUJ 10, with every total checked (£50.00, £81.70, £61.70, £26.70, All square); each kind and payer; waiting, declined and deleted entries do not count; an entry with a change request counts at its current figure; `settledIds` for a paid-back loan, the all-square point, an open loan inside the all-square prefix staying visible, an entry added after the point, and a late edit that reopens one; property tests: any order of the same entries gives the same total, a delete then a restore and agreement gives the original, and each counted payment is in at most one loan's progress.

#### 4. `src/shared/moneyValidation.ts` (Create), `src/shared/__tests__/moneyValidation.test.ts` (Create)

*   **Type / Scope**: Validators in the `Parsed<T>` style, reusing `parseEnvelope`, `ENVELOPE_KEYS`, `parseUuid`, `parseClientTime`, `trimmedText`, `unknownKey` and `parseDay`.
*   **Proposed Changes**: `parseMoneyPut`, `parseRespond`, `parseChange`, `parseChangeRespond`, `parseChangeWithdraw` and `parseMoneyDelete`, with the bodies in "API routes" and every limit in "Limits". The pure checks are: whole pence, `sharePence` in range for the kind, `loanId` only on a payment and a UUID, exactly one of `money` or `delete` on a change, and `descriptionAt` or `onAt` present with their field.
*   **Tests**: each limit at and over; unknown keys; a fractional penny; a share above the amount; a loan or payment whose share differs from its amount; `loanId` on a loan; both or neither of `money` and `delete`.

#### 5. `src/money/applyEntry.ts`, `src/money/entries.ts`, `src/money/changes.ts` (Create), `src/money/__tests__/entries.test.ts`, `src/money/__tests__/changes.test.ts` (Create)

*   **Type / Scope**: Domain.
*   **Why**: The server and the app's overlay use one write rule.
*   **Proposed Changes**: The pure rules in `applyEntry.ts` (create, edit, respond, delete, restore, and the change request rules), and the store functions (`putMoney`, `respondMoney`, `deleteMoney`, `listMoney`, `askChange`, `respondChange`, `withdrawChange`) written like `putRecipe` and `listRecipes`: read the write record, read the entry consistently, build the transaction, run it in `withWriteRecord`, retry on a lost race. Domain refusals are `TaskError`s with the codes in "Wording". A write checks the two-member and pair rules (`needs_two`, `pair_changed`) and, on a create, the live-entry limit (`money_limit`). The checks of `paidBy` and `loanId` in "Entry fields" are made here, because they need the members and the other entries. `listMoney` returns the live entries and the 50 newest deleted entries.
*   **Tests**: create (agreed at zero share, waiting otherwise, a loan and a payment always waiting); replay; the proposer edits a waiting entry and a money edit raises `version`; a declined entry edited returns to waiting; an edit to a zero share agrees it; an edit of an agreed entry's money is refused (`needs_agreement`); a stale `baseVersion` or response `version` is `entry_changed`; the responder only can respond; delete of a waiting entry; delete of an agreed entry is refused; every write on a deleted entry is `gone`; `paidBy` not a member, `loanId` not a live agreed loan, and a payment from the loan's lender are refused; the pair and two-member checks; the limit counts live entries only; the change request flow (ask, agree, decline, withdraw, a stale `requestId`, a request while one is pending, a delete request, description and date edits while pending); a lost race retries.

#### 6. `src/api/money.ts` (Create), `src/api/apiRoutes.ts` (Modify), `src/push/events.ts` (Modify), `src/money/log.ts` (Create), `src/api/__tests__/money.test.ts` (Create), `src/api/__tests__/apiRoutes.test.ts` (Modify)

*   **Type / Scope**: Routes, notification wording and logging.
*   **Proposed Changes**: `registerMoneyRoutes(router)` registers all seven money routes in the table, each as `withHousehold(guarded(['id'], ...))`. Create calls `notifyAfter` with `moneyAdded` (restore is notified in item 7), responses with `moneyReplied`, and change requests, delete requests and withdrawals with `moneyAsked`, as in "Notifications". The log helpers and the handler wrapper are in `src/money/log.ts`.
*   **Tests**: status codes; 400 naming the field; 404 for a non-UUID id; the 409 codes; replay through the write record; another household cannot read the entries; no amount, description or name in a log line, and no amount, description or loan name in a push payload; a push goes out only when asked, once for a retry, and not after 30 minutes; the route list.

#### 7. `src/household/invites.ts` (Modify), `src/tasks/restore.ts` (Modify), `src/api/tasks.ts` (Modify), `src/shared/taskValidation.ts` (Modify), `src/store/__tests__/contract.ts` (Modify), and the tests beside each

*   **Type / Scope**: Household move, restore and store contract.
*   **Proposed Changes**: Add `MONEY_PREFIX` to `moveOptions`. Widen the restore `kind` to include `'money'` in `restoreEntries` and `parseRestoreBody` (a money entry also carries `deletedAt`), add the money branch of "Deleting and restoring" and the new `RestoreStatus` values, and update the restore route if it needs the new statuses. A money restore notifies with `moneyAdded`, as in "Notifications". The restore is first built here, not in item 5. The contract test adds a case that puts entries under `MONEY#` and queries the prefix on all three stores.
*   **Tests**: a person alone with an entry is not offered a move; restore works, twice does nothing, a restore with a stale `deletedAt` (after a restore, an edit and a new delete) returns `entry_changed` and does nothing, and a restore returns `needs_two`, `pair_changed` or `money_limit` as they apply; the contract case.

### Step 2: The app

#### 8. `app/lib/moneyKeys.ts`, `app/lib/moneyOverlay.ts`, `app/lib/money.ts` (Create), `app/lib/mutations.ts`, `app/lib/deleted.ts` (Modify), `app/hooks/useMoneyActions.tsx` (Create), and the tests beside each

*   **Type / Scope**: Client data and actions.
*   **Proposed Changes**: `MONEY_KEY`. The money set in `app/lib/mutations.ts`: `moneyMutationKeys`, `MoneyMutationVars`, a runner table with each request path, method and body, `useMoneyMutation`, and the registration through `registerSet` with `['money']` invalidated. `describeFailure` checks the money codes before its generic 409 branch. `applyPendingMoney` applies pending writes with the `applyEntry` rules. `useMoney()` returns `{ status; entries; total; loans; settled; unsaved; dataUpdatedAt; refetch }`, with the total and loans worked out by `ledger.ts` from the overlaid entries, and the other member taken from `useHousehold` or, when that member has left, from the ledger's participants as a "Former member". `deletedEntries` in `app/lib/deleted.ts` takes the money entries. `useMoneyActions` builds each mutation's variables and the "Let them know" fields.
*   **Tests**: each key has a registered default with scope `household`; each overlay changes the data; a failed write drops its overlay when it settles; a refused stale write shows the wording; the total from the overlay equals the total from the server for the same entries; the unsaved count; a cache saved with `schemaVersion` 1 and a pending money write and a pending change request restores and replays.

#### 9. `app/components/money/` (Create), `app/routes/money._index.tsx` (Create), `app/routes/money.$id.tsx` (Create), `app/routes/deleted.tsx` (Modify), `app/components/layout/DefaultLayout.tsx` (Modify), `app/__tests__/wording.test.ts` (Modify), and the tests beside each

*   **Type / Scope**: Screens, navigation and the wording guard.
*   **Proposed Changes**: The components in "Views": `TotalCard`, `WaitingList`, `LoanList`, `EntryList`, `EntryRow`, `AddSheet` (which also edits) and `EntryDetail`, and the two routes. The Money tab goes after Shopping in `NAV_ITEMS` (icon `IconPigMoney`). The Deleted page gains its Money group and helper text. The wording test gains `BANNED_PHASE_3 = /\b(owe|owes|owed|debt|debts|unpaid|behind)\b/i` over the money files, and a check that each static fragment of the Wording table appears in them ("to settle, from", "All square", "Waiting for", "Not saved yet", "wants to check this one", "Change waiting for", "paid back", "Needs another look", "Show settled").
*   **Tests**: CUJ 1 to 6 and 9 and 10 with mocks (the total, progress, the overpayment, the all-square page, the change request); CUJ 7 offline with the unsaved note; CUJ 8's hint; the form works out the share for each split with the payer as either member, and shows the share error; a payment's loan list holds only the sender's open loans; one member and a changed pair show read-only with "Former member"; the layout test lists six tabs, in order; the touch-target test text says six tabs; axe on `/money` and `/money/:id`, with the heading levels in order.

### Step 3: Finish

#### 10. `src/store/cli.ts` (Modify), `src/store/__tests__/cli.test.ts` (Modify)

*   **Type / Scope**: Check tool.
*   **Proposed Changes**: `money-total <householdId>` in `src/store/cli.ts`, with its `USAGE` text. It reads the household's members and entries, takes "me" as the first member and "other" as the second, and prints the total and each loan's progress using `ledger.ts`. It handles a household with one member. It writes nothing. `ledger.ts` and the money types must compile under the build's `--strict` flags (`scripts/build-store-cli.cjs`).
*   **Tests**: the printed total equals `computeTotal` for a fixture household, for one and two members.

#### 11. `e2e/offline/main.tsx`, `e2e/offline/offline.spec.ts` (Modify)

*   **Type / Scope**: Offline test.
*   **Proposed Changes**: In `main.tsx`, register a `moneyAdd` kind and make the stub path `PUT /api/hh/money/{id}`. In `offline.spec.ts`, handle that route in the stub and add a case: with the network off, queue an entry, close the page during backoff, reopen it, go online, and check the `mutationId` is stored once.

#### 12. `docs/MANUAL-CHECKS.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `docs/DECISIONS.md`, `README.md` (Modify)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: "Money (phase 3)" checks in `MANUAL-CHECKS.md`: record a real loan and a real shared expense on each phone and compare the total with a hand count; agree and decline on the other phone; record a repayment and see the loan move; change and delete an agreed entry; use it in airplane mode; add the same payment from both phones and see the hint; check that no screen relies on colour alone; check the six tabs at the largest text size; and run the month-later check. The roadmap lists the three steps. `CLAUDE.md` gets a "Money" line in its Architecture list and moves its status line. `DECISIONS.md` gets "Phase 3 design (2026-11-15)" with the Claude decisions and "Spec says / Built / Why" rows wherever a step differs. `README.md` mentions the money tracker.

### Verification Plan

*   **Compilation/Build**: `yarn typecheck` and `yarn build` pass after every step.
*   **Unit Tests**: `yarn test` passes. The ledger tests include the property tests. The store contract tests also run against DynamoDB Local with `DYNAMODB_ENDPOINT=http://localhost:8000 yarn test`.
*   **Static Analysis and Linting**: The wording test, the mutation-registry test, the touch-target test and the infrastructure guard test pass.
*   **E2E/Integration**: `yarn test:e2e` runs the offline case added in step 3. The axe check runs on every new route.
*   **Manual**: Run the new lines in `docs/MANUAL-CHECKS.md` on two real phones before phase 3 is called done, including the one-month check.
*   **Compatibility**: A test restores a saved cache with `schemaVersion` 1 that holds a pending money write and a pending change request, and both replay.

--------------------------------------------------------------------------------

*Drafted with EGM*
