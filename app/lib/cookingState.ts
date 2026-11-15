// The ticks on a recipe's ingredients and steps, and the servings chosen, kept on this device so they survive a locked phone and a
// remount. One entry for each recipe, for one cooking day. Never shared: the other person cooks on their own phone.
import { cookingKey, readObject, writeObject } from './deviceKeys';

export interface CookingEntry {
  day: string;
  // Line positions that are ticked.
  ingredients: number[];
  steps: number[];
  servings: number;
}

type Now = () => number;

const DAY_STARTS_AT_HOUR = 4;

// The phone's local date, with the hours before 4am counted as the day before, so cooking past midnight keeps its ticks.
export function cookingDay(nowMs: number): string {
  const shifted = new Date(nowMs - DAY_STARTS_AT_HOUR * 3_600_000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

const isEntry = (value: unknown): value is CookingEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as CookingEntry;
  return typeof entry.day === 'string' && Array.isArray(entry.ingredients) && Array.isArray(entry.steps) && typeof entry.servings === 'number';
};

// Today's entry for the recipe, or nothing. An entry from another day reads as nothing, and is replaced the next time one is written.
export function readCooking(userId: string, recipeId: string, now: Now = Date.now): CookingEntry | undefined {
  if (userId === '') return undefined;
  const entry = readObject(cookingKey(userId))[recipeId];
  return isEntry(entry) && entry.day === cookingDay(now()) ? entry : undefined;
}

function update(userId: string, recipeId: string, now: Now, fallbackServings: number, change: (entry: CookingEntry) => CookingEntry): void {
  if (userId === '') return;
  const all = readObject(cookingKey(userId));
  const current = readCooking(userId, recipeId, now) ?? { day: cookingDay(now()), ingredients: [], steps: [], servings: fallbackServings };
  writeObject(cookingKey(userId), { ...all, [recipeId]: change(current) });
}

export function tickLine(
  userId: string, recipeId: string, kind: 'ingredients' | 'steps', index: number, ticked: boolean, servings: number, now: Now = Date.now,
): void {
  update(userId, recipeId, now, servings, entry => {
    const others = entry[kind].filter(position => position !== index);
    return { ...entry, [kind]: ticked ? [...others, index].sort((a, b) => a - b) : others };
  });
}

export function writeServings(userId: string, recipeId: string, servings: number, now: Now = Date.now): void {
  update(userId, recipeId, now, servings, entry => ({ ...entry, servings }));
}

// "Start again": clears the ticks only, and puts the servings back to the planned number (or the recipe's own).
export function startAgain(userId: string, recipeId: string, servings: number, now: Now = Date.now): void {
  update(userId, recipeId, now, servings, entry => ({ ...entry, ingredients: [], steps: [], servings }));
}
