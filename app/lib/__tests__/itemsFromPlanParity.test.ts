import { describe, expect, it, vi } from 'vitest';
import { addPlanToList } from '../../../src/meals/addToList';
import { loadContext } from '../../../src/household/guard';
import { createHousehold } from '../../../src/household/households';
import { listItems } from '../../../src/shopping/items';
import { MemoryStore } from '../../../src/store/memory';
import { applyPendingItems } from '../itemOverlay';
import { itemMutationKeys } from '../mutations';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const ME = 'auth0|me';

describe('the shopping lines the overlay shows', () => {
  it('equal the shopping lines the server stores, so nothing jumps when the real ones arrive', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const store = new MemoryStore();
    await createHousehold(store, { userId: ME, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW }, vi.fn());
    const ctx = (await loadContext(store, ME))!;
    const days = [{ day: '2026-11-16', title: 'Chilli', recipeId: '11111111-1111-4111-8111-111111111111', servings: 4 }];
    const lines = [
      { id: '22222222-2222-4222-8222-000000000001', text: 'onions', quantity: '3', forRecipes: 'Chilli, Pasta bake' },
      { id: '22222222-2222-4222-8222-000000000002', text: 'salt to taste', forRecipes: 'Chilli' },
    ];
    const at = NOW - 1000;

    await addPlanToList(store, ctx, { days, lines, mutationId: '33333333-3333-4333-8333-000000000001', clientAt: at }, NOW);
    const stored = (await listItems(store, ctx, NOW)).items;

    const shown = applyPendingItems({ items: [], serverTime: NOW }, [{ mutationKey: itemMutationKeys.itemsFromPlan, variables: { mutationId: 'm', at, by: ME, days, lines } }]).items;
    const pick = (item: (typeof stored)[number]) => ({ id: item.id, text: item.text, quantity: item.quantity, forRecipes: item.forRecipes, ticked: item.ticked, fieldTimes: item.fieldTimes });
    expect(shown.map(pick)).toEqual(stored.map(pick));
  });
});
