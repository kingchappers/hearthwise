import { clampTime } from '../tasks/record';
import type { PlanDay, PlanMeal } from './types';

const SIXTY_DAYS_SECONDS = 60 * 24 * 60 * 60;

// Whether two dinners are the same: the same title, the same recipe id (or none in both) and the same servings (or none in both).
export function sameMeal(a: PlanMeal | undefined, b: PlanMeal): boolean {
  return a !== undefined && a.title === b.title && a.recipeId === b.recipeId && a.servings === b.servings;
}

// A plan day lives for 60 days after its date, in epoch seconds.
export function expiryOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / 1000 + SIXTY_DAYS_SECONDS;
}

export interface PlanWrite {
  // null clears the day.
  meal: PlanMeal | null;
  mealAt: number;
}

// What a write does to a plan day. Pure: the caller stores the result. The newer `mealAt` wins. A clear removes the meal and keeps the
// time, so a slower, older write cannot bring the old meal back. Any change to the meal (another dinner, other servings or a clear)
// removes the "On the list" marker, because it no longer describes what is planned.
export function applyPlanWrite(
  existing: PlanDay | undefined, day: string, write: PlanWrite, userId: string, serverNow: number,
): { result: 'created' | 'applied' | 'noop'; day?: PlanDay } {
  const at = clampTime(write.mealAt, serverNow);

  if (!existing) {
    const created: PlanDay = { day, fieldTimes: { meal: at }, updatedAt: serverNow, updatedBy: userId, expiresAt: expiryOf(day) };
    if (write.meal) created.meal = write.meal;
    return { result: 'created', day: created };
  }

  if (at <= (existing.fieldTimes.meal ?? 0)) return { result: 'noop' };

  const next = structuredClone(existing);
  const changed = write.meal === null ? existing.meal !== undefined : !sameMeal(existing.meal, write.meal);
  if (write.meal) next.meal = write.meal;
  else delete next.meal;
  if (changed) {
    delete next.addedAt;
    delete next.addedBy;
  }
  next.fieldTimes = { meal: at };
  next.updatedAt = Math.max(serverNow, existing.updatedAt + 1);
  next.updatedBy = userId;
  return { result: 'applied', day: next };
}
