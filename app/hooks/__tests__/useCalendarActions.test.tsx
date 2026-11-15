import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { EventView } from '../../../src/calendar/types';

const calls = vi.hoisted(() => [] as { kind: string; vars: Record<string, unknown> }[]);
const show = vi.hoisted(() => vi.fn());

vi.mock('@mantine/notifications', () => ({ notifications: { show, hide: vi.fn() } }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'Europe/London' }, members: [], me: { userId: 'u-sam', displayName: 'Sam', joinedAt: '', settings: {} } } }),
}));
vi.mock('~/lib/letThemKnow', () => ({ notifyFields: () => ({ notify: true }) }));
vi.mock('~/lib/mutations', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/mutations')>()),
  useCalendarMutation: (kind: string) => ({ mutate: (vars: Record<string, unknown>) => { calls.push({ kind, vars }); } }),
}));

import { useCalendarActions } from '../useCalendarActions';

const SCHEDULE = { startOn: '2026-11-19', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' as const }, skipOn: [] };
const event = (over: Partial<EventView> = {}): EventView => ({
  id: 'e1', kind: 'event', title: 'Dentist', who: 'both', private: false, ...SCHEDULE, reminders: {}, fieldTimes: {}, createdBy: 'u-sam', createdAt: 1, updatedAt: 1, updatedBy: 'u-sam', ...over,
});

beforeEach(() => { calls.length = 0; show.mockClear(); });

describe('useCalendarActions', () => {
  it('adds with the id and mutation id the sheet made when it opened, so a second tap is the same write', () => {
    const { result } = renderHook(() => useCalendarActions());
    const input = { id: 'new-id', mutationId: 'sheet-mutation', kind: 'block' as const, title: 'Wind down', schedule: SCHEDULE, people: { who: 'both', private: false } };
    result.current.add(input);
    result.current.add(input);
    expect(calls).toHaveLength(2);
    expect(calls[0].kind).toBe('createEvent');
    expect(calls[0].vars).toMatchObject({ mutationId: 'sheet-mutation', by: 'u-sam', notify: true, event: { id: 'new-id', kind: 'block', title: 'Wind down' } });
    expect(calls[1].vars.mutationId).toBe('sheet-mutation');
    expect(calls[0].vars.at).toBeTypeOf('number');
  });

  it('edits with only the groups that changed, and sends nothing when nothing changed', () => {
    const { result } = renderHook(() => useCalendarActions());
    result.current.edit(event(), { title: 'Dentist, Smith St' });
    expect(calls[0]).toMatchObject({ kind: 'editEvent', vars: { eventId: 'e1', title: 'Dentist, Smith St' } });
    expect(calls[0].vars.schedule).toBeUndefined();
    result.current.edit(event(), {});
    expect(calls).toHaveLength(1);
  });

  it('skips a day by adding it to the skipped days, as a change to the schedule', () => {
    const { result } = renderHook(() => useCalendarActions());
    const repeat = { type: 'fixed' as const, every: 1, unit: 'day' as const, startOn: '2026-11-19' };
    result.current.skipDay(event({ repeat, skipOn: ['2026-11-20'] }), '2026-11-22');
    expect(calls[0]).toMatchObject({ kind: 'editEvent', vars: { eventId: 'e1', schedule: { ...SCHEDULE, repeat, skipOn: ['2026-11-20', '2026-11-22'] } } });
  });

  it('does not skip a day twice', () => {
    const { result } = renderHook(() => useCalendarActions());
    result.current.skipDay(event({ skipOn: ['2026-11-22'] }), '2026-11-22');
    expect(calls).toHaveLength(0);
  });

  it('deletes, and says what was deleted', () => {
    const { result } = renderHook(() => useCalendarActions());
    result.current.remove(event());
    expect(calls[0]).toMatchObject({ kind: 'deleteEvent', vars: { eventId: 'e1' } });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ message: 'Deleted: Dentist' }));
  });

  it('sets the caller\'s reminders', () => {
    const { result } = renderHook(() => useCalendarActions());
    result.current.setReminders(event(), [{ from: 'start', minutes: 30 }]);
    expect(calls[0]).toMatchObject({ kind: 'setReminders', vars: { eventId: 'e1', list: [{ from: 'start', minutes: 30 }] } });
  });

  it('restores the deletion the person saw, and says so', () => {
    const { result } = renderHook(() => useCalendarActions());
    result.current.restore(event({ deletedAt: 5, deletedBy: 'u-alex' }));
    expect(calls[0]).toMatchObject({ kind: 'eventRestore', vars: { entries: [{ id: 'e1', deletedAt: 5 }] } });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ message: 'Restored: Dentist' }));
    result.current.restore(event());
    expect(calls).toHaveLength(1);
  });

  it('knows who the person is', () => {
    const { result } = renderHook(() => useCalendarActions());
    expect(result.current.me).toBe('u-sam');
  });
});
