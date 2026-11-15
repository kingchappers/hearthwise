import type { WriteOutcome } from '../api/writeRecord';
import type { HouseholdContext } from '../household/types';
import type { Store } from '../store';
import { askChange as applyAsk, respondToChange, withdrawChange as applyWithdraw } from './applyEntry';
import { assertMoney, preparedFrom, requireRaw, toEntry, writeEntry } from './entries';
import type { ChangeInput, ChangeRespondInput, ChangeWithdrawInput, MoneyEntry } from './types';

type Outcome = Promise<WriteOutcome<{ entry: MoneyEntry }>>;

// Asks the other person to agree to a change of the money of an agreed entry, or to its deletion. The entry keeps counting at its
// current figure until the request is answered. Nothing expires, and nothing is sent again.
export function askChange(store: Store, ctx: HouseholdContext, id: string, input: ChangeInput, nowMs: number = Date.now()): Outcome {
  return writeEntry(store, ctx, id, input.mutationId, nowMs, async raw => {
    const found = requireRaw(raw);
    const existing = toEntry(found);
    const applied = applyAsk(existing, { id: input.mutationId, version: input.version, ...(input.money ? { money: input.money } : { delete: true as const }) }, ctx.userId, nowMs);
    if (applied.ok && input.money) await assertMoney(store, ctx, existing.kind, input.money, 'money');
    return preparedFrom(ctx.householdId, found, applied);
  });
}

// The member who did not ask answers. Agreeing applies the change in the same transaction; declining only removes the request.
export function respondChange(store: Store, ctx: HouseholdContext, id: string, input: ChangeRespondInput, nowMs: number = Date.now()): Outcome {
  return writeEntry(store, ctx, id, input.mutationId, nowMs, raw => {
    const found = requireRaw(raw);
    return preparedFrom(ctx.householdId, found, respondToChange(toEntry(found), input.response, input.requestId, ctx.userId, nowMs));
  });
}

export function withdrawChange(store: Store, ctx: HouseholdContext, id: string, input: ChangeWithdrawInput, nowMs: number = Date.now()): Outcome {
  return writeEntry(store, ctx, id, input.mutationId, nowMs, raw => {
    const found = requireRaw(raw);
    return preparedFrom(ctx.householdId, found, applyWithdraw(toEntry(found), input.requestId, ctx.userId, nowMs));
  });
}
