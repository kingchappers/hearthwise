// The recipe editor's form values and the pure rules around them: cleaning typed lines, finding what changed, and checking the limits
// the server will check, so a recipe over a limit is caught before it is queued.
import type { MealType, Recipe } from '../../src/meals/types';
import {
  MAX_INGREDIENT_LENGTH, MAX_INGREDIENT_LINES, MAX_NUTRITION, MAX_STEP_LENGTH, MAX_STEP_LINES, MAX_TITLE,
} from '../../src/shared/mealValidation';

export interface RecipeFields {
  title: string;
  mealType: MealType;
  servings: number;
  minutes: number | null;
  lowEnergy: boolean;
  nutrition: string;
  // One line each, as typed.
  ingredients: string;
  steps: string;
}

// The fields a save sends: only the ones the person changed. `minutes: null` and an empty `nutrition` clear their fields.
export interface RecipeChanges {
  title?: string;
  mealType?: MealType;
  servings?: number;
  minutes?: number | null;
  lowEnergy?: boolean;
  nutrition?: string;
  ingredients?: string[];
  steps?: string[];
}

export const EMPTY_FIELDS: RecipeFields = { title: '', mealType: 'dinner', servings: 2, minutes: null, lowEnergy: false, nutrition: '', ingredients: '', steps: '' };

export function fieldsFromRecipe(recipe: Recipe): RecipeFields {
  return {
    title: recipe.title,
    mealType: recipe.mealType,
    servings: recipe.servings,
    minutes: recipe.minutes ?? null,
    lowEnergy: recipe.lowEnergy,
    nutrition: recipe.nutrition ?? '',
    ingredients: recipe.ingredients.join('\n'),
    steps: recipe.steps.join('\n'),
  };
}

// Trims each line and drops the blank ones.
export const cleanLines = (text: string): string[] => text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');

// For a paste: also removes a bullet (`-`, `*`, `•`) or a list number (`1.`, `2)`, followed by a space) from the start of each line. A
// decimal such as `1.5 kg flour` is left alone.
export function stripListMarkers(text: string): string {
  return cleanLines(text)
    .map(line => line.replace(/^(?:[-*]\s+|•\s*|\d+[.)]\s+)/, '').trim())
    .filter(line => line !== '')
    .join('\n');
}

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((line, index) => line === b[index]);

export function changedFields(base: RecipeFields, fields: RecipeFields): RecipeChanges {
  const changes: RecipeChanges = {};
  if (fields.title.trim() !== base.title.trim()) changes.title = fields.title.trim();
  if (fields.mealType !== base.mealType) changes.mealType = fields.mealType;
  if (fields.servings !== base.servings) changes.servings = fields.servings;
  if (fields.minutes !== base.minutes) changes.minutes = fields.minutes;
  if (fields.lowEnergy !== base.lowEnergy) changes.lowEnergy = fields.lowEnergy;
  if (fields.nutrition.trim() !== base.nutrition.trim()) changes.nutrition = fields.nutrition.trim();
  if (!same(cleanLines(fields.ingredients), cleanLines(base.ingredients))) changes.ingredients = cleanLines(fields.ingredients);
  if (!same(cleanLines(fields.steps), cleanLines(base.steps))) changes.steps = cleanLines(fields.steps);
  return changes;
}

export interface LimitProblem {
  field: 'title' | 'nutrition' | 'ingredients' | 'steps';
  message: string;
}

const length = (text: string): number => Array.from(text).length;

// What the server would refuse, in words that say what to change. The text is never cut short.
export function checkLimits(fields: RecipeFields): LimitProblem[] {
  const problems: LimitProblem[] = [];
  if (length(fields.title.trim()) > MAX_TITLE) {
    problems.push({ field: 'title', message: `The title can be up to ${MAX_TITLE} characters. This has ${length(fields.title.trim())}.` });
  }
  if (length(fields.nutrition.trim()) > MAX_NUTRITION) {
    problems.push({ field: 'nutrition', message: `The nutrition note can be up to ${MAX_NUTRITION} characters. This has ${length(fields.nutrition.trim())}.` });
  }

  const ingredients = cleanLines(fields.ingredients);
  if (ingredients.length > MAX_INGREDIENT_LINES) {
    const over = ingredients.length - MAX_INGREDIENT_LINES;
    problems.push({
      field: 'ingredients',
      message: `A recipe can hold ${MAX_INGREDIENT_LINES} ingredient lines. This has ${ingredients.length}. Remove or combine ${over}, or keep the extra lines in the notes.`,
    });
  }
  ingredients.forEach((line, index) => {
    if (length(line) > MAX_INGREDIENT_LENGTH) {
      problems.push({ field: 'ingredients', message: `Ingredient line ${index + 1} is ${length(line)} characters. The most is ${MAX_INGREDIENT_LENGTH}. Shorten it or split it.` });
    }
  });

  const steps = cleanLines(fields.steps);
  if (steps.length > MAX_STEP_LINES) {
    const over = steps.length - MAX_STEP_LINES;
    problems.push({ field: 'steps', message: `A recipe can hold ${MAX_STEP_LINES} steps. This has ${steps.length}. Remove or combine ${over}.` });
  }
  steps.forEach((line, index) => {
    if (length(line) > MAX_STEP_LENGTH) {
      problems.push({ field: 'steps', message: `Step ${index + 1} is ${length(line)} characters. The most is ${MAX_STEP_LENGTH}. Shorten it or split it.` });
    }
  });
  return problems;
}
