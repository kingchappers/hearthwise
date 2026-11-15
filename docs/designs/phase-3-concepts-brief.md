# Phase 3: money tracker (loans first)

* **Author:** kingchappers
* **Date:** 2026-11-15

## Overview

Phase 3 adds a money tracker for the two people in a household. It is built around loans. A loan shows its own progress ("£30 of £50 paid back"). Shared expenses sit alongside loans as ordinary entries. One total across everything says who owes whom, and how much.

Today the two of them use Monzo's split feature when both pay from Monzo. For anything on another card they work out the split and request money from each other. There is no running total. The new feature replaces that. Success is that they can enter every shared expense and loan, and the app shows one simple total.

Everything is in pounds, stored as whole pence. Entries are typed in by hand, by either person, at any time. Repayments are bank transfers made outside the app, and the app records them. The feature is separate from Hoardwise.

## Analysis

Six reviewers read the concept. They agreed on several points. These points shape the design, so they are listed first.

**1. The total and each loan's progress are worked out from the entries. They are never stored.**
Two people write offline at different times. A stored "balance so far" number would drift, and a wrong money figure is the worst failure this app can have. The balance is one pure function over the entries. The server and the phone's pending-writes overlay use the same function, as phase 1 does for dates. The same entries in any order give the same total. A test checks this.

**2. A repayment must say which loan it is for, or none.**
A bank transfer is recorded as a payment. A payment has an optional loan. With a loan chosen, it counts toward that loan's progress. With none chosen, it only lowers the total. A payment bigger than what is left on a loan completes the loan. The extra stays in the total as general credit and is not lost. Both numbers always move together, because a loan's progress is only the payments linked to it.

Worked example. Sam lends Alex £50. The total reads "Alex owes Sam £50" and the loan reads "£0 of £50". Alex sends £20 and records it against the loan. The total reads "Alex owes Sam £30" and the loan reads "£20 of £50". Alex then sends £35 against the loan. The loan reads "£50 of £50, paid back" and is tucked away. The total reads "Sam owes Alex £5", because £5 was overpaid.

**3. An entry's money fields change together, not one at a time.**
The amount, who paid and who it is for are one unit. If Sam changes the amount while Alex changes the split, a field-by-field merge could produce an entry nobody wrote. Phase 1 and 2 accept that kind of loss for words. Money cannot. An edit replaces the whole money unit and carries the version it was based on. If the entry has changed since, the edit is refused with a kind message and the current entry shown.

**4. The split is stored as one number: the other person's share in pence.**
Equal, fixed amount, "one person covers it all" and percentage all reduce to "how much of this does the other person owe". The form offers all four as shortcuts and works the number out when the entry is entered. The server stores a whole number and checks it is between 0 and the total. All the rounding happens once, at entry. For an equal split of an odd number of pence, the odd penny stays with the person who paid. A fixed-amount split that does not add up gets a plain message, such as "These add up to £48. The total is £50."

**5. The existing proposals code cannot be reused as it is.**
It is built around tasks: a task id, rule versions, cycles and assignees. The rule here is simpler. The person who added an entry changes it freely. The other person asks for a change, and the adder agrees or declines. Money gets its own small "change request" item, under its own key prefix, with its own routes. It copies the pattern and shares no code with tasks. A pending change request does not alter the total. The total counts only what is agreed, and the request is shown beside the entry as "Waiting for Sam".

**6. "Settled" and "tucked away" are worked out, not stored.**
A loan is settled when the payments linked to it add up to its amount. When the total is exactly zero, the app says "All square" and tucks away everything up to that point. A "Show settled" switch brings it back. Nothing is a stored flag, so a late edit can never leave the flag and the numbers disagreeing. A late edit to a tucked-away entry simply shows it again.

**7. Money records are never purged on a timer.**
The task and recipe recycle bins delete deleted items after 30 days. Applied to money, that would change the total with nobody doing anything. A deleted money entry leaves the total at once and can be restored, and it stays restorable. It is never auto-purged. Live and settled entries have no expiry. A payment whose loan is deleted becomes a general payment.

**8. The household must be exactly two people.**
If the other person has left, the entries stay and the balance is shown read-only. Money entries are refused when there are not exactly two members. This is decided before any entry is stored.

**9. Wording and notifications.**
The headline reads "£30 to settle, from Alex to Sam" (the softer form the author chose), and "All square" at zero. A short copy table covers the other states: all square, nothing paid yet, paid back, waiting for them, and each error. It goes into the existing wording test. No red is used, and direction is never shown by colour alone. A push notification for money is opt-in, as everywhere else, and it never contains an amount. It says something like "Sam added an entry". Held pushes do not store amounts.

**10. Operations.**
Each money write logs one line, as the add-to-shopping-list route does. It holds ids, the entry kind, the pence figures and counts. It never holds names or descriptions. Rejections log a reason code, such as a split that does not add up. A test checks that no description reaches the log. A small recalculation command in the store tool can recompute a household's balance from its entries for checking.

**11. Rollout.**
Money data uses new key prefixes only, so old code ignores it. The household-move check gains those prefixes in the same change, or a person holding only a loan would look like an empty household. New mutation keys are registered before anything is restored and are never renamed. The cache version stays at 1. The first release ships the routes and the screens together, and a rollback never deletes stored data.

**12. Build in slices.**
Slice 1 is entries, payments and the total. This alone meets the stated success measure. Slice 2 adds loans and their progress. Slice 3 adds change requests for the other person's entries.

**13. A new entry waits for the other person's okay. (Decided by the author.)**
An entry that gives the other person a share, a loan or a repayment does not count in the total until they agree. Until then it shows as "Waiting for Alex", and the adder can still edit or delete it. If the other person declines, the entry stays visible to the adder with a kind note, and the adder can change it and ask again, or delete it. An entry that leaves the other person owing nothing, such as "I covered it all", needs no agreement. This means the agree step is part of slice 1, and the money change request in point 5 covers new entries as well as edits. The pending state must not feel like nagging: there are no reminders, and waiting entries are listed calmly in one place.

**One risk the reviewers raised that is not settled.**
- The same payment can be entered twice, once by each person. A gentle hint on a matching amount and date helps. Deleting and restoring are the safety net.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  - Record loans, with each loan's own progress.
  - Record shared expenses with a per-entry split: equal, fixed amounts, one person covers it all, or percentage.
  - Record repayments, with an optional loan chosen for each.
  - One total across everything, in kind words, worked out from the entries.
  - Edit rule: the adder changes an entry; the other person asks and the adder agrees.
  - Settled loans and an all-square total tuck entries away, and they can be shown again.
  - A history for each entry saying who changed what and when, so "why did the total change?" has an answer.
  - Works offline like the rest of the app, with a visible "not saved yet" state.
* **Out-of-Scope Non-Goals:**
  - Budgets, categories, reports, charts, receipt photos and bank import.
  - Splitting the total by purpose, such as rent against groceries.
  - Any link to Hoardwise or to bank data. The data keeps who paid and who it is for, so a later link stays possible, but nothing is built toward it.
  - More than two people, or currencies other than pounds.
  - Reminders or nudges about money owed.
  - Recording the bank transfer itself. Transfers happen outside the app.

## Alternatives Weighed

- **Store a running balance and a "paid so far" counter.** Rejected: two people writing offline would make a stored number drift, and the existing conflict rule would corrupt it.
- **Reuse the task proposals code for the other person's changes.** Rejected: it is tied to tasks, and bending it would risk the tested two-person task paths. Money gets its own small change-request item.
- **Store the split type and its values.** Rejected: four modes mean four validation paths and rounding rules on the server. Storing the other person's share in pence needs one check.
- **A stored "settled" flag.** Rejected: it is a second source of truth that can disagree with the entries after a late edit.
- **Field-by-field last-writer-wins for money fields.** Rejected: a merge of one person's amount with another's split could record something nobody entered.
- **Use Monzo's split feature as it is.** Rejected by the author: it only works when both pay from Monzo, and it shows no running total.
- **Split the total by category or purpose.** Rejected by the author: one total across everything.
- **Link to Hoardwise now.** Deferred by the author: stay separate for now.
- **Expire money records on the 30-day rule.** Rejected: it would change the balance with nobody acting.

## Key Decisions & Staging for Next Steps

Decided with the author:
- Built around loans, each with its own progress. Shared expenses are secondary.
- One total across everything, in pounds, kept as whole pence.
- Per-entry split chosen from four shortcuts.
- Entries by hand. Repayments are recorded in the app and paid by bank transfer outside it.
- The adder changes an entry; otherwise the other person agrees.
- Settled items are tucked away.
- Two people only, separate from Hoardwise, kind non-accusatory wording.

Decided by Claude, from the review, and open to change:
- The total and each loan's progress are worked out from entries and never stored.
- A payment has an optional loan. A payment above what is left completes the loan and the extra stays as credit.
- The money fields of an entry change as one unit, with a version check.
- The split is stored as the other person's share in pence. The odd penny stays with the payer.
- Change requests are a separate small item with their own prefix. They do not change the total until agreed.
- "Settled" and "tucked away" are worked out, not stored. All square tucks away everything up to that point.
- Money entries never expire. A deleted entry leaves the total at once and stays restorable.
- Exactly two members are needed. If the other person leaves, the balance is read-only.
- Push messages never contain amounts.

Decided by the author in review:
- A new entry that affects the other person waits for their okay before it counts (point 13).
- The headline wording is the softer form: "£30 to settle, from Alex to Sam", and "All square" at zero.
- The other decisions above are accepted.

Still to decide:
- How many entries a household may hold, and whether old settled entries are archived.

Staging: three pull requests. Slice 1 is entries, payments, the agree step for new entries and the total. Slice 2 is loans and progress. Slice 3 is change requests for edits and deletes of the other person's entries.
