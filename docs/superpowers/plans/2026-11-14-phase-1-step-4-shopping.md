# Phase 1, Step 4: Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people share one shopping list: add, tick, edit, delete and restore items; "Clear ticked" with conflict handling; tick-conflicts settled by field timestamps.

**Architecture:** A pure `applyItemWrite` decides what a write does to an item (field timestamps, tombstones, clear-ticked). Domain functions load, apply and write with `ifEquals` on `updatedAt`, inside `withWriteRecord` (single writes) or one transaction per entry plus one record (batch). The client reuses step 3's polling, stale-response counter, overlay and mutation registry.

**Tech Stack:** TypeScript (strict), Vitest, React Router + TanStack Query v5, Mantine.

**Spec:** `docs/designs/phase-1-foundation.md`, Step 4 (items 27, 28, 29), CUJ 5 and 9, "Shopping-list conflicts", "Recycle bin", "Data model" (Shopping item).

## Global Constraints

- Item key `HH#<hid>`/`ITEM#<itemId>`; attributes `text`, `quantity`, `ticked`, `tickedBy`, `fieldTimes` (`text`, `quantity`, `ticked`), `updatedAt`, `deletedAt`, `deletedBy`, `expiresAt`. An attribute that is not set is left out, never `null`. `expiresAt` epoch seconds; times in ms.
- Validation: item `text` 1-200 characters (trimmed); `quantity` up to 40 (free text; empty clears it); batch and restore lists 1-100; ids UUID; client times integers not before 2026-01-01.
- A write's field timestamps are clamped to at most server time + 5 minutes; a field applies only if its time is newer than the stored one.
- A tombstone is final for edits (410, nothing written); only a restore brings an item back. Delete sets `expiresAt = deletedAt + 30 days`; deleting a tombstone does nothing.
- "Clear ticked" deletes an item only if it is still ticked and its stored `fieldTimes.ticked` is at or before the value the client sent; otherwise it is `skipped`.
- Any member may restore any item (no proposal). Every write carries a `mutationId`.
- Wording: neutral; no "overdue", "missed", "streak"; no red; no `xs` buttons.
- Conventional commits, imperative, under 72 characters, with the attribution trailer. Branch `step-4-shopping` (cut from `step-3-tasks`). Every task leaves `yarn typecheck` and `yarn test` green.

## Decisions made in this plan (the spec is silent)

- Wire shapes. `PUT /api/hh/items/{id}`: `{ text?, textAt?, quantity?, quantityAt?, ticked?, tickedAt?, mutationId, clientAt?, notify? }`; a `PUT` to a missing id creates the item and needs `text` with `textAt`. `DELETE /api/hh/items/{id}`: `{ mutationId }`. `POST /api/hh/items/batch`: `{ writes: [ <put fields with id> | { id, delete: true, ifTickedAt? } ], mutationId }` answering `{ results: [{ id, status }] }` with status `created | applied | noop | gone | skipped | invalid`.
- An item's `ticked` defaults to false with no `fieldTimes.ticked` (read as 0 by "clear ticked").
- A batch entry that fails validation is `invalid` and does not fail the batch.
- Restoring an item bumps nothing but `updatedAt` (items have no rule version).

## Review Focus

1. **Older writes never win:** an older untick, an older edit, an older delete replayed after newer writes. [Task 1, Task 2]
2. **Clear ticked races:** an item unticked or re-ticked on another phone after the clearing phone saw it is kept; a batch interrupted and retried writes each item once. [Task 2]
3. **Garbage:** a non-UUID item id, a 10 KB text, a 100-entry batch +1, a batch with a bad entry: 400 naming the field (or `invalid` for one entry), never a 500. [Task 1, Task 2]
4. **Cross-household:** another household's item id answers 404. [Task 2]
5. **A retried delete after a restore** leaves the item restored. [Task 2]

---

### Task 1: Item validation and the pure write rule

**Files:**
- Create: `src/shopping/types.ts`, `src/shopping/apply.ts`, `src/shared/itemValidation.ts`
- Test: `src/shopping/__tests__/apply.test.ts`, `src/shared/__tests__/itemValidation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export interface Item { id: string; text: string; quantity?: string; ticked: boolean; tickedBy?: string; fieldTimes: { text?: number; quantity?: number; ticked?: number }; updatedAt: number; deletedAt?: number; deletedBy?: string; expiresAt?: number }
  export interface ItemWrite { text?: { value: string; at: number }; quantity?: { value: string; at: number }; ticked?: { value: boolean; at: number } }
  export type WriteResult = 'created' | 'applied' | 'noop' | 'gone' | 'skipped'
  // apply.ts (pure)
  export function applyItemWrite(existing: Item | undefined, id: string, write: ItemWrite, userId: string, serverNow: number): { result: WriteResult; item?: Item }
  export function applyItemDelete(existing: Item | undefined, userId: string, serverNow: number, ifTickedAt?: number): { result: WriteResult; item?: Item }
  // itemValidation.ts, each Parsed<T> naming the field
  export function parseItemPut(body): Parsed<{ write: ItemWrite; mutationId: string; clientAt?: number }>
  export function parseItemBatch(body): Parsed<{ entries: BatchEntry[]; mutationId: string }>   // entries: { id; write?: ItemWrite; delete?: true; ifTickedAt?: number } | { id, invalid: field }
  export function parseItemDeleteBody(body): Parsed<{ mutationId: string }>
  ```
- Semantics: a missing `existing` with a write is `created` (needs `text`; otherwise `skipped`... `noop`); fields applied only when newer (clamped); `ticked: true` sets `tickedBy = userId`, `false` removes it; `quantity: ''` removes it; a tombstone answers `gone` for a put and `noop` for a delete; a delete sets `deletedAt`, `deletedBy`, `expiresAt`; a delete with `ifTickedAt` on an item that is not ticked, or whose `fieldTimes.ticked` is after it, is `skipped`; an already-tombstoned item deleted with `ifTickedAt` is `noop`.

- [ ] **Step 1: Write the failing tests.** `apply`: create from fields; an older untick does not override a newer tick; an edit with an older text time is ignored; an hour-ahead time is clamped to `serverNow`; ticking sets `tickedBy`, unticking removes it; empty quantity removes it; a put to a tombstone is `gone` and writes nothing; a delete tombstones with `expiresAt` 30 days on; deleting a tombstone is `noop`; clear-ticked skips an unticked item, an item ticked after `ifTickedAt`, and deletes one ticked at or before it. `itemValidation`: text 200/201 and whitespace-only, quantity 40/41, unknown key, missing `textAt`, a put with nothing in it, batch 100/101 and empty, an entry with a bad id is `invalid` not a failure, `ifTickedAt` must be a client time.
- [ ] **Step 2: Run to see them fail.** `yarn vitest run src/shopping src/shared/__tests__/itemValidation.test.ts`.
- [ ] **Step 3: Implement** to the signatures; reuse `good`/`bad`/`unknownKey`/`trimmedText` from `validation.ts` and `parseUuid`/`parseClientTime` from `taskValidation.ts`.
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add the shopping item write rule and its validation`.

---

### Task 2: Item domain, routes and restore

**Files:**
- Create: `src/shopping/items.ts`, `src/api/items.ts`
- Modify: `src/tasks/keys.ts` (`itemKey`, `ITEM_PREFIX`), `src/tasks/restore.ts` (kind `item`), `src/api/apiRoutes.ts`, `src/api/__tests__/apiRoutes.test.ts`
- Test: `src/shopping/__tests__/items.test.ts`, `src/api/__tests__/items.test.ts`, `src/tasks/__tests__/restore.test.ts`

**Interfaces:**
- Consumes: Task 1; `withWriteRecord`, `replayOf`; `HouseholdContext`.
- Produces:
  ```ts
  export async function putItem(store, ctx, id: string, input: { write: ItemWrite; mutationId: string }, nowMs?): Promise<WriteOutcome<{ item: Item }>>   // 410 TaskError('gone') for a tombstone, 400 for a create without text
  export async function deleteItem(store, ctx, id: string, input: { mutationId: string }, nowMs?): Promise<WriteOutcome<{ item: Item }>>
  export async function batchItems(store, ctx, input: { entries: BatchEntry[]; mutationId: string }, nowMs?): Promise<WriteOutcome<{ results: { id: string; status: string }[] }>>
  export async function listItems(store, ctx, nowMs?): Promise<{ items: Item[]; serverTime: number }>   // open items and tombstones from the last 30 days
  export function registerItemRoutes(router: Router): void
  ```
- Routes: `GET /api/hh/items`, `PUT /api/hh/items/{id}`, `DELETE /api/hh/items/{id}`, `POST /api/hh/items/batch`; all behind `withHousehold`; non-UUID id 404; `TaskError` mapped as in `src/api/tasks.ts` (reuse its `respondTo`/guard: extract to `src/api/respond.ts` if needed). `restoreEntries` restores `kind: 'item'` for either member (`ifEquals: { deletedAt }`).

- [ ] **Step 1: Write the failing tests** (design item 28): an older untick does not override a newer tick; an edit to a deleted item is 410 and does not bring it back; an hour-ahead time is clamped; a batch clear-ticked tombstones only ticked items and skips one unticked or re-ticked on another phone after the clearing phone saw it; a batch interrupted after some entries (simulate by running the first entries, then the whole batch again) ends with each item written once; a retried delete after a restore answers from its record and leaves the item restored; CUJ 5 replayed as a write sequence (adds, ticks, edits arriving out of order, a duplicate create replayed); CUJ 9 (an item deleted by one member is restored by the other and is in both lists); either member restores any item; a retried batch returns the stored results; HTTP: 403 `no_household`, 404 for another household's item, 400 for garbage (non-UUID id, 10 KB text, 101 entries, unknown key), `GET` returns tombstones from the last 30 days and not older.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** Single writes: replay check, load, `applyItemWrite`, write with `ifEquals: { updatedAt }` (or put `ifAbsent` for a create) inside `withWriteRecord`, retry up to 3 times. Batch: one transaction per entry, then `withWriteRecord([], { results })`.
- [ ] **Step 4: Run `yarn typecheck && yarn test`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add the shopping list routes and item restore`.

---

### Task 3: Client list and screen

**Files:**
- Create: `app/lib/items.ts`, `app/lib/itemOverlay.ts`, `app/hooks/useItemActions.tsx`, `app/components/shopping/{ShoppingList,AddItem,ItemRow,ClearTicked}.tsx`
- Modify: `app/lib/mutations.ts` (item kinds), `app/lib/pending.ts`, `app/lib/overlay.ts` (item kinds ignored by the task overlay), `app/lib/deleted.ts`, `app/routes/shopping.tsx`, `app/routes/deleted.tsx`
- Test: `app/lib/__tests__/{items,itemOverlay}.test.ts(x)`, `app/components/shopping/__tests__/*.test.tsx`, `app/routes/__tests__/shopping.test.tsx`, extend `deleted` tests and `mutations.test.ts`

**Interfaces:**
- Produces: `useItems(): { status; items: Item[]; refetch }` (same polling, stale counter and overlay as `useTasks`); mutation kinds `itemAdd`, `itemEdit`, `itemTick`, `itemDelete`, `itemClear`, `itemRestore`, each with variables `{ mutationId, at, by, ... }` registered with scope `household`; `sortItems(items): Item[]` (unticked first, ticked last, each by text); `deletedEntries(tasks, items)` for the Deleted page.
- Behaviour (design item 29): optimistic add, tick, edit and delete, each stamping field times with `Date.now()`; ticked items move to the bottom; "Clear ticked" sends each ticked item's `fieldTimes.ticked`, reports "N item(s) kept: changed on another phone" for skipped ids, and has undo through restore; the Deleted page groups Tasks and Shopping.

- [ ] **Step 1: Write the failing tests:** `sortItems` order; overlay for each item mutation (tick, add, edit, delete, restore, clear); `useItems` keeps a pending tick when a refetch lacks it and discards a stale response; each item mutation is registered with scope `household` and sends the documented body (clear-ticked sends `ifTickedAt` per item); the list shows ticked items last, a tick is one tap, add clears the field and keeps focus; clear ticked shows the kept message for a `skipped` result and offers undo; Deleted groups Tasks and Shopping and restores an item with one tap; no banned words, no `xs` buttons, sound headings and no unlabelled controls.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `yarn typecheck && yarn test && yarn build`; expect PASS.**
- [ ] **Step 5: Commit** `feat: add the shopping list screen with optimistic ticks`.

---

### Task 4: Docs, whole-step verification and review

- [ ] **Step 1: Docs.** ROADMAP step 4 built; CLAUDE.md (`src/shopping/`, item mutations); DECISIONS (this plan's decisions); SECURITY (item conflicts).
- [ ] **Step 2: Smoke.** `container-smoke.mjs`: add an item, tick it from both sessions, clear ticked, restore; check the list.
- [ ] **Step 3: Whole-step verification.** `yarn install --frozen-lockfile && yarn typecheck && DYNAMODB_ENDPOINT=http://localhost:8000 yarn test && yarn build && yarn build:container && docker build -t hearthwise:dev . && node scripts/container-smoke.mjs hearthwise:dev && node scripts/container-smoke.mjs hearthwise:dev --proxy && tofu fmt -check -recursive infra`.
- [ ] **Step 4: Final review** by a fresh reviewer against the Review Focus; fix Critical and Important test-first; ledger the rest.
- [ ] **Step 5: Commit** `docs: document the shopping list`, push, open the PR against `main` (or `step-3-tasks` if step 3 is unmerged).
