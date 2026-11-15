import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import type { AddDay, AddLine } from '../../shared/mealValidation';
import { putItem, listItems } from '../../shopping/items';
import type { TxOp } from '../../store';
import { MemoryStore } from '../../store/memory';
import { mutKey } from '../../tasks/keys';
import { addPlanToList } from '../addToList';
import { planKey } from '../keys';
import { setPlanDay } from '../plan';
import type { PlanMeal } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

// A store that can be told to fail on a chosen transaction, to stand in for a crash part-way through an add.
class FlakyStore extends MemoryStore {
  failOn: number | undefined;
  transactions = 0;
  override async transact(ops: TxOp[]): Promise<void> {
    this.transactions += 1;
    if (this.failOn !== undefined && this.transactions === this.failOn) throw new Error('crash');
    return super.transact(ops);
  }
}

let store: FlakyStore;
let ctx1: HouseholdContext;
let ctx2: HouseholdContext;
let householdId: string;
const chilli: PlanMeal = { recipeId: '11111111-1111-4111-8111-111111111111', title: 'Chilli', servings: 4 };

beforeEach(async () => {
  n = 0;
  store = new FlakyStore();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  ({ householdId } = await createHousehold(store, { userId: U1, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW }, vi.fn()));
  await store.put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey(U2), householdId });
  ctx1 = (await loadContext(store, U1))!;
  ctx2 = (await loadContext(store, U2))!;
  store.transactions = 0;
});

const plan = (day: string, meal: PlanMeal = chilli) => setPlanDay(store, ctx1, day, { meal, mealAt: NOW - 1000, mutationId: uuid() }, NOW);
const dayOf = (day: string, meal: PlanMeal = chilli): AddDay => ({ day, ...meal });
const line = (text: string, extra: Partial<AddLine> = {}): AddLine => ({ id: uuid(), text, ...extra });
const add = (days: AddDay[], lines: AddLine[], mutationId = uuid(), who = ctx1, now = NOW) => addPlanToList(store, who, { days, lines, mutationId }, now);
const items = async () => (await listItems(store, ctx1, NOW)).items;
const rawDay = async (day: string) => (await store.get(planKey(householdId, day)))!;

describe('addPlanToList', () => {
  it('creates each shopping line with its quantity and the recipes it is for, and answers with each id and status', async () => {
    await plan('2026-11-16');
    const lines = [line('onions', { quantity: '3', forRecipes: 'Chilli, Pasta bake' }), line('salt to taste', { forRecipes: 'Chilli' })];
    const { result, fresh } = await add([dayOf('2026-11-16')], lines);
    expect(fresh).toBe(true);
    expect(result.results).toEqual([{ id: lines[0].id, status: 'created' }, { id: lines[1].id, status: 'created' }]);
    const stored = await items();
    expect(stored.find(item => item.id === lines[0].id)).toMatchObject({ text: 'onions', quantity: '3', forRecipes: 'Chilli, Pasta bake', ticked: false });
    expect(stored.find(item => item.id === lines[1].id)?.quantity).toBeUndefined();
  });

  it('marks each listed day as on the list, with who added it and when', async () => {
    await plan('2026-11-16');
    await add([dayOf('2026-11-16')], [line('onions')], uuid(), ctx2);
    expect(await rawDay('2026-11-16')).toMatchObject({ addedAt: NOW, addedBy: U2 });
  });

  it('answers a repeat of the same mutation from its record and writes nothing', async () => {
    await plan('2026-11-16');
    const mutationId = uuid();
    const first = await add([dayOf('2026-11-16')], [line('onions')], mutationId);
    const before = store.transactions;
    const again = await add([dayOf('2026-11-16')], [line('carrots')], mutationId, ctx1, NOW + 5000);
    expect(again).toEqual({ fresh: false, result: first.result });
    expect(store.transactions).toBe(before);
    expect(await items()).toHaveLength(1);
  });

  it('completes after a crash between the shopping lines and the record, without duplicating a line, and sets the markers again', async () => {
    await plan('2026-11-16');
    const mutationId = uuid();
    const lines = [line('onions'), line('carrots'), line('rice')];
    // Transactions in the add: three lines, one marker, then the record. Fail on the record.
    store.transactions = 0;
    store.failOn = 5;
    await expect(add([dayOf('2026-11-16')], lines, mutationId)).rejects.toThrow('crash');
    expect(await items()).toHaveLength(3);
    expect(await store.get(mutKey(householdId, mutationId))).toBeUndefined();

    store.failOn = undefined;
    const retried = await add([dayOf('2026-11-16')], lines, mutationId);
    expect(retried.fresh).toBe(true);
    expect(retried.result.results.map(entry => entry.status)).toEqual(['noop', 'noop', 'noop']);
    expect(await items()).toHaveLength(3);
    expect(await rawDay('2026-11-16')).toMatchObject({ addedBy: U1 });
    expect(await store.get(mutKey(householdId, mutationId))).toBeDefined();
    expect((await add([dayOf('2026-11-16')], lines, mutationId)).fresh).toBe(false);
  });

  it('lets two people add at once: both succeed, and both sets of lines are created', async () => {
    await plan('2026-11-16');
    const [a, b] = await Promise.all([
      add([dayOf('2026-11-16')], [line('onions')], uuid(), ctx1),
      add([dayOf('2026-11-16')], [line('onions')], uuid(), ctx2),
    ]);
    expect(a.fresh && b.fresh).toBe(true);
    expect(await items()).toHaveLength(2);
  });

  it('adds a hundred lines, ten at a time', async () => {
    await plan('2026-11-16');
    const lines = Array.from({ length: 100 }, (_, index) => line(`item ${index}`));
    const { result } = await add([dayOf('2026-11-16')], lines);
    expect(result.results).toHaveLength(100);
    expect(result.results.every(entry => entry.status === 'created')).toBe(true);
    expect(await items()).toHaveLength(100);
  });

  it('skips a day that is missing, one whose dinner changed since, and one that has expired, without failing and with no marker', async () => {
    await plan('2026-11-16', { title: 'Soup' });
    await plan('2026-11-17');
    await store.put({ ...planKey(householdId, '2026-11-18'), meal: chilli, fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: U1, expiresAt: Math.floor(NOW / 1000) - 10 });
    const { result } = await add([dayOf('2026-11-15'), dayOf('2026-11-16'), dayOf('2026-11-17'), dayOf('2026-11-18')], [line('onions')]);
    expect(result.results).toHaveLength(1);
    expect(Object.keys(await rawDay('2026-11-16'))).not.toContain('addedAt');
    expect(await rawDay('2026-11-17')).toMatchObject({ addedAt: NOW });
    expect(Object.keys(await rawDay('2026-11-18'))).not.toContain('addedAt');
    expect(await store.get(planKey(householdId, '2026-11-15'))).toBeUndefined();
  });

  it('skips a day whose servings changed since the client looked', async () => {
    await plan('2026-11-16', { ...chilli, servings: 2 });
    await add([dayOf('2026-11-16')], [line('onions')]);
    expect(Object.keys(await rawDay('2026-11-16'))).not.toContain('addedAt');
  });

  it('does not touch a shopping line someone typed by hand, even with the same name', async () => {
    await plan('2026-11-16');
    const typed = uuid();
    await putItem(store, ctx2, typed, { mutationId: uuid(), write: { text: { value: 'onions', at: NOW - 100 } } }, NOW);
    await add([dayOf('2026-11-16')], [line('onions', { quantity: '3' })]);
    const stored = await items();
    expect(stored).toHaveLength(2);
    expect(stored.find(item => item.id === typed)).toMatchObject({ text: 'onions' });
    expect(stored.find(item => item.id === typed)?.quantity).toBeUndefined();
  });

  it('writes a record holding ids and statuses, never the text of a line or the recipes', async () => {
    await plan('2026-11-16');
    const mutationId = uuid();
    await add([dayOf('2026-11-16')], [line('secret onions', { quantity: '3', forRecipes: 'Secret chilli' })], mutationId);
    const record = JSON.stringify(await store.get(mutKey(householdId, mutationId)));
    expect(record).not.toMatch(/secret|onions|Chilli/i);
  });

  it('judges nothing by the client time but stamps each line with it, clamped to the server time', async () => {
    await plan('2026-11-16');
    const lines = [line('onions')];
    await addPlanToList(store, ctx1, { days: [dayOf('2026-11-16')], lines, mutationId: uuid(), clientAt: NOW + 3_600_000 }, NOW);
    expect((await items())[0].fieldTimes.text).toBe(NOW);
  });

  it('logs one plan_add line with counts and no recipe text', async () => {
    await plan('2026-11-16');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    log.mockClear();
    await add([dayOf('2026-11-16'), dayOf('2026-11-30')], [line('secret onions')]);
    const lines = log.mock.calls.map(call => String(call[0])).filter(text => text.includes('plan_add'));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ event: 'plan_add', householdId, days: 2, lines: 1, created: 1, skipped: 1 });
    expect(lines[0]).not.toMatch(/secret|onions/);
  });
});
