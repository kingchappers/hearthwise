import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../../src/meals/types';
import { changedFields, checkLimits, cleanLines, EMPTY_FIELDS, fieldsFromRecipe, stripListMarkers } from '../recipeFields';

const recipe: Recipe = {
  id: 'r', title: 'Chilli', mealType: 'dinner', servings: 4, minutes: 30, lowEnergy: true, nutrition: '400 kcal', ingredients: ['2 onions', '1 tin beans'], steps: ['Chop', 'Fry'],
  fieldTimes: {}, createdBy: 'u', updatedAt: 0, updatedBy: 'u',
};

describe('fieldsFromRecipe', () => {
  it('turns a recipe into form values, with lines as text', () => {
    expect(fieldsFromRecipe(recipe)).toEqual({
      title: 'Chilli', mealType: 'dinner', servings: 4, minutes: 30, lowEnergy: true, nutrition: '400 kcal', ingredients: '2 onions\n1 tin beans', steps: 'Chop\nFry',
    });
  });

  it('has empty defaults for a new recipe: a dinner for 2', () => {
    expect(EMPTY_FIELDS).toEqual({ title: '', mealType: 'dinner', servings: 2, minutes: null, lowEnergy: false, nutrition: '', ingredients: '', steps: '' });
  });
});

describe('cleanLines', () => {
  it('trims each line and drops blank ones', () => {
    expect(cleanLines('  a \n\n   \nb\r\nc  ')).toEqual(['a', 'b', 'c']);
  });
});

describe('stripListMarkers', () => {
  it('removes bullets and list numbers from the start of each line, and drops blank lines', () => {
    expect(stripListMarkers('- 2 onions\n* 1 tin beans\n• salt\n\n1. Chop\n2) Fry\n3.  Serve')).toBe('2 onions\n1 tin beans\nsalt\nChop\nFry\nServe');
  });

  it('does not touch a decimal or a line that only looks like a marker', () => {
    expect(stripListMarkers('1.5 kg flour\n2 onions\n-5 degrees\n10 g salt')).toBe('1.5 kg flour\n2 onions\n-5 degrees\n10 g salt');
  });
});

describe('changedFields', () => {
  it('is empty when nothing changed, even if only spacing differs', () => {
    expect(changedFields(fieldsFromRecipe(recipe), { ...fieldsFromRecipe(recipe), title: ' Chilli ', steps: 'Chop\n\nFry\n' })).toEqual({});
  });

  it('names only the fields that changed', () => {
    const base = fieldsFromRecipe(recipe);
    expect(changedFields(base, { ...base, title: 'Chili', steps: 'Chop' })).toEqual({ title: 'Chili', steps: ['Chop'] });
  });

  it('sends minutes null to clear, and an empty nutrition to clear', () => {
    const base = fieldsFromRecipe(recipe);
    expect(changedFields(base, { ...base, minutes: null, nutrition: '' })).toEqual({ minutes: null, nutrition: '' });
  });

  it('sends every other changed field', () => {
    const base = fieldsFromRecipe(recipe);
    expect(changedFields(base, { ...base, mealType: 'lunch', servings: 6, lowEnergy: false, ingredients: '3 onions' }))
      .toEqual({ mealType: 'lunch', servings: 6, lowEnergy: false, ingredients: ['3 onions'] });
  });
});

describe('checkLimits', () => {
  it('has nothing to say for a recipe within the limits', () => {
    expect(checkLimits(fieldsFromRecipe(recipe))).toEqual([]);
  });

  it('says what to change when there are too many ingredient lines, in neutral words', () => {
    const fields = { ...EMPTY_FIELDS, title: 'A', ingredients: Array.from({ length: 34 }, (_, i) => `x${i}`).join('\n') };
    expect(checkLimits(fields)).toEqual([
      { field: 'ingredients', message: 'A recipe can hold 30 ingredient lines. This has 34. Remove or combine 4, or keep the extra lines in the notes.' },
    ]);
  });

  it('reports a line that is too long, with its number', () => {
    const fields = { ...EMPTY_FIELDS, title: 'A', ingredients: `ok\n${'x'.repeat(121)}`, steps: 'y'.repeat(301) };
    expect(checkLimits(fields).map(problem => problem.message)).toEqual([
      'Ingredient line 2 is 121 characters. The most is 120. Shorten it or split it.',
      'Step 1 is 301 characters. The most is 300. Shorten it or split it.',
    ]);
  });

  it('checks the title and the nutrition note', () => {
    const problems = checkLimits({ ...EMPTY_FIELDS, title: 'x'.repeat(121), nutrition: 'y'.repeat(301) });
    expect(problems.map(problem => problem.field)).toEqual(['title', 'nutrition']);
  });

  it('counts blank lines as nothing', () => {
    expect(checkLimits({ ...EMPTY_FIELDS, title: 'A', ingredients: `${'x\n'.repeat(30)}\n\n\n` })).toEqual([]);
  });
});
