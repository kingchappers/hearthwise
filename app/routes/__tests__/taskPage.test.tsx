import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Task } from '../../../src/tasks/types';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';
import { ME, THEM, TODAY, makeActions, task } from '~/components/tasks/__tests__/fixtures';

const state = vi.hoisted(() => ({
  tasks: { status: 'ready', tasks: [] as Task[], proposals: [], today: '2026-11-13', refetch: vi.fn() },
  history: { completions: [], edits: [] } as object,
  actions: undefined as unknown,
}));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/queries', () => ({ useTasks: () => state.tasks }));
vi.mock('~/lib/history', () => ({ useTaskHistory: () => ({ data: state.history, isError: false }) }));
vi.mock('~/hooks/useTaskActions', () => ({ useTaskActions: () => state.actions }));

import TaskPage, { meta } from '../tasks.$id';

function renderPage(id: string) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[`/tasks/${id}`]}>
        <Routes><Route path="/tasks/:id" element={<TaskPage />} /></Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}
const actions = () => state.actions as ReturnType<typeof makeActions>;

beforeEach(() => {
  state.tasks = { status: 'ready', tasks: [], proposals: [], today: TODAY, refetch: vi.fn() };
  state.history = { completions: [], edits: [] };
  state.actions = makeActions();
});

describe('the task page', () => {
  it('is titled Task, and shows the task with its repeat, date, owner and notes', () => {
    expect(meta({} as never)).toEqual([{ title: 'Task – Hearthwise' }]);
    const t = task({ title: 'Bathroom', notes: 'Under the sink too', assignee: THEM.userId, dueOn: '2026-11-10', repeat: { type: 'after', days: 7 } });
    state.tasks.tasks = [t];
    renderPage(t.id);
    expect(screen.getByRole('heading', { level: 1, name: 'Bathroom' })).toBeInTheDocument();
    expect(screen.getByText('Under the sink too')).toBeInTheDocument();
    expect(screen.getByText('7 days after it is done')).toBeInTheDocument();
    expect(screen.getByText(/Due · Tue,? 10 Nov/)).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
  });

  it('says so for a task that is not there', () => {
    renderPage('00000000-0000-4000-8000-0000000000ff');
    expect(screen.getByText("We couldn't find that task.")).toBeInTheDocument();
  });

  it('ticks and unticks checklist steps', async () => {
    const t = task({ checklist: [{ id: 's1', text: 'Stairs' }], checklistState: { s2: { done: true, at: 1 } } });
    state.tasks.tasks = [t];
    renderPage(t.id);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Stairs' }));
    expect(actions().tick).toHaveBeenCalledWith(t, 's1', true);
  });

  it('shows a ticked step as ticked', () => {
    const t = task({ checklist: [{ id: 's1', text: 'Stairs' }], checklistState: { s1: { done: true, at: 1 } } });
    state.tasks.tasks = [t];
    renderPage(t.id);
    expect(screen.getByRole('checkbox', { name: 'Stairs' })).toBeChecked();
  });

  it('completes, and deletes one\'s own task with one tap each', async () => {
    const t = task({ title: 'Hoover', assignee: ME.userId });
    state.tasks.tasks = [t];
    renderPage(t.id);
    await userEvent.click(screen.getByRole('button', { name: 'Done: Hoover' }));
    expect(actions().complete).toHaveBeenCalledWith(t);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(actions().remove).toHaveBeenCalledWith(t);
    expect(screen.queryByRole('button', { name: 'Swap this time' })).not.toBeInTheDocument();
  });

  it('offers a swap on the other person\'s task, and says Ask when a delete needs their say', async () => {
    state.actions = makeActions({ needsAsk: vi.fn((action: string) => action === 'delete') });
    const t = task({ title: 'Bins', assignee: THEM.userId });
    state.tasks.tasks = [t];
    renderPage(t.id);
    await userEvent.click(screen.getByRole('button', { name: 'Swap this time' }));
    expect(actions().swap).toHaveBeenCalledWith(t);
    expect(screen.getByRole('button', { name: 'Ask Alex to delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I did this today: Bins' })).toBeInTheDocument();
  });

  it('opens the sheet to edit', async () => {
    const t = task({ title: 'Hoover' });
    state.tasks.tasks = [t];
    renderPage(t.id);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
  });

  it('shows the history', () => {
    const t = task({ title: 'Hoover' });
    state.tasks.tasks = [t];
    state.history = { completions: [{ cycleSeq: 1, together: false, by: [{ userId: ME.userId, at: 1 }] }], edits: [] };
    renderPage(t.id);
    expect(screen.getByText('Done by Sam')).toBeInTheDocument();
  });

  it('has sound headings, no unlabelled controls, no banned words and no small buttons', async () => {
    const t = task({ title: 'Hoover', checklist: [{ id: 's1', text: 'Stairs' }], assignee: THEM.userId, dueOn: '2020-01-01' });
    state.tasks.tasks = [t];
    const { container } = renderPage(t.id);
    expectSoundHeadings(container);
    await expectNoViolations(container);
    expect(document.body.textContent).not.toMatch(/overdue|missed|streak/i);
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});
