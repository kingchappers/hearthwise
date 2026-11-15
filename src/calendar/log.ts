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
