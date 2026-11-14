import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Proposal } from '../../../../src/tasks/types';
import { ProposalBanner } from '../ProposalBanner';
import { MEMBERS, ME, THEM, WORDS_WE_NEVER_USE, renderIn, task } from './fixtures';

const t = task({ title: 'Bathroom', assignee: ME.userId });
const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: `p${Math.random()}`, taskId: t.id, fromUserId: THEM.userId, toUserId: ME.userId, change: { kind: 'swap' }, baseRuleVersion: 1, baseCycleSeq: 1,
  status: 'pending', createdAt: 1, ...over,
});

function renderBanner(proposals: Proposal[], handlers = { onAccept: vi.fn(), onDecline: vi.fn(), onWithdraw: vi.fn() }) {
  renderIn(<ProposalBanner proposals={proposals} tasks={[t]} roster={MEMBERS} viewerId={ME.userId} {...handlers} />);
  return handlers;
}

describe('ProposalBanner', () => {
  it('shows nothing when there are no proposals', () => {
    renderBanner([]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/ask/i)).not.toBeInTheDocument();
  });

  it('shows a pending proposal for the viewer, with Accept and Decline', async () => {
    const p = proposal({ change: { kind: 'swap' } });
    const handlers = renderBanner([p]);
    expect(screen.getByText(/Alex asks to swap/)).toBeInTheDocument();
    expect(screen.getByText(/Bathroom/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(handlers.onAccept).toHaveBeenCalledWith(p);
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(handlers.onDecline).toHaveBeenCalledWith(p);
  });

  it('describes each kind of change', () => {
    renderBanner([
      proposal({ change: { kind: 'delete' } }),
      proposal({ change: { kind: 'restore' } }),
      proposal({ change: { kind: 'edit', set: { assignee: ME.userId } } }),
      proposal({ change: { kind: 'edit', set: { dueOn: '2026-11-20' } } }),
    ]);
    expect(screen.getByText(/asks to delete/)).toBeInTheDocument();
    expect(screen.getByText(/asks to restore/)).toBeInTheDocument();
    expect(screen.getByText(/asks to give .* to you/)).toBeInTheDocument();
    expect(screen.getByText(/asks to move .* to .*20 Nov/)).toBeInTheDocument();
  });

  it('shows the proposer their own pending proposal, with Withdraw', async () => {
    const p = proposal({ fromUserId: ME.userId, toUserId: THEM.userId });
    const handlers = renderBanner([p]);
    expect(screen.getByText(/You asked Alex/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(handlers.onWithdraw).toHaveBeenCalledWith(p);
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('shows the proposer what became of resolved ones, and says a stale one no longer applies', () => {
    renderBanner([
      proposal({ fromUserId: ME.userId, toUserId: THEM.userId, status: 'accepted', resolvedAt: 5 }),
      proposal({ fromUserId: ME.userId, toUserId: THEM.userId, status: 'declined', resolvedAt: 5 }),
      proposal({ fromUserId: ME.userId, toUserId: THEM.userId, status: 'stale', resolvedAt: 5 }),
    ]);
    expect(screen.getByText(/Alex accepted/)).toBeInTheDocument();
    expect(screen.getByText(/Alex declined/)).toBeInTheDocument();
    expect(screen.getByText('No longer applies: the task changed')).toBeInTheDocument();
  });

  it('never says overdue, missed or streak, and has no small buttons', () => {
    renderBanner([proposal(), proposal({ fromUserId: ME.userId, toUserId: THEM.userId })]);
    expect(document.body.textContent).not.toMatch(WORDS_WE_NEVER_USE);
    for (const button of within(document.body).getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});
