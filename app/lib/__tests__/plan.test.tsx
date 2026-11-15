import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlanData, PlanDay, Recipe, RecipesData } from '../../../src/meals/types';

const request = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));
vi.mock('~/lib/household', () => ({ useHousehold: () => ({ status: 'ready', data: { household: { timezone: 'Europe/London' }, members: [], me: { userId: 'auth0|me' } } }) }));

import { mealMutationKeys } from '../mutations';
import { displayTitle, PLAN_KEY, recipeState, usePlan, weekDays } from '../plan';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});
const planDay = (over: Partial<PlanDay> = {}): PlanDay => ({
  day: '2026-11-16', meal: { recipeId: 'r1', title: 'Old name', servings: 2 }, fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u', expiresAt: 9_999_999_999, ...over,
});

describe('weekDays', () => {
  it('lists consecutive days from the start', () => {
    expect(weekDays('2026-11-16', 3)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(weekDays('2026-12-30', 3)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('is 35 days for five weeks, starting on a Monday', () => {
    const days = weekDays('2026-11-09', 35);
    expect(days).toHaveLength(35);
    expect(days[34]).toBe('2026-12-13');
  });
});

describe('displayTitle', () => {
  it('is the recipe\'s current title while it exists and is not deleted', () => {
    expect(displayTitle(planDay(), [recipe({ title: 'New name' })])).toBe('New name');
  });

  it('is the copy stored on the day once the recipe is deleted or gone, or while the list has not loaded', () => {
    expect(displayTitle(planDay(), [recipe({ deletedAt: 5 })])).toBe('Old name');
    expect(displayTitle(planDay(), [])).toBe('Old name');
    expect(displayTitle(planDay(), undefined)).toBe('Old name');
  });

  it('is the typed name for a plain-name dinner, and undefined for an empty day', () => {
    expect(displayTitle(planDay({ meal: { title: 'Takeaway' } }), [recipe()])).toBe('Takeaway');
    const empty = planDay();
    delete empty.meal;
    expect(displayTitle(empty, [recipe()])).toBeUndefined();
  });
});

describe('recipeState', () => {
  it('is found for a live recipe, deleted for a deleted one', () => {
    expect(recipeState(planDay(), [recipe()], undefined)).toBe('found');
    expect(recipeState(planDay(), [recipe({ deletedAt: 5 })], undefined)).toBe('deleted');
  });

  it('is checking when the recipe is absent and no refetch has finished, and gone when one has', () => {
    expect(recipeState(planDay(), [], undefined)).toBe('checking');
    expect(recipeState(planDay(), undefined, undefined)).toBe('checking');
    expect(recipeState(planDay(), [], 123)).toBe('gone');
  });

  it('is undefined for a plain-name dinner and for a cleared day: there is no recipe to look for', () => {
    expect(recipeState(planDay({ meal: { title: 'Takeaway' } }), [], undefined)).toBeUndefined();
    const empty = planDay();
    delete empty.meal;
    expect(recipeState(empty, [], undefined)).toBeUndefined();
  });
});

describe('usePlan', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const servedPlan = (days: PlanDay[]): PlanData => ({ days, serverTime: NOW });
  const servedRecipes = (recipes: Recipe[]): RecipesData => ({ recipes, serverTime: NOW });
  let plan: PlanData;
  let recipes: RecipesData;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    plan = servedPlan([planDay()]);
    recipes = servedRecipes([recipe()]);
    // Each answer arrives a moment later, so a fetch that finishes after the hook mounted has a later time than the mount.
    request.mockReset().mockImplementation(async (path: string) => {
      vi.setSystemTime(Date.now() + 10);
      return path.startsWith('/api/hh/plan') ? plan : recipes;
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('loads the plan, and says what today is in the household\'s zone', async () => {
    const { result } = renderHook(() => usePlan(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.days).toHaveLength(1);
    expect(result.current.today).toBe('2026-11-14');
    expect(request).toHaveBeenCalledWith('/api/hh/plan');
  });

  it('keeps a pending set on screen when a refetch without it comes back', async () => {
    const { result } = renderHook(() => usePlan(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      new MutationObserver(client, { mutationKey: mealMutationKeys.planSet, mutationFn: () => new Promise(() => undefined) })
        .mutate({ mutationId: 'm1', at: NOW, by: 'auth0|me', day: '2026-11-17', meal: { title: 'Soup' } } as never);
    });
    await waitFor(() => expect(result.current.days.map(day => day.day)).toEqual(['2026-11-16', '2026-11-17']));
    await act(async () => { await client.refetchQueries({ queryKey: PLAN_KEY }); });
    expect(result.current.days.map(day => day.day)).toEqual(['2026-11-16', '2026-11-17']);
  });

  it('does not refetch the recipes when every recipe a day points at is already there', async () => {
    const { result } = renderHook(() => usePlan(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/hh/recipes'));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(request.mock.calls.filter(([path]) => path === '/api/hh/recipes')).toHaveLength(1);
  });

  it('refetches the recipes once when a day\'s recipe is missing, then lets the screen say it is gone', async () => {
    recipes = servedRecipes([]);
    const { result } = renderHook(() => usePlan(), { wrapper });
    await waitFor(() => expect(request.mock.calls.filter(([path]) => path === '/api/hh/recipes')).toHaveLength(2));
    await waitFor(() => expect(result.current.recipesCheckedAt).toBeTypeOf('number'));
    expect(recipeState(result.current.days[0], result.current.recipes, result.current.recipesCheckedAt)).toBe('gone');
  });

  it('keeps saying checking when the refetch fails, such as offline', async () => {
    recipes = servedRecipes([]);
    let calls = 0;
    request.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/hh/plan')) return plan;
      calls += 1;
      if (calls > 1) throw new TypeError('Failed to fetch');
      // The first answer predates the phone arriving at this screen, as a restored cache does.
      vi.setSystemTime(NOW - 5000);
      return recipes;
    });
    const { result } = renderHook(() => usePlan(), { wrapper });
    await waitFor(() => expect(calls).toBe(2));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(result.current.recipesCheckedAt).toBeUndefined();
  });
});
