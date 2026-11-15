import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expectNoViolations } from '~/test-utils/accessibility';

vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Let Alex know</label> }));

import { EventSheet } from '../EventSheet';
import type { EventSheetProps } from '../EventSheet';
import { ALEX, MEMBERS, SAM, TODAY, event, makeActions, renderIn } from './fixtures';

const onClose = vi.fn();
let actions = makeActions();

function renderSheet(props: Partial<EventSheetProps> = {}) {
  return renderIn(<EventSheet opened onClose={onClose} day={TODAY} me={SAM} members={MEMBERS} actions={actions} {...props} />);
}

const type = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text);
const addedWith = (): Record<string, unknown> => (actions.add as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => { onClose.mockClear(); actions = makeActions(); });

describe('EventSheet: adding', () => {
  it('is titled, offers an event or a block, and starts for both of you on the day, at 09:00 for an hour', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Add to the calendar' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map(radio => (radio as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Event', 'Block, a routine like Wind down']);
    expect(screen.getByRole('radio', { name: 'Event' })).toBeChecked();
    expect(screen.getByLabelText('Who is it for?')).toHaveValue('both');
    expect(screen.getByLabelText('Date')).toHaveValue(TODAY);
    expect(screen.getByLabelText('Starts at')).toHaveValue('09:00');
    expect(screen.getByLabelText('Length in minutes')).toHaveValue('60');
  });

  it('names the people in the who list, and matches each limit to the server\'s', () => {
    renderSheet();
    expect([...screen.getByLabelText('Who is it for?').querySelectorAll('option')].map(option => option.textContent)).toEqual(['Sam (you)', 'Alex', 'Both of you']);
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '80');
    expect(screen.getByLabelText('Where (optional)')).toHaveAttribute('maxlength', '80');
    expect(screen.getByLabelText('Notes (optional)')).toHaveAttribute('maxlength', '500');
  });

  it('CUJ 3: adds a shared appointment with the id and mutation id it made when it opened', async () => {
    renderSheet({ day: '2026-11-19' });
    await type('Title', 'Dentist');
    await userEvent.clear(screen.getByLabelText('Starts at'));
    await type('Starts at', '10:30');
    await userEvent.clear(screen.getByLabelText('Length in minutes'));
    await type('Length in minutes', '45');
    await type('Where (optional)', 'Surgery');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({
      kind: 'event', title: 'Dentist', place: 'Surgery', people: { who: 'both', private: false },
      schedule: { startOn: '2026-11-19', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' }, skipOn: [] },
    });
    expect(addedWith().id).toMatch(UUID);
    expect(addedWith().mutationId).toMatch(UUID);
    expect(onClose).toHaveBeenCalled();
  });

  it('CUJ 5: adds a weekday block that repeats', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: 'Block, a routine like Wind down' }));
    await type('Title', 'Wind down');
    await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'week');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ kind: 'block', title: 'Wind down', schedule: { repeat: { type: 'fixed', unit: 'week', every: 1, startOn: TODAY } } });
  });

  it('offers no repeat after it is done, and an end date once it repeats', async () => {
    renderSheet();
    expect(screen.queryByRole('option', { name: "Some days after it's done" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Repeat until (optional)')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'day');
    await type('Repeat until (optional)', '2026-12-31');
    await type('Title', 'Walk');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ schedule: { repeatEndsOn: '2026-12-31' } });
  });

  it('turns the times off for an all-day event and asks for a last day instead', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('switch', { name: 'All day' }));
    expect(screen.queryByLabelText('Starts at')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Length in minutes')).not.toBeInTheDocument();
    await type('Title', 'Birthday');
    await type('Last day (if it lasts more than one day)', '2026-11-18');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ schedule: { allDay: true, endOn: '2026-11-18' } });
    expect((addedWith().schedule as Record<string, unknown>).startTime).toBeUndefined();
  });

  it('CUJ 4: a private event says what the other person sees, holds it to the maker, and has no Let them know', async () => {
    renderSheet();
    expect(screen.getByLabelText('Let Alex know')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Who is it for?'), ALEX);
    await userEvent.click(screen.getByRole('switch', { name: /^Private/ }));
    expect(screen.getByText('Only you can see the details. Alex sees that you are busy.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Who is it for?')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Let Alex know')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing is sent to Alex about a private event.')).toBeInTheDocument();
    await type('Title', 'Counselling');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ title: 'Counselling', people: { who: SAM, private: true } });
  });

  it('says what to fix and adds nothing when the form is not valid', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Add a title.')).toBeInTheDocument();
    expect(actions.add).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the Add button at least 44px tall', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: 'Add' })).toHaveStyle({ minHeight: '44px' });
  });

  it('has no accessibility violations', async () => {
    renderSheet();
    await expectNoViolations(document.body);
  });
});

describe('EventSheet: with nobody else in the household', () => {
  const alone = [{ userId: SAM, displayName: 'Sam' }];

  it('offers only the person themselves, with no Both and no Private, and adds for them', async () => {
    renderSheet({ members: alone });
    expect(screen.getByLabelText('Who is it for?')).toHaveValue(SAM);
    expect([...screen.getByLabelText('Who is it for?').querySelectorAll('option')].map(option => option.textContent)).toEqual(['Sam (you)']);
    await type('Title', 'Walk');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ people: { who: SAM, private: false } });
  });

  it('shows an event for a former member as for the person, and saves what is shown', async () => {
    const gone = event({ who: 'u-gone' });
    renderSheet({ members: alone, event: gone });
    expect(screen.getByLabelText('Who is it for?')).toHaveValue(SAM);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.edit).toHaveBeenCalledWith(gone, { people: { who: SAM, private: false } });
  });
});

describe('EventSheet: editing', () => {
  it('opens the event as it is, with no choice of kind, and sends only what changed', async () => {
    const dentist = event({ place: 'Surgery' });
    renderSheet({ event: dentist });
    expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Dentist');
    expect(screen.getByLabelText('Starts at')).toHaveValue('10:30');
    await userEvent.clear(screen.getByLabelText('Title'));
    await type('Title', 'Dentist, Smith St');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.edit).toHaveBeenCalledWith(dentist, { title: 'Dentist, Smith St' });
    expect(onClose).toHaveBeenCalled();
  });

  it('is titled for a block', () => {
    renderSheet({ event: event({ kind: 'block' }) });
    expect(screen.getByRole('dialog', { name: 'Edit block' })).toBeInTheDocument();
  });

  it('sends nothing, and closes, when nothing changed', async () => {
    renderSheet({ event: event() });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.edit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('lets the maker change whether it is private, and not the other person', () => {
    const { unmount } = renderSheet({ event: event({ createdBy: SAM }) });
    expect(screen.getByRole('switch', { name: /^Private/ })).toBeInTheDocument();
    unmount();
    renderSheet({ event: event({ createdBy: ALEX }) });
    expect(screen.queryByRole('switch', { name: /^Private/ })).not.toBeInTheDocument();
  });
});
