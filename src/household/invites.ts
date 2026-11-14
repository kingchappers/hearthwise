import { createHash, randomBytes } from 'node:crypto';
import { emitSecurityEvent } from '../security/events';
import { DEFAULT_SETTINGS } from '../shared/household';
import { ConditionFailedError } from '../store';
import type { Store, TxOp } from '../store';
import {
  INVITE_POINTER_PREFIX, MEMBER_PREFIX, hhPk, inviteKey, invitePointerSk, membershipKey, memberSk, metaKey,
} from './keys';
import { HouseholdError } from './types';
import type { HouseholdContext } from './types';

const INVITE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
// Moving someone out of an empty household deletes its invites in the same transaction, so their number is bounded.
const MAX_OPEN_INVITES = 10;
// An invite that has been answered "that email already has an account" this many times is revoked, so a link cannot be used to
// look up which emails have accounts.
export const MAX_TAKEN_EMAIL_ANSWERS = 5;

export const inviteHash = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface OpenInvite {
  hash: string;
  createdBy: string;
  expiresAt: number;
}

const expired = (): HouseholdError => new HouseholdError('invite_expired', 410);

export async function listInvites(store: Store, householdId: string, nowSeconds: number): Promise<OpenInvite[]> {
  const pointers = await store.query(hhPk(householdId), { skPrefix: INVITE_POINTER_PREFIX });
  // The TTL purge is not instant, so a pointer past its expiry can still be read: leave it out here.
  return pointers
    .filter(pointer => Number(pointer.expiresAt) > nowSeconds)
    .map(pointer => ({ hash: pointer.SK.slice(INVITE_POINTER_PREFIX.length), createdBy: String(pointer.createdBy), expiresAt: Number(pointer.expiresAt) }));
}

// The token is the only secret: 32 random bytes, handed out once, never stored. What is stored is its SHA-256, which cannot be
// turned back into the link.
export async function createInvite(store: Store, ctx: HouseholdContext, nowMs: number = Date.now()): Promise<{ token: string; hash: string; expiresAt: number }> {
  if (ctx.household.memberCount >= 2) throw new HouseholdError('household_full', 409);
  const nowSeconds = Math.floor(nowMs / 1000);
  if ((await listInvites(store, ctx.householdId, nowSeconds)).length >= MAX_OPEN_INVITES) throw new HouseholdError('too_many_invites', 409);

  const token = randomBytes(32).toString('base64url');
  const hash = inviteHash(token);
  const expiresAt = nowSeconds + INVITE_LIFETIME_SECONDS;
  await store.transact([
    { put: { ...inviteKey(hash), householdId: ctx.householdId, createdBy: ctx.userId, expiresAt }, ifAbsent: true },
    { put: { PK: hhPk(ctx.householdId), SK: invitePointerSk(hash), createdBy: ctx.userId, expiresAt }, ifAbsent: true },
  ]);
  return { token, hash, expiresAt };
}

export async function revokeInvite(store: Store, ctx: HouseholdContext, hash: string): Promise<void> {
  // The pointer lives in the caller's own household, so another household's invite is simply not found.
  const pointer = { PK: hhPk(ctx.householdId), SK: invitePointerSk(hash) };
  if (!(await store.get(pointer, { consistent: true }))) throw new HouseholdError('not_found', 404);
  try {
    await store.transact([{ delete: pointer, ifPresent: true }, { delete: inviteKey(hash) }]);
  } catch (error) {
    // Used or revoked in the meantime.
    if (error instanceof ConditionFailedError) throw new HouseholdError('not_found', 404);
    throw error;
  }
}

export interface MoveFrom {
  householdId: string;
  inviteHashes: string[];
}

// The writes that make someone a member. The order is fixed, because a failed condition reports its position:
//   0 the invite is unused (and still exists)   1 the household has room   2.. the rest
// so failure 0 means the link is spent or gone, and failure 1 means the household is full.
export function joinOps(invite: { hash: string; householdId: string }, userId: string, displayName: string, nowMs: number, opts: { moveFrom?: MoveFrom } = {}): TxOp[] {
  const { hash, householdId } = invite;
  const { moveFrom } = opts;
  const ops: TxOp[] = [
    { update: inviteKey(hash), set: { usedBy: userId }, ifMissing: ['usedBy'] },
    { update: metaKey(householdId), set: { memberCount: 2 }, ifEquals: { memberCount: 1 } },
    { delete: { PK: hhPk(householdId), SK: invitePointerSk(hash) } },
    moveFrom
      ? { update: membershipKey(userId), set: { householdId }, ifEquals: { householdId: moveFrom.householdId } }
      : { put: { ...membershipKey(userId), householdId }, ifAbsent: true },
    {
      put: { PK: hhPk(householdId), SK: memberSk(userId), displayName, settings: structuredClone(DEFAULT_SETTINGS), joinedAt: new Date(nowMs).toISOString() },
      ifAbsent: true,
    },
  ];
  if (moveFrom) {
    // Not a plain delete: a delete cannot carry a condition, and someone may have joined the old household since it was checked
    // as empty. Setting memberCount to 0 only if it is still 1 makes the whole move fail instead of stranding them; the empty
    // record is deleted right after (see removeEmptiedHousehold).
    ops.push(
      { update: metaKey(moveFrom.householdId), set: { memberCount: 0 }, ifEquals: { memberCount: 1 } },
      { delete: { PK: hhPk(moveFrom.householdId), SK: memberSk(userId) } },
    );
    for (const old of moveFrom.inviteHashes) {
      ops.push({ delete: { PK: hhPk(moveFrom.householdId), SK: invitePointerSk(old) } }, { delete: inviteKey(old) });
    }
  }
  return ops;
}

// The old household's META is left with memberCount 0 by a move. Nothing can join it (no room) and nobody's membership names it,
// so it is harmless if this fails; it is only tidied away.
async function removeEmptiedHousehold(store: Store, householdId: string): Promise<void> {
  try {
    await store.delete(metaKey(householdId));
  } catch (error) {
    console.warn('Could not remove the emptied household record:', error);
  }
}

// Turns a failed join transaction into the answer. `offset` is how many writes the caller put before joinOps.
export function joinFailure(failedIndex: number | undefined, offset = 0): HouseholdError {
  const position = failedIndex === undefined ? 0 : failedIndex - offset;
  if (position === 0) return expired();
  if (position === 1) return new HouseholdError('household_full', 409);
  return new HouseholdError('already_member', 409, { canMove: false });
}

// An empty household is one the person is alone in, with no tasks and no shopping items. Anything else would be lost.
async function moveOptions(store: Store, oldId: string, userId: string): Promise<MoveFrom | undefined> {
  const meta = await store.get(metaKey(oldId), { consistent: true });
  if (!meta || Number(meta.memberCount) !== 1) return undefined;
  const [members, tasks, items, pointers] = await Promise.all([
    store.query(hhPk(oldId), { skPrefix: MEMBER_PREFIX, attributes: ['SK'] }),
    store.query(hhPk(oldId), { skPrefix: 'TASK#', attributes: ['SK'] }),
    store.query(hhPk(oldId), { skPrefix: 'ITEM#', attributes: ['SK'] }),
    store.query(hhPk(oldId), { skPrefix: INVITE_POINTER_PREFIX, attributes: ['SK'] }),
  ]);
  if (members.length !== 1 || members[0].SK !== memberSk(userId) || tasks.length > 0 || items.length > 0) return undefined;
  return { householdId: oldId, inviteHashes: pointers.map(pointer => pointer.SK.slice(INVITE_POINTER_PREFIX.length)) };
}

export interface AcceptInput {
  token: string;
  userId: string;
  displayName: string;
  confirmMove?: boolean;
  nowMs?: number;
}

export async function acceptInvite(store: Store, input: AcceptInput, emit: typeof emitSecurityEvent = emitSecurityEvent): Promise<{ householdId: string }> {
  const nowMs = input.nowMs ?? Date.now();
  const hash = inviteHash(input.token);

  const invite = await store.get(inviteKey(hash), { consistent: true });
  if (!invite || !(Number(invite.expiresAt) > Math.floor(nowMs / 1000))) throw expired();
  const householdId = String(invite.householdId);
  const membership = await store.get(membershipKey(input.userId), { consistent: true });
  // The same person asking again (a retry, or a second tab) is told it worked, and nothing else happens. Only if they really are
  // in: someone who was removed after joining has no membership, and a replayed link must not tell them they are.
  if (invite.usedBy === input.userId && membership?.householdId === householdId) return { householdId };
  if (invite.usedBy !== undefined) throw expired();

  let moveFrom: MoveFrom | undefined;
  if (membership) {
    const oldId = String(membership.householdId);
    if (oldId === householdId) throw new HouseholdError('already_member', 409, { canMove: false });
    // Checked just before the transaction. A task made in this instant would be orphaned under a household nobody can read:
    // the window is one request long and the data is harmless (accepted in the design).
    moveFrom = await moveOptions(store, oldId, input.userId);
    if (!moveFrom || !input.confirmMove) throw new HouseholdError('already_member', 409, { canMove: moveFrom !== undefined });
  }

  try {
    await store.transact(joinOps({ hash, householdId }, input.userId, input.displayName, nowMs, { moveFrom }));
  } catch (error) {
    if (!(error instanceof ConditionFailedError)) throw error;
    // A simultaneous copy of this same request may have won; that is success, not a failure.
    const [after, now] = await Promise.all([store.get(inviteKey(hash), { consistent: true }), store.get(membershipKey(input.userId), { consistent: true })]);
    if (after?.usedBy === input.userId && now?.householdId === householdId) return { householdId };
    throw joinFailure(error.failedIndex);
  }
  if (moveFrom) await removeEmptiedHousehold(store, moveFrom.householdId);

  await emit({ event: 'invite_accepted', userId: input.userId, householdId, at: new Date(nowMs).toISOString() });
  return { householdId };
}

// Called when a sign-up through this invite was refused because the email already has an account. The invite stays usable for a
// typo or two; after MAX_TAKEN_EMAIL_ANSWERS it is deleted, together with its pointer, and any later use is an expired link.
export async function recordTakenEmailAnswer(store: Store, hash: string, householdId: string): Promise<void> {
  const invite = await store.get(inviteKey(hash), { consistent: true });
  if (!invite) return;
  const answers = (Number(invite.takenEmailAnswers) || 0) + 1;
  try {
    if (answers >= MAX_TAKEN_EMAIL_ANSWERS) {
      await store.transact([{ delete: inviteKey(hash) }, { delete: { PK: hhPk(householdId), SK: invitePointerSk(hash) } }]);
    } else {
      await store.patch(inviteKey(hash), { takenEmailAnswers: answers }, { mustExist: true });
    }
  } catch (error) {
    // Used or revoked in the meantime: nothing left to count.
    if (!(error instanceof ConditionFailedError)) throw error;
  }
}
