import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Recipe, RecipesData } from '../../../src/meals/types';

const request = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));

import { lookupState, useRecipeCheck } from '../recipeLookup';
import { useRecipes } from '../recipes';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});

describe('lookupState', () => {
  it('is found for a live recipe, deleted for a deleted one', () => {
    expect(lookupState('r1', [recipe()], undefined)).toBe('found');
    expect(lookupState('r1', [recipe({ deletedAt: 5 })], undefined)).toBe('deleted');
  });

  it('is checking when the id is absent and no check has finished, and gone once one has', () => {
    expect(lookupState('zz', [recipe()], undefined)).toBe('checking');
    expect(lookupState('zz', undefined, undefined)).toBe('checking');
    expect(lookupState('zz', [recipe()], 123)).toBe('gone');
  });

  it('never decides gone from an absent list, even after a check time', () => {
    expect(lookupState('zz', undefined, 123)).toBe('checking');
  });
});

describe('useRecipeCheck', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const served = (recipes: Recipe[]): RecipesData => ({ recipes, serverTime: 1 });

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const useBoth = (missing: (recipes: Recipe[]) => boolean) => {
    const recipes = useRecipes();
    const checkedAt = useRecipeCheck(recipes, recipes.status === 'ready' && missing(recipes.recipes));
    return { recipes, checkedAt };
  };

  it('refetches the recipes once when one is missing, and reports the time of the answer', async () => {
    request.mockResolvedValueOnce(served([])).mockResolvedValueOnce(served([]));
    const { result } = renderHook(() => useBoth(list => !list.some(entry => entry.id === 'r1')), { wrapper });
    await waitFor(() => expect(result.current.checkedAt).toBeTypeOf('number'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not refetch when nothing is missing', async () => {
    request.mockResolvedValue(served([recipe()]));
    const { result } = renderHook(() => useBoth(() => false), { wrapper });
    await waitFor(() => expect(result.current.recipes.status).toBe('ready'));
    expect(result.current.checkedAt).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps saying it has not checked when the refetch fails, such as offline', async () => {
    request.mockResolvedValueOnce(served([])).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useBoth(() => true), { wrapper });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(result.current.checkedAt).toBeUndefined();
  });

  it('asks only once per mount, however many times the list changes', async () => {
    request.mockResolvedValue(served([]));
    const { result } = renderHook(() => useBoth(() => true), { wrapper });
    await waitFor(() => expect(result.current.checkedAt).toBeTypeOf('number'));
    await client.refetchQueries({ queryKey: ['recipes'] });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
