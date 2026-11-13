import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { taskKey } from '../keys';
import { createTask, deleteTask, listTasks, patchTask } from '../tasks';
import type { CreateTaskInput, PatchTaskInput } from '../types';

const NOW = Date.parse('2026-11-13T10:00:00.000Z'); // a Friday; 2026-11-15 is the Sunday
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

const create = async (over: Partial<CreateTaskInput> = {}, who = ctx1, now = NOW) =>
  (await createTask(store, who, { id: uuid(), title: 'Hoover', assignee: 'either', repeat: { type: 'none' }, mutationId: uuid(), ...over }, now)).result.task;
const patch = (taskId: string, input: Omit<PatchTaskInput, 'mutationId'>, who = ctx1, now = NOW) =>
  patchTask(store, who, taskId, { ...input, mutationId: uuid() }, now);
const raw = async (taskId: string) => (await store.get(taskKey(householdId, taskId)))!;
const step = (id: string, text = 'Wipe') => ({ id, text });

describe('createTask', () => {
  it('starts a task at cycle 1 and rule version 1, open, with its field times', async () => {
    const task = await create({ notes: 'Under the sofa too' });
    expect(task).toMatchObject({ title: 'Hoover', cycleSeq: 1, ruleVersion: 1, status: 'open', createdBy: U1, checklist: [], checklistState: {}, updatedAt: NOW });
    expect(task.fieldTimes).toMatchObject({ title: NOW, notes: NOW });
  });

  it('gives a chore with no date the first date its rule gives, on or after today', async () => {
    const task = await create({ repeat: { type: 'after', days: 3 } });
    expect(task.dueOn).toBe('2026-11-13');
  });

  it('leaves a to-do with no date undated', async () => {
    expect((await create()).dueOn).toBeUndefined();
  });

  it('returns a replayed create unchanged and writes nothing', async () => {
    const input = { id: uuid(), title: 'Hoover', assignee: 'either', repeat: { type: 'none' as const }, mutationId: uuid() };
    const first = await createTask(store, ctx1, input, NOW);
    const second = await createTask(store, ctx1, input, NOW + 5000);
    expect(second.fresh).toBe(false);
    expect(second.result.task).toEqual(first.result.task);
  });

  it('treats a repeat of the same task id under a new mutation id as the task already there', async () => {
    const id = uuid();
    await createTask(store, ctx1, { id, title: 'Hoover', assignee: 'either', repeat: { type: 'none' }, mutationId: uuid() }, NOW);
    const again = await createTask(store, ctx1, { id, title: 'Different', assignee: 'either', repeat: { type: 'none' }, mutationId: uuid() }, NOW + 1000);
    expect(again.result.task.title).toBe('Hoover');
  });
});

describe('a task of another household', () => {
  it('is not found, whatever the id', async () => {
    const other = await createHousehold(store, { userId: 'auth0|x', name: 'Other', timezone: 'UTC', displayName: 'X', nowMs: NOW }, vi.fn());
    const otherCtx = (await loadContext(store, 'auth0|x'))!;
    const theirs = await create({}, otherCtx);
    expect(other.householdId).not.toBe(householdId);
    await expect(patch(theirs.id, { title: { value: 'Mine', at: NOW } })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(deleteTask(store, ctx1, theirs.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});

describe('patchTask: fields and ticks', () => {
  it('applies a newer title and records its time', async () => {
    const task = await create();
    const { result } = await patch(task.id, { title: { value: 'Vacuum', at: NOW + 1000 } });
    expect(result.task).toMatchObject({ title: 'Vacuum' });
    expect(result.task.fieldTimes.title).toBe(NOW + 1000);
  });

  it('changes nothing for a replayed old title edit, and leaves the date alone', async () => {
    const task = await create({ repeat: { type: 'after', days: 3 } });
    const before = await raw(task.id);
    await patch(task.id, { title: { value: 'Old name', at: NOW - 1000 } });
    const after = await raw(task.id);
    expect(after).toEqual(before);
    expect(after.title).toBe('Hoover');
    expect(after.dueOn).toBe('2026-11-13');
  });

  it('clamps a timestamp an hour ahead to server time', async () => {
    const task = await create();
    const { result } = await patch(task.id, { title: { value: 'Later', at: NOW + 3_600_000 } }, ctx1, NOW + 1);
    expect(result.task.fieldTimes.title).toBe(NOW + 1);
  });

  it('keeps ticks of different steps from two members', async () => {
    const [a, b] = [uuid(), uuid()];
    const task = await create({ checklist: [step(a), step(b)] });
    await patch(task.id, { ticks: { cycleSeq: 1, steps: { [a]: { done: true, at: NOW + 10 } } } }, ctx1);
    const { result } = await patch(task.id, { ticks: { cycleSeq: 1, steps: { [b]: { done: true, at: NOW + 20 } } } }, ctx2);
    expect(result.task.checklistState).toMatchObject({ [a]: { done: true }, [b]: { done: true } });
  });

  it('ignores an older tick of the same step', async () => {
    const a = uuid();
    const task = await create({ checklist: [step(a)] });
    await patch(task.id, { ticks: { cycleSeq: 1, steps: { [a]: { done: true, at: NOW + 20 } } } });
    const { result } = await patch(task.id, { ticks: { cycleSeq: 1, steps: { [a]: { done: false, at: NOW + 10 } } } });
    expect(result.task.checklistState[a]).toEqual({ done: true, at: NOW + 20 });
  });

  it('drops a tick made in a previous cycle, with no write', async () => {
    const a = uuid();
    const task = await create({ checklist: [step(a)] });
    await store.patch(taskKey(householdId, task.id), { cycleSeq: 2 });
    const before = await raw(task.id);
    const { result } = await patch(task.id, { ticks: { cycleSeq: 1, steps: { [a]: { done: true, at: NOW + 10 } } } });
    expect(result.task.checklistState).toEqual({});
    expect(await raw(task.id)).toEqual(before);
  });

  it('replaces the checklist when its time is newer', async () => {
    const [a, b] = [uuid(), uuid()];
    const task = await create({ checklist: [step(a)] });
    const { result } = await patch(task.id, { checklist: { value: [step(b, 'Dust')], at: NOW + 5 } });
    expect(result.task.checklist).toEqual([step(b, 'Dust')]);
  });
});

describe('patchTask: schedule fields', () => {
  it('refuses a repeat change that carries an old rule version', async () => {
    const task = await create({ repeat: { type: 'after', days: 3 } });
    await patch(task.id, { repeat: { value: { type: 'after', days: 5 }, dueOn: '2026-11-14', baseRuleVersion: 1 } });
    await expect(patch(task.id, { repeat: { value: { type: 'after', days: 9 }, dueOn: '2026-11-14', baseRuleVersion: 1 } }))
      .rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('accepts a repeat change sent after the other member completed the chore, with a valid date', async () => {
    const task = await create({ repeat: { type: 'after', days: 3 } });
    await store.patch(taskKey(householdId, task.id), { cycleSeq: 2, dueOn: '2026-11-16' });
    const { result } = await patch(task.id, { repeat: { value: { type: 'after', days: 5 }, dueOn: '2026-11-20', baseRuleVersion: 1 } });
    expect(result.task).toMatchObject({ dueOn: '2026-11-20', ruleVersion: 2 });
  });

  it('moves an every-Sunday chore to a Wednesday when the rule changes to every Wednesday', async () => {
    const sundays = { type: 'fixed' as const, every: 1, unit: 'week' as const, weekdays: ['sun' as const], startOn: '2026-11-01' };
    const task = await create({ repeat: sundays, dueOn: '2026-11-15' });
    const wednesdays = { type: 'fixed' as const, every: 1, unit: 'week' as const, weekdays: ['wed' as const], startOn: '2026-11-04' };
    const { result } = await patch(task.id, { repeat: { value: wednesdays, dueOn: '2026-11-18', baseRuleVersion: 1 } });
    expect(result.task.dueOn).toBe('2026-11-18');
  });

  it('uses the rule\'s first date from today when the suggested date is already past', async () => {
    const task = await create();
    const { result } = await patch(task.id, { repeat: { value: { type: 'after', days: 2 }, dueOn: '2026-11-01', baseRuleVersion: 1 } });
    expect(result.task.dueOn).toBe('2026-11-13');
  });

  it('gives an undated to-do a date when it becomes a chore', async () => {
    const task = await create();
    const { result } = await patch(task.id, { repeat: { value: { type: 'after', days: 2 }, dueOn: '2026-11-14', baseRuleVersion: 1 } });
    expect(result.task.dueOn).toBe('2026-11-14');
  });

  it('keeps an accepted swap through a date change, and clears it on a repeat change', async () => {
    const task = await create({ repeat: { type: 'after', days: 3 }, assignee: U1 });
    await store.patch(taskKey(householdId, task.id), { overrideAssignee: U2, overrideCycle: 1 });
    const moved = await patch(task.id, { dueOn: { value: '2026-11-20', baseRuleVersion: 1, baseCycleSeq: 1 } });
    expect(moved.result.task).toMatchObject({ overrideAssignee: U2, overrideCycle: 1, dueOn: '2026-11-20', ruleVersion: 1 });
    const changed = await patch(task.id, { repeat: { value: { type: 'after', days: 4 }, dueOn: '2026-11-21', baseRuleVersion: 1 } });
    expect(changed.result.task.overrideAssignee).toBeUndefined();
    expect(changed.result.task.overrideCycle).toBeUndefined();
  });

  it('refuses a date change whose cycle has moved on', async () => {
    const task = await create({ repeat: { type: 'after', days: 3 } });
    await store.patch(taskKey(householdId, task.id), { cycleSeq: 2 });
    await expect(patch(task.id, { dueOn: { value: '2026-11-20', baseRuleVersion: 1, baseCycleSeq: 1 } })).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('bumps the rule version when the assignee changes', async () => {
    const task = await create();
    const { result } = await patch(task.id, { assignee: { value: U1, baseRuleVersion: 1 } });
    expect(result.task).toMatchObject({ assignee: U1, ruleVersion: 2 });
  });

  it('answers a repeat of the same mutation from its record', async () => {
    const task = await create();
    const input: PatchTaskInput = { mutationId: uuid(), title: { value: 'Once', at: NOW + 5 } };
    const first = await patchTask(store, ctx1, task.id, input, NOW);
    const second = await patchTask(store, ctx1, task.id, input, NOW + 9999);
    expect(second.fresh).toBe(false);
    expect(second.result).toEqual(first.result);
  });
});

describe('deleteTask', () => {
  it('turns a task into a tombstone for 30 days and bumps the rule version', async () => {
    const task = await create();
    const { result } = await deleteTask(store, ctx2, task.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW);
    expect(result.task).toMatchObject({ deletedAt: NOW, deletedBy: U2, ruleVersion: 2, expiresAt: Math.floor(NOW / 1000) + 30 * 86_400 });
  });

  it('does nothing when the task is already deleted', async () => {
    const task = await create();
    await deleteTask(store, ctx1, task.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW);
    const again = await deleteTask(store, ctx2, task.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW + 1000);
    expect(again.result.task).toMatchObject({ deletedAt: NOW, deletedBy: U1 });
  });

  it('refuses a delete from a phone that missed a change of rule, and a retried delete cannot undo a restore', async () => {
    const task = await create();
    const mutationId = uuid();
    const first = await deleteTask(store, ctx1, task.id, { baseRuleVersion: 1, mutationId }, NOW);
    // Restored meanwhile: the deleted marks go and the rule version goes up again.
    await store.transact([{ update: taskKey(householdId, task.id), remove: ['deletedAt', 'deletedBy', 'expiresAt'], set: { ruleVersion: 3 } }]);
    const retried = await deleteTask(store, ctx1, task.id, { baseRuleVersion: 1, mutationId }, NOW + 5000);
    expect(retried.result).toEqual(first.result);
    expect((await raw(task.id)).deletedAt).toBeUndefined();
    await expect(deleteTask(store, ctx1, task.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW + 6000)).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('succeeds for a task created a moment ago', async () => {
    const task = await create();
    await expect(deleteTask(store, ctx1, task.id, { baseRuleVersion: task.ruleVersion, mutationId: uuid() }, NOW)).resolves.toBeDefined();
  });

  it('makes a later edit answer gone and write nothing', async () => {
    const task = await create();
    await deleteTask(store, ctx1, task.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW);
    const before = await raw(task.id);
    await expect(patch(task.id, { title: { value: 'Zombie', at: NOW + 99 } })).rejects.toMatchObject({ code: 'gone', status: 410 });
    expect(await raw(task.id)).toEqual(before);
  });
});

describe('listTasks', () => {
  const setRaw = (taskId: string, fields: Record<string, unknown>) => store.patch(taskKey(householdId, taskId), fields);

  it('returns open tasks and the server time, ordered by id', async () => {
    const a = await create({ title: 'A' });
    const b = await create({ title: 'B' });
    const { tasks, serverTime } = await listTasks(store, ctx1, NOW);
    expect(tasks.map(task => task.id)).toEqual([a.id, b.id]);
    expect(serverTime).toBe(NOW);
  });

  it('keeps a to-do done 6 days ago and leaves out one done 8 days ago', async () => {
    const recent = await create({ title: 'Recent' });
    const old = await create({ title: 'Old' });
    await setRaw(recent.id, { status: 'done', doneAt: NOW - 6 * DAY });
    await setRaw(old.id, { status: 'done', doneAt: NOW - 8 * DAY });
    const { tasks } = await listTasks(store, ctx1, NOW);
    expect(tasks.map(task => task.title)).toEqual(['Recent']);
  });

  it('keeps a tombstone from 29 days ago and drops one from 31 days ago', async () => {
    const recent = await create({ title: 'Recent' });
    const old = await create({ title: 'Old' });
    await setRaw(recent.id, { deletedAt: NOW - 29 * DAY, deletedBy: U1 });
    await setRaw(old.id, { deletedAt: NOW - 31 * DAY, deletedBy: U1 });
    const { tasks } = await listTasks(store, ctx1, NOW);
    expect(tasks.map(task => task.title)).toEqual(['Recent']);
    expect(tasks[0].deletedAt).toBeDefined();
  });

  it('does not list another household\'s tasks', async () => {
    await createHousehold(store, { userId: 'auth0|x', name: 'Other', timezone: 'UTC', displayName: 'X', nowMs: NOW }, vi.fn());
    await create({ title: 'Theirs' }, (await loadContext(store, 'auth0|x'))!);
    expect((await listTasks(store, ctx1, NOW)).tasks).toEqual([]);
  });
});
