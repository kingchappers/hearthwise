import type { BusyView, CalendarEvent, EventOrBusy, EventView } from './types';

// The one place that decides what a person may see of an event. Every route, the reminder job and the app's overlay read events
// through it, and nothing else reads a raw one. A private event reaches the other person as where it falls and who is busy:
// no title, place, notes, who, kind or reminders.
export function projectFor(viewerId: string, event: CalendarEvent, ownerName: string): EventOrBusy {
  if (event.private && viewerId !== event.createdBy) return busyView(event, ownerName);
  return viewOf(viewerId, event);
}

function viewOf(viewerId: string, event: CalendarEvent): EventView {
  const own = event.reminders[viewerId];
  return { ...structuredClone(event), reminders: own === undefined ? {} : { [viewerId]: structuredClone(own) } };
}

function busyView(event: CalendarEvent, ownerName: string): BusyView {
  const view: BusyView = {
    id: event.id, busy: true, owner: ownerName, startOn: event.startOn, allDay: event.allDay,
    repeat: structuredClone(event.repeat), skipOn: [...event.skipOn],
  };
  if (event.startTime !== undefined) view.startTime = event.startTime;
  if (event.durationMin !== undefined) view.durationMin = event.durationMin;
  if (event.endOn !== undefined) view.endOn = event.endOn;
  if (event.repeatEndsOn !== undefined) view.repeatEndsOn = event.repeatEndsOn;
  return view;
}

// A private event whose creator is no longer a member is hidden from everyone until it is deleted by the cleanup.
export function isVisible(event: CalendarEvent, memberIds: ReadonlySet<string>): boolean {
  return !event.private || memberIds.has(event.createdBy);
}
