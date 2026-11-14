import type { MemberSettings, MemberSettingsPatch } from '../shared/household';
import { ConditionFailedError } from '../store';
import type { Store } from '../store';
import { hhPk, membershipKey, memberSk, metaKey } from './keys';
import { toMember } from './guard';
import { HouseholdError } from './types';
import type { HouseholdContext, Member } from './types';

function mergeSettings(current: MemberSettings, patch: MemberSettingsPatch): MemberSettings {
  return {
    digest: { ...current.digest, ...patch.digest },
    dueNudges: { ...current.dueNudges, ...patch.dueNudges },
    quietHours: patch.quietHours === undefined ? current.quietHours : patch.quietHours,
    defaultView: patch.defaultView ?? current.defaultView,
  };
}

// Changes the caller's own display name and settings. Only their own member record is written.
export async function updateOwnMember(
  store: Store,
  ctx: HouseholdContext,
  patch: { displayName?: string; settings?: MemberSettingsPatch },
): Promise<Member> {
  const fields: Record<string, unknown> = {};
  if (patch.displayName !== undefined) fields.displayName = patch.displayName;
  if (patch.settings !== undefined) fields.settings = mergeSettings(ctx.member.settings, patch.settings);

  const updated = await store.patch({ PK: hhPk(ctx.householdId), SK: memberSk(ctx.userId) }, fields, { mustExist: true });
  return toMember(updated);
}

// Only the person who made the household may remove someone from it, and never themselves. Nothing else is rewritten: a task
// assigned to the removed person is read as `either`, and history shows "Former member" (see the design).
export async function removeMember(store: Store, ctx: HouseholdContext, targetUserId: string): Promise<void> {
  if (ctx.userId !== ctx.household.createdBy || targetUserId === ctx.userId) throw new HouseholdError('forbidden', 403);
  if (!ctx.members.some(member => member.userId === targetUserId)) throw new HouseholdError('not_found', 404);

  try {
    await store.transact([
      { delete: membershipKey(targetUserId), ifPresent: true },
      { delete: { PK: hhPk(ctx.householdId), SK: memberSk(targetUserId) }, ifPresent: true },
      { update: metaKey(ctx.householdId), set: { memberCount: 1 }, ifEquals: { memberCount: 2 } },
    ]);
  } catch (error) {
    // Already removed in the meantime.
    if (error instanceof ConditionFailedError) throw new HouseholdError('not_found', 404);
    throw error;
  }
}
