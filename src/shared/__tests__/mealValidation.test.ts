import { describe, expect, it } from 'vitest';
import { parseAddToList, parsePlanPut, parseRecipePut } from '../mealValidation';

const ok = <T>(value: T) => ({ ok: true, value });
const bad = (field: string) => ({ ok: false, field });
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MUT = uuid(999);
const AT = 1_800_000_000_000;
const rep = (text: string, count: number): string[] => Array.from({ length: count }, () => text);

describe('parseRecipePut', () => {
  it('takes each field with its time', () => {
    const parsed = parseRecipePut({
      mutationId: MUT, title: '  Chilli ', titleAt: AT, mealType: 'lunch', mealTypeAt: AT, servings: 4, servingsAt: AT, minutes: 20, minutesAt: AT,
      lowEnergy: true, lowEnergyAt: AT, nutrition: '400 kcal', nutritionAt: AT, ingredients: [' 2 onions '], ingredientsAt: AT, steps: ['Chop'], stepsAt: AT,
    });
    expect(parsed).toEqual(ok({
      mutationId: MUT,
      write: {
        title: { value: 'Chilli', at: AT }, mealType: { value: 'lunch', at: AT }, servings: { value: 4, at: AT }, minutes: { value: 20, at: AT },
        lowEnergy: { value: true, at: AT }, nutrition: { value: '400 kcal', at: AT }, ingredients: { value: ['2 onions'], at: AT }, steps: { value: ['Chop'], at: AT },
      },
    }));
  });

  it('limits the title to 1-120 characters', () => {
    expect(parseRecipePut({ mutationId: MUT, title: 'x'.repeat(120), titleAt: AT }).ok).toBe(true);
    expect(parseRecipePut({ mutationId: MUT, title: 'x'.repeat(121), titleAt: AT })).toEqual(bad('title'));
    expect(parseRecipePut({ mutationId: MUT, title: '  ', titleAt: AT })).toEqual(bad('title'));
  });

  it('limits servings to whole numbers from 1 to 50', () => {
    expect(parseRecipePut({ mutationId: MUT, servings: 50, servingsAt: AT }).ok).toBe(true);
    expect(parseRecipePut({ mutationId: MUT, servings: 51, servingsAt: AT })).toEqual(bad('servings'));
    expect(parseRecipePut({ mutationId: MUT, servings: 0, servingsAt: AT })).toEqual(bad('servings'));
    expect(parseRecipePut({ mutationId: MUT, servings: 2.5, servingsAt: AT })).toEqual(bad('servings'));
  });

  it('limits minutes to 1-600, and null clears them', () => {
    expect(parseRecipePut({ mutationId: MUT, minutes: 600, minutesAt: AT }).ok).toBe(true);
    expect(parseRecipePut({ mutationId: MUT, minutes: 601, minutesAt: AT })).toEqual(bad('minutes'));
    expect(parseRecipePut({ mutationId: MUT, minutes: 0, minutesAt: AT })).toEqual(bad('minutes'));
    expect(parseRecipePut({ mutationId: MUT, minutes: null, minutesAt: AT })).toEqual(ok({ mutationId: MUT, write: { minutes: { value: null, at: AT } } }));
  });

  it('accepts only the three meal types', () => {
    expect(parseRecipePut({ mutationId: MUT, mealType: 'snack', mealTypeAt: AT })).toEqual(bad('mealType'));
  });

  it('limits nutrition to 300 characters, and an empty one clears it', () => {
    expect(parseRecipePut({ mutationId: MUT, nutrition: 'x'.repeat(300), nutritionAt: AT }).ok).toBe(true);
    expect(parseRecipePut({ mutationId: MUT, nutrition: 'x'.repeat(301), nutritionAt: AT })).toEqual(bad('nutrition'));
    expect(parseRecipePut({ mutationId: MUT, nutrition: '', nutritionAt: AT })).toEqual(ok({ mutationId: MUT, write: { nutrition: { value: '', at: AT } } }));
  });

  it('limits ingredients to 30 lines of 120 characters', () => {
    expect(parseRecipePut({ mutationId: MUT, ingredients: rep('x'.repeat(120), 30), ingredientsAt: AT }).ok).toBe(true);
    expect(parseRecipePut({ mutationId: MUT, ingredients: rep('x', 31), ingredientsAt: AT })).toEqual(bad('ingredients'));
    expect(parseRecipePut({ mutationId: MUT, ingredients: ['ok', 'x'.repeat(121)], ingredientsAt: AT })).toEqual(bad('ingredients[1]'));
    expect(parseRecipePut({ mutationId: MUT, ingredients: ['ok', '  '], ingredientsAt: AT })).toEqual(bad('ingredients[1]'));
    expect(parseRecipePut({ mutationId: MUT, ingredients: [1], ingredientsAt: AT })).toEqual(bad('ingredients[0]'));
    expect(parseRecipePut({ mutationId: MUT, ingredients: [], ingredientsAt: AT }).ok).toBe(true);
  });

  it('limits steps to 30 lines of 300 characters', () => {
    expect(parseRecipePut({ mutationId: MUT, steps: rep('x'.repeat(300), 30), stepsAt: AT }).ok).toBe(true);
    expect(parseRecipePut({ mutationId: MUT, steps: rep('x', 31), stepsAt: AT })).toEqual(bad('steps'));
    expect(parseRecipePut({ mutationId: MUT, steps: ['x'.repeat(301)], stepsAt: AT })).toEqual(bad('steps[0]'));
  });

  it('counts emoji as one character', () => {
    expect(parseRecipePut({ mutationId: MUT, title: '🍅'.repeat(120), titleAt: AT }).ok).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(parseRecipePut({ mutationId: MUT, title: 'A', titleAt: AT, photo: 'x' })).toEqual(bad('photo'));
  });

  it('rejects a time with no field, and a field with no time', () => {
    expect(parseRecipePut({ mutationId: MUT, servingsAt: AT })).toEqual(bad('servingsAt'));
    expect(parseRecipePut({ mutationId: MUT, servings: 2 })).toEqual(bad('servingsAt'));
  });

  it('rejects a body with no fields, and a missing mutation id', () => {
    expect(parseRecipePut({ mutationId: MUT })).toEqual(bad('body'));
    expect(parseRecipePut({ title: 'A', titleAt: AT })).toEqual(bad('mutationId'));
  });

  it('accepts clientAt and notify, and ignores neither silently', () => {
    expect(parseRecipePut({ mutationId: MUT, clientAt: AT, notify: true, title: 'A', titleAt: AT }).ok).toBe(true);
  });
});

describe('parsePlanPut', () => {
  it('takes a meal with a recipe', () => {
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { recipeId: uuid(1), title: ' Chilli ', servings: 4 } }))
      .toEqual(ok({ mutationId: MUT, meal: { recipeId: uuid(1), title: 'Chilli', servings: 4 }, at: AT }));
  });

  it('takes a plain-name meal', () => {
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { title: 'Takeaway' } })).toEqual(ok({ mutationId: MUT, meal: { title: 'Takeaway' }, at: AT }));
  });

  it('takes null to clear the day', () => {
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: null })).toEqual(ok({ mutationId: MUT, meal: null, at: AT }));
  });

  it('requires servings exactly when recipeId is present', () => {
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { recipeId: uuid(1), title: 'A' } })).toEqual(bad('meal.servings'));
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { title: 'A', servings: 2 } })).toEqual(bad('meal.servings'));
  });

  it('limits the title and servings', () => {
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { title: 'x'.repeat(120) } }).ok).toBe(true);
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { title: 'x'.repeat(121) } })).toEqual(bad('meal.title'));
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { recipeId: uuid(1), title: 'A', servings: 51 } })).toEqual(bad('meal.servings'));
  });

  it('rejects a recipe id that is not a UUID, unknown keys, and a missing meal or time', () => {
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { recipeId: 'x', title: 'A', servings: 2 } })).toEqual(bad('meal.recipeId'));
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: { title: 'A', extra: 1 } })).toEqual(bad('meal.extra'));
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT })).toEqual(bad('meal'));
    expect(parsePlanPut({ mutationId: MUT, meal: null })).toEqual(bad('mealAt'));
    expect(parsePlanPut({ mutationId: MUT, mealAt: AT, meal: null, other: 1 })).toEqual(bad('other'));
  });
});

describe('parseAddToList', () => {
  const day = (n: number, extra: Record<string, unknown> = {}) => ({ day: `2026-11-${String(n).padStart(2, '0')}`, title: 'Chilli', ...extra });
  const line = (n: number, extra: Record<string, unknown> = {}) => ({ id: uuid(n), text: 'onions', ...extra });

  it('takes days and lines', () => {
    const body = {
      mutationId: MUT, clientAt: AT, notify: true,
      days: [day(16, { recipeId: uuid(7), servings: 4 })],
      lines: [line(1, { quantity: ' 3 ', forRecipes: 'Chilli' })],
    };
    expect(parseAddToList(body)).toEqual(ok({
      mutationId: MUT, clientAt: AT,
      days: [{ day: '2026-11-16', title: 'Chilli', recipeId: uuid(7), servings: 4 }],
      lines: [{ id: uuid(1), text: 'onions', quantity: '3', forRecipes: 'Chilli' }],
    }));
  });

  it('limits days to 1-35 and lines to 1-100', () => {
    const days = (count: number) => Array.from({ length: count }, (_, i) => ({ day: new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10), title: 'A' }));
    const lines = (count: number) => Array.from({ length: count }, (_, i) => line(i + 1));
    expect(parseAddToList({ mutationId: MUT, days: days(35), lines: lines(100) }).ok).toBe(true);
    expect(parseAddToList({ mutationId: MUT, days: days(36), lines: lines(1) })).toEqual(bad('days'));
    expect(parseAddToList({ mutationId: MUT, days: [], lines: lines(1) })).toEqual(bad('days'));
    expect(parseAddToList({ mutationId: MUT, days: days(1), lines: lines(101) })).toEqual(bad('lines'));
    expect(parseAddToList({ mutationId: MUT, days: days(1), lines: [] })).toEqual(bad('lines'));
  });

  it('names the failing field in a day or line', () => {
    expect(parseAddToList({ mutationId: MUT, days: [day(16), { day: 'nope', title: 'A' }], lines: [line(1)] })).toEqual(bad('days[1].day'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16, { title: '' })], lines: [line(1)] })).toEqual(bad('days[0].title'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16)], lines: [line(1), line(2, { text: 'x'.repeat(201) })] })).toEqual(bad('lines[1].text'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16)], lines: [line(1, { quantity: 'x'.repeat(41) })] })).toEqual(bad('lines[0].quantity'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16)], lines: [line(1, { forRecipes: 'x'.repeat(201) })] })).toEqual(bad('lines[0].forRecipes'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16)], lines: [{ id: 'x', text: 'a' }] })).toEqual(bad('lines[0].id'));
  });

  it('requires servings exactly when recipeId is present', () => {
    expect(parseAddToList({ mutationId: MUT, days: [day(16, { recipeId: uuid(1) })], lines: [line(1)] })).toEqual(bad('days[0].servings'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16, { servings: 2 })], lines: [line(1)] })).toEqual(bad('days[0].servings'));
  });

  it('rejects a day listed twice and a line id listed twice', () => {
    expect(parseAddToList({ mutationId: MUT, days: [day(16), day(16)], lines: [line(1)] })).toEqual(bad('days'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16)], lines: [line(1), line(1)] })).toEqual(bad('lines'));
  });

  it('rejects unknown keys at every level', () => {
    expect(parseAddToList({ mutationId: MUT, days: [day(16)], lines: [line(1)], extra: 1 })).toEqual(bad('extra'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16, { extra: 1 })], lines: [line(1)] })).toEqual(bad('days[0].extra'));
    expect(parseAddToList({ mutationId: MUT, days: [day(16)], lines: [line(1, { extra: 1 })] })).toEqual(bad('lines[0].extra'));
  });
});
