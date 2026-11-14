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

import { vi } from 'vitest';
import { deliver } from '../sender';

describe('delivering to a person\'s devices', () => {
  const FCM = (n: number | string) => `https://fcm.googleapis.com/fcm/send/${n}`;
  const payload = { title: 't', body: 'b', tag: 'x' };

  it('never calls an address that is not a push service, and removes the record', async () => {
    const store = new MemoryStore();
    await saveSubscription(store, 'u1', sub('https://169.254.169.254/latest'));
    await saveSubscription(store, 'u1', sub(FCM('ok')));
    const send = vi.fn().mockResolvedValue({ status: 201 });
    expect(await deliver(store, { send }, 'u1', payload)).toBe(1);
    expect(send.mock.calls.map(call => call[0].endpoint)).toEqual([FCM('ok')]);
    expect((await loadSubscriptions(store, 'u1')).map(s => s.endpoint)).toEqual([FCM('ok')]);
  });

  it('sends to the newest ten devices and removes the rest, however they came to be stored', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 12; i += 1) await saveSubscription(store, 'u1', { endpoint: FCM(i), p256dh: 'p', auth: 'a', createdAt: i });
    const send = vi.fn().mockResolvedValue({ status: 201 });
    expect(await deliver(store, { send }, 'u1', payload)).toBe(10);
    const kept = (await loadSubscriptions(store, 'u1')).map(s => s.createdAt).sort((a, b) => a - b);
    expect(kept).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
