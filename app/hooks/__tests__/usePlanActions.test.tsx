import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const calls = vi.hoisted(() => [] as { kind: string; vars: Record<string, unknown> }[]);
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'Europe/London' }, members: [], me: { userId: 'u1', displayName: 'Sam', joinedAt: '', settings: {} } } }),
}));
vi.mock('~/lib/letThemKnow', () => ({ notifyFields: () => ({ notify: true }) }));
vi.mock('~/lib/mutations', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/mutations')>()),
  useMealMutation: (kind: string) => ({ mutate: (vars: Record<string, unknown>) => { calls.push({ kind, vars }); } }),
}));

import { usePlanActions } from '../usePlanActions';

beforeEach(() => { calls.length = 0; });

describe('usePlanActions', () => {
  it('set queues planSet for the day with the meal, a mutation id, the time, who made it, and the Let them know tick', () => {
    const { result } = renderHook(() => usePlanActions());
    result.current.set('2026-11-16', { recipeId: 'r1', title: 'Chilli', servings: 4 });
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe('planSet');
    expect(calls[0].vars).toMatchObject({ day: '2026-11-16', meal: { recipeId: 'r1', title: 'Chilli', servings: 4 }, by: 'u1', notify: true });
    expect(calls[0].vars.mutationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[0].vars.at).toBeTypeOf('number');
  });

  it('clear queues planSet with a null meal', () => {
    const { result } = renderHook(() => usePlanActions());
    result.current.clear('2026-11-16');
    expect(calls[0]).toMatchObject({ kind: 'planSet', vars: { day: '2026-11-16', meal: null } });
  });
});
