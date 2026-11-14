import { createHash } from 'node:crypto';
import type { Key, Store } from '../store';

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: number;
}

const SUB_PREFIX = 'PUSHSUB#';
// One item per subscribed person, so the scheduler can list them without scanning the table.
const INDEX_PK = 'PUSHIDX';
const USER_PREFIX = 'USER#';

const userPk = (userId: string): string => `${USER_PREFIX}${userId}`;
const subKey = (userId: string, endpoint: string): Key => ({ PK: userPk(userId), SK: `${SUB_PREFIX}${createHash('sha256').update(endpoint).digest('hex')}` });
const indexKey = (userId: string): Key => ({ PK: INDEX_PK, SK: userPk(userId) });

export async function saveSubscription(store: Store, userId: string, sub: PushSubscriptionRecord): Promise<void> {
  await store.put({ ...subKey(userId, sub.endpoint), endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, createdAt: sub.createdAt });
  await store.put({ ...indexKey(userId), createdAt: sub.createdAt });
}

export async function loadSubscriptions(store: Store, userId: string): Promise<PushSubscriptionRecord[]> {
  const items = await store.query(userPk(userId), { skPrefix: SUB_PREFIX });
  return items.map(item => ({ endpoint: String(item.endpoint), p256dh: String(item.p256dh), auth: String(item.auth), createdAt: Number(item.createdAt) }));
}

export async function removeSubscription(store: Store, userId: string, endpoint: string): Promise<void> {
  await store.delete(subKey(userId, endpoint));
  if ((await loadSubscriptions(store, userId)).length === 0) await store.delete(indexKey(userId));
}

export async function listSubscribedUsers(store: Store): Promise<string[]> {
  const items = await store.query(INDEX_PK);
  return items.map(item => item.SK.slice(USER_PREFIX.length));
}
