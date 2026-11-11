export const pk = (userId: string): string => `USER#${userId}`;

// Push reminders: each device's subscription lives in the user's own partition, and a
// small index in a partition of its own lets the scheduler find subscribed users with one Query.
export const PUSH_INDEX_PK = 'PUSHIDX';
export const pushSubscriptionSk = (endpointHash: string): string => `PUSHSUB#${endpointHash}`;
export const pushIndexSk = (userId: string): string => `USER#${userId}`;
