import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Recipe } from '../../../../src/meals/types';
import { EasyPicks } from '../EasyPicks';

const recipe = (id: string, over: Partial<Recipe> = {}): Recipe => ({
  id, title: id, mealType: 'dinner', servings: 2, lowEnergy: true, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});
const four = [recipe('Toast', { minutes: 10 }), recipe('Pasta', { minutes: 20 }), recipe('Curry', { minutes: 45 }), recipe('Stew')];

function renderPicks(recipes: Recipe[] = four, random: () => number = () => 0) {
  const onMake = vi.fn();
  const onClose = vi.fn();
  const view = render(<MantineProvider env="test"><MemoryRouter><EasyPicks opened onClose={onClose} recipes={recipes} random={random} onMake={onMake} /></MemoryRouter></MantineProvider>);
  return { ...view, onMake, onClose };
}
const shown = () => screen.getAllByRole('button').filter(button => button.getAttribute('aria-label')?.startsWith('Look at ')).map(button => button.getAttribute('aria-label')?.replace('Look at ', ''));

describe('EasyPicks', () => {
  it('shows three of the four low-energy dinners with no time chosen, and Shuffle picks again from the same four', async () => {
    const calls = { next: 0 };
    renderPicks(four, () => [0, 0.99][calls.next++ % 2]);
    expect(shown()).toHaveLength(3);
    const before = shown();
    await userEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(shown()).toHaveLength(3);
    expect(new Set([...before, ...shown()]).size).toBeLessThanOrEqual(4);
  });

  it('shows only the recipes within the time chosen: up to 20 min leaves two', async () => {
    renderPicks();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time' }), '20');
    expect(shown().sort()).toEqual(['Pasta', 'Toast']);
  });

  it('offers the same times as the recipe filter, and any time', () => {
    renderPicks();
    const options = [...screen.getByRole('combobox', { name: 'Time' }).querySelectorAll('option')].map(option => option.textContent);
    expect(options).toEqual(['Any time', 'Up to 10 min', 'Up to 20 min', 'Up to 30 min', 'Up to 45 min', 'Up to 60 min']);
  });

  it('leaves out recipes that are not dinners, not low energy, or deleted', () => {
    renderPicks([recipe('Lunch', { mealType: 'lunch' }), recipe('Hard', { lowEnergy: false }), recipe('Gone', { deletedAt: 5 }), recipe('Easy')]);
    expect(shown()).toEqual(['Easy']);
  });

  it('shows a recipe inside the same sheet: its title, minutes, low-energy mark, Make this tonight and Open recipe, with a way back', async () => {
    const { onMake, onClose } = renderPicks([recipe('Toast', { minutes: 10 })]);
    await userEvent.click(screen.getByRole('button', { name: 'Look at Toast' }));
    expect(screen.getByRole('heading', { name: 'Toast' })).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
    expect(screen.getByText('Low energy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open recipe' })).toHaveAttribute('href', '/recipes/Toast');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(shown()).toEqual(['Toast']);
    await userEvent.click(screen.getByRole('button', { name: 'Look at Toast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make this tonight' }));
    expect(onMake).toHaveBeenCalledWith(expect.objectContaining({ id: 'Toast' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says what to do when nothing matches', () => {
    renderPicks([recipe('Hard', { lowEnergy: false })]);
    expect(screen.getByText('No easy dinners yet. Mark a recipe as low energy to see it here.')).toBeInTheDocument();
    expect(within(document.body).queryByRole('button', { name: 'Shuffle' })).not.toBeInTheDocument();
  });
});
