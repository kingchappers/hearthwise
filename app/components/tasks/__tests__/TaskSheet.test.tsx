import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TaskActions } from '~/hooks/useTaskActions';
import { MEMBERS, ME, THEM, TODAY, makeActions, renderIn, task } from './fixtures';

let actions: TaskActions;
vi.mock('~/hooks/useTaskActions', () => ({ useTaskActions: () => actions }));
vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Let Alex know</label> }));

import { TaskSheet } from '../TaskSheet';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => { actions = makeActions(); });

function open(t?: ReturnType<typeof task>) {
  const onClose = vi.fn();
  renderIn(<TaskSheet opened onClose={onClose} task={t} />);
  return onClose;
}

describe('TaskSheet: a new task', () => {
  it('creates a task with the typed title, for anyone, not repeating', async () => {
    const onClose = open();
    await userEvent.type(screen.getByLabelText('Title'), '  Hoover the stairs ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hoover the stairs', assignee: 'either', repeat: { type: 'none' } }));
    expect((actions.create as ReturnType<typeof vi.fn>).mock.calls[0][0].id).toMatch(UUID);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not save without a title', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Give it a title');
  });

  it('offers anyone, both of you and each member as who it is for', () => {
    open();
    const options = [...screen.getByLabelText('Who is it for?').querySelectorAll('option')].map(option => option.textContent);
    expect(options).toEqual(['Anyone', 'Together', 'You', 'Alex']);
  });

  it('says Ask Alex instead of Save when the task is for Alex', async () => {
    actions = makeActions({ needsAsk: vi.fn((action: string) => action === 'create') });
    open();
    await userEvent.type(screen.getByLabelText('Title'), 'Bins');
    await userEvent.selectOptions(screen.getByLabelText('Who is it for?'), THEM.userId);
    expect(screen.getByRole('button', { name: 'Ask Alex' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ask Alex' }));
    expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bins', assignee: THEM.userId }));
  });

  it('fills in the suggested date from the repeat rule, and lets it be changed', async () => {
    open();
    await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'after');
    expect(screen.getByLabelText('Due on')).toHaveValue(TODAY);
    fireEvent.change(screen.getByLabelText('Due on'), { target: { value: '2026-11-20' } });
    expect(screen.getByLabelText('Due on')).toHaveValue('2026-11-20');
  });

  it('adds checklist steps', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Title'), 'Clean');
    await userEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    await userEvent.type(screen.getByLabelText('Step 1'), 'Wipe the sink');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const created = (actions.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(created.checklist).toEqual([{ id: expect.stringMatching(UUID), text: 'Wipe the sink' }]);
  });
});

describe('TaskSheet: an existing task', () => {
  it('saves only what changed on one\'s own task', async () => {
    const t = task({ title: 'Hoover', assignee: ME.userId });
    open(t);
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Vacuum');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.save).toHaveBeenCalledWith(t, { title: 'Vacuum' });
  });

  it('says Ask Alex for a schedule change to Alex\'s task, and saves the date', async () => {
    actions = makeActions({ needsAsk: vi.fn((action: string) => action === 'schedule') });
    const t = task({ assignee: THEM.userId, dueOn: '2026-11-14' });
    open(t);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Due on'), { target: { value: '2026-11-20' } });
    expect(screen.getByRole('button', { name: 'Ask Alex' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ask Alex' }));
    expect(actions.save).toHaveBeenCalledWith(t, { dueOn: '2026-11-20' });
  });

  it('warns that a repeat change cancels a swap, only for a swapped task', async () => {
    const swapped = task({ assignee: THEM.userId, overrideAssignee: ME.userId, overrideCycle: 1, cycleSeq: 1 });
    const { unmount } = renderIn(<TaskSheet opened onClose={vi.fn()} task={swapped} />);
    expect(screen.queryByText("This cancels Alex's swap")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'day');
    expect(screen.getByText("This cancels Alex's swap")).toBeInTheDocument();
    unmount();

    const plain = task({ assignee: THEM.userId });
    renderIn(<TaskSheet opened onClose={vi.fn()} task={plain} />);
    await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'none');
    expect(screen.queryByText(/This cancels/)).not.toBeInTheDocument();
  });

  it('has no small buttons and no banned words', () => {
    open(task());
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
    expect(document.body.textContent).not.toMatch(/overdue|missed|streak/i);
    expect(MEMBERS).toHaveLength(2);
  });
});

describe('TaskSheet: Let them know', () => {
  it('has the box on a new task and on an edit, unticked', () => {
    open();
    expect(screen.getByRole('checkbox', { name: 'Let Alex know' })).not.toBeChecked();
  });
});
