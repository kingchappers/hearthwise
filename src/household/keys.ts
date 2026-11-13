import type { Key } from '../store';

export const hhPk = (householdId: string): string => `HH#${householdId}`;
export const metaKey = (householdId: string): Key => ({ PK: hhPk(householdId), SK: 'META' });
export const memberSk = (userId: string): string => `MEMBER#${userId}`;
export const MEMBER_PREFIX = 'MEMBER#';
export const membershipKey = (userId: string): Key => ({ PK: `USER#${userId}`, SK: 'MEMBERSHIP' });

// An invite is found by the hash of its token. The household keeps a pointer so it can list its open invites.
export const inviteKey = (hash: string): Key => ({ PK: `INVITE#${hash}`, SK: 'META' });
export const invitePointerSk = (hash: string): string => `INVITE#${hash}`;
export const INVITE_POINTER_PREFIX = 'INVITE#';
