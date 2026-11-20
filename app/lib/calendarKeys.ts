// The query key and mutation keys for the calendar. Kept apart from `calendar.ts` so the mutation registry can name them without
// importing hooks. Feeds are online only and never queued, so there are no feed keys.
export const CALENDAR_KEY = ['calendar'] as const;

export type CalendarMutationKind = 'createEvent' | 'editEvent' | 'deleteEvent' | 'setReminders' | 'eventRestore';

// A key is never renamed once shipped: a saved write is replayed by its key.
export const calendarMutationKeys: { [K in CalendarMutationKind]: readonly ['household', K] } = {
  createEvent: ['household', 'createEvent'], editEvent: ['household', 'editEvent'], deleteEvent: ['household', 'deleteEvent'],
  setReminders: ['household', 'setReminders'], eventRestore: ['household', 'eventRestore'],
};

// One saved entry per window of imported events: ['calendar-imported', from, to]. Kept apart from CALENDAR_KEY so the 10-second poll of
// typed events never refetches a window.
export const IMPORTED_KEY = ['calendar-imported'] as const;
