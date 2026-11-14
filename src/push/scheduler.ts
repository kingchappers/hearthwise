import { loadContext } from '../household/guard';
import { hhPk, memberSk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { ConditionFailedError } from '../store';
import type { Store } from '../store';
import { listTasks } from '../tasks/tasks';
import { HELD_PREFIX } from './notifyOther';
import { deliver, type PushSender } from './sender';
import { listSubscribedUsers } from './subscriptions';
import { digestFor, localMoment, nudgesFor, type PushMessage } from './select';

type Field = 'lastDigestSent' | 'lastNudgeSent';

// Marks the day as sent, only if nobody else has since. The claim comes before the send: a second run loses it and sends nothing.
async function claim(store: Store, ctx: HouseholdContext, field: Field, date: string): Promise<boolean> {
  const previous = ctx.member[field];
  if (previous === date) return false;
  try {
    await store.transact([{
      update: { PK: hhPk(ctx.householdId), SK: memberSk(ctx.userId) },
      set: { [field]: date },
      ...(previous === undefined ? { ifMissing: [field] } : { ifEquals: { [field]: previous } }),
    }]);
    return true;
  } catch (error) {
    if (error instanceof ConditionFailedError) return false;
    throw error;
  }
}

async function sendReminders(store: Store, sender: PushSender, ctx: HouseholdContext, now: Date): Promise<void> {
  const moment = localMoment(now, ctx.household.timezone);
  const recipient = { userId: ctx.userId, settings: ctx.member.settings };
  const { tasks } = await listTasks(store, ctx, now.getTime());
  const send = async (messages: PushMessage[]): Promise<void> => {
    for (const message of messages) await deliver(store, sender, ctx.userId, message);
  };

  const digest = digestFor(recipient, tasks, ctx, moment);
  if (digest && await claim(store, ctx, 'lastDigestSent', moment.date)) await send([digest]);

  const nudges = nudgesFor(recipient, tasks, ctx, moment);
  if (nudges.length > 0 && await claim(store, ctx, 'lastNudgeSent', moment.date)) await send(nudges);
}

// Each held push is claimed with a delete that needs it to exist, and sent only by the run whose delete succeeded.
// One for a person who has since left the household is deleted and never sent: they must not keep receiving its content.
async function releaseHeld(store: Store, sender: PushSender, ctx: HouseholdContext, nowMs: number): Promise<void> {
  for (const item of await store.query(hhPk(ctx.householdId), { skPrefix: HELD_PREFIX })) {
    if (Number(item.releaseAt) > nowMs) continue;
    try {
      await store.delete({ PK: item.PK, SK: item.SK }, { ifPresent: true });
    } catch (error) {
      if (error instanceof ConditionFailedError) continue;
      throw error;
    }
    if (Number(item.expiresAt) * 1000 < nowMs) continue;
    if (!ctx.members.some(member => member.userId === item.recipient)) continue;
    await deliver(store, sender, String(item.recipient), {
      title: String(item.title), body: String(item.body), tag: String(item.tag), ...(typeof item.url === 'string' ? { url: item.url } : {}),
    });
  }
}

// Runs once an hour. One person's failure is logged and never stops the rest.
export async function runSchedule(store: Store, sender: PushSender | undefined, now: Date): Promise<void> {
  if (!sender) return;
  const released = new Set<string>();
  for (const userId of await listSubscribedUsers(store)) {
    try {
      const ctx = await loadContext(store, userId);
      if (!ctx) continue;
      await sendReminders(store, sender, ctx, now);
      if (!released.has(ctx.householdId)) {
        released.add(ctx.householdId);
        await releaseHeld(store, sender, ctx, now.getTime());
      }
    } catch (error) {
      console.error(`Scheduler failed for user ${userId}: ${error instanceof Error ? error.name : 'Error'}`);
    }
  }
}
