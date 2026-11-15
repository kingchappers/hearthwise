import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { BusyView, CalendarEvent, EventView } from '../../../../src/calendar/types';
import type { CalendarActions } from '~/hooks/useCalendarActions';

export const SAM = 'u-sam';
export const ALEX = 'u-alex';
export const MEMBERS = [{ userId: SAM, displayName: 'Sam' }, { userId: ALEX, displayName: 'Alex' }];
export const TODAY = '2026-11-16';

export const event = (over: Partial<CalendarEvent> = {}): EventView => ({
  id: 'e1', kind: 'event', title: 'Dentist', who: 'both', private: false, startOn: TODAY, allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' },
  skipOn: [], reminders: {}, fieldTimes: {}, createdBy: SAM, createdAt: 1, updatedAt: 1, updatedBy: SAM, ...over,
});

export const busy = (over: Partial<BusyView> = {}): BusyView => ({
  id: 'p1', busy: true, owner: 'Alex', startOn: TODAY, allDay: false, startTime: '17:00', durationMin: 60, repeat: { type: 'none' }, skipOn: [], ...over,
});

export function makeActions(over: Partial<CalendarActions> = {}): CalendarActions {
  return { me: SAM, add: vi.fn(), edit: vi.fn(), skipDay: vi.fn(), remove: vi.fn(), setReminders: vi.fn(), restore: vi.fn(), ...over };
}

export const renderIn = (ui: React.ReactNode) => render(<MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider>);
