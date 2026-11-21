import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DEFAULT_SETTINGS, type MemberSettings } from '../../../../src/shared/household';
import { expectNoViolations } from '~/test-utils/accessibility';

const state = vi.hoisted(() => ({ colour: undefined as string | undefined, other: undefined as string | undefined, settings: undefined as unknown, support: 'supported', vapid: 'KEY' as string | undefined, permission: 'default' }));
const updateMe = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const subscribe = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const unsubscribe = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', data: { me: { userId: 'a', displayName: 'Sam', settings: state.settings, ...(state.colour ? { colour: state.colour } : {}) }, members: [{ userId: 'a', displayName: 'Sam', joinedAt: '', ...(state.colour ? { colour: state.colour } : {}) }, { userId: 'b', displayName: 'Alex', joinedAt: '', ...(state.other ? { colour: state.other } : {}) }], household: { timezone: 'Europe/London' } } }),
  useUpdateMe: () => ({ mutateAsync: updateMe, isPending: false }),
}));
vi.mock('~/lib/push', () => ({ pushSupport: () => state.support, subscribeToPush: subscribe, unsubscribeFromPush: unsubscribe, hasPushSubscription: async () => false }));
vi.mock('~/lib/runtimeConfig', () => ({ peekRuntimeConfig: () => (state.vapid ? { auth: 'local', vapidPublicKey: state.vapid } : { auth: 'local' }) }));
vi.mock('~/hooks/useProtectedApi', () => ({ useProtectedApi: () => ({ request: vi.fn() }) }));

import { CalendarColour } from '../CalendarColour';
import { DefaultView } from '../DefaultView';
import { PushCheck } from '../PushCheck';
import { QuietHours } from '../QuietHours';
import { Reminders } from '../Reminders';

const ui = (node: React.ReactNode) => render(<MantineProvider env="test">{node}</MantineProvider>);
const withSettings = (over: Partial<MemberSettings> = {}) => { state.settings = { ...DEFAULT_SETTINGS, ...over }; };

beforeEach(() => {
  updateMe.mockClear(); subscribe.mockClear(); unsubscribe.mockClear();
  withSettings();
  state.colour = undefined;
  state.other = undefined;
  state.support = 'supported';
  state.vapid = 'KEY';
  state.permission = 'default';
  vi.stubGlobal('Notification', { get permission() { return state.permission; }, requestPermission: vi.fn(async () => { state.permission = 'granted'; return 'granted'; }) });
});

describe('Reminders', () => {
  it('has both reminders off by default, at 7 pm and 8 am', () => {
    ui(<Reminders />);
    expect(screen.getByRole('switch', { name: /Daily summary/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Due-day reminders/ })).not.toBeChecked();
    expect(screen.getByLabelText('Daily summary time')).toHaveValue('19');
    expect(screen.getByLabelText('Due-day reminder time')).toHaveValue('8');
  });

  it('saves the switch and the hour on their own, through the member settings', async () => {
    const user = userEvent.setup();
    ui(<Reminders />);
    await user.click(screen.getByRole('switch', { name: /Daily summary/ }));
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { digest: { on: true } } });
    await user.selectOptions(screen.getByLabelText('Daily summary time'), '20');
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { digest: { hour: 20 } } });
    await user.click(screen.getByRole('switch', { name: /Due-day reminders/ }));
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { dueNudges: { on: true } } });
    await user.selectOptions(screen.getByLabelText('Due-day reminder time'), '9');
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { dueNudges: { hour: 9 } } });
  });

  it('says a reminder is still sent when its hour is inside quiet hours', () => {
    withSettings({ digest: { on: true, hour: 23 }, quietHours: { start: 22, end: 7 } });
    ui(<Reminders />);
    expect(screen.getAllByText('Your reminder is still sent at this hour')).toHaveLength(1);
  });

  it('says nothing about quiet hours when the reminder is outside them, or they are off', () => {
    withSettings({ digest: { on: true, hour: 19 }, quietHours: { start: 22, end: 7 } });
    ui(<Reminders />);
    expect(screen.queryByText('Your reminder is still sent at this hour')).toBeNull();
  });

  it('is labelled and accessible', async () => {
    const { container } = ui(<Reminders />);
    await expectNoViolations(container);
  });
});

describe('QuietHours', () => {
  it('is off by default, and turning it on picks 10 pm to 7 am', async () => {
    const user = userEvent.setup();
    ui(<QuietHours />);
    expect(screen.getByRole('switch', { name: /Quiet hours/ })).not.toBeChecked();
    await user.click(screen.getByRole('switch', { name: /Quiet hours/ }));
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { quietHours: { start: 22, end: 7 } } });
  });

  it('turns off with null, and changes each end on its own', async () => {
    const user = userEvent.setup();
    withSettings({ quietHours: { start: 22, end: 7 } });
    ui(<QuietHours />);
    await user.selectOptions(screen.getByLabelText('Quiet hours start'), '21');
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { quietHours: { start: 21, end: 7 } } });
    await user.selectOptions(screen.getByLabelText('Quiet hours end'), '8');
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { quietHours: { start: 22, end: 8 } } });
    await user.click(screen.getByRole('switch', { name: /Quiet hours/ }));
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { quietHours: null } });
  });

  it('explains that it holds the other person\'s messages, not your own reminders', () => {
    ui(<QuietHours />);
    expect(screen.getByText(/wait until quiet hours end/i)).toBeInTheDocument();
  });
});

describe('DefaultView', () => {
  it('shows the saved view and saves the other one', async () => {
    const user = userEvent.setup();
    ui(<DefaultView />);
    expect(screen.getByRole('radio', { name: 'Full list' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Next thing' }));
    expect(updateMe).toHaveBeenLastCalledWith({ settings: { defaultView: 'next' } });
  });
});

describe('PushCheck', () => {
  it('on a device that can, offers to turn notifications on and subscribes with the server key', async () => {
    const user = userEvent.setup();
    ui(<PushCheck />);
    await user.click(screen.getByRole('button', { name: 'Turn on notifications on this device' }));
    expect(subscribe).toHaveBeenCalledWith('KEY', expect.any(Function));
    expect(await screen.findByText(/Notifications are on for this device/)).toBeInTheDocument();
  });

  it('shows Home Screen steps on an iPhone that has not installed the app', () => {
    state.support = 'needs-install';
    ui(<PushCheck />);
    expect(screen.getByRole('heading', { name: 'Add Hearthwise to your Home Screen' })).toBeInTheDocument();
    expect(screen.getByText(/Share/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn on notifications/ })).toBeNull();
  });

  it('says plainly when this browser cannot do it', () => {
    state.support = 'unsupported';
    ui(<PushCheck />);
    expect(screen.getByText(/can't get notifications/i)).toBeInTheDocument();
  });

  it('says so when the server has no push keys', () => {
    state.vapid = undefined;
    ui(<PushCheck />);
    expect(screen.getByText(/isn't set up for notifications/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn on notifications/ })).toBeNull();
  });

  it('says what to do when notifications are blocked on this device', () => {
    state.permission = 'denied';
    ui(<PushCheck />);
    expect(screen.getByText(/blocked/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn on notifications/ })).toBeNull();
  });

  it('can turn them off again once they are on', async () => {
    const user = userEvent.setup();
    ui(<PushCheck />);
    await user.click(screen.getByRole('button', { name: 'Turn on notifications on this device' }));
    await user.click(await screen.findByRole('button', { name: 'Turn off notifications on this device' }));
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('uses no banned wording', () => {
    const { container } = ui(<PushCheck />);
    expect(container.textContent).not.toMatch(/overdue|missed|streak/i);
  });
});

describe('CalendarColour', () => {
  it('offers the three brand colours by name, and shows the one you have as chosen', () => {
    ui(<CalendarColour />);
    expect(screen.getAllByRole('radio').map(radio => (radio as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Terracotta', 'Yellow', 'Green']);
    // Sam's user id comes first and nobody has chosen: Sam starts as terracotta.
    expect(screen.getByRole('radio', { name: 'Terracotta' })).toBeChecked();
  });

  it('shows the colour you chose', () => {
    state.colour = 'sage';
    ui(<CalendarColour />);
    expect(screen.getByRole('radio', { name: 'Green' })).toBeChecked();
  });

  it('saves the choice on your own member, beside the name', async () => {
    const user = userEvent.setup();
    ui(<CalendarColour />);
    await user.click(screen.getByRole('radio', { name: 'Green' }));
    expect(updateMe).toHaveBeenLastCalledWith({ colour: 'sage' });
  });

  it('says that the other person sees it, and that the letter and name say it too', () => {
    ui(<CalendarColour />);
    expect(screen.getByText(/Alex sees this colour too/)).toBeInTheDocument();
    expect(screen.getByText(/your name and the letter S/)).toBeInTheDocument();
  });

  it('has names and labels for everything', async () => {
    const { container } = ui(<CalendarColour />);
    await expectNoViolations(container);
  });
});
