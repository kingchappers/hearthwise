import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import { createHousehold } from '../household/households';
import { acceptInvite, createInvite, listInvites, revokeInvite } from '../household/invites';
import { removeMember, updateOwnMember } from '../household/members';
import { HouseholdError } from '../household/types';
import type { HouseholdContext } from '../household/types';
import { parseDisplayName, parseHouseholdName, parseInviteToken, parseMemberPatch, parseRequiredMutationId, parseTimeZoneField } from '../shared/validation';
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

// A write with no fields of its own (an invite, a revoke, a removal) still carries its mutation id, in a JSON body.
function mutationIdProblem(event: APIGatewayProxyEventV2): ApiResponse | undefined {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const id = parseRequiredMutationId(body.mutationId);
  return id.ok ? undefined : invalid(id.field);
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
  const mutationId = parseRequiredMutationId(body.mutationId);
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
  const mutationId = parseRequiredMutationId(body.mutationId);
  if (!mutationId.ok) return invalid(mutationId.field);

  const me = await updateOwnMember(getStore(), ctx, patch.value);
  return noStore(ok({ me }));
}

const HASH = /^[0-9a-f]{64}$/;
const NO_CONTENT: ApiResponse = { statusCode: 204, headers: SECURITY_HEADERS, body: '' };

// Where the invite link points. APP_ORIGIN wins when it is set; otherwise the host the request came to.
function linkOrigin(event: APIGatewayProxyEventV2): string {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const host = event.headers?.host ?? 'localhost';
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${local ? 'http' : 'https'}://${host}`;
}

async function createInviteRoute(event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  const problem = mutationIdProblem(event);
  if (problem) return problem;
  try {
    const { token, hash, expiresAt } = await createInvite(getStore(), ctx);
    // The token is in the fragment: a fragment is never sent to a server, so it cannot end up in a request log.
    return noStore({ statusCode: 201, headers: SECURITY_HEADERS, body: JSON.stringify({ link: `${linkOrigin(event)}/join#${token}`, expiresAt, hash }) });
  } catch (error) {
    return householdErrorResponse(error);
  }
}

async function listInvitesRoute(_event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  return noStore(ok({ invites: await listInvites(getStore(), ctx.householdId, Math.floor(Date.now() / 1000)) }));
}

async function revokeInviteRoute(event: APIGatewayProxyEventV2, ctx: HouseholdContext, params: Record<string, string>): Promise<ApiResponse> {
  const problem = mutationIdProblem(event);
  if (problem) return problem;
  // Anything that is not a hash cannot be an invite, so it is simply not found.
  if (!HASH.test(params.hash)) return err(404, 'not_found');
  try {
    await revokeInvite(getStore(), ctx, params.hash);
    return NO_CONTENT;
  } catch (error) {
    return householdErrorResponse(error);
  }
}

async function removeMemberRoute(event: APIGatewayProxyEventV2, ctx: HouseholdContext, params: Record<string, string>): Promise<ApiResponse> {
  const problem = mutationIdProblem(event);
  if (problem) return problem;
  try {
    await removeMember(getStore(), ctx, params.userId);
    return NO_CONTENT;
  } catch (error) {
    return householdErrorResponse(error);
  }
}

// Joining is for someone who has no household (or an empty one), so it is authenticated but outside the household guard.
async function acceptInviteRoute(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');

  // A token that is not the right shape cannot be an invite: answered as an expired link, before anything is looked up.
  const token = parseInviteToken(body.token);
  if (!token.ok) return err(410, 'invite_expired');
  const displayName = parseDisplayName(body.displayName);
  if (!displayName.ok) return invalid(displayName.field);
  if ('confirmMove' in body && typeof body.confirmMove !== 'boolean') return invalid('confirmMove');
  const mutationId = parseRequiredMutationId(body.mutationId);
  if (!mutationId.ok) return invalid(mutationId.field);

  try {
    const { householdId } = await acceptInvite(getStore(), { token: token.value, userId, displayName: displayName.value, confirmMove: body.confirmMove === true });
    return noStore(ok({ householdId }));
  } catch (error) {
    return householdErrorResponse(error);
  }
}

export function registerHouseholdRoutes(router: Router): void {
  router.post('/api/households', createHouseholdRoute);
  router.get('/api/hh', withHousehold(getHousehold));
  router.patch('/api/hh/members/me', withHousehold(patchMe));
  router.delete('/api/hh/members/{userId}', withHousehold(removeMemberRoute));
  router.post('/api/hh/invites', withHousehold(createInviteRoute));
  router.get('/api/hh/invites', withHousehold(listInvitesRoute));
  router.delete('/api/hh/invites/{hash}', withHousehold(revokeInviteRoute));
  router.post('/api/invites/accept', acceptInviteRoute);
}
