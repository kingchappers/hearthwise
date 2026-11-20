import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { EventOrBusy, FeedView } from '../../../src/calendar/types';
import type { TimelineInputs } from '../../../src/shared/timeline';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';
import { ALEX, MEMBERS, SAM, TODAY, busy, event, makeActions } from '~/components/calendar/__tests__/fixtures';

const state = vi.hoisted(() => ({ sources: undefined as unknown, actions: undefined as unknown, online: true }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/calendar', () => ({ useTimelineSources: () => state.sources }));
vi.mock('~/hooks/useCalendarActions', () => ({ useCalendarActions: () => state.actions }));
vi.mock('~/hooks/useFeedActions', () => ({ useFeedActions: () => ({ add: vi.fn(), replace: vi.fn(), edit: vi.fn(), refresh: vi.fn(), remove: vi.fn() }) }));
vi.mock('~/lib/useOnline', () => ({ useOnline: () => state.online }));
vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Let Alex know</label> }));

import CalendarPage, { meta } from '../plan.calendar';

interface Over { imported?: { status: string; feeds?: FeedView[]; covers?: boolean }; status?: string; events?: EventOrBusy[]; unsavedIds?: string[]; refetch?: () => void; timezone?: string }
function sourcesOf({ imported = { status: 'ready' }, status = 'ready', events = [], unsavedIds = [], refetch = vi.fn(), timezone = 'Europe/London' }: Over = {}) {
  return {
    status,
    calendar: { status, events, me: SAM, members: MEMBERS, timezone, today: TODAY, unsaved: unsavedIds.length, unsavedIds: new Set(unsavedIds), refetch },
    imported: { status: imported.status, feeds: imported.feeds ?? [], covers: () => imported.covers ?? true },
    inputsFor: (): TimelineInputs => ({ events, tasks: [], members: MEMBERS }),
  };
}
const show = (over: Over = {}) => { state.sources = sourcesOf(over); };
const actions = () => state.actions as ReturnType<typeof makeActions>;
const renderPage = () => render(<MantineProvider env="test"><MemoryRouter><CalendarPage /></MemoryRouter></MantineProvider>);

beforeEach(() => {
  state.online = true;
  show();
  state.actions = makeActions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Europe/London' } as never);
});

describe('the Calendar page', () => {
  it('is titled, has one h1 and the day beneath it, says nothing is on, and has Add', async () => {
    const { container } = renderPage();
    expect(meta({} as never)).toEqual([{ title: 'Calendar – Hearthwise' }]);
    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Today, Mon 16 Nov' })).toBeInTheDocument();
    expect(screen.getByText('Nothing on')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });

  it('shows a loading indicator, and a retry when the calendar cannot be loaded', async () => {
    show({ status: 'loading' });
    const { unmount } = renderPage();
    expect(screen.getByRole('status', { name: 'Loading the calendar' })).toBeInTheDocument();
    unmount();
    const refetch = vi.fn();
    show({ status: 'error', refetch });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('CUJ 11: opens on the day, and the Week switch shows seven days as rows', async () => {
    show({ events: [event()] });
    renderPage();
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(7);
  });

  it('moves to another day and back, and a day chosen in the week view opens in the day view', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Tue 17 Nov' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    await userEvent.click(screen.getByRole('button', { name: 'See this day, Wed 18 Nov' }));
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Wed 18 Nov' })).toBeInTheDocument();
  });

  it('CUJ 4: shows the other person\'s private event as Busy, with no way to open it', () => {
    show({ events: [busy()] });
    renderPage();
    expect(screen.getByText('Busy')).toBeInTheDocument();
    expect(screen.getByText('17:00 to 18:00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Busy/ })).not.toBeInTheDocument();
  });

  it('adds an event on the day being looked at', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('dialog', { name: 'Add to the calendar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-17');
    await userEvent.type(screen.getByLabelText('Title'), 'Walk');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));
    expect(actions().add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Walk', schedule: expect.objectContaining({ startOn: '2026-11-17' }) }));
  });

  it('opens an event, edits it, and the edit is made against the event as it was opened', async () => {
    const dentist = event({ title: 'Dentist', who: ALEX });
    show({ events: [dentist] });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Dentist/ }));
    expect(screen.getByRole('dialog', { name: 'Dentist' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Dentist, Smith St');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions().edit).toHaveBeenCalledWith(dentist, { title: 'Dentist, Smith St' });
  });

  it('keeps showing the event the detail was opened on, though the list changes underneath', async () => {
    show({ events: [event({ title: 'Dentist' })] });
    const { rerender } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Dentist/ }));
    show({ events: [event({ title: 'Changed on the other phone' })] });
    rerender(<MantineProvider env="test"><MemoryRouter><CalendarPage /></MemoryRouter></MantineProvider>);
    expect(screen.getByRole('dialog', { name: 'Dentist' })).toBeInTheDocument();
  });

  it('turns the detail\'s actions off while a write for that event is waiting', async () => {
    show({ events: [event()], unsavedIds: [] });
    const { rerender } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Dentist/ }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    show({ events: [event()], unsavedIds: ['e1'] });
    rerender(<MantineProvider env="test"><MemoryRouter><CalendarPage /></MemoryRouter></MantineProvider>);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('says how many changes are not saved yet', () => {
    show({ events: [event()], unsavedIds: ['e1'] });
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('1 change not saved yet');
  });

  it('says which zone the times are in when this device is in another', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'America/New_York' } as never);
    renderPage();
    expect(screen.getByText('Times are shown in Europe/London')).toBeInTheDocument();
  });

  it('says nothing about the zone when it is the same', () => {
    renderPage();
    expect(screen.queryByText(/Times are shown in/)).not.toBeInTheDocument();
  });

  it('has the Let them know tick, and no small buttons', () => {
    renderPage();
    expect(screen.getByLabelText('Let Alex know')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});

describe('the Calendar page: imported calendars', () => {
  const FEED: FeedView = { id: 'f1', label: 'Work', owner: 'Sam', mine: true, share: 'busy', status: 'ok', fetchedAt: Date.now(), host: 'calendar.google.com' };

  it('opens the Calendars sheet with the feeds in it', async () => {
    show({ imported: { status: 'ready', feeds: [FEED] } });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Calendars' }));
    const dialog = screen.getByRole('dialog', { name: 'Calendars' });
    expect(within(dialog).getByText('Work')).toBeInTheDocument();
    expect(within(dialog).getByText('Updated just now')).toBeInTheDocument();
  });

  it('says a day is not saved for offline when its window could not be read and is not saved', () => {
    show({ imported: { status: 'error', covers: false } });
    renderPage();
    expect(screen.getByText('Not saved for offline yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing on')).toBeInTheDocument();
  });

  it('says nothing of the sort while the window is still loading or is saved', () => {
    show({ imported: { status: 'loading', covers: false } });
    const { unmount } = renderPage();
    expect(screen.queryByText('Not saved for offline yet')).not.toBeInTheDocument();
    unmount();
    show({ imported: { status: 'ready', covers: true } });
    renderPage();
    expect(screen.queryByText('Not saved for offline yet')).not.toBeInTheDocument();
  });

  it('has no way to add a calendar without a signal', async () => {
    state.online = false;
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Calendars' }));
    expect(screen.getByRole('button', { name: 'Needs a signal' })).toBeDisabled();
  });

  it('passes the accessibility check with the sheet open', async () => {
    show({ imported: { status: 'ready', feeds: [FEED] } });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Calendars' }));
    await expectNoViolations(screen.getByRole('dialog'));
  });
});
