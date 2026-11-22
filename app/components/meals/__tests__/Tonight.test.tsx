import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { PlanDay, Recipe } from '../../../../src/meals/types';
import { expectNoViolations } from '~/test-utils/accessibility';
import { Tonight } from '../Tonight';

const TODAY = '2026-11-14';
const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, minutes: 25, lowEnergy: true, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});
const plan = (meal: PlanDay['meal']): PlanDay => ({ day: TODAY, ...(meal ? { meal } : {}), fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u', expiresAt: 9_999_999_999 });

function renderTonight(day: PlanDay | undefined, recipes: Recipe[] | undefined = [recipe()], checkedAt?: number, onPickEasy = vi.fn()) {
  const view = render(<MantineProvider env="test"><MemoryRouter><Tonight today={TODAY} plan={day} recipes={recipes} checkedAt={checkedAt} onPickEasy={onPickEasy} /></MemoryRouter></MantineProvider>);
  return { ...view, onPickEasy };
}

describe('Tonight', () => {
  it('shows the dinner, its minutes and a low-energy mark, and one tap opens the cooking view at the planned servings', () => {
    renderTonight(plan({ recipeId: 'r1', title: 'Old', servings: 4 }));
    expect(screen.getByRole('heading', { level: 2, name: 'Tonight' })).toBeInTheDocument();
    expect(screen.getByText('Chilli')).toBeInTheDocument();
    expect(screen.getByText('25 min')).toBeInTheDocument();
    expect(screen.getByText('Low energy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Chilli' })).toHaveAttribute('href', '/recipes/r1?servings=4&day=2026-11-14');
  });

  it('shows a plain-name dinner as text, and opens nothing', () => {
    renderTonight(plan({ title: 'Takeaway' }));
    expect(screen.getByText('Takeaway')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says Nothing planned yet with a Choose an easy dinner button when nothing is planned, or the day was cleared', async () => {
    const first = renderTonight(undefined);
    expect(screen.getByText('Nothing planned yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose an easy dinner' }));
    expect(first.onPickEasy).toHaveBeenCalled();
    first.unmount();
    renderTonight(plan(undefined));
    expect(screen.getByText('Nothing planned yet')).toBeInTheDocument();
  });

  it('says Checking the recipe… while a recipe is not in the cache, and keeps the stored name', () => {
    renderTonight(plan({ recipeId: 'zz', title: 'Stored', servings: 2 }), []);
    expect(screen.getByText('Checking the recipe…')).toBeInTheDocument();
    expect(screen.getByText('Stored')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says the recipe is gone, or deleted, and still opens a deleted one', () => {
    const gone = renderTonight(plan({ recipeId: 'zz', title: 'Stored', servings: 2 }), [], 123);
    expect(screen.getByText('This recipe is gone')).toBeInTheDocument();
    gone.unmount();
    renderTonight(plan({ recipeId: 'r1', title: 'Stored', servings: 2 }), [recipe({ deletedAt: 5 })]);
    expect(screen.getByText('This recipe was deleted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Stored' })).toHaveAttribute('href', '/recipes/r1?servings=2&day=2026-11-14');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderTonight(undefined);
    await expectNoViolations(container);
  });
});
