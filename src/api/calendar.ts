import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { deleteEvent, listEvents, putEvent, setEventReminders, viewEvent } from '../calendar/events';
import type { EventWriteOutcome } from '../calendar/events';
import { logCalendarWrite, withCalendarLog } from '../calendar/log';
import type { CalendarAction } from '../calendar/log';
import * as events from '../push/events';
import type { NotifyEvent } from '../push/notifyOther';
import { parseEventDelete, parseEventPut, parseRemindersPut } from '../shared/calendarValidation';
import type { Parsed } from '../shared/validation';
import { getStore } from '../store';
import { invalid, noStore, ok, parseJsonObject } from './http';
import { notifyAfter } from './notify';
import { guarded } from './respond';
import type { TaskHandler } from './respond';
import type { Router } from './router';
import type { ApiResponse } from './types';

async function getCalendar(_event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  return noStore(ok(await listEvents(getStore(), ctx)));
}

// The shape every event write shares: read the body, check it, do the write, read the event again for the caller (a write record
// holds only ids), log it if it was new, and tell the other person if asked and if the event is not private.
function writeRoute<T extends { mutationId: string }>(
  parse: (body: Record<string, unknown>) => Parsed<T>,
  run: (ctx: HouseholdContext, id: string, input: T) => Promise<EventWriteOutcome>,
  action: (outcome: EventWriteOutcome) => CalendarAction,
  notice: (outcome: EventWriteOutcome, actor: string, mutationId: string) => NotifyEvent | undefined,
): TaskHandler {
  return async (event, ctx, params) => {
    const body = parseJsonObject(event);
    if (!body) return invalid('body');
    const input = parse(body);
    if (!input.ok) return invalid(input.field);
    const outcome = await run(ctx, params.id, input.value);
    const view = await viewEvent(getStore(), ctx, params.id);
    if (outcome.fresh) logCalendarWrite(ctx.householdId, input.value.mutationId, action(outcome), params.id);
    // Nothing is sent about a private event, whoever asked and whatever was ticked.
    const isPrivate = view.busy === true || view.private;
    await notifyAfter(ctx, body, outcome.fresh, isPrivate ? undefined : notice(outcome, ctx.member.displayName, input.value.mutationId));
    return ok({ event: view });
  };
}

const put = writeRoute(
  parseEventPut,
  (ctx, id, input) => putEvent(getStore(), ctx, id, input),
  outcome => (outcome.change === 'created' ? 'create' : 'edit'),
  (outcome, actor, mutationId) => {
    if (outcome.change === 'created') return events.eventAdded(actor, mutationId);
    return outcome.change === 'applied' ? events.eventChanged(actor, mutationId) : undefined;
  },
);
const remove = writeRoute(parseEventDelete, (ctx, id, input) => deleteEvent(getStore(), ctx, id, input), () => 'delete', () => undefined);
const reminders = writeRoute(parseRemindersPut, (ctx, id, input) => setEventReminders(getStore(), ctx, id, input), () => 'reminders', () => undefined);

const route = (handler: TaskHandler) => withHousehold(guarded(['id'], withCalendarLog(handler)));

export function registerCalendarRoutes(router: Router): void {
  router.get('/api/hh/calendar', withHousehold(getCalendar));
  router.put('/api/hh/calendar/{id}', route(put));
  router.put('/api/hh/calendar/{id}/reminders', route(reminders));
  router.delete('/api/hh/calendar/{id}', route(remove));
}
