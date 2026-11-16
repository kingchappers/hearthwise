import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { deleteEvent, listEvents, putEvent, setEventReminders, viewEvent } from '../calendar/events';
import type { EventWriteOutcome } from '../calendar/events';
import { addFeed, editFeed, listFeeds, readImported, refreshFeedNow, removeFeed, replaceFeedLink, viewFeed } from '../calendar/feeds';
import { getFeedDeps } from '../calendar/feedRuntime';
import { logCalendarWrite, withCalendarLog } from '../calendar/log';
import type { CalendarAction } from '../calendar/log';
import * as events from '../push/events';
import type { NotifyEvent } from '../push/notifyOther';
import { parseEventDelete, parseEventPut, parseFeedAdd, parseFeedMutation, parseFeedPatch, parseFeedReplace, parseImportedQuery, parseRemindersPut } from '../shared/calendarValidation';
import type { Parsed } from '../shared/validation';
import { getStore } from '../store';
import { invalid, noStore, ok, parseJsonObject } from './http';
import { notifyAfter } from './notify';
import { created, guarded } from './respond';
import type { TaskHandler } from './respond';
import type { Router } from './router';
import type { ApiResponse } from './types';
import { TaskError } from '../tasks/types';

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

// ---- Feeds ----
//
// The link is a bearer secret. It arrives once, in the body of an add or a replace; it is never in a path, never logged, never in an
// error, and no route returns it. A feed's state is read again after each write and projected for the caller.

// An error from deep inside (the store, a library) may carry text that holds the link. What goes on up the stack is its name only.
function withoutDetail(handler: TaskHandler): TaskHandler {
  return async (event, ctx, params) => {
    try {
      return await handler(event, ctx, params);
    } catch (error) {
      if (error instanceof TaskError) throw error;
      const clean = new Error(`Calendar feed route failed: ${error instanceof Error ? error.name : 'Error'}`);
      clean.name = 'CalendarFeedError';
      throw clean;
    }
  };
}

const feedRoute = (ids: string[], handler: TaskHandler) => withHousehold(guarded(ids, withCalendarLog(withoutDetail(handler))));

const feedAnswer = async (ctx: HouseholdContext, id: string, fresh: boolean, status: 200 | 201 = 200): Promise<ApiResponse> => {
  const feed = await viewFeed(getStore(), ctx, id);
  return status === 201 && fresh ? created({ feed }) : noStore(ok({ feed }));
};

const postFeed: TaskHandler = async (event, ctx) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseFeedAdd(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await addFeed(getStore(), getFeedDeps(), ctx, input.value);
  return feedAnswer(ctx, outcome.id, outcome.fresh, 201);
};

const replaceFeed: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseFeedReplace(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await replaceFeedLink(getStore(), getFeedDeps(), ctx, params.id, input.value);
  return feedAnswer(ctx, outcome.id, outcome.fresh);
};

const patchFeed: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseFeedPatch(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await editFeed(getStore(), ctx, params.id, input.value);
  return feedAnswer(ctx, outcome.id, outcome.fresh);
};

const refreshFeed: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseFeedMutation(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await refreshFeedNow(getStore(), getFeedDeps(), ctx, params.id, input.value);
  return feedAnswer(ctx, outcome.id, outcome.fresh);
};

const deleteFeed: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseFeedMutation(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await removeFeed(getStore(), ctx, params.id, input.value);
  return ok({ id: outcome.id });
};

const getFeeds: TaskHandler = async (_event, ctx) => noStore(ok({ feeds: await listFeeds(getStore(), ctx), serverTime: Date.now() }));

const getImported: TaskHandler = async (event, ctx) => {
  const range = parseImportedQuery(event.queryStringParameters ?? {});
  if (!range.ok) return invalid(range.field);
  return noStore(ok(await readImported(getStore(), ctx, range.value.from, range.value.to)));
};

export function registerCalendarRoutes(router: Router): void {
  router.get('/api/hh/calendar', withHousehold(getCalendar));
  router.put('/api/hh/calendar/{id}', route(put));
  router.put('/api/hh/calendar/{id}/reminders', route(reminders));
  router.delete('/api/hh/calendar/{id}', route(remove));
  router.get('/api/hh/calendar/imported', feedRoute([], getImported));
  router.get('/api/hh/calendar/feeds', feedRoute([], getFeeds));
  router.post('/api/hh/calendar/feeds', feedRoute([], postFeed));
  router.post('/api/hh/calendar/feeds/{id}/replace', feedRoute(['id'], replaceFeed));
  router.post('/api/hh/calendar/feeds/{id}/refresh', feedRoute(['id'], refreshFeed));
  router.patch('/api/hh/calendar/feeds/{id}', feedRoute(['id'], patchFeed));
  router.delete('/api/hh/calendar/feeds/{id}', feedRoute(['id'], deleteFeed));
}
