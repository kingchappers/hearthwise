import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { calendarMutationKeys, itemMutationKeys, mealMutationKeys, moneyMutationKeys, registerMutations } from '~/lib/mutations';
import { applyPendingCalendar } from '~/lib/calendarOverlay';
import { applyPendingItems } from '~/lib/itemOverlay';
import { applyPendingMoney } from '~/lib/moneyOverlay';
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

describe('the money mutations', () => {
  const client = new QueryClient();
  registerMutations(client, vi.fn(), () => ({ tasks: [], proposals: [], serverTime: 0 }), vi.fn());

  it.each(Object.entries(moneyMutationKeys))('%s is registered with a function and the household scope', (_kind, key) => {
    const defaults = client.getMutationDefaults(key);
    expect(defaults.mutationFn).toBeTypeOf('function');
    expect(defaults.scope).toEqual({ id: 'household' });
  });

  const A = '11111111-1111-4111-8111-111111111111';
  const money = { paidBy: 'u', amountPence: 1000, sharePence: 500 };
  const base = {
    id: A, kind: 'expense' as const, ...money, description: 'Shop', on: '2026-11-15', fieldTimes: { description: 1, on: 1 }, status: 'waiting' as const, version: 1,
    createdBy: 'u', createdAt: 1, proposedBy: 'u', updatedAt: 1, updatedBy: 'u',
  };
  // A starting entry in the state each kind of write needs, and the variables that change it.
  const cases: Record<string, { entry?: object; vars: Record<string, unknown>; by?: string }> = {
    moneyAdd: { vars: { entry: { id: 'b'.repeat(8) + '-1111-4111-8111-111111111111', kind: 'loan', paidBy: 'u', amountPence: 100, sharePence: 100, description: 'L', on: '2026-11-15' } } },
    moneyEdit: { vars: { entryId: A, description: 'Better' } },
    moneyRespond: { vars: { entryId: A, response: 'agree', version: 1 }, by: 'other' },
    moneyChange: { entry: { status: 'agreed' }, vars: { entryId: A, version: 1, delete: true } },
    moneyChangeRespond: { entry: { status: 'agreed', pendingChange: { id: 'r1', by: 'u', at: 1, delete: true } }, vars: { entryId: A, response: 'agree', requestId: 'r1' }, by: 'other' },
    moneyChangeWithdraw: { entry: { status: 'agreed', pendingChange: { id: 'r1', by: 'u', at: 1, delete: true } }, vars: { entryId: A, requestId: 'r1' } },
    moneyDelete: { vars: { entryId: A } },
    moneyRestore: { entry: { deletedAt: 5, deletedBy: 'u' }, vars: { entries: [{ id: A, deletedAt: 5 }] }, by: 'other' },
  };

  it.each(Object.entries(moneyMutationKeys))('%s has an overlay that changes the data', (kind, key) => {
    const { entry, vars, by } = cases[kind];
    const start = { entries: kind === 'moneyAdd' ? [] : [{ ...base, ...entry }], serverTime: 0 };
    const result = applyPendingMoney(start, [{ mutationKey: key, variables: { mutationId: 'm', at: 1_800_000_000_000, by: by ?? 'u', ...vars } }]);
    expect(result).not.toEqual(start);
  });
});

describe('the calendar mutations', () => {
  const client = new QueryClient();
  registerMutations(client, vi.fn(), () => ({ tasks: [], proposals: [], serverTime: 0 }), vi.fn());

  it.each(Object.entries(calendarMutationKeys))('%s is registered with a function and the household scope', (_kind, key) => {
    const defaults = client.getMutationDefaults(key);
    expect(defaults.mutationFn).toBeTypeOf('function');
    expect(defaults.scope).toEqual({ id: 'household' });
  });

  const A = '11111111-1111-4111-8111-111111111111';
  const schedule = { startOn: '2026-11-19', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' as const }, skipOn: [] };
  const base = {
    id: A, kind: 'event' as const, title: 'Dentist', who: 'both', private: false, ...schedule, reminders: {}, fieldTimes: { title: 1, schedule: 1, people: 1 },
    createdBy: 'u', createdAt: 1, updatedAt: 1, updatedBy: 'u',
  };
  const cases: Record<string, { event?: object; deleted?: object; vars: Record<string, unknown> }> = {
    createEvent: { vars: { event: { id: 'b'.repeat(8) + '-1111-4111-8111-111111111111', kind: 'event', title: 'Walk', schedule, people: { who: 'both', private: false } } } },
    editEvent: { event: {}, vars: { eventId: A, title: 'Dentist, Smith St' } },
    deleteEvent: { event: {}, vars: { eventId: A } },
    setReminders: { event: {}, vars: { eventId: A, list: [{ from: 'start', minutes: 30 }] } },
    eventRestore: { deleted: { deletedAt: 5, deletedBy: 'u' }, vars: { entries: [{ id: A, deletedAt: 5 }] } },
  };

  it.each(Object.entries(calendarMutationKeys))('%s has an overlay that changes the data', (kind, key) => {
    const { event, deleted, vars } = cases[kind];
    const start = { events: event ? [{ ...base, ...event }] : [], deleted: deleted ? [{ ...base, ...deleted }] : [], serverTime: 0 };
    const result = applyPendingCalendar(start, [{ mutationKey: key, variables: { mutationId: 'm', at: 1_800_000_000_000, by: 'u', ...vars } }]);
    expect(result).not.toEqual(start);
  });
});
