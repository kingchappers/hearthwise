import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { completeCycle } from '../completions';
import { proposalKey, taskKey } from '../keys';
import { acceptProposal, createProposal, declineProposal, listProposals, withdrawProposal } from '../proposals';
import { createTask, patchTask } from '../tasks';
import type { Change, CreateTaskInput, ProposalInput, Task } from '../types';

const NOW = Date.parse('2026-11-13T10:00:00.000Z'); // a Friday
const DAY = 86_400_000;
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

let store: MemoryStore;
let ctx1: HouseholdContext;
let ctx2: HouseholdContext;
let householdId: string;

beforeEach(async () => {
  n = 0;
  store = new MemoryStore();
  ({ householdId } = await createHousehold(store, { userId: U1, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW }, vi.fn()));
  await store.put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey(U2), householdId });
  ctx1 = (await loadContext(store, U1))!;
  ctx2 = (await loadContext(store, U2))!;
});

// A chore that is the other member's (U2), as ctx1 sees it.
const theirChore = async (over: Partial<CreateTaskInput> = {}): Promise<Task> => {
  const made = (await createTask(store, ctx1, { id: uuid(), title: 'Hoover', assignee: 'either', repeat: { type: 'after', days: 1 }, dueOn: '2026-11-14', mutationId: uuid(), ...over }, NOW)).result.task;
  await store.patch(taskKey(householdId, made.id), { assignee: U2 });
  return { ...made, assignee: U2 };
};
const propose = (t: Task, change: Change, over: Partial<ProposalInput> = {}, who = ctx1, now = NOW) =>
  createProposal(store, who, { id: uuid(), taskId: t.id, change, baseRuleVersion: t.ruleVersion, baseCycleSeq: t.cycleSeq, mutationId: uuid(), ...over }, now);
const accept = (id: string, who = ctx2, mutationId = uuid(), now = NOW) => acceptProposal(store, who, id, { mutationId }, now);
const rawTask = async (id: string) => (await store.get(taskKey(householdId, id)))!;
const rawProposal = async (id: string) => (await store.get(proposalKey(householdId, id)))!;

describe('createProposal', () => {
  it('records a pending proposal from the caller to the other member, with the versions it saw', async () => {
    const t = await theirChore();
    const { result } = await propose(t, { kind: 'swap' });
    expect(result.proposal).toMatchObject({ taskId: t.id, fromUserId: U1, toUserId: U2, status: 'pending', baseRuleVersion: 1, baseCycleSeq: 1, change: { kind: 'swap' } });
  });

  it('answers a repeated create of the same proposal id with the proposal already there', async () => {
    const t = await theirChore();
    const id = uuid();
    const first = await propose(t, { kind: 'swap' }, { id });
    const again = await propose(t, { kind: 'swap' }, { id });
    expect(again.result.proposal).toEqual(first.result.proposal);
  });

  it('refuses a swap on a task that is not the other member\'s', async () => {
    const mine = (await createTask(store, ctx1, { id: uuid(), title: 'Mine', assignee: U1, repeat: { type: 'none' }, mutationId: uuid() }, NOW)).result.task;
    await expect(propose(mine, { kind: 'swap' })).rejects.toMatchObject({ code: 'invalid', status: 400 });
  });

  it('refuses a proposal built on an old rule version', async () => {
    const t = await theirChore();
    await expect(propose(t, { kind: 'delete' }, { baseRuleVersion: 7 })).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('refuses a proposal on a deleted task, except to restore it', async () => {
    const t = await theirChore();
    await store.patch(taskKey(householdId, t.id), { deletedAt: NOW, deletedBy: U2 });
    await expect(propose(t, { kind: 'delete' })).rejects.toMatchObject({ code: 'gone', status: 410 });
    await expect(propose(t, { kind: 'restore' })).resolves.toBeDefined();
  });

  it('refuses a restore proposal for a task that is not deleted', async () => {
    const t = await theirChore();
    await expect(propose(t, { kind: 'restore' })).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('refuses a proposal when the household has no one else', async () => {
    const solo = { ...ctx1, members: [ctx1.member], household: { ...ctx1.household, memberCount: 1 } };
    const t = await theirChore();
    await expect(propose(t, { kind: 'delete' }, {}, solo)).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('CUJ 6: a swap', () => {
  it('applies only on accept, gives this cycle to the proposer, and reverts on the next cycle', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'swap' });
    expect((await rawTask(t.id)).overrideAssignee).toBeUndefined();

    const { result } = await accept(made.proposal.id);
    expect(result.proposal.status).toBe('accepted');
    expect(result.task).toMatchObject({ overrideAssignee: U1, overrideCycle: 1, assignee: U2 });

    const done = await completeCycle(store, ctx1, t.id, { cycleSeq: 1, completedAt: NOW, mutationId: uuid() }, NOW);
    expect(done.result.task.overrideAssignee).toBeUndefined();
    expect(done.result.task.assignee).toBe(U2);
  });

  it('goes stale after the cycle is completed, and applies nothing', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'swap' });
    await completeCycle(store, ctx2, t.id, { cycleSeq: 1, completedAt: NOW, mutationId: uuid() }, NOW);
    const { result } = await accept(made.proposal.id);
    expect(result.proposal.status).toBe('stale');
    expect((await rawTask(t.id)).overrideAssignee).toBeUndefined();
  });
});

describe('acceptProposal', () => {
  it('applies an assignee change and bumps the rule version', async () => {
    const t = (await createTask(store, ctx1, { id: uuid(), title: 'Bins', assignee: 'either', repeat: { type: 'none' }, mutationId: uuid() }, NOW)).result.task;
    const { result: made } = await propose(t, { kind: 'edit', set: { assignee: U2 } });
    const { result } = await accept(made.proposal.id);
    expect(result.task).toMatchObject({ assignee: U2, ruleVersion: 2 });
  });

  it('marks the proposal stale, applying nothing, when the rule version moved', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'edit', set: { assignee: 'either' } });
    // The owner changes the rule themselves (a direct edit): the version moves, so the old proposal no longer means what it did.
    await patchTask(store, ctx2, t.id, { assignee: { value: 'either', baseRuleVersion: 1 }, mutationId: uuid() }, NOW);
    const { result } = await accept(made.proposal.id);
    expect(result.proposal.status).toBe('stale');
    expect(await rawTask(t.id)).toMatchObject({ assignee: 'either', ruleVersion: 2 });
  });

  it('applies a repeat-rule proposal after the chore was completed in the meantime', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'edit', set: { repeat: { type: 'after', days: 3 }, dueOn: '2026-11-14' } });
    await completeCycle(store, ctx2, t.id, { cycleSeq: 1, completedAt: NOW, mutationId: uuid() }, NOW);
    const { result } = await accept(made.proposal.id);
    expect(result.proposal.status).toBe('accepted');
    expect(result.task).toMatchObject({ repeat: { type: 'after', days: 3 }, ruleVersion: 2 });
    expect(result.task!.dueOn! >= '2026-11-13').toBe(true);
  });

  it('applies a delete proposal after a completion, and a restore proposal brings the task back', async () => {
    const t = await theirChore();
    const { result: del } = await propose(t, { kind: 'delete' });
    await completeCycle(store, ctx2, t.id, { cycleSeq: 1, completedAt: NOW, mutationId: uuid() }, NOW);
    const deleted = await accept(del.proposal.id);
    expect(deleted.result.task).toMatchObject({ deletedBy: U2, ruleVersion: 2 });

    const tombstone = await rawTask(t.id);
    const { result: restore } = await propose({ ...t, ruleVersion: Number(tombstone.ruleVersion) }, { kind: 'restore' });
    const restored = await accept(restore.proposal.id);
    expect(restored.result.task!.deletedAt).toBeUndefined();
    expect(restored.result.task!.ruleVersion).toBe(3);
  });

  it('answers a retried accept from its record, and never marks an applied proposal stale', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'edit', set: { assignee: 'either' } });
    const mutationId = uuid();
    const first = await accept(made.proposal.id, ctx2, mutationId);
    const retry = await accept(made.proposal.id, ctx2, mutationId);
    expect(retry.fresh).toBe(false);
    expect(retry.result.proposal.status).toBe('accepted');
    expect(retry.result).toEqual(first.result);
  });

  it('lets only the recipient accept or decline', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'swap' });
    await expect(accept(made.proposal.id, ctx1)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    await expect(declineProposal(store, ctx1, made.proposal.id, { mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('refuses an accept of a proposal that is no longer pending, with the proposal as it now is', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'swap' });
    await withdrawProposal(store, ctx1, made.proposal.id, { mutationId: uuid() }, NOW);
    await expect(accept(made.proposal.id)).rejects.toMatchObject({ code: 'conflict', status: 409, extra: { proposal: { status: 'withdrawn' } } });
  });

  it('answers not found for a proposal that does not exist', async () => {
    await expect(accept(uuid())).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('marks a proposal from someone who left the household stale', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'delete' });
    const alone = { ...ctx2, members: [ctx2.member], household: { ...ctx2.household, memberCount: 1 } };
    const { result } = await acceptProposal(store, alone, made.proposal.id, { mutationId: uuid() }, NOW);
    expect(result.proposal.status).toBe('stale');
    expect((await rawTask(t.id)).deletedAt).toBeUndefined();
  });
});

describe('decline and withdraw', () => {
  it('declines, and stamps an expiry 30 days after it is resolved', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'swap' });
    const { result } = await declineProposal(store, ctx2, made.proposal.id, { mutationId: uuid() }, NOW);
    expect(result.proposal).toMatchObject({ status: 'declined', resolvedAt: NOW });
    expect((await rawProposal(made.proposal.id)).expiresAt).toBe(Math.floor(NOW / 1000) + 30 * 86_400);
  });

  it('lets only the proposer withdraw', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'swap' });
    await expect(withdrawProposal(store, ctx2, made.proposal.id, { mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    const { result } = await withdrawProposal(store, ctx1, made.proposal.id, { mutationId: uuid() }, NOW);
    expect(result.proposal.status).toBe('withdrawn');
  });

  it('leaves one winner when an accept and a withdraw race', async () => {
    const t = await theirChore();
    const { result: made } = await propose(t, { kind: 'swap' });
    const outcomes = await Promise.allSettled([accept(made.proposal.id), withdrawProposal(store, ctx1, made.proposal.id, { mutationId: uuid() }, NOW)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const loser = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ code: 'conflict', status: 409 });
    const status = (await rawProposal(made.proposal.id)).status;
    const task = await rawTask(t.id);
    if (status === 'withdrawn') expect(task.overrideAssignee).toBeUndefined();
    else expect(task.overrideAssignee).toBe(U1);
  });
});

describe('listProposals', () => {
  const put = (id: string, fields: Record<string, unknown>) =>
    store.put({ ...proposalKey(householdId, id), taskId: uuid(), fromUserId: U1, toUserId: U2, change: { kind: 'swap' }, baseRuleVersion: 1, baseCycleSeq: 1, createdAt: NOW - 10 * DAY, ...fields });

  it('lists pending proposals for the recipient and the proposer, and not for anyone else', async () => {
    await put('p1', { status: 'pending' });
    expect((await listProposals(store, ctx2, NOW)).map(p => p.id)).toEqual(['p1']);
    expect((await listProposals(store, ctx1, NOW)).map(p => p.id)).toEqual(['p1']);
  });

  it('lists the proposer\'s own resolved ones from 6 days ago, but not from 8, and not the recipient\'s', async () => {
    await put('recent', { status: 'declined', resolvedAt: NOW - 6 * DAY });
    await put('old', { status: 'declined', resolvedAt: NOW - 8 * DAY });
    expect((await listProposals(store, ctx1, NOW)).map(p => p.id)).toEqual(['recent']);
    expect(await listProposals(store, ctx2, NOW)).toEqual([]);
  });

  it('reads a pending proposal involving someone who left as stale', async () => {
    await put('gone', { status: 'pending', toUserId: 'auth0|gone' });
    const alone = { ...ctx1, members: [ctx1.member], household: { ...ctx1.household, memberCount: 1 } };
    expect((await listProposals(store, alone, NOW))[0]).toMatchObject({ id: 'gone', status: 'stale' });
  });
});
