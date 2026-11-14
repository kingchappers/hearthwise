import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { HouseholdContext } from '../household/types';
import { parseUuid } from '../shared/taskValidation';
import { TaskError } from '../tasks/types';
import { SECURITY_HEADERS } from './constants';
import { err, ok } from './http';
import type { ApiResponse } from './types';

export type Params = Record<string, string>;
export type TaskHandler = (event: APIGatewayProxyEventV2, ctx: HouseholdContext, params: Params) => Promise<ApiResponse>;

// A refusal from a domain becomes { error: code, ...extra } with its status. Anything else is a real failure.
export function respondTo(error: unknown): ApiResponse {
  if (error instanceof TaskError) return err(error.status, error.code, error.extra);
  throw error;
}

// Runs a handler, turning a domain refusal into its response. The id parameters are checked first: one that is not a UUID can only
// be a record that does not exist, so it is answered 404 before any key is built from it.
export function guarded(ids: string[], handler: TaskHandler): TaskHandler {
  return async (event, ctx, params) => {
    for (const name of ids) {
      if (!parseUuid(params[name], name).ok) return err(404, 'not_found');
    }
    try {
      return await handler(event, ctx, params);
    } catch (error) {
      return respondTo(error);
    }
  };
}

export const created = (body: object): ApiResponse => ({ statusCode: 201, headers: SECURITY_HEADERS, body: JSON.stringify(body) });

// For a write that may be a replay: 201 (or 200) for the first call, 200 for a repeat of it.
export const written = (outcome: { fresh: boolean; result: object }, status: 200 | 201): ApiResponse =>
  (status === 201 && outcome.fresh ? created(outcome.result) : ok(outcome.result));
