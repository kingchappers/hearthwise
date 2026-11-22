import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import type { MoneyEntry } from '../../../../src/money/types';
import { expectNoViolations } from '~/test-utils/accessibility';

vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Tell Alex when I save a change</label> }));

import { AddSheet } from '../AddSheet';
import type { AddSheetProps } from '../AddSheet';
import { ALEX, SAM, TODAY, entry, makeActions, people, renderIn } from './fixtures';

const onClose = vi.fn();
let actions = makeActions();

function renderSheet(props: Partial<AddSheetProps> = {}) {
  return renderIn(<AddSheet opened onClose={onClose} entries={[]} people={people} today={TODAY} canWrite actions={actions} {...props} />);
}

const type = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text);
const addedWith = (): Record<string, unknown> => (actions.add as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];

beforeEach(() => { onClose.mockClear(); actions = makeActions(); });

describe('AddSheet: adding', () => {
  it('is titled Add, offers the three kinds, and starts with the caller as payer, today and an equal split', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map(radio => (radio as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Shared expense', 'Loan', 'Payment']);
    expect(screen.getByRole('radio', { name: 'Shared expense' })).toBeChecked();
    expect(screen.getByLabelText('Who paid?')).toHaveValue(SAM);
    expect(screen.getByLabelText('On what date?')).toHaveValue(TODAY);
    expect(screen.getByLabelText('Split')).toHaveValue('equal');
  });

  it('stops the description at 120 characters', () => {
    renderSheet();
    expect(screen.getByLabelText('What for?')).toHaveAttribute('maxlength', '120');
  });

  it('shows the other person\'s share as it is typed, by name', async () => {
    renderSheet();
    await type('What for?', 'Weekly shop');
    await type('How much?', '63.40');
    expect(screen.getByText("Alex's share: £31.70")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Who paid?'), ALEX);
    expect(screen.getByText("Sam's share: £31.70")).toBeInTheDocument();
  });

  it('offers the split choices with names, and works out each', async () => {
    renderSheet();
    const labels = [...screen.getByLabelText('Split').querySelectorAll('option')].map(option => option.textContent);
    expect(labels).toEqual(['Equal', 'Sam covers it all', 'Alex covers it all', 'A fixed share for Alex', 'A percentage for Alex']);
    await type('How much?', '50');
    await userEvent.selectOptions(screen.getByLabelText('Split'), 'otherCovers');
    expect(screen.getByText("Alex's share: £50.00")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Split'), 'fixed');
    await type('Fixed share for Alex, in pounds', '12.50');
    expect(screen.getByText("Alex's share: £12.50")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Split'), 'percent');
    await type('Percentage for Alex', '30');
    expect(screen.getByText("Alex's share: £15.00")).toBeInTheDocument();
  });

  it('says a share cannot be more than the total, and does not save', async () => {
    renderSheet();
    await type('What for?', 'Shop');
    await type('How much?', '50');
    await userEvent.selectOptions(screen.getByLabelText('Split'), 'fixed');
    await type('Fixed share for Alex, in pounds', '60');
    expect(screen.getByText("A share can't be more than the total, £50.00.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(actions.add).not.toHaveBeenCalled();
  });

  it('adds an expense and closes', async () => {
    renderSheet();
    await type('What for?', 'Weekly shop');
    await type('How much?', '63.40');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ kind: 'expense', description: 'Weekly shop', on: TODAY, money: { paidBy: SAM, amountPence: 6340, sharePence: 3170 } });
    expect(addedWith().id).toMatch(/^[0-9a-f-]{36}$/);
    expect(onClose).toHaveBeenCalled();
  });

  it('says what is wrong, and saves nothing, when the amount cannot be read', async () => {
    renderSheet();
    await type('What for?', 'Shop');
    await type('How much?', '12,50');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Use a full stop, like 12.50')).toBeInTheDocument();
    expect(actions.add).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('makes the entry id and the mutation id once when it opens, so a double tap is one entry', async () => {
    const { rerender } = renderSheet();
    await type('What for?', 'Rent');
    await type('How much?', '50');
    const save = screen.getByRole('button', { name: 'Add' });
    await userEvent.click(save);
    await userEvent.click(save);
    const [first, second] = (actions.add as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0]);
    expect(second.id).toBe(first.id);
    expect(second.mutationId).toBe(first.mutationId);

    // Closed and opened again: a new entry, a new write.
    const sheet = (opened: boolean) => <MantineProvider env="test"><MemoryRouter><AddSheet opened={opened} onClose={onClose} entries={[]} people={people} today={TODAY} canWrite actions={actions} /></MemoryRouter></MantineProvider>;
    rerender(sheet(false));
    rerender(sheet(true));
    await type('What for?', 'Rent');
    await type('How much?', '50');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const third = (actions.add as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(third.id).not.toBe(first.id);
    expect(third.mutationId).not.toBe(first.mutationId);
  });

  it('adds a loan with the lender, the whole amount as the share, and no split to choose', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: 'Loan' }));
    expect(screen.getByLabelText('Who lent it?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Split')).not.toBeInTheDocument();
    await type('What for?', 'Rent shortfall');
    await type('How much?', '50');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ kind: 'loan', description: 'Rent shortfall', money: { paidBy: SAM, amountPence: 5000, sharePence: 5000 } });
  });

  it('adds a payment with no description field, and a description made from the loan it is for', async () => {
    const loan = entry({ kind: 'loan', paidBy: SAM, amountPence: 5000, sharePence: 5000, description: 'Rent shortfall' });
    renderSheet({ entries: [loan] });
    await userEvent.click(screen.getByRole('radio', { name: 'Payment' }));
    expect(screen.queryByLabelText('What for?')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Who sent it?'), ALEX);
    await userEvent.selectOptions(screen.getByLabelText('Which loan is it for?'), loan.id);
    await type('How much?', '20');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ kind: 'payment', description: 'Payment for Rent shortfall', money: { paidBy: ALEX, amountPence: 2000, sharePence: 2000, loanId: loan.id } });
  });

  it('offers only the open loans the sender borrowed, and None', async () => {
    const mine = entry({ kind: 'loan', paidBy: SAM, amountPence: 5000, sharePence: 5000, description: 'From Sam' });
    const theirs = entry({ kind: 'loan', paidBy: ALEX, amountPence: 5000, sharePence: 5000, description: 'From Alex' });
    const paid = entry({ kind: 'loan', paidBy: SAM, amountPence: 1000, sharePence: 1000, description: 'Paid off' });
    const payment = entry({ kind: 'payment', paidBy: ALEX, amountPence: 1000, sharePence: 1000, loanId: paid.id });
    renderSheet({ entries: [mine, theirs, paid, payment] });
    await userEvent.click(screen.getByRole('radio', { name: 'Payment' }));
    const options = () => [...screen.getByLabelText('Which loan is it for?').querySelectorAll('option')].map(option => option.textContent);
    expect(options()).toEqual(['None, just a payment', 'From Alex, £50.00']);
    await userEvent.selectOptions(screen.getByLabelText('Who sent it?'), ALEX);
    expect(options()).toEqual(['None, just a payment', 'From Sam, £50.00']);
  });

  it('adds a payment with no loan, described as a payment', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: 'Payment' }));
    await type('How much?', '20');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addedWith()).toMatchObject({ kind: 'payment', description: 'Payment' });
    expect((addedWith().money as Record<string, unknown>).loanId).toBeUndefined();
  });

  it('hints, without blocking, when a payment matches a live one from the same sender, amount and date', async () => {
    const existing = entry({ kind: 'payment', paidBy: ALEX, amountPence: 2000, sharePence: 2000, status: 'waiting', on: TODAY });
    renderSheet({ entries: [existing] });
    await userEvent.click(screen.getByRole('radio', { name: 'Payment' }));
    await userEvent.selectOptions(screen.getByLabelText('Who sent it?'), ALEX);
    expect(screen.queryByText(/There is already/)).not.toBeInTheDocument();
    await type('How much?', '20');
    expect(screen.getByRole('status')).toHaveTextContent('There is already a £20.00 payment from Alex on this date. Is this a different one?');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(actions.add).toHaveBeenCalledTimes(1);
  });

  it('does not hint for an expense', async () => {
    renderSheet({ entries: [entry({ kind: 'payment', paidBy: SAM, amountPence: 2000, sharePence: 2000, on: TODAY })] });
    await type('How much?', '20');
    expect(screen.queryByText(/There is already/)).not.toBeInTheDocument();
  });

  it('turns Add off, and says why, when the ledger is read only', () => {
    renderSheet({ canWrite: false });
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByText('Adding or agreeing needs the two people this ledger is between.')).toBeInTheDocument();
  });

  it('has the Let them know box, and no violations', async () => {
    renderSheet();
    expect(screen.getByRole('checkbox', { name: 'Tell Alex when I save a change' })).not.toBeChecked();
    await expectNoViolations(document.body);
  });

  it('has no small buttons', () => {
    renderSheet();
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});

describe('AddSheet: editing', () => {
  const base = (over: Partial<MoneyEntry> = {}): MoneyEntry => entry({ description: 'Weekly shop', on: '2026-11-10', ...over });

  it('opens a waiting entry with its figures, and saves a changed amount as a direct edit with only what changed', async () => {
    const waiting = base({ status: 'declined', version: 3, agreedBy: undefined, agreedAt: undefined });
    renderSheet({ entry: waiting });
    expect(screen.getByRole('dialog', { name: 'Edit entry' })).toBeInTheDocument();
    expect(screen.getByLabelText('How much?')).toHaveValue('63.40');
    expect(screen.getByLabelText('What for?')).toHaveValue('Weekly shop');
    expect(screen.getByLabelText('Split')).toHaveValue('fixed');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('How much?'));
    await type('How much?', '36.40');
    await userEvent.selectOptions(screen.getByLabelText('Split'), 'equal');
    expect(screen.getByText("Alex's share: £18.20")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.edit).toHaveBeenCalledWith(waiting, { money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } });
    expect(onClose).toHaveBeenCalled();
  });

  it('saves nothing, and closes, when nothing changed', async () => {
    renderSheet({ entry: base({ status: 'waiting' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.edit).not.toHaveBeenCalled();
    expect(actions.askChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('asks the other person to agree to a change of the money of an agreed entry, and says so', async () => {
    const agreed = base();
    renderSheet({ entry: agreed });
    expect(screen.getByRole('dialog', { name: 'Change entry' })).toBeInTheDocument();
    expect(screen.getByText('A change to the money needs Alex to agree. A change to the words or the date does not.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('How much?'));
    await type('How much?', '36.40');
    await userEvent.selectOptions(screen.getByLabelText('Split'), 'equal');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Alex to agree' }));
    expect(actions.askChange).toHaveBeenCalledWith(agreed, { money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } });
    expect(actions.edit).not.toHaveBeenCalled();
  });

  it('changes the words and the date of an agreed entry at once, with no request', async () => {
    const agreed = base();
    renderSheet({ entry: agreed });
    await userEvent.clear(screen.getByLabelText('What for?'));
    await type('What for?', 'Big shop');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.edit).toHaveBeenCalledWith(agreed, { description: 'Big shop' });
    expect(actions.askChange).not.toHaveBeenCalled();
  });

  it('with only the words and date to change, hides the money fields', async () => {
    const asked = base({ pendingChange: { id: 'r', by: SAM, at: 1, delete: true } });
    renderSheet({ entry: asked, wordsOnly: true });
    expect(screen.getByRole('dialog', { name: 'Change words or date' })).toBeInTheDocument();
    expect(screen.queryByLabelText('How much?')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Split')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('On what date?'));
    await type('On what date?', '2026-11-12');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.edit).toHaveBeenCalledWith(asked, { on: '2026-11-12' });
  });

  it('cannot change the kind of an entry', () => {
    renderSheet({ entry: base({ kind: 'loan', amountPence: 5000, sharePence: 5000 }) });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Who lent it?')).toHaveValue(SAM);
    expect(screen.queryByLabelText('Split')).not.toBeInTheDocument();
  });
});
