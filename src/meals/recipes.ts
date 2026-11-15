import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { ConditionFailedError } from '../store';
import type { Item as StoreItem, Store, TxOp } from '../store';
import { DAY_MS } from '../tasks/record';
import { TaskError } from '../tasks/types';
import { applyRecipeDelete, applyRecipeWrite } from './applyRecipe';
import { RECIPE_PREFIX, recipeKey } from './keys';
import type { Recipe, RecipesData, RecipeWrite } from './types';

export const RECIPE_LIMIT = 200;
export const DELETED_LISTED = 50;
const MAX_ATTEMPTS = 3;
const THIRTY_DAYS_MS = 30 * DAY_MS;

export function toRecipe(raw: StoreItem): Recipe {
  const recipe: Recipe = {
    id: raw.SK.slice(RECIPE_PREFIX.length),
    title: String(raw.title),
    mealType: raw.mealType === 'breakfast' || raw.mealType === 'lunch' ? raw.mealType : 'dinner',
    servings: typeof raw.servings === 'number' ? raw.servings : 2,
    lowEnergy: raw.lowEnergy === true,
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.map(String) : [],
    steps: Array.isArray(raw.steps) ? raw.steps.map(String) : [],
    fieldTimes: structuredClone((raw.fieldTimes as Recipe['fieldTimes'] | undefined) ?? {}),
    createdBy: String(raw.createdBy ?? ''),
    updatedAt: Number(raw.updatedAt),
    updatedBy: String(raw.updatedBy ?? ''),
  };
  if (typeof raw.minutes === 'number') recipe.minutes = raw.minutes;
  if (typeof raw.nutrition === 'string') recipe.nutrition = raw.nutrition;
  if (typeof raw.deletedAt === 'number') recipe.deletedAt = raw.deletedAt;
  if (typeof raw.deletedBy === 'string') recipe.deletedBy = raw.deletedBy;
  if (typeof raw.expiresAt === 'number') recipe.expiresAt = raw.expiresAt;
  return recipe;
}

// The stored form: the same fields, with the keys, and nothing set to undefined.
function toRecord(householdId: string, recipe: Recipe): StoreItem {
  const { id, ...fields } = recipe;
  const record: StoreItem = { ...recipeKey(householdId, id), ...fields };
  for (const name of Object.keys(record)) if (record[name] === undefined) delete record[name];
  return record;
}

// The update that turns what is stored into `next`: the attributes that changed, and the ones that went away.
function updateFor(householdId: string, existing: StoreItem, next: Recipe): TxOp {
  const after = toRecord(householdId, next);
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(after)) {
    if (name !== 'PK' && name !== 'SK' && JSON.stringify(value) !== JSON.stringify(existing[name])) set[name] = value;
  }
  const remove = Object.keys(existing).filter(name => name !== 'PK' && name !== 'SK' && !(name in after));
  return { update: recipeKey(householdId, next.id), set, remove, ifEquals: { updatedAt: existing.updatedAt }, ifMissing: ['deletedAt'] };
}

const lostRace = (error: unknown, index: number): boolean => error instanceof ConditionFailedError && error.failedIndex === index;

function opsFor(householdId: string, raw: StoreItem | undefined, outcome: { result: string; recipe?: Recipe }): TxOp[] {
  if (outcome.result === 'created' && outcome.recipe) return [{ put: toRecord(householdId, outcome.recipe), ifAbsent: true }];
  if (outcome.result === 'applied' && outcome.recipe && raw) return [updateFor(householdId, raw, outcome.recipe)];
  return [];
}

// Live recipes only: the query reads the sort key and `deletedAt`, so it does not pull every recipe's text.
async function countLive(store: Store, householdId: string): Promise<number> {
  const rows = await store.query(hhPk(householdId), { skPrefix: RECIPE_PREFIX, attributes: ['SK', 'deletedAt'] });
  return rows.filter(row => row.deletedAt === undefined).length;
}

export async function putRecipe(
  store: Store, ctx: HouseholdContext, id: string, input: { write: RecipeWrite; mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ recipe: Recipe }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ recipe: Recipe }>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(recipeKey(householdId, id), { consistent: true });
    const outcome = applyRecipeWrite(raw ? toRecipe(raw) : undefined, id, input.write, ctx.userId, nowMs);
    if (outcome.result === 'gone') throw new TaskError('gone', 410);
    if (!raw && outcome.result === 'noop') throw new TaskError('title_required', 400, { field: 'title' });
    if (!raw && (await countLive(store, householdId)) >= RECIPE_LIMIT) throw new TaskError('recipe_limit', 409);
    const recipe = outcome.recipe ?? toRecipe(raw!);
    const ops = opsFor(householdId, raw, outcome);
    try {
      return await withWriteRecord(store, householdId, input.mutationId, ops, { recipe }, Math.floor(nowMs / 1000));
    } catch (error) {
      if (ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

export async function deleteRecipe(
  store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ recipe: Recipe }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ recipe: Recipe }>(store, householdId, input.mutationId);
  if (replayed) return replayed;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(recipeKey(householdId, id), { consistent: true });
    if (!raw) throw new TaskError('not_found', 404);
    const outcome = applyRecipeDelete(toRecipe(raw), ctx.userId, nowMs);
    const recipe = outcome.recipe ?? toRecipe(raw);
    const ops = opsFor(householdId, raw, outcome);
    try {
      return await withWriteRecord(store, householdId, input.mutationId, ops, { recipe }, Math.floor(nowMs / 1000));
    } catch (error) {
      if (ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

// Every live recipe, and the 50 most recently deleted ones from the last 30 days, in id order.
export async function listRecipes(store: Store, ctx: HouseholdContext, nowMs: number = Date.now()): Promise<RecipesData> {
  const raws = await store.query(hhPk(ctx.householdId), { skPrefix: RECIPE_PREFIX });
  const all = raws.map(toRecipe);
  const live = all.filter(recipe => recipe.deletedAt === undefined);
  const deleted = all
    .filter(recipe => recipe.deletedAt !== undefined && recipe.deletedAt >= nowMs - THIRTY_DAYS_MS)
    .sort((a, b) => b.deletedAt! - a.deletedAt!)
    .slice(0, DELETED_LISTED);
  const recipes = [...live, ...deleted];
  recipes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { recipes, serverTime: nowMs };
}
