import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';

const state = vi.hoisted(() => ({
  plan: { status: 'ready', days: [] as object[], today: '2026-11-14', recipes: [] as object[] | undefined, recipesCheckedAt: undefined as number | undefined, refetch: vi.fn() },
  actions: { set: vi.fn(), clear: vi.fn() },
  items: { status: 'ready', items: [] as object[], refetch: vi.fn() },
  itemActions: { addFromPlan: vi.fn() },
}));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/plan', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/plan')>()), usePlan: () => state.plan }));
vi.mock('~/lib/items', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/items')>()), useItems: () => state.items }));
vi.mock('~/hooks/useItemActions', () => ({ useItemActions: () => state.itemActions }));
vi.mock('~/hooks/usePlanActions', () => ({ usePlanActions: () => state.actions }));
vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Let Alex know</label> }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'UTC' }, members: [{ userId: 'u1', displayName: 'Sam' }, { userId: 'u2', displayName: 'Alex' }], me: { userId: 'u1', displayName: 'Sam', settings: {} } } }),
}));

import Plan, { meta } from '../plan';

const recipe = { id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, minutes: 20, lowEnergy: true, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u' };
const renderPage = () => render(<MantineProvider env="test"><MemoryRouter><Plan /></MemoryRouter></MantineProvider>);

beforeEach(() => {
  state.plan = { status: 'ready', days: [], today: '2026-11-14', recipes: [recipe], recipesCheckedAt: undefined, refetch: vi.fn() };
  state.actions = { set: vi.fn(), clear: vi.fn() };
  state.items = { status: 'ready', items: [], refetch: vi.fn() };
  state.itemActions = { addFromPlan: vi.fn() };
});

describe('the Plan page', () => {
  it('is titled, has one h1 with the weeks beneath it, and no violations', async () => {
    const { container } = renderPage();
    expect(meta({} as never)).toEqual([{ title: 'Plan – Hearthwise' }]);
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5);
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });

  it('shows a loader while loading, and a retry when the plan cannot be loaded', async () => {
    state.plan = { ...state.plan, status: 'loading' };
    const first = renderPage();
    expect(screen.getByRole('status', { name: 'Loading the plan' })).toBeInTheDocument();
    first.unmount();
    state.plan = { ...state.plan, status: 'error' };
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.plan.refetch).toHaveBeenCalled();
  });

  it('opens a day, plans a recipe on it, and the day shows what was planned', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Mon 16 Nov/ }));
    const sheet = screen.getByRole('dialog', { name: 'Mon 16 Nov' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Choose: Chilli' }));
    expect(state.actions.set).toHaveBeenCalledWith('2026-11-16', { recipeId: 'r1', title: 'Chilli', servings: 2 });
  });

  it('types a plain name for a day, and clears a planned one', async () => {
    state.plan.days = [{ day: '2026-11-17', meal: { title: 'Takeaway' }, fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u2', expiresAt: 9_999_999_999 }];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Tue 17 Nov/ }));
    expect(screen.getByText('Last changed by Alex')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear this day' }));
    expect(state.actions.clear).toHaveBeenCalledWith('2026-11-17');
  });

  it('has Pick something easy, which plans a dinner for today', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Pick something easy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Look at Chilli' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make this tonight' }));
    expect(state.actions.set).toHaveBeenCalledWith('2026-11-14', { recipeId: 'r1', title: 'Chilli', servings: 2 });
  });

  it('has the Let them know tick', () => {
    renderPage();
    expect(screen.getByText('Let Alex know')).toBeInTheDocument();
  });
});

describe('the Plan page: adding to the shopping list', () => {
  it('opens the review from the button, shows the planned dinners, and sends the add with the review\'s mutation id', async () => {
    state.plan.recipes = [{ ...recipe, ingredients: ['2 onions', '400 g tomatoes'] }];
    state.plan.days = [{ day: '2026-11-16', meal: { recipeId: 'r1', title: 'Chilli', servings: 2 }, fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u2', expiresAt: 9_999_999_999 }];
    state.items.items = [{ id: 'i1', text: 'Onions', ticked: false, fieldTimes: {}, updatedAt: 1 }];
    window.localStorage.clear();
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Add to shopping list' }));
    const sheet = screen.getByRole('dialog', { name: 'Add to shopping list' });
    expect(within(sheet).getByText('You already have onions on the list')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add 2 lines' }));
    expect(state.itemActions.addFromPlan).toHaveBeenCalledTimes(1);
    const input = (state.itemActions.addFromPlan as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.days).toEqual([{ day: '2026-11-16', title: 'Chilli', recipeId: 'r1', servings: 2 }]);
    expect(input.lines.map((line: { text: string }) => line.text)).toEqual(['onions', 'tomatoes']);
    expect(screen.queryByRole('dialog', { name: 'Add to shopping list' })).not.toBeInTheDocument();
  });

  it('writes nothing when the review is cancelled', async () => {
    state.plan.days = [{ day: '2026-11-16', meal: { recipeId: 'r1', title: 'Chilli', servings: 2 }, fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u2', expiresAt: 9_999_999_999 }];
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Add to shopping list' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Add to shopping list' })).getByRole('button', { name: 'Cancel' }));
    expect(state.itemActions.addFromPlan).not.toHaveBeenCalled();
  });
});
