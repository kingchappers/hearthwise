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

export const SNAP_PREFIX = 'CALSNAP#';
export const SECRET_PREFIX = 'CALSECRET#';

export const feedKey = (householdId: string, feedId: string): Key => ({ PK: hhPk(householdId), SK: `${FEED_PREFIX}${feedId}` });

// The encrypted link, apart from the feed so no read of a feed returns it.
export const secretKey = (householdId: string, feedId: string): Key => ({ PK: hhPk(householdId), SK: `${SECRET_PREFIX}${feedId}` });

export const snapPrefix = (feedId: string, snapshotId?: string): string => `${SNAP_PREFIX}${feedId}#${snapshotId === undefined ? '' : `${snapshotId}#`}`;
export const snapKey = (householdId: string, feedId: string, snapshotId: string, month: string): Key =>
  ({ PK: hhPk(householdId), SK: `${snapPrefix(feedId, snapshotId)}${month}` });

// The refresh job finds feeds here, by key, never by scanning.
export const feedIndexKey = (householdId: string, feedId: string): Key => ({ PK: CALFEEDS, SK: `${householdId}#${feedId}` });
export const parseFeedIndexSk = (sk: string): { householdId: string; feedId: string } | undefined => {
  const at = sk.lastIndexOf('#');
  return at < 1 ? undefined : { householdId: sk.slice(0, at), feedId: sk.slice(at + 1) };
};

export const rateKey = (subject: string, hour: number): Key => ({ PK: CALRATE, SK: `${subject}#${hour}` });
