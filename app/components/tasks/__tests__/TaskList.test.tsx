import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextThing } from '../NextThing';
import { TaskList } from '../TaskList';
import { MEMBERS, ME, THEM, TODAY, WORDS_WE_NEVER_USE, renderIn, task } from './fixtures';

function renderList(tasks = [task()], onComplete = vi.fn()) {
  renderIn(<TaskList tasks={tasks} today={TODAY} roster={MEMBERS} viewerId={ME.userId} onComplete={onComplete} />);
  return onComplete;
}

describe('TaskList', () => {
  it('groups tasks under Today, This week, Later and Whenever, in that order, leaving out empty groups', () => {
    renderList([
      task({ title: 'Past', dueOn: '2026-11-10' }), task({ title: 'Soon', dueOn: '2026-11-14' }),
      task({ title: 'Far', dueOn: '2026-12-01' }), task({ title: 'Someday', repeat: { type: 'none' }, dueOn: undefined }),
    ]);
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Today', 'This week', 'Later', 'Whenever']);
    renderList([task({ dueOn: TODAY })]);
  });

  it('shows who a task is for and when it is due, reading Due for today and earlier', () => {
    renderList([task({ title: 'Past', dueOn: '2026-11-10', assignee: ME.userId }), task({ title: 'Shared job', dueOn: TODAY, assignee: 'both' })]);
    const past = screen.getByText('Past').closest('li')!;
    expect(within(past).getByText(/You/)).toBeInTheDocument();
    expect(within(past).getByText(/Due · Tue,? 10 Nov/)).toBeInTheDocument();
    expect(within(screen.getByText('Shared job').closest('li')!).getByText(/Both of you/)).toBeInTheDocument();
  });

  it('never says overdue, missed or streak, however late a task is', () => {
    renderList([task({ dueOn: '2020-01-01' }), task({ dueOn: '2026-11-12' })]);
    expect(document.body.textContent).not.toMatch(WORDS_WE_NEVER_USE);
  });

  it('has one tap to say it was done on every row, "Done" on one\'s own and "I did this today" on the other\'s', async () => {
    const mine = task({ title: 'Mine', assignee: ME.userId });
    const theirs = task({ title: 'Theirs', assignee: THEM.userId });
    const onComplete = renderList([mine, theirs]);
    await userEvent.click(screen.getByRole('button', { name: 'Done: Mine' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(mine);
    await userEvent.click(screen.getByRole('button', { name: 'I did this today: Theirs' }));
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith(theirs);
  });

  it('links each row to its task page', () => {
    const t = task({ title: 'Hoover' });
    renderList([t]);
    expect(screen.getByRole('link', { name: 'Hoover' })).toHaveAttribute('href', `/tasks/${t.id}`);
  });

  it('says what will appear when there is nothing', () => {
    renderList([]);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getByText('Chores and to-dos you add will show up here.')).toBeInTheDocument();
  });

  it('has no button smaller than the touch minimum', () => {
    renderList([task(), task({ assignee: THEM.userId })]);
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});

describe('NextThing', () => {
  const renderCard = (t: ReturnType<typeof task> | undefined, over: { onDone?: () => void; onNotNow?: () => void } = {}) => {
    const onDone = over.onDone ?? vi.fn();
    const onNotNow = over.onNotNow ?? vi.fn();
    renderIn(<NextThing task={t} today={TODAY} roster={MEMBERS} viewerId={ME.userId} onDone={onDone} onNotNow={onNotNow} />);
    return { onDone, onNotNow };
  };

  it('shows one card with the task, who it is for and its date', () => {
    renderCard(task({ title: 'Bins', dueOn: '2026-11-12', assignee: 'both' }));
    expect(screen.getByText('Bins')).toBeInTheDocument();
    expect(screen.getByText(/Both of you/)).toBeInTheDocument();
    expect(screen.getByText(/Due · /)).toBeInTheDocument();
  });

  it('has Done and Show a different task, each calling only its own handler', async () => {
    const t = task({ title: 'Bins' });
    const { onDone, onNotNow } = renderCard(t);
    await userEvent.click(screen.getByRole('button', { name: 'Show a different task' }));
    expect(onNotNow).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Done: Bins' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing left for now', () => {
    renderCard(undefined);
    expect(screen.getByText("That's all for now.")).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('never says overdue, missed or streak, and has no small buttons', () => {
    renderCard(task({ dueOn: '2020-01-01' }));
    expect(document.body.textContent).not.toMatch(WORDS_WE_NEVER_USE);
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});

describe('NextThing: where the card is, and what the button does', () => {
  it('says which task of how many it is, and what Show a different task does and does not do', () => {
    renderIn(<NextThing task={task({ title: 'Hoover' })} today={TODAY} roster={MEMBERS} viewerId={ME.userId} onDone={vi.fn()} onNotNow={vi.fn()} position={2} total={5} />);
    expect(screen.getByText('Task 2 of 5')).toBeInTheDocument();
    expect(screen.getByText('Show a different task sets this one aside for this visit. Nothing changes for anyone.')).toBeInTheDocument();
  });
});

describe('TaskList: a task the viewer has asked the other person to take', () => {
  it('says "Asked of Alex" in place of "Anyone" while the request waits, and only on that task', () => {
    const asked = task({ id: 'asked', title: 'Clean oven', assignee: 'either' });
    const other = task({ id: 'other', title: 'Hoover', assignee: 'either' });
    renderIn(<TaskList tasks={[asked, other]} today={TODAY} roster={MEMBERS} viewerId={ME.userId} onComplete={vi.fn()} askedOf={new Map([['asked', 'Alex']])} />);
    const rows = screen.getAllByRole('listitem');
    expect(within(rows.find(row => /Clean oven/.test(row.textContent ?? ''))!).getByText(/Asked of Alex/)).toBeInTheDocument();
    expect(within(rows.find(row => /Hoover/.test(row.textContent ?? ''))!).queryByText(/Asked of/)).not.toBeInTheDocument();
  });
});
