// The pending recipe mutations shown on top of the server's list. Pure, and it reuses the server's own write rule, so a pending edit
// loses to a newer one on screen exactly as it will on the server.
import { applyRecipeDelete, applyRecipeWrite } from '../../src/meals/applyRecipe';
import type { Recipe, RecipesData, RecipeWrite } from '../../src/meals/types';
import { mealMutationKeys } from './mutations';
import type { MealMutationVars, RecipeMutationKind } from './mutations';
import type { PendingMutation } from './overlay';

type Overlay<K extends RecipeMutationKind> = (data: RecipesData, vars: MealMutationVars[K]) => RecipesData;

const FIELDS = ['title', 'mealType', 'servings', 'minutes', 'lowEnergy', 'nutrition', 'ingredients', 'steps'] as const;

// Each field that is set, with the time of the action.
function toWrite(fields: Partial<Record<(typeof FIELDS)[number], unknown>>, at: number): RecipeWrite {
  const write: Record<string, { value: unknown; at: number }> = {};
  for (const field of FIELDS) if (fields[field] !== undefined) write[field] = { value: fields[field], at };
  return write as RecipeWrite;
}

function changeRecipe(data: RecipesData, id: string, change: (recipe: Recipe) => Recipe | undefined): RecipesData {
  if (!data.recipes.some(recipe => recipe.id === id)) return data;
  return { ...data, recipes: data.recipes.map(recipe => (recipe.id === id ? (change(recipe) ?? recipe) : recipe)) };
}

const OVERLAYS: { [K in RecipeMutationKind]: Overlay<K> } = {
  recipeAdd: (data, v) => {
    if (data.recipes.some(recipe => recipe.id === v.recipe.id)) return data;
    const { recipe: created } = applyRecipeWrite(undefined, v.recipe.id, toWrite(v.recipe, v.at), v.by, v.at);
    return created ? { ...data, recipes: [...data.recipes, created] } : data;
  },
  recipeEdit: (data, v) => changeRecipe(data, v.recipeId, recipe => applyRecipeWrite(recipe, v.recipeId, toWrite(v.changes, v.at), v.by, v.at).recipe),
  recipeDelete: (data, v) => changeRecipe(data, v.recipeId, recipe => applyRecipeDelete(recipe, v.by, v.at).recipe),
  recipeRestore: (data, v) => v.recipeIds.reduce((current, id) => changeRecipe(current, id, recipe => {
    const restored = { ...recipe };
    delete restored.deletedAt;
    delete restored.deletedBy;
    delete restored.expiresAt;
    return restored;
  }), data),
};

function kindOf(mutationKey: readonly unknown[] | undefined): RecipeMutationKind | undefined {
  if (!mutationKey || mutationKey[0] !== 'household') return undefined;
  return (Object.keys(mealMutationKeys) as (RecipeMutationKind | 'planSet')[]).find((kind): kind is RecipeMutationKind => kind !== 'planSet' && kind === mutationKey[1]);
}

export function applyPendingRecipes(data: RecipesData, pending: PendingMutation[]): RecipesData {
  return pending.reduce((current, mutation) => {
    const kind = kindOf(mutation.mutationKey);
    if (!kind || !mutation.variables) return current;
    return (OVERLAYS[kind] as Overlay<RecipeMutationKind>)(current, mutation.variables as MealMutationVars[RecipeMutationKind]);
  }, data);
}
