import { describe, expect, it } from 'vitest';
import type { PlanData, PlanDay } from '../../../src/meals/types';
import { mealMutationKeys } from '../mutations';
import { applyPendingPlan } from '../planOverlay';

const ME = 'auth0|me';
const AT = 1_800_000_000_000;
const day = (over: Partial<PlanDay> = {}): PlanDay => ({ day: '2026-11-16', meal: { title: 'Chilli' }, fieldTimes: { meal: 100 }, updatedAt: 100, updatedBy: ME, expiresAt: 9_999_999_999, ...over });
const data = (days: PlanDay[] = [day()]): PlanData => ({ days, serverTime: AT });
const pending = (variables: Record<string, unknown>) => ({ mutationKey: mealMutationKeys.planSet, variables: { mutationId: 'm', at: AT, by: ME, ...variables } });

describe('applyPendingPlan', () => {
  it('shows a day that is waiting to be set, in date order', () => {
    const result = applyPendingPlan(data([day({ day: '2026-11-18' })]), [pending({ day: '2026-11-16', meal: { title: 'Soup' } })]);
    expect(result.days.map(entry => entry.day)).toEqual(['2026-11-16', '2026-11-18']);
    expect(result.days[0]).toMatchObject({ meal: { title: 'Soup' }, updatedBy: ME });
  });

  it('changes a day that is already there, and clears the "On the list" marker when the dinner changes', () => {
    const marked = day({ addedAt: 50, addedBy: 'auth0|them' });
    const result = applyPendingPlan(data([marked]), [pending({ day: '2026-11-16', meal: { title: 'Soup' } })]);
    expect(result.days[0].meal).toEqual({ title: 'Soup' });
    expect(result.days[0].addedAt).toBeUndefined();
    expect(result.days[0].addedBy).toBeUndefined();
  });

  it('shows a pending clear as a day with no meal, keeping the time', () => {
    const result = applyPendingPlan(data(), [pending({ day: '2026-11-16', meal: null })]);
    expect(result.days[0].meal).toBeUndefined();
    expect(result.days[0].fieldTimes.meal).toBe(AT);
  });

  it('lets a pending write lose to a newer time already on the day, as the server will decide', () => {
    const newer = day({ fieldTimes: { meal: AT + 5000 } });
    const result = applyPendingPlan(data([newer]), [pending({ day: '2026-11-16', meal: { title: 'Old' } })]);
    expect(result.days[0].meal).toEqual({ title: 'Chilli' });
  });

  it('applies pending writes in order', () => {
    const result = applyPendingPlan(data([]), [
      pending({ day: '2026-11-16', meal: { title: 'First' }, at: AT }),
      pending({ day: '2026-11-16', meal: { title: 'Second' }, at: AT + 1 }),
    ]);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].meal?.title).toBe('Second');
  });

  it('leaves the data alone for a mutation that is not a plan one, or has no variables', () => {
    const base = data();
    expect(applyPendingPlan(base, [{ mutationKey: ['household', 'itemTick'], variables: {} }, { mutationKey: mealMutationKeys.planSet, variables: undefined }])).toBe(base);
  });

  describe('itemsFromPlan', () => {
    const chilli = { recipeId: 'r1', title: 'Chilli', servings: 4 };
    const added = (days: object[]) => ({ mutationKey: ['household', 'itemsFromPlan'] as const, variables: { mutationId: 'm', at: AT, by: ME, days, lines: [{ id: 'n1', text: 'onions' }] } });

    it('marks a listed day whose dinner is the one added, with who and when', () => {
      const result = applyPendingPlan(data([day({ meal: chilli })]), [added([{ day: '2026-11-16', ...chilli }])]);
      expect(result.days[0]).toMatchObject({ addedAt: AT, addedBy: ME });
    });

    it('does not mark a day whose dinner or servings differ, a day that is not there, or a day that is not listed', () => {
      const base = data([day({ meal: chilli }), day({ day: '2026-11-17', meal: chilli })]);
      const result = applyPendingPlan(base, [added([{ day: '2026-11-16', ...chilli, servings: 2 }, { day: '2026-11-20', ...chilli }])]);
      expect(result.days.map(entry => entry.addedAt)).toEqual([undefined, undefined]);
    });

    it('does not change the day\'s time of change, as the marker is display only', () => {
      const result = applyPendingPlan(data([day({ meal: chilli })]), [added([{ day: '2026-11-16', ...chilli }])]);
      expect(result.days[0].fieldTimes).toEqual({ meal: 100 });
    });

    it('is undone by a later pending change of dinner on the same day', () => {
      const result = applyPendingPlan(data([day({ meal: chilli })]), [
        added([{ day: '2026-11-16', ...chilli }]),
        pending({ day: '2026-11-16', meal: { title: 'Soup' }, at: AT + 1 }),
      ]);
      expect(result.days[0].addedAt).toBeUndefined();
    });
  });
});
