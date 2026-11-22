import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../apiError';
import { calendarMutationKeys, describeFailure, registerMutations } from '../mutations';
import { CALENDAR_KEY } from '../calendarKeys';
import type { CalendarMutationKind } from '../mutations';

const ME = 'auth0|me';
const ID = '11111111-1111-4111-8111-111111111111';
const MUTATION = 'aaaaaaaa-0000-4000-8000-000000000001';
const AT = 1_800_000_000_000;
const SCHEDULE = { startOn: '2026-11-19', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' as const }, skipOn: [] };

let client: QueryClient;
let request: ReturnType<typeof vi.fn>;
let report: ReturnType<typeof vi.fn<(message: string, options?: { ask?: () => void }) => void>>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  request = vi.fn().mockResolvedValue({});
  report = vi.fn<(message: string, options?: { ask?: () => void }) => void>();
  registerMutations(client, request as never, () => ({ tasks: [], proposals: [], serverTime: 0 }), report);
});

const run = (kind: CalendarMutationKind, variables: Record<string, unknown>) =>
  new MutationObserver(client, { mutationKey: calendarMutationKeys[kind] }).mutate({ mutationId: MUTATION, at: AT, by: ME, ...variables } as never);
const call = () => request.mock.calls.at(-1) as [string, { method: string; body: string }];
const body = () => JSON.parse(call()[1].body);

describe('the calendar mutations', () => {
  it('are one per kind, in the household scope, and the query key is calendar', () => {
    expect(Object.keys(calendarMutationKeys).sort()).toEqual(['createEvent', 'deleteEvent', 'editEvent', 'eventRestore', 'setReminders']);
    for (const key of Object.values(calendarMutationKeys)) expect(client.getMutationDefaults(key).scope).toEqual({ id: 'household' });
    expect(CALENDAR_KEY).toEqual(['calendar']);
  });

  it('createEvent puts every group with its own time, and leaves out what is not set', async () => {
    await run('createEvent', { event: { id: ID, kind: 'block', title: 'Wind down', schedule: SCHEDULE, people: { who: 'both', private: false } } });
    expect([call()[0], call()[1].method]).toEqual([`/api/hh/calendar/${ID}`, 'PUT']);
    expect(body()).toEqual({
      mutationId: MUTATION, clientAt: AT, kind: 'block', title: 'Wind down', titleAt: AT, ...SCHEDULE, scheduleAt: AT, who: 'both', private: false, peopleAt: AT,
    });
  });

  it('createEvent sends a place and notes with their times when there are some', async () => {
    await run('createEvent', { event: { id: ID, kind: 'event', title: 'Dentist', place: 'Surgery', notes: 'Bring the form', schedule: SCHEDULE, people: { who: ME, private: true } } });
    expect(body()).toMatchObject({ place: 'Surgery', placeAt: AT, notes: 'Bring the form', notesAt: AT, private: true });
  });

  it('editEvent sends only the groups that changed, each with its time, and an empty place clears it', async () => {
    await run('editEvent', { eventId: ID, title: 'Dentist', place: '' });
    expect(body()).toEqual({ mutationId: MUTATION, clientAt: AT, title: 'Dentist', titleAt: AT, place: '', placeAt: AT });
    await run('editEvent', { eventId: ID, schedule: SCHEDULE, people: { who: 'both', private: false } });
    expect(body()).toEqual({ mutationId: MUTATION, clientAt: AT, ...SCHEDULE, scheduleAt: AT, who: 'both', private: false, peopleAt: AT });
  });

  it('deleteEvent, setReminders and eventRestore use their routes', async () => {
    await run('deleteEvent', { eventId: ID });
    expect([call()[0], call()[1].method, body()]).toEqual([`/api/hh/calendar/${ID}`, 'DELETE', { mutationId: MUTATION, clientAt: AT }]);
    await run('setReminders', { eventId: ID, list: [{ from: 'start', minutes: 30 }] });
    expect([call()[0], call()[1].method, body()]).toEqual([`/api/hh/calendar/${ID}/reminders`, 'PUT', { mutationId: MUTATION, clientAt: AT, list: [{ from: 'start', minutes: 30 }] }]);
    await run('eventRestore', { entries: [{ id: ID, deletedAt: 5 }] });
    expect([call()[0], call()[1].method, body()]).toEqual(['/api/hh/restore', 'POST', { mutationId: MUTATION, clientAt: AT, entries: [{ kind: 'event', id: ID, deletedAt: 5 }] }]);
  });

  it('sends notify only when the person asked', async () => {
    await run('deleteEvent', { eventId: ID, notify: true });
    expect(body().notify).toBe(true);
    await run('deleteEvent', { eventId: ID });
    expect(body().notify).toBeUndefined();
  });

  it('refreshes the calendar when a write settles', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    await run('deleteEvent', { eventId: ID });
    expect(spy).toHaveBeenCalledWith({ queryKey: CALENDAR_KEY });
  });

  it('says so when a write is refused because the event became private', async () => {
    request.mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'private'));
    await run('editEvent', { eventId: ID, title: 'x' }).catch(() => undefined);
    expect(report).toHaveBeenCalledWith(expect.stringContaining('Not saved: this event is now private.'));
  });

  it('describes the calendar limits in kind words', () => {
    expect(describeFailure(new ApiError(409, 'Conflict', 'event_limit'), 'createEvent')).toBe('This household has reached 500 events.');
    expect(describeFailure(new ApiError(409, 'Conflict', 'reminder_limit'), 'setReminders')).toBe('That is the most reminders we can add.');
    expect(describeFailure(new ApiError(410, 'Gone'), 'editEvent')).toBe('It was deleted somewhere else. Your change was undone.');
  });

  it('tells the person when a restore is refused because the household is full or the event changed', async () => {
    request.mockResolvedValueOnce({ results: [{ status: 'event_limit' }] });
    await run('eventRestore', { entries: [{ id: ID, deletedAt: 5 }] });
    expect(report).toHaveBeenCalledWith(expect.stringContaining('This household has reached 500 events.'));
    request.mockResolvedValueOnce({ results: [{ status: 'entry_changed' }] });
    await run('eventRestore', { entries: [{ id: ID, deletedAt: 5 }] });
    expect(report).toHaveBeenCalledWith(expect.stringContaining('That event changed. Please look at it again.'));
  });
});
