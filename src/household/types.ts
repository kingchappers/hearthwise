import type { MemberSettings } from '../shared/household';

export interface HouseholdMeta {
  name: string;
  timezone: string;
  createdBy: string;
  createdAt: string;
  memberCount: number;
}

export interface Member {
  userId: string;
  displayName: string;
  settings: MemberSettings;
  joinedAt: string;
  lastDigestSent?: string;
  lastNudgeSent?: string;
}

// What the guard hands to a household handler. The household id comes from here, never from the request.
export interface HouseholdContext {
  userId: string;
  householdId: string;
  household: HouseholdMeta;
  member: Member;
  members: Member[];
}

// A refusal the API turns into { error: code, ...extra } with the status.
export class HouseholdError extends Error {
  constructor(readonly code: string, readonly status: number, readonly extra: Record<string, unknown> = {}) {
    super(code);
    this.name = 'HouseholdError';
  }
}
