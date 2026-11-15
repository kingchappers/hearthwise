// The pending plan mutations shown on top of the server's plan. Pure, and it reuses the server's own write rule, so a pending set loses
// to a newer one on screen exactly as it will on the server.
import { applyPlanWrite, sameMeal } from '../../src/meals/applyPlan';
import type { PlanData } from '../../src/meals/types';
import type { ItemMutationVars, MealMutationVars } from './mutations';
import type { PendingMutation } from './overlay';

function applyPlanSet(data: PlanData, v: MealMutationVars['planSet']): PlanData {
  const existing = data.days.find(day => day.day === v.day);
  const { result, day } = applyPlanWrite(existing, v.day, { meal: v.meal, mealAt: v.at }, v.by, v.at);
  if (result === 'noop' || !day) return data;
  const others = data.days.filter(entry => entry.day !== v.day);
  return { ...data, days: [...others, day].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)) };
}

// Marks each listed day whose dinner is still the one added. The server marks under the same rule. The marker is display only, so the
// day's time of change is left alone.
function applyItemsFromPlan(data: PlanData, v: ItemMutationVars['itemsFromPlan']): PlanData {
  const marked = new Set(v.days.filter(listed => {
    const { day, ...meal } = listed;
    return sameMeal(data.days.find(entry => entry.day === day)?.meal, meal);
  }).map(listed => listed.day));
  if (marked.size === 0) return data;
  return { ...data, days: data.days.map(day => (marked.has(day.day) ? { ...day, addedAt: v.at, addedBy: v.by } : day)) };
}

export function applyPendingPlan(data: PlanData, pending: PendingMutation[]): PlanData {
  return pending.reduce((current, mutation) => {
    if (mutation.mutationKey?.[0] !== 'household' || !mutation.variables) return current;
    if (mutation.mutationKey[1] === 'planSet') return applyPlanSet(current, mutation.variables as MealMutationVars['planSet']);
    if (mutation.mutationKey[1] === 'itemsFromPlan') return applyItemsFromPlan(current, mutation.variables as ItemMutationVars['itemsFromPlan']);
    return current;
  }, data);
}
