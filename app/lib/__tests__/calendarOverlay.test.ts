import { describe, expect, it } from 'vitest';
import type { BusyView, CalendarEvent, EventsData, EventView } from '../../../src/calendar/types';
import { applyPendingCalendar } from '../calendarOverlay';
import { calendarMutationKeys } from '../calendarKeys';
import type { CalendarMutationKind } from '../calendarKeys';

const SAM = 'u-sam';
const ALEX = 'u-alex';
const AT = 1_800_000_000_000;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SCHEDULE = { startOn: '2026-11-19', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' as const }, skipOn: [] };

const event = (over: Partial<CalendarEvent> = {}): EventView => ({
  id: A, kind: 'event', title: 'Dentist', who: 'both', private: false, ...SCHEDULE, reminders: {}, fieldTimes: { title: 1, schedule: 1, people: 1 },
  createdBy: SAM, createdAt: 1, updatedAt: 1, updatedBy: SAM, ...over,
});
const busy = (over: Partial<BusyView> = {}): BusyView => ({ id: A, busy: true, owner: 'Alex', ...SCHEDULE, ...over });
const data = (events: EventsData['events'] = [], deleted: EventView[] = []): EventsData => ({ events, deleted, serverTime: 0 });
const pend = (kind: CalendarMutationKind, by: string, variables: object, at = AT) =>
  ({ mutationKey: calendarMutationKeys[kind], variables: { mutationId: B, at, by, ...variables } });

describe('applyPendingCalendar', () => {
  it('adds an event as the creator sees it, and shows it once if the add is queued twice', () => {
    const add = pend('createEvent', SAM, { event: { id: B, kind: 'block', title: 'Wind down', schedule: SCHEDULE, people: { who: 'both', private: false } } });
    const result = applyPendingCalendar(data(), [add, add]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ id: B, kind: 'block', title: 'Wind down', createdBy: SAM, who: 'both' });
  });

  it('adds a private event with the text intact for its creator, and with who set to the creator', () => {
    const add = pend('createEvent', SAM, { event: { id: B, kind: 'event', title: 'Counselling', schedule: SCHEDULE, people: { who: ALEX, private: true } } });
    expect(applyPendingCalendar(data(), [add]).events[0]).toMatchObject({ title: 'Counselling', private: true, who: SAM });
  });

  it('edits the words with their own time, and loses to a newer title', () => {
    const edit = pend('editEvent', ALEX, { eventId: A, title: 'Dentist, Smith St' });
    expect(applyPendingCalendar(data([event()]), [edit]).events[0]).toMatchObject({ title: 'Dentist, Smith St' });
    const newer = event({ fieldTimes: { title: AT + 5 } });
    expect(applyPendingCalendar(data([newer]), [edit]).events[0]).toMatchObject({ title: 'Dentist' });
  });

  it('changes the whole schedule as one group', () => {
    const edit = pend('editEvent', ALEX, { eventId: A, schedule: { ...SCHEDULE, startOn: '2026-11-20', startTime: '11:00' } });
    expect(applyPendingCalendar(data([event()]), [edit]).events[0]).toMatchObject({ startOn: '2026-11-20', startTime: '11:00', durationMin: 45 });
  });

  it('leaves an event that is someone else\'s private one as it was, as the server will refuse the write', () => {
    const edit = pend('editEvent', SAM, { eventId: A, title: 'Mine now' });
    const before = data([busy()]);
    expect(applyPendingCalendar(before, [edit])).toEqual(before);
  });

  it('does not let the other person make an event private', () => {
    const edit = pend('editEvent', ALEX, { eventId: A, people: { who: 'both', private: true } });
    const before = data([event()]);
    expect(applyPendingCalendar(before, [edit])).toEqual(before);
  });

  it('moves a deleted event to the deleted list, and a restore of the deletion the person saw brings it back', () => {
    const del = pend('deleteEvent', SAM, { eventId: A });
    const deleted = applyPendingCalendar(data([event()]), [del]);
    expect(deleted.events).toEqual([]);
    expect(deleted.deleted[0]).toMatchObject({ id: A, deletedBy: SAM, deletedAt: AT });

    const restore = pend('eventRestore', ALEX, { entries: [{ id: A, deletedAt: 5 }] });
    const gone = event({ deletedAt: 5, deletedBy: SAM });
    const restored = applyPendingCalendar(data([], [gone]), [restore]);
    expect(restored.events[0].id).toBe(A);
    expect(restored.deleted).toEqual([]);
    expect((restored.events[0] as EventView).deletedAt).toBeUndefined();
  });

  it('does not restore a deletion the person did not see', () => {
    const restore = pend('eventRestore', ALEX, { entries: [{ id: A, deletedAt: 4 }] });
    const before = data([], [event({ deletedAt: 5, deletedBy: SAM })]);
    expect(applyPendingCalendar(before, [restore])).toEqual(before);
  });

  it('sets the caller\'s own reminders, and clears them with an empty list', () => {
    const set = pend('setReminders', ALEX, { eventId: A, list: [{ from: 'start', minutes: 30 }] });
    const result = applyPendingCalendar(data([event()]), [set]);
    expect((result.events[0] as EventView).reminders).toEqual({ [ALEX]: { savedAt: AT, list: [{ from: 'start', minutes: 30 }] } });
    const clear = pend('setReminders', ALEX, { eventId: A, list: [] });
    expect((applyPendingCalendar(result, [clear]).events[0] as EventView).reminders).toEqual({});
  });

  it('ignores a write of another kind, and a write with no variables', () => {
    const before = data([event()]);
    expect(applyPendingCalendar(before, [{ mutationKey: ['household', 'moneyAdd'], variables: {} }, { mutationKey: calendarMutationKeys.deleteEvent, variables: undefined }])).toEqual(before);
  });
});
