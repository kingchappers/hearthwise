import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Recipe } from '../../../src/meals/types';

const calls = vi.hoisted(() => [] as { kind: string; vars: Record<string, unknown> }[]);
const show = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@mantine/notifications', () => ({ notifications: { show, hide: vi.fn() } }));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'Europe/London' }, members: [], me: { userId: 'u1', displayName: 'Sam', joinedAt: '', settings: {} } } }),
}));
vi.mock('~/lib/mutations', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/mutations')>()),
  useMealMutation: (kind: string) => ({ mutate: (vars: Record<string, unknown>) => { calls.push({ kind, vars }); } }),
}));

import { useRecipeActions } from '../useRecipeActions';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 4, minutes: 30, lowEnergy: true, nutrition: '400 kcal', ingredients: ['2 onions'], steps: ['Chop'],
  fieldTimes: {}, createdBy: 'u1', updatedAt: 1, updatedBy: 'u1', ...over,
});

const pressUndo = (): void => {
  const message = show.mock.calls.at(-1)![0].message as { props: { onAction: () => void } };
  message.props.onAction();
};

beforeEach(() => {
  calls.length = 0;
  show.mockClear();
  navigate.mockClear();
});

describe('useRecipeActions', () => {
  it('add queues recipeAdd with a mutation id, the time and who made it', () => {
    const { result } = renderHook(() => useRecipeActions());
    result.current.add({ id: 'r9', title: 'Soup' });
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe('recipeAdd');
    expect(calls[0].vars).toMatchObject({ recipe: { id: 'r9', title: 'Soup' }, by: 'u1' });
    expect(calls[0].vars.mutationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[0].vars.at).toBeTypeOf('number');
  });

  it('edit queues recipeEdit with only the changes', () => {
    const { result } = renderHook(() => useRecipeActions());
    result.current.edit(recipe(), { title: 'Chili' });
    expect(calls[0]).toMatchObject({ kind: 'recipeEdit', vars: { recipeId: 'r1', changes: { title: 'Chili' } } });
  });

  it('edit queues nothing when nothing changed', () => {
    const { result } = renderHook(() => useRecipeActions());
    result.current.edit(recipe(), {});
    expect(calls).toEqual([]);
  });

  it('remove queues recipeDelete, goes to the library, and offers Undo which restores', () => {
    const { result } = renderHook(() => useRecipeActions());
    result.current.remove(recipe());
    expect(calls[0]).toMatchObject({ kind: 'recipeDelete', vars: { recipeId: 'r1' } });
    expect(navigate).toHaveBeenCalledWith('/recipes');
    pressUndo();
    expect(calls[1]).toMatchObject({ kind: 'recipeRestore', vars: { recipeIds: ['r1'] } });
  });

  it('restore queues recipeRestore and says so', () => {
    const { result } = renderHook(() => useRecipeActions());
    result.current.restore(recipe());
    expect(calls[0]).toMatchObject({ kind: 'recipeRestore', vars: { recipeIds: ['r1'] } });
    expect(show.mock.calls.at(-1)![0].message).toBe('Restored: Chilli');
  });

  it('duplicate saves a copy at once with a new id, and opens it in the editor', () => {
    const { result } = renderHook(() => useRecipeActions());
    result.current.duplicate(recipe());
    expect(calls[0].kind).toBe('recipeAdd');
    const copy = (calls[0].vars as { recipe: Record<string, unknown> }).recipe;
    expect(copy).toMatchObject({ title: 'Chilli (copy)', mealType: 'dinner', servings: 4, minutes: 30, lowEnergy: true, nutrition: '400 kcal', ingredients: ['2 onions'], steps: ['Chop'] });
    expect(copy.id).not.toBe('r1');
    expect(navigate).toHaveBeenCalledWith(`/recipes/${copy.id}/edit`);
  });

  it('duplicate cuts a long title so the copy stays within 120 characters', () => {
    const { result } = renderHook(() => useRecipeActions());
    result.current.duplicate(recipe({ title: '🍅'.repeat(120) }));
    const title = (calls[0].vars as { recipe: { title: string } }).recipe.title;
    expect(Array.from(title)).toHaveLength(120);
    expect(title.endsWith(' (copy)')).toBe(true);
  });

  it('duplicate leaves out minutes and nutrition a recipe does not have', () => {
    const { result } = renderHook(() => useRecipeActions());
    const bare = recipe();
    delete bare.minutes;
    delete bare.nutrition;
    result.current.duplicate(bare);
    const copy = (calls[0].vars as { recipe: Record<string, unknown> }).recipe;
    expect('minutes' in copy).toBe(false);
    expect('nutrition' in copy).toBe(false);
  });
});
