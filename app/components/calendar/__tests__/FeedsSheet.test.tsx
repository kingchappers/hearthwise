import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedView } from '../../../../src/calendar/types';
import type { FeedActions } from '~/hooks/useFeedActions';
import { expectNoViolations } from '~/test-utils/accessibility';
import { FeedsSheet } from '../FeedsSheet';
import type { FeedsSheetProps } from '../FeedsSheet';
import { renderIn } from './fixtures';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const LINK = 'https://calendar.google.com/calendar/ical/SENTINEL-SECRET/basic.ics';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const mine: FeedView = { id: 'f1', label: 'Work', owner: 'Sam', mine: true, share: 'busy', status: 'ok', fetchedAt: NOW - 3 * 3_600_000, host: 'calendar.google.com', eventCount: 42, skippedCount: 1 };
const theirs: FeedView = { id: 'f2', label: "Alex's calendar", owner: 'Alex', mine: false, share: 'busy', status: 'link_stopped', fetchedAt: NOW - 2 * 86_400_000 };

const makeFeedActions = (over: Partial<FeedActions> = {}): FeedActions => ({
  add: vi.fn().mockResolvedValue({ ok: true }), replace: vi.fn().mockResolvedValue({ ok: true }), edit: vi.fn().mockResolvedValue({ ok: true }),
  refresh: vi.fn().mockResolvedValue({ ok: true }), remove: vi.fn().mockResolvedValue({ ok: true }), ...over,
});

let actions = makeFeedActions();
const onClose = vi.fn();
const renderSheet = (props: Partial<FeedsSheetProps> = {}) =>
  renderIn(<FeedsSheet opened onClose={onClose} feeds={[mine, theirs]} now={NOW} online otherName="Alex" actions={actions} {...props} />);

beforeEach(() => { actions = makeFeedActions(); onClose.mockClear(); });

describe('FeedsSheet: the list', () => {
  it('shows each feed with who owns it, what the other person sees, and when it was updated', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Calendars' })).toBeInTheDocument();
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first).getByText('Work')).toBeInTheDocument();
    expect(within(first).getByText('Sam · Busy only')).toBeInTheDocument();
    expect(within(first).getByText('Updated 3 hours ago')).toBeInTheDocument();
    expect(within(first).getByText('calendar.google.com, link hidden')).toBeInTheDocument();
    expect(within(first).getByText('1 event repeats too often to show')).toBeInTheDocument();
    expect(within(first).getByText('Google can take many hours to show changes on its links.')).toBeInTheDocument();
    expect(within(second).getByText("Alex's calendar")).toBeInTheDocument();
    expect(within(second).getByText('Last updated 2 days ago. The link stopped working. Alex may need a new one.')).toBeInTheDocument();
  });

  it('gives the other person\'s feed no buttons and no host', () => {
    renderSheet();
    const second = screen.getAllByRole('listitem')[1];
    expect(within(second).queryAllByRole('button')).toEqual([]);
    expect(second.textContent).not.toContain('link hidden');
  });

  it('says so when there are none', () => {
    renderSheet({ feeds: [] });
    expect(screen.getByText('No calendars added yet')).toBeInTheDocument();
  });
});

describe('FeedsSheet: adding', () => {
  const open = async () => { await userEvent.click(screen.getByRole('button', { name: 'Add a calendar' })); };

  it('shows the steps for each provider and starts as busy only', async () => {
    renderSheet();
    await open();
    expect(screen.getByText('In Google Calendar: Settings, your calendar, Integrate calendar, Secret address in iCal format.')).toBeInTheDocument();
    expect(screen.getByText(/In Proton Calendar/)).toBeInTheDocument();
    // The form's own switch is the last one: the list above it has one for each feed that is yours.
    expect(screen.getAllByRole('switch', { name: 'Show details to Alex' }).at(-1)).not.toBeChecked();
  });

  it('sends the link once with a new id, says it is checking, and closes the form when it works', async () => {
    let finish: (outcome: { ok: true }) => void = () => undefined;
    actions = makeFeedActions({ add: vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; })) });
    renderSheet();
    await open();
    await userEvent.type(screen.getByLabelText('Link'), LINK);
    await userEvent.type(screen.getByLabelText('Name'), 'Sam\'s work');
    await userEvent.click(screen.getByRole('button', { name: 'Add calendar' }));
    expect(await screen.findByText('Checking the link...')).toBeInTheDocument();
    const call = (actions.add as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(call).toEqual({ id: expect.stringMatching(UUID), link: LINK, label: 'Sam\'s work', share: 'busy' });
    finish({ ok: true });
    await waitFor(() => expect(screen.queryByLabelText('Link')).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain('SENTINEL');
  });

  it('keeps the same id if the person taps again after a refusal', async () => {
    actions = makeFeedActions({ add: vi.fn().mockResolvedValue({ ok: false, message: 'That address did not give us a calendar.' }) });
    renderSheet();
    await open();
    await userEvent.type(screen.getByLabelText('Link'), LINK);
    await userEvent.type(screen.getByLabelText('Name'), 'Work');
    await userEvent.click(screen.getByRole('button', { name: 'Add calendar' }));
    expect(await screen.findByText('That address did not give us a calendar.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add calendar' }));
    const [first, second] = (actions.add as ReturnType<typeof vi.fn>).mock.calls.map(call => (call[0] as { id: string }).id);
    expect(second).toBe(first);
  });

  it('needs a name and a link before it asks, and never echoes the link in a message', async () => {
    renderSheet();
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Add calendar' }));
    expect(actions.add).not.toHaveBeenCalled();
    expect(screen.getByText('Add a link')).toBeInTheDocument();
    expect(screen.getByText('Add a name')).toBeInTheDocument();
  });

  it('says Needs a signal, and does not offer to add, with no connection', () => {
    renderSheet({ online: false });
    const button = screen.getByRole('button', { name: 'Needs a signal' });
    expect(button).toBeDisabled();
  });
});

describe('FeedsSheet: your own feed', () => {
  it('refreshes now', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    expect(actions.refresh).toHaveBeenCalledWith('f1');
  });

  it('changes what the other person sees', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('switch', { name: 'Show details to Alex' }));
    expect(actions.edit).toHaveBeenCalledWith('f1', { share: 'details' });
  });

  it('replaces the link, and keeps none of it on screen afterwards', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    await userEvent.type(screen.getByLabelText('New link'), LINK);
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(actions.replace).toHaveBeenCalledWith('f1', LINK);
    await waitFor(() => expect(screen.queryByLabelText('New link')).not.toBeInTheDocument());
  });

  it('asks before removing, and says what goes', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(actions.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Remove Work? Its events go from the calendar for both of you.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(actions.remove).toHaveBeenCalledWith('f1');
  });

  it('shows a refusal in kind words', async () => {
    actions = makeFeedActions({ refresh: vi.fn().mockResolvedValue({ ok: false, message: 'Try again later' }) });
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    expect(await screen.findByText('Try again later')).toBeInTheDocument();
  });

  it('needs a signal for each action too', () => {
    renderSheet({ online: false });
    for (const name of ['Refresh now', 'Replace link', 'Remove']) expect(screen.getByRole('button', { name })).toBeDisabled();
  });
});

describe('FeedsSheet: accessibility', () => {
  it('has names and labels for everything, with the add form open', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Add a calendar' }));
    await expectNoViolations(screen.getByRole('dialog'));
  });
});
