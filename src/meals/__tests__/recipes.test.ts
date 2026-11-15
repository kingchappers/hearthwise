import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { recipeKey } from '../keys';
import { deleteRecipe, listRecipes, putRecipe, RECIPE_LIMIT } from '../recipes';
import { applyRecipeDelete, applyRecipeWrite } from '../applyRecipe';
import type { RecipeWrite } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
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

const put = (id: string, write: RecipeWrite, who = ctx1, now = NOW, mutationId = uuid()) => putRecipe(store, who, id, { write, mutationId }, now);
const create = async (title = 'Chilli', at = NOW - 5000, extra: RecipeWrite = {}, who = ctx1) => {
  const id = uuid();
  const { result } = await put(id, { title: { value: title, at }, ...extra }, who);
  return result.recipe;
};
const raw = async (id: string) => (await store.get(recipeKey(householdId, id)))!;

describe('applyRecipeWrite', () => {
  it('does nothing for a create with no title', () => {
    expect(applyRecipeWrite(undefined, 'r', { steps: { value: ['x'], at: 1 } }, U1, NOW).result).toBe('noop');
  });

  it('answers gone for a deleted recipe', () => {
    const { recipe } = applyRecipeWrite(undefined, 'r', { title: { value: 'A', at: 1 } }, U1, NOW);
    const deleted = applyRecipeDelete(recipe, U1, NOW).recipe!;
    expect(applyRecipeWrite(deleted, 'r', { title: { value: 'B', at: 99 } }, U1, NOW).result).toBe('gone');
  });

  it('clamps a client time far in the future to the server time', () => {
    const { recipe } = applyRecipeWrite(undefined, 'r', { title: { value: 'A', at: NOW + 10 * DAY } }, U1, NOW);
    expect(recipe?.fieldTimes.title).toBe(NOW);
  });
});

describe('putRecipe', () => {
  it('creates a recipe with the defaults', async () => {
    const recipe = await create('Chilli', NOW - 100);
    expect(recipe).toMatchObject({
      title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], createdBy: U1, updatedBy: U1, fieldTimes: { title: NOW - 100 },
    });
    expect(recipe.minutes).toBeUndefined();
    expect(recipe.nutrition).toBeUndefined();
  });

  it('never stores an unset attribute', async () => {
    const recipe = await create();
    const stored = await raw(recipe.id);
    expect(Object.keys(stored)).not.toContain('minutes');
    expect(Object.values(stored)).not.toContain(undefined);
    expect(Object.values(stored)).not.toContain(null);
  });

  it('refuses a create with no title', async () => {
    await expect(put(uuid(), { steps: { value: ['x'], at: NOW } })).rejects.toMatchObject({ code: 'title_required', status: 400 });
  });

  it('answers a repeat of the same write from its record and changes nothing', async () => {
    const id = uuid();
    const mutationId = uuid();
    const write: RecipeWrite = { title: { value: 'Soup', at: NOW - 10 } };
    const first = await put(id, write, ctx1, NOW, mutationId);
    const again = await put(id, { title: { value: 'Other', at: NOW + 1 } }, ctx1, NOW + 9, mutationId);
    expect(first.fresh).toBe(true);
    expect(again).toEqual({ fresh: false, result: first.result });
  });

  it('lets an older field time lose and a newer one win', async () => {
    const recipe = await create('Chilli', NOW - 1000);
    await put(recipe.id, { title: { value: 'Old', at: NOW - 2000 } }, ctx2);
    expect((await raw(recipe.id)).title).toBe('Chilli');
    await put(recipe.id, { title: { value: 'New', at: NOW - 500 } }, ctx2);
    const stored = await raw(recipe.id);
    expect(stored).toMatchObject({ title: 'New', updatedBy: U2 });
  });

  it('keeps both phones\' edits to different fields', async () => {
    const recipe = await create('Chilli', NOW - 1000);
    await put(recipe.id, { servings: { value: 4, at: NOW - 500 } }, ctx1);
    await put(recipe.id, { lowEnergy: { value: true, at: NOW - 400 } }, ctx2);
    expect(await raw(recipe.id)).toMatchObject({ servings: 4, lowEnergy: true });
  });

  it('leaves the steps alone on a title-only write', async () => {
    const recipe = await create('Chilli', NOW - 1000, { steps: { value: ['Chop', 'Fry'], at: NOW - 1000 } });
    await put(recipe.id, { title: { value: 'Chili', at: NOW - 10 } });
    expect(await raw(recipe.id)).toMatchObject({ title: 'Chili', steps: ['Chop', 'Fry'] });
  });

  it('replaces a list field as a whole', async () => {
    const recipe = await create('Chilli', NOW - 1000, { ingredients: { value: ['1 onion', '2 tins beans'], at: NOW - 1000 } });
    await put(recipe.id, { ingredients: { value: ['3 onions'], at: NOW - 10 } });
    expect((await raw(recipe.id)).ingredients).toEqual(['3 onions']);
  });

  it('clears minutes with null and nutrition with an empty string', async () => {
    const recipe = await create('Chilli', NOW - 1000, { minutes: { value: 20, at: NOW - 1000 }, nutrition: { value: '400 kcal', at: NOW - 1000 } });
    expect(recipe).toMatchObject({ minutes: 20, nutrition: '400 kcal' });
    await put(recipe.id, { minutes: { value: null, at: NOW - 10 }, nutrition: { value: '', at: NOW - 10 } });
    const stored = await raw(recipe.id);
    expect(Object.keys(stored)).not.toContain('minutes');
    expect(Object.keys(stored)).not.toContain('nutrition');
  });

  it('answers 410 for a deleted recipe', async () => {
    const recipe = await create();
    await deleteRecipe(store, ctx1, recipe.id, { mutationId: uuid() }, NOW);
    await expect(put(recipe.id, { title: { value: 'X', at: NOW } })).rejects.toMatchObject({ code: 'gone', status: 410 });
  });

  it('refuses a create at 200 live recipes, and counts live ones only', async () => {
    for (let i = 0; i < RECIPE_LIMIT; i += 1) {
      await store.put({ ...recipeKey(householdId, uuid()), title: `R${i}`, updatedAt: 1, ...(i === 0 ? { deletedAt: 5 } : {}) });
    }
    // One of the 200 is a tombstone, so 199 are live and one more is allowed.
    await expect(put(uuid(), { title: { value: 'Next', at: NOW } })).resolves.toBeDefined();
    await expect(put(uuid(), { title: { value: 'Over', at: NOW } })).rejects.toMatchObject({ code: 'recipe_limit', status: 409 });
  });

  it('still lets an existing recipe be edited at the limit', async () => {
    const recipe = await create();
    for (let i = 0; i < RECIPE_LIMIT; i += 1) await store.put({ ...recipeKey(householdId, uuid()), title: `R${i}`, updatedAt: 1 });
    await expect(put(recipe.id, { servings: { value: 3, at: NOW } })).resolves.toBeDefined();
  });
});

describe('deleteRecipe', () => {
  it('tombstones with a 30-day expiry, and a repeat does nothing', async () => {
    const recipe = await create();
    const { result } = await deleteRecipe(store, ctx2, recipe.id, { mutationId: uuid() }, NOW);
    expect(result.recipe).toMatchObject({ deletedAt: NOW, deletedBy: U2, expiresAt: Math.floor(NOW / 1000) + 30 * 86_400 });
    const again = await deleteRecipe(store, ctx1, recipe.id, { mutationId: uuid() }, NOW + 5000);
    expect(again.result.recipe.deletedAt).toBe(NOW);
  });

  it('answers 404 for a recipe that does not exist', async () => {
    await expect(deleteRecipe(store, ctx1, uuid(), { mutationId: uuid() }, NOW)).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});

describe('listRecipes', () => {
  it('lists live recipes in id order, and leaves out tombstones older than 30 days', async () => {
    const live = await create('Live');
    const recent = await create('Recent');
    const old = await create('Old');
    await deleteRecipe(store, ctx1, recent.id, { mutationId: uuid() }, NOW - 5 * DAY);
    await deleteRecipe(store, ctx1, old.id, { mutationId: uuid() }, NOW - 31 * DAY);
    const { recipes, serverTime } = await listRecipes(store, ctx1, NOW);
    expect(serverTime).toBe(NOW);
    expect(recipes.map(recipe => recipe.id)).toEqual([live.id, recent.id].sort());
  });

  it('keeps only the 50 most recently deleted when more are inside the 30 days', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 53; i += 1) {
      const recipe = await create(`Gone ${i}`);
      ids.push(recipe.id);
      await deleteRecipe(store, ctx1, recipe.id, { mutationId: uuid() }, NOW - 20 * DAY + i * 1000);
    }
    const { recipes } = await listRecipes(store, ctx1, NOW);
    expect(recipes).toHaveLength(50);
    // The three oldest deletions are the ones left out.
    expect(recipes.map(recipe => recipe.id)).not.toContain(ids[0]);
    expect(recipes.map(recipe => recipe.id)).toContain(ids[52]);
  });

  it('does not show another household\'s recipes', async () => {
    await create('Mine');
    const other = await createHousehold(store, { userId: 'auth0|u3', name: 'Other', timezone: 'Europe/London', displayName: 'Zed', nowMs: NOW }, vi.fn());
    const ctx3 = (await loadContext(store, 'auth0|u3'))!;
    expect(other.householdId).not.toBe(householdId);
    expect((await listRecipes(store, ctx3, NOW)).recipes).toEqual([]);
  });
});
