import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClientSave } from '@tanstack/react-query-persist-client';
import type { Recipe, RecipesData } from '../../../src/meals/types';

const request = vi.hoisted(() => vi.fn());
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request }) }));

import { CACHE_SCHEMA_VERSION, createUserPersister } from '../persistedCache';
import type { AsyncStorageLike } from '../persistedCache';
import { mealMutationKeys } from '../mutations';
import { noteMutationSettled } from '../queries';
import { RECIPES_KEY } from '../recipeKeys';
import { easyShortlist, filterRecipes, sortRecipes, usePendingRecipeSaves, useRecipes } from '../recipes';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});
const served = (recipes: Recipe[] = [recipe()]): RecipesData => ({ recipes, serverTime: NOW });

describe('filterRecipes', () => {
  const list = [
    recipe({ id: 'a', title: 'Chicken Curry', mealType: 'dinner', minutes: 40 }),
    recipe({ id: 'b', title: 'Porridge', mealType: 'breakfast', minutes: 10, lowEnergy: true }),
    recipe({ id: 'c', title: 'Toast', mealType: 'breakfast', lowEnergy: true }),
    recipe({ id: 'd', title: 'Gone', deletedAt: 5 }),
  ];
  const ids = (found: Recipe[]) => found.map(entry => entry.id);

  it('leaves out deleted recipes and keeps everything else with no filter', () => {
    expect(ids(filterRecipes(list, {}))).toEqual(['a', 'b', 'c']);
  });

  it('searches the title, ignoring case', () => {
    expect(ids(filterRecipes(list, { search: 'CURRY' }))).toEqual(['a']);
    expect(ids(filterRecipes(list, { search: '  por ' }))).toEqual(['b']);
  });

  it('filters by meal type, low energy and a longest time', () => {
    expect(ids(filterRecipes(list, { mealType: 'breakfast' }))).toEqual(['b', 'c']);
    expect(ids(filterRecipes(list, { lowEnergy: true }))).toEqual(['b', 'c']);
    expect(ids(filterRecipes(list, { maxMinutes: 20 }))).toEqual(['b']);
  });

  it('never matches a chosen time for a recipe with no minutes', () => {
    expect(ids(filterRecipes(list, { maxMinutes: 600 }))).toEqual(['a', 'b']);
  });
});

describe('sortRecipes', () => {
  it('sorts by title with localeCompare, without changing the list it was given', () => {
    const list = [recipe({ id: 'a', title: 'soup' }), recipe({ id: 'b', title: 'Apple pie' }), recipe({ id: 'c', title: 'Éclair' })];
    expect(sortRecipes(list).map(entry => entry.title)).toEqual(['Apple pie', 'Éclair', 'soup']);
    expect(list[0].title).toBe('soup');
  });
});

describe('easyShortlist', () => {
  const list = [
    recipe({ id: 'a', title: 'A', lowEnergy: true, minutes: 15 }),
    recipe({ id: 'b', title: 'B', lowEnergy: true, minutes: 30 }),
    recipe({ id: 'c', title: 'C', lowEnergy: true }),
    recipe({ id: 'd', title: 'D', lowEnergy: true, minutes: 10 }),
    recipe({ id: 'e', title: 'E', lowEnergy: false, minutes: 10 }),
    recipe({ id: 'f', title: 'F', lowEnergy: true, mealType: 'lunch', minutes: 10 }),
    recipe({ id: 'g', title: 'G', lowEnergy: true, minutes: 10, deletedAt: 1 }),
  ];
  const first = () => 0;

  it('picks only dinner recipes marked low energy, not deleted, and at most three', () => {
    const picked = easyShortlist(list, {}, first);
    expect(picked).toHaveLength(3);
    expect(picked.every(entry => entry.lowEnergy && entry.mealType === 'dinner' && entry.deletedAt === undefined)).toBe(true);
  });

  it('keeps to the time chosen, and a recipe with no minutes never matches one', () => {
    expect(easyShortlist(list, { maxMinutes: 20 }, first).map(entry => entry.id).sort()).toEqual(['a', 'd']);
  });

  it('shuffles with the random function it is given, so a test is deterministic', () => {
    const one = easyShortlist(list, {}, () => 0).map(entry => entry.id);
    const two = easyShortlist(list, {}, () => 0.999).map(entry => entry.id);
    expect(easyShortlist(list, {}, () => 0).map(entry => entry.id)).toEqual(one);
    expect(one).not.toEqual(two);
  });

  it('returns nothing when no recipe matches', () => {
    expect(easyShortlist([recipe({ lowEnergy: false })], {}, first)).toEqual([]);
  });
});

describe('useRecipes', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset().mockResolvedValue(served());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('loads the recipes', async () => {
    const { result } = renderHook(() => useRecipes(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('/api/hh/recipes');
    expect(result.current.dataUpdatedAt).toBeTypeOf('number');
  });

  it('reports an error when the first load fails', async () => {
    request.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('is never fresh: it asks again each time it is mounted', async () => {
    const first = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    first.unmount();
    renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('keeps a pending edit on screen when a refetch without it comes back', async () => {
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      new MutationObserver(client, { mutationKey: mealMutationKeys.recipeEdit, mutationFn: () => new Promise(() => undefined) })
        .mutate({ mutationId: 'm1', at: NOW, by: 'auth0|me', recipeId: 'r1', changes: { title: 'Chili' } } as never);
    });
    await waitFor(() => expect(result.current.recipes[0].title).toBe('Chili'));
    await act(async () => { await client.refetchQueries({ queryKey: RECIPES_KEY }); });
    expect(result.current.recipes[0].title).toBe('Chili');
  });

  it('discards a response whose request started before a household write settled', async () => {
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let release!: (data: RecipesData) => void;
    request.mockImplementationOnce(() => new Promise<RecipesData>(resolve => { release = resolve; }));
    const refetching = act(async () => { await client.refetchQueries({ queryKey: RECIPES_KEY }); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    noteMutationSettled();
    release(served([]));
    await refetching;
    expect(result.current.recipes).toHaveLength(1);
  });
});

describe('usePendingRecipeSaves', () => {
  it('names the recipes that have an add or an edit waiting, and no others', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => usePendingRecipeSaves(), { wrapper });
    expect([...result.current]).toEqual([]);
    const hang = () => new Promise(() => undefined);
    act(() => {
      new MutationObserver(client, { mutationKey: mealMutationKeys.recipeAdd, mutationFn: hang }).mutate({ mutationId: 'm1', at: 1, by: 'u', recipe: { id: 'new1', title: 'A' } } as never);
      new MutationObserver(client, { mutationKey: mealMutationKeys.recipeEdit, mutationFn: hang }).mutate({ mutationId: 'm2', at: 1, by: 'u', recipeId: 'edit1', changes: {} } as never);
      new MutationObserver(client, { mutationKey: mealMutationKeys.recipeDelete, mutationFn: hang }).mutate({ mutationId: 'm3', at: 1, by: 'u', recipeId: 'del1' } as never);
      new MutationObserver(client, { mutationKey: ['household', 'itemTick'], mutationFn: hang }).mutate({ mutationId: 'm4', at: 1, by: 'u', itemId: 'i1', done: true } as never);
    });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect([...result.current].sort()).toEqual(['edit1', 'new1']);
  });
});

class MemoryStorage implements AsyncStorageLike {
  readonly map = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.map.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.map.set(key, value); }
  async removeItem(key: string): Promise<void> { this.map.delete(key); }
}

describe('saving the persisted cache with 200 typical recipes', () => {
  it('takes a time worth recording, and the saved copy holds every recipe', async () => {
    const typical = (index: number): Recipe => recipe({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      title: `Recipe number ${index} with a fairly long name`,
      minutes: 30,
      nutrition: '450 kcal, 20 g protein, 12 g fat, 55 g carbohydrate per serving',
      ingredients: Array.from({ length: 12 }, (_, i) => `${i + 1} tablespoons of ingredient number ${i} chopped finely`),
      steps: Array.from({ length: 8 }, (_, i) => `Step ${i + 1}: do something that takes a sentence or two to explain properly, then carry on to the next one.`),
    });
    const client = new QueryClient();
    client.setQueryData(RECIPES_KEY, served(Array.from({ length: 200 }, (_, index) => typical(index))));
    const storage = new MemoryStorage();
    const { persister } = createUserPersister('auth0|a', storage);
    const started = performance.now();
    await persistQueryClientSave({ queryClient: client, persister, buster: String(CACHE_SCHEMA_VERSION) });
    const milliseconds = performance.now() - started;
    const saved = [...storage.map.values()][0];
    // Recorded in the pull request. If a save takes over 50 ms on a mid-range phone, the recipes move to their own persisted key.
    console.info(`persisted cache save, 200 typical recipes: ${milliseconds.toFixed(1)} ms for ${(saved.length / 1024).toFixed(0)} KB`);
    expect(saved).toContain('Recipe number 199');
    expect(milliseconds).toBeLessThan(2000);
  });
});
