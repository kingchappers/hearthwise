import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { PlanDay, Recipe } from '../../../../src/meals/types';
import { expectNoViolations } from '~/test-utils/accessibility';

vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Tell Alex when I save a change</label> }));

import { DaySheet } from '../DaySheet';

const DAY = '2026-11-18';
const members = [{ userId: 'u1', displayName: 'Sam' }, { userId: 'u2', displayName: 'Alex' }];
const recipe = (id: string, over: Partial<Recipe> = {}): Recipe => ({
  id, title: id, mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});
const plan = (meal: PlanDay['meal'], over: Partial<PlanDay> = {}): PlanDay => ({ day: DAY, ...(meal ? { meal } : {}), fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u2', expiresAt: 9_999_999_999, ...over });

const onSet = vi.fn();
const onClear = vi.fn();
const onClose = vi.fn();

function renderSheet(props: { plan?: PlanDay; recipes?: Recipe[]; checkedAt?: number } = {}) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter>
        <DaySheet
          day={DAY}
          plan={props.plan}
          recipes={props.recipes ?? [recipe('Chilli'), recipe('Curry'), recipe('Porridge', { mealType: 'breakfast' })]}
          checkedAt={props.checkedAt}
          members={members}
          onClose={onClose}
          onSet={onSet}
          onClear={onClear}
        />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => { [onSet, onClear, onClose].forEach(mock => mock.mockClear()); });

describe('DaySheet', () => {
  it('is titled with the day, and offers dinner recipes first, in order of title', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Wed 18 Nov' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter(button => button.getAttribute('aria-label')?.startsWith('Choose: ')).map(button => button.getAttribute('aria-label'))).toEqual(['Choose: Chilli', 'Choose: Curry']);
  });

  it('plans a recipe at its own servings, and closes', async () => {
    renderSheet({ recipes: [recipe('Chilli', { servings: 6 })] });
    await userEvent.click(screen.getByRole('button', { name: 'Choose: Chilli' }));
    expect(onSet).toHaveBeenCalledWith(DAY, { recipeId: 'Chilli', title: 'Chilli', servings: 6 });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the other meal types only after Show all recipes, and can go back to dinners', async () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: 'Choose: Porridge' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all recipes' }));
    expect(screen.getByRole('button', { name: 'Choose: Porridge' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show dinners only' }));
    expect(screen.queryByRole('button', { name: 'Choose: Porridge' })).not.toBeInTheDocument();
  });

  it('plans a plain name with no recipe, and closes', async () => {
    renderSheet();
    await userEvent.type(screen.getByRole('textbox', { name: 'Or type a name, like Takeaway' }), '  Takeaway ');
    await userEvent.click(screen.getByRole('button', { name: 'Use this name' }));
    expect(onSet).toHaveBeenCalledWith(DAY, { title: 'Takeaway' });
    expect(onClose).toHaveBeenCalled();
  });

  it('will not plan an empty name', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Use this name' }));
    expect(onSet).not.toHaveBeenCalled();
  });

  it('says what to do when there are no dinner recipes', () => {
    renderSheet({ recipes: [recipe('Porridge', { mealType: 'breakfast' })] });
    expect(screen.getByText('No dinner recipes yet. Add one in Recipes, or show all recipes.')).toBeInTheDocument();
  });

  it('shows the planned dinner with an Open recipe link at the planned servings', () => {
    renderSheet({ plan: plan({ recipeId: 'Chilli', title: 'Stored', servings: 4 }) });
    expect(screen.getByText('4 servings')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open recipe' })).toHaveAttribute('href', '/recipes/Chilli?servings=4&day=2026-11-18');
  });

  it('changes the servings of a planned recipe, never below 1 or above 50', async () => {
    renderSheet({ plan: plan({ recipeId: 'Chilli', title: 'Chilli', servings: 4 }) });
    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
    expect(onSet).toHaveBeenLastCalledWith(DAY, { recipeId: 'Chilli', title: 'Chilli', servings: 5 });
    await userEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));
    expect(onSet).toHaveBeenLastCalledWith(DAY, { recipeId: 'Chilli', title: 'Chilli', servings: 3 });
  });

  it('stops the servings at 1 and at 50', () => {
    const first = renderSheet({ plan: plan({ recipeId: 'Chilli', title: 'Chilli', servings: 1 }) });
    expect(screen.getByRole('button', { name: 'Fewer servings' })).toBeDisabled();
    first.unmount();
    renderSheet({ plan: plan({ recipeId: 'Chilli', title: 'Chilli', servings: 50 }) });
    expect(screen.getByRole('button', { name: 'More servings' })).toBeDisabled();
  });

  it('has no servings control for a plain-name dinner, and no Open recipe link', () => {
    renderSheet({ plan: plan({ title: 'Takeaway' }) });
    expect(screen.queryByRole('button', { name: 'More servings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open recipe' })).not.toBeInTheDocument();
  });

  it('clears the day, only when there is something to clear', async () => {
    const first = renderSheet({ plan: plan({ title: 'Takeaway' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Clear this day' }));
    expect(onClear).toHaveBeenCalledWith(DAY);
    expect(onClose).toHaveBeenCalled();
    first.unmount();
    renderSheet();
    expect(screen.queryByRole('button', { name: 'Clear this day' })).not.toBeInTheDocument();
  });

  it('says who last changed the day, by name', () => {
    renderSheet({ plan: plan({ title: 'Takeaway' }, { updatedBy: 'u2' }) });
    expect(screen.getByText('Last changed by Alex')).toBeInTheDocument();
  });

  it('says nothing about a change when no one has planned the day', () => {
    renderSheet();
    expect(screen.queryByText(/Last changed by/)).not.toBeInTheDocument();
  });

  it('tells a person, each time it opens for a day on the list, that changing the dinner will not change the list', () => {
    renderSheet({ plan: plan({ title: 'Takeaway' }, { addedAt: 5, addedBy: 'u1' }) });
    expect(screen.getByText("These ingredients are already on your shopping list. Changing the dinner won't change the list.")).toBeInTheDocument();
  });

  it('does not say that for a day that is not on the list', () => {
    renderSheet({ plan: plan({ title: 'Takeaway' }) });
    expect(screen.queryByText(/already on your shopping list/)).not.toBeInTheDocument();
  });

  it('says Checking the recipe… while a recipe is looked for', () => {
    renderSheet({ plan: plan({ recipeId: 'zz', title: 'Stored', servings: 2 }), recipes: [] });
    expect(screen.getByText('Checking the recipe…')).toBeInTheDocument();
  });

  it('has the Let them know tick, and no accessibility violations', async () => {
    renderSheet({ plan: plan({ recipeId: 'Chilli', title: 'Chilli', servings: 2 }) });
    expect(screen.getByText('Tell Alex when I save a change')).toBeInTheDocument();
    await expectNoViolations(document.body);
  });

  it('is closed when there is no day', () => {
    render(<MantineProvider env="test"><MemoryRouter><DaySheet day={undefined} plan={undefined} recipes={[]} checkedAt={undefined} members={members} onClose={onClose} onSet={onSet} onClear={onClear} /></MemoryRouter></MantineProvider>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
