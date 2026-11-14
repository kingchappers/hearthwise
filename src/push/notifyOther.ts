import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { ConditionFailedError } from '../store';
import type { Key, Store } from '../store';
import { otherMemberId } from '../tasks/ownership';
import { deliver, type PushPayload, type PushSender } from './sender';
import { isQuietHour, localMoment } from './select';

export const HELD_PREFIX = 'HELD#';
const CLIENT_AT_LIMIT_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 2000;
const HELD_LIFE_SECONDS = 24 * 60 * 60;
const STEP_MS = 15 * 60 * 1000;

export const heldKey = (householdId: string, recipient: string, releaseAt: number, tag: string): Key =>
  ({ PK: hhPk(householdId), SK: `${HELD_PREFIX}${recipient}#${String(releaseAt).padStart(15, '0')}#${tag}` });

export interface NotifyEvent {
  // For the log line only (never the content): "task.completed".
  type: string;
  title: string;
  body: string;
  mutationId: string;
  // Set for a completion, so undoing it can take the held push back: "<taskId>#<cycleSeq>".
  ref?: string;
}

export interface NotifyInput {
  store: Store;
  sender?: PushSender;
  ctx: HouseholdContext;
  event: NotifyEvent;
  // False when the write had already landed (a retry).
  fresh: boolean;
  clientAt?: number;
  notify?: boolean;
  serverNow: number;
}

// The first moment, from now, that the local hour is `endHour`: when quiet hours end.
function quietEndsAt(nowMs: number, timeZone: string, endHour: number): number {
  let at = Math.floor(nowMs / STEP_MS + 1) * STEP_MS;
  for (let step = 0; step < 48 * 4; step += 1, at += STEP_MS) {
    if (localMoment(new Date(at), timeZone).hour === endHour) return at;
  }
  return nowMs + HELD_LIFE_SECONDS * 1000;
}

async function send(input: NotifyInput): Promise<void> {
  const { store, sender, ctx, event, serverNow } = input;
  const recipient = otherMemberId(ctx);
  if (!sender || recipient === undefined) return;
  const payload: PushPayload = { title: event.title, body: event.body, tag: `notify-${event.mutationId}` };
  const member = ctx.members.find(candidate => candidate.userId === recipient);
  const quiet = member?.settings.quietHours ?? null;
  const hour = localMoment(new Date(serverNow), ctx.household.timezone).hour;
  if (quiet && isQuietHour(hour, quiet.start, quiet.end)) {
    const releaseAt = quietEndsAt(serverNow, ctx.household.timezone, quiet.end);
    await store.put({
      ...heldKey(ctx.householdId, recipient, releaseAt, payload.tag),
      recipient, title: payload.title, body: payload.body, tag: payload.tag, releaseAt,
      ...(event.ref === undefined ? {} : { ref: event.ref }),
      expiresAt: Math.floor(releaseAt / 1000) + HELD_LIFE_SECONDS,
    });
    return;
  }
  await deliver(store, sender, recipient, payload);
}

// Tells the other member about a change the caller chose to share. Never throws and never delays a response by more than two
// seconds: a failure is logged with the household id and the event type only.
export async function notifyOther(input: NotifyInput): Promise<void> {
  if (input.notify !== true || !input.fresh) return;
  if (input.clientAt !== undefined && input.serverNow - input.clientAt > CLIENT_AT_LIMIT_MS) return;
  const where = `household ${input.ctx.householdId}, event ${input.event.type}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS); });
  try {
    const outcome = await Promise.race([send(input).then(() => 'sent' as const), timeout]);
    if (outcome === 'timeout') console.error(`Push timed out (${where})`);
  } catch (error) {
    console.error(`Push failed (${where}): ${error instanceof Error ? error.name : 'Error'}`);
  } finally {
    clearTimeout(timer);
  }
}

// Undoing a completion takes back a push held for it.
export async function deleteHeldFor(store: Store, householdId: string, ref: string): Promise<void> {
  for (const item of await store.query(hhPk(householdId), { skPrefix: HELD_PREFIX })) {
    if (item.ref !== ref) continue;
    try {
      await store.delete({ PK: item.PK, SK: item.SK }, { ifPresent: true });
    } catch (error) {
      if (!(error instanceof ConditionFailedError)) throw error;
    }
  }
}
