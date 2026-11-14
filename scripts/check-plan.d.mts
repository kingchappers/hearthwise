export const PROTECTED_TYPES: readonly string[];
export interface PlanCheck { ok: boolean; blocked: string[]; overridden: boolean }
export function checkPlan(plan: unknown, env: Record<string, string | undefined>): PlanCheck;
