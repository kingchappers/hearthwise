import { replayOf, withWriteRecord } from '../api/writeRecord';
import type { WriteOutcome } from '../api/writeRecord';
import { hhPk } from '../household/keys';
import type { HouseholdContext } from '../household/types';
import { ConditionFailedError } from '../store';
import type { Item as StoreItem, Store, TxOp } from '../store';
import { DAY_MS } from '../tasks/record';
import { TaskError } from '../tasks/types';
import { applyEventDelete, applyEventRestore, applyEventWrite, applyReminders } from './applyEvent';
import type { EventOutcome } from './applyEvent';
import { calremKey, EVENT_PREFIX, eventKey } from './keys';
import { isVisible, projectFor } from './project';
import type { CalendarEvent, EventOrBusy, EventPutInput, EventsData, EventView, Reminder } from './types';

export const EVENT_LIMIT = 500;
export const REMINDER_EVENT_LIMIT = 30;
export const DELETED_LISTED = 50;
const MAX_ATTEMPTS = 3;
const THIRTY_DAYS_MS = 30 * DAY_MS;

// What a write answers with: the id, never text (the response reads the event again and projects it for the caller). `change` is
// for the route to decide what to tell the other person, and is not stored.
export interface EventWriteOutcome extends WriteOutcome<{ id: string }> {
  change: 'created' | 'applied' | 'noop';
}

export function toEvent(raw: StoreItem): CalendarEvent {
  const event: CalendarEvent = {
    id: raw.SK.slice(EVENT_PREFIX.length),
    kind: raw.kind === 'block' ? 'block' : 'event',
    title: String(raw.title ?? ''),
    who: String(raw.who ?? 'both'),
    private: raw.private === true,
    startOn: String(raw.startOn ?? ''),
    allDay: raw.allDay === true,
    repeat: structuredClone((raw.repeat as CalendarEvent['repeat'] | undefined) ?? { type: 'none' }),
    skipOn: Array.isArray(raw.skipOn) ? raw.skipOn.map(String) : [],
    reminders: structuredClone((raw.reminders as CalendarEvent['reminders'] | undefined) ?? {}),
    fieldTimes: structuredClone((raw.fieldTimes as CalendarEvent['fieldTimes'] | undefined) ?? {}),
    createdBy: String(raw.createdBy ?? ''),
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
    updatedBy: String(raw.updatedBy ?? ''),
  };
  if (typeof raw.place === 'string') event.place = raw.place;
  if (typeof raw.notes === 'string') event.notes = raw.notes;
  if (typeof raw.startTime === 'string') event.startTime = raw.startTime;
  if (typeof raw.durationMin === 'number') event.durationMin = raw.durationMin;
  if (typeof raw.endOn === 'string') event.endOn = raw.endOn;
  if (typeof raw.repeatEndsOn === 'string') event.repeatEndsOn = raw.repeatEndsOn;
  if (typeof raw.deletedAt === 'number') event.deletedAt = raw.deletedAt;
  if (typeof raw.deletedBy === 'string') event.deletedBy = raw.deletedBy;
  if (typeof raw.expiresAt === 'number') event.expiresAt = raw.expiresAt;
  return event;
}

// The stored form: the same fields, with the keys. Nothing is set to undefined, and an empty set of reminders is left out.
function toRecord(householdId: string, event: CalendarEvent): StoreItem {
  const { id, ...fields } = event;
  const record: StoreItem = { ...eventKey(householdId, id), ...fields };
  for (const name of Object.keys(record)) if (record[name] === undefined) delete record[name];
  if (Object.keys(event.reminders).length === 0) delete record.reminders;
  return record;
}

type Guard = Pick<Extract<TxOp, { update: unknown }>, 'ifEquals' | 'ifMissing'>;

// The update that turns what is stored into `next`: the attributes that changed, and the ones that went away. It applies only to the
// state that was read (the same update time, on an event that is not deleted).
function updateFor(householdId: string, existing: StoreItem, next: CalendarEvent, guard?: Guard): TxOp {
  const after = toRecord(householdId, next);
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(after)) {
    if (name !== 'PK' && name !== 'SK' && JSON.stringify(value) !== JSON.stringify(existing[name])) set[name] = value;
  }
  const remove = Object.keys(existing).filter(name => name !== 'PK' && name !== 'SK' && !(name in after));
  return { update: eventKey(householdId, next.id), set, remove, ...(guard ?? { ifEquals: { updatedAt: existing.updatedAt }, ifMissing: ['deletedAt'] }) };
}

const lostRace = (error: unknown, index: number): boolean => error instanceof ConditionFailedError && error.failedIndex === index;
const memberIds = (ctx: HouseholdContext): Set<string> => new Set(ctx.members.map(member => member.userId));
const ownerName = (ctx: HouseholdContext, userId: string): string => ctx.members.find(member => member.userId === userId)?.displayName ?? 'Former member';

// What the limits read: not the text. A private event of someone who is no longer a member does not count, nor do their reminders.
type Row = Pick<CalendarEvent, 'id' | 'createdBy' | 'private' | 'reminders'> & { deletedAt?: number };

async function eventRows(store: Store, ctx: HouseholdContext): Promise<Row[]> {
  const rows = await store.query(hhPk(ctx.householdId), { skPrefix: EVENT_PREFIX, attributes: ['SK', 'deletedAt', 'private', 'createdBy', 'reminders'] });
  const members = memberIds(ctx);
  return rows
    .map(row => {
      const parsed: Row = {
        id: row.SK.slice(EVENT_PREFIX.length), createdBy: String(row.createdBy ?? ''), private: row.private === true,
        reminders: (row.reminders as CalendarEvent['reminders'] | undefined) ?? {},
      };
      if (typeof row.deletedAt === 'number') parsed.deletedAt = row.deletedAt;
      return parsed;
    })
    .filter(row => !row.private || members.has(row.createdBy));
}

const liveCount = (rows: readonly Row[]): number => rows.filter(row => row.deletedAt === undefined).length;

// Refusals the pure rules give, as the errors the routes answer.
function assertApplied(outcome: EventOutcome): void {
  if (outcome.result === 'gone') throw new TaskError('gone', 410);
  if (outcome.result === 'private') throw new TaskError('private', 403);
  if (outcome.result === 'invalid') throw new TaskError('invalid', 400, { field: 'list' });
  if (outcome.result === 'limit') throw new TaskError('reminder_limit', 409);
}

function opsFor(householdId: string, raw: StoreItem | undefined, outcome: EventOutcome): TxOp[] {
  if (outcome.result === 'created' && outcome.event) return [{ put: toRecord(householdId, outcome.event), ifAbsent: true }];
  if (outcome.result === 'applied' && outcome.event && raw) return [updateFor(householdId, raw, outcome.event)];
  return [];
}

async function writeOnce(
  store: Store, ctx: HouseholdContext, id: string, mutationId: string, nowMs: number,
  decide: (raw: StoreItem | undefined) => Promise<{ outcome: EventOutcome; extra?: TxOp[] }>,
): Promise<EventWriteOutcome> {
  const { householdId } = ctx;
  const replayed = await replayOf<{ id: string }>(store, householdId, mutationId);
  if (replayed) return { ...replayed, change: 'noop' };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await store.get(eventKey(householdId, id), { consistent: true });
    const { outcome, extra = [] } = await decide(raw);
    assertApplied(outcome);
    const ops = [...opsFor(householdId, raw, outcome), ...(outcome.result === 'noop' ? [] : extra)];
    try {
      const written = await withWriteRecord(store, householdId, mutationId, ops, { id }, Math.floor(nowMs / 1000));
      return { ...written, change: outcome.result === 'created' ? 'created' : outcome.result === 'applied' ? 'applied' : 'noop' };
    } catch (error) {
      if (ops.length > 0 && lostRace(error, 0)) continue;
      throw error;
    }
  }
  throw new TaskError('conflict', 409);
}

// A put to a missing id creates the event (the body carries `kind`); a put to an existing one edits it.
export function putEvent(store: Store, ctx: HouseholdContext, id: string, input: EventPutInput, nowMs: number = Date.now()): Promise<EventWriteOutcome> {
  return writeOnce(store, ctx, id, input.mutationId, nowMs, async raw => {
    const who = input.people?.value.who;
    if (who !== undefined && who !== 'both' && !ctx.members.some(member => member.userId === who)) throw new TaskError('invalid', 400, { field: 'who' });
    if (!raw && !input.kind) throw new TaskError('not_found', 404);
    const outcome = applyEventWrite(raw ? toEvent(raw) : undefined, id, input, ctx.userId, nowMs);
    if (!raw && outcome.result === 'created' && liveCount(await eventRows(store, ctx)) >= EVENT_LIMIT) throw new TaskError('event_limit', 409);
    return { outcome };
  });
}

export function deleteEvent(store: Store, ctx: HouseholdContext, id: string, input: { mutationId: string }, nowMs: number = Date.now()): Promise<EventWriteOutcome> {
  return writeOnce(store, ctx, id, input.mutationId, nowMs, async raw => {
    if (!raw) throw new TaskError('not_found', 404);
    return { outcome: applyEventDelete(toEvent(raw), ctx.userId, nowMs) };
  });
}

// Sets the caller's own reminders. The household's CALREM item is written in the same transaction, so the reminder job finds it.
export function setEventReminders(
  store: Store, ctx: HouseholdContext, id: string, input: { list: Reminder[]; mutationId: string }, nowMs: number = Date.now(),
): Promise<EventWriteOutcome> {
  return writeOnce(store, ctx, id, input.mutationId, nowMs, async raw => {
    if (!raw) throw new TaskError('not_found', 404);
    const outcome = applyReminders(toEvent(raw), ctx.userId, input.list, nowMs);
    if (outcome.result === 'applied' && input.list.length > 0) {
      const others = (await eventRows(store, ctx)).filter(row => row.id !== id && row.deletedAt === undefined && (row.reminders[ctx.userId]?.list.length ?? 0) > 0);
      if (others.length >= REMINDER_EVENT_LIMIT) throw new TaskError('reminder_limit', 409);
    }
    return { outcome, extra: [{ put: { ...calremKey(ctx.householdId), updatedAt: nowMs } }] };
  });
}

// One event as the caller may see it. Someone else's private event shows as busy; one whose creator has left is not found.
export async function viewEvent(store: Store, ctx: HouseholdContext, id: string): Promise<EventOrBusy> {
  const raw = await store.get(eventKey(ctx.householdId, id), { consistent: true });
  if (!raw) throw new TaskError('not_found', 404);
  const event = toEvent(raw);
  if (!isVisible(event, memberIds(ctx))) throw new TaskError('not_found', 404);
  return projectFor(ctx.userId, event, ownerName(ctx, event.createdBy));
}

// Every live event as the caller may see it, and the 50 newest deleted ones from the last 30 days that they may see (an event that
// is not private, whoever made it, and their own private ones).
export async function listEvents(store: Store, ctx: HouseholdContext, nowMs: number = Date.now()): Promise<EventsData> {
  const members = memberIds(ctx);
  const all = (await store.query(hhPk(ctx.householdId), { skPrefix: EVENT_PREFIX })).map(toEvent).filter(event => isVisible(event, members));
  const view = (event: CalendarEvent): EventOrBusy => projectFor(ctx.userId, event, ownerName(ctx, event.createdBy));

  const events = all.filter(event => event.deletedAt === undefined).map(view);
  const deleted = all
    .filter(event => event.deletedAt !== undefined && event.deletedAt >= nowMs - THIRTY_DAYS_MS && (!event.private || event.createdBy === ctx.userId))
    .sort((a, b) => b.deletedAt! - a.deletedAt!)
    .slice(0, DELETED_LISTED)
    .map(event => view(event) as EventView);
  events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { events, deleted, serverTime: nowMs };
}

export type EventRestoreStatus = 'restored' | 'noop' | 'not_found' | 'entry_changed' | 'event_limit';

// What a restore batch reads once: how many events are live, as the batch restores them.
export interface EventRestoreBatch {
  live?: number;
}

// One event, in its own transaction, applied only to the deletion the person saw. Someone else's private event is not found.
export async function restoreEventEntry(
  store: Store, ctx: HouseholdContext, target: { id: string; deletedAt: number }, batch: EventRestoreBatch, nowMs: number,
): Promise<EventRestoreStatus> {
  const { householdId } = ctx;
  const raw = await store.get(eventKey(householdId, target.id), { consistent: true });
  if (!raw) return 'not_found';
  const event = toEvent(raw);
  if (!isVisible(event, memberIds(ctx)) || (event.private && event.createdBy !== ctx.userId)) return 'not_found';
  if (event.deletedAt === undefined) return 'noop';
  if (event.deletedAt !== target.deletedAt) return 'entry_changed';

  batch.live ??= liveCount(await eventRows(store, ctx));
  if (batch.live >= EVENT_LIMIT) return 'event_limit';

  const next = applyEventRestore(event, ctx.userId, nowMs).event!;
  try {
    await store.transact([updateFor(householdId, raw, next, { ifEquals: { deletedAt: raw.deletedAt } })]);
  } catch (error) {
    // Restored (noop) or deleted again (entry_changed) since it was read: it is not the deletion this entry saw.
    if (!(error instanceof ConditionFailedError)) throw error;
    const now = await store.get(eventKey(householdId, target.id), { consistent: true });
    return now?.deletedAt === undefined ? 'noop' : 'entry_changed';
  }
  batch.live += 1;
  return 'restored';
}
