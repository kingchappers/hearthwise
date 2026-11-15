import { hhPk } from '../household/keys';
import type { Store } from '../store';
import { ConditionFailedError } from '../store';
import { EVENT_PREFIX } from './keys';
import type { CalendarEvent } from './types';

// The most items one run looks at, so a household with a long history cannot make it unbounded. The hourly sweep finishes the rest.
const MAX_ITEMS = 1000;

export interface PurgeResult {
  deleted: number;
  trimmed: number;
  failed: number;
}

// Removes what belongs to people who are no longer members: their private events (deleted ones too), and their entries in the
// reminders of every event. Shared events they made stay. Each item is its own write, so one failure never stops the rest; reads
// hide this data until it is gone. It never throws and logs no text, only the error name.
export async function purgeNonMemberData(store: Store, householdId: string, memberIds: ReadonlySet<string>): Promise<PurgeResult> {
  const result: PurgeResult = { deleted: 0, trimmed: 0, failed: 0 };
  const rows = (await store.query(hhPk(householdId), { skPrefix: EVENT_PREFIX })).slice(0, MAX_ITEMS);

  for (const row of rows) {
    try {
      if (row.private === true && !memberIds.has(String(row.createdBy))) {
        await store.delete({ PK: row.PK, SK: row.SK });
        result.deleted += 1;
        continue;
      }
      const reminders = (row.reminders as CalendarEvent['reminders'] | undefined) ?? {};
      const kept = Object.fromEntries(Object.entries(reminders).filter(([userId]) => memberIds.has(userId)));
      if (Object.keys(kept).length === Object.keys(reminders).length) continue;
      await store.transact([{
        update: { PK: row.PK, SK: row.SK },
        ...(Object.keys(kept).length === 0 ? { remove: ['reminders'] } : { set: { reminders: kept } }),
        ifEquals: { updatedAt: row.updatedAt },
      }]);
      result.trimmed += 1;
    } catch (error) {
      result.failed += 1;
      // A write that landed in between is picked up by the next sweep.
      if (!(error instanceof ConditionFailedError)) console.error(`Calendar cleanup failed (household ${householdId}): ${error instanceof Error ? error.name : 'Error'}`);
    }
  }
  return result;
}
