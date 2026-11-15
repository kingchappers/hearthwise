import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';

const state = vi.hoisted(() => ({
  plan: { status: 'ready', days: [] as object[], today: '2026-11-14', recipes: [] as object[] | undefined, recipesCheckedAt: undefined as number | undefined, refetch: vi.fn() },
  actions: { set: vi.fn(), clear: vi.fn() },
}));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/plan', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/plan')>()), usePlan: () => state.plan }));
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
