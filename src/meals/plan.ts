import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { addDays, dayInZone } from '../shared/schedule';
import { ConditionFailedError } from '../store';
import type { Item as StoreItem, Store, TxOp } from '../store';
import { clampTime } from '../tasks/record';
import { TaskError } from '../tasks/types';
import { applyPlanWrite } from './applyPlan';
import { PLAN_PREFIX, planKey } from './keys';
import type { PlanData, PlanDay, PlanMeal } from './types';

const MAX_ATTEMPTS = 3;
const DAYS_BACK = 14;
const DAYS_AHEAD = 60;

export function toPlanDay(raw: StoreItem): PlanDay {
  const day: PlanDay = {
    day: raw.SK.slice(PLAN_PREFIX.length),
    fieldTimes: structuredClone((raw.fieldTimes as PlanDay['fieldTimes'] | undefined) ?? {}),
    updatedAt: Number(raw.updatedAt),
    updatedBy: String(raw.updatedBy ?? ''),
    expiresAt: Number(raw.expiresAt),
  };
  if (typeof raw.meal === 'object' && raw.meal !== null) day.meal = structuredClone(raw.meal as PlanMeal);
  if (typeof raw.addedAt === 'number') day.addedAt = raw.addedAt;
  if (typeof raw.addedBy === 'string') day.addedBy = raw.addedBy;
  return day;
}

// The stored form: the same fields, with the keys (the day is the sort key, not an attribute), and nothing set to undefined.
export function toPlanRecord(householdId: string, day: PlanDay): StoreItem {
  const { day: date, ...fields } = day;
  const record: StoreItem = { ...planKey(householdId, date), ...fields };
  for (const name of Object.keys(record)) if (record[name] === undefined) delete record[name];
  return record;
}

// The update that turns what is stored into `next`: the attributes that changed, and the ones that went away.
function updateFor(householdId: string, existing: StoreItem, next: PlanDay): TxOp {
  const after = toPlanRecord(householdId, next);
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(after)) {
    if (name !== 'PK' && name !== 'SK' && JSON.stringify(value) !== JSON.stringify(existing[name])) set[name] = value;
  }
  const remove = Object.keys(existing).filter(name => name !== 'PK' && name !== 'SK' && !(name in after));
  return { update: planKey(householdId, next.day), set, remove, ifEquals: { updatedAt: existing.updatedAt } };
}

export interface SetPlanInput {
  meal: PlanMeal | null;
  mealAt: number;
  mutationId: string;
  clientAt?: number;
}

// The day must be from 14 days before to 60 days after today in the household's zone, judged at the time the write was made, so a
// write made offline and replayed later is not refused for the time it waited.
function checkRange(day: string, clientAt: number, timezone: string): void {
  const today = dayInZone(clientAt, timezone);
  if (day < addDays(today, -DAYS_BACK) || day > addDays(today, DAYS_AHEAD)) throw new TaskError('invalid', 400, { field: 'day' });
}

export async function setPlanDay(
  store: Store, ctx: HouseholdContext, day: string, input: SetPlanInput, nowMs: number = Date.now(),
): Promise<WriteOutcome<{ day: PlanDay }>> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ day: PlanDay }>(store, householdId, input.mutationId);
  if (replayed) return replayed;
  checkRange(day, clampTime(input.clientAt ?? nowMs, nowMs), ctx.household.timezone);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(planKey(householdId, day), { consistent: true });
    const outcome = applyPlanWrite(raw ? toPlanDay(raw) : undefined, day, { meal: input.meal, mealAt: input.mealAt }, ctx.userId, nowMs);
    const current = outcome.day ?? toPlanDay(raw!);
    let ops: TxOp[] = [];
    if (outcome.result === 'created' && outcome.day) ops = [{ put: toPlanRecord(householdId, outcome.day), ifAbsent: true }];
    else if (outcome.result === 'applied' && outcome.day && raw) ops = [updateFor(householdId, raw, outcome.day)];
    try {
      return await withWriteRecord(store, householdId, input.mutationId, ops, { day: current }, Math.floor(nowMs / 1000));
    } catch (error) {
      if (ops.length > 0 && error instanceof ConditionFailedError && error.failedIndex === 0) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

// Plan days from `from` onwards. The store has no range query, so the whole `PLAN#` prefix is read and filtered here: it holds at most
// about 75 live days. Days whose expiry has passed are dropped, because the store's expiry can lag.
export async function listPlan(store: Store, ctx: HouseholdContext, from: string, nowMs: number = Date.now()): Promise<PlanData> {
  const raws = await store.query(hhPk(ctx.householdId), { skPrefix: PLAN_PREFIX });
  const days = raws.map(toPlanDay).filter(day => day.day >= from && day.expiresAt * 1000 > nowMs);
  days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return { days, serverTime: nowMs };
}
