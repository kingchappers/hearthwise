import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import { createHousehold } from '../household/households';
import { updateOwnMember } from '../household/members';
import { HouseholdError } from '../household/types';
import type { HouseholdContext } from '../household/types';
import { parseDisplayName, parseHouseholdName, parseMemberPatch, parseMutationId, parseTimeZoneField } from '../shared/validation';
import { getStore } from '../store';
import { SECURITY_HEADERS } from './constants';
import { err, invalid, noStore, ok, parseJsonObject } from './http';
import type { Router } from './router';
import type { ApiResponse } from './types';

// A refusal from the household domain becomes { error: code, ...extra } with its status. Anything else is a real failure.
export function householdErrorResponse(error: unknown): ApiResponse {
  if (error instanceof HouseholdError) return err(error.status, error.code, error.extra);
  throw error;
}

// A household is made by someone who has none, so this route is authenticated but sits outside the household guard.
async function createHouseholdRoute(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');

  const name = parseHouseholdName(body.name);
  if (!name.ok) return invalid(name.field);
  const displayName = parseDisplayName(body.displayName);
  if (!displayName.ok) return invalid(displayName.field);
  const timezone = parseTimeZoneField(body.timezone);
  if (!timezone.ok) return invalid(timezone.field);
  const mutationId = parseMutationId(body.mutationId);
  if (!mutationId.ok) return invalid(mutationId.field);

  try {
    const { householdId } = await createHousehold(getStore(), { userId, name: name.value, displayName: displayName.value, timezone: timezone.value });
    return { statusCode: 201, headers: SECURITY_HEADERS, body: JSON.stringify({ householdId }) };
  } catch (error) {
    return householdErrorResponse(error);
  }
}

// The other member's settings are theirs: the list shows who is in the household, and only the caller's own settings come back.
async function getHousehold(_event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  return noStore(ok({
    household: ctx.household,
    members: ctx.members.map(({ userId, displayName, joinedAt }) => ({ userId, displayName, joinedAt })),
    me: ctx.member,
  }));
}

async function patchMe(event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const patch = parseMemberPatch(body);
  if (!patch.ok) return invalid(patch.field);
  const mutationId = parseMutationId(body.mutationId);
  if (!mutationId.ok) return invalid(mutationId.field);

  const me = await updateOwnMember(getStore(), ctx, patch.value);
  return noStore(ok({ me }));
}

export function registerHouseholdRoutes(router: Router): void {
  router.post('/api/households', createHouseholdRoute);
  router.get('/api/hh', withHousehold(getHousehold));
  router.patch('/api/hh/members/me', withHousehold(patchMe));
}
