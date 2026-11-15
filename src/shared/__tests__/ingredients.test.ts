import { describe, expect, it } from 'vitest';
import { formatAmount, normaliseName, parseIngredientLine } from '../ingredients';

describe('parseIngredientLine', () => {
  const cases: [string, ReturnType<typeof parseIngredientLine>][] = [
    ['2 onions', { name: 'onions', amount: 2 }],
    ['200 g flour', { name: 'flour', amount: 200, unit: 'g' }],
    ['200g flour', { name: 'flour', amount: 200, unit: 'g' }],
    ['200 G flour', { name: 'flour', amount: 200, unit: 'g' }],
    ['1,500 g flour', { name: 'flour', amount: 1500, unit: 'g' }],
    ['1 1/2 tbsp olive oil', { name: 'olive oil', amount: 1.5, unit: 'tbsp' }],
    ['a tin of tomatoes', { name: 'tomatoes', amount: 1, unit: 'tin' }],
    ['an pinch of salt', { name: 'salt', amount: 1, unit: 'pinch' }],
    ['1 onion, diced', { name: 'onion', amount: 1, note: 'diced' }],
    ['2 large onions', { name: 'large onions', amount: 2 }],
    ['a handful of basil', { name: 'a handful of basil' }],
    ['a onion', { name: 'a onion' }],
    ['salt to taste', { name: 'salt to taste' }],
    ['2-3 carrots', { name: '2-3 carrots' }],
    ['0 eggs', { name: '0 eggs' }],
    ['½ tsp salt', { name: 'salt', amount: 0.5, unit: 'tsp' }],
    ['1½ cups milk', { name: 'milk', amount: 1.5, unit: 'cup' }],
    ['1 ½ cups milk', { name: 'milk', amount: 1.5, unit: 'cup' }],
    ['1/2 tsp salt', { name: 'salt', amount: 0.5, unit: 'tsp' }],
    ['1,5 kg potatoes', { name: 'potatoes', amount: 1.5, unit: 'kg' }],
    ['1.5 kg potatoes', { name: 'potatoes', amount: 1.5, unit: 'kg' }],
    ['2 tbsp. oil', { name: 'oil', amount: 2, unit: 'tbsp' }],
    ['3 cloves of garlic', { name: 'garlic', amount: 3, unit: 'clove' }],
    ['2 cans chopped tomatoes', { name: 'chopped tomatoes', amount: 2, unit: 'tin' }],
    ['8 oz cheese', { name: 'oz cheese', amount: 8 }],
    ['200 g', { name: '200 g' }],
    ['2', { name: '2' }],
    [', diced', { name: ', diced' }],
    ['', { name: '' }],
    ['  4 eggs  ', { name: 'eggs', amount: 4 }],
  ];
  it.each(cases)('reads %j', (text, expected) => {
    expect(parseIngredientLine(text)).toEqual(expected);
  });
});

describe('normaliseName', () => {
  it.each([
    ['onion', 'onions'],
    ['tomato', 'tomatoes'],
    ['leaf', 'leaves'],
    ['pea', 'peas'],
    ['cherry', 'cherries'],
    ['peach', 'peaches'],
    ['radish', 'radishes'],
    ['box', 'boxes'],
    ['Onion', ' ONIONS '],
    ['cookie', 'cookies'],
  ])('treats %j and %j as the same', (a, b) => {
    expect(normaliseName(a)).toBe(normaliseName(b));
  });

  it.each([
    ['red onion', 'onion'],
    ['chicken breast', 'chicken'],
    ['asparagus', 'asparagu'],
    ['cress', 'cres'],
    ['hummus', 'hummu'],
  ])('keeps %j and %j apart', (a, b) => {
    expect(normaliseName(a)).not.toBe(normaliseName(b));
  });

  it('leaves asparagus, cress and hummus as written', () => {
    expect(normaliseName('asparagus')).toBe('asparagus');
    expect(normaliseName('cress')).toBe('cress');
    expect(normaliseName('hummus')).toBe('hummus');
  });

  it('removes punctuation but keeps hyphens', () => {
    expect(normaliseName('Spring-onions!')).toBe('spring-onion');
  });

  it('is idempotent', () => {
    for (const word of ['onions', 'tomatoes', 'leaves', 'cherries', 'peaches', 'radishes', 'boxes', 'cookies', 'asparagus', 'cress', 'hummus', 'peas', 'red onions', 'molasses', 'pies', 'chillies', 'shoes', 'buses', 'gas']) {
      expect(normaliseName(normaliseName(word))).toBe(normaliseName(word));
    }
  });
});

describe('formatAmount', () => {
  it.each([
    [1.5, undefined, '1½'],
    [0.35, 'kg', '0.35 kg'],
    [400, 'g', '400 g'],
    [3, undefined, '3'],
    [0.5, undefined, '½'],
    [0.25, 'tsp', '¼ tsp'],
    [2.75, 'tbsp', '2¾ tbsp'],
    [1.2, 'l', '1.2 l'],
    [2, 'kg', '2 kg'],
  ] as const)('shows %d %s as %j', (amount, unit, expected) => {
    expect(formatAmount(amount, unit)).toBe(expected);
  });
});
