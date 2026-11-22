import { MAX_PENCE } from '../shared/money';
import { clampTime } from '../tasks/record';
import type { MoneyChange, MoneyEntry, MoneyKind, PendingChange } from './types';

// The pure write rules, shared by the server and the app's overlay. A refusal is a value, not a throw: the server turns it into a
// TaskError and the overlay simply leaves the entry as it was.
export interface Refusal {
  ok: false;
  code: string;
  status: number;
  extra?: Record<string, unknown>;
}
export type Applied = { ok: true; entry: MoneyEntry; changed: boolean } | Refusal;

const refuse = (code: string, status: number, extra?: Record<string, unknown>): Refusal => ({ ok: false, code, status, ...(extra ? { extra } : {}) });
const changedSince = (entry: MoneyEntry): Refusal => refuse('entry_changed', 409, { entry });
const forward = (existing: MoneyEntry, now: number): number => Math.max(now, existing.updatedAt + 1);
const done = (entry: MoneyEntry, changed = true): Applied => ({ ok: true, entry, changed });

// The field a figure fails on, from the rules that need only the kind. The stored entry's kind is used for an edit.
export function unitProblem(kind: MoneyKind, money: MoneyChange): string | undefined {
  if (!Number.isSafeInteger(money.amountPence) || money.amountPence < 1 || money.amountPence > MAX_PENCE) return 'amountPence';
  if (!Number.isSafeInteger(money.sharePence) || money.sharePence < 0 || money.sharePence > money.amountPence) return 'sharePence';
  if (kind !== 'expense' && money.sharePence !== money.amountPence) return 'sharePence';
  if (money.loanId !== undefined && kind !== 'payment') return 'loanId';
  return undefined;
}

function setMoney(entry: MoneyEntry, money: MoneyChange): void {
  entry.paidBy = money.paidBy;
  entry.amountPence = money.amountPence;
  entry.sharePence = money.sharePence;
  if (money.loanId === undefined) delete entry.loanId;
  else entry.loanId = money.loanId;
}

// Writes the description and date that are newer than what the entry holds. True when either changed.
function setTimed(entry: MoneyEntry, edit: { description?: { value: string; at: number }; on?: { value: string; at: number } }, now: number): boolean {
  let changed = false;
  for (const field of ['description', 'on'] as const) {
    const write = edit[field];
    if (!write) continue;
    const at = clampTime(write.at, now);
    if (at <= (entry.fieldTimes[field] ?? 0)) continue;
    entry[field] = write.value;
    entry.fieldTimes[field] = at;
    changed = true;
  }
  return changed;
}

// An entry whose other-member share is zero needs no agreement; any other waits for the responder.
function putInWaiting(entry: MoneyEntry, userId: string, now: number): void {
  entry.proposedBy = userId;
  delete entry.agreedBy;
  delete entry.declinedBecause;
  if (entry.sharePence === 0) {
    entry.status = 'agreed';
    entry.agreedAt = now;
  } else {
    entry.status = 'waiting';
    delete entry.agreedAt;
  }
}

export interface CreateEntryInput {
  kind: MoneyKind;
  money: MoneyChange;
  description: { value: string; at: number };
  on: { value: string; at: number };
}

export function createEntry(id: string, input: CreateEntryInput, userId: string, now: number): Applied {
  const problem = unitProblem(input.kind, input.money);
  if (problem) return refuse('invalid', 400, { field: problem });
  const entry: MoneyEntry = {
    id, kind: input.kind, paidBy: '', amountPence: 0, sharePence: 0, description: '', on: '', fieldTimes: {},
    status: 'waiting', version: 1, createdBy: userId, createdAt: now, proposedBy: userId, updatedAt: now, updatedBy: userId,
  };
  setMoney(entry, input.money);
  setTimed(entry, { description: input.description, on: input.on }, now);
  putInWaiting(entry, userId, now);
  return done(entry);
}

export interface EditEntryInput {
  money?: MoneyChange;
  baseVersion?: number;
  description?: { value: string; at: number };
  on?: { value: string; at: number };
}

export function editEntry(existing: MoneyEntry, edit: EditEntryInput, userId: string, now: number): Applied {
  if (existing.deletedAt !== undefined) return refuse('gone', 410);
  const entry = structuredClone(existing);

  if (existing.status === 'agreed') {
    // The money of an agreed entry changes only through a change request. The description and date never need one.
    if (edit.money) return refuse('needs_agreement', 409);
    if (!setTimed(entry, edit, now)) return done(existing, false);
    entry.updatedAt = forward(existing, now);
    entry.updatedBy = userId;
    return done(entry);
  }

  if (existing.proposedBy !== userId) return refuse('forbidden', 403);
  if (edit.money) {
    if (edit.baseVersion !== existing.version) return changedSince(existing);
    const problem = unitProblem(existing.kind, edit.money);
    if (problem) return refuse('invalid', 400, { field: problem });
    setMoney(entry, edit.money);
  }
  const timed = setTimed(entry, edit, now);
  if (!edit.money && !timed) return done(existing, false);
  // Every edit of a waiting or declined entry raises the version, so a person only agrees to what they saw.
  entry.version = existing.version + 1;
  putInWaiting(entry, userId, now);
  entry.updatedAt = forward(existing, now);
  entry.updatedBy = userId;
  return done(entry);
}

export function respondToEntry(existing: MoneyEntry, response: 'agree' | 'decline', version: number, userId: string, now: number, because?: string): Applied {
  if (existing.deletedAt !== undefined) return refuse('gone', 410);
  if (existing.status !== 'waiting' || existing.version !== version) return changedSince(existing);
  if (existing.proposedBy === userId) return refuse('forbidden', 403);
  const entry = structuredClone(existing);
  entry.version = existing.version + 1;
  if (response === 'agree') {
    entry.status = 'agreed';
    entry.agreedAt = now;
    entry.agreedBy = userId;
  } else {
    entry.status = 'declined';
    if (because !== undefined) entry.declinedBecause = because;
  }
  entry.updatedAt = forward(existing, now);
  entry.updatedBy = userId;
  return done(entry);
}

// Only the proposer, and only while the entry is waiting or declined. An agreed entry is deleted through a change request.
export function deleteEntry(existing: MoneyEntry, userId: string, now: number): Applied {
  if (existing.deletedAt !== undefined) return refuse('gone', 410);
  if (existing.status === 'agreed') return refuse('needs_agreement', 409);
  if (existing.proposedBy !== userId) return refuse('forbidden', 403);
  const entry = structuredClone(existing);
  entry.deletedAt = now;
  entry.deletedBy = userId;
  entry.updatedAt = forward(existing, now);
  entry.updatedBy = userId;
  return done(entry);
}

// Back to waiting for the other person, with a new version, as if it were new. `deletedAt` is the caller's to check.
export function restoreEntry(existing: MoneyEntry, userId: string, now: number): MoneyEntry {
  const entry = structuredClone(existing);
  delete entry.deletedAt;
  delete entry.deletedBy;
  delete entry.pendingChange;
  entry.version = existing.version + 1;
  putInWaiting(entry, userId, now);
  entry.updatedAt = forward(existing, now);
  entry.updatedBy = userId;
  return entry;
}

export interface AskChangeInput {
  id: string;
  version: number;
  money?: MoneyChange;
  delete?: true;
}

export function askChange(existing: MoneyEntry, input: AskChangeInput, userId: string, now: number): Applied {
  if (existing.deletedAt !== undefined) return refuse('gone', 410);
  if (existing.status !== 'agreed' || existing.pendingChange !== undefined || existing.version !== input.version) return changedSince(existing);
  if (input.money) {
    const problem = unitProblem(existing.kind, input.money);
    if (problem) return refuse('invalid', 400, { field: `money.${problem}` });
  }
  const request: PendingChange = { id: input.id, by: userId, at: now };
  if (input.money) request.money = { ...input.money };
  else request.delete = true;
  const entry = structuredClone(existing);
  entry.pendingChange = request;
  entry.updatedAt = forward(existing, now);
  entry.updatedBy = userId;
  return done(entry);
}

export function respondToChange(existing: MoneyEntry, response: 'agree' | 'decline', requestId: string, userId: string, now: number): Applied {
  if (existing.deletedAt !== undefined) return refuse('gone', 410);
  const request = existing.pendingChange;
  if (!request || request.id !== requestId) return changedSince(existing);
  if (request.by === userId) return refuse('forbidden', 403);
  const entry = structuredClone(existing);
  delete entry.pendingChange;
  if (response === 'agree') {
    entry.version = existing.version + 1;
    if (request.money) setMoney(entry, request.money);
    else {
      entry.deletedAt = now;
      entry.deletedBy = userId;
    }
  }
  entry.updatedAt = forward(existing, now);
  entry.updatedBy = userId;
  return done(entry);
}

export function withdrawChange(existing: MoneyEntry, requestId: string, userId: string, now: number): Applied {
  if (existing.deletedAt !== undefined) return refuse('gone', 410);
  const request = existing.pendingChange;
  if (!request || request.id !== requestId) return changedSince(existing);
  if (request.by !== userId) return refuse('forbidden', 403);
  const entry = structuredClone(existing);
  delete entry.pendingChange;
  entry.updatedAt = forward(existing, now);
  entry.updatedBy = userId;
  return done(entry);
}
