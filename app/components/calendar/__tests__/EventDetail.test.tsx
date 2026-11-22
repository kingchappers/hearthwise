import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildTimeline } from '../../../../src/shared/timeline';
import { expectNoViolations } from '~/test-utils/accessibility';
import { EventDetail } from '../EventDetail';
import type { EventDetailProps } from '../EventDetail';
import { ALEX, MEMBERS, SAM, TODAY, event, makeActions, renderIn } from './fixtures';

const onEdit = vi.fn();
const onClose = vi.fn();

function renderDetail(shown = event(), props: Partial<EventDetailProps> = {}) {
  const item = buildTimeline(TODAY, { events: [shown], tasks: [], members: MEMBERS }, SAM).timed[0];
  const actions = props.actions ?? makeActions();
  const view = renderIn(<EventDetail opened selected={{ event: shown, item }} unsaved={false} onEdit={onEdit} onClose={onClose} actions={actions} {...props} />);
  return { ...view, actions };
}

describe('EventDetail', () => {
  it('shows the title, when, who, where and the notes, in words', () => {
    renderDetail(event({ title: 'Dentist', who: ALEX, place: 'Surgery', notes: 'Bring the form' }), {});
    expect(screen.getByRole('dialog', { name: 'Dentist' })).toBeInTheDocument();
    expect(screen.getByText('Mon 16 Nov, 10:30 to 11:15')).toBeInTheDocument();
    expect(screen.getByText('For: Alex')).toBeInTheDocument();
    expect(screen.getByText('Where: Surgery')).toBeInTheDocument();
    expect(screen.getByText('Bring the form')).toBeInTheDocument();
  });

  it('says Both for an event for both, and when it repeats and ends', () => {
    renderDetail(event({ repeat: { type: 'fixed', every: 1, unit: 'day', startOn: TODAY }, repeatEndsOn: '2026-12-31' }));
    expect(screen.getByText('For: Both')).toBeInTheDocument();
    expect(screen.getByText('Every day, until Thu 31 Dec')).toBeInTheDocument();
  });

  it('hides Skip this day once 50 days are skipped, so it never goes past the server\'s limit', () => {
    const days = Array.from({ length: 50 }, (_, index) => `day-${index}`);
    renderDetail(event({ repeat: { type: 'fixed', every: 1, unit: 'day', startOn: TODAY }, skipOn: days }));
    expect(screen.queryByRole('button', { name: 'Skip this day' })).not.toBeInTheDocument();
  });

  it('says it is a block, and that it is private', () => {
    renderDetail(event({ kind: 'block', private: true, who: SAM }));
    expect(screen.getByText('Routine')).toBeInTheDocument();
    expect(screen.getByText('Private: only you can see the details')).toBeInTheDocument();
  });

  it('edits the event it was opened on', async () => {
    const shown = event();
    renderDetail(shown);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(shown);
  });

  it('deletes it, and closes', async () => {
    const shown = event();
    const { actions } = renderDetail(shown);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(actions.remove).toHaveBeenCalledWith(shown);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers to skip this day for a repeating event only, and skips the day shown', async () => {
    const { unmount } = renderDetail(event());
    expect(screen.queryByRole('button', { name: 'Skip this day' })).not.toBeInTheDocument();
    unmount();
    const repeating = event({ repeat: { type: 'fixed', every: 1, unit: 'day', startOn: TODAY } });
    const { actions } = renderDetail(repeating);
    await userEvent.click(screen.getByRole('button', { name: 'Skip this day' }));
    expect(actions.skipDay).toHaveBeenCalledWith(repeating, TODAY);
    expect(onClose).toHaveBeenCalled();
  });

  it('turns every action off while a write for the event is waiting, and says so', () => {
    renderDetail(event({ repeat: { type: 'fixed', every: 1, unit: 'day', startOn: TODAY } }), { unsaved: true });
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    for (const name of ['Edit', 'Skip this day', 'Delete']) expect(screen.getByRole('button', { name })).toBeDisabled();
  });

  it('acts once on a double tap of Delete or Skip this day', async () => {
    const repeating = event({ repeat: { type: 'fixed', every: 1, unit: 'day', startOn: TODAY } });
    const first = renderDetail(repeating);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Delete' }));
    expect(first.actions.remove).toHaveBeenCalledTimes(1);
    first.unmount();
    const second = renderDetail(repeating);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Skip this day' }));
    expect(second.actions.skipDay).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no event is selected', () => {
    renderIn(<EventDetail opened={false} selected={undefined} unsaved={false} onEdit={onEdit} onClose={onClose} actions={makeActions()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps every action at least 44px tall', () => {
    renderDetail(event({ repeat: { type: 'fixed', every: 1, unit: 'day', startOn: TODAY } }));
    const dialog = screen.getByRole('dialog');
    for (const name of ['Edit', 'Skip this day', 'Delete']) expect(within(dialog).getByRole('button', { name })).toHaveStyle({ minHeight: '44px' });
  });

  it('has no accessibility violations', async () => {
    renderDetail(event({ place: 'Surgery', notes: 'Note' }));
    await expectNoViolations(document.body);
  });
});
