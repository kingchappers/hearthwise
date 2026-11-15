import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { Recipe } from '../../../../src/meals/types';
import { readDraft, saveDraft } from '~/lib/recipeDraft';
import { EMPTY_FIELDS, fieldsFromRecipe } from '~/lib/recipeFields';
import { RecipeForm } from '../RecipeForm';
import type { RecipeFormProps } from '../RecipeForm';

const ME = 'auth0|me';
const recipe: Recipe = {
  id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 4, minutes: 30, lowEnergy: true, nutrition: '400 kcal', ingredients: ['2 onions'], steps: ['Chop'],
  fieldTimes: {}, createdBy: ME, updatedAt: 1, updatedBy: ME,
};

const onAdd = vi.fn();
const onEdit = vi.fn();
const onDone = vi.fn();
const onDelete = vi.fn();

function renderForm(props: Partial<RecipeFormProps> = {}) {
  return render(
    <MantineProvider env="test">
      <RecipeForm userId={ME} pendingIds={new Set()} onAdd={onAdd} onEdit={onEdit} onDone={onDone} {...props} />
    </MantineProvider>,
  );
}
const title = () => screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
const ingredients = () => screen.getByRole('textbox', { name: /Ingredients/ }) as HTMLTextAreaElement;
const steps = () => screen.getByRole('textbox', { name: /Steps/ }) as HTMLTextAreaElement;
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

beforeEach(() => {
  window.localStorage.clear();
  [onAdd, onEdit, onDone, onDelete].forEach(mock => mock.mockClear());
});
afterEach(() => { vi.useRealTimers(); });

describe('a new recipe', () => {
  it('saves with a name only, using the defaults for everything else, and a new id', async () => {
    renderForm();
    await userEvent.type(title(), 'Soup');
    await save();
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/), title: 'Soup', mealType: 'dinner', servings: 2, lowEnergy: false, ingredients: [], steps: [],
    });
    expect(onDone).toHaveBeenCalled();
  });

  it('saves the other fields it was given, and cleans the lines', async () => {
    renderForm();
    await userEvent.type(title(), 'Chilli');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Meal' }), 'lunch');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Servings' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Servings' }), '4');
    await userEvent.type(screen.getByRole('textbox', { name: /Minutes/ }), '25');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Low energy' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Nutrition/ }), '400 kcal');
    await userEvent.type(ingredients(), '  2 onions {Enter}{Enter}1 tin beans');
    await userEvent.type(steps(), 'Chop{Enter}Fry');
    await save();
    expect(onAdd.mock.calls[0][0]).toMatchObject({
      title: 'Chilli', mealType: 'lunch', servings: 4, minutes: 25, lowEnergy: true, nutrition: '400 kcal', ingredients: ['2 onions', '1 tin beans'], steps: ['Chop', 'Fry'],
    });
  });

  it('will not save without a title, and says so', async () => {
    renderForm();
    await save();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('A recipe needs a title.')).toBeInTheDocument();
  });

  it('shows how pasted ingredient lines were read, after removing bullets', () => {
    renderForm();
    const pasted = Array.from({ length: 10 }, (_, index) => `- ${index + 1} onions`).join('\n');
    fireEvent.paste(ingredients(), { clipboardData: { getData: () => pasted } });
    expect(ingredients().value.split('\n')).toHaveLength(10);
    expect(ingredients().value).not.toContain('-');
    expect(screen.getByRole('list', { name: 'How each ingredient was read' }).querySelectorAll('li')).toHaveLength(10);
  });

  it('keeps an ingredient line it cannot read, and still saves', async () => {
    renderForm();
    await userEvent.type(title(), 'Salad');
    await userEvent.type(ingredients(), 'a handful of basil');
    expect(screen.getByText("Kept as typed. It won't be scaled or added up.")).toBeInTheDocument();
    await save();
    expect(onAdd.mock.calls[0][0].ingredients).toEqual(['a handful of basil']);
  });

  it('refuses a paste over the line limit at save, says what to change, and keeps the text', async () => {
    renderForm();
    await userEvent.type(title(), 'Big');
    const pasted = Array.from({ length: 34 }, (_, index) => `item ${index}`).join('\n');
    fireEvent.paste(ingredients(), { clipboardData: { getData: () => pasted } });
    await save();
    expect(onAdd).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getAllByText(/A recipe can hold 30 ingredient lines. This has 34. Remove or combine 4/).length).toBeGreaterThan(0);
    expect(ingredients().value.split('\n')).toHaveLength(34);
  });

  it('checks the servings and the minutes', async () => {
    renderForm();
    await userEvent.type(title(), 'Soup');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Servings' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Servings' }), '60');
    await save();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Servings can be a whole number from 1 to 50.')).toBeInTheDocument();
  });

  it('keeps the draft after saving: only the server accepting the save removes it', async () => {
    renderForm();
    await userEvent.type(title(), 'Soup');
    await save();
    expect(readDraft(ME, 'new')?.fields.title).toBe('Soup');
    expect(readDraft(ME, 'new')?.recipeId).toBe(onAdd.mock.calls[0][0].id);
  });

  it('saves a draft on the device every few seconds, and when the page is hidden', () => {
    vi.useFakeTimers();
    renderForm();
    fireEvent.change(title(), { target: { value: 'Half' } });
    expect(readDraft(ME, 'new')).toBeUndefined();
    act(() => { vi.advanceTimersByTime(3100); });
    expect(readDraft(ME, 'new')?.fields.title).toBe('Half');

    fireEvent.change(title(), { target: { value: 'Half done' } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(readDraft(ME, 'new')?.fields.title).toBe('Half done');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('does not save a draft of a form nobody has touched', () => {
    vi.useFakeTimers();
    renderForm();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(readDraft(ME, 'new')).toBeUndefined();
  });

  it('cancel drops the draft and does not save', async () => {
    renderForm();
    await userEvent.type(title(), 'Soup');
    saveDraft(ME, 'new', { recipeId: 'x', base: EMPTY_FIELDS, fields: { ...EMPTY_FIELDS, title: 'Soup' } });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(readDraft(ME, 'new')).toBeUndefined();
    expect(onDone).toHaveBeenCalled();
  });
});

describe('a draft from before', () => {
  const draft = { recipeId: '11111111-1111-4111-8111-111111111111', base: EMPTY_FIELDS, fields: { ...EMPTY_FIELDS, title: 'Lost soup', steps: 'Stir' } };

  it('is offered, and continuing fills the form and reuses the same id', async () => {
    saveDraft(ME, 'new', draft);
    renderForm();
    expect(title().value).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Continue your draft' }));
    expect(title().value).toBe('Lost soup');
    await save();
    expect(onAdd.mock.calls[0][0]).toMatchObject({ id: draft.recipeId, title: 'Lost soup', steps: ['Stir'] });
  });

  it('can be thrown away', async () => {
    saveDraft(ME, 'new', draft);
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(readDraft(ME, 'new')).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Continue your draft' })).not.toBeInTheDocument();
  });

  it('is not offered while a save for that recipe is still waiting in the queue', () => {
    saveDraft(ME, 'new', draft);
    renderForm({ pendingIds: new Set([draft.recipeId]) });
    expect(screen.queryByRole('button', { name: 'Continue your draft' })).not.toBeInTheDocument();
  });

  it('is offered with the cause when the server refused the save, even if one seems to be waiting', () => {
    saveDraft(ME, 'new', { ...draft, refused: 'This household has reached 200 recipes.' });
    renderForm({ pendingIds: new Set([draft.recipeId]) });
    expect(screen.getByText('This household has reached 200 recipes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue your draft' })).toBeInTheDocument();
  });

  it('is not overwritten by the autosave while the offer is open', () => {
    vi.useFakeTimers();
    saveDraft(ME, 'new', draft);
    renderForm();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(readDraft(ME, 'new')?.fields.title).toBe('Lost soup');
  });
});

describe('editing a recipe', () => {
  it('starts from the recipe, and a save sends only what changed', async () => {
    renderForm({ recipe });
    expect(title().value).toBe('Chilli');
    expect(ingredients().value).toBe('2 onions');
    await userEvent.clear(title());
    await userEvent.type(title(), 'Chili');
    await save();
    expect(onEdit).toHaveBeenCalledWith(recipe, { title: 'Chili' });
    expect(onAdd).not.toHaveBeenCalled();
    expect(readDraft(ME, 'r1')?.base).toEqual(fieldsFromRecipe(recipe));
  });

  it('clears minutes when they are emptied', async () => {
    renderForm({ recipe });
    await userEvent.clear(screen.getByRole('textbox', { name: /Minutes/ }));
    await save();
    expect(onEdit).toHaveBeenCalledWith(recipe, { minutes: null });
  });

  it('queues nothing when nothing changed', async () => {
    renderForm({ recipe });
    await save();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('offers Delete when it is given a way to delete', async () => {
    renderForm({ recipe, onDelete });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('has no Delete button for a new recipe', () => {
    renderForm();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
