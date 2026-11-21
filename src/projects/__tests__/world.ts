import { vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { MemoryStore } from '../../store/memory';

export const NOW = Date.parse('2026-11-14T10:00:00.000Z');
export const U1 = 'auth0|u1';
export const U2 = 'auth0|u2';

let n = 0;
export const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
export const resetIds = (): void => { n = 0; };

export interface World {
  store: MemoryStore;
  householdId: string;
  ctx1: HouseholdContext;
  ctx2: HouseholdContext;
}

// A household of two people, Sam (u1) and Alex (u2), in an empty in-memory store.
export async function makeWorld(): Promise<World> {
  resetIds();
  const store = new MemoryStore();
  const { householdId } = await createHousehold(store, { userId: U1, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW }, vi.fn());
  await store.put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: DEFAULT_SETTINGS, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey(U2), householdId });
  const ctx1 = (await loadContext(store, U1))!;
  const ctx2 = (await loadContext(store, U2))!;
  return { store, householdId, ctx1, ctx2 };
}
