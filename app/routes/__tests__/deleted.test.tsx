import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Task } from '../../../src/tasks/types';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';
import { ME, THEM, TODAY, makeActions, task } from '~/components/tasks/__tests__/fixtures';

const state = vi.hoisted(() => ({
  tasks: { status: 'ready', tasks: [] as Task[], proposals: [], today: '2026-11-13', refetch: vi.fn() },
  items: { status: 'ready', items: [] as object[], refetch: vi.fn() },
  recipes: { status: 'ready', recipes: [] as object[], dataUpdatedAt: 1, refetch: vi.fn() },
  actions: undefined as unknown,
  itemActions: undefined as unknown,
  recipeActions: undefined as unknown,
}));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/queries', () => ({ useTasks: () => state.tasks }));
vi.mock('~/lib/items', () => ({ useItems: () => state.items }));
vi.mock('~/lib/recipes', () => ({ useRecipes: () => state.recipes }));
vi.mock('~/hooks/useRecipeActions', () => ({ useRecipeActions: () => state.recipeActions }));
vi.mock('~/hooks/useTaskActions', () => ({ useTaskActions: () => state.actions }));
vi.mock('~/hooks/useItemActions', () => ({ useItemActions: () => state.itemActions }));

import Deleted, { meta } from '../deleted';

const NOV_12 = Date.parse('2026-11-12T10:00:00Z');
const renderPage = () => render(<MantineProvider env="test"><MemoryRouter><Deleted /></MemoryRouter></MantineProvider>);
const actions = () => state.actions as ReturnType<typeof makeActions>;

beforeEach(() => {
  state.tasks = { status: 'ready', tasks: [], proposals: [], today: TODAY, refetch: vi.fn() };
  state.items = { status: 'ready', items: [], refetch: vi.fn() };
  state.actions = makeActions();
  state.itemActions = { restore: vi.fn() };
  state.recipes = { status: 'ready', recipes: [], dataUpdatedAt: 1, refetch: vi.fn() };
  state.recipeActions = { restore: vi.fn() };
});

describe('the Deleted page: recipes', () => {
  const chilli = { id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', deletedAt: NOV_12, deletedBy: THEM.userId };

  it('lists a Recipes group after Tasks and Shopping, and restores a recipe with one tap', async () => {
    state.tasks.tasks = [task({ title: 'Hoover', deletedAt: NOV_12, deletedBy: ME.userId })];
    state.items.items = [{ id: 'i1', text: 'Milk', ticked: false, fieldTimes: {}, updatedAt: 1, deletedAt: NOV_12, deletedBy: ME.userId }];
    state.recipes.recipes = [chilli, { ...chilli, id: 'r2', title: 'Soup', deletedAt: undefined }];
    renderPage();
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Tasks', 'Shopping', 'Recipes']);
    expect(screen.queryByText('Soup')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore: Chilli' }));
    expect((state.recipeActions as { restore: ReturnType<typeof vi.fn> }).restore).toHaveBeenCalledWith(chilli);
    expect(screen.getByText(/Deleted by Alex, .*12 Nov/)).toBeInTheDocument();
  });

  it('does not say nothing has been deleted when only a recipe is', () => {
    state.recipes.recipes = [chilli];
    renderPage();
    expect(screen.queryByText('Nothing has been deleted.')).not.toBeInTheDocument();
  });

  it('explains how long deleted things stay', () => {
    renderPage();
    expect(screen.getByText('Deleted tasks, shopping items and recipes stay here for 30 days.')).toBeInTheDocument();
  });
});

describe('the Deleted page: shopping', () => {
  it('groups tasks and shopping, and restores an item with one tap', async () => {
    const milk = { id: 'i1', text: 'Milk', ticked: false, fieldTimes: {}, updatedAt: 1, deletedAt: NOV_12, deletedBy: THEM.userId };
    state.tasks.tasks = [task({ title: 'Hoover', deletedAt: NOV_12, deletedBy: ME.userId })];
    state.items.items = [milk];
    renderPage();
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Tasks', 'Shopping']);
    await userEvent.click(screen.getByRole('button', { name: 'Restore: Milk' }));
    expect((state.itemActions as { restore: ReturnType<typeof vi.fn> }).restore).toHaveBeenCalledWith(milk);
    expect(screen.getByText(/Deleted by Alex, .*12 Nov/)).toBeInTheDocument();
  });

  it('shows only the group that has something', () => {
    state.items.items = [{ id: 'i1', text: 'Milk', ticked: false, fieldTimes: {}, updatedAt: 1, deletedAt: NOV_12, deletedBy: ME.userId }];
    renderPage();
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Shopping']);
  });
});

describe('the Deleted page', () => {
  it('is titled Deleted, and says when nothing has been deleted', () => {
    expect(meta({} as never)).toEqual([{ title: 'Deleted – Hearthwise' }]);
    state.tasks.tasks = [task()];
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Deleted' })).toBeInTheDocument();
    expect(screen.getByText('Nothing has been deleted.')).toBeInTheDocument();
  });

  it('lists deleted tasks with who deleted them and when, newest first, and leaves out the rest', () => {
    state.tasks.tasks = [
      task({ title: 'Kept' }),
      task({ title: 'Older', deletedAt: NOV_12 - 86_400_000, deletedBy: THEM.userId }),
      task({ title: 'Newer', deletedAt: NOV_12, deletedBy: ME.userId }),
    ];
    renderPage();
    const items = screen.getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual([expect.stringContaining('Newer'), expect.stringContaining('Older')]);
    expect(screen.getByText(/Deleted by Sam, .*12 Nov/)).toBeInTheDocument();
    expect(screen.getByText(/Deleted by Alex, .*11 Nov/)).toBeInTheDocument();
    expect(screen.queryByText('Kept')).not.toBeInTheDocument();
  });

  it('restores one\'s own task with Restore', async () => {
    const t = task({ title: 'Mine', assignee: ME.userId, deletedAt: NOV_12, deletedBy: ME.userId });
    state.tasks.tasks = [t];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Restore: Mine' }));
    expect(actions().restore).toHaveBeenCalledWith(t);
  });

  it('reads Ask Alex to restore for Alex\'s task', async () => {
    state.actions = makeActions({ needsAsk: vi.fn((action: string) => action === 'restore') });
    const t = task({ title: 'Theirs', assignee: THEM.userId, deletedAt: NOV_12, deletedBy: THEM.userId });
    state.tasks.tasks = [t];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Ask Alex to restore: Theirs' }));
    expect(actions().restore).toHaveBeenCalledWith(t);
  });

  it('has sound headings, no unlabelled controls and no small buttons', async () => {
    state.tasks.tasks = [task({ deletedAt: NOV_12, deletedBy: ME.userId })];
    const { container } = renderPage();
    expectSoundHeadings(container);
    await expectNoViolations(container);
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});
