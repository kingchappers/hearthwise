import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { completeCycle } from '../completions';
import { taskHistory } from '../history';
import { taskKey } from '../keys';
import { acceptProposal, createProposal } from '../proposals';
import { restoreEntries } from '../restore';
import { createTask, deleteTask, patchTask } from '../tasks';
import type { CreateTaskInput, Task } from '../types';

const NOW = Date.parse('2026-11-13T10:00:00.000Z');
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

const create = async (assignee: string, over: Partial<CreateTaskInput> = {}): Promise<Task> => {
  const made = (await createTask(store, ctx1, { id: uuid(), title: 'Hoover', assignee: 'either', repeat: { type: 'after', days: 1 }, mutationId: uuid(), ...over }, NOW)).result.task;
  if (assignee !== 'either') await store.patch(taskKey(householdId, made.id), { assignee });
  return { ...made, assignee };
};
const remove = async (t: Task, who = ctx1) =>
  deleteTask(store, who, t.id, { baseRuleVersion: Number((await store.get(taskKey(householdId, t.id)))!.ruleVersion), mutationId: uuid() }, NOW);
const restore = (ids: string[], who = ctx1, mutationId = uuid(), now = NOW + 1000) =>
  restoreEntries(store, who, { entries: ids.map(id => ({ kind: 'task' as const, id })), mutationId }, now);
const raw = async (id: string) => (await store.get(taskKey(householdId, id)))!;

describe('restoreEntries', () => {
  it('restores the caller\'s own task and an either task, bumping the rule version', async () => {
    const mine = await create(U1);
    const either = await create('either');
    await remove(mine);
    await remove(either, ctx2);
    const { result } = await restore([mine.id, either.id]);
    expect(result.results).toEqual([{ id: mine.id, status: 'restored' }, { id: either.id, status: 'restored' }]);
    const after = await raw(mine.id);
    expect(after.deletedAt).toBeUndefined();
    expect(after.deletedBy).toBeUndefined();
    expect(after.expiresAt).toBeUndefined();
    expect(after.ruleVersion).toBe(3);
  });

  it('needs a proposal for the other member\'s task, and a restore proposal then brings it back', async () => {
    const theirs = await create(U2);
    await remove(theirs, ctx2);
    const { result } = await restore([theirs.id]);
    expect(result.results).toEqual([{ id: theirs.id, status: 'proposal_required', toUserId: U2 }]);
    expect((await raw(theirs.id)).deletedAt).toBeDefined();

    const tombstone = await raw(theirs.id);
    const { result: made } = await createProposal(store, ctx1, { id: uuid(), taskId: theirs.id, change: { kind: 'restore' }, baseRuleVersion: Number(tombstone.ruleVersion), mutationId: uuid() }, NOW);
    await acceptProposal(store, ctx2, made.proposal.id, { mutationId: uuid() }, NOW);
    expect((await raw(theirs.id)).deletedAt).toBeUndefined();
  });

  it('needs a proposal for a both task', async () => {
    const both = await create('both');
    await remove(both, ctx2).catch(() => undefined);
    await store.patch(taskKey(householdId, both.id), { deletedAt: NOW, deletedBy: U2 });
    const { result } = await restore([both.id]);
    expect(result.results[0]).toMatchObject({ status: 'proposal_required' });
  });

  it('does nothing when restoring twice, and answers a retried restore from its record', async () => {
    const mine = await create(U1);
    await remove(mine);
    const mutationId = uuid();
    const first = await restore([mine.id], ctx1, mutationId);
    const retry = await restore([mine.id], ctx1, mutationId, NOW + 9000);
    expect(retry.fresh).toBe(false);
    expect(retry.result).toEqual(first.result);
    const again = await restore([mine.id]);
    expect(again.result.results).toEqual([{ id: mine.id, status: 'noop' }]);
    expect((await raw(mine.id)).ruleVersion).toBe(3);
  });

  it('refuses an edit to a tombstone, but a restore succeeds', async () => {
    const mine = await create(U1);
    await remove(mine);
    await expect(patchTask(store, ctx1, mine.id, { title: { value: 'Zombie', at: NOW + 99 }, mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'gone', status: 410 });
    expect((await restore([mine.id])).result.results[0].status).toBe('restored');
  });

  it('restores only the listed ids', async () => {
    const a = await create(U1);
    const b = await create(U1);
    await remove(a);
    await remove(b);
    await restore([a.id]);
    expect((await raw(a.id)).deletedAt).toBeUndefined();
    expect((await raw(b.id)).deletedAt).toBeDefined();
  });

  it('says not found for an unknown task or item id', async () => {
    const { result } = await restoreEntries(store, ctx1, { entries: [{ kind: 'task', id: uuid() }, { kind: 'item', id: uuid() }], mutationId: uuid() }, NOW);
    expect(result.results.map(entry => entry.status)).toEqual(['not_found', 'not_found']);
  });

  it('gives a restored done to-do its 30-day expiry back, counted from when it was done', async () => {
    const todo = await create(U1, { repeat: { type: 'none' } });
    await completeCycle(store, ctx1, todo.id, { cycleSeq: 1, completedAt: NOW, mutationId: uuid() }, NOW);
    const done = await raw(todo.id);
    await deleteTask(store, ctx1, todo.id, { baseRuleVersion: Number(done.ruleVersion), mutationId: uuid() }, NOW);
    await restore([todo.id]);
    expect((await raw(todo.id)).expiresAt).toBe(Math.floor(NOW / 1000) + 30 * 86_400);
  });

  it('keeps a restored chore\'s old date', async () => {
    const chore = await create(U1, { dueOn: '2026-11-01' });
    await remove(chore);
    await restore([chore.id]);
    expect((await raw(chore.id)).dueOn).toBe('2026-11-01');
  });
});

describe('taskHistory', () => {
  it('lists completions with everyone who did each, earliest first, newest cycle first', async () => {
    const t = await create('either', { dueOn: '2026-11-12' });
    await completeCycle(store, ctx1, t.id, { cycleSeq: 1, completedAt: NOW, mutationId: uuid() }, NOW);
    await completeCycle(store, ctx2, t.id, { cycleSeq: 1, completedAt: NOW + 5000, mutationId: uuid() }, NOW + 5000);
    await completeCycle(store, ctx2, t.id, { cycleSeq: 2, completedAt: NOW + 9000, mutationId: uuid() }, NOW + 9000);
    const { completions } = await taskHistory(store, ctx1, t.id);
    expect(completions.map(c => c.cycleSeq)).toEqual([2, 1]);
    expect(completions[1].by).toEqual([{ userId: U1, at: NOW }, { userId: U2, at: NOW + 5000 }]);
    expect(completions[1]).toMatchObject({ cycleDueOn: '2026-11-12', together: false });
  });

  it('lists the other member\'s direct edits, newest first', async () => {
    const theirs = await create(U2);
    await patchTask(store, ctx1, theirs.id, { title: { value: 'One', at: NOW + 1 }, mutationId: uuid() }, NOW + 1);
    await patchTask(store, ctx1, theirs.id, { notes: { value: 'Two', at: NOW + 2 }, mutationId: uuid() }, NOW + 2);
    const { edits } = await taskHistory(store, ctx2, theirs.id);
    expect(edits).toEqual([{ byUserId: U1, fields: ['notes'], at: NOW + 2 }, { byUserId: U1, fields: ['title'], at: NOW + 1 }]);
  });

  it('is not found for a task of another household', async () => {
    await expect(taskHistory(store, ctx1, uuid())).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});
