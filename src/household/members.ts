import type { MemberSettings, MemberSettingsPatch } from '../shared/household';
import type { Store } from '../store';
import { hhPk, memberSk } from './keys';
import { toMember } from './guard';
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
