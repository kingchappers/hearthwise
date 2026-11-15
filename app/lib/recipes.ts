import { useMemo } from 'react';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MealType, Recipe, RecipesData } from '../../src/meals/types';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import type { PendingMutation } from './overlay';
import { currentSettledCount } from './queries';
import { applyPendingRecipes } from './recipeOverlay';
import { RECIPES_KEY } from './recipeKeys';

export { RECIPES_KEY };

export interface RecipeFilter {
  search?: string;
  mealType?: MealType;
  lowEnergy?: boolean;
  // The longest a recipe may take. A recipe with no `minutes` never matches a chosen time.
  maxMinutes?: number;
}

// Live recipes that match every filter that is set, in the order given.
export function filterRecipes(recipes: Recipe[], filter: RecipeFilter): Recipe[] {
  const search = filter.search?.trim().toLowerCase() ?? '';
  return recipes.filter(recipe => {
    if (recipe.deletedAt !== undefined) return false;
    if (search !== '' && !recipe.title.toLowerCase().includes(search)) return false;
    if (filter.mealType !== undefined && recipe.mealType !== filter.mealType) return false;
    if (filter.lowEnergy === true && !recipe.lowEnergy) return false;
    if (filter.maxMinutes !== undefined && (recipe.minutes === undefined || recipe.minutes > filter.maxMinutes)) return false;
    return true;
  });
}

export const sortRecipes = (recipes: Recipe[]): Recipe[] => [...recipes].sort((a, b) => a.title.localeCompare(b.title));

// Up to three dinner recipes marked low energy (and within the time, if one is chosen), picked at random. `random` is passed in, so a
// test is deterministic.
export function easyShortlist(recipes: Recipe[], options: { maxMinutes?: number }, random: () => number): Recipe[] {
  const candidates = filterRecipes(recipes, { mealType: 'dinner', lowEnergy: true, ...(options.maxMinutes === undefined ? {} : { maxMinutes: options.maxMinutes }) });
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
  }
  return candidates.slice(0, 3);
}

export interface RecipesState {
  status: 'loading' | 'ready' | 'error';
  recipes: Recipe[];
  dataUpdatedAt: number | undefined;
  refetch: () => void;
}

// The household's recipes as the person sees them: the server's list with every pending write laid over it. Not polled, and never
// treated as fresh: it loads when a screen that shows recipes mounts and whenever the app is brought to the front.
export function useRecipes(): RecipesState {
  const { request } = useProtectedApi();
  const client = useQueryClient();

  const query = useQuery({
    queryKey: RECIPES_KEY,
    queryFn: async (): Promise<RecipesData> => {
      const startedAt = currentSettledCount();
      const fresh = await request('/api/hh/recipes') as RecipesData;
      const previous = client.getQueryData<RecipesData>(RECIPES_KEY);
      // A response that started before a write settled may not include it: keep what is on screen.
      return currentSettledCount() !== startedAt && previous ? previous : fresh;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const pending = useMutationState<PendingMutation>({
    filters: { status: 'pending', mutationKey: ['household'] },
    select: mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables }),
  });
  const data = useMemo(() => (query.data ? applyPendingRecipes(query.data, pending) : undefined), [query.data, pending]);

  return {
    status: data ? 'ready' : query.isError ? 'error' : 'loading',
    recipes: data?.recipes ?? [],
    dataUpdatedAt: query.dataUpdatedAt || undefined,
    refetch: () => { void query.refetch(); },
  };
}
