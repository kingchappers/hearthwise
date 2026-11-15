import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const calls = vi.hoisted(() => [] as { kind: string; vars: Record<string, unknown> }[]);
const show = vi.hoisted(() => vi.fn());

vi.mock('@mantine/notifications', () => ({ notifications: { show, hide: vi.fn() } }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'Europe/London' }, members: [], me: { userId: 'u1', displayName: 'Sam', joinedAt: '', settings: {} } } }),
}));
vi.mock('~/lib/letThemKnow', () => ({ notifyFields: () => ({ notify: true }) }));
vi.mock('~/lib/mutations', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/mutations')>()),
  useItemMutation: (kind: string) => ({ mutate: (vars: Record<string, unknown>) => { calls.push({ kind, vars }); } }),
}));

import { useItemActions } from '../useItemActions';

beforeEach(() => { calls.length = 0; show.mockClear(); });

describe('useItemActions: addFromPlan', () => {
  const days = [{ day: '2026-11-16', title: 'Chilli', recipeId: 'r1', servings: 4 }];
  const lines = [{ id: 'n1', text: 'onions', quantity: '3', forRecipes: 'Chilli' }, { id: 'n2', text: 'rice' }];

  it('queues itemsFromPlan with the review\'s own mutation id, so a retry or a second tap is the same write', () => {
    const { result } = renderHook(() => useItemActions());
    result.current.addFromPlan({ mutationId: 'from-the-review', days, lines });
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe('itemsFromPlan');
    expect(calls[0].vars).toMatchObject({ mutationId: 'from-the-review', days, lines, by: 'u1', notify: true });
    expect(calls[0].vars.at).toBeTypeOf('number');
  });

  it('says how many lines were added', () => {
    const { result } = renderHook(() => useItemActions());
    result.current.addFromPlan({ mutationId: 'm', days, lines });
    expect(show.mock.calls.at(-1)![0].message).toBe('Added 2 lines to the shopping list');
    result.current.addFromPlan({ mutationId: 'm2', days, lines: [lines[1]] });
    expect(show.mock.calls.at(-1)![0].message).toBe('Added 1 line to the shopping list');
  });
});
