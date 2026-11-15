import { describe, expect, it } from 'vitest';
import type { Recipe, RecipesData } from '../../../src/meals/types';
import { mealMutationKeys } from '../mutations';
import type { MealMutationKind } from '../mutations';
import { applyPendingRecipes } from '../recipeOverlay';

const ME = 'auth0|me';
const AT = 1_800_000_000_000;
const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: ['2 onions'], steps: ['Chop'], fieldTimes: { title: 100, steps: 100 },
  createdBy: ME, updatedAt: 100, updatedBy: ME, ...over,
});
const data = (recipes: Recipe[] = [recipe()]): RecipesData => ({ recipes, serverTime: AT });
const pending = (kind: MealMutationKind, variables: Record<string, unknown>) => ({ mutationKey: mealMutationKeys[kind], variables: { mutationId: 'm', at: AT, by: ME, ...variables } });

describe('applyPendingRecipes', () => {
  it('shows a recipe that is waiting to be added, once, with its fields and defaults', () => {
    const result = applyPendingRecipes(data([]), [pending('recipeAdd', { recipe: { id: 'r2', title: 'Soup', servings: 4, steps: ['Stir'] } })]);
    expect(result.recipes).toEqual([expect.objectContaining({ id: 'r2', title: 'Soup', servings: 4, steps: ['Stir'], mealType: 'dinner', lowEnergy: false, ingredients: [], createdBy: ME })]);
    const again = applyPendingRecipes(result, [pending('recipeAdd', { recipe: { id: 'r2', title: 'Other' } })]);
    expect(again.recipes).toHaveLength(1);
    expect(again.recipes[0].title).toBe('Soup');
  });

  it('applies an edit to the fields it names, and clears minutes and nutrition', () => {
    const base = data([recipe({ minutes: 20, nutrition: '400 kcal' })]);
    const result = applyPendingRecipes(base, [pending('recipeEdit', { recipeId: 'r1', changes: { title: 'Chili', minutes: null, nutrition: '' } })]);
    expect(result.recipes[0]).toMatchObject({ title: 'Chili', steps: ['Chop'], updatedBy: ME });
    expect(result.recipes[0].minutes).toBeUndefined();
    expect(result.recipes[0].nutrition).toBeUndefined();
  });

  it('lets a pending edit lose to a newer field time, as the server will decide', () => {
    const base = data([recipe({ fieldTimes: { title: AT + 5000 } })]);
    const result = applyPendingRecipes(base, [pending('recipeEdit', { recipeId: 'r1', changes: { title: 'Old' } })]);
    expect(result.recipes[0].title).toBe('Chilli');
  });

  it('ignores an edit to a recipe that is not there, and to one that is deleted', () => {
    expect(applyPendingRecipes(data([]), [pending('recipeEdit', { recipeId: 'zz', changes: { title: 'x' } })]).recipes).toEqual([]);
    const deleted = data([recipe({ deletedAt: 5 })]);
    expect(applyPendingRecipes(deleted, [pending('recipeEdit', { recipeId: 'r1', changes: { title: 'x' } })]).recipes[0].title).toBe('Chilli');
  });

  it('shows a deleted recipe as deleted, and a restore brings it back', () => {
    const deleted = applyPendingRecipes(data(), [pending('recipeDelete', { recipeId: 'r1' })]);
    expect(deleted.recipes[0]).toMatchObject({ deletedAt: AT, deletedBy: ME });
    const restored = applyPendingRecipes(deleted, [pending('recipeRestore', { recipeIds: ['r1', 'unknown'] })]);
    expect(restored.recipes).toHaveLength(1);
    expect(restored.recipes[0].deletedAt).toBeUndefined();
    expect(restored.recipes[0].deletedBy).toBeUndefined();
    expect(restored.recipes[0].expiresAt).toBeUndefined();
  });

  it('applies pending writes in order', () => {
    const result = applyPendingRecipes(data([]), [
      pending('recipeAdd', { recipe: { id: 'r2', title: 'Soup' }, at: AT }),
      pending('recipeEdit', { recipeId: 'r2', changes: { title: 'Better soup' }, at: AT + 1 }),
    ]);
    expect(result.recipes[0].title).toBe('Better soup');
  });

  it('leaves the data alone for a mutation that is not a recipe one, or has no variables', () => {
    const base = data();
    expect(applyPendingRecipes(base, [{ mutationKey: ['household', 'itemTick'], variables: {} }, { mutationKey: mealMutationKeys.recipeDelete, variables: undefined }])).toBe(base);
  });
});
