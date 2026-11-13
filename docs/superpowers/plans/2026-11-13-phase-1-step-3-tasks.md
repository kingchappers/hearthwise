# Phase 1, Step 3: Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people share chores and to-dos: create, edit, repeat, complete (with duplicate handling), undo, delete and restore, propose changes to each other's tasks, and see them in a full list and a "next thing" card.

**Architecture:** Pure shared schedule and view rules; server domain modules in `src/tasks/` on the Step 2 Store `update` op, every write behind a `MUT#` write record in the same transaction; routes behind `withHousehold`. The client reads one polled list, applies pending mutations as a pure overlay, and registers every mutation with `setMutationDefaults` (persistence arrives in step 5).

**Tech Stack:** TypeScript (strict), Vitest, React Router + TanStack Query v5, Mantine.

**Spec:** `docs/designs/phase-1-foundation.md`. This plan covers its **Step 3** (items 20, 21, 21a, 22, 23, 24, 25, 25a, 26) and CUJs 2, 3, 4, 6, 7, 9 (tasks part). Sections the tasks argue from: "Data model", "Task writes", "Completing a task", "Recycle bin", "Proposals", "Sync and offline on the client", "Views", "API routes".

## Global Constraints

- All task dates are local calendar dates `YYYY-MM-DD` in the household's timezone; chores are due on a day, not at a time. Date arithmetic is on dates only (no hour arithmetic), so daylight-saving days are not special.
- Item keys: task `HH#<hid>`/`TASK#<taskId>`; completion `DONE#<taskId>#<cycleSeq>` with `cycleSeq` zero-padded to 8 digits; edit history `EDIT#<taskId>#<at>`; proposal `PROPOSAL#<id>`; write record `MUT#<mutationId>`.
- An attribute that is not set is left out of an item, never stored as `null`. `expiresAt` is epoch **seconds**. `updatedAt`, `completedAt`, `at` and `fieldTimes` values are epoch **milliseconds**.
- Retention: `DONE` and `EDIT#` 400 days; write record 8 days; deleted task `deletedAt + 30 days`; done to-do `doneAt + 30 days` (list hides ones done over 7 days ago); resolved proposal 30 days.
- Timestamps more than 5 minutes ahead of server time are clamped to server time. Client timestamps must be integers not before 2026-01-01.
- Validation limits (item 21a): ids UUID; title 1-120 (trimmed); notes up to 2,000; checklist up to 30 steps of 1-120; `repeat.days` 1-365; `repeat.every` 1-52; `repeat.weekdays` 1-7 distinct of `mon`..`sun`; `repeat.dayOfMonth` 1-31; dates real `YYYY-MM-DD`; item `text` 1-200, `quantity` up to 40 (step 4); batch and restore lists 1-100.
- Error bodies: `{ error: '<code>' }` plus extras. New codes and statuses: `proposal_required` 403, `gone` 410 (task deleted), `conflict` 409 (stale base version or cycle), `not_found` 404. Existing: `invalid` 400 with `field`, `no_household` 403.
- Every write route requires a UUID `mutationId`, and accepts optional `notify` and `clientAt` that are ignored until step 6.
- Wording: nothing in the UI reads "overdue", "missed" or "streak"; past-due reads "Due · <date>"; no red. Buttons are never `xs`.
- Commits are conventional, imperative, under 72 characters, ending with the attribution trailer from the session's system-reminder. Work on branch `step-3-tasks` (cut from `step-2-accounts`; rebase onto `main` once step 2 merges). Every task leaves `yarn typecheck` and `yarn test` green.

## Decisions made in this plan (the spec is silent or inconsistent)

- Records are stored with nested objects (`repeat`, `checklist`, `checklistState`, `fieldTimes`) as attribute values; store conditions only ever name scalars (`updatedAt`, `ruleVersion`, `cycleSeq`, `deletedAt`, `status`).
- `updatedAt` is server time in ms and the compare-and-set token for `patchTask` and `completeCycle`.
- "Proposal required" is decided by `src/tasks/ownership.ts` from the loaded task and the caller; handlers never decide it.
- The household write routes from step 2 start requiring `mutationId` (Task 7), and record it with the write record.
- The Today page's `defaultView` comes from `GET /api/hh` (`me.settings.defaultView`).
- `useTasks()` shows no "Changed on <name>'s phone" banner entries beyond a simple per-mutation error list until step 5 adds persistence; a 409/410 refetches and shows one line.

## Review Focus

1. **Replays out of order:** an old title edit, an old tick, an old completion replayed after newer writes never reverse them. [Task 3, Task 4]
2. **Racing writers:** two completions, completion vs delete, accept vs withdraw, undo vs "also did it" each leave one winner and no half state. [Task 4, Task 5]
3. **Garbage input:** a task id that is not a UUID, a 10 KB title, 31 checklist steps, `repeat.every: 0`, `dueOn: '2026-02-30'`, an unknown key in a PATCH: always 400 naming the field, never a 500, never a store key built from the raw input. [Task 2, Task 6]
4. **Cross-household and cross-member access:** another household's task id answers 404; only the recipient accepts, only the proposer withdraws; a removed member's tasks read as `either`. [Task 5, Task 6]
5. **Dates at the edges:** the 31st in February, a Sunday rule completed on a Friday, a completion replayed a day later, the household timezone's midnight (not UTC). [Task 1, Task 4]

---

### Task 1: Schedule rules (pure)

**Files:**
- Create: `src/shared/schedule.ts`
- Test: `src/shared/__tests__/schedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Weekday = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun';
  export type Repeat =
    | { type: 'none' }
    | { type: 'after'; days: number }
    | { type: 'fixed'; every: number; unit: 'day'|'week'|'month'; weekdays?: Weekday[]; dayOfMonth?: number; startOn: string };
  export function dayInZone(ms: number, timezone: string): string            // 'YYYY-MM-DD' of that instant in the zone
  export function addDays(day: string, n: number): string
  export function isRealDate(day: string): boolean
  export function nextDueOn(repeat: Repeat, cycleDueOn: string | undefined, completionDay: string): string | null
  export function firstOnOrAfter(repeat: Repeat, day: string): string       // for a new or changed repeat rule
  export function isDue(task: { dueOn?: string; status: 'open'|'done' }, today: string): boolean
  ```
- Semantics (design "Working out the next due date"): `after`: `max(completionDay + days, cycleDueOn + 1)` (cycleDueOn absent counts as completionDay); `fixed`: first occurrence strictly after `cycleDueOn`, then repeatedly the next until after `completionDay`; `none`: `null`. Weeks start Monday; weekday rules fall on the listed weekdays in every Nth week counted from the week containing `startOn`; months use `dayOfMonth` (default `startOn`'s day), 29-31 clamp to the month's last day; days are `startOn` + multiples of N.

- [ ] **Step 1: Write the failing tests** (`schedule.test.ts`), one `it` per line: each repeat type; `after 7` late (done 3 days after due) moves to done+7; `after 1` completed the day before it's due moves to the due day + 1; `fixed` every Sunday completed on the Friday before moves to the Sunday after the cycle's Sunday; completed three weeks late lands on the first Sunday after the completion day (no backlog); daily fixed completed late moves to tomorrow; every 2 weeks on mon+thu from a Wednesday `startOn` (week of `startOn` is week 0); monthly `dayOfMonth: 31` in February gives the 28th and in a leap year the 29th; monthly with `startOn` 2026-01-31 and no `dayOfMonth` uses 31; `firstOnOrAfter` returns `day` itself when it matches; `dayInZone(Date.UTC(2026,5,30,23,30), 'Europe/London')` is `2026-07-01` and the same instant in `UTC` is `2026-06-30`; spring-forward and fall-back days (2026-03-29, 2026-10-25 in `Europe/London`) add one day exactly; `isRealDate('2026-02-30')` false, `'2028-02-29'` true; `isDue` is true for `dueOn <= today` open tasks only.
- [ ] **Step 2: Run to see them fail.** Run: `yarn vitest run src/shared/__tests__/schedule.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/shared/schedule.ts` to the signatures. Use `Intl.DateTimeFormat('en-CA', { timeZone })` for `dayInZone`; do date math by converting `YYYY-MM-DD` to a UTC day number.
- [ ] **Step 4: Run `yarn typecheck && yarn vitest run src/shared`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add repeat rules and next-due-date maths`.

---

### Task 2: Task validation

**Files:**
- Modify: `src/shared/validation.ts`
- Test: `src/shared/__tests__/validation.test.ts`

**Interfaces:**
- Consumes: `Parsed<T>`, `good`, `bad` (existing), `Repeat`, `isRealDate` (Task 1).
- Produces (each returns `Parsed<T>` with `field` naming the failing field, e.g. `repeat.every`, `checklist[2].text`):
  ```ts
  export const parseUuid = (value: unknown, field: string): Parsed<string>
  export const parseTaskTitle: (v: unknown) => Parsed<string>        // 1-120 trimmed
  export const parseNotes: (v: unknown) => Parsed<string>            // 0-2000
  export const parseChecklist: (v: unknown) => Parsed<{ id: string; text: string }[]>
  export const parseRepeat: (v: unknown) => Parsed<Repeat>
  export const parseDay: (v: unknown, field: string) => Parsed<string>
  export const parseClientTime: (v: unknown, field: string) => Parsed<number>   // int ms, >= 2026-01-01
  export const parseAssignee: (v: unknown) => Parsed<string>         // uuid-like userId, 'either' or 'both'
  export function parseCreateTask(body): Parsed<CreateTaskInput>
  export function parsePatchTask(body): Parsed<PatchTaskInput>       // named fields only; unknown key invalid; empty invalid
  export function parseCompleteBody(body): Parsed<{ cycleSeq: number; completedAt: number; mutationId: string }>
  export function parseProposalBody(body): Parsed<ProposalInput>
  export function parseRestoreBody(body): Parsed<{ entries: { kind: 'task'|'item'; id: string }[]; mutationId: string }>
  ```
  `CreateTaskInput`, `PatchTaskInput` and `ProposalInput` are defined in `src/tasks/types.ts` (Task 3 creates it; this task creates the file with the types and nothing else).
- Shapes: create `{ id, title, notes?, assignee, repeat, dueOn?, checklist?, mutationId, clientAt?, notify? }` (`assignee` must be `either` or the caller is not known here, so any userId-shaped string or `either`/`both` passes and ownership decides); patch accepts `title`+`titleAt`, `notes`+`notesAt`, `checklist`+`checklistAt`, `ticks: { cycleSeq, steps: { [stepId]: { done, at } } }`, `assignee`+`baseRuleVersion`, `repeat`+`dueOn`+`baseRuleVersion`, `dueOn`+`baseRuleVersion`+`baseCycleSeq`, always `mutationId`.

- [ ] **Step 1: Write the failing tests**, each limit at its edge and one past it: title `''`/120/121/whitespace; notes 2000/2001; checklist 30/31 steps, a 121-character step, a duplicate step id; `repeat.days` 0/1/365/366; `every` 0/1/52/53; `weekdays` `[]`, 7 distinct, a duplicate, `'funday'`; `dayOfMonth` 0/1/31/32; `dueOn` `'2026-02-30'`, `'2026-2-3'`, `'2026-02-28'`; `repeat` of type `fixed` without `startOn`; `at` `1767225599999` (just before 2026-01-01) invalid and `1767225600000` valid, `1.5`, a string; unknown key in a patch names that key; an empty patch is `invalid` field `body`; a `repeat` change without `dueOn` is `invalid` field `dueOn` unless the rule is `none`; a `dueOn` change without both base versions names the missing one; a 10,000-character title fails without throwing.
- [ ] **Step 2: Run to see them fail** (`yarn vitest run src/shared/__tests__/validation.test.ts`).
- [ ] **Step 3: Implement** the validators and the types file. Reuse the existing `trimmedText` and `unknownKey` helpers.
- [ ] **Step 4: Run `yarn typecheck && yarn vitest run src/shared`; expect PASS.**
- [ ] **Step 5: Commit** `feat: validate task, schedule and proposal requests`.

---

### Task 3: Write records, task keys, create, list, patch, delete

**Files:**
- Create: `src/api/writeRecord.ts`, `src/tasks/keys.ts`, `src/tasks/tasks.ts`
- Modify: `src/tasks/types.ts` (add `Task`, `TaskError`), `src/household/keys.ts` unchanged
- Test: `src/api/__tests__/writeRecord.test.ts`, `src/tasks/__tests__/tasks.test.ts`

**Interfaces:**
- Consumes: Store (`get`, `query`, `transact`), `HouseholdContext`, validators (Task 2), `dayInZone` (Task 1).
- Produces:
  ```ts
  // keys.ts
  export const taskKey = (hid: string, id: string): Key
  export const doneKey = (hid: string, id: string, seq: number): Key        // DONE#<id>#<8-digit seq>
  export const TASK_PREFIX = 'TASK#'; export const DONE_PREFIX = 'DONE#'; export const EDIT_PREFIX = 'EDIT#'; export const PROPOSAL_PREFIX = 'PROPOSAL#'
  export const proposalKey = (hid: string, id: string): Key
  export const editKey = (hid: string, taskId: string, at: number): Key
  export const mutKey = (hid: string, mutationId: string): Key
  // writeRecord.ts
  export interface WriteOutcome<T> { fresh: boolean; result: T }
  export async function withWriteRecord<T>(store: Store, hid: string, mutationId: string, ops: TxOp[], result: T, nowSeconds?: number): Promise<WriteOutcome<T>>
  export async function readWriteRecord<T>(store: Store, hid: string, mutationId: string): Promise<T | undefined>
  // tasks.ts
  export class TaskError extends Error { constructor(readonly code: string, readonly status: number, readonly extra?: object) }
  export async function createTask(store: Store, ctx: HouseholdContext, input: CreateTaskInput, nowMs?: number): Promise<WriteOutcome<{ task: Task }>>
  export async function patchTask(store: Store, ctx: HouseholdContext, taskId: string, input: PatchTaskInput, nowMs?: number): Promise<WriteOutcome<{ task: Task }>>
  export async function deleteTask(store: Store, ctx: HouseholdContext, taskId: string, input: { baseRuleVersion: number; mutationId: string }, nowMs?: number): Promise<WriteOutcome<{ task: Task }>>
  export async function listTasks(store: Store, ctx: HouseholdContext, nowMs?: number): Promise<{ tasks: Task[]; serverTime: number }>
  ```
- `withWriteRecord` appends `{ put: MUT, ifAbsent: true }` (status 200, `result`, `expiresAt` now+8 days) to `ops` and runs one `transact`; a `ConditionFailedError` whose `failedIndex` is the put's index means the record exists: return `{ fresh: false, result: stored }`; any other failed index rethrows. Callers put the write record last so earlier `failedIndex` values keep their meaning.
- `Task` is the item as the API returns it (design "Data model"), with `id` from the key. `patchTask`: field-timestamped title/notes/checklist applied only if newer than `fieldTimes`; ticks applied per step only if newer and `cycleSeq` equals current (else dropped, 200, no write); schedule fields applied with `ifEquals: { ruleVersion }` (+ `cycleSeq` for a lone `dueOn`) or 409 `conflict`; a `repeat` change takes the client's `dueOn` if on or after today in the household zone, else `firstOnOrAfter(repeat, today)`, clears `overrideAssignee`/`overrideCycle`, bumps `ruleVersion`; an `assignee` change bumps `ruleVersion`; whole patch written with `ifEquals: { updatedAt }` and `ifMissing: ['deletedAt']`, retried up to 3 times on a lost race; a tombstone is `TaskError('gone', 410)`; a missing task is 404.
- `listTasks` returns open tasks, tombstones from the last 30 days, and to-dos done in the last 7 days, newest `updatedAt` last within each group is not required; order is by `id`.

- [ ] **Step 1: Write the failing tests.** `writeRecord`: first call fresh and writes; second call with the same mutation id returns `{ fresh: false, result: <first result> }` and writes nothing else; a failed condition elsewhere in `ops` rethrows and stores no record; `expiresAt` is 8 days ahead. `tasks`: create writes `cycleSeq: 1`, `ruleVersion: 1`; a replayed create returns the same task unchanged; a task id of another household is 404; patch: a replayed old title edit changes nothing and does not touch `dueOn`; two members' ticks on different steps both kept; a tick from the previous cycle is dropped with no write; a timestamp an hour ahead is clamped; `repeat` patch with an old `baseRuleVersion` is 409 `conflict`; a `repeat` patch sent after the other member completed the chore (cycleSeq moved, ruleVersion not) succeeds with a valid `dueOn`; "every Sunday" to "every Wednesday" moves `dueOn` to a Wednesday; an undated to-do changed to a chore gets a date; a `dueOn` edit keeps an accepted swap and a `repeat` change clears it; an `assignee` change bumps `ruleVersion`; delete tombstones with `deletedBy`, `expiresAt` = deletedAt + 30 days and bumps `ruleVersion`; deleting twice, and a retried delete after a restore (stale `baseRuleVersion`), leaves the restored task; patching a tombstone is 410 and writes nothing; creating then deleting straight away succeeds; `listTasks` leaves out to-dos done 8 days ago, keeps ones done 6 days ago, keeps a tombstone from 29 days ago, drops one from 31 days ago.
- [ ] **Step 2: Run to see them fail** (`yarn vitest run src/api/__tests__/writeRecord.test.ts src/tasks`).
- [ ] **Step 3: Implement** the files to the signatures. Read the task with `consistent: true` before every write.
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add task create, list, edit and delete with write records`.

---

### Task 4: Completing and undoing

**Files:**
- Create: `src/tasks/completions.ts`
- Test: `src/tasks/__tests__/completions.test.ts`

**Interfaces:**
- Consumes: Task 3 (`withWriteRecord`, `TaskError`, keys), `nextDueOn`, `dayInZone`.
- Produces:
  ```ts
  export async function completeCycle(store: Store, ctx: HouseholdContext, taskId: string, input: { cycleSeq: number; completedAt: number; mutationId: string }, nowMs?: number): Promise<WriteOutcome<{ task: Task; cycleSeq: number }>>
  export async function undoCompletion(store: Store, ctx: HouseholdContext, taskId: string, cycleSeq: number, input: { mutationId: string }, nowMs?: number): Promise<WriteOutcome<{ task: Task }>>
  ```
- Rules: design "Completing a task" rules 1-5 and "Undo" exactly, including: the `DONE` put is `ifAbsent` and the task update is conditional on `cycleSeq`, `deletedAt` missing and `updatedAt` unchanged, then the write record; when `DONE` exists the caller's `by_<userId>: completedAt` is added with `ifMissing` on that attribute (no write if already there); completion day = `dayInZone(completedAt, household.timezone)` with `completedAt` clamped to now + 5 minutes; a `both` task sets `together: true`; reload and re-apply up to 3 times; `DONE` gets 400-day `expiresAt`; a completed to-do sets `status: 'done'`, `doneAt`, 30-day `expiresAt` and keeps `dueOn`; the response carries the completed `cycleSeq`.

- [ ] **Step 1: Write the failing tests** (one per line of design item 23 that concerns completion): CUJ 2 (`after 1` hoover completed late goes to tomorrow); CUJ 3 (bathroom fixed every Sunday completed on a Wednesday goes to the next Sunday after the cycle's Sunday); CUJ 4 (two completions at once: date moves once, `DONE` holds both `by_` attributes); `after 1` completed early then again on its new due date moves both times; an edit that moves `dueOn` back, then a completion, moves the date; a replayed old title edit does not reverse a completion; a higher `cycleSeq` after an undo completes the current cycle; a lower one with no `DONE` is 409 `conflict` with the current task; a completion racing a delete is 410 and writes nothing; a retried completion (same `mutationId`) returns the stored result and does not complete the next cycle; a `both` task is recorded `together: true`; a completion replayed hours later uses its `completedAt` day (also across the household timezone's midnight); a to-do completes to `status: done` with `doneAt` and a 30-day `expiresAt`; a partly ticked checklist completes only when completion is called; completing clears `checklistState`, `overrideAssignee`, `overrideCycle` and records `clearedOverride`. Undo: removes only the caller's attribute when the other also did it (cycle stays done); an undo racing the other's "also did it" leaves the cycle done; sole completer reopens the cycle (`cycleSeq`, `dueOn`, `checklistState`, cleared override restored; to-do back to open without `doneAt`/`expiresAt`); undo is 409 when a swap was accepted for the next cycle; undoing a completion that cleared a swap brings it back; undo with no attribute is 200 and writes nothing; a reopened cycle completed again writes a new `DONE` with the same `cycleSeq`.
- [ ] **Step 2: Run to see them fail** (`yarn vitest run src/tasks/__tests__/completions.test.ts`).
- [ ] **Step 3: Implement** `completions.ts`; keep the load-apply-retry loop in one small helper.
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: complete and undo task cycles with duplicate handling`.

---

### Task 5: Ownership and proposals

**Files:**
- Create: `src/tasks/ownership.ts`, `src/tasks/proposals.ts`
- Modify: `src/tasks/tasks.ts` (call `ownership` before create, patch, delete; write `EDIT#` history)
- Test: `src/tasks/__tests__/ownership.test.ts`, `src/tasks/__tests__/proposals.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Produces:
  ```ts
  export type Change =
    | { kind: 'edit'; set: { assignee?: string; dueOn?: string; repeat?: Repeat } }
    | { kind: 'swap' } | { kind: 'delete' } | { kind: 'restore' };
  export interface Proposal { id: string; taskId: string; fromUserId: string; toUserId: string; change: Change; baseRuleVersion: number; baseCycleSeq?: number; status: 'pending'|'accepted'|'declined'|'withdrawn'|'stale'; createdAt: number; resolvedAt?: number; expiresAt?: number }
  // ownership.ts
  export function effectiveAssignee(task: Task, ctx: HouseholdContext): string     // swaps; non-member -> 'either'; 'both' with one member -> 'either'
  export function needsProposal(action: 'create'|'edit-schedule'|'edit-assignee'|'delete'|'restore'|'swap', task: Pick<Task,'assignee'>, ctx: HouseholdContext, target?: { assignee?: string }): boolean
  export function assertDirect(...): void                                          // throws TaskError('proposal_required', 403, { toUserId })
  // proposals.ts
  export async function createProposal(store, ctx, input: ProposalInput, nowMs?): Promise<WriteOutcome<{ proposal: Proposal }>>
  export async function acceptProposal(store, ctx, id: string, input: { mutationId: string }, nowMs?): Promise<WriteOutcome<{ proposal: Proposal; task?: Task }>>
  export async function declineProposal(store, ctx, id, input, nowMs?): Promise<WriteOutcome<{ proposal: Proposal }>>
  export async function withdrawProposal(store, ctx, id, input, nowMs?): Promise<WriteOutcome<{ proposal: Proposal }>>
  export async function listProposals(store, ctx, nowMs?): Promise<Proposal[]>    // pending involving caller + caller's own resolved in last 7 days
  ```
- Rules: design "Proposals" (who needs one, `both` tasks, always-direct title/notes/checklist/ticks/"I did this today", delivery lists, acceptance transaction with `ifEquals` on `ruleVersion` and `cycleSeq` plus `status: pending`, stale marking, swaps via `overrideAssignee`/`overrideCycle`, a completion never makes an `edit(assignee|repeat)`, `delete` or `restore` proposal stale; only the recipient accepts or declines, only the proposer withdraws; resolved proposals get a 30-day `expiresAt`). Direct title/notes/checklist edits to the other member's task write an `EDIT#<taskId>#<at>` item (`byUserId`, `fields`, 400-day `expiresAt`). Removed members' tasks read as `either`; proposals involving a non-member read as `stale`.

- [ ] **Step 1: Write the failing tests** (design item 23): CUJ 6 (a swap applies only on accept, gives this cycle to the proposer, reverts on the next cycle, goes stale after the cycle is completed); CUJ 7 (completing the other member's chore due tomorrow needs no proposal and moves the date past tomorrow); rescheduling or deleting a `both` task is `proposal_required` while a title edit applies; deleting the other member's task is `proposal_required` while a title edit applies and writes `EDIT#`; creating a task for the other member is `proposal_required` and the `edit` proposal that sets `assignee`, once accepted, makes it theirs; a repeat-rule proposal on a daily chore can be accepted after the chore was completed; accepting a proposal whose `ruleVersion` moved is marked `stale` and applies nothing; a retried accept (same `mutationId`) returns the stored result and does not mark an applied proposal stale; an accept and a withdraw racing leave one winner and the loser gets 409 `conflict` with the proposal as it now is; only the recipient can accept or decline (403 `forbidden` otherwise) and only the proposer can withdraw; `both` in a one-member household behaves as `either`; a removed member's assignee reads `either`; a proposal naming a removed member lists as `stale`; `listProposals` includes the caller's own proposals resolved 6 days ago and leaves out ones resolved 8 days ago.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the modules; thread `assertDirect` through `createTask`, `patchTask`, `deleteTask`.
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add task ownership rules and proposals`.

---

### Task 6: Restore, history and the HTTP routes

**Files:**
- Create: `src/tasks/restore.ts`, `src/tasks/history.ts`, `src/api/tasks.ts`
- Modify: `src/api/apiRoutes.ts`
- Test: `src/tasks/__tests__/restore.test.ts`, `src/api/__tests__/tasks.test.ts`

**Interfaces:**
- Consumes: Tasks 2-5.
- Produces:
  ```ts
  export async function restoreEntries(store, ctx, input: { entries: { kind: 'task'|'item'; id: string }[]; mutationId: string }, nowMs?): Promise<WriteOutcome<{ results: { id: string; status: 'restored'|'noop'|'proposal_required'|'invalid'|'not_found' }[] }>>
  export async function taskHistory(store, ctx, taskId: string): Promise<{ completions: { cycleSeq: number; cycleDueOn: string; by: { userId: string; at: number }[]; together: boolean }[]; edits: { byUserId: string; fields: string[]; at: number }[] }>
  export function registerTaskRoutes(router: Router): void
  ```
- Routes (design "API routes"): `GET /api/hh/tasks` -> `{ tasks, proposals, serverTime }` (no-store); `POST /api/hh/tasks` (201 + task); `PATCH /api/hh/tasks/{id}`; `DELETE /api/hh/tasks/{id}` (body or query `baseRuleVersion`, `mutationId` in the JSON body); `POST /api/hh/tasks/{id}/complete`; `DELETE /api/hh/tasks/{id}/completions/{cycleSeq}`; `GET /api/hh/tasks/{id}/history`; `POST /api/hh/proposals`; `POST /api/hh/proposals/{id}/accept|decline|withdraw`; `POST /api/hh/restore`. All behind `withHousehold`; `TaskError` becomes `err(status, code, extra)`; a non-UUID path id is 404 before any key is built. Restore: each entry its own transaction, an update removing `deletedAt`, `deletedBy`, `expiresAt` with `ifEquals: { deletedAt }`, bumping `ruleVersion`; not-deleted is `noop`; other member's or `both` tasks are `proposal_required`; `kind: 'item'` is `invalid` in this step; one write record holds all results; a restored done to-do gets its 30-day `expiresAt` back.

- [ ] **Step 1: Write the failing tests.** Restore: either member restores their own or an `either` task; the other member's task is `proposal_required` and a `restore` proposal then restores it on accept; restoring twice is a no-op; a retried restore returns its stored results; an edit to a tombstone is 410 and changes nothing but a restore succeeds; a batch restores only listed ids; `kind: 'item'` is `invalid`. HTTP (in-memory store, fake Auth0-style user ids): every route is 403 `no_household` without a household; a household or task id from another household is 404; a body `householdId` is ignored; garbage ids, a 10 KB title, 31 checklist steps, `repeat.every: 0`, `dueOn: '2026-02-30'`, an unknown PATCH key: 400 with the field and no 500; a missing `mutationId` is 400 field `mutationId`; a malformed path escape is 400; `GET /api/hh/tasks` returns tombstones from the last 30 days and the caller's pending proposals; history lists a completion with both `by` entries, earliest first.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** and register the routes in `apiRoutes.ts`.
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add task, proposal and restore routes`.

---

### Task 7: Step 2 writes require a mutation id; smoke test

**Files:**
- Modify: `src/api/households.ts`, `app/lib/household.ts`, `scripts/container-smoke.mjs`
- Test: `src/api/__tests__/households.test.ts`, `app/lib/__tests__/household.test.tsx`

**Interfaces:**
- Consumes: `withWriteRecord` (Task 3).
- Behaviour: `POST /api/households`, `PATCH /api/hh/members/me`, `POST|DELETE /api/hh/invites…`, `DELETE /api/hh/members/{userId}` and `POST /api/invites/accept` answer 400 field `mutationId` when it is missing, and the client hooks in `app/lib/household.ts` each send a fresh `crypto.randomUUID()`. (The write record wrapping of household create and invite accept is not added: their own conditions already make them idempotent; the id is required and validated now so step 5's replay has it.)

- [ ] **Step 1: Write the failing tests:** each listed route is 400 field `mutationId` without one and succeeds with one; each client mutation's request body contains a UUID `mutationId`.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** Extend `container-smoke.mjs`: after the two accounts exist, create a chore (daily `after 1`), complete it from both sessions with the same `cycleSeq`, check `GET /api/hh/tasks` shows `dueOn` moved once and `GET …/history` lists both people.
- [ ] **Step 4: Run `yarn typecheck && yarn test`, then `docker build -t hearthwise:dev . && node scripts/container-smoke.mjs hearthwise:dev`; expect PASS and "All steps passed".**
- [ ] **Step 5: Commit** `feat: require a mutation id on household writes and smoke the task flow`.

---

### Task 8: Client view rules, overlay, queries and mutations

**Files:**
- Create: `app/lib/tasks.ts`, `app/lib/overlay.ts`, `app/lib/queries.ts`, `app/lib/mutations.ts`
- Test: `app/lib/__tests__/{tasks,overlay,queries,mutations}.test.ts(x)`

**Interfaces:**
- Consumes: `Task`, `Proposal`, `Change` types (import type from `src/tasks`), `schedule.ts`, `useProtectedApi`.
- Produces:
  ```ts
  // tasks.ts (pure)
  export type Group = 'today' | 'week' | 'later' | 'whenever'
  export function groupTasks(tasks: Task[], today: string, members: MemberSummary[], viewerId: string): Record<Group, Task[]>
  export function effectiveAssignee(task: Task, members: MemberSummary[]): string
  export function nextThing(tasks: Task[], viewerId: string, today: string, members: MemberSummary[], skipped?: string[]): Task | undefined
  // overlay.ts
  export type Overlay = (data: TasksData, variables: any) => TasksData
  export const OVERLAYS: Record<MutationKey, Overlay>
  export function applyPending(data: TasksData, pending: { mutationKey: MutationKey; variables: unknown }[]): TasksData
  // queries.ts
  export const TASKS_KEY = ['tasks'] as const
  export function useTasks(): { status: 'loading'|'ready'|'error'; tasks: Task[]; proposals: Proposal[]; today: string; refetch: () => void }
  export function noteMutationSettled(): void                       // bumps the stale-response counter
  // mutations.ts
  export type MutationKey = ['task','create'] | ['task','edit'] | ['task','schedule'] | ['task','delete'] | ['task','complete'] | ['task','tick'] | ['proposal','create'] | ['proposal','accept'] | ['proposal','decline'] | ['proposal','withdraw'] | ['task','restore'] | ['task','uncomplete']
  export function registerMutations(client: QueryClient, request: Request, getData: () => TasksData): void   // setMutationDefaults for every key, scope { id: 'household' }
  export const mutationKeys: Record<string, MutationKey>
  ```
- Behaviour: design item 24. `groupTasks`: Today (due today or earlier), This week (up to and including the coming Sunday; weeks start Monday), Later, Whenever; `nextThing`: earliest `dueOn`, then the viewer's own before `either`/`both`, then title; undated to-dos only when nothing dated is due; "Not now" is the `skipped` list. `useTasks`: `refetchInterval: 10_000`, `refetchIntervalInBackground: false`, `refetchOnWindowFocus: true`; applies `useMutationState({ filters: { status: 'pending' } })` through `applyPending` in a `useMemo`; a `queryFn` whose request started before the counter last changed returns the previous data. Every mutation sends a fresh `mutationId` and reads base versions from the overlaid data when it runs. Creating for the other member or `both` queues a create (`either`) then an `edit` proposal. `registerMutations` is called once in `root.tsx`; no component defines a mutation inline.

- [ ] **Step 1: Write the failing tests:** group boundaries (today, Sunday, Monday after, no date); the Monday week start; `effectiveAssignee` for a swap in the current cycle, a removed member and `both` in a one-member household; `nextThing` ordering and the undated rule and `skipped`; a refetch returning while a tick is pending does not hide the tick; polling continues while a mutation is pending; a response whose request started before a mutation settled is discarded; every `MutationKey` has registered defaults and a scope of `household` (the "no unregistered household mutation" test: scan `app/` for `useMutation(` calls without `mutationKey` outside `household.ts` hooks, fail on any); a create for the other member queues a create then an `edit` proposal; `complete` base `cycleSeq` comes from the overlaid data; each mutation sends a UUID `mutationId`.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `yarn typecheck && yarn vitest run --project app`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add the client task data layer with an optimistic overlay`.

---

### Task 9: Task UI, Today page, Deleted page

**Files:**
- Create: `app/components/tasks/{TaskList,NextThing,TaskRow,TaskSheet,RepeatPicker,Checklist,DidThisToday,ProposalBanner,TaskHistory}.tsx`, `app/hooks/useUndoableDelete.tsx`, `app/routes/tasks.$id.tsx`, `app/routes/deleted.tsx`, `app/lib/deleted.ts`
- Modify: `app/routes/_index.tsx`, `app/routes/settings.tsx` (link to Deleted), `app/root.tsx` (call `registerMutations`), `app/__tests__/decisionText.test.tsx`
- Test: `app/components/tasks/__tests__/*.test.tsx`, `app/routes/__tests__/{tasks,deleted,pages}.test.tsx`, `app/lib/__tests__/deleted.test.ts`

**Interfaces:**
- Consumes: Task 8 (`useTasks`, mutation keys, `groupTasks`, `nextThing`), `useHousehold`, `useUndoDuration` from `~/lib/undoDuration`.
- Behaviour: design item 25 and 25a. Today shows `me.settings.defaultView` with a session-only toggle; rows and the card show "Due · <date>" (never "overdue"), the assignee, "Together" for `both`; `DidThisToday` is one tap on every row and card; "Not now" is session state and never calls the API; `TaskSheet` creates and edits (title, notes, assignee, repeat via `RepeatPicker` prefilled with `firstOnOrAfter`, checklist), shows "Ask <name>" instead of "Save" when `needsProposal` would be true, and warns "This cancels <name>'s swap" on a repeat change of a swapped task; `ProposalBanner` lists pending proposals for the viewer (Accept, Decline), the proposer's own pending (Withdraw) and resolved in the last 7 days ("No longer applies: the task changed" for `stale`); `TaskHistory` shows "Done by <name>", "Together", "Also did it" per further `by_` and the other member's edits, "Former member" for a non-member; "Swap this time" on the other person's task; undo toasts on complete (calls the uncomplete mutation with the returned `cycleSeq`) and delete (`useUndoableDelete` calls restore and treats a no-op as success); `deleted.ts` builds the Deleted list from cached tasks with `deletedAt`, newest first; the page reads "Deleted by <name>, <date>", one Restore per row, "Ask <name> to restore" for the other member's task.

- [ ] **Step 1: Write the failing tests:** no text "overdue", "missed" or "streak" in any rendered task component; "Not now" does not call the API and moves to the next card; `DidThisToday` calls complete once per tap; every new button is not `xs`; the sheet shows "Ask Bea" for the other member's task and "Save" for your own; the swap warning shows only for a swapped task's repeat change; the banner shows each of its three groups and the stale text; history labels; `deleted.ts` excludes non-deleted rows and orders newest first; Deleted shows "Ask <name> to restore" for the other member's task; hint texts added to `decisionText.test.tsx` are not dimmed or `xs`; an accessibility pass with `expectNoViolations` and `expectSoundHeadings` on Today and the task page.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** Reuse `ResponsiveSheet`, `LoadError`, `SaveStatus`, `ToastAction`.
- [ ] **Step 4: Run `yarn typecheck && yarn test && yarn build`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add the Today page, task sheet, proposals and the Deleted page`.

---

### Task 10: Docs, whole-step verification and review

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/ROADMAP.md`, `SECURITY.md`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Docs.** ROADMAP: mark step 3 built. CLAUDE.md: the new modules (`src/tasks`, `src/shared/schedule.ts`, write records, the overlay and mutation registry rule). DECISIONS: this plan's decisions. SECURITY: write records, ownership and proposals.
- [ ] **Step 2: Whole-step verification.** Run: `yarn install --frozen-lockfile && yarn typecheck && DYNAMODB_ENDPOINT=http://localhost:8000 yarn test && yarn build && yarn build:container && docker build -t hearthwise:dev . && node scripts/container-smoke.mjs hearthwise:dev && node scripts/container-smoke.mjs hearthwise:dev --proxy && tofu fmt -check -recursive infra`. Expected: everything passes. Also `grep -rniE "hoardwise|budget-app" src app infra scripts container .github` returns nothing outside tests that assert absence.
- [ ] **Step 3: Final review** by a fresh reviewer against the Review Focus section; fix Critical and Important findings test-first; record the rest.
- [ ] **Step 4: Commit** `docs: document tasks, proposals and write records`, push the branch and open the PR against `step-2-accounts` (or `main` if step 2 has merged).
