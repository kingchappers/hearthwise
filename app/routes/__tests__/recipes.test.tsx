import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Recipe } from '../../../src/meals/types';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';

const state = vi.hoisted(() => ({
  recipes: { status: 'ready', recipes: [] as object[], dataUpdatedAt: 1, refetch: vi.fn() },
  pending: new Set<string>(),
  checkedAt: undefined as number | undefined,
  actions: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/recipes', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/recipes')>()),
  useRecipes: () => state.recipes,
  usePendingRecipeSaves: () => state.pending,
}));
vi.mock('~/lib/recipeLookup', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/recipeLookup')>()), useRecipeCheck: () => state.checkedAt }));
vi.mock('~/lib/wakeLock', () => ({ useWakeLock: vi.fn() }));
vi.mock('~/hooks/useRecipeActions', () => ({ useRecipeActions: () => state.actions }));
vi.mock('~/lib/household', () => ({ useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'UTC' }, members: [], me: { userId: 'u1', displayName: 'Sam', settings: {} } } }) }));

import Recipes, { meta as recipesMeta } from '../recipes._index';
import NewRecipe, { meta as newMeta } from '../recipes.new';
import EditRecipe, { meta as editMeta } from '../recipes.$id_.edit';
import CookRecipe, { meta as cookMeta } from '../recipes.$id';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: ['2 onions'], steps: ['Chop'], fieldTimes: {}, createdBy: 'u1', updatedAt: 1, updatedBy: 'u1', ...over,
});

function renderAt(path: string) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/recipes/new" element={<NewRecipe />} />
          <Route path="/recipes/:id/edit" element={<EditRecipe />} />
          <Route path="/recipes/:id" element={<CookRecipe />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  state.recipes = { status: 'ready', recipes: [], dataUpdatedAt: 1, refetch: vi.fn() };
  state.pending = new Set();
  state.checkedAt = undefined;
  state.actions = { add: vi.fn(), edit: vi.fn(), remove: vi.fn(), restore: vi.fn(), duplicate: vi.fn() };
});

describe('the Recipes page', () => {
  it('is titled, has one h1, and says what to do when there are no recipes', async () => {
    const { container } = renderAt('/recipes');
    expect(recipesMeta({} as never)).toEqual([{ title: 'Recipes – Hearthwise' }]);
    expect(screen.getByRole('heading', { level: 1, name: 'Recipes' })).toBeInTheDocument();
    expect(screen.getByText('No recipes yet.')).toBeInTheDocument();
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });

  it('shows a loader while loading, and a retry on an error', async () => {
    state.recipes = { ...state.recipes, status: 'loading' };
    const first = renderAt('/recipes');
    expect(screen.getByRole('status', { name: 'Loading recipes' })).toBeInTheDocument();
    first.unmount();
    state.recipes = { ...state.recipes, status: 'error' };
    renderAt('/recipes');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.recipes.refetch).toHaveBeenCalled();
  });

  it('lists live recipes by title, leaves out deleted ones, and filters them', async () => {
    state.recipes.recipes = [recipe({ id: 'b', title: 'Soup' }), recipe({ id: 'a', title: 'Chilli', lowEnergy: true }), recipe({ id: 'c', title: 'Gone', deletedAt: 1 })];
    const { container } = renderAt('/recipes');
    expect(screen.getAllByRole('link').map(link => link.textContent).filter(text => /Chilli|Soup|Gone/.test(text ?? '')).map(text => text?.replace(/Low energy/, ''))).toEqual(['Chilli', 'Soup']);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search recipes' }), 'soup');
    expect(screen.queryByText('Chilli')).not.toBeInTheDocument();
    expect(screen.getByText('Soup')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search recipes' }), 'zzz');
    expect(screen.getByText('No recipes match.')).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it('has a New recipe button that goes to the editor', async () => {
    renderAt('/recipes');
    await userEvent.click(screen.getByRole('link', { name: 'New recipe' }));
    expect(screen.getByRole('heading', { level: 1, name: 'New recipe' })).toBeInTheDocument();
  });
});

describe('the new recipe page', () => {
  it('is titled, has one h1 and no violations', async () => {
    const { container } = renderAt('/recipes/new');
    expect(newMeta({} as never)).toEqual([{ title: 'Recipes – Hearthwise' }]);
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });

  it('adds the recipe and goes back to the library', async () => {
    renderAt('/recipes/new');
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Soup');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.actions.add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Soup' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Recipes' })).toBeInTheDocument();
  });
});

describe('the edit recipe page', () => {
  it('is titled, shows the recipe in the editor, and has no violations', async () => {
    state.recipes.recipes = [recipe()];
    const { container } = renderAt('/recipes/r1/edit');
    expect(editMeta({} as never)).toEqual([{ title: 'Recipes – Hearthwise' }]);
    expect((screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Chilli');
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });

  it('saves only what changed and goes back to the library', async () => {
    state.recipes.recipes = [recipe()];
    renderAt('/recipes/r1/edit');
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.actions.edit).toHaveBeenCalledWith(state.recipes.recipes[0], { title: 'Chilli!' });
    expect(screen.getByRole('heading', { level: 1, name: 'Recipes' })).toBeInTheDocument();
  });

  it('shows a loader while loading', () => {
    state.recipes = { ...state.recipes, status: 'loading' };
    renderAt('/recipes/r1/edit');
    expect(screen.getByRole('status', { name: 'Loading the recipe' })).toBeInTheDocument();
  });

  it('says so when the recipe cannot be found, with a way back', () => {
    renderAt('/recipes/nope/edit');
    expect(screen.getByText("We couldn't find that recipe.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Recipes' })).toHaveAttribute('href', '/recipes');
  });

  it('says a deleted recipe was deleted, and offers Restore', async () => {
    const deleted = recipe({ deletedAt: 5, deletedBy: 'u1' });
    state.recipes.recipes = [deleted];
    renderAt('/recipes/r1/edit');
    expect(screen.getByText('This recipe was deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(state.actions.restore).toHaveBeenCalledWith(deleted);
  });

  it('has its own Delete button, and the Duplicate and Delete menu lives on the recipe page', async () => {
    const live = recipe();
    state.recipes.recipes = [live];
    renderAt('/recipes/r1/edit');
    expect(screen.queryByRole('button', { name: 'Recipe actions' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(state.actions.remove).toHaveBeenCalledWith(live);
  });

  it('does not offer an older draft while its save is still waiting', () => {
    state.recipes.recipes = [recipe()];
    state.pending = new Set(['r1']);
    window.localStorage.setItem('hearthwise.recipeDraft.u1', JSON.stringify({ r1: { recipeId: 'r1', base: {}, fields: {} } }));
    renderAt('/recipes/r1/edit');
    expect(screen.queryByRole('button', { name: 'Continue your draft' })).not.toBeInTheDocument();
  });
});

describe('the recipe page (cooking view)', () => {
  it('is titled, shows the cooking view, and has no violations', async () => {
    state.recipes.recipes = [recipe({ servings: 2, ingredients: ['200 g flour'] })];
    const { container } = renderAt('/recipes/r1');
    expect(cookMeta({} as never)).toEqual([{ title: 'Recipes – Hearthwise' }]);
    expect(screen.getByRole('heading', { level: 1, name: 'Chilli' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Get everything out' })).toBeInTheDocument();
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });

  it('starts at the planned servings from the link, and ignores a servings value that is not a whole number from 1 to 50', () => {
    state.recipes.recipes = [recipe({ servings: 2, ingredients: ['200 g flour'] })];
    const first = renderAt('/recipes/r1?servings=4&day=2026-11-16');
    expect(screen.getByText('4 servings')).toBeInTheDocument();
    expect(screen.getByText('400 g flour')).toBeInTheDocument();
    first.unmount();
    window.localStorage.clear();
    for (const bad of ['0', '51', '2.5', 'abc', '']) {
      const view = renderAt(`/recipes/r1?servings=${bad}`);
      expect(screen.getByText('2 servings')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('has a menu with Edit, Duplicate and Delete', async () => {
    const live = recipe();
    state.recipes.recipes = [live];
    renderAt('/recipes/r1');
    await userEvent.click(screen.getByRole('button', { name: 'Recipe actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toHaveAttribute('href', '/recipes/r1/edit');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(state.actions.duplicate).toHaveBeenCalledWith(live);
    await userEvent.click(screen.getByRole('button', { name: 'Recipe actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(state.actions.remove).toHaveBeenCalledWith(live);
  });

  it('shows a loader while loading, and a retry on an error', async () => {
    state.recipes = { ...state.recipes, status: 'loading' };
    const first = renderAt('/recipes/r1');
    expect(screen.getByRole('status', { name: 'Loading the recipe' })).toBeInTheDocument();
    first.unmount();
    state.recipes = { ...state.recipes, status: 'error' };
    renderAt('/recipes/r1');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.recipes.refetch).toHaveBeenCalled();
  });

  it('says it is checking while a missing recipe is looked for, and never calls it gone before then', () => {
    renderAt('/recipes/nope');
    expect(screen.getByText('Checking the recipe…')).toBeInTheDocument();
    expect(screen.queryByText('This recipe is gone')).not.toBeInTheDocument();
  });

  it('says a recipe is gone once the check has finished and it is still absent, with a link back', () => {
    state.checkedAt = 123;
    renderAt('/recipes/nope');
    expect(screen.getByText('This recipe is gone')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Recipes' })).toHaveAttribute('href', '/recipes');
  });

  it('opens a deleted recipe read-only, and Restore restores it', async () => {
    const deleted = recipe({ deletedAt: 5, deletedBy: 'u1' });
    state.recipes.recipes = [deleted];
    renderAt('/recipes/r1');
    expect(screen.getByText('This recipe was deleted.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(state.actions.restore).toHaveBeenCalledWith(deleted);
    expect(screen.queryByRole('button', { name: 'Recipe actions' })).not.toBeInTheDocument();
  });
});
