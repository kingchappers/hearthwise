import type { Recipe } from '../meals/types';
import { formatAmount, normaliseName, parseIngredientLine } from './ingredients';
import type { Unit } from './ingredients';

export const MAX_LINES = 100;
export const MAX_FOR_RECIPES = 200;

const EPSILON = 1e-9;

const STEPS: Record<string, number> = {
  tin: 0.5, pack: 0.5, clove: 0.5, bunch: 0.5, slice: 0.5,
  tsp: 0.25, tbsp: 0.25, cup: 0.25, pinch: 0.25,
  g: 1, ml: 1,
  kg: 0.05, l: 0.05,
};
const COUNT_STEP = 0.5;

export const scaleFactor = (plannedServings: number, recipeServings: number): number => plannedServings / recipeServings;

// A shopping amount rounds up, so the list is never short; the cooking view rounds to the nearest step. The smallest result is one step.
export function roundAmount(amount: number, unit: Unit | undefined, mode: 'up' | 'nearest'): number {
  const step = unit ? STEPS[unit] : COUNT_STEP;
  const steps = mode === 'up' ? Math.ceil(amount / step - EPSILON) : Math.round(amount / step);
  return Number((Math.max(1, steps) * step).toFixed(6));
}

export interface ReviewLine {
  key: string;
  text: string;
  quantity?: string;
  forRecipes: string;
  from: { title: string; amount?: number; unit?: Unit }[];
  notScaled: boolean;
}

export interface PlannedMeal {
  recipe: Recipe;
  servings: number;
}

interface Group {
  text: string;
  unit?: Unit;
  total: number;
  titles: string[];
  from: ReviewLine['from'];
  key: string;
}

function joinTitles(titles: string[]): string {
  const joined = titles.join(', ');
  const characters = Array.from(joined);
  return characters.length <= MAX_FOR_RECIPES ? joined : `${characters.slice(0, MAX_FOR_RECIPES - 1).join('')}…`;
}

const addTitle = (titles: string[], title: string): void => {
  if (!titles.includes(title)) titles.push(title);
};

// The review lines for the planned dinners, in order of first appearance. Amounts are summed exactly and rounded up after the sum.
export function buildLines(meals: PlannedMeal[]): ReviewLine[] {
  const ordered: (Group | ReviewLine)[] = [];
  const groups = new Map<string, Group>();
  const rawSeen = new Map<string, number>();

  for (const { recipe, servings } of meals) {
    const factor = scaleFactor(servings, recipe.servings);
    for (const line of recipe.ingredients) {
      if (line.trim() === '') continue;
      const parsed = parseIngredientLine(line);

      if (parsed.amount === undefined) {
        const text = line.trim();
        const lower = text.toLowerCase();
        const seen = rawSeen.get(lower) ?? 0;
        rawSeen.set(lower, seen + 1);
        ordered.push({
          key: `raw:${lower}|${seen}`, text, forRecipes: joinTitles([recipe.title]), from: [{ title: recipe.title }], notScaled: Math.abs(factor - 1) > EPSILON,
        });
        continue;
      }

      const scaled = parsed.amount * factor;
      const key = `${normaliseName(parsed.name)}|${parsed.unit ?? ''}`;
      const source = parsed.unit ? { title: recipe.title, amount: scaled, unit: parsed.unit } : { title: recipe.title, amount: scaled };
      const existing = groups.get(key);
      if (existing) {
        existing.total += scaled;
        addTitle(existing.titles, recipe.title);
        existing.from.push(source);
        continue;
      }
      const group: Group = { text: parsed.name, total: scaled, titles: [recipe.title], from: [source], key };
      if (parsed.unit) group.unit = parsed.unit;
      groups.set(key, group);
      ordered.push(group);
    }
  }

  return ordered.map((entry): ReviewLine => {
    if ('notScaled' in entry) return entry;
    const quantity = formatAmount(roundAmount(entry.total, entry.unit, 'up'), entry.unit);
    return { key: entry.key, text: entry.text, quantity, forRecipes: joinTitles(entry.titles), from: entry.from, notScaled: false };
  });
}
