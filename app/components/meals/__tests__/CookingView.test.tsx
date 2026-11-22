import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { Recipe } from '../../../../src/meals/types';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';

const wake = vi.hoisted(() => vi.fn());
vi.mock('~/lib/wakeLock', () => ({ useWakeLock: wake }));
const show = vi.hoisted(() => vi.fn());
vi.mock('@mantine/notifications', () => ({ notifications: { show, hide: vi.fn() } }));

import { CookingView } from '../CookingView';
import type { CookingViewProps } from '../CookingView';

const ME = 'auth0|me';
const recipe: Recipe = {
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, minutes: 30, lowEnergy: true, nutrition: '450 kcal',
  ingredients: ['200 g flour', '1 onion, diced', 'salt to taste', '1 egg', '2 tbsp oil'], steps: ['Chop the onion', 'Fry it', 'Serve'],
  fieldTimes: {}, createdBy: ME, updatedAt: 1, updatedBy: ME,
};

function renderView(props: Partial<CookingViewProps> = {}) {
  return render(<MantineProvider env="test"><CookingView recipe={recipe} userId={ME} {...props} /></MantineProvider>);
}
const ingredientList = () => screen.getByRole('list', { name: 'Get everything out' });
const stepList = () => screen.getByRole('list', { name: 'Steps' });
const labels = (list: HTMLElement) => within(list).getAllByRole('checkbox').map(box => (box as HTMLInputElement).labels?.[0]?.textContent);

beforeEach(() => { window.localStorage.clear(); wake.mockClear(); });

describe('CookingView', () => {
  it('has two labelled sections, and keeps the screen awake', () => {
    const { container } = renderView();
    expect(screen.getByRole('heading', { level: 1, name: 'Chilli' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Get everything out' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Steps' })).toBeInTheDocument();
    expectSoundHeadings(container);
    expect(wake).toHaveBeenCalled();
  });

  it('shows the minutes, the low-energy mark and the nutrition note', () => {
    renderView();
    expect(screen.getByText('30 min')).toBeInTheDocument();
    expect(screen.getByText('Low energy')).toBeInTheDocument();
    expect(screen.getByText('Nutrition per serving: 450 kcal')).toBeInTheDocument();
  });

  it('shows the ingredients as typed at the recipe\'s own servings, and the steps in order', () => {
    renderView();
    expect(labels(ingredientList())).toEqual(['200 g flour', '1 onion, diced', 'salt to taste', '1 egg', '2 tbsp oil']);
    expect(labels(stepList())).toEqual(['Chop the onion', 'Fry it', 'Serve']);
    expect(screen.queryByText(/Not scaled/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Steps are written for/)).not.toBeInTheDocument();
  });

  it('doubles the amounts when the planned servings are doubled, and says what the steps were written for', () => {
    renderView({ plannedServings: 4 });
    expect(labels(ingredientList())).toEqual(['400 g flour', '2 onion, diced', 'salt to taste Not scaled', '2 egg', '4 tbsp oil']);
    expect(screen.getByText('Steps are written for 2 servings.')).toBeInTheDocument();
  });

  it('rounds to the nearest step: 1 egg at 3 servings of 2 is 1½', () => {
    renderView({ plannedServings: 3 });
    expect(labels(ingredientList())[3]).toBe('1½ egg');
  });

  it('labels a line with no amount "Not scaled" only when the factor is not 1', () => {
    renderView({ plannedServings: 2 });
    expect(screen.queryByText('Not scaled')).not.toBeInTheDocument();
  });

  it('changes the servings with the buttons, and never below 1 or above 50', async () => {
    renderView();
    expect(screen.getByText('2 servings')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
    expect(screen.getByText('3 servings')).toBeInTheDocument();
    expect(labels(ingredientList())[0]).toBe('300 g flour');
    await userEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));
    expect(screen.getByText('1 serving')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fewer servings' })).toBeDisabled();
  });

  it('keeps ticks across a remount, for ingredients and steps', async () => {
    const first = renderView();
    await userEvent.click(within(ingredientList()).getByRole('checkbox', { name: '200 g flour' }));
    await userEvent.click(within(stepList()).getByRole('checkbox', { name: 'Fry it' }));
    first.unmount();
    renderView();
    expect(within(ingredientList()).getByRole('checkbox', { name: '200 g flour' })).toBeChecked();
    expect(within(ingredientList()).getByRole('checkbox', { name: '1 egg' })).not.toBeChecked();
    expect(within(stepList()).getByRole('checkbox', { name: 'Fry it' })).toBeChecked();
  });

  it('prefers the servings chosen today over the planned ones', async () => {
    const first = renderView({ plannedServings: 4 });
    await userEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));
    first.unmount();
    renderView({ plannedServings: 4 });
    expect(screen.getByText('3 servings')).toBeInTheDocument();
  });

  it('start again clears the ticks and puts the servings back to the planned number', async () => {
    renderView({ plannedServings: 4 });
    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
    await userEvent.click(within(stepList()).getByRole('checkbox', { name: 'Serve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(within(stepList()).getByRole('checkbox', { name: 'Serve' })).not.toBeChecked();
    expect(screen.getByText('4 servings')).toBeInTheDocument();
  });

  it('says the ticks were cleared, and Undo puts the ticks and servings back', async () => {
    renderView({ plannedServings: 4 });
    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
    await userEvent.click(within(stepList()).getByRole('checkbox', { name: 'Serve' }));
    show.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(within(stepList()).getByRole('checkbox', { name: 'Serve' })).not.toBeChecked();
    const toast = render(<MantineProvider env="test">{show.mock.calls.at(-1)![0].message}</MantineProvider>);
    expect(toast.getByText('Started again. Your ticks are cleared.')).toBeInTheDocument();
    await userEvent.click(toast.getByRole('button', { name: 'Undo' }));
    expect(within(stepList()).getByRole('checkbox', { name: 'Serve' })).toBeChecked();
    expect(screen.getByText('5 servings')).toBeInTheDocument();
  });

  it('says nothing about undoing when there was nothing to clear', async () => {
    renderView({ plannedServings: 4 });
    show.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(show).not.toHaveBeenCalled();
  });

  it('is read-only when the recipe was deleted, with a Restore button', async () => {
    const onRestore = vi.fn();
    renderView({ readOnly: true, onRestore });
    expect(screen.getByText('This recipe was deleted.')).toBeInTheDocument();
    expect(within(stepList()).getAllByRole('checkbox').every(box => (box as HTMLInputElement).disabled)).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalled();
  });

  it('says so when a recipe has no ingredients or steps yet', () => {
    renderView({ recipe: { ...recipe, ingredients: [], steps: [] } });
    expect(screen.getByText('No ingredients yet.')).toBeInTheDocument();
    expect(screen.getByText('No steps yet.')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderView({ plannedServings: 4 });
    await expectNoViolations(container);
  });
});
