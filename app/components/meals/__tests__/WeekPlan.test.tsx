import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { PlanDay, Recipe } from '../../../../src/meals/types';
import { expectNoViolations } from '~/test-utils/accessibility';
import { WeekPlan } from '../WeekPlan';

// Saturday 14 November 2026: the week starts on Monday the 9th.
const TODAY = '2026-11-14';
const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});
const planDay = (day: string, meal: PlanDay['meal'], over: Partial<PlanDay> = {}): PlanDay => ({
  day, ...(meal ? { meal } : {}), fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u', expiresAt: 9_999_999_999, ...over,
});

function renderPlan(days: PlanDay[], recipes: Recipe[] | undefined = [recipe()], checkedAt?: number, onOpen = vi.fn()) {
  const view = render(<MantineProvider env="test"><WeekPlan days={days} recipes={recipes} checkedAt={checkedAt} today={TODAY} onOpen={onOpen} /></MantineProvider>);
  return { ...view, onOpen };
}
const row = (name: RegExp | string) => screen.getByRole('button', { name });

describe('WeekPlan', () => {
  it('shows the current week and the next four, Monday to Sunday, under their own headings', () => {
    const { container } = renderPlan([]);
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['This week', 'Next week', 'Week of 23 Nov', 'Week of 30 Nov', 'Week of 7 Dec']);
    expect(screen.getAllByRole('button')).toHaveLength(35);
    expect(screen.getAllByRole('button')[0]).toHaveTextContent('Mon 9 Nov');
    expect(screen.getAllByRole('button')[34]).toHaveTextContent('Sun 13 Dec');
    expect(container.querySelectorAll('h1').length).toBe(0);
  });

  it('says Nothing planned yet for a day with nothing, and marks today, including earlier days of this week', () => {
    renderPlan([]);
    expect(within(row(/Sat 14 Nov/)).getByText('Nothing planned yet')).toBeInTheDocument();
    expect(within(row(/Sat 14 Nov/)).getByText('Today')).toBeInTheDocument();
    expect(within(row(/Mon 9 Nov/)).queryByText('Today')).not.toBeInTheDocument();
    expect(screen.getAllByText('Today')).toHaveLength(1);
  });

  it('shows a recipe dinner by the recipe\'s current title, with its minutes and a low-energy mark', () => {
    renderPlan([planDay('2026-11-16', { recipeId: 'r1', title: 'Old name', servings: 2 })], [recipe({ title: 'New name', minutes: 20, lowEnergy: true })]);
    const monday = row(/Mon 16 Nov/);
    expect(within(monday).getByText('New name')).toBeInTheDocument();
    expect(within(monday).getByText('20 min')).toBeInTheDocument();
    expect(within(monday).getByText('Low energy')).toBeInTheDocument();
  });

  it('shows a plain-name dinner as typed', () => {
    renderPlan([planDay('2026-11-19', { title: 'Takeaway' })]);
    expect(within(row(/Thu 19 Nov/)).getByText('Takeaway')).toBeInTheDocument();
  });

  it('shows a cleared day as nothing planned', () => {
    renderPlan([planDay('2026-11-16', undefined)]);
    expect(within(row(/Mon 16 Nov/)).getByText('Nothing planned yet')).toBeInTheDocument();
  });

  it('says On the list for a day that was added to the shopping list', () => {
    renderPlan([planDay('2026-11-16', { title: 'Takeaway' }, { addedAt: 5, addedBy: 'u' })]);
    expect(within(row(/Mon 16 Nov/)).getByText('On the list')).toBeInTheDocument();
  });

  it('says Checking the recipe… while a recipe is not in the cache, and does not call it gone', () => {
    renderPlan([planDay('2026-11-16', { recipeId: 'zz', title: 'Stored', servings: 2 })], []);
    expect(within(row(/Mon 16 Nov/)).getByText('Checking the recipe…')).toBeInTheDocument();
    expect(within(row(/Mon 16 Nov/)).getByText('Stored')).toBeInTheDocument();
    expect(screen.queryByText('This recipe is gone')).not.toBeInTheDocument();
  });

  it('says This recipe is gone once the check has finished and the recipe is still absent', () => {
    renderPlan([planDay('2026-11-16', { recipeId: 'zz', title: 'Stored', servings: 2 })], [], 123);
    expect(within(row(/Mon 16 Nov/)).getByText('This recipe is gone')).toBeInTheDocument();
    expect(within(row(/Mon 16 Nov/)).getByText('Stored')).toBeInTheDocument();
  });

  it('says This recipe was deleted for a deleted recipe, and keeps the stored name', () => {
    renderPlan([planDay('2026-11-16', { recipeId: 'r1', title: 'Stored', servings: 2 })], [recipe({ deletedAt: 5 })]);
    expect(within(row(/Mon 16 Nov/)).getByText('This recipe was deleted')).toBeInTheDocument();
    expect(within(row(/Mon 16 Nov/)).getByText('Stored')).toBeInTheDocument();
  });

  it('has an Add to shopping list button when it is given a way to open the review, and not otherwise', async () => {
    const first = renderPlan([]);
    expect(screen.queryByRole('button', { name: 'Add to shopping list' })).not.toBeInTheDocument();
    first.unmount();
    const onAddToList = vi.fn();
    render(<MantineProvider env="test"><WeekPlan days={[]} recipes={[]} checkedAt={undefined} today={TODAY} onOpen={vi.fn()} onAddToList={onAddToList} /></MantineProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Add to shopping list' }));
    expect(onAddToList).toHaveBeenCalled();
  });

  it('opens the day that was tapped', async () => {
    const { onOpen } = renderPlan([]);
    await userEvent.click(row(/Tue 17 Nov/));
    expect(onOpen).toHaveBeenCalledWith('2026-11-17');
  });

  it('has sound headings and no accessibility violations', async () => {
    const { container } = renderPlan([planDay('2026-11-16', { title: 'Takeaway' }, { addedAt: 5, addedBy: 'u' })]);
    // The page supplies the h1; here the weeks are h2.
    expect([...container.querySelectorAll('h1, h2, h3')].map(heading => heading.tagName)).toEqual(['H2', 'H2', 'H2', 'H2', 'H2']);
    await expectNoViolations(container);
  });
});
