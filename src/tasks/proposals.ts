import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { dayInZone } from '../shared/schedule';
import { ConditionFailedError } from '../store';
import type { Item, Store, TxOp } from '../store';
import { proposalKey, PROPOSAL_PREFIX, taskKey } from './keys';
import { normalizedAssignee, otherMemberId } from './ownership';
import { applyChange, DAY_MS, restoreChange, THIRTY_DAYS_SECONDS, toTask, tombstoneChange } from './record';
import { loadItem, planPatch } from './tasks';
import { TaskError } from './types';
import type { PatchTaskInput, Proposal, ProposalInput, Task } from './types';

const MAX_ATTEMPTS = 3;
const SEVEN_DAYS_MS = 7 * DAY_MS;

const conflict = (extra: Record<string, unknown> = {}): TaskError => new TaskError('conflict', 409, extra);
const isMember = (ctx: HouseholdContext, userId: string): boolean => ctx.members.some(member => member.userId === userId);

export function toProposal(item: Item): Proposal {
  const proposal: Proposal = {
    id: item.SK.slice(PROPOSAL_PREFIX.length),
    taskId: String(item.taskId),
    fromUserId: String(item.fromUserId),
    toUserId: String(item.toUserId),
    change: structuredClone(item.change as Proposal['change']),
    baseRuleVersion: Number(item.baseRuleVersion),
    status: item.status as Proposal['status'],
    createdAt: Number(item.createdAt),
  };
  if (typeof item.baseCycleSeq === 'number') proposal.baseCycleSeq = item.baseCycleSeq;
  if (typeof item.resolvedAt === 'number') proposal.resolvedAt = item.resolvedAt;
  if (typeof item.expiresAt === 'number') proposal.expiresAt = item.expiresAt;
  return proposal;
}

// Whether a proposal's change is about one cycle (a swap, or a date change on its own) rather than the task's rules.
const aboutOneCycle = (change: Proposal['change']): boolean =>
  change.kind === 'swap' || (change.kind === 'edit' && change.set.dueOn !== undefined && change.set.repeat === undefined);

export async function createProposal(store: Store, ctx: HouseholdContext, input: ProposalInput, nowMs: number = Date.now()): Promise<WriteOutcome<{ proposal: Proposal }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ proposal: Proposal }>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const existing = await store.get(proposalKey(householdId, input.id), { consistent: true });
  if (existing) return { fresh: false, result: { proposal: toProposal(existing) } };

  const toUserId = otherMemberId(ctx);
  if (toUserId === undefined) throw new TaskError('invalid', 400, { field: 'taskId' });

  const item = await loadItem(store, householdId, input.taskId);
  const task = toTask(item);
  if (input.change.kind === 'restore') {
    if (task.deletedAt === undefined) throw conflict();
  } else if (task.deletedAt !== undefined) {
    throw new TaskError('gone', 410);
  }
  if (input.change.kind === 'swap' && normalizedAssignee(task.assignee, ctx) !== toUserId) throw new TaskError('invalid', 400, { field: 'change' });
  if (task.ruleVersion !== input.baseRuleVersion) throw conflict();
  const cycle = aboutOneCycle(input.change);
  if (cycle && task.cycleSeq !== input.baseCycleSeq) throw conflict();

  const stored: Item = {
    ...proposalKey(householdId, input.id),
    taskId: input.taskId,
    fromUserId: ctx.userId,
    toUserId,
    change: input.change,
    baseRuleVersion: input.baseRuleVersion,
    status: 'pending',
    createdAt: nowMs,
  };
  if (cycle) stored.baseCycleSeq = input.baseCycleSeq;

  try {
    return await withWriteRecord(store, householdId, input.mutationId, [{ put: stored, ifAbsent: true }], { proposal: toProposal(stored) }, Math.floor(nowMs / 1000));
  } catch (error) {
    if (!(error instanceof ConditionFailedError) || error.failedIndex !== 0) throw error;
    return { fresh: false, result: { proposal: toProposal(await store.get(proposalKey(householdId, input.id), { consistent: true }) ?? stored) } };
  }
}

type Resolution = 'accepted' | 'declined' | 'withdrawn' | 'stale';

// Marks a pending proposal resolved, only if it is still pending. The first write of any transaction that resolves one, so a
// failure at index 0 always means someone else resolved it first.
function resolveOp(householdId: string, id: string, status: Resolution, nowMs: number): TxOp {
  return {
    update: proposalKey(householdId, id),
    set: { status, resolvedAt: nowMs, expiresAt: Math.floor(nowMs / 1000) + THIRTY_DAYS_SECONDS },
    ifEquals: { status: 'pending' },
  };
}

const resolvedCopy = (proposal: Proposal, status: Resolution, nowMs: number): Proposal =>
  ({ ...proposal, status, resolvedAt: nowMs, expiresAt: Math.floor(nowMs / 1000) + THIRTY_DAYS_SECONDS });

async function loadProposal(store: Store, householdId: string, id: string): Promise<Proposal> {
  const item = await store.get(proposalKey(householdId, id), { consistent: true });
  if (!item) throw new TaskError('not_found', 404);
  return toProposal(item);
}

// Decline and withdraw: one resolution by the right person, only while pending.
async function settle(
  store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number, status: 'declined' | 'withdrawn',
): Promise<WriteOutcome<{ proposal: Proposal }>> {
  const replayed = await replayOf<{ proposal: Proposal }>(store, ctx.householdId, input.mutationId);
  if (replayed) return replayed;
  const proposal = await loadProposal(store, ctx.householdId, id);
  const allowed = status === 'declined' ? proposal.toUserId : proposal.fromUserId;
  if (allowed !== ctx.userId) throw new TaskError('forbidden', 403);
  if (proposal.status !== 'pending') throw conflict({ proposal });
  try {
    return await withWriteRecord(store, ctx.householdId, input.mutationId, [resolveOp(ctx.householdId, id, status, nowMs)], { proposal: resolvedCopy(proposal, status, nowMs) }, Math.floor(nowMs / 1000));
  } catch (error) {
    if (!(error instanceof ConditionFailedError)) throw error;
    // Someone resolved it between the read and the write.
    throw conflict({ proposal: await loadProposal(store, ctx.householdId, id) });
  }
}

export const declineProposal = (store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now()) =>
  settle(store, ctx, id, input, nowMs, 'declined');

export const withdrawProposal = (store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now()) =>
  settle(store, ctx, id, input, nowMs, 'withdrawn');

// Whether the change still means what it did when it was asked for.
function isStale(proposal: Proposal, item: Item | undefined, ctx: HouseholdContext): boolean {
  if (!isMember(ctx, proposal.fromUserId) || !isMember(ctx, proposal.toUserId)) return true;
  if (proposal.change.kind === 'edit' && proposal.change.set.assignee !== undefined
    && proposal.change.set.assignee !== 'either' && proposal.change.set.assignee !== 'both' && !isMember(ctx, proposal.change.set.assignee)) return true;
  if (!item) return true;
  const deleted = item.deletedAt !== undefined;
  if (proposal.change.kind === 'restore' ? !deleted : deleted) return true;
  // A completion never makes a rule change, a delete or a restore stale; the version and (for one cycle) the cycle number decide.
  if (Number(item.ruleVersion) !== proposal.baseRuleVersion) return true;
  return proposal.baseCycleSeq !== undefined && Number(item.cycleSeq) !== proposal.baseCycleSeq;
}

// The update that carries a proposal's change out, built from the task as it was just read.
function applyOp(proposal: Proposal, item: Item, ctx: HouseholdContext, nowMs: number): { op: TxOp; next: Item } | undefined {
  const key = taskKey(ctx.householdId, proposal.taskId);
  const task = toTask(item);
  const guard: Record<string, unknown> = { ruleVersion: proposal.baseRuleVersion };
  if (proposal.baseCycleSeq !== undefined) guard.cycleSeq = proposal.baseCycleSeq;

  let set: Record<string, unknown>;
  let remove: string[] = [];
  let live = true;
  const { change } = proposal;
  if (change.kind === 'edit') {
    const patch: PatchTaskInput = { mutationId: proposal.id };
    if (change.set.assignee !== undefined) patch.assignee = { value: change.set.assignee, baseRuleVersion: proposal.baseRuleVersion };
    if (change.set.repeat !== undefined) patch.repeat = { value: change.set.repeat, dueOn: change.set.dueOn, baseRuleVersion: proposal.baseRuleVersion };
    else if (change.set.dueOn !== undefined) patch.dueOn = { value: change.set.dueOn, baseRuleVersion: proposal.baseRuleVersion, baseCycleSeq: proposal.baseCycleSeq ?? task.cycleSeq };
    const planned = planPatch(task, patch, nowMs, dayInZone(nowMs, ctx.household.timezone));
    if (!planned) return undefined;
    set = { ...planned.set, updatedAt: Math.max(nowMs, task.updatedAt + 1) };
    remove = planned.remove;
  } else if (change.kind === 'swap') {
    set = { overrideAssignee: proposal.fromUserId, overrideCycle: task.cycleSeq, updatedAt: Math.max(nowMs, task.updatedAt + 1) };
  } else if (change.kind === 'delete') {
    ({ set, remove } = tombstoneChange(item, ctx.userId, nowMs));
  } else {
    ({ set, remove } = restoreChange(item, nowMs));
    live = false;
  }
  const op: TxOp = { update: key, set, remove, ifEquals: guard, ...(live ? { ifMissing: ['deletedAt'] } : {}) };
  return { op, next: applyChange(item, set, remove) };
}

export async function acceptProposal(
  store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ proposal: Proposal; task?: Task }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ proposal: Proposal; task?: Task }>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  const nowSeconds = Math.floor(nowMs / 1000);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const proposal = await loadProposal(store, householdId, id);
    if (proposal.toUserId !== ctx.userId) throw new TaskError('forbidden', 403);
    if (proposal.status !== 'pending') throw conflict({ proposal });

    const item = await store.get(taskKey(householdId, proposal.taskId), { consistent: true });
    const applying = item && !isStale(proposal, item, ctx) ? applyOp(proposal, item, ctx, nowMs) : undefined;
    const stale = !item || isStale(proposal, item, ctx);

    let ops: TxOp[];
    let result: { proposal: Proposal; task?: Task };
    if (stale) {
      ops = [resolveOp(householdId, id, 'stale', nowMs)];
      result = { proposal: resolvedCopy(proposal, 'stale', nowMs) };
    } else if (applying && item) {
      ops = [resolveOp(householdId, id, 'accepted', nowMs), applying.op];
      result = { proposal: resolvedCopy(proposal, 'accepted', nowMs), task: toTask(applying.next) };
    } else {
      // Nothing to change (the task already is as asked): accepted, with no write to the task.
      ops = [resolveOp(householdId, id, 'accepted', nowMs)];
      result = { proposal: resolvedCopy(proposal, 'accepted', nowMs), task: item ? toTask(item) : undefined };
    }

    try {
      return await withWriteRecord(store, householdId, input.mutationId, ops, result, nowSeconds);
    } catch (error) {
      if (error instanceof ConditionFailedError) continue;
      throw error;
    }
  }
  throw conflict({ proposal: await loadProposal(store, householdId, id) });
}

// Pending proposals involving the caller, and the caller's own that were resolved in the last 7 days.
export async function listProposals(store: Store, ctx: HouseholdContext, nowMs: number = Date.now()): Promise<Proposal[]> {
  const items = await store.query(hhPk(ctx.householdId), { skPrefix: PROPOSAL_PREFIX });
  const mine = (proposal: Proposal): boolean => proposal.fromUserId === ctx.userId || proposal.toUserId === ctx.userId;
  return items
    .map(toProposal)
    .filter(proposal => {
      if (proposal.status === 'pending') return mine(proposal);
      return proposal.fromUserId === ctx.userId && proposal.resolvedAt !== undefined && proposal.resolvedAt >= nowMs - SEVEN_DAYS_MS;
    })
    .map(proposal => (proposal.status === 'pending' && (!isMember(ctx, proposal.fromUserId) || !isMember(ctx, proposal.toUserId)) ? { ...proposal, status: 'stale' as const } : proposal))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
