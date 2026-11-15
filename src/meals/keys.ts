import { hhPk } from '../household/keys';
import type { Key } from '../store';

export const RECIPE_PREFIX = 'RECIPE#';
export const PLAN_PREFIX = 'PLAN#';

export const recipeKey = (householdId: string, id: string): Key => ({ PK: hhPk(householdId), SK: `${RECIPE_PREFIX}${id}` });
export const planKey = (householdId: string, day: string): Key => ({ PK: hhPk(householdId), SK: `${PLAN_PREFIX}${day}` });
