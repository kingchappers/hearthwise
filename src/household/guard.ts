import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { err } from '../api/http';
import type { ApiResponse } from '../api/types';
import { DEFAULT_SETTINGS, type MemberSettings } from '../shared/household';
import { getStore } from '../store';
import type { Item, Store } from '../store';
import { MEMBER_PREFIX, hhPk, membershipKey, metaKey } from './keys';
import type { HouseholdContext, HouseholdMeta, Member } from './types';

export type HouseholdHandler = (event: APIGatewayProxyEventV2, ctx: HouseholdContext, params: Record<string, string>) => Promise<ApiResponse>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A stored record may lack a setting added later, so each one falls back to its default.
function settingsOf(raw: unknown): MemberSettings {
  const stored = isObject(raw) ? raw : {};
  return {
    digest: { ...DEFAULT_SETTINGS.digest, ...(isObject(stored.digest) ? stored.digest : {}) },
    dueNudges: { ...DEFAULT_SETTINGS.dueNudges, ...(isObject(stored.dueNudges) ? stored.dueNudges : {}) },
    quietHours: 'quietHours' in stored ? (stored.quietHours as MemberSettings['quietHours']) : DEFAULT_SETTINGS.quietHours,
    defaultView: stored.defaultView === 'next' ? 'next' : 'list',
  };
}

export function toMember(item: Item): Member {
  const member: Member = {
    userId: item.SK.slice(MEMBER_PREFIX.length),
    displayName: String(item.displayName),
    settings: settingsOf(item.settings),
    joinedAt: String(item.joinedAt),
  };
  if (typeof item.lastDigestSent === 'string') member.lastDigestSent = item.lastDigestSent;
  if (typeof item.lastNudgeSent === 'string') member.lastNudgeSent = item.lastNudgeSent;
  return member;
}

function toMeta(item: Item): HouseholdMeta {
  return {
    name: String(item.name),
    timezone: String(item.timezone),
    createdBy: String(item.createdBy),
    createdAt: String(item.createdAt),
    memberCount: Number(item.memberCount),
  };
}

// The caller's household, read from their membership. Undefined when they have none, or the records disagree (a membership
// whose household or member record is missing is treated as no household, never as a partial one).
export async function loadContext(store: Store, userId: string): Promise<HouseholdContext | undefined> {
  const membership = await store.get(membershipKey(userId), { consistent: true });
  if (!membership) return undefined;
  const householdId = String(membership.householdId);

  const [meta, memberItems] = await Promise.all([
    store.get(metaKey(householdId), { consistent: true }),
    store.query(hhPk(householdId), { skPrefix: MEMBER_PREFIX }),
  ]);
  if (!meta) return undefined;

  const members = memberItems.map(toMember);
  const member = members.find(candidate => candidate.userId === userId);
  if (!member) return undefined;
  return { userId, householdId, household: toMeta(meta), member, members };
}

// Wraps a household route. The household id is taken from the caller's membership and nowhere else: not from the URL, the
// query or the body, so a person cannot name another household.
export function withHousehold(handler: HouseholdHandler): (event: APIGatewayProxyEventV2, userId: string, params: Record<string, string>) => Promise<ApiResponse> {
  return async (event, userId, params) => {
    const ctx = await loadContext(getStore(), userId);
    if (!ctx) return err(403, 'no_household');
    return handler(event, ctx, params);
  };
}
