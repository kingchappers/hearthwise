import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Recipe } from '../../../../src/meals/types';
import type { RecipeFilter } from '~/lib/recipes';
import { RecipeFilters } from '../RecipeFilters';
import { RecipeList } from '../RecipeList';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});
const wrap = (ui: React.ReactNode) => <MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider>;

describe('RecipeList', () => {
  it('lists each recipe as a link with its minutes and a low-energy mark', () => {
    render(wrap(<RecipeList recipes={[recipe({ minutes: 20, lowEnergy: true }), recipe({ id: 'r2', title: 'Soup' })]} filtered={false} />));
    const links = screen.getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/recipes/r1', '/recipes/r2']);
    expect(links[0].textContent).toContain('Chilli');
    expect(links[0].textContent).toContain('20 min');
    expect(links[0].textContent).toContain('Low energy');
    expect(links[1].textContent).not.toContain('min');
    expect(links[1].textContent).not.toContain('Low energy');
  });

  it('says what to do when there are no recipes yet', () => {
    render(wrap(<RecipeList recipes={[]} filtered={false} />));
    expect(screen.getByText('No recipes yet.')).toBeInTheDocument();
    expect(screen.getByText('Add the first one with New recipe.')).toBeInTheDocument();
  });

  it('says nothing matches when a filter leaves none', () => {
    render(wrap(<RecipeList recipes={[]} filtered />));
    expect(screen.getByText('No recipes match.')).toBeInTheDocument();
  });

  it('follows the address it is given for a row', () => {
    render(wrap(<RecipeList recipes={[recipe()]} filtered={false} hrefFor={entry => `/recipes/${entry.id}/edit`} />));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/recipes/r1/edit');
  });
});

describe('RecipeFilters', () => {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<RecipeFilter>({});
    return wrap(<RecipeFilters value={value} onChange={next => { onChange(next); setValue(next); }} />);
  }

  it('searches by title, filters by meal type, low energy and time, and each can be cleared', async () => {
    onChange.mockClear();
    render(<Harness />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search recipes' }), 'chi');
    expect(onChange).toHaveBeenLastCalledWith({ search: 'chi' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Meal' }), 'breakfast');
    expect(onChange).toHaveBeenLastCalledWith({ search: 'chi', mealType: 'breakfast' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Low energy' }));
    expect(onChange).toHaveBeenLastCalledWith({ search: 'chi', mealType: 'breakfast', lowEnergy: true });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time' }), '20');
    expect(onChange).toHaveBeenLastCalledWith({ search: 'chi', mealType: 'breakfast', lowEnergy: true, maxMinutes: 20 });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Meal' }), 'all');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Low energy' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time' }), 'any');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Search recipes' }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('offers 10, 20, 30, 45 and 60 minutes', () => {
    render(<Harness />);
    const options = [...screen.getByRole('combobox', { name: 'Time' }).querySelectorAll('option')].map(option => option.textContent);
    expect(options).toEqual(['Any time', 'Up to 10 min', 'Up to 20 min', 'Up to 30 min', 'Up to 45 min', 'Up to 60 min']);
  });
});
