import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { participants } from '../shared/ledger';
import { ConditionFailedError } from '../store';
import type { Item as StoreItem, Store, TxOp, UpdateOp } from '../store';
import { TaskError } from '../tasks/types';
import { createEntry, deleteEntry, editEntry, respondToEntry, restoreEntry, unitProblem } from './applyEntry';
import type { Applied } from './applyEntry';
import { MONEY_PREFIX, moneyKey } from './keys';
import type { ChangeInput, MoneyChange, MoneyData, MoneyEntry, MoneyKind, MoneyPutInput, RespondInput } from './types';

export const MONEY_LIMIT = 2000;
export const DELETED_LISTED = 50;
export const MAX_ATTEMPTS = 3;

export function toEntry(raw: StoreItem): MoneyEntry {
  const entry: MoneyEntry = {
    id: raw.SK.slice(MONEY_PREFIX.length),
    kind: raw.kind === 'loan' || raw.kind === 'payment' ? raw.kind : 'expense',
    paidBy: String(raw.paidBy ?? ''),
    amountPence: Number(raw.amountPence),
    sharePence: Number(raw.sharePence),
    description: String(raw.description ?? ''),
    on: String(raw.on ?? ''),
    fieldTimes: structuredClone((raw.fieldTimes as MoneyEntry['fieldTimes'] | undefined) ?? {}),
    status: raw.status === 'agreed' || raw.status === 'declined' ? raw.status : 'waiting',
    version: Number(raw.version),
    createdBy: String(raw.createdBy ?? ''),
    createdAt: Number(raw.createdAt),
    proposedBy: String(raw.proposedBy ?? ''),
    updatedAt: Number(raw.updatedAt),
    updatedBy: String(raw.updatedBy ?? ''),
  };
  if (typeof raw.loanId === 'string') entry.loanId = raw.loanId;
  if (typeof raw.agreedAt === 'number') entry.agreedAt = raw.agreedAt;
  if (typeof raw.agreedBy === 'string') entry.agreedBy = raw.agreedBy;
  if (raw.status === 'declined' && typeof raw.declinedBecause === 'string') entry.declinedBecause = raw.declinedBecause;
  if (raw.pendingChange !== undefined) entry.pendingChange = structuredClone(raw.pendingChange as MoneyEntry['pendingChange']);
  if (typeof raw.deletedAt === 'number') entry.deletedAt = raw.deletedAt;
  if (typeof raw.deletedBy === 'string') entry.deletedBy = raw.deletedBy;
  return entry;
}

// The stored form: the same fields, with the keys, and nothing set to undefined.
function toRecord(householdId: string, entry: MoneyEntry): StoreItem {
  const { id, ...fields } = entry;
  const record: StoreItem = { ...moneyKey(householdId, id), ...fields };
  for (const name of Object.keys(record)) if (record[name] === undefined) delete record[name];
  return record;
}

type Guard = Pick<UpdateOp, 'ifEquals' | 'ifMissing'>;

// The update that turns what is stored into `next`: the attributes that changed, and the ones that went away. It applies only to
// the state that was read: the same update time, version and status, on an entry that is not deleted.
function updateFor(householdId: string, existing: StoreItem, next: MoneyEntry, guard?: Guard): TxOp {
  const after = toRecord(householdId, next);
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(after)) {
    if (name !== 'PK' && name !== 'SK' && JSON.stringify(value) !== JSON.stringify(existing[name])) set[name] = value;
  }
  const remove = Object.keys(existing).filter(name => name !== 'PK' && name !== 'SK' && !(name in after));
  return {
    update: moneyKey(householdId, next.id), set, remove,
    ...(guard ?? { ifEquals: { updatedAt: existing.updatedAt, version: existing.version, status: existing.status }, ifMissing: ['deletedAt'] }),
  };
}

// What the pair and limit rules read: who is named in each entry, and whether it is deleted. Not the text.
export type LedgerRow = Pick<MoneyEntry, 'paidBy' | 'createdBy' | 'proposedBy' | 'agreedBy'> & { deletedAt?: number };

export async function ledgerRows(store: Store, householdId: string): Promise<LedgerRow[]> {
  const rows = await store.query(hhPk(householdId), { skPrefix: MONEY_PREFIX, attributes: ['SK', 'paidBy', 'createdBy', 'proposedBy', 'agreedBy', 'deletedAt'] });
  return rows.map(row => {
    const entry: LedgerRow = { paidBy: String(row.paidBy ?? ''), createdBy: String(row.createdBy ?? ''), proposedBy: String(row.proposedBy ?? '') };
    if (typeof row.agreedBy === 'string') entry.agreedBy = row.agreedBy;
    if (typeof row.deletedAt === 'number') entry.deletedAt = row.deletedAt;
    return entry;
  });
}

export const liveCount = (rows: readonly LedgerRow[]): number => rows.filter(row => row.deletedAt === undefined).length;

// The two reasons a ledger cannot be written to: not two members, or someone named in it is no longer one of them.
export function pairProblem(ctx: HouseholdContext, rows: readonly LedgerRow[]): 'needs_two' | 'pair_changed' | undefined {
  if (ctx.members.length !== 2) return 'needs_two';
  const members = new Set(ctx.members.map(member => member.userId));
  return participants(rows).every(id => members.has(id)) ? undefined : 'pair_changed';
}

export function fail(refusal: Extract<Applied, { ok: false }>): never {
  throw new TaskError(refusal.code, refusal.status, refusal.extra ?? {});
}

function assertWritable(ctx: HouseholdContext, rows: readonly LedgerRow[]): void {
  const problem = pairProblem(ctx, rows);
  if (problem) throw new TaskError(problem, 409);
}

// Checks that need the household or other entries: the payer is a member, and a payment's loan is live, agreed, a loan, and
// borrowed by the sender.
export async function assertMoney(store: Store, ctx: HouseholdContext, kind: MoneyKind, money: MoneyChange, field = ''): Promise<void> {
  const named = (name: string): string => (field === '' ? name : `${field}.${name}`);
  const problem = unitProblem(kind, money);
  if (problem) throw new TaskError('invalid', 400, { field: named(problem) });
  if (!ctx.members.some(member => member.userId === money.paidBy)) throw new TaskError('invalid', 400, { field: named('paidBy') });
  if (money.loanId === undefined) return;
  const loan = await store.get(moneyKey(ctx.householdId, money.loanId), { consistent: true });
  const usable = loan !== undefined && loan.kind === 'loan' && loan.status === 'agreed' && loan.deletedAt === undefined && loan.paidBy !== money.paidBy;
  if (!usable) throw new TaskError('invalid', 400, { field: named('loanId') });
}

const lostRace = (error: unknown, index: number): boolean => error instanceof ConditionFailedError && error.failedIndex === index;

export interface Prepared {
  entry: MoneyEntry;
  ops: TxOp[];
}

// The write shared by every route that changes one entry: the write record is read first, then the entry and the ledger are read
// consistently, `prepare` builds the update (and throws a refusal), and a lost race runs it again on what is stored now.
export async function writeEntry(
  store: Store, ctx: HouseholdContext, id: string, mutationId: string, nowMs: number,
  prepare: (raw: StoreItem | undefined, rows: LedgerRow[]) => Promise<Prepared> | Prepared,
): Promise<WriteOutcome<{ entry: MoneyEntry }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ entry: MoneyEntry }>(store, householdId, mutationId);
  if (replayed) return replayed;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(moneyKey(householdId, id), { consistent: true });
    const rows = await ledgerRows(store, householdId);
    assertWritable(ctx, rows);
    const { entry, ops } = await prepare(raw, rows);
    try {
      return await withWriteRecord(store, householdId, mutationId, ops, { entry }, Math.floor(nowMs / 1000));
    } catch (error) {
      if (ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

// An applied rule becomes an update of what was read, or nothing when it changed nothing.
export function preparedFrom(householdId: string, raw: StoreItem, applied: Applied): Prepared {
  if (!applied.ok) return fail(applied);
  if (!applied.changed) return { entry: applied.entry, ops: [] };
  return { entry: applied.entry, ops: [updateFor(householdId, raw, applied.entry)] };
}

export const requireRaw = (raw: StoreItem | undefined): StoreItem => {
  if (!raw) throw new TaskError('not_found', 404);
  return raw;
};

// A put to a missing id creates the entry (the body carries `kind`); a put to an existing one edits it.
export function putMoney(store: Store, ctx: HouseholdContext, id: string, input: MoneyPutInput, nowMs: number = Date.now()): Promise<WriteOutcome<{ entry: MoneyEntry }>> {
  const { householdId } = ctx;
  return writeEntry(store, ctx, id, input.mutationId, nowMs, async (raw, rows) => {
    if (!raw) {
      const { kind, money, description, on } = input;
      if (!kind || !money || !description || !on) throw new TaskError('not_found', 404);
      if (liveCount(rows) >= MONEY_LIMIT) throw new TaskError('money_limit', 409);
      await assertMoney(store, ctx, kind, money);
      const created = createEntry(id, { kind, money, description, on }, ctx.userId, nowMs);
      if (!created.ok) return fail(created);
      return { entry: created.entry, ops: [{ put: toRecord(householdId, created.entry), ifAbsent: true }] };
    }

    const existing = toEntry(raw);
    if (input.kind !== undefined) throw new TaskError('entry_changed', 409, { entry: existing });
    const applied = editEntry(existing, input, ctx.userId, nowMs);
    if (applied.ok && input.money) await assertMoney(store, ctx, existing.kind, input.money);
    return preparedFrom(householdId, raw, applied);
  });
}

export function respondMoney(store: Store, ctx: HouseholdContext, id: string, input: RespondInput, nowMs: number = Date.now()): Promise<WriteOutcome<{ entry: MoneyEntry }>> {
  return writeEntry(store, ctx, id, input.mutationId, nowMs, raw => {
    const found = requireRaw(raw);
    return preparedFrom(ctx.householdId, found, respondToEntry(toEntry(found), input.response, input.version, ctx.userId, nowMs, input.because));
  });
}

export function deleteMoney(store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now()): Promise<WriteOutcome<{ entry: MoneyEntry }>> {
  return writeEntry(store, ctx, id, input.mutationId, nowMs, raw => {
    const found = requireRaw(raw);
    return preparedFrom(ctx.householdId, found, deleteEntry(toEntry(found), ctx.userId, nowMs));
  });
}

// Every live entry, and the 50 most recently deleted ones, in id order. A deleted entry is never purged, so there is no age cutoff.
export async function listMoney(store: Store, ctx: HouseholdContext, nowMs: number = Date.now()): Promise<MoneyData> {
  const all = (await store.query(hhPk(ctx.householdId), { skPrefix: MONEY_PREFIX })).map(toEntry);
  const live = all.filter(entry => entry.deletedAt === undefined);
  const deleted = all.filter(entry => entry.deletedAt !== undefined).sort((a, b) => b.deletedAt! - a.deletedAt!).slice(0, DELETED_LISTED);
  const entries = [...live, ...deleted];
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries, serverTime: nowMs };
}

export type MoneyRestoreStatus = 'restored' | 'noop' | 'not_found' | 'needs_two' | 'pair_changed' | 'money_limit' | 'entry_changed';

// What a restore batch reads once: the ledger, and how many entries are live as the batch restores them.
export interface RestoreBatch {
  rows?: LedgerRow[];
  live?: number;
}

// One entry, in its own transaction, applied only to the deletion the person saw. It returns waiting (or agreed, if no agreement
// is needed), with a new version, so the other person agrees again.
export async function restoreMoneyEntry(
  store: Store, ctx: HouseholdContext, target: { id: string; deletedAt: number }, batch: RestoreBatch, nowMs: number,
): Promise<MoneyRestoreStatus> {
  const { householdId } = ctx;
  const raw = await store.get(moneyKey(householdId, target.id), { consistent: true });
  if (!raw) return 'not_found';
  if (raw.deletedAt === undefined) return 'noop';
  if (raw.deletedAt !== target.deletedAt) return 'entry_changed';

  batch.rows ??= await ledgerRows(store, householdId);
  const problem = pairProblem(ctx, batch.rows);
  if (problem) return problem;
  batch.live ??= liveCount(batch.rows);
  if (batch.live >= MONEY_LIMIT) return 'money_limit';

  const next = restoreEntry(toEntry(raw), ctx.userId, nowMs);
  try {
    await store.transact([updateFor(householdId, raw, next, { ifEquals: { deletedAt: raw.deletedAt } })]);
  } catch (error) {
    // Restored (noop) or deleted again (entry_changed) since it was read: it is not the deletion this entry saw.
    if (!(error instanceof ConditionFailedError)) throw error;
    const now = await store.get(moneyKey(householdId, target.id), { consistent: true });
    return now?.deletedAt === undefined ? 'noop' : 'entry_changed';
  }
  batch.live += 1;
  return 'restored';
}
