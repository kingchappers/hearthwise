import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loanLines } from '~/lib/money';
import { EntryList } from '../EntryList';
import { EntryRow } from '../EntryRow';
import { LoanList } from '../LoanList';
import { TotalCard } from '../TotalCard';
import { WaitingList } from '../WaitingList';
import { ALEX, SAM, entry, makeActions, people, renderIn, waitingForMe } from './fixtures';

const noSmallButtons = () => { for (const button of screen.queryAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs'); };

describe('TotalCard', () => {
  it('says who pays whom, in words', () => {
    renderIn(<TotalCard total={{ direction: 'toMe', pence: 8170 }} people={people} unsaved={0} />);
    expect(screen.getByText('£81.70 to settle, from Alex to Sam')).toBeInTheDocument();
  });

  it('says All square at zero', () => {
    renderIn(<TotalCard total={{ direction: 'square', pence: 0 }} people={people} unsaved={0} />);
    expect(screen.getByText('All square')).toBeInTheDocument();
  });

  it('says how many changes are not saved yet, and nothing when none are', () => {
    const { unmount } = renderIn(<TotalCard total={{ direction: 'square', pence: 0 }} people={people} unsaved={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 change not saved yet');
    unmount();
    renderIn(<TotalCard total={{ direction: 'square', pence: 0 }} people={people} unsaved={2} />);
    expect(screen.getByRole('status')).toHaveTextContent('2 changes not saved yet');
  });

  it('shows no unsaved line when everything is saved', () => {
    renderIn(<TotalCard total={{ direction: 'square', pence: 0 }} people={people} unsaved={0} />);
    expect(screen.queryByText(/not saved yet/)).not.toBeInTheDocument();
  });
});

describe('EntryRow', () => {
  it('links to the entry and shows what, when, how much, and the share in words', () => {
    const shop = entry({ description: 'Weekly shop' });
    renderIn(<ul><EntryRow entry={shop} people={people} notSaved={false} /></ul>);
    expect(screen.getByRole('link', { name: 'Weekly shop' })).toHaveAttribute('href', `/money/${shop.id}`);
    expect(screen.getByText('Shared expense · Sun 15 Nov')).toBeInTheDocument();
    expect(screen.getByText('£63.40 paid by Sam')).toBeInTheDocument();
    expect(screen.getByText("Alex's share: £31.70 of £63.40")).toBeInTheDocument();
  });

  it('says a loan or a payment goes from one person to the other', () => {
    renderIn(<ul><EntryRow entry={entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 })} people={people} notSaved={false} /></ul>);
    expect(screen.getByText('£50.00 from Sam to Alex')).toBeInTheDocument();
    expect(screen.queryByText(/share:/)).not.toBeInTheDocument();
  });

  it('shows its state in words, and Not saved yet when changes are queued', () => {
    renderIn(<ul><EntryRow entry={waitingForMe()} people={people} notSaved /></ul>);
    expect(screen.getByText('Waiting for you')).toBeInTheDocument();
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  });

  it('shows a request to change beside the figure it would change', () => {
    const asked = entry({ pendingChange: { id: 'r', by: SAM, at: 1, money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } } });
    renderIn(<ul><EntryRow entry={asked} people={people} notSaved={false} /></ul>);
    expect(screen.getByText('Change waiting for Alex: £63.40 to £36.40')).toBeInTheDocument();
  });
});

describe('WaitingList: for you', () => {
  it('agrees to a waiting entry, or asks the other person to check it', async () => {
    const actions = makeActions();
    const rent = waitingForMe({ kind: 'loan', amountPence: 5000, sharePence: 5000, description: 'Rent shortfall' });
    renderIn(<WaitingList title="Waiting for you" mode="forMe" entries={[rent]} people={people} unsavedIds={new Set()} canWrite actions={actions} onEdit={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Waiting for you' })).toBeInTheDocument();
    expect(screen.getByText('£50.00 from Alex to Sam')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agree: Rent shortfall' }));
    expect(actions.respond).toHaveBeenCalledWith(rent, 'agree');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Alex to check: Rent shortfall' }));
    expect(actions.respond).toHaveBeenCalledWith(rent, 'decline');
  });

  it('answers a change request, not the entry', async () => {
    const actions = makeActions();
    const asked = entry({ description: 'Shop', pendingChange: { id: 'r', by: ALEX, at: 1, delete: true } });
    renderIn(<WaitingList title="Waiting for you" mode="forMe" entries={[asked]} people={people} unsavedIds={new Set()} canWrite actions={actions} onEdit={vi.fn()} />);
    expect(screen.getByText('Delete waiting for you')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agree: Shop' }));
    expect(actions.respondChange).toHaveBeenCalledWith(asked, 'agree');
    expect(actions.respond).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: "Don't change it: Shop" }));
    expect(actions.respondChange).toHaveBeenCalledWith(asked, 'decline');
  });

  it('turns the buttons off when the ledger is read only', () => {
    renderIn(<WaitingList title="Waiting for you" mode="forMe" entries={[waitingForMe({ description: 'Rent' })]} people={people} unsavedIds={new Set()} canWrite={false} actions={makeActions()} onEdit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Agree: Rent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ask Alex to check: Rent' })).toBeDisabled();
  });

  it('has no small buttons', () => {
    renderIn(<WaitingList title="Waiting for you" mode="forMe" entries={[waitingForMe()]} people={people} unsavedIds={new Set()} canWrite actions={makeActions()} onEdit={vi.fn()} />);
    noSmallButtons();
  });
});

describe('WaitingList: for them and needs another look', () => {
  it('lists your waiting entries with their state, and lets you withdraw a request', async () => {
    const actions = makeActions();
    const asked = entry({ description: 'Shop', pendingChange: { id: 'r', by: SAM, at: 1, delete: true } });
    renderIn(<WaitingList title="Waiting for Alex" mode="forOther" entries={[asked]} people={people} unsavedIds={new Set()} canWrite actions={actions} onEdit={vi.fn()} />);
    expect(screen.getByText('Delete waiting for Alex')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw: Shop' }));
    expect(actions.withdrawChange).toHaveBeenCalledWith(asked);
  });

  it('shows a waiting entry of yours as Waiting for Alex', () => {
    renderIn(<WaitingList title="Waiting for Alex" mode="forOther" entries={[entry({ status: 'waiting', description: 'Mine' })]} people={people} unsavedIds={new Set()} canWrite actions={makeActions()} onEdit={vi.fn()} />);
    expect(within(screen.getByRole('listitem')).getByText('Waiting for Alex')).toBeInTheDocument();
  });

  it('offers Change and Delete on an entry the other person wants to check', async () => {
    const actions = makeActions();
    const onEdit = vi.fn();
    const declined = entry({ status: 'declined', description: 'Weekly shop' });
    renderIn(<WaitingList title="Needs another look" mode="needsLook" entries={[declined]} people={people} unsavedIds={new Set()} canWrite actions={actions} onEdit={onEdit} />);
    expect(screen.getByText('Alex wants to check this one')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change: Weekly shop' }));
    expect(onEdit).toHaveBeenCalledWith(declined);
    await userEvent.click(screen.getByRole('button', { name: 'Delete: Weekly shop' }));
    expect(actions.remove).toHaveBeenCalledWith(declined);
  });

  it('renders nothing for an empty list', () => {
    renderIn(<WaitingList title="Waiting for Alex" mode="forOther" entries={[]} people={people} unsavedIds={new Set()} canWrite actions={makeActions()} onEdit={vi.fn()} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('WaitingList: a second tap', () => {
  it('turns the buttons off for an entry that already has a change queued, so a double tap is one write', () => {
    const rent = waitingForMe({ description: 'Rent' });
    renderIn(<WaitingList title="Waiting for you" mode="forMe" entries={[rent]} people={people} unsavedIds={new Set([rent.id])} canWrite actions={makeActions()} onEdit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Agree: Rent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ask Alex to check: Rent' })).toBeDisabled();
  });

  it('does the same for Withdraw', () => {
    const asked = entry({ description: 'Shop', pendingChange: { id: 'r', by: SAM, at: 1, delete: true } });
    renderIn(<WaitingList title="Waiting for Alex" mode="forOther" entries={[asked]} people={people} unsavedIds={new Set([asked.id])} canWrite actions={makeActions()} onEdit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Withdraw: Shop' })).toBeDisabled();
  });
});

describe('LoanList', () => {
  it('shows each loan\'s progress as a line of text, with a bar that is only a picture', () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000, description: 'Rent shortfall' });
    const payment = entry({ kind: 'payment', paidBy: ALEX, amountPence: 2000, sharePence: 2000, loanId: loan.id });
    const { container } = renderIn(<LoanList loans={loanLines([loan, payment])} people={people} unsavedIds={new Set()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Loans' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rent shortfall' })).toBeInTheDocument();
    expect(screen.getByText('£20.00 of £50.00')).toBeInTheDocument();
    expect(container.querySelector('[role="progressbar"]')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('says paid back, in words, for a loan that is', () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 });
    const payment = entry({ kind: 'payment', paidBy: ALEX, amountPence: 6000, sharePence: 6000, loanId: loan.id });
    renderIn(<LoanList loans={loanLines([loan, payment])} people={people} unsavedIds={new Set()} />);
    expect(screen.getByText('£50.00 of £50.00, paid back')).toBeInTheDocument();
  });

  it('renders nothing when there are no loans', () => {
    renderIn(<LoanList loans={[]} people={people} unsavedIds={new Set()} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('EntryList', () => {
  it('lists the entries under Entries, marking those not saved yet', () => {
    const a = entry({ description: 'Alpha' });
    const b = entry({ description: 'Bravo' });
    renderIn(<EntryList entries={[a, b]} people={people} unsavedIds={new Set([b.id])} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Entries' })).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).queryByText('Not saved yet')).not.toBeInTheDocument();
    expect(within(rows[1]).getByText('Not saved yet')).toBeInTheDocument();
  });

  it('renders nothing for an empty list', () => {
    renderIn(<EntryList entries={[]} people={people} unsavedIds={new Set()} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
