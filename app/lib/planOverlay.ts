// The pending plan mutations shown on top of the server's plan. Pure, and it reuses the server's own write rule, so a pending set loses
// to a newer one on screen exactly as it will on the server.
import { applyPlanWrite } from '../../src/meals/applyPlan';
import type { PlanData } from '../../src/meals/types';
import type { MealMutationVars } from './mutations';
import type { PendingMutation } from './overlay';

function applyPlanSet(data: PlanData, v: MealMutationVars['planSet']): PlanData {
  const existing = data.days.find(day => day.day === v.day);
  const { result, day } = applyPlanWrite(existing, v.day, { meal: v.meal, mealAt: v.at }, v.by, v.at);
  if (result === 'noop' || !day) return data;
  const others = data.days.filter(entry => entry.day !== v.day);
  return { ...data, days: [...others, day].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)) };
}

export function applyPendingPlan(data: PlanData, pending: PendingMutation[]): PlanData {
  return pending.reduce((current, mutation) => {
    if (mutation.mutationKey?.[0] !== 'household' || mutation.mutationKey[1] !== 'planSet' || !mutation.variables) return current;
    return applyPlanSet(current, mutation.variables as MealMutationVars['planSet']);
  }, data);
}
