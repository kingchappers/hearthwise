import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { itemMutationKeys, mealMutationKeys, registerMutations } from '~/lib/mutations';
import { applyPendingItems } from '~/lib/itemOverlay';
import { applyPendingPlan } from '~/lib/planOverlay';
import { applyPendingRecipes } from '~/lib/recipeOverlay';

const APP = join(__dirname, '..');
const ROOT = join(APP, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'test-utils') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// The step 2 hooks write to the household without a registered key; step 5 moves them into app/lib/mutations.ts with persistence.
const STEP_2_HOOKS = ['app/lib/household.ts'];

describe('household mutations', () => {
  it('are used by key only: no component defines a mutation function of its own', () => {
    const offenders: string[] = [];
    for (const file of sources(APP)) {
      const name = relative(ROOT, file);
      if (STEP_2_HOOKS.includes(name)) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/useMutation(?:<[^(]*>)?\(\s*\{([^}]*)\}/g)) {
        if (!/mutationKey/.test(match[1]) || /mutationFn/.test(match[1])) offenders.push(`${name}: ${match[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the meal mutations', () => {
  const client = new QueryClient();
  registerMutations(client, vi.fn(), () => ({ tasks: [], proposals: [], serverTime: 0 }), vi.fn());

  it.each(Object.entries(mealMutationKeys))('%s is registered with a function and the household scope', (_kind, key) => {
    const defaults = client.getMutationDefaults(key);
    expect(defaults.mutationFn).toBeTypeOf('function');
    expect(defaults.scope).toEqual({ id: 'household' });
  });

  const recipe = {
    id: 'r1', title: 'Chilli', mealType: 'dinner' as const, servings: 2, lowEnergy: false, ingredients: [], steps: [], fieldTimes: { title: 1 }, createdBy: 'u', updatedAt: 1, updatedBy: 'u',
  };
  const variables: Record<string, Record<string, unknown>> = {
    recipeAdd: { recipe: { id: 'r2', title: 'Soup' } },
    recipeEdit: { recipeId: 'r1', changes: { title: 'Chili' } },
    recipeDelete: { recipeId: 'r1' },
    recipeRestore: { recipeIds: ['r1'] },
  };

  it.each(Object.entries(mealMutationKeys).filter(([kind]) => kind !== 'planSet'))('%s has an overlay that changes the data', (kind, key) => {
    // A restore only changes a deleted recipe, so it starts from one.
    const start = { recipes: [kind === 'recipeRestore' ? { ...recipe, deletedAt: 5 } : recipe], serverTime: 0 };
    const result = applyPendingRecipes(start, [{ mutationKey: key, variables: { mutationId: 'm', at: 1_800_000_000_000, by: 'u', ...variables[kind] } }]);
    expect(result).not.toEqual(start);
  });

  it('planSet has an overlay that changes the data', () => {
    const start = { days: [], serverTime: 0 };
    const result = applyPendingPlan(start, [{ mutationKey: mealMutationKeys.planSet, variables: { mutationId: 'm', at: 1_800_000_000_000, by: 'u', day: '2026-11-16', meal: { title: 'Soup' } } }]);
    expect(result).not.toEqual(start);
  });
});

describe('itemsFromPlan', () => {
  const client = new QueryClient();
  registerMutations(client, vi.fn(), () => ({ tasks: [], proposals: [], serverTime: 0 }), vi.fn());
  const variables = {
    mutationId: 'm', at: 1_800_000_000_000, by: 'u',
    days: [{ day: '2026-11-16', title: 'Chilli', recipeId: 'r1', servings: 4 }],
    lines: [{ id: 'n1', text: 'onions', forRecipes: 'Chilli' }],
  };
  const pending = [{ mutationKey: itemMutationKeys.itemsFromPlan, variables }];

  it('is registered with a function and the household scope', () => {
    const defaults = client.getMutationDefaults(itemMutationKeys.itemsFromPlan);
    expect(defaults.mutationFn).toBeTypeOf('function');
    expect(defaults.scope).toEqual({ id: 'household' });
  });

  it('changes both the shopping list and the plan', () => {
    const items = { items: [], serverTime: 0 };
    const plan = { days: [{ day: '2026-11-16', meal: { recipeId: 'r1', title: 'Chilli', servings: 4 }, fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u', expiresAt: 9_999_999_999 }], serverTime: 0 };
    expect(applyPendingItems(items, pending)).not.toEqual(items);
    expect(applyPendingPlan(plan, pending)).not.toEqual(plan);
  });
});
