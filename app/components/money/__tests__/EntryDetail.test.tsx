import { describe, expect, it, vi } from 'vitest';
import { cleanup, within, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MoneyEntry } from '../../../../src/money/types';
import { loanLines } from '~/lib/money';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';
import { EntryDetail } from '../EntryDetail';
import type { EntryDetailProps } from '../EntryDetail';
import { ALEX, SAM, entry, makeActions, people, renderIn, waitingForMe } from './fixtures';

const AT = Date.parse('2026-11-12T10:00:00Z');
const onEdit = vi.fn();

function renderDetail(shown: MoneyEntry, props: Partial<EntryDetailProps> = {}) {
  const actions = props.actions ?? makeActions();
  const view = renderIn(<EntryDetail entry={shown} people={people} notSaved={false} canWrite loan={undefined} actions={actions} onEdit={onEdit} {...props} />);
  return { ...view, actions };
}

describe('EntryDetail: what it shows', () => {
  it('shows the money, the payer, each person\'s share in words, who added it and who agreed, and when', () => {
    const shop = entry({ description: 'Weekly shop', createdAt: AT, agreedAt: AT, updatedAt: AT });
    renderDetail(shop);
    expect(screen.getByRole('heading', { level: 1, name: 'Weekly shop' })).toBeInTheDocument();
    expect(screen.getByText('Shared expense')).toBeInTheDocument();
    expect(screen.getByText('£63.40 paid by Sam')).toBeInTheDocument();
    expect(screen.getByText("Alex's share: £31.70 of £63.40")).toBeInTheDocument();
    expect(screen.getByText('Date: Sun 15 Nov')).toBeInTheDocument();
    expect(screen.getByText(/Added by Sam, .*12 Nov/)).toBeInTheDocument();
    expect(screen.getByText(/Agreed by Alex, .*12 Nov/)).toBeInTheDocument();
    expect(screen.getByText(/Last changed by Alex, .*12 Nov/)).toBeInTheDocument();
  });

  it('says No agreement needed for an entry with no share', () => {
    renderDetail(entry({ sharePence: 0, agreedBy: undefined }));
    expect(screen.getByText('No agreement needed')).toBeInTheDocument();
  });

  it('shows a loan\'s progress', () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 });
    const [line] = loanLines([loan]);
    renderDetail(loan, { loan: line });
    expect(screen.getByText('£0.00 of £50.00')).toBeInTheDocument();
  });

  it('shows its state, and Not saved yet', () => {
    renderDetail(entry({ status: 'declined' }), { notSaved: true });
    expect(screen.getByText('Alex wants to check this one')).toBeInTheDocument();
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  });

  it('shows a request to change beside the figure it would change, with who asked', () => {
    const asked = entry({ pendingChange: { id: 'r', by: SAM, at: AT, money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } } });
    renderDetail(asked);
    expect(screen.getAllByText('Change waiting for Alex: £63.40 to £36.40').length).toBeGreaterThan(0);
    expect(screen.getByText(/Asked by Sam, .*12 Nov/)).toBeInTheDocument();
  });

  it('names a former member', () => {
    renderDetail(entry({ paidBy: ALEX }), { people: { ...people, otherName: 'Former member' } });
    expect(screen.getByText('£63.40 paid by Former member')).toBeInTheDocument();
  });

  it('has sound headings and no violations, for each state', async () => {
    const states = [entry(), waitingForMe(), entry({ status: 'declined' }), entry({ pendingChange: { id: 'r', by: ALEX, at: AT, delete: true } }), entry({ deletedAt: AT, deletedBy: SAM })];
    for (const state of states) {
      const { container, unmount } = renderDetail(state);
      expectSoundHeadings(container);
      await expectNoViolations(container);
      for (const button of screen.queryAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
      unmount();
    }
  });
});

describe('EntryDetail: the buttons that apply', () => {
  const buttons = () => screen.queryAllByRole('button').map(button => button.textContent);

  it('offers Agree and Ask them to check on a waiting entry from the other person', async () => {
    const waiting = waitingForMe();
    const { actions } = renderDetail(waiting);
    expect(buttons()).toEqual(['Agree', 'Ask Alex to check', 'Say why']);
    await userEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(actions.respond).toHaveBeenCalledWith(waiting, 'agree');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Alex to check' }));
    expect(actions.respond).toHaveBeenCalledWith(waiting, 'decline');
  });

  it('offers Change and Delete on your own waiting or declined entry, and deletes it directly', async () => {
    const mine = entry({ status: 'declined' });
    const { actions } = renderDetail(mine);
    expect(buttons()).toEqual(['Change', 'Delete']);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onEdit).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(actions.remove).toHaveBeenCalledWith(mine);
  });

  it('offers nothing but the state on an entry the other person must change', () => {
    renderDetail(entry({ status: 'declined', proposedBy: ALEX, paidBy: ALEX }));
    expect(buttons()).toEqual([]);
  });

  it('offers Change and Delete on an agreed entry, and asks for a delete rather than making it', async () => {
    const agreed = entry();
    const { actions } = renderDetail(agreed);
    expect(buttons()).toEqual(['Change', 'Delete']);
    expect(screen.getByText('Alex needs to agree to a delete.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(actions.askChange).toHaveBeenCalledWith(agreed, { delete: true });
    expect(actions.remove).not.toHaveBeenCalled();
  });

  it('says payments recorded against a loan stay in the total, when deleting a loan', () => {
    renderDetail(entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 }));
    expect(screen.getByText('Payments recorded against this loan will stay in the total.')).toBeInTheDocument();
  });

  it('does not say it for an expense', () => {
    renderDetail(entry());
    expect(screen.queryByText(/Payments recorded against/)).not.toBeInTheDocument();
  });

  it('lets the other person agree to a request, or keep things as they are', async () => {
    const asked = entry({ pendingChange: { id: 'r', by: ALEX, at: AT, delete: true } });
    const { actions } = renderDetail(asked);
    expect(buttons()).toEqual(['Agree', 'Keep as it is', 'Change words or date']);
    await userEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(actions.respondChange).toHaveBeenCalledWith(asked, 'agree');
    await userEvent.click(screen.getByRole('button', { name: 'Keep as it is' }));
    expect(actions.respondChange).toHaveBeenCalledWith(asked, 'decline');
  });

  it('lets the person who asked withdraw, and still change the words or date', async () => {
    const asked = entry({ pendingChange: { id: 'r', by: SAM, at: AT, delete: true } });
    const { actions } = renderDetail(asked);
    expect(buttons()).toEqual(['Withdraw', 'Change words or date']);
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(actions.withdrawChange).toHaveBeenCalledWith(asked);
    await userEvent.click(screen.getByRole('button', { name: 'Change words or date' }));
    expect(onEdit).toHaveBeenCalledWith(true);
  });

  it('offers Restore on a deleted entry, and says who deleted it', async () => {
    const gone = entry({ deletedAt: AT, deletedBy: SAM });
    const { actions } = renderDetail(gone);
    expect(buttons()).toEqual(['Restore']);
    expect(screen.getByText(/Deleted by Sam, .*12 Nov/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(actions.restore).toHaveBeenCalledWith(gone);
  });

  it('turns every button off for a read-only ledger, and Restore off while a change is not saved', () => {
    renderDetail(waitingForMe(), { canWrite: false });
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('turns every button off while a change to the entry is not saved, so a double tap is one write', () => {
    renderDetail(waitingForMe(), { notSaved: true });
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('turns Restore off while a change to the entry is not saved yet', () => {
    renderDetail(entry({ deletedAt: AT, deletedBy: SAM }), { notSaved: true });
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
  });
});

describe('EntryDetail: a reason when asking to check', () => {
  it('asks with a trimmed reason through Say why', async () => {
    const waiting = waitingForMe();
    const { actions } = renderDetail(waiting);
    await userEvent.click(screen.getByRole('button', { name: /say why/i }));
    await userEvent.type(screen.getByLabelText('Because (optional)'), '  The amount looks high ');
    const form = screen.getByLabelText('Because (optional)').closest('form') as HTMLElement;
    await userEvent.click(within(form).getByRole('button', { name: 'Ask Alex to check' }));
    expect(actions.respond).toHaveBeenCalledWith(waiting, 'decline', 'The amount looks high');
  });

  it('puts the cursor in the reason box when it opens', async () => {
    renderDetail(waitingForMe());
    await userEvent.click(screen.getByRole('button', { name: /say why/i }));
    expect(screen.getByLabelText('Because (optional)')).toHaveFocus();
  });

  it('shows the reason to the person who asked for the entry, and cancel asks nothing', async () => {
    const declined = { ...waitingForMe(), status: 'declined' as const, declinedBecause: 'The amount looks high' };
    renderDetail(declined);
    expect(screen.getByText('Because: The amount looks high')).toBeInTheDocument();
    cleanup();
    const { actions } = renderDetail(waitingForMe());
    await userEvent.click(screen.getByRole('button', { name: /say why/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(actions.respond).not.toHaveBeenCalled();
  });
});
