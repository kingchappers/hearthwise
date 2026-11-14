import type { HouseholdContext } from '../household/types';
import { notifyOther, type NotifyEvent } from '../push/notifyOther';
import { getSender } from '../push/registry';
import { parseEnvelope } from '../shared/taskValidation';
import { getStore } from '../store';

// Called by a write route after the write succeeded. The caller's own request body says whether they ticked "Let them know"
// (and when they did it); the body was already validated by the route, so a bad envelope here just means nothing is sent.
export async function notifyAfter(ctx: HouseholdContext, body: Record<string, unknown>, fresh: boolean, event: NotifyEvent | undefined): Promise<void> {
  if (event === undefined) return;
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return;
  await notifyOther({
    store: getStore(), sender: getSender(), ctx, event, fresh,
    notify: envelope.value.notify, clientAt: envelope.value.clientAt, serverNow: Date.now(),
  });
}
