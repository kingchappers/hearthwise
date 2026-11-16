// The pending calendar writes shown on top of the server's list. Pure, and it reuses the server's own write rules and projection, so a
// pending write is refused on screen exactly where the server will refuse it: the event then stays as it was.
import { applyEventDelete, applyEventRestore, applyEventWrite, applyReminders } from '../../src/calendar/applyEvent';
import type { EventOutcome } from '../../src/calendar/applyEvent';
import { projectFor } from '../../src/calendar/project';
import type { CalendarEvent, EventOrBusy, EventsData, EventView } from '../../src/calendar/types';
import { calendarMutationKeys } from './calendarKeys';
import type { CalendarMutationKind } from './calendarKeys';
import type { CalendarMutationVars } from './mutations';
import type { PendingMutation } from './overlay';

type Overlay<K extends CalendarMutationKind> = (data: EventsData, vars: CalendarMutationVars[K]) => EventsData;

// The event as the rule needs it: a full one. Someone else's private event reaches the app as a busy view, which no write may change.
const liveEvent = (data: EventsData, id: string): EventView | undefined => {
  const found = data.events.find(event => event.id === id);
  return found && found.busy !== true ? found : undefined;
};

// Replaces the event with what the rule made of it, as the caller sees it. A refusal, or a write that changed nothing, leaves the data.
function change(data: EventsData, id: string, by: string, rule: (event: CalendarEvent) => EventOutcome): EventsData {
  const existing = liveEvent(data, id);
  if (!existing) return data;
  const outcome = rule(existing);
  if (outcome.result !== 'applied' || !outcome.event) return data;
  const next = projectFor(by, outcome.event, '');
  return { ...data, events: data.events.map(event => (event.id === id ? next : event)) };
}

const OVERLAYS: { [K in CalendarMutationKind]: Overlay<K> } = {
  createEvent: (data, v) => {
    const { id, kind, title, place, notes, schedule, people } = v.event;
    if (data.events.some(event => event.id === id) || data.deleted.some(event => event.id === id)) return data;
    const outcome = applyEventWrite(undefined, id, {
      kind, title: { value: title, at: v.at }, schedule: { value: schedule, at: v.at }, people: { value: people, at: v.at },
      ...(place === undefined ? {} : { place: { value: place, at: v.at } }),
      ...(notes === undefined ? {} : { notes: { value: notes, at: v.at } }),
    }, v.by, v.at);
    if (outcome.result !== 'created' || !outcome.event) return data;
    return { ...data, events: [...data.events, projectFor(v.by, outcome.event, '')] };
  },

  editEvent: (data, v) => change(data, v.eventId, v.by, event => applyEventWrite(event, v.eventId, {
    ...(v.title === undefined ? {} : { title: { value: v.title, at: v.at } }),
    ...(v.place === undefined ? {} : { place: { value: v.place, at: v.at } }),
    ...(v.notes === undefined ? {} : { notes: { value: v.notes, at: v.at } }),
    ...(v.schedule === undefined ? {} : { schedule: { value: v.schedule, at: v.at } }),
    ...(v.people === undefined ? {} : { people: { value: v.people, at: v.at } }),
  }, v.by, v.at)),

  deleteEvent: (data, v) => {
    const existing = liveEvent(data, v.eventId);
    if (!existing) return data;
    const outcome = applyEventDelete(existing, v.by, v.at);
    if (outcome.result !== 'applied' || !outcome.event) return data;
    return { ...data, events: data.events.filter(event => event.id !== v.eventId), deleted: [projectFor(v.by, outcome.event, '') as EventView, ...data.deleted] };
  },

  setReminders: (data, v) => change(data, v.eventId, v.by, event => applyReminders(event, v.by, v.list, v.at)),

  eventRestore: (data, v) => v.entries.reduce((current, wanted) => {
    const gone = current.deleted.find(event => event.id === wanted.id && event.deletedAt === wanted.deletedAt);
    if (!gone) return current;
    const outcome = applyEventRestore(gone, v.by, v.at);
    if (outcome.result !== 'applied' || !outcome.event) return current;
    return {
      ...current,
      events: [...current.events, projectFor(v.by, outcome.event, '')],
      deleted: current.deleted.filter(event => event.id !== wanted.id),
    };
  }, data),
};

function kindOf(mutationKey: readonly unknown[] | undefined): CalendarMutationKind | undefined {
  if (!mutationKey || mutationKey[0] !== 'household') return undefined;
  return (Object.keys(calendarMutationKeys) as CalendarMutationKind[]).find(kind => kind === mutationKey[1]);
}

export function applyPendingCalendar(data: EventsData, pending: PendingMutation[]): EventsData {
  return pending.reduce((current, mutation) => {
    const kind = kindOf(mutation.mutationKey);
    if (!kind || !mutation.variables) return current;
    return (OVERLAYS[kind] as Overlay<CalendarMutationKind>)(current, mutation.variables as CalendarMutationVars[CalendarMutationKind]);
  }, data);
}

export type { EventOrBusy };
