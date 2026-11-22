import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { PlanDay, PlanMeal, Recipe } from '../../../../src/meals/types';
import type { ShoppingItem } from '../../../../src/shopping/types';
import { expectNoViolations } from '~/test-utils/accessibility';
import { readReview } from '~/lib/reviewState';

vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Tell Alex when I save a change</label> }));

import { AddToListSheet } from '../AddToListSheet';
import type { AddToListSheetProps } from '../AddToListSheet';

const ME = 'auth0|me';
const TODAY = '2026-11-14';
const recipe = (id: string, title: string, ingredients: string[], over: Partial<Recipe> = {}): Recipe => ({
  id, title, mealType: 'dinner', servings: 2, lowEnergy: false, ingredients, steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u', ...over,
});
const chilli = recipe('r1', 'Chilli', ['2 onions', '400 g tomatoes']);
const pasta = recipe('r2', 'Pasta bake', ['1 onion', '400 g tomatoes', 'salt to taste']);
const day = (date: string, meal: PlanMeal | undefined, over: Partial<PlanDay> = {}): PlanDay => ({ day: date, ...(meal ? { meal } : {}), fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u', expiresAt: 9_999_999_999, ...over });
const days = [
  day('2026-11-13', { recipeId: 'r1', title: 'Chilli', servings: 2 }), // yesterday: not listed
  day('2026-11-16', { recipeId: 'r1', title: 'Chilli', servings: 2 }),
  day('2026-11-17', { recipeId: 'r2', title: 'Pasta bake', servings: 2 }),
];
const item = (text: string, over: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: text, text, ticked: false, fieldTimes: {}, updatedAt: 1, ...over });

const onAdd = vi.fn();
const onClose = vi.fn();

function renderSheet(props: Partial<AddToListSheetProps> = {}) {
  return render(
    <MantineProvider env="test">
      <AddToListSheet
        opened
        onClose={onClose}
        onAdd={onAdd}
        userId={ME}
        plan={days}
        today={TODAY}
        recipes={[chilli, pasta]}
        checkedAt={undefined}
        shoppingItems={[]}
        {...props}
      />
    </MantineProvider>,
  );
}
const sheet = () => screen.getByRole('dialog', { name: 'Add to shopping list' });
const lineList = () => within(sheet()).getByRole('list', { name: 'Lines to add' });
const rowIn = (list: HTMLElement, text: RegExp): HTMLElement => {
  const row = within(list).getAllByRole('listitem').find(candidate => text.test(candidate.textContent ?? ''));
  if (!row) throw new Error(`no row matching ${text}`);
  return row;
};
const dayRow = (text: RegExp): HTMLElement => rowIn(within(sheet()).getByRole('list', { name: 'Days' }), text);
const lineRow = (text: string): HTMLElement => {
  const row = within(lineList()).getAllByRole('listitem').find(candidate => candidate.querySelector('[data-line-text]')?.textContent === text);
  if (!row) throw new Error(`no line ${text}`);
  return row;
};
const addButton = () => within(sheet()).getByRole('button', { name: /^Add \d+ lines?$|^Add lines$/ });

beforeEach(() => {
  window.localStorage.clear();
  onAdd.mockClear();
  onClose.mockClear();
});

describe('AddToListSheet: the days', () => {
  it('lists each plan day from today onwards that has a dinner, in date order, with its switch on', () => {
    renderSheet();
    const rows = within(within(sheet()).getByRole('list', { name: 'Days' })).getAllByRole('listitem');
    expect(rows.map(row => row.textContent)).toEqual([expect.stringContaining('Mon 16 Nov'), expect.stringContaining('Tue 17 Nov')]);
    expect(within(dayRow(/Mon 16 Nov/)).getByRole('switch', { name: /Include/ })).toBeChecked();
    expect(within(dayRow(/Tue 17 Nov/)).getByRole('switch', { name: /Include/ })).toBeChecked();
  });

  it('switches a day off, which takes its lines away', async () => {
    renderSheet();
    await userEvent.click(within(dayRow(/Tue 17 Nov/)).getByRole('switch', { name: /Include/ }));
    expect(within(lineList()).queryByText('salt to taste')).not.toBeInTheDocument();
    expect(within(lineList()).getByText(/^onions$/)).toBeInTheDocument();
    expect(addButton()).toHaveTextContent('Add 2 lines');
  });

  it('leaves a day on the list switched off and saying so, and it can be switched on to add it again', async () => {
    renderSheet({ plan: [...days, day('2026-11-18', { recipeId: 'r1', title: 'Chilli', servings: 2 }, { addedAt: 5, addedBy: 'u' })] });
    const row = dayRow(/Wed 18 Nov/);
    expect(within(row).getByText('On the list')).toBeInTheDocument();
    expect(within(row).getByRole('switch', { name: /Include/ })).not.toBeChecked();
    await userEvent.click(within(row).getByRole('switch', { name: /Include/ }));
    expect(within(row).getByRole('switch', { name: /Include/ })).toBeChecked();
  });

  it('switches off a day with no usable recipe and says so: a plain name, a deleted recipe, a recipe that is gone', () => {
    renderSheet({
      plan: [
        day('2026-11-16', { title: 'Takeaway' }),
        day('2026-11-17', { recipeId: 'r3', title: 'Old', servings: 2 }),
        day('2026-11-18', { recipeId: 'zz', title: 'Lost', servings: 2 }),
      ],
      recipes: [recipe('r3', 'Old', ['1 egg'], { deletedAt: 5 })],
      checkedAt: 123,
    });
    for (const row of ['Mon 16 Nov', 'Tue 17 Nov', 'Wed 18 Nov']) {
      expect(within(dayRow(new RegExp(row))).getByText('No recipe')).toBeInTheDocument();
      expect(within(dayRow(new RegExp(row))).getByRole('switch', { name: /Include/ })).toBeDisabled();
    }
    expect(screen.getByText('Nothing needs adding.')).toBeInTheDocument();
  });

  it('cannot include a day whose recipe is being checked, and says Checking the recipe…', () => {
    renderSheet({ plan: [day('2026-11-16', { recipeId: 'zz', title: 'Lost', servings: 2 })], recipes: [] });
    const row = dayRow(/Mon 16 Nov/);
    expect(within(row).getByText('Checking the recipe…')).toBeInTheDocument();
    expect(within(row).getByRole('switch', { name: /Include/ })).toBeDisabled();
  });
});

describe('AddToListSheet: the lines', () => {
  it('merges what is the same across the days, with how it was made and which recipes it is for', () => {
    renderSheet();
    const onions = lineRow('onions');
    expect(within(onions).getByText('3')).toBeInTheDocument();
    expect(within(onions).getByText('2 + 1 from Chilli, Pasta bake')).toBeInTheDocument();
    const tomatoes = lineRow('tomatoes');
    expect(within(tomatoes).getByText('800 g')).toBeInTheDocument();
    expect(within(tomatoes).getByText('400 g + 400 g from Chilli, Pasta bake')).toBeInTheDocument();
    expect(addButton()).toHaveTextContent('Add 3 lines');
  });

  it('scales by the servings planned on the day', () => {
    renderSheet({ plan: [day('2026-11-16', { recipeId: 'r1', title: 'Chilli', servings: 4 })] });
    const onions = lineRow('onions');
    expect(within(onions).getByText('4')).toBeInTheDocument();
  });

  it('marks a line with no amount "Not scaled" when the servings are not the recipe\'s own', () => {
    renderSheet({ plan: [day('2026-11-17', { recipeId: 'r2', title: 'Pasta bake', servings: 4 })] });
    const salt = lineRow('salt to taste');
    expect(within(salt).getByText('Not scaled')).toBeInTheDocument();
  });

  it('hints, and changes nothing, when an open shopping line has the same name: Onions matches onions', () => {
    renderSheet({ shoppingItems: [item('Onions'), item('2 tomatoes', { ticked: true }), item('Milk', { deletedAt: 5 })] });
    expect(screen.getByText('You already have onions on the list')).toBeInTheDocument();
    expect(screen.getAllByText(/You already have/)).toHaveLength(1);
    expect(addButton()).toHaveTextContent('Add 3 lines');
  });

  it('strikes a line through and says Not adding when I have this is pressed, and undoes it when pressed again', async () => {
    renderSheet();
    const onions = lineRow('onions');
    await userEvent.click(within(onions).getByRole('button', { name: 'I have this: onions' }));
    expect(within(onions).getByText('Not adding')).toBeInTheDocument();
    expect(addButton()).toHaveTextContent('Add 2 lines');
    await userEvent.click(within(onions).getByRole('button', { name: 'I have this: onions' }));
    expect(within(onions).queryByText('Not adding')).not.toBeInTheDocument();
    expect(addButton()).toHaveTextContent('Add 3 lines');
  });

  it('turns the Add button off and says nothing needs adding when every line is marked', async () => {
    renderSheet();
    for (const button of within(lineList()).getAllByRole('button', { name: /^I have this:/ })) await userEvent.click(button);
    expect(screen.getByText('Nothing needs adding.')).toBeInTheDocument();
    // With nothing to add there is no "Add 0 lines" button to look at; only Cancel is left.
    expect(screen.queryByRole('button', { name: /^Add \d+ lines?$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('turns Add off above 100 lines with a message, and on again as lines are marked I have this', async () => {
    const big = [1, 2, 3, 4].map(number => recipe(`b${number}`, `Big ${number}`, Array.from({ length: 30 }, (_, index) => `1 item${number}x${index}`)));
    const plan = big.map((entry, index) => day(`2026-11-${16 + index}`, { recipeId: entry.id, title: entry.title, servings: 2 }));
    renderSheet({ plan, recipes: big });
    expect(screen.getByText("That's a lot for one go. Add some days now and the rest after.")).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    const buttons = within(lineList()).getAllByRole('button', { name: /^I have this:/ });
    for (const button of buttons.slice(0, 20)) await userEvent.click(button);
    expect(addButton()).toHaveTextContent('Add 100 lines');
    expect(addButton()).toBeEnabled();
    expect(screen.queryByText(/That's a lot for one go/)).not.toBeInTheDocument();
  });

  it('shows a day switched off as fewer lines, which can also bring the count under 100', async () => {
    const big = [1, 2, 3, 4].map(number => recipe(`b${number}`, `Big ${number}`, Array.from({ length: 30 }, (_, index) => `1 item${number}x${index}`)));
    const plan = big.map((entry, index) => day(`2026-11-${16 + index}`, { recipeId: entry.id, title: entry.title, servings: 2 }));
    renderSheet({ plan, recipes: big });
    await userEvent.click(within(dayRow(/Mon 16 Nov/)).getByRole('switch', { name: /Include/ }));
    expect(addButton()).toHaveTextContent('Add 90 lines');
    expect(addButton()).toBeEnabled();
  });
});

describe('AddToListSheet: adding', () => {
  it('sends the days and the lines not marked, with one mutation id and one id for each line, and then closes and forgets', async () => {
    renderSheet({ shoppingItems: [item('onions')] });
    const salt = lineRow('salt to taste');
    await userEvent.click(within(salt).getByRole('button', { name: 'I have this: salt to taste' }));
    await userEvent.click(addButton());

    expect(onAdd).toHaveBeenCalledTimes(1);
    const input = onAdd.mock.calls[0][0];
    expect(input.mutationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(input.days).toEqual([
      { day: '2026-11-16', title: 'Chilli', recipeId: 'r1', servings: 2 },
      { day: '2026-11-17', title: 'Pasta bake', recipeId: 'r2', servings: 2 },
    ]);
    expect(input.lines).toEqual([
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), text: 'onions', quantity: '3', forRecipes: 'Chilli, Pasta bake' },
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), text: 'tomatoes', quantity: '800 g', forRecipes: 'Chilli, Pasta bake' },
    ]);
    expect(new Set(input.lines.map((entry: { id: string }) => entry.id)).size).toBe(2);
    expect(onClose).toHaveBeenCalled();
    expect(readReview(ME)).toBeUndefined();
  });

  it('sends the days as the client saw them, with the stored title and not the recipe\'s current one', async () => {
    renderSheet({ plan: [day('2026-11-16', { recipeId: 'r1', title: 'Old name', servings: 2 })] });
    await userEvent.click(addButton());
    expect(onAdd.mock.calls[0][0].days[0].title).toBe('Old name');
  });

  it('sends only the days that are included and usable', async () => {
    renderSheet({ plan: [...days, day('2026-11-18', { title: 'Takeaway' })] });
    await userEvent.click(within(dayRow(/Tue 17 Nov/)).getByRole('switch', { name: /Include/ }));
    await userEvent.click(addButton());
    expect(onAdd.mock.calls[0][0].days.map((entry: { day: string }) => entry.day)).toEqual(['2026-11-16']);
  });

  it('sends the lines once for a double tap', async () => {
    renderSheet();
    await userEvent.dblClick(addButton());
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('keeps a line\'s id when its day is switched off and on again', async () => {
    renderSheet();
    const before = readReview(ME)!.ids;
    expect(Object.keys(before)).toHaveLength(3);
    const toggle = within(dayRow(/Tue 17 Nov/)).getByRole('switch', { name: /Include/ });
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    await userEvent.click(addButton());
    expect(onAdd.mock.calls[0][0].lines.map((entry: { id: string }) => entry.id).sort()).toEqual(Object.values(before).sort());
  });

  it('Cancel writes nothing, forgets the state and closes', async () => {
    renderSheet();
    await userEvent.click(within(dayRow(/Tue 17 Nov/)).getByRole('switch', { name: /Include/ }));
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Cancel' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(readReview(ME)).toBeUndefined();
  });
});

describe('AddToListSheet: interruptions', () => {
  it('keeps its state across a remount: the days switched off, the lines marked, and the ids', async () => {
    const first = renderSheet();
    await userEvent.click(within(dayRow(/Tue 17 Nov/)).getByRole('switch', { name: /Include/ }));
    const onions = lineRow('onions');
    await userEvent.click(within(onions).getByRole('button', { name: 'I have this: onions' }));
    const saved = readReview(ME);
    first.unmount();

    renderSheet();
    expect(within(dayRow(/Tue 17 Nov/)).getByRole('switch', { name: /Include/ })).not.toBeChecked();
    expect(within(lineList()).getByText('Not adding')).toBeInTheDocument();
    expect(readReview(ME)?.mutationId).toBe(saved?.mutationId);
    await userEvent.click(within(lineList()).getByRole('button', { name: 'I have this: onions' }));
    await userEvent.click(addButton());
    expect(onAdd.mock.calls[0][0].mutationId).toBe(saved?.mutationId);
  });

  it('ignores a state saved more than an hour ago', () => {
    window.localStorage.setItem(`hearthwise.review.${ME}`, JSON.stringify({ savedAt: Date.now() - 2 * 3_600_000, included: { '2026-11-17': false }, have: [], mutationId: 'old', ids: {} }));
    renderSheet();
    expect(within(dayRow(/Tue 17 Nov/)).getByRole('switch', { name: /Include/ })).toBeChecked();
  });
});

describe('AddToListSheet: the sheet', () => {
  it('has the Let them know tick, and no accessibility violations', async () => {
    renderSheet({ shoppingItems: [item('Onions')] });
    expect(screen.getByText('Tell Alex when I save a change')).toBeInTheDocument();
    await expectNoViolations(document.body);
  });

  it('says there is nothing to add when no day has a dinner', () => {
    renderSheet({ plan: [] });
    expect(screen.getByText('There are no dinners planned from today on.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add \d+ lines?$|^Add lines$/ })).not.toBeInTheDocument();
  });
});
