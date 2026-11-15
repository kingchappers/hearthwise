import { MEAL_TYPES } from '../meals/types';
import type { MealType, PlanMeal, RecipeWrite } from '../meals/types';
import { MAX_QUANTITY, MAX_TEXT } from './itemValidation';
import { ENVELOPE_KEYS, parseClientTime, parseDay, parseEnvelope, parseStamped, parseUuid } from './taskValidation';
import { bad, good, isObject, trimmedText, unknownKey } from './validation';
import type { Parsed } from './validation';

export const MAX_TITLE = 120;
export const MAX_NUTRITION = 300;
export const MAX_INGREDIENT_LINES = 30;
export const MAX_INGREDIENT_LENGTH = 120;
export const MAX_STEP_LINES = 30;
export const MAX_STEP_LENGTH = 300;
export const MAX_SERVINGS = 50;
export const MAX_MINUTES = 600;
export const MAX_ADD_DAYS = 35;
export const MAX_ADD_LINES = 100;
export const MAX_FOR_RECIPES_LENGTH = 200;

const RECIPE_FIELD_KEYS = ['title', 'mealType', 'servings', 'minutes', 'lowEnergy', 'nutrition', 'ingredients', 'steps'];

const length = (text: string): number => Array.from(text).length;
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

const parseServings = (value: unknown, field: string): Parsed<number> => (isWhole(value, 1, MAX_SERVINGS) ? good(value) : bad(field));

function parseMealType(value: unknown): Parsed<MealType> {
  return MEAL_TYPES.includes(value as MealType) ? good(value as MealType) : bad('mealType');
}

function parseMinutes(value: unknown): Parsed<number | null> {
  if (value === null) return good(null);
  return isWhole(value, 1, MAX_MINUTES) ? good(value) : bad('minutes');
}

function parseNutrition(value: unknown): Parsed<string> {
  if (typeof value !== 'string') return bad('nutrition');
  const text = value.trim();
  return length(text) <= MAX_NUTRITION ? good(text) : bad('nutrition');
}

// Lines are trimmed, and a blank line is refused: the editor drops blank lines before it sends.
function parseLines(field: string, maxLines: number, maxLength: number): (value: unknown) => Parsed<string[]> {
  return value => {
    if (!Array.isArray(value) || value.length > maxLines) return bad(field);
    const lines: string[] = [];
    for (const [index, entry] of value.entries()) {
      const line = trimmedText(entry, maxLength, `${field}[${index}]`);
      if (!line.ok) return line;
      lines.push(line.value);
    }
    return good(lines);
  };
}

export function parseRecipePut(body: Record<string, unknown>): Parsed<{ write: RecipeWrite; mutationId: string; clientAt?: number }> {
  const extra = unknownKey(body, [...RECIPE_FIELD_KEYS, ...RECIPE_FIELD_KEYS.map(key => `${key}At`), ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);

  const write: RecipeWrite = {};
  const fields: { [K in keyof RecipeWrite]-?: (value: unknown) => Parsed<NonNullable<RecipeWrite[K]>['value']> } = {
    title: value => trimmedText(value, MAX_TITLE, 'title'),
    mealType: parseMealType,
    servings: value => parseServings(value, 'servings'),
    minutes: parseMinutes,
    lowEnergy: value => (typeof value === 'boolean' ? good(value) : bad('lowEnergy')),
    nutrition: parseNutrition,
    ingredients: parseLines('ingredients', MAX_INGREDIENT_LINES, MAX_INGREDIENT_LENGTH),
    steps: parseLines('steps', MAX_STEP_LINES, MAX_STEP_LENGTH),
  };
  for (const key of RECIPE_FIELD_KEYS as (keyof RecipeWrite)[]) {
    const parsed = parseStamped(body, key, fields[key] as (value: unknown) => Parsed<unknown>);
    if (!parsed.ok) return parsed;
    if (parsed.value) (write as Record<string, unknown>)[key] = parsed.value;
  }
  // A time with no field to go with it is a mistake, not a no-op.
  for (const key of RECIPE_FIELD_KEYS) {
    if (`${key}At` in body && !(key in body)) return bad(`${key}At`);
  }

  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  if (Object.keys(write).length === 0) return bad('body');
  const { mutationId, clientAt } = envelope.value;
  return good(clientAt === undefined ? { write, mutationId } : { write, mutationId, clientAt });
}

// A dinner on a plan day or in an add: `recipeId` and `servings` come together, and a plain name has neither.
function parseMeal(raw: unknown, path: string): Parsed<PlanMeal> {
  if (!isObject(raw)) return bad(path);
  const extra = unknownKey(raw, ['recipeId', 'title', 'servings'], path);
  if (extra) return bad(extra);
  const title = trimmedText(raw.title, MAX_TITLE, `${path}.title`);
  if (!title.ok) return title;

  const meal: PlanMeal = { title: title.value };
  if ('recipeId' in raw) {
    const recipeId = parseUuid(raw.recipeId, `${path}.recipeId`);
    if (!recipeId.ok) return recipeId;
    meal.recipeId = recipeId.value;
  }
  if (meal.recipeId !== undefined || 'servings' in raw) {
    if (meal.recipeId === undefined) return bad(`${path}.servings`);
    const servings = parseServings(raw.servings, `${path}.servings`);
    if (!servings.ok) return servings;
    meal.servings = servings.value;
  }
  return good(meal);
}

export function parsePlanPut(body: Record<string, unknown>): Parsed<{ meal: PlanMeal | null; at: number; mutationId: string; clientAt?: number }> {
  const extra = unknownKey(body, ['meal', 'mealAt', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  if (!('meal' in body)) return bad('meal');
  const meal = body.meal === null ? good(null) : parseMeal(body.meal, 'meal');
  if (!meal.ok) return meal;
  const at = parseClientTime(body.mealAt, 'mealAt');
  if (!at.ok) return at;
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  const { mutationId, clientAt } = envelope.value;
  const base = { meal: meal.value, at: at.value, mutationId };
  return good(clientAt === undefined ? base : { ...base, clientAt });
}

export interface AddDay extends PlanMeal {
  day: string;
}

export interface AddLine {
  id: string;
  text: string;
  quantity?: string;
  forRecipes?: string;
}

function parseAddDay(raw: unknown, index: number): Parsed<AddDay> {
  const path = `days[${index}]`;
  if (!isObject(raw)) return bad(path);
  const day = parseDay(raw.day, `${path}.day`);
  if (!day.ok) return day;
  const { day: _day, ...rest } = raw;
  const meal = parseMeal(rest, path);
  return meal.ok ? good({ day: day.value, ...meal.value }) : meal;
}

function parseAddLine(raw: unknown, index: number): Parsed<AddLine> {
  const path = `lines[${index}]`;
  if (!isObject(raw)) return bad(path);
  const extra = unknownKey(raw, ['id', 'text', 'quantity', 'forRecipes'], path);
  if (extra) return bad(extra);
  const id = parseUuid(raw.id, `${path}.id`);
  if (!id.ok) return id;
  const text = trimmedText(raw.text, MAX_TEXT, `${path}.text`);
  if (!text.ok) return text;

  const line: AddLine = { id: id.value, text: text.value };
  if ('quantity' in raw) {
    if (typeof raw.quantity !== 'string' || length(raw.quantity.trim()) > MAX_QUANTITY) return bad(`${path}.quantity`);
    if (raw.quantity.trim() !== '') line.quantity = raw.quantity.trim();
  }
  if ('forRecipes' in raw) {
    if (typeof raw.forRecipes !== 'string' || length(raw.forRecipes.trim()) > MAX_FOR_RECIPES_LENGTH) return bad(`${path}.forRecipes`);
    if (raw.forRecipes.trim() !== '') line.forRecipes = raw.forRecipes.trim();
  }
  return good(line);
}

// Any invalid field in any day or line makes the whole request invalid, and nothing is written.
export function parseAddToList(body: Record<string, unknown>): Parsed<{ days: AddDay[]; lines: AddLine[]; mutationId: string; clientAt?: number }> {
  const extra = unknownKey(body, ['days', 'lines', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  if (!Array.isArray(body.days) || body.days.length < 1 || body.days.length > MAX_ADD_DAYS) return bad('days');
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > MAX_ADD_LINES) return bad('lines');

  const days: AddDay[] = [];
  for (const [index, raw] of body.days.entries()) {
    const day = parseAddDay(raw, index);
    if (!day.ok) return day;
    days.push(day.value);
  }
  const lines: AddLine[] = [];
  for (const [index, raw] of body.lines.entries()) {
    const line = parseAddLine(raw, index);
    if (!line.ok) return line;
    lines.push(line.value);
  }
  if (new Set(days.map(day => day.day)).size !== days.length) return bad('days');
  if (new Set(lines.map(line => line.id)).size !== lines.length) return bad('lines');

  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  const { mutationId, clientAt } = envelope.value;
  return good(clientAt === undefined ? { days, lines, mutationId } : { days, lines, mutationId, clientAt });
}
