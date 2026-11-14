import { vi } from 'vitest';
import { loadContext } from '../../household/guard';
import { createHousehold } from '../../household/households';
import { hhPk, membershipKey, memberSk } from '../../household/keys';
import type { HouseholdContext } from '../../household/types';
import { DEFAULT_SETTINGS, type MemberSettings } from '../../shared/household';
import { MemoryStore } from '../../store/memory';
import { taskKey } from '../../tasks/keys';
import type { Task } from '../../tasks/types';
import type { PushPayload, PushSender } from '../sender';
import { saveSubscription } from '../subscriptions';

export const U1 = 'auth0|u1';
export const U2 = 'auth0|u2';
export const NOW = Date.parse('2026-11-13T19:10:00.000Z'); // 19:10 in London (GMT)

export interface Sent { endpoint: string; payload: PushPayload }

export function fakeSender(status = 201): PushSender & { sent: Sent[] } {
  const sent: Sent[] = [];
  return { sent, send: vi.fn(async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload }); return { status }; }) };
}

export async function twoMemberHousehold(settings: { u1?: Partial<MemberSettings>; u2?: Partial<MemberSettings> } = {}): Promise<{
  store: MemoryStore; ctx1: HouseholdContext; ctx2: HouseholdContext; householdId: string;
}> {
  const store = new MemoryStore();
  const { householdId } = await createHousehold(store, { userId: U1, name: 'Home', timezone: 'Europe/London', displayName: 'Sam', nowMs: NOW }, vi.fn());
  await store.put({ PK: hhPk(householdId), SK: memberSk(U2), displayName: 'Alex', settings: { ...DEFAULT_SETTINGS, ...settings.u2 }, joinedAt: '2026-11-13T11:00:00.000Z' });
  await store.put({ ...membershipKey(U2), householdId });
  if (settings.u1) await store.patch({ PK: hhPk(householdId), SK: memberSk(U1) }, { settings: { ...DEFAULT_SETTINGS, ...settings.u1 } });
  for (const user of [U1, U2]) await saveSubscription(store, user, { endpoint: `https://push.example/${user}`, p256dh: 'p', auth: 'a', createdAt: NOW });
  return { store, ctx1: (await loadContext(store, U1))!, ctx2: (await loadContext(store, U2))!, householdId };
}

export async function putTask(store: MemoryStore, householdId: string, over: Partial<Task> & { id: string }): Promise<Task> {
  const task: Task = {
    title: 'T', fieldTimes: {}, assignee: 'either', repeat: { type: 'none' }, cycleSeq: 1, ruleVersion: 1, checklist: [],
    checklistState: {}, status: 'open', createdBy: U1, updatedAt: NOW, ...over,
  };
  await store.put({ ...taskKey(householdId, task.id), ...task } as never);
  return task;
}
