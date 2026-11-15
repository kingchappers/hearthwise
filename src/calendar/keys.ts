import { hhPk } from '../household/keys';
import type { Key } from '../store';

export const EVENT_PREFIX = 'EVENT#';
export const FEED_PREFIX = 'CALFEED#';
export const REMIND_PREFIX = 'REMIND#';

// Index partitions: each is read by its key, never scanned, as PUSHIDX is.
export const CALREM = 'CALREM';
export const CALFEEDS = 'CALFEEDS';
export const CALRATE = 'CALRATE';

export const eventKey = (householdId: string, id: string): Key => ({ PK: hhPk(householdId), SK: `${EVENT_PREFIX}${id}` });

// One item per household that has at least one reminder.
export const calremKey = (householdId: string): Key => ({ PK: CALREM, SK: householdId });

// The claim made before a reminder is sent, so a second run sends nothing.
export const remindKey = (householdId: string, eventId: string, occurrenceDate: string, from: string, minutes: number, userId: string): Key =>
  ({ PK: hhPk(householdId), SK: `${REMIND_PREFIX}${eventId}#${occurrenceDate}#${from}#${minutes}#${userId}` });
