import { afterEach, describe, expect, it, vi } from 'vitest';
import { hhPk } from '../../household/keys';
import { loadContext } from '../../household/guard';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { loadSubscriptions } from '../subscriptions';
import { HELD_PREFIX, deleteHeldFor, notifyOther, type NotifyInput } from '../notifyOther';
import { NOW, U1, U2, fakeSender, twoMemberHousehold } from './fixture';

afterEach(() => { vi.restoreAllMocks(); });

const event = { type: 'task.completed', title: 'Alex did Hoover', body: 'Hoover is done', mutationId: 'm1' };
async function setup(settings = {}) {
  const h = await twoMemberHousehold(settings);
  const sender = fakeSender();
  const input = (over: Partial<NotifyInput> = {}): NotifyInput => ({
    store: h.store, sender, ctx: h.ctx1, event, fresh: true, clientAt: NOW - 1000, notify: true, serverNow: NOW, ...over,
  });
  return { ...h, sender, input };
}

describe('notifyOther', () => {
  it('sends the other member one push, never the person who made the change', async () => {
    const { sender, input } = await setup();
    await notifyOther(input());
    expect(sender.sent.map(s => s.endpoint)).toEqual([`https://push.example/${U2}`]);
    expect(sender.sent[0].payload).toMatchObject({ title: 'Alex did Hoover', body: 'Hoover is done', tag: 'notify-m1' });
  });

  it.each([
    ['notify is missing', { notify: undefined }],
    ['notify is false', { notify: false }],
    ['the write was a retry', { fresh: false }],
    ['clientAt is more than 30 minutes old', { clientAt: NOW - 31 * 60 * 1000 }],
    ['there is no sender configured', { sender: undefined }],
  ])('sends nothing when %s', async (_name, over) => {
    const { sender, input } = await setup();
    await notifyOther(input(over as Partial<NotifyInput>));
    expect(sender.sent).toEqual([]);
  });

  it('sends when clientAt is within 30 minutes', async () => {
    const { sender, input } = await setup();
    await notifyOther(input({ clientAt: NOW - 29 * 60 * 1000 }));
    expect(sender.sent).toHaveLength(1);
  });

  it('sends nothing when the household has no other member', async () => {
    const { sender, input, ctx1 } = await setup();
    await notifyOther(input({ ctx: { ...ctx1, members: [ctx1.member] } }));
    expect(sender.sent).toEqual([]);
  });

  it('holds the push during the other member\'s quiet hours and releases it when they end', async () => {
    const { store, sender, input, householdId } = await setup({ u2: { ...DEFAULT_SETTINGS, quietHours: { start: 18, end: 7 } } });
    await notifyOther(input({ ctx: (await loadContext(store, U1))! }));
    expect(sender.sent).toEqual([]);
    const held = await store.query(hhPk(householdId), { skPrefix: HELD_PREFIX });
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ title: 'Alex did Hoover', tag: 'notify-m1', recipient: U2 });
    expect(new Date(held[0].releaseAt as number).toISOString()).toBe('2026-11-14T07:00:00.000Z');
  });

  it('holds until the end of quiet hours that do not cross midnight', async () => {
    const { store, input, householdId } = await setup({ u2: { ...DEFAULT_SETTINGS, quietHours: { start: 19, end: 21 } } });
    await notifyOther(input({ ctx: (await loadContext(store, U1))! }));
    const [held] = await store.query(hhPk(householdId), { skPrefix: HELD_PREFIX });
    expect(new Date(held.releaseAt as number).toISOString()).toBe('2026-11-13T21:00:00.000Z');
  });

  it('records the task and cycle on a held completion, and undoing removes it', async () => {
    const { store, sender, input, householdId } = await setup({ u2: { ...DEFAULT_SETTINGS, quietHours: { start: 18, end: 7 } } });
    await notifyOther(input({ ctx: (await loadContext(store, U1))!, event: { ...event, ref: 't1#2' } }));
    expect((await store.query(hhPk(householdId), { skPrefix: HELD_PREFIX }))[0].ref).toBe('t1#2');
    await deleteHeldFor(store, householdId, 't1#2');
    expect(await store.query(hhPk(householdId), { skPrefix: HELD_PREFIX })).toEqual([]);
    expect(sender.sent).toEqual([]);
  });

  it('never throws, and gives up after two seconds, when the push service hangs', async () => {
    vi.useFakeTimers();
    try {
      const { input } = await setup();
      const hung = { send: () => new Promise<{ status: number }>(() => undefined) };
      const done = notifyOther(input({ sender: hung }));
      await vi.advanceTimersByTimeAsync(2100);
      await expect(done).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never throws when the sender throws', async () => {
    const { input } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(notifyOther(input({ sender: { send: async () => { throw new Error('boom'); } } }))).resolves.toBeUndefined();
  });

  it('removes a subscription the push service says is gone', async () => {
    const { store, input } = await setup();
    await notifyOther(input({ sender: { send: async () => ({ status: 410 }) } }));
    expect(await loadSubscriptions(store, U2)).toEqual([]);
  });

  it('does not log the household id with anything but its id and the event type on failure', async () => {
    const { input, householdId } = await setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await notifyOther(input({ sender: { send: async () => { throw new Error('boom'); } } }));
    const line = String(error.mock.calls[0]?.join(' '));
    expect(line).toContain(householdId);
    expect(line).toContain('task.completed');
    expect(line).not.toContain('Hoover');
  });
});

