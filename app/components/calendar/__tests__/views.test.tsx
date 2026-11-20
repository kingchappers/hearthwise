import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedView, ImportedView } from '../../../../src/calendar/types';
import { zonedInstant } from '../../../../src/shared/zoned';
import type { Task } from '../../../../src/tasks/types';
import { buildTimeline } from '../../../../src/shared/timeline';
import type { TimelineInputs } from '../../../../src/shared/timeline';
import { expectNoViolations } from '~/test-utils/accessibility';
import { DayView } from '../DayView';
import { TimelineList } from '../TimelineList';
import { WeekView } from '../WeekView';
import { ALEX, MEMBERS, SAM, TODAY, busy, event, renderIn } from './fixtures';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Bins', fieldTimes: {}, assignee: SAM, repeat: { type: 'none' }, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {}, status: 'open', createdBy: SAM,
  updatedAt: 1, dueOn: TODAY, ...over,
});
const inputsFor = (over: Partial<TimelineInputs> = {}) => (): TimelineInputs => ({ events: [], tasks: [], members: MEMBERS, ...over });
const noSmallButtons = () => {
  for (const button of screen.queryAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  for (const control of [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')]) expect(control, control.textContent ?? '').toHaveStyle({ minHeight: '44px' });
};

describe('TimelineList', () => {
  const show = (inputs: TimelineInputs, unsaved: string[] = [], onOpen = vi.fn()) =>
    renderIn(<TimelineList timeline={buildTimeline(TODAY, inputs, SAM)} unsavedIds={new Set(unsaved)} onOpen={onOpen} />);

  it('CUJ 11: shows the strip first, then each timed item with its time, who and where in words', () => {
    show(inputsFor({
      events: [event({ title: 'Dentist', who: ALEX, place: 'Surgery' }), event({ id: 'e2', title: 'Work meeting', who: SAM, startTime: '14:00', durationMin: 60 })],
      tasks: [task()], dinner: { title: 'Chilli' },
    })());
    const items = screen.getAllByRole('listitem').map(item => item.textContent);
    expect(items[0]).toContain('Due: Bins');
    expect(items[0]).toContain('Sam');
    expect(items[1]).toContain('Dinner: Chilli');
    expect(items[2]).toContain('10:30 to 11:15');
    expect(items[2]).toContain('Dentist');
    expect(items[2]).toContain('Alex');
    expect(items[2]).toContain('At Surgery');
    expect(items[3]).toContain('14:00 to 15:00');
  });

  it('links a task to its page and the dinner to the plan', () => {
    show(inputsFor({ tasks: [task()], dinner: { title: 'Chilli' } })());
    expect(screen.getByRole('link', { name: /Due: Bins/ })).toHaveAttribute('href', '/tasks/t1');
    expect(screen.getByRole('link', { name: /Dinner: Chilli/ })).toHaveAttribute('href', '/plan');
  });

  it('CUJ 4: shows the other person\'s private event as Busy with its owner, and it cannot be opened', async () => {
    const onOpen = vi.fn();
    show(inputsFor({ events: [busy()] })(), [], onOpen);
    expect(screen.getByText('17:00 to 18:00')).toBeInTheDocument();
    expect(screen.getByText('Busy')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens an event, handing over its id and the occurrence shown', async () => {
    const onOpen = vi.fn();
    show(inputsFor({ events: [event()] })(), [], onOpen);
    await userEvent.click(screen.getByRole('button', { name: /Dentist/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1', label: 'Dentist', on: TODAY }));
  });

  it('says Block for a routine, and (next day) for one that runs past midnight', () => {
    show(inputsFor({ events: [event({ kind: 'block', title: 'Sleep', startTime: '23:00', durationMin: 480 })] })());
    expect(screen.getByText('23:00 to 07:00 (next day)')).toBeInTheDocument();
    expect(screen.getByText(/Block/)).toBeInTheDocument();
  });

  it('says Not saved yet on an event with a write waiting', () => {
    show(inputsFor({ events: [event()] })(), ['e1']);
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  });

  it('says so when there is nothing on', () => {
    show(inputsFor()());
    expect(screen.getByText('Nothing on')).toBeInTheDocument();
  });

  it('has no accessibility violations, and no small buttons', async () => {
    const { container } = show(inputsFor({ events: [event(), busy()], tasks: [task()], dinner: { title: 'Chilli' } })());
    await expectNoViolations(container);
    noSmallButtons();
  });
});

describe('DayView', () => {
  const render = (props: Partial<React.ComponentProps<typeof DayView>> = {}) => renderIn(
    <DayView day={TODAY} today={TODAY} inputsFor={inputsFor({ events: [event()] })} viewer={SAM} unsavedIds={new Set()} onDay={vi.fn()} onOpen={vi.fn()} {...props} />,
  );

  it('heads the day, and lists what is on it', () => {
    render();
    expect(screen.getByRole('heading', { level: 2, name: 'Today, Mon 16 Nov' })).toBeInTheDocument();
    expect(screen.getByText('Dentist')).toBeInTheDocument();
  });

  it('moves a day at a time, and back to today', async () => {
    const onDay = vi.fn();
    render({ day: '2026-11-18', onDay });
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onDay.mock.calls.map(call => call[0])).toEqual(['2026-11-17', '2026-11-19', TODAY]);
  });

  it('does not offer Today when already on it', () => {
    render();
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
  });
});

describe('WeekView', () => {
  const render = (props: Partial<React.ComponentProps<typeof WeekView>> = {}) => renderIn(
    <WeekView start={TODAY} today={TODAY} inputsFor={inputsFor({ events: [event()] })} viewer={SAM} unsavedIds={new Set()} onStart={vi.fn()} onDay={vi.fn()} onOpen={vi.fn()} {...props} />,
  );

  it('CUJ 11: lists seven days as rows, one heading each, never a grid', () => {
    render();
    const headings = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent);
    expect(headings).toEqual(['Today, Mon 16 Nov', 'Tue 17 Nov', 'Wed 18 Nov', 'Thu 19 Nov', 'Fri 20 Nov', 'Sat 21 Nov', 'Sun 22 Nov']);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows each day\'s items under its heading, and Nothing on for an empty day', () => {
    render();
    const first = screen.getByRole('heading', { name: 'Today, Mon 16 Nov' }).closest('section') as HTMLElement;
    expect(within(first).getByText('Dentist')).toBeInTheDocument();
    const second = screen.getByRole('heading', { name: 'Tue 17 Nov' }).closest('section') as HTMLElement;
    expect(within(second).getByText('Nothing on')).toBeInTheDocument();
  });

  it('moves a week at a time', async () => {
    const onStart = vi.fn();
    render({ onStart, start: '2026-11-18' });
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(onStart.mock.calls.map(call => call[0])).toEqual(['2026-11-11', '2026-11-25', TODAY]);
  });

  it('opens a day in the day view', async () => {
    const onDay = vi.fn();
    render({ onDay });
    await userEvent.click(screen.getByRole('button', { name: 'See this day, Tue 17 Nov' }));
    expect(onDay).toHaveBeenCalledWith('2026-11-17');
  });

  it('has no accessibility violations, and no small buttons', async () => {
    const { container } = render();
    await expectNoViolations(container);
    noSmallButtons();
  });
});

describe('TimelineList: imported items', () => {
  const NOW = Date.parse('2026-11-16T12:00:00Z');
  const at = (hhmm: string): number => zonedInstant(TODAY, hhmm, 'Europe/London');
  const FEEDS: FeedView[] = [
    { id: 'f1', label: 'Work', owner: 'Sam', mine: true, share: 'busy', status: 'ok', fetchedAt: NOW - 3 * 3_600_000 },
    { id: 'f2', label: "Alex's calendar", owner: 'Alex', mine: false, share: 'busy', status: 'link_stopped', fetchedAt: NOW - 2 * 86_400_000 },
  ];
  const standup: ImportedView = { feedId: 'f1', owner: 'Sam', title: 'Standup', allDay: false, startMs: at('09:30'), endMs: at('10:00') };
  const show = (imported: ImportedView[], onOpen = vi.fn()) => {
    const inputs: TimelineInputs = { events: [], tasks: [], members: MEMBERS, imported, feeds: FEEDS, timezone: 'Europe/London' };
    return renderIn(<TimelineList timeline={buildTimeline(TODAY, inputs, SAM)} unsavedIds={new Set()} feeds={FEEDS} now={NOW} onOpen={onOpen} />);
  };

  it('shows the time, the title, whose it is and when its calendar was last read', () => {
    show([standup]);
    const text = screen.getByRole('listitem').textContent;
    expect(text).toContain('09:30 to 10:00');
    expect(text).toContain('Standup');
    expect(text).toContain('Sam');
    expect(text).toContain('Updated 3 hours ago');
  });

  it('says a calendar that stopped is last updated, in plain words, with no alarm', () => {
    show([{ feedId: 'f2', owner: 'Alex', busy: true, allDay: false, startMs: at('17:00'), endMs: at('18:00') }]);
    const text = screen.getByRole('listitem').textContent ?? '';
    expect(text).toContain('Busy');
    expect(text).toContain('Last updated 2 days ago');
    expect(text).not.toMatch(/failed|error|alert|warning/i);
  });

  it('says when the time could not be read exactly', () => {
    show([{ ...standup, approx: true }]);
    expect(screen.getByText('Time may be an hour out')).toBeInTheDocument();
  });

  it('is never opened or edited: it is not a button or a link', () => {
    const onOpen = vi.fn();
    show([standup], onOpen);
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
