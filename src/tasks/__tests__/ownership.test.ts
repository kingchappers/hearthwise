import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { completeCycle } from '../completions';
import { EDIT_PREFIX, taskKey } from '../keys';
import { assertDirect, effectiveAssignee, needsProposal } from '../ownership';
import { createTask, deleteTask, patchTask } from '../tasks';
import type { CreateTaskInput, PatchTaskInput, Task } from '../types';

const NOW = Date.parse('2026-11-13T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

let store: MemoryStore;
let ctx1: HouseholdContext;
let ctx2: HouseholdContext;
let householdId: string;
// A household with one member left, for the "removed member" rules.
let solo: HouseholdContext;

beforeEach(async () => {
  n = 0;
  store = new MemoryStore();
  ({ householdId } = await createHousehold(store, { userId: U1, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW }, vi.fn()));
  await store.put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey(U2), householdId });
  ctx1 = (await loadContext(store, U1))!;
  ctx2 = (await loadContext(store, U2))!;
  solo = { ...ctx1, members: [ctx1.member], household: { ...ctx1.household, memberCount: 1 } };
});

const task = (assignee: string, over: Partial<Task> = {}): Task => ({
  id: uuid(), title: 'T', fieldTimes: {}, assignee, repeat: { type: 'none' }, cycleSeq: 1, ruleVersion: 1, checklist: [],
  checklistState: {}, status: 'open', createdBy: U1, updatedAt: NOW, ...over,
});
const create = async (over: Partial<CreateTaskInput> = {}, who = ctx1) =>
  (await createTask(store, who, { id: uuid(), title: 'Hoover', assignee: 'either', repeat: { type: 'after', days: 1 }, mutationId: uuid(), ...over }, NOW)).result.task;
// A both task is made as either and then changed hands, as the product does it.
const createBoth = async (over: Partial<CreateTaskInput> = {}, who = ctx1) => {
  const made = await create(over, who);
  await store.patch(taskKey(householdId, made.id), { assignee: 'both' });
  return made;
};
const patch = (taskId: string, input: Omit<PatchTaskInput, 'mutationId'>, who = ctx1) => patchTask(store, who, taskId, { ...input, mutationId: uuid() }, NOW);

describe('effectiveAssignee', () => {
  it('is the assignee for a member, either and both', () => {
    expect(effectiveAssignee(task(U2), ctx1)).toBe(U2);
    expect(effectiveAssignee(task('either'), ctx1)).toBe('either');
    expect(effectiveAssignee(task('both'), ctx1)).toBe('both');
  });

  it('reads a person who is no longer a member as either', () => {
    expect(effectiveAssignee(task('auth0|gone'), ctx1)).toBe('either');
  });

  it('reads both in a one-member household as either', () => {
    expect(effectiveAssignee(task('both'), solo)).toBe('either');
  });

  it('gives this cycle to the swapper, and only while the cycle matches', () => {
    expect(effectiveAssignee(task(U2, { overrideAssignee: U1, overrideCycle: 1, cycleSeq: 1 }), ctx1)).toBe(U1);
    expect(effectiveAssignee(task(U2, { overrideAssignee: U1, overrideCycle: 1, cycleSeq: 2 }), ctx1)).toBe(U2);
  });

  it('ignores a swap to someone who is no longer a member', () => {
    expect(effectiveAssignee(task(U2, { overrideAssignee: 'auth0|gone', overrideCycle: 1 }), ctx1)).toBe(U2);
  });
});

describe('needsProposal', () => {
  it.each([
    ['own task', U1, { schedule: false, toOther: true, toEither: false, toBoth: true, del: false, restore: false }],
    ['an either task', 'either', { schedule: false, toOther: true, toEither: false, toBoth: true, del: false, restore: false }],
    ['the other member\'s task', U2, { schedule: true, toOther: true, toEither: true, toBoth: true, del: true, restore: true }],
    ['a both task', 'both', { schedule: true, toOther: true, toEither: true, toBoth: true, del: true, restore: true }],
  ])('on %s', (_name, assignee, expected) => {
    const t = { assignee };
    expect(needsProposal('schedule', t, ctx1)).toBe(expected.schedule);
    expect(needsProposal('assignee', t, ctx1, { assignee: U2 })).toBe(expected.toOther);
    expect(needsProposal('assignee', t, ctx1, { assignee: 'either' })).toBe(expected.toEither);
    expect(needsProposal('assignee', t, ctx1, { assignee: 'both' })).toBe(expected.toBoth);
    expect(needsProposal('delete', t, ctx1)).toBe(expected.del);
    expect(needsProposal('restore', t, ctx1)).toBe(expected.restore);
  });

  it('needs one to create a task for the other member or for both, not for oneself or either', () => {
    const blank = { assignee: 'either' };
    expect(needsProposal('create', blank, ctx1, { assignee: U2 })).toBe(true);
    expect(needsProposal('create', blank, ctx1, { assignee: 'both' })).toBe(true);
    expect(needsProposal('create', blank, ctx1, { assignee: U1 })).toBe(false);
    expect(needsProposal('create', blank, ctx1, { assignee: 'either' })).toBe(false);
  });

  it('needs none in a one-member household, where both is either and the other member is nobody', () => {
    expect(needsProposal('schedule', { assignee: 'both' }, solo)).toBe(false);
    expect(needsProposal('delete', { assignee: 'both' }, solo)).toBe(false);
    expect(needsProposal('delete', { assignee: 'auth0|gone' }, solo)).toBe(false);
    expect(needsProposal('create', { assignee: 'either' }, solo, { assignee: 'both' })).toBe(false);
  });

  it('assertDirect refuses with proposal_required and names who to ask', () => {
    expect(() => assertDirect('delete', { assignee: U2 }, ctx1)).toThrowError(expect.objectContaining({ code: 'proposal_required', status: 403, extra: { toUserId: U2 } }));
    expect(() => assertDirect('delete', { assignee: U1 }, ctx1)).not.toThrow();
  });
});

describe('writes that need a proposal', () => {
  it('refuses to create a task for the other member, and writes nothing', async () => {
    await expect(createTask(store, ctx1, { id: uuid(), title: 'Bins', assignee: U2, repeat: { type: 'none' }, mutationId: uuid() }, NOW))
      .rejects.toMatchObject({ code: 'proposal_required', status: 403 });
    expect((await store.query(hhPk(householdId), { skPrefix: 'TASK#' }))).toEqual([]);
  });

  it('refuses to reschedule or delete a both task, but applies a title edit', async () => {
    const both = await createBoth({ dueOn: '2026-11-14' });
    await expect(patch(both.id, { dueOn: { value: '2026-11-20', baseRuleVersion: 1, baseCycleSeq: 1 } })).rejects.toMatchObject({ code: 'proposal_required' });
    await expect(deleteTask(store, ctx1, both.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'proposal_required' });
    const edited = await patch(both.id, { title: { value: 'Big shop', at: NOW + 1 } });
    expect(edited.result.task.title).toBe('Big shop');
    expect((await store.query(hhPk(householdId), { skPrefix: EDIT_PREFIX }))).toEqual([]);
  });

  it('refuses to delete the other member\'s task, but applies a title edit and records who made it', async () => {
    const theirs = await create({ assignee: 'either' });
    await store.patch(taskKey(householdId, theirs.id), { assignee: U2 });
    await expect(deleteTask(store, ctx1, theirs.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'proposal_required', extra: { toUserId: U2 } });
    expect((await store.get(taskKey(householdId, theirs.id)))!.deletedAt).toBeUndefined();

    await patch(theirs.id, { title: { value: 'Hoover stairs', at: NOW + 1 } });
    const edits = await store.query(hhPk(householdId), { skPrefix: EDIT_PREFIX });
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ byUserId: U1, fields: ['title'], expiresAt: Math.floor(NOW / 1000) + 400 * 86_400 });
  });

  it('does not record history for an edit to one\'s own task, or for a tick', async () => {
    const mine = await create({ assignee: U1 });
    await patch(mine.id, { title: { value: 'Mine', at: NOW + 1 } });
    expect(await store.query(hhPk(householdId), { skPrefix: EDIT_PREFIX })).toEqual([]);
  });

  it('refuses to assign any task to the other member, and to move a task between members', async () => {
    const mine = await create({ assignee: U1 });
    await expect(patch(mine.id, { assignee: { value: U2, baseRuleVersion: 1 } })).rejects.toMatchObject({ code: 'proposal_required', extra: { toUserId: U2 } });
    const either = await create({ assignee: 'either' });
    await expect(patch(either.id, { assignee: { value: 'both', baseRuleVersion: 1 } })).rejects.toMatchObject({ code: 'proposal_required' });
    await expect(patch(either.id, { assignee: { value: U1, baseRuleVersion: 1 } })).resolves.toBeDefined();
  });

  it('refuses a repeat change on the other member\'s task', async () => {
    const theirs = await create({ dueOn: '2026-11-14' });
    await store.patch(taskKey(householdId, theirs.id), { assignee: U2 });
    await expect(patch(theirs.id, { repeat: { value: { type: 'after', days: 3 }, dueOn: '2026-11-15', baseRuleVersion: 1 } })).rejects.toMatchObject({ code: 'proposal_required' });
  });

  it('CUJ 7: completing the other member\'s chore needs no proposal and moves its date past tomorrow', async () => {
    const theirs = await create({ dueOn: '2026-11-14' });
    await store.patch(taskKey(householdId, theirs.id), { assignee: U2 });
    const { result } = await completeCycle(store, ctx1, theirs.id, { cycleSeq: 1, completedAt: NOW, mutationId: uuid() }, NOW);
    expect(result.task.dueOn).toBe('2026-11-15');
  });

  it('applies everything directly in a one-member household', async () => {
    const both = await createBoth({ dueOn: '2026-11-14' }, solo);
    await expect(patchTask(store, solo, both.id, { dueOn: { value: '2026-11-20', baseRuleVersion: 1, baseCycleSeq: 1 }, mutationId: uuid() }, NOW)).resolves.toBeDefined();
  });
});
