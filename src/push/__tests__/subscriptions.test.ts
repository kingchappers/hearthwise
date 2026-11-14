import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../store/memory';
import { listSubscribedUsers, loadSubscriptions, removeSubscription, saveSubscription } from '../subscriptions';

const sub = (endpoint: string) => ({ endpoint, p256dh: 'p', auth: 'a', createdAt: 1 });

describe('subscriptions', () => {
  it('keeps a person\'s devices and lists who is subscribed', async () => {
    const store = new MemoryStore();
    await saveSubscription(store, 'u1', sub('https://x/1'));
    await saveSubscription(store, 'u1', sub('https://x/2'));
    await saveSubscription(store, 'u2', sub('https://x/3'));
    expect((await loadSubscriptions(store, 'u1')).map(s => s.endpoint).sort()).toEqual(['https://x/1', 'https://x/2']);
    expect((await listSubscribedUsers(store)).sort()).toEqual(['u1', 'u2']);
  });

  it('saving the same device twice keeps one', async () => {
    const store = new MemoryStore();
    await saveSubscription(store, 'u1', sub('https://x/1'));
    await saveSubscription(store, 'u1', sub('https://x/1'));
    expect(await loadSubscriptions(store, 'u1')).toHaveLength(1);
  });

  it('removing the last device takes the person off the subscribed list', async () => {
    const store = new MemoryStore();
    await saveSubscription(store, 'u1', sub('https://x/1'));
    await removeSubscription(store, 'u1', 'https://x/1');
    expect(await loadSubscriptions(store, 'u1')).toEqual([]);
    expect(await listSubscribedUsers(store)).toEqual([]);
  });

  it('removing a device that is not there does nothing', async () => {
    await expect(removeSubscription(new MemoryStore(), 'u1', 'https://x/none')).resolves.toBeUndefined();
  });
});
