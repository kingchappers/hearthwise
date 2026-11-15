import { notifications } from '@mantine/notifications';
import type { EventKind, EventView, People, Reminder, Schedule } from '../../src/calendar/types';
import { useHousehold } from '~/lib/household';
import { notifyFields } from '~/lib/letThemKnow';
import type { EventChanges } from '~/lib/calendarForm';
import { useCalendarMutation } from '~/lib/mutations';

// What the add sheet hands over. It makes `id` and `mutationId` once, when it opens, so a double tap is one event.
export interface NewEventInput {
  id: string;
  mutationId: string;
  kind: EventKind;
  title: string;
  place?: string;
  notes?: string;
  schedule: Schedule;
  people: People;
}

export interface CalendarActions {
  me: string;
  add(input: NewEventInput): void;
  edit(event: EventView, changes: EventChanges): void;
  // Leaves one day out of a repeating event.
  skipDay(event: EventView, day: string): void;
  remove(event: EventView): void;
  setReminders(event: EventView, list: Reminder[]): void;
  restore(event: EventView): void;
}

// Every calendar action the screens can take: each builds its mutation's variables (an id, the time of the tap, who made it, and the
// "Let them know" tick) and runs it by key.
export function useCalendarActions(): CalendarActions {
  const household = useHousehold();
  const add = useCalendarMutation('createEvent');
  const edit = useCalendarMutation('editEvent');
  const del = useCalendarMutation('deleteEvent');
  const reminders = useCalendarMutation('setReminders');
  const restore = useCalendarMutation('eventRestore');

  const me = household.data?.me.userId ?? '';
  const common = () => ({ mutationId: crypto.randomUUID(), at: Date.now(), by: me, ...notifyFields() });
  const toast = (message: string): void => { notifications.show({ id: crypto.randomUUID(), autoClose: 5000, message }); };

  return {
    me,

    add: ({ mutationId, id, kind, title, place, notes, schedule, people }) =>
      add.mutate({ ...common(), mutationId, event: { id, kind, title, schedule, people, ...(place ? { place } : {}), ...(notes ? { notes } : {}) } }),

    edit: (event, changes) => {
      if (Object.keys(changes).length === 0) return;
      edit.mutate({ ...common(), eventId: event.id, ...changes });
    },

    skipDay: (event, day) => {
      if (event.skipOn.includes(day)) return;
      const { startOn, allDay, startTime, durationMin, endOn, repeat, repeatEndsOn } = event;
      const schedule: Schedule = {
        startOn, allDay, repeat, skipOn: [...event.skipOn, day],
        ...(startTime === undefined ? {} : { startTime }), ...(durationMin === undefined ? {} : { durationMin }),
        ...(endOn === undefined ? {} : { endOn }), ...(repeatEndsOn === undefined ? {} : { repeatEndsOn }),
      };
      edit.mutate({ ...common(), eventId: event.id, schedule });
    },

    remove: event => {
      del.mutate({ ...common(), eventId: event.id });
      toast(`Deleted: ${event.title}`);
    },

    setReminders: (event, list) => reminders.mutate({ ...common(), eventId: event.id, list }),

    restore: event => {
      if (event.deletedAt === undefined) return;
      restore.mutate({ ...common(), entries: [{ id: event.id, deletedAt: event.deletedAt }] });
      toast(`Restored: ${event.title}`);
    },
  };
}
