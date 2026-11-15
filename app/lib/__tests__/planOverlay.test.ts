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
});
