import { randomUUID } from 'node:crypto';
import { emitSecurityEvent } from '../security/events';
import { DEFAULT_SETTINGS } from '../shared/household';
import { ConditionFailedError } from '../store';
import type { Store } from '../store';
import { hhPk, membershipKey, memberSk } from './keys';
import { HouseholdError } from './types';

export interface CreateHouseholdInput {
  userId: string;
  name: string;
  timezone: string;
  displayName: string;
  nowMs?: number;
}

// One transaction: the household, its first member and the membership lookup all exist, or none of them does. The lookup is
// written put-if-absent, so a person who already belongs to a household cannot make a second one, even by racing themselves.
export async function createHousehold(
  store: Store,
  input: CreateHouseholdInput,
  emit: typeof emitSecurityEvent = emitSecurityEvent,
): Promise<{ householdId: string }> {
  const householdId = randomUUID();
  const at = new Date(input.nowMs ?? Date.now()).toISOString();

  try {
    await store.transact([
      { put: { PK: hhPk(householdId), SK: 'META', name: input.name, timezone: input.timezone, createdBy: input.userId, createdAt: at, memberCount: 1 }, ifAbsent: true },
      { put: { PK: hhPk(householdId), SK: memberSk(input.userId), displayName: input.displayName, settings: structuredClone(DEFAULT_SETTINGS), joinedAt: at }, ifAbsent: true },
      { put: { ...membershipKey(input.userId), householdId }, ifAbsent: true },
    ]);
  } catch (error) {
    if (error instanceof ConditionFailedError) throw new HouseholdError('already_member', 409);
    throw error;
  }

  await emit({ event: 'household_created', userId: input.userId, householdId, at });
  return { householdId };
}
