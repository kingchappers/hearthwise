import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Proposal, Task } from '../../../src/tasks/types';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';
import { ME, THEM, TODAY, makeActions, task } from '~/components/tasks/__tests__/fixtures';

const state = vi.hoisted(() => ({
  tasks: { status: 'ready', tasks: [] as Task[], proposals: [] as Proposal[], today: '2026-11-13', refetch: vi.fn() },
  defaultView: 'list' as 'list' | 'next',
  actions: undefined as unknown,
}));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/queries', () => ({ useTasks: () => state.tasks }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({
    status: 'ready', refetch: vi.fn(),
    data: { household: { name: 'Home', timezone: 'Europe/London', createdBy: 'u1', createdAt: '', memberCount: 2 },
      members: [{ userId: 'u1', displayName: 'Sam', joinedAt: '' }, { userId: 'u2', displayName: 'Alex', joinedAt: '' }],
      me: { userId: 'u1', displayName: 'Sam', joinedAt: '', settings: { defaultView: state.defaultView } } },
  }),
}));
vi.mock('~/hooks/useTaskActions', () => ({ useTaskActions: () => state.actions }));

import Today, { meta } from '../_index';

function renderToday() {
  return render(<MantineProvider env="test"><MemoryRouter><Today /></MemoryRouter></MantineProvider>);
}

beforeEach(() => {
  state.tasks = { status: 'ready', tasks: [], proposals: [], today: TODAY, refetch: vi.fn() };
  state.defaultView = 'list';
  state.actions = makeActions();
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
    expect(screen.queryByText('Not now', { exact: false })).not.toBeInTheDocument();
  });

  it('opens on the next-thing card when that is the viewer\'s default view, and can switch to the list for this visit', async () => {
    state.defaultView = 'next';
    state.tasks.tasks = [task({ title: 'Hoover', dueOn: '2026-11-12' }), task({ title: 'Bins', dueOn: TODAY })];
    renderToday();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Today' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show the full list' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show the next thing' }));
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('moves to the next card on Not now, and does not call anything', async () => {
    state.defaultView = 'next';
    state.tasks.tasks = [task({ title: 'First', dueOn: '2026-11-12' }), task({ title: 'Second', dueOn: TODAY })];
    renderToday();
    expect(screen.getByText('First')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    const actions = state.actions as ReturnType<typeof makeActions>;
    for (const fn of [actions.complete, actions.save, actions.remove, actions.swap, actions.create]) expect(fn).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByText('Nothing left for now.')).toBeInTheDocument();
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
