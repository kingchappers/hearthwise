import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../meals/types';
import { buildLines, MAX_FOR_RECIPES, MAX_LINES, roundAmount, scaleFactor } from '../shoppingLines';

const recipe = (title: string, ingredients: string[], servings = 2): Recipe => ({
  id: title, title, mealType: 'dinner', servings, lowEnergy: false, ingredients, steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 0, updatedBy: 'u',
});
const meal = (title: string, ingredients: string[], servings = 2, recipeServings = 2) => ({ recipe: recipe(title, ingredients, recipeServings), servings });
const summary = (lines: ReturnType<typeof buildLines>) => lines.map(line => [line.text, line.quantity]);

describe('scaleFactor', () => {
  it('divides planned servings by the recipe servings', () => {
    expect(scaleFactor(3, 2)).toBe(1.5);
    expect(scaleFactor(2, 2)).toBe(1);
  });
});

describe('roundAmount', () => {
  it.each([
    [1.2, undefined, 'up', 1.5],
    [1.5, undefined, 'up', 1.5],
    [0.1, undefined, 'up', 0.5],
    [0.2, 'tsp', 'up', 0.25],
    [1.01, 'tbsp', 'up', 1.25],
    [250.2, 'g', 'up', 251],
    [250.4, 'ml', 'nearest', 250],
    [0.31, 'kg', 'up', 0.35],
    [0.34, 'l', 'nearest', 0.35],
    [1.2, 'clove', 'nearest', 1],
    [1.3, 'tin', 'nearest', 1.5],
    [0.01, 'g', 'nearest', 1],
    [0.01, 'kg', 'nearest', 0.05],
    [0.1, 'pinch', 'nearest', 0.25],
    [2.1, 'bunch', 'up', 2.5],
    [1.1, 'slice', 'up', 1.5],
  ] as const)('rounds %d %s %s to %d', (amount, unit, mode, expected) => {
    expect(roundAmount(amount, unit, mode)).toBeCloseTo(expected, 9);
  });

  it('leaves an amount already on a step where it is, despite floating-point error', () => {
    expect(roundAmount(0.1 + 0.2 + 0.05, 'kg', 'up')).toBeCloseTo(0.35, 9);
    expect(roundAmount(3 * 0.5, undefined, 'up')).toBe(1.5);
  });
});

describe('buildLines', () => {
  it('sums the same name and unit: 2 onions + 1 onion is 3', () => {
    const lines = buildLines([meal('Chilli', ['2 onions']), meal('Pasta bake', ['1 onion'])]);
    expect(summary(lines)).toEqual([['onions', '3']]);
    expect(lines[0].from).toEqual([{ title: 'Chilli', amount: 2 }, { title: 'Pasta bake', amount: 1 }]);
  });

  it('sums grams', () => {
    expect(summary(buildLines([meal('A', ['400 g tomatoes']), meal('B', ['400 g tomatoes'])]))).toEqual([['tomatoes', '800 g']]);
  });

  it('keeps different units apart, even related ones', () => {
    expect(summary(buildLines([meal('A', ['500 g rice']), meal('B', ['1 kg rice'])]))).toEqual([['rice', '500 g'], ['rice', '1 kg']]);
  });

  it('keeps a tin apart from grams', () => {
    expect(buildLines([meal('A', ['1 tin tomatoes']), meal('B', ['400 g tomatoes'])])).toHaveLength(2);
  });

  it('keeps different names apart', () => {
    expect(summary(buildLines([meal('A', ['1 red onion']), meal('B', ['1 onion'])]))).toEqual([['red onion', '1'], ['onion', '1']]);
  });

  it('never merges lines with no amount', () => {
    const lines = buildLines([meal('A', ['salt to taste']), meal('B', ['salt to taste'])]);
    expect(lines.map(line => line.text)).toEqual(['salt to taste', 'salt to taste']);
    expect(lines.every(line => line.quantity === undefined)).toBe(true);
    expect(new Set(lines.map(line => line.key)).size).toBe(2);
  });

  it('scales by planned servings and rounds the total up: 1 egg at factor 1.5', () => {
    expect(summary(buildLines([meal('A', ['1 egg'], 3, 2)]))).toEqual([['egg', '1½']]);
  });

  it('sums before rounding, so rounding does not accumulate', () => {
    // 0.62 kg rounds up to 0.65; rounding each source first would give 0.35 + 0.35 = 0.7.
    const lines = buildLines([meal('A', ['0.31 kg flour']), meal('B', ['0.31 kg flour'])]);
    expect(lines[0].quantity).toBe('0.65 kg');
  });

  it('rounds the smallest result to one step', () => {
    expect(summary(buildLines([meal('A', ['1 g salt'], 1, 50)]))).toEqual([['salt', '1 g']]);
  });

  it('lists each recipe title once in forRecipes, in order of first appearance', () => {
    const chilli = recipe('Chilli', ['2 onions']);
    const lines = buildLines([{ recipe: chilli, servings: 2 }, meal('Pasta bake', ['1 onion']), { recipe: chilli, servings: 2 }]);
    expect(lines[0].forRecipes).toBe('Chilli, Pasta bake');
  });

  it('cuts forRecipes at the limit with an ellipsis', () => {
    const long = 'x'.repeat(150);
    const lines = buildLines([meal(`${long}1`, ['1 onion']), meal(`${long}2`, ['1 onion'])]);
    expect(Array.from(lines[0].forRecipes)).toHaveLength(MAX_FOR_RECIPES);
    expect(lines[0].forRecipes.endsWith('…')).toBe(true);
  });

  it('keeps the name as typed in the first source', () => {
    expect(buildLines([meal('A', ['2 Onions']), meal('B', ['1 onion'])])[0].text).toBe('Onions');
  });

  it('keeps the full text of a line with no amount', () => {
    expect(buildLines([meal('A', ['a handful of basil'])])[0]).toMatchObject({ text: 'a handful of basil', forRecipes: 'A' });
  });

  it('marks a line with no amount "not scaled" when the factor is not 1', () => {
    expect(buildLines([meal('A', ['salt to taste'], 4, 2)])[0].notScaled).toBe(true);
    expect(buildLines([meal('A', ['salt to taste'], 2, 2)])[0].notScaled).toBe(false);
    expect(buildLines([meal('A', ['2 onions'], 4, 2)])[0].notScaled).toBe(false);
  });

  it('gives a key that does not depend on which days are included', () => {
    const a = meal('A', ['2 onions', 'salt']);
    const b = meal('B', ['1 onion', 'salt']);
    const both = buildLines([a, b]);
    const only = buildLines([b]);
    expect(only.find(line => line.text === 'onion')?.key).toBe(both.find(line => line.text === 'onions')?.key);
  });

  it('skips blank ingredient lines', () => {
    expect(buildLines([meal('A', ['', '  ', '1 onion'])])).toHaveLength(1);
  });

  it('returns nothing for no meals', () => {
    expect(buildLines([])).toEqual([]);
  });

  it('exports the line limit', () => {
    expect(MAX_LINES).toBe(100);
  });
});
