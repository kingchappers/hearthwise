import { useMemo } from 'react';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanData, PlanDay, Recipe } from '../../src/meals/types';
import { addDays, dayInZone } from '../../src/shared/schedule';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { useHousehold } from './household';
import type { PendingMutation } from './overlay';
import { PLAN_KEY } from './planKeys';
import { applyPendingPlan } from './planOverlay';
import { currentSettledCount } from './queries';
import { lookupState, useRecipeCheck } from './recipeLookup';
import type { LookupState } from './recipeLookup';
import { useRecipes } from './recipes';

export { PLAN_KEY };

const POLL_MS = 10_000;

// `count` consecutive days starting at `start`.
export const weekDays = (start: string, count: number): string[] => Array.from({ length: count }, (_, index) => addDays(start, index));

// The name to show for a day's dinner: the recipe's current title while it exists and is not deleted, otherwise the copy stored on the day.
export function displayTitle(day: PlanDay, recipes: Recipe[] | undefined): string | undefined {
  if (!day.meal) return undefined;
  const live = day.meal.recipeId === undefined ? undefined : recipes?.find(recipe => recipe.id === day.meal?.recipeId && recipe.deletedAt === undefined);
  return live?.title ?? day.meal.title;
}

// Whether a day's recipe is there. A plain-name dinner and an empty day have no recipe to look for. `fetchedAt` is when a refetch made
// for this check finished, or undefined if none has: "gone" is never decided from absence alone.
export function recipeState(day: PlanDay, recipes: Recipe[] | undefined, fetchedAt: number | undefined): LookupState | undefined {
  const recipeId = day.meal?.recipeId;
  return recipeId === undefined ? undefined : lookupState(recipeId, recipes, fetchedAt);
}

export interface PlanState {
  status: 'loading' | 'ready' | 'error';
  days: PlanDay[];
  today: string;
  // The recipes as cached, or undefined while they have never loaded.
  recipes: Recipe[] | undefined;
  // When the check for a recipe that was missing from the cache finished well, or undefined while it has not (loading, or offline).
  recipesCheckedAt: number | undefined;
  refetch: () => void;
}

const DAYS_BACK = 14;

// The household's plan as the person sees it: the server's days with every pending write laid over them, polled like tasks and
// shopping. It also checks, once per mount, for a recipe a day points at that is missing from the cache, so the Plan screen and the
// Tonight card both get the answer.
export function usePlan(): PlanState {
  const { request } = useProtectedApi();
  const client = useQueryClient();
  const household = useHousehold();
  const recipes = useRecipes();
  const timezone = household.data?.household.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayInZone(Date.now(), timezone);

  const query = useQuery({
    queryKey: PLAN_KEY,
    queryFn: async (): Promise<PlanData> => {
      const startedAt = currentSettledCount();
      const fresh = await request('/api/hh/plan') as PlanData;
      const previous = client.getQueryData<PlanData>(PLAN_KEY);
      // A response that started before a write settled may not include it: keep what is on screen.
      return currentSettledCount() !== startedAt && previous ? previous : fresh;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const pending = useMutationState<PendingMutation>({
    filters: { status: 'pending', mutationKey: ['household'] },
    select: mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables }),
  });
  const data = useMemo(() => (query.data ? applyPendingPlan(query.data, pending) : undefined), [query.data, pending]);

  const cached = recipes.status === 'ready' ? recipes.recipes : undefined;
  const missing = cached !== undefined && (data?.days ?? []).some(day => day.meal?.recipeId !== undefined && !cached.some(recipe => recipe.id === day.meal?.recipeId));
  const recipesCheckedAt = useRecipeCheck(recipes, missing);

  return {
    status: data ? 'ready' : query.isError ? 'error' : 'loading',
    days: data?.days ?? [],
    today,
    recipes: cached,
    recipesCheckedAt,
    refetch: () => { void query.refetch(); },
  };
}

// The first day the plan screen asks the server for: 14 days before today.
export const planFrom = (today: string): string => addDays(today, -DAYS_BACK);
