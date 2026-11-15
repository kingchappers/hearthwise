import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { applyPlanWrite, sameMeal } from '../applyPlan';
import { planKey } from '../keys';
import { listPlan, setPlanDay } from '../plan';
import type { PlanMeal } from '../types';

// 10:00 on Saturday 14 November 2026, in London (UTC+0 in November).
const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const DAY_MS = 86_400_000;
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

const chilli: PlanMeal = { recipeId: uuid(), title: 'Chilli', servings: 4 };
const set = (day: string, meal: PlanMeal | null, at = NOW - 1000, who = ctx1, extra: { mutationId?: string; clientAt?: number } = {}, now = NOW) =>
  setPlanDay(store, who, day, { meal, mealAt: at, mutationId: extra.mutationId ?? uuid(), ...(extra.clientAt === undefined ? {} : { clientAt: extra.clientAt }) }, now);
const raw = async (day: string) => (await store.get(planKey(householdId, day)))!;

describe('sameMeal', () => {
  it('compares the title, the recipe id (or none in both) and the servings (or none in both)', () => {
    expect(sameMeal({ recipeId: 'a', title: 'Chilli', servings: 4 }, { recipeId: 'a', title: 'Chilli', servings: 4 })).toBe(true);
    expect(sameMeal({ title: 'Takeaway' }, { title: 'Takeaway' })).toBe(true);
    expect(sameMeal({ recipeId: 'a', title: 'Chilli', servings: 4 }, { recipeId: 'a', title: 'Chilli', servings: 2 })).toBe(false);
    expect(sameMeal({ recipeId: 'a', title: 'Chilli', servings: 4 }, { recipeId: 'b', title: 'Chilli', servings: 4 })).toBe(false);
    expect(sameMeal({ recipeId: 'a', title: 'Chilli', servings: 4 }, { title: 'Chilli' })).toBe(false);
    expect(sameMeal({ title: 'A' }, { title: 'B' })).toBe(false);
    expect(sameMeal(undefined, { title: 'A' })).toBe(false);
  });
});

describe('applyPlanWrite', () => {
  it('creates a day with its meal, a time, who set it and an expiry 60 days after the date', () => {
    const { result, day } = applyPlanWrite(undefined, '2026-11-16', { meal: chilli, mealAt: NOW - 5 }, U1, NOW);
    expect(result).toBe('created');
    expect(day).toEqual({
      day: '2026-11-16', meal: chilli, fieldTimes: { meal: NOW - 5 }, updatedAt: NOW, updatedBy: U1, expiresAt: Date.UTC(2026, 10, 16) / 1000 + 60 * 86_400,
    });
  });

  it('keeps the time of a clear, so a slower older write cannot bring the meal back', () => {
    const { day } = applyPlanWrite(undefined, '2026-11-16', { meal: null, mealAt: NOW - 5 }, U1, NOW);
    expect(day?.meal).toBeUndefined();
    expect(day?.fieldTimes.meal).toBe(NOW - 5);
  });

  it('does nothing for an older write', () => {
    const { day: existing } = applyPlanWrite(undefined, '2026-11-16', { meal: chilli, mealAt: NOW - 5 }, U1, NOW);
    expect(applyPlanWrite(existing, '2026-11-16', { meal: { title: 'Soup' }, mealAt: NOW - 50 }, U2, NOW).result).toBe('noop');
    expect(applyPlanWrite(existing, '2026-11-16', { meal: { title: 'Soup' }, mealAt: NOW - 5 }, U2, NOW).result).toBe('noop');
  });

  it('applies a newer write, moving the update time forward and recording who made it', () => {
    const { day: existing } = applyPlanWrite(undefined, '2026-11-16', { meal: chilli, mealAt: NOW - 5 }, U1, NOW);
    const { result, day } = applyPlanWrite(existing, '2026-11-16', { meal: { title: 'Soup' }, mealAt: NOW }, U2, NOW);
    expect(result).toBe('applied');
    expect(day).toMatchObject({ meal: { title: 'Soup' }, updatedBy: U2, fieldTimes: { meal: NOW } });
    expect(day!.updatedAt).toBeGreaterThan(existing!.updatedAt);
  });

  it('clamps a client time far in the future to the server time', () => {
    const { day } = applyPlanWrite(undefined, '2026-11-16', { meal: chilli, mealAt: NOW + 10 * DAY_MS }, U1, NOW);
    expect(day?.fieldTimes.meal).toBe(NOW);
  });

  describe('the marker', () => {
    const marked = () => {
      const { day } = applyPlanWrite(undefined, '2026-11-16', { meal: chilli, mealAt: NOW - 5 }, U1, NOW);
      return { ...day!, addedAt: NOW - 3, addedBy: U2 };
    };

    it('is removed by a different dinner, by different servings and by a clear', () => {
      for (const meal of [{ title: 'Soup' }, { ...chilli, servings: 2 }, null]) {
        const { day } = applyPlanWrite(marked(), '2026-11-16', { meal, mealAt: NOW }, U1, NOW);
        expect(day?.addedAt, JSON.stringify(meal)).toBeUndefined();
        expect(day?.addedBy, JSON.stringify(meal)).toBeUndefined();
      }
    });

    it('stays when the same dinner is set again', () => {
      const { day } = applyPlanWrite(marked(), '2026-11-16', { meal: chilli, mealAt: NOW }, U1, NOW);
      expect(day).toMatchObject({ addedAt: NOW - 3, addedBy: U2 });
    });

    it('stays when an older write loses', () => {
      const { day } = applyPlanWrite(marked(), '2026-11-16', { meal: { title: 'Soup' }, mealAt: NOW - 100 }, U1, NOW);
      expect(day).toBeUndefined();
    });
  });
});

describe('setPlanDay', () => {
  it('sets a day, and a repeat of the same write changes nothing', async () => {
    const mutationId = uuid();
    const first = await set('2026-11-16', chilli, NOW - 100, ctx1, { mutationId });
    const again = await setPlanDay(store, ctx1, '2026-11-16', { meal: { title: 'Soup' }, mealAt: NOW + 1, mutationId }, NOW + 9);
    expect(first.fresh).toBe(true);
    expect(again).toEqual({ fresh: false, result: first.result });
    expect((await raw('2026-11-16')).meal).toEqual(chilli);
  });

  it('never stores an unset attribute', async () => {
    await set('2026-11-16', { title: 'Takeaway' });
    const stored = await raw('2026-11-16');
    for (const name of ['addedAt', 'addedBy']) expect(Object.keys(stored)).not.toContain(name);
    expect(Object.values(stored)).not.toContain(undefined);
    expect(Object.values(stored)).not.toContain(null);
  });

  it('clears a day, and the day can be planned again afterwards', async () => {
    await set('2026-11-16', chilli, NOW - 300);
    await set('2026-11-16', null, NOW - 200);
    const cleared = await raw('2026-11-16');
    expect(Object.keys(cleared)).not.toContain('meal');
    expect(cleared.fieldTimes).toEqual({ meal: NOW - 200 });
    await set('2026-11-16', { title: 'Soup' }, NOW - 100);
    expect((await raw('2026-11-16')).meal).toEqual({ title: 'Soup' });
  });

  it('lets an older write lose to a newer clear', async () => {
    await set('2026-11-16', null, NOW - 100);
    await set('2026-11-16', chilli, NOW - 500, ctx2);
    expect(Object.keys(await raw('2026-11-16'))).not.toContain('meal');
  });

  it('removes the marker when the dinner changes', async () => {
    await set('2026-11-16', chilli, NOW - 300);
    await store.patch(planKey(householdId, '2026-11-16'), { addedAt: NOW - 200, addedBy: U2 });
    await set('2026-11-16', { ...chilli, servings: 2 }, NOW - 100);
    const stored = await raw('2026-11-16');
    expect(Object.keys(stored)).not.toContain('addedAt');
    expect(Object.keys(stored)).not.toContain('addedBy');
  });

  it('accepts a recipe id that matches no recipe', async () => {
    await expect(set('2026-11-16', { recipeId: uuid(), title: 'Mystery', servings: 2 })).resolves.toBeDefined();
  });

  it('refuses a day more than 14 days back or more than 60 days ahead, naming the field', async () => {
    await expect(set('2026-10-30', chilli)).rejects.toMatchObject({ code: 'invalid', status: 400, extra: { field: 'day' } });
    await expect(set('2027-01-14', chilli)).rejects.toMatchObject({ code: 'invalid', status: 400, extra: { field: 'day' } });
  });

  it('accepts the edges of the window: 14 days back and 60 days ahead', async () => {
    await expect(set('2026-10-31', chilli)).resolves.toBeDefined();
    await expect(set('2027-01-13', chilli)).resolves.toBeDefined();
  });

  it('judges the window at the household\'s date, not the server\'s: a day in Auckland has already begun', async () => {
    const auckland = await createHousehold(store, { userId: 'auth0|nz', name: 'NZ', timezone: 'Pacific/Auckland', displayName: 'Kiwi', nowMs: NOW }, vi.fn());
    const ctx = (await loadContext(store, 'auth0|nz'))!;
    expect(auckland.householdId).not.toBe(householdId);
    // 10:00 UTC on 14 November is 23:00 on the 14th in Auckland; two hours later it is the 15th there, so the window has moved a day.
    // In London it is still the 14th, where 31 October is the first day allowed.
    const later = NOW + 2 * 3_600_000;
    await expect(setPlanDay(store, ctx, '2026-10-31', { meal: chilli, mealAt: later - 10, mutationId: uuid(), clientAt: later }, later)).rejects.toBeDefined();
    await expect(setPlanDay(store, ctx, '2026-11-01', { meal: chilli, mealAt: later - 10, mutationId: uuid(), clientAt: later }, later)).resolves.toBeDefined();
    await expect(setPlanDay(store, ctx1, '2026-10-31', { meal: chilli, mealAt: later - 10, mutationId: uuid(), clientAt: later }, later)).resolves.toBeDefined();
  });

  it('accepts a write made offline and replayed after the window moved, because it is judged at the time it was made', async () => {
    const madeAt = NOW - 20 * DAY_MS;
    // 25 October was today when the write was made, but is 20 days back now.
    await expect(set('2026-10-25', chilli, madeAt, ctx1, { clientAt: madeAt })).resolves.toBeDefined();
    await expect(set('2026-10-25', chilli, NOW - 1000, ctx1, {})).rejects.toBeDefined();
  });

  it('sets the expiry to the date plus 60 days', async () => {
    await set('2026-11-16', chilli);
    expect((await raw('2026-11-16')).expiresAt).toBe(Date.UTC(2026, 10, 16) / 1000 + 60 * 86_400);
  });

  it('keeps both people\'s writes in order: the later client time wins on the same day', async () => {
    await set('2026-11-17', { title: 'Curry' }, NOW - 600, ctx1);
    await set('2026-11-17', { title: 'Soup' }, NOW - 300, ctx2);
    expect((await raw('2026-11-17')).meal).toEqual({ title: 'Soup' });
    await set('2026-11-17', { title: 'Late curry' }, NOW - 400, ctx1);
    expect((await raw('2026-11-17')).meal).toEqual({ title: 'Soup' });
  });
});

describe('listPlan', () => {
  it('lists days from `from`, sorted, leaves out earlier days, expired days, and other households\' days', async () => {
    await set('2026-11-18', { title: 'B' });
    await set('2026-11-16', { title: 'A' });
    await set('2026-11-01', { title: 'Early' });
    await store.put({ ...planKey(householdId, '2026-11-20'), meal: { title: 'Expired' }, fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: U1, expiresAt: Math.floor(NOW / 1000) - 10 });
    await createHousehold(store, { userId: 'auth0|x', name: 'Other', timezone: 'UTC', displayName: 'X', nowMs: NOW }, vi.fn());
    await setPlanDay(store, (await loadContext(store, 'auth0|x'))!, '2026-11-17', { meal: { title: 'Theirs' }, mealAt: NOW - 10, mutationId: uuid() }, NOW);

    const { days, serverTime } = await listPlan(store, ctx1, '2026-11-10', NOW);
    expect(days.map(day => day.day)).toEqual(['2026-11-16', '2026-11-18']);
    expect(serverTime).toBe(NOW);
  });

  it('returns cleared days too, so a phone learns of the clear', async () => {
    await set('2026-11-16', { title: 'A' }, NOW - 200);
    await set('2026-11-16', null, NOW - 100);
    const { days } = await listPlan(store, ctx1, '2026-11-10', NOW);
    expect(days).toHaveLength(1);
    expect(days[0].meal).toBeUndefined();
  });
});
