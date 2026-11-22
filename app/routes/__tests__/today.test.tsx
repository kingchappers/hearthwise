import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Proposal, Task } from '../../../src/tasks/types';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';
import { ME, THEM, TODAY, makeActions, task } from '~/components/tasks/__tests__/fixtures';

const state = vi.hoisted(() => ({
  tasks: { status: 'ready', tasks: [] as Task[], proposals: [] as Proposal[], today: '2026-11-13', refetch: vi.fn() },
  defaultView: 'list' as 'list' | 'next',
  plan: { status: 'ready', days: [] as object[], today: '2026-11-13', recipes: [] as object[] | undefined, recipesCheckedAt: undefined as number | undefined, refetch: vi.fn() },
  planActions: { set: vi.fn(), clear: vi.fn() },
  actions: undefined as unknown,
  sources: undefined as unknown,
  projects: { status: 'ready', projects: [] as object[], deleted: [], me: 'u1', members: [{ userId: 'u1', displayName: 'Sam', joinedAt: '' }, { userId: 'u2', displayName: 'Alex', joinedAt: '' }], unsavedIds: new Set<string>() },
  settings: {} as Record<string, unknown>,
}));
vi.mock('~/lib/projects', () => ({ useProjects: () => state.projects }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/queries', () => ({ useTasks: () => state.tasks }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({
    status: 'ready', refetch: vi.fn(),
    data: { household: { name: 'Home', timezone: 'Europe/London', createdBy: 'u1', createdAt: '', memberCount: 2 },
      members: [{ userId: 'u1', displayName: 'Sam', joinedAt: '' }, { userId: 'u2', displayName: 'Alex', joinedAt: '' }],
      me: { userId: 'u1', displayName: 'Sam', joinedAt: '', settings: { defaultView: state.defaultView, ...state.settings } } },
  }),
}));
vi.mock('~/lib/calendar', () => ({ useTimelineSources: () => state.sources }));
vi.mock('~/lib/plan', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/plan')>()), usePlan: () => state.plan }));
vi.mock('~/hooks/usePlanActions', () => ({ usePlanActions: () => state.planActions }));
vi.mock('~/hooks/useTaskActions', () => ({ useTaskActions: () => state.actions }));
vi.mock('~/components/settings/PushPrompt', () => ({ PushPrompt: () => <p>push prompt</p> }));
vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Tell Alex when I save a change</label> }));

import Today, { meta } from '../_index';

const NONE = { type: 'none' as const };
const calendarEvent = (over: object = {}) => ({
  id: 'e1', kind: 'event', title: 'Dentist', who: 'u2', private: false, startOn: TODAY, allDay: false, startTime: '10:30', durationMin: 45, repeat: NONE, skipOn: [], reminders: {},
  fieldTimes: {}, createdBy: 'u2', createdAt: 1, updatedAt: 1, updatedBy: 'u2', ...over,
});
function sourcesOf(events: object[], status = 'ready') {
  const members = [{ userId: 'u1', displayName: 'Sam' }, { userId: 'u2', displayName: 'Alex' }];
  return { status, calendar: { status, events, me: 'u1', members, timezone: 'Europe/London', today: TODAY, refetch: vi.fn() }, inputsFor: () => ({ events, tasks: [], members }) };
}

function renderToday() {
  return render(<MantineProvider env="test"><MemoryRouter><Today /></MemoryRouter></MantineProvider>);
}

beforeEach(() => {
  state.tasks = { status: 'ready', tasks: [], proposals: [], today: TODAY, refetch: vi.fn() };
  state.defaultView = 'list';
  state.actions = makeActions();
  state.plan = { status: 'ready', days: [], today: TODAY, recipes: [], recipesCheckedAt: undefined, refetch: vi.fn() };
  state.planActions = { set: vi.fn(), clear: vi.fn() };
  state.sources = sourcesOf([]);
  state.settings = {};
  state.projects = { ...state.projects, projects: [] };
});

describe('Today: Coming up', () => {
  it('lists the next calendar things after today, with the day and time, and each opens the calendar', () => {
    state.sources = sourcesOf([calendarEvent({ startOn: '2026-11-14', title: 'Dentist', startTime: '10:30' })]);
    renderToday();
    const section = screen.getByRole('heading', { level: 2, name: 'Coming up' }).closest('section') as HTMLElement;
    expect(section).toHaveTextContent('Sat 14 Nov, 10:30');
    expect(section).toHaveTextContent('Dentist');
    expect(within(section).getByRole('link', { name: /Dentist/ })).toHaveAttribute('href', '/plan/calendar');
  });

  it('is not there at all when there is nothing coming up', () => {
    renderToday();
    expect(screen.queryByRole('heading', { name: 'Coming up' })).not.toBeInTheDocument();
  });

  it('says how many steps the other person has taken in a project, and links to it', () => {
    state.projects = { ...state.projects, projects: [{ id: 'p1', title: 'Take down the decking', status: 'active', fieldTimes: {}, counts: { steps: 5, done: 0, materials: 0, held: { u2: 2 } } }] };
    renderToday();
    expect(screen.getByRole('link', { name: 'Alex has 2 steps in Take down the decking' })).toHaveAttribute('href', '/plan/projects/p1');
  });

  it('adds how far away a day is only when the person asked for it, keeping the exact date', () => {
    state.sources = sourcesOf([calendarEvent({ startOn: '2026-11-15', title: 'Dentist' })]);
    state.settings = { relativeTimes: true };
    renderToday();
    expect(screen.getByText('Sun 15 Nov (in 2 days), 10:30')).toBeInTheDocument();
  });

  it('is left out when Coming up is turned off in Settings, and the project line when projects are', () => {
    state.sources = sourcesOf([calendarEvent({ startOn: '2026-11-14' })]);
    state.projects = { ...state.projects, projects: [{ id: 'p1', title: 'Decking', status: 'active', fieldTimes: {}, counts: { steps: 5, done: 0, materials: 0, held: { u2: 1 } } }] };
    state.settings = { todayComingUp: false };
    renderToday();
    expect(screen.queryByText(/Dentist/)).not.toBeInTheDocument();
    expect(screen.getByText('Alex has 1 step in Decking')).toBeInTheDocument();
    cleanup();
    state.settings = { todayProjects: false };
    renderToday();
    expect(screen.getByText(/Dentist/)).toBeInTheDocument();
    expect(screen.queryByText(/Alex has 1 step/)).not.toBeInTheDocument();
  });

  it('adds how far away a task\'s date is when asked, and leaves a task due today alone', () => {
    state.settings = { relativeTimes: true };
    state.tasks.tasks = [task({ title: 'Bins', dueOn: '2026-11-16' }), task({ id: 'x2', title: 'Post', dueOn: TODAY })];
    renderToday();
    expect(screen.getByText(/Mon 16 Nov \(in 3 days\)/)).toBeInTheDocument();
    expect(screen.getByText(/Due today/)).toBeInTheDocument();
  });
});

describe('Today', () => {
  it('is titled Today, and says what will appear when there is nothing', () => {
    expect(meta({} as never)).toEqual([{ title: 'Today – Hearthwise' }]);
    renderToday();
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getByText('Chores and to-dos you add will show up here.')).toBeInTheDocument();
  });

  it('shows the full list by default, with the viewer\'s default view setting honoured', () => {
    state.tasks.tasks = [task({ title: 'Hoover' })];
    renderToday();
    expect(screen.getByRole('link', { name: 'Hoover' })).toBeInTheDocument();
    expect(screen.queryByText('Show a different task', { exact: false })).not.toBeInTheDocument();
  });

  it('opens on the next-thing card when that is the viewer\'s default view, and can switch to the list for this visit', async () => {
    state.defaultView = 'next';
    state.tasks.tasks = [task({ title: 'Hoover', dueOn: '2026-11-12' }), task({ title: 'Bins', dueOn: TODAY })];
    renderToday();
    expect(screen.getByRole('button', { name: 'Show a different task' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Today' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all tasks' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show one task' }));
    expect(screen.getByRole('button', { name: 'Show a different task' })).toBeInTheDocument();
  });

  it('moves to the next card on Show a different task, and does not call anything', async () => {
    state.defaultView = 'next';
    state.tasks.tasks = [task({ title: 'First', dueOn: '2026-11-12' }), task({ title: 'Second', dueOn: TODAY })];
    renderToday();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Task 1 of 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show a different task' }));
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Task 2 of 2')).toBeInTheDocument();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    const actions = state.actions as ReturnType<typeof makeActions>;
    for (const fn of [actions.complete, actions.save, actions.remove, actions.swap, actions.create]) expect(fn).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Show a different task' }));
    expect(screen.getByText("That's all for now.")).toBeInTheDocument();
    expect(screen.getByText('Show all tasks to see everything, including the ones you set aside.')).toBeInTheDocument();
  });

  it('completes a task from the list with one tap', async () => {
    const t = task({ title: 'Hoover', assignee: ME.userId });
    state.tasks.tasks = [t];
    renderToday();
    await userEvent.click(screen.getByRole('button', { name: 'Done: Hoover' }));
    expect((state.actions as ReturnType<typeof makeActions>).complete).toHaveBeenCalledWith(t);
  });

  it('shows pending proposals for the viewer, and answers them', async () => {
    const t = task({ title: 'Bathroom', assignee: ME.userId });
    const p: Proposal = { id: 'p1', taskId: t.id, fromUserId: THEM.userId, toUserId: ME.userId, change: { kind: 'swap' }, baseRuleVersion: 1, status: 'pending', createdAt: 1 };
    state.tasks.tasks = [t];
    state.tasks.proposals = [p];
    renderToday();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect((state.actions as ReturnType<typeof makeActions>).accept).toHaveBeenCalledWith(p);
  });

  it('opens the sheet to add a task', async () => {
    renderToday();
    await userEvent.click(screen.getByRole('button', { name: 'Add a task' }));
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument();
  });

  it('shows a loading indicator, and a retry when the tasks cannot be loaded', async () => {
    state.tasks.status = 'loading';
    const { unmount } = renderToday();
    expect(screen.getByRole('status', { name: 'Loading your tasks' })).toBeInTheDocument();
    unmount();
    state.tasks.status = 'error';
    renderToday();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.tasks.refetch).toHaveBeenCalledTimes(1);
  });

  it('has sound headings and no unlabelled controls', async () => {
    state.tasks.tasks = [task({ title: 'Hoover' }), task({ title: 'Far', dueOn: '2026-12-01' })];
    const { container } = renderToday();
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });

  it('never says overdue, missed or streak, and has no small buttons', () => {
    state.tasks.tasks = [task({ dueOn: '2020-01-01' })];
    renderToday();
    expect(document.body.textContent).not.toMatch(/overdue|missed|streak/i);
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});

describe('Today: Let them know', () => {
  it('has the box, unticked, for the changes made on this page', () => {
    renderToday();
    expect(screen.getByRole('checkbox', { name: 'Tell Alex when I save a change' })).not.toBeChecked();
  });
});

describe('Today: the notification prompt', () => {
  it('shows the one-time prompt', () => {
    renderToday();
    expect(screen.getByText('push prompt')).toBeInTheDocument();
  });
});

describe('Today: the Tonight card', () => {
  const recipe = { id: 'r1', title: 'Chilli', mealType: 'dinner', servings: 2, minutes: 20, lowEnergy: true, ingredients: [], steps: [], fieldTimes: {}, createdBy: 'u', updatedAt: 1, updatedBy: 'u' };
  const dinner = (meal: object) => ({ day: TODAY, meal, fieldTimes: { meal: 1 }, updatedAt: 1, updatedBy: 'u1', expiresAt: 9_999_999_999 });

  it('shows tonight\'s dinner at the top, with a link to cook it', () => {
    state.plan.recipes = [recipe];
    state.plan.days = [dinner({ recipeId: 'r1', title: 'Chilli', servings: 4 })];
    renderToday();
    expect(screen.getByRole('heading', { level: 2, name: 'Tonight' })).toBeInTheDocument();
    expect(screen.getByText('Chilli')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Chilli' })).toHaveAttribute('href', `/recipes/r1?servings=4&day=${TODAY}`);
  });

  it('says Nothing planned yet, and Choose an easy dinner plans an easy dinner for tonight', async () => {
    state.plan.recipes = [recipe];
    renderToday();
    expect(screen.getByText('Nothing planned yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose an easy dinner' }));
    await userEvent.click(screen.getByRole('button', { name: 'Look at Chilli' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make this tonight' }));
    expect(state.planActions.set).toHaveBeenCalledWith(TODAY, { recipeId: 'r1', title: 'Chilli', servings: 2 });
  });

  it('shows no card while the plan loads or when it could not load, and the rest of Today still works', () => {
    state.plan = { ...state.plan, status: 'loading' };
    const first = renderToday();
    expect(screen.queryByText('Tonight')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    first.unmount();
    state.plan = { ...state.plan, status: 'error' };
    renderToday();
    expect(screen.queryByText('Tonight')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a task' })).toBeInTheDocument();
  });

  it('keeps sound headings and no violations with the card shown', async () => {
    const { container } = renderToday();
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });
});

describe('Today: Now and next', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(`${TODAY}T08:00:00Z`));
  });
  afterEach(() => vi.useRealTimers());

  it('CUJ 11: says nothing is on now, and that the other person\'s appointment is next, with a way into the calendar', () => {
    state.sources = sourcesOf([calendarEvent()]);
    renderToday();
    const strip = screen.getByRole('heading', { level: 2, name: 'Now and next' }).closest('section') as HTMLElement;
    expect(strip).toHaveTextContent('Now: nothing on');
    expect(strip).toHaveTextContent('Next: Dentist, Alex, at 10:30');
    expect(screen.getByRole('link', { name: 'Open the calendar' })).toHaveAttribute('href', '/plan/calendar');
  });

  it('CUJ 5: says what is on now and until when, and that nothing more is coming', () => {
    vi.setSystemTime(Date.parse(`${TODAY}T21:35:00Z`));
    state.sources = sourcesOf([calendarEvent({ kind: 'block', title: 'Wind down', who: 'u1', startTime: '21:30', durationMin: 30 })]);
    renderToday();
    const strip = screen.getByRole('heading', { level: 2, name: 'Now and next' }).closest('section') as HTMLElement;
    expect(strip).toHaveTextContent('Now: Wind down, until 22:00');
    expect(strip).toHaveTextContent('Nothing more today');
  });

  it('shows the other person\'s private event as Busy, never its title', () => {
    state.sources = sourcesOf([{ id: 'p', busy: true, owner: 'Alex', startOn: TODAY, allDay: false, startTime: '17:00', durationMin: 60, repeat: NONE, skipOn: [] }]);
    renderToday();
    expect(screen.getByRole('heading', { level: 2, name: 'Now and next' }).closest('section')).toHaveTextContent('Next: Busy, Alex, at 17:00');
  });

  it('is left out while the calendar loads or cannot be loaded, and never hides the tasks', () => {
    state.sources = sourcesOf([], 'loading');
    renderToday();
    expect(screen.queryByRole('heading', { name: 'Now and next' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  it('keeps one h1 and sound headings, with no accessibility violations', async () => {
    state.sources = sourcesOf([calendarEvent()]);
    const { container } = renderToday();
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });
});
