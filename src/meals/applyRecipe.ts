import type { WriteResult } from '../shopping/types';
import { clampTime, THIRTY_DAYS_SECONDS } from '../tasks/record';
import type { MealType, Recipe, RecipeFieldTimes, RecipeWrite } from './types';

const forward = (existing: Recipe | undefined, serverNow: number): number => Math.max(serverNow, (existing?.updatedAt ?? 0) + 1);

const FIELDS: (keyof RecipeFieldTimes)[] = ['title', 'mealType', 'servings', 'minutes', 'lowEnergy', 'nutrition', 'ingredients', 'steps'];

// Writes the fields of `write` onto `recipe` that are newer than what it holds. True when anything changed.
function applyFields(recipe: Recipe, write: RecipeWrite, serverNow: number): boolean {
  let changed = false;
  for (const field of FIELDS) {
    const entry = write[field];
    if (!entry) continue;
    const at = clampTime(entry.at, serverNow);
    if (at <= (recipe.fieldTimes[field] ?? 0)) continue;
    const value = entry.value;
    if (field === 'minutes') {
      if (value === null) delete recipe.minutes;
      else recipe.minutes = value as number;
    } else if (field === 'nutrition') {
      if (value === '') delete recipe.nutrition;
      else recipe.nutrition = value as string;
    } else if (field === 'title') recipe.title = value as string;
    else if (field === 'mealType') recipe.mealType = value as MealType;
    else if (field === 'servings') recipe.servings = value as number;
    else if (field === 'lowEnergy') recipe.lowEnergy = value as boolean;
    else if (field === 'ingredients') recipe.ingredients = [...(value as string[])];
    else recipe.steps = [...(value as string[])];
    recipe.fieldTimes[field] = at;
    changed = true;
  }
  return changed;
}

// What a write does to a recipe. Pure: the caller stores the result. A tombstone is final for edits.
export function applyRecipeWrite(
  existing: Recipe | undefined, id: string, write: RecipeWrite, userId: string, serverNow: number,
): { result: WriteResult; recipe?: Recipe } {
  if (existing?.deletedAt !== undefined) return { result: 'gone' };

  if (!existing) {
    // A create needs its title.
    if (!write.title) return { result: 'noop' };
    const recipe: Recipe = {
      id, title: '', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: {},
      createdBy: userId, updatedAt: serverNow, updatedBy: userId,
    };
    applyFields(recipe, write, serverNow);
    return { result: 'created', recipe };
  }

  const recipe = structuredClone(existing);
  if (!applyFields(recipe, write, serverNow)) return { result: 'noop', recipe: existing };
  recipe.updatedAt = forward(existing, serverNow);
  recipe.updatedBy = userId;
  return { result: 'applied', recipe };
}

export function applyRecipeDelete(existing: Recipe | undefined, userId: string, serverNow: number): { result: WriteResult; recipe?: Recipe } {
  if (!existing || existing.deletedAt !== undefined) return { result: 'noop', recipe: existing };
  const recipe: Recipe = {
    ...structuredClone(existing),
    deletedAt: serverNow,
    deletedBy: userId,
    expiresAt: Math.floor(serverNow / 1000) + THIRTY_DAYS_SECONDS,
    updatedAt: forward(existing, serverNow),
  };
  return { result: 'applied', recipe };
}
