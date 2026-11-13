import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import type { Repeat } from '../../shared/schedule';
import { MemoryStore } from '../../store/memory';
import { completeCycle, undoCompletion } from '../completions';
import { doneKey, taskKey } from '../keys';
import { createTask, deleteTask, patchTask } from '../tasks';
import type { CreateTaskInput, PatchTaskInput } from '../types';

const NOW = Date.parse('2026-11-13T10:00:00.000Z'); // a Friday; 2026-11-15 is the Sunday
const HOUR = 3_600_000;
const DAY = 86_400_000;
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const AFTER_1: Repeat = { type: 'after', days: 1 };
const SUNDAYS: Repeat = { type: 'fixed', every: 1, unit: 'week', weekdays: ['sun'], startOn: '2026-11-01' };
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

let store: MemoryStore;
let ctx1: HouseholdContext;
let ctx2: HouseholdContext;
let householdId: string;

async function setup(timezone = 'Europe/London'): Promise<void> {
  store = new MemoryStore();
  ({ householdId } = await createHousehold(store, { userId: U1, name: 'Home', timezone, displayName: 'Sam', nowMs: NOW }, vi.fn()));
  await store.put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey(U2), householdId });
  ctx1 = (await loadContext(store, U1))!;
  ctx2 = (await loadContext(store, U2))!;
}

beforeEach(async () => { n = 0; await setup(); });

const create = async (over: Partial<CreateTaskInput> = {}) =>
  (await createTask(store, ctx1, { id: uuid(), title: 'Hoover', assignee: 'either', repeat: AFTER_1, mutationId: uuid(), ...over }, NOW)).result.task;
const complete = (taskId: string, over: { cycleSeq?: number; completedAt?: number; mutationId?: string } = {}, who = ctx1, now = NOW) =>
  completeCycle(store, who, taskId, { cycleSeq: 1, completedAt: now, mutationId: uuid(), ...over }, now);
const undo = (taskId: string, cycleSeq: number, who = ctx1, mutationId = uuid(), now = NOW) =>
  undoCompletion(store, who, taskId, cycleSeq, { mutationId }, now);
const patch = (taskId: string, input: Omit<PatchTaskInput, 'mutationId'>, who = ctx1) => patchTask(store, who, taskId, { ...input, mutationId: uuid() }, NOW);
const rawTask = async (taskId: string) => (await store.get(taskKey(householdId, taskId)))!;
const rawDone = (taskId: string, seq: number) => store.get(doneKey(householdId, taskId, seq));

describe('completeCycle: moving the date', () => {
  it('CUJ 2: a late hoover (after 1) goes to tomorrow', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    const { result } = await complete(task.id);
    expect(result.task).toMatchObject({ dueOn: '2026-11-14', cycleSeq: 2 });
    expect(result.cycleSeq).toBe(1);
  });

  it('CUJ 3: a fixed Sunday chore done on a Friday goes to the next Sunday after the cycle\'s Sunday', async () => {
    const task = await create({ title: 'Bathroom', repeat: SUNDAYS, dueOn: '2026-11-08' });
    const { result } = await complete(task.id);
    expect(result.task.dueOn).toBe('2026-11-15');
  });

  it('moves an after-1 chore completed early, and again on its new due date', async () => {
    const task = await create({ dueOn: '2026-11-20' });
    const first = await complete(task.id);
    expect(first.result.task.dueOn).toBe('2026-11-21');
    const second = await complete(task.id, { cycleSeq: 2, completedAt: NOW + 8 * DAY }, ctx1, NOW + 8 * DAY);
    expect(second.result.task.dueOn).toBe('2026-11-22');
  });

  it('moves the date after an edit that moved dueOn back', async () => {
    const task = await create({ dueOn: '2026-11-20' });
    await patch(task.id, { dueOn: { value: '2026-11-10', baseRuleVersion: 1, baseCycleSeq: 1 } });
    const { result } = await complete(task.id);
    expect(result.task.dueOn).toBe('2026-11-14');
  });

  it('does not let a replayed old title edit reverse a completion', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    await complete(task.id);
    await patch(task.id, { title: { value: 'Old', at: NOW - 1000 } });
    expect(await rawTask(task.id)).toMatchObject({ cycleSeq: 2, dueOn: '2026-11-14', title: 'Hoover' });
  });

  it('uses the day of completedAt, not the day the replay arrives', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    const tapped = NOW - 2 * DAY; // Wednesday
    const { result } = await complete(task.id, { completedAt: tapped }, ctx1, NOW);
    expect(result.task.dueOn).toBe('2026-11-13');
  });

  it('reads the day in the household\'s time zone, not UTC', async () => {
    await setup('Asia/Tokyo');
    const task = await create({ dueOn: '2026-11-13' });
    const tapped = Date.parse('2026-11-13T20:00:00.000Z'); // 05:00 on the 14th in Tokyo
    const { result } = await complete(task.id, { completedAt: tapped }, ctx1, tapped + HOUR);
    expect(result.task.dueOn).toBe('2026-11-15');
  });

  it('clamps a completedAt an hour ahead', async () => {
    const task = await create({ dueOn: '2026-11-13' });
    await complete(task.id, { completedAt: NOW + 6 * HOUR });
    expect((await rawDone(task.id, 1))![`by_${U1}`]).toBe(NOW);
  });
});

describe('completeCycle: the record', () => {
  it('records the cycle, who did it, the checklist, and what the update set', async () => {
    const step = uuid();
    const task = await create({ dueOn: '2026-11-12', checklist: [{ id: step, text: 'Stairs' }] });
    await patch(task.id, { ticks: { cycleSeq: 1, steps: { [step]: { done: true, at: NOW + 1 } } } });
    await complete(task.id);
    expect(await rawDone(task.id, 1)).toMatchObject({
      cycleDueOn: '2026-11-12', [`by_${U1}`]: NOW, setDueOn: '2026-11-14', checklistState: { [step]: { done: true } },
      expiresAt: Math.floor(NOW / 1000) + 400 * 86_400,
    });
    expect((await rawTask(task.id)).checklistState).toEqual({});
  });

  it('completes with a partly ticked checklist when asked to', async () => {
    const [a, b] = [uuid(), uuid()];
    const task = await create({ checklist: [{ id: a, text: 'A' }, { id: b, text: 'B' }] });
    await patch(task.id, { ticks: { cycleSeq: 1, steps: { [a]: { done: true, at: NOW + 1 } } } });
    await expect(complete(task.id)).resolves.toBeDefined();
    expect((await rawTask(task.id)).cycleSeq).toBe(2);
  });

  it('records a together completion for a both task', async () => {
    const task = await create({ assignee: 'both' });
    await complete(task.id);
    expect(await rawDone(task.id, 1)).toMatchObject({ together: true });
  });

  it('does not record together for a both task in a one-member household', async () => {
    const solo = { ...ctx1, members: [ctx1.member], household: { ...ctx1.household, memberCount: 1 } };
    const task = await create({ assignee: 'both' });
    await completeCycle(store, solo, task.id, { cycleSeq: 1, completedAt: NOW, mutationId: uuid() }, NOW);
    expect((await rawDone(task.id, 1))!.together).toBeUndefined();
  });

  it('clears an accepted swap and keeps it on the record', async () => {
    const task = await create({ assignee: U1 });
    await store.patch(taskKey(householdId, task.id), { overrideAssignee: U2, overrideCycle: 1 });
    await complete(task.id);
    const after = await rawTask(task.id);
    expect(after.overrideAssignee).toBeUndefined();
    expect(after.overrideCycle).toBeUndefined();
    expect(await rawDone(task.id, 1)).toMatchObject({ clearedOverride: { overrideAssignee: U2, overrideCycle: 1 } });
  });

  it('completes a to-do to done, keeping its date, and expires it in 30 days', async () => {
    const task = await create({ repeat: { type: 'none' }, dueOn: '2026-11-12' });
    const { result } = await complete(task.id);
    expect(result.task).toMatchObject({ status: 'done', doneAt: NOW, dueOn: '2026-11-12', cycleSeq: 2, expiresAt: Math.floor(NOW / 1000) + 30 * 86_400 });
  });
});

describe('completeCycle: several people and replays', () => {
  it('CUJ 4: two completions at once move the date once and record both people', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    await Promise.all([complete(task.id, {}, ctx1), complete(task.id, {}, ctx2)]);
    expect(await rawTask(task.id)).toMatchObject({ cycleSeq: 2, dueOn: '2026-11-14' });
    expect(await rawDone(task.id, 1)).toMatchObject({ [`by_${U1}`]: NOW, [`by_${U2}`]: NOW });
  });

  it('adds the second person to a cycle that was already completed, without moving the date again', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    await complete(task.id, {}, ctx1);
    const { result } = await complete(task.id, { completedAt: NOW + 60_000 }, ctx2, NOW + 60_000);
    expect(result.task).toMatchObject({ cycleSeq: 2, dueOn: '2026-11-14' });
    expect(await rawDone(task.id, 1)).toMatchObject({ [`by_${U1}`]: NOW, [`by_${U2}`]: NOW + 60_000 });
  });

  it('writes nothing when the same person taps again from a second phone', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    await complete(task.id);
    const before = await rawDone(task.id, 1);
    await complete(task.id, { completedAt: NOW + 5000 }, ctx1, NOW + 5000);
    expect(await rawDone(task.id, 1)).toEqual(before);
    expect((await rawTask(task.id)).cycleSeq).toBe(2);
  });

  it('answers a retried completion from its record, so it never completes the next cycle', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    const mutationId = uuid();
    const first = await complete(task.id, { mutationId });
    const retry = await complete(task.id, { mutationId, completedAt: NOW + 9000 }, ctx1, NOW + 9000);
    expect(retry.fresh).toBe(false);
    expect(retry.result).toEqual(first.result);
    expect((await rawTask(task.id)).cycleSeq).toBe(2);
  });

  it('completes the current cycle when the phone saw a later one that was since undone', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    await complete(task.id);
    await undo(task.id, 1);
    const { result } = await complete(task.id, { cycleSeq: 2 });
    expect(result.cycleSeq).toBe(1);
    expect(result.task.cycleSeq).toBe(2);
  });

  it('refuses a completion for an older cycle that has no record, with the current task', async () => {
    const task = await create();
    await store.patch(taskKey(householdId, task.id), { cycleSeq: 3 });
    await expect(complete(task.id, { cycleSeq: 2 })).rejects.toMatchObject({ code: 'conflict', status: 409, extra: { task: { cycleSeq: 3 } } });
  });

  it('answers a completion of a deleted task with gone and writes nothing', async () => {
    const task = await create();
    await deleteTask(store, ctx2, task.id, { baseRuleVersion: 1, mutationId: uuid() }, NOW);
    await expect(complete(task.id)).rejects.toMatchObject({ code: 'gone', status: 410 });
    expect(await rawDone(task.id, 1)).toBeUndefined();
  });

  it('answers not found for a task of another household', async () => {
    await expect(complete(uuid())).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});

describe('undoCompletion', () => {
  it('reopens the cycle when the caller was the only one', async () => {
    const step = uuid();
    const task = await create({ dueOn: '2026-11-12', checklist: [{ id: step, text: 'Stairs' }] });
    await patch(task.id, { ticks: { cycleSeq: 1, steps: { [step]: { done: true, at: NOW + 1 } } } });
    await complete(task.id);
    const { result } = await undo(task.id, 1);
    expect(result.task).toMatchObject({ cycleSeq: 1, dueOn: '2026-11-12', checklistState: { [step]: { done: true } } });
    expect(await rawDone(task.id, 1)).toBeUndefined();
  });

  it('reopens a done to-do', async () => {
    const task = await create({ repeat: { type: 'none' }, dueOn: '2026-11-12' });
    await complete(task.id);
    const { result } = await undo(task.id, 1);
    expect(result.task).toMatchObject({ status: 'open', cycleSeq: 1 });
    expect(result.task.doneAt).toBeUndefined();
    expect(result.task.expiresAt).toBeUndefined();
  });

  it('removes only the caller\'s attribute when the other also did it, and the cycle stays done', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    await complete(task.id, {}, ctx1);
    await complete(task.id, {}, ctx2);
    const { result } = await undo(task.id, 1, ctx1);
    expect(result.task).toMatchObject({ cycleSeq: 2, dueOn: '2026-11-14' });
    const done = (await rawDone(task.id, 1))!;
    expect(done[`by_${U1}`]).toBeUndefined();
    expect(done[`by_${U2}`]).toBeDefined();
  });

  it('leaves the cycle done when an undo races the other member\'s also-did-it', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    await complete(task.id, {}, ctx1);
    await Promise.all([undo(task.id, 1, ctx1), complete(task.id, {}, ctx2)]);
    expect((await rawTask(task.id)).cycleSeq).toBe(2);
    expect((await rawDone(task.id, 1))![`by_${U2}`]).toBeDefined();
  });

  it('is refused when a swap was accepted for the next cycle', async () => {
    const task = await create({ assignee: U1 });
    await complete(task.id);
    await store.patch(taskKey(householdId, task.id), { overrideAssignee: U2, overrideCycle: 2 });
    await expect(undo(task.id, 1)).rejects.toMatchObject({ code: 'conflict', status: 409 });
    expect(await rawDone(task.id, 1)).toBeDefined();
  });

  it('is refused once the task has moved on to a later cycle', async () => {
    const task = await create();
    await complete(task.id);
    await complete(task.id, { cycleSeq: 2 });
    await expect(undo(task.id, 1)).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('brings back a swap that the completion cleared', async () => {
    const task = await create({ assignee: U1 });
    await store.patch(taskKey(householdId, task.id), { overrideAssignee: U2, overrideCycle: 1 });
    await complete(task.id);
    const { result } = await undo(task.id, 1);
    expect(result.task).toMatchObject({ overrideAssignee: U2, overrideCycle: 1 });
  });

  it('writes nothing when the caller has no attribute on that cycle', async () => {
    const task = await create();
    await complete(task.id, {}, ctx1);
    const before = await rawDone(task.id, 1);
    const tBefore = await rawTask(task.id);
    await undo(task.id, 1, ctx2);
    expect(await rawDone(task.id, 1)).toEqual(before);
    expect(await rawTask(task.id)).toEqual(tBefore);
  });

  it('writes a new record with the same cycle number when a reopened cycle is completed again', async () => {
    const task = await create({ dueOn: '2026-11-12' });
    await complete(task.id);
    await undo(task.id, 1);
    await complete(task.id, { completedAt: NOW + 1000 }, ctx2, NOW + 1000);
    const done = (await rawDone(task.id, 1))!;
    expect(done[`by_${U2}`]).toBe(NOW + 1000);
    expect(done[`by_${U1}`]).toBeUndefined();
  });

  it('answers a retried undo from its record', async () => {
    const task = await create();
    await complete(task.id);
    const mutationId = uuid();
    const first = await undo(task.id, 1, ctx1, mutationId);
    const retry = await undo(task.id, 1, ctx1, mutationId);
    expect(retry.fresh).toBe(false);
    expect(retry.result).toEqual(first.result);
  });
});
