import { loadHousehold } from '../household/guard';
import { hhPk } from '../household/keys';
import type { Member } from '../household/types';
import { localMoment } from '../push/select';
import { deliver, type PushPayload, type PushSender } from '../push/sender';
import { listSubscribedUsers } from '../push/subscriptions';
import { occurrencesOf, type Occurrence } from '../shared/calendar';
import { addDays } from '../shared/schedule';
import { zonedInstant } from '../shared/zoned';
import { ConditionFailedError, type Item, type Store } from '../store';
import { toEvent } from './events';
import { CALREM, EVENT_PREFIX, remindKey } from './keys';
import { isVisible, projectFor } from './project';
import type { CalendarEvent, Reminder } from './types';

const MIN = 60_000;
// How late a reminder may still be sent: a run that was missed or late sends it, an older one is skipped, so an outage never
// produces a storm of old warnings.
export const CATCH_UP_MS = 15 * MIN;
// One run interval: a reminder that fell out of the catch-up window since the last run is counted as stale in the summary.
const RUN_INTERVAL_MS = 5 * MIN;
const CLAIM_TTL_SECONDS = 2 * 86_400;
const URL = '/plan/calendar';

export interface ReminderSummary {
  households: number;
  due: number;
  claimed: number;
  sent: number;
  stale: number;
  failed: number;
}

type Rule = 'normal' | 'gap_forward' | 'first_of_two';

const emptySummary = (): ReminderSummary => ({ households: 0, due: 0, claimed: 0, sent: 0, stale: 0, failed: 0 });

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'Error');

const WALL_FORMATS = new Map<string, Intl.DateTimeFormat>();
// The clock in a zone at an instant, as "YYYY-MM-DD HH:MM".
function wallAt(ms: number, timeZone: string): string {
  let format = WALL_FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    WALL_FORMATS.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(ms));
  const part = (type: string): string => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

// Which rule `zonedInstant` used, for the claim: the time did not exist (it went to the first moment after the gap), it happened
// twice (the first was taken), or neither.
function ruleFor(day: string, hhmm: string, instant: number, timeZone: string): Rule {
  const wanted = `${day} ${hhmm}`;
  if (wallAt(instant, timeZone) !== wanted) return 'gap_forward';
  return [30 * MIN, 60 * MIN, 120 * MIN].some(shift => wallAt(instant + shift, timeZone) === wanted) ? 'first_of_two' : 'normal';
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

function distance(minutes: number): string {
  if (minutes === 1440) return '1 day';
  if (minutes >= 60 && minutes % 60 === 0) return plural(minutes / 60, 'hour');
  return plural(minutes, 'minute');
}

function textFor(title: string, reminder: Reminder): string {
  if (reminder.from === 'end') return `${title} ends now`;
  return reminder.minutes === 0 ? `${title} is starting` : `${title} starts in ${distance(reminder.minutes)}`;
}

interface Candidate {
  instant: number;
  rule: Rule;
  day: string;
}

function candidateFor(occurrence: Occurrence, reminder: Reminder, timeZone: string): Candidate | undefined {
  if (occurrence.startTime === undefined) return undefined;
  if (reminder.from === 'end') {
    if (occurrence.endTime === undefined) return undefined;
    const instant = zonedInstant(occurrence.endOn, occurrence.endTime, timeZone);
    return { instant, rule: ruleFor(occurrence.endOn, occurrence.endTime, instant, timeZone), day: occurrence.on };
  }
  const start = zonedInstant(occurrence.on, occurrence.startTime, timeZone);
  return { instant: start - reminder.minutes * MIN, rule: ruleFor(occurrence.on, occurrence.startTime, start, timeZone), day: occurrence.on };
}

interface Run {
  store: Store;
  sender: PushSender;
  now: number;
  householdId: string;
  timeZone: string;
  summary: ReminderSummary;
}

// The put-if-absent that comes before the send. The send happens only if this run made the claim.
async function claim(run: Run, event: CalendarEvent, userId: string, reminder: Reminder, candidate: Candidate): Promise<boolean> {
  try {
    await run.store.put({
      ...remindKey(run.householdId, event.id, candidate.day, reminder.from, reminder.minutes, userId),
      instant: candidate.instant,
      rule: candidate.rule,
      expiresAt: Math.floor(run.now / 1000) + CLAIM_TTL_SECONDS,
    }, { ifAbsent: true });
    return true;
  } catch (error) {
    if (error instanceof ConditionFailedError) return false;
    throw error;
  }
}

function logSend(householdId: string, eventId: string, date: string, outcome: string): void {
  console.log(JSON.stringify({ event: 'calendar_reminder', householdId, eventId, date, outcome }));
}

async function send(run: Run, event: CalendarEvent, userId: string, reminder: Reminder, candidate: Candidate, title: string): Promise<void> {
  const payload: PushPayload = { title: textFor(title, reminder), body: '', tag: `reminder-${event.id}-${candidate.day}-${reminder.from}-${reminder.minutes}`, url: URL };
  try {
    const accepted = await deliver(run.store, run.sender, userId, payload);
    if (accepted > 0) run.summary.sent += 1;
    else run.summary.failed += 1;
    logSend(run.householdId, event.id, candidate.day, accepted > 0 ? 'sent' : 'not_accepted');
  } catch (error) {
    run.summary.failed += 1;
    logSend(run.householdId, event.id, candidate.day, `failed ${errorName(error)}`);
  }
}

async function remindersOf(run: Run, event: CalendarEvent, userId: string, ownerName: string, from: string, to: string): Promise<void> {
  const entry = event.reminders[userId];
  if (!entry || entry.list.length === 0) return;
  // The person must be allowed to see the title: a private event that is not theirs gives a busy view and nothing is sent.
  const view = projectFor(userId, event, ownerName);
  if (view.busy) return;
  const windowStart = run.now - CATCH_UP_MS;
  for (const occurrence of occurrencesOf(event, from, to)) {
    for (const reminder of entry.list) {
      const candidate = candidateFor(occurrence, reminder, run.timeZone);
      if (!candidate) continue;
      if (candidate.instant > run.now) continue;
      if (candidate.instant <= windowStart) {
        if (candidate.instant > windowStart - RUN_INTERVAL_MS) run.summary.stale += 1;
        continue;
      }
      if (candidate.instant < entry.savedAt) {
        run.summary.stale += 1;
        continue;
      }
      run.summary.due += 1;
      if (!(await claim(run, event, userId, reminder, candidate))) continue;
      run.summary.claimed += 1;
      await send(run, event, userId, reminder, candidate, view.title);
    }
  }
}

const hasEntryFor = (event: CalendarEvent, memberIds: ReadonlySet<string>): boolean =>
  Object.entries(event.reminders).some(([userId, entry]) => memberIds.has(userId) && entry.list.length > 0);

// Marks the household's index item empty only if nobody has saved a reminder since it was read: a save is a put with a new
// `updatedAt`, so the job's patch then fails and the save wins.
async function markEmpty(store: Store, item: Item, householdId: string): Promise<void> {
  if (item.updatedAt === undefined) return;
  try {
    await store.patch({ PK: CALREM, SK: householdId }, { empty: true }, { ifEquals: { updatedAt: item.updatedAt } });
  } catch (error) {
    if (!(error instanceof ConditionFailedError)) throw error;
  }
}

async function runHousehold(store: Store, sender: PushSender, item: Item, subscribed: ReadonlySet<string>, now: number, summary: ReminderSummary): Promise<void> {
  const householdId = item.SK;
  const loaded = await loadHousehold(store, householdId);
  if (!loaded) return;
  const members = new Map<string, Member>(loaded.members.map(member => [member.userId, member]));
  const memberIds = new Set(members.keys());
  const events = (await store.query(hhPk(householdId), { skPrefix: EVENT_PREFIX })).map(toEvent);
  // A deleted event can come back through the recycle bin, so its reminders keep the household armed.
  if (!events.some(event => hasEntryFor(event, memberIds))) {
    await markEmpty(store, item, householdId);
    return;
  }
  summary.households += 1;

  const timeZone = loaded.household.timezone;
  const today = localMoment(new Date(now), timeZone).date;
  const run: Run = { store, sender, now, householdId, timeZone, summary };
  for (const event of events) {
    if (event.deletedAt !== undefined || event.allDay || event.startTime === undefined) continue;
    if (!isVisible(event, memberIds)) continue;
    const owner = members.get(event.createdBy)?.displayName ?? '';
    for (const userId of Object.keys(event.reminders)) {
      if (!members.has(userId) || !subscribed.has(userId)) continue;
      // Yesterday to two days ahead covers a 1,440 minute reminder on an early event, and a block that started yesterday.
      await remindersOf(run, event, userId, owner, addDays(today, -1), addDays(today, 2));
    }
  }
}

// Runs every five minutes. One household failing is logged by error name and never stops the rest.
export async function runReminders(store: Store, sender: PushSender | undefined, now: Date): Promise<ReminderSummary> {
  const summary = emptySummary();
  if (!sender) return summary;
  const nowMs = now.getTime();
  const items = (await store.query(CALREM)).filter(item => item.empty !== true);
  if (items.length > 0) {
    const subscribed = new Set(await listSubscribedUsers(store));
    for (const item of items) {
      try {
        await runHousehold(store, sender, item, subscribed, nowMs, summary);
      } catch (error) {
        summary.failed += 1;
        console.error(`Reminders failed for household ${item.SK}: ${errorName(error)}`);
      }
    }
  }
  console.log(JSON.stringify({ event: 'calendar_reminders', ...summary }));
  return summary;
}
