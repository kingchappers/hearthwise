import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { parseJsonObject } from '../api/http';
import type { TaskHandler } from '../api/respond';
import { parseRequiredMutationId } from '../shared/validation';
import { TaskError } from '../tasks/types';

export type CalendarAction = 'create' | 'edit' | 'delete' | 'reminders' | 'restore';

// One line for each fresh write. Ids and enums only: never a title, place, notes or name.
export function logCalendarWrite(householdId: string, mutationId: string, action: CalendarAction, eventId: string): void {
  console.log(JSON.stringify({ event: 'calendar_write', householdId, mutationId, action, eventId }));
}

// One line for each refusal. The reason is the error code.
export function logCalendarReject(householdId: string, mutationId: string | undefined, reason: string): void {
  console.log(JSON.stringify({ event: 'calendar_reject', householdId, ...(mutationId === undefined ? {} : { mutationId }), reason }));
}

function mutationIdOf(event: APIGatewayProxyEventV2): string | undefined {
  const parsed = parseRequiredMutationId(parseJsonObject(event)?.mutationId);
  return parsed.ok ? parsed.value : undefined;
}

// Logs a domain refusal and throws it again for `respondTo` to answer.
export function withCalendarLog(handler: TaskHandler): TaskHandler {
  return async (event, ctx, params) => {
    try {
      return await handler(event, ctx, params);
    } catch (error) {
      if (error instanceof TaskError) logCalendarReject(ctx.householdId, mutationIdOf(event), error.code);
      throw error;
    }
  };
}

export interface FetchLog {
  householdId: string;
  feedId: string;
  // The finer internal value, and the nine-code value the person sees.
  outcome: string;
  userCode: string;
  bytes: number;
  events: number;
  skipped: number;
  ms: number;
}

// One line for each fetch of a feed. Ids, enums and counts only: never a link, a host, a title, a place or a name, and never the text
// of a library error.
export function logFeedFetch(entry: FetchLog): void {
  console.log(JSON.stringify({ event: 'calendar_fetch', ...entry }));
}

// A link refused before or during a fetch. No more than this: it does not use emitSecurityEvent, which would email for each one.
export function logLinkRefused(householdId: string, feedId: string, outcome: string): void {
  console.log(JSON.stringify({ event: 'calendar_link_refused', householdId, feedId, outcome }));
}

export type FeedAction = 'add' | 'replace' | 'edit' | 'remove' | 'refresh';

// One line for each fresh feed write: ids and enums only.
export function logFeedWrite(householdId: string, feedId: string, action: FeedAction): void {
  console.log(JSON.stringify({ event: 'calendar_feed_write', householdId, feedId, action }));
}
