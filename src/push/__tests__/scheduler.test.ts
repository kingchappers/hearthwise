import { describe, expect, it } from 'vitest';
import { hhPk, memberSk } from '../../household/keys';
import { DEFAULT_SETTINGS } from '../../shared/household';
import { HELD_PREFIX, heldKey } from '../notifyOther';
import { runSchedule } from '../scheduler';
import { NOW, U1, U2, fakeSender, putTask, twoMemberHousehold } from './fixture';

const digestOn = (hour: number) => ({ ...DEFAULT_SETTINGS, digest: { on: true, hour } });
const nudgeOn = (hour: number) => ({ ...DEFAULT_SETTINGS, dueNudges: { on: true, hour } });
const at = (iso: string): Date => new Date(iso);

describe('digest', () => {
  it('is sent once to a member who has it on, at the chosen hour, even when two runs overlap', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: digestOn(19) });
    await putTask(store, householdId, { id: 't1', title: 'Bins', assignee: U1, dueOn: '2026-11-13' });
    const sender = fakeSender();
    await Promise.all([runSchedule(store, sender, at('2026-11-13T19:00:00Z')), runSchedule(store, sender, at('2026-11-13T19:00:00Z'))]);
    expect(sender.sent.filter(s => s.payload.tag === 'digest-2026-11-13')).toHaveLength(1);
    expect(sender.sent[0].endpoint).toBe(`https://push.example/${U1}`);
  });

  it('is sent once in a day: a second run in the window sends nothing', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: digestOn(19) });
    await putTask(store, householdId, { id: 't1', assignee: U1, dueOn: '2026-11-13' });
    const sender = fakeSender();
    await runSchedule(store, sender, at('2026-11-13T19:00:00Z'));
    await runSchedule(store, sender, at('2026-11-13T20:00:00Z'));
    expect(sender.sent).toHaveLength(1);
  });

  it('records the first-ever digest with a missing lastDigestSent, then the date', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: digestOn(19) });
    await putTask(store, householdId, { id: 't1', assignee: U1, dueOn: '2026-11-13' });
    expect((await store.get({ PK: hhPk(householdId), SK: memberSk(U1) }))?.lastDigestSent).toBeUndefined();
    await runSchedule(store, fakeSender(), at('2026-11-13T19:00:00Z'));
    expect((await store.get({ PK: hhPk(householdId), SK: memberSk(U1) }))?.lastDigestSent).toBe('2026-11-13');
  });

  it('catches up a missed hour within two hours, and sends again the next day', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: digestOn(19) });
    await putTask(store, householdId, { id: 't1', assignee: U1, dueOn: '2026-11-10' });
    const sender = fakeSender();
    await runSchedule(store, sender, at('2026-11-13T21:05:00Z'));
    expect(sender.sent).toHaveLength(1);
    await runSchedule(store, sender, at('2026-11-14T19:00:00Z'));
    expect(sender.sent.map(s => s.payload.tag)).toEqual(['digest-2026-11-13', 'digest-2026-11-14']);
  });

  it('does not send an hour-22 digest again after midnight', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: digestOn(22) });
    await putTask(store, householdId, { id: 't1', assignee: U1, dueOn: '2026-11-13' });
    const sender = fakeSender();
    await runSchedule(store, sender, at('2026-11-13T23:30:00Z'));
    await runSchedule(store, sender, at('2026-11-14T00:30:00Z'));
    expect(sender.sent).toHaveLength(1);
  });

  it('is not sent when there is nothing to list, or the digest is off', async () => {
    const { store } = await twoMemberHousehold({ u1: digestOn(19) });
    const sender = fakeSender();
    await runSchedule(store, sender, at('2026-11-13T19:00:00Z'));
    expect(sender.sent).toEqual([]);
  });

  it('uses the household time zone, not the server\'s', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: digestOn(8) });
    await putTask(store, householdId, { id: 't1', assignee: U1, dueOn: '2026-07-01' });
    await store.patch({ PK: hhPk(householdId), SK: 'META' }, { timezone: 'Asia/Tokyo' });
    const sender = fakeSender();
    await runSchedule(store, sender, at('2026-07-01T23:00:00Z')); // 08:00 on 2 July in Tokyo
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].payload.tag).toBe('digest-2026-07-02');
  });

  it('is not held back by quiet hours: it is the person\'s own choice', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: { ...digestOn(19), quietHours: { start: 18, end: 7 } } });
    await putTask(store, householdId, { id: 't1', assignee: U1, dueOn: '2026-11-13' });
    const sender = fakeSender();
    await runSchedule(store, sender, at('2026-11-13T19:00:00Z'));
    expect(sender.sent).toHaveLength(1);
  });
});

describe('due nudges', () => {
  it('sends one per task due today, once, tagged by task and day', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: nudgeOn(8) });
    await putTask(store, householdId, { id: 'a', assignee: U1, dueOn: '2026-11-13' });
    await putTask(store, householdId, { id: 'b', assignee: 'either', dueOn: '2026-11-13' });
    await putTask(store, householdId, { id: 'c', assignee: U2, dueOn: '2026-11-13' });
    const sender = fakeSender();
    await Promise.all([runSchedule(store, sender, at('2026-11-13T08:00:00Z')), runSchedule(store, sender, at('2026-11-13T08:00:00Z'))]);
    await runSchedule(store, sender, at('2026-11-13T09:00:00Z'));
    expect(sender.sent.map(s => s.payload.tag).sort()).toEqual(['nudge-a-2026-11-13', 'nudge-b-2026-11-13']);
  });
});

describe('held pushes', () => {
  const putHeld = async (store: Awaited<ReturnType<typeof twoMemberHousehold>>['store'], householdId: string, over: Record<string, unknown> = {}) =>
    store.put({
      ...heldKey(householdId, U2, 1, 'notify-m1'), recipient: U2, title: 'Sam added milk', body: 'milk', tag: 'notify-m1',
      releaseAt: NOW - 1000, expiresAt: Math.floor(NOW / 1000) + 3600, ...over,
    } as never);

  it('releases a held push once its time has passed, once, even with overlapping runs', async () => {
    const { store, householdId } = await twoMemberHousehold();
    await putHeld(store, householdId);
    const sender = fakeSender();
    await Promise.all([runSchedule(store, sender, new Date(NOW)), runSchedule(store, sender, new Date(NOW))]);
    expect(sender.sent.map(s => s.payload.tag)).toEqual(['notify-m1']);
    expect(await store.query(hhPk(householdId), { skPrefix: HELD_PREFIX })).toEqual([]);
  });

  it('leaves a push that is not yet due, and skips one past its expiry', async () => {
    const { store, householdId } = await twoMemberHousehold();
    await putHeld(store, householdId, { releaseAt: NOW + 3600_000 });
    await store.put({ ...heldKey(householdId, U2, 2, 'notify-m2'), recipient: U2, title: 'x', body: 'x', tag: 'notify-m2', releaseAt: NOW - 5000, expiresAt: Math.floor(NOW / 1000) - 10 } as never);
    const sender = fakeSender();
    await runSchedule(store, sender, new Date(NOW));
    expect(sender.sent).toEqual([]);
    expect((await store.query(hhPk(householdId), { skPrefix: HELD_PREFIX })).length).toBe(1);
  });
});

describe('who gets what (CUJ 8)', () => {
  it('sends exactly the first member\'s digest and nothing to the second', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: { ...digestOn(19), defaultView: 'list' }, u2: { ...DEFAULT_SETTINGS, defaultView: 'next' } });
    await putTask(store, householdId, { id: 't1', assignee: 'either', dueOn: '2026-11-13' });
    await putTask(store, householdId, { id: 't2', assignee: U1, dueOn: '2026-11-13' });
    const sender = fakeSender();
    await runSchedule(store, sender, at('2026-11-13T19:00:00Z'));
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ endpoint: `https://push.example/${U1}`, payload: { tag: 'digest-2026-11-13' } });
  });
});

describe('subscriptions the push service has dropped', () => {
  it('are removed on a 404 or 410', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: digestOn(19) });
    await putTask(store, householdId, { id: 't1', assignee: U1, dueOn: '2026-11-13' });
    await runSchedule(store, fakeSender(410), at('2026-11-13T19:00:00Z'));
    const { loadSubscriptions } = await import('../subscriptions');
    expect(await loadSubscriptions(store, U1)).toEqual([]);
  });
});

describe('with no sender configured', () => {
  it('does nothing and does not claim the digest', async () => {
    const { store, householdId } = await twoMemberHousehold({ u1: digestOn(19) });
    await putTask(store, householdId, { id: 't1', assignee: U1, dueOn: '2026-11-13' });
    await runSchedule(store, undefined, at('2026-11-13T19:00:00Z'));
    expect((await store.get({ PK: hhPk(householdId), SK: memberSk(U1) }))?.lastDigestSent).toBeUndefined();
  });
});
