import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { MoneyEntry } from '../../../src/money/types';
import { computeTotal, settledIds } from '../../../src/shared/ledger';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';
import { ALEX, SAM, entry, makeActions, people, waitingForMe } from '~/components/money/__tests__/fixtures';
import { loanLines } from '~/lib/money';
import type { MoneyState } from '~/lib/money';

const state = vi.hoisted(() => ({ money: undefined as unknown, actions: undefined as unknown }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('~/lib/money', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/money')>()), useMoney: () => state.money }));
vi.mock('~/hooks/useMoneyActions', () => ({ useMoneyActions: () => state.actions, useChangeNotices: vi.fn() }));
vi.mock('~/components/shared/LetThemKnow', () => ({ LetThemKnow: () => <label><input type="checkbox" />Let Alex know</label> }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'UTC' }, members: [{ userId: 'u-sam', displayName: 'Sam' }, { userId: 'u-alex', displayName: 'Alex' }], me: { userId: 'u-sam', displayName: 'Sam', settings: {} } } }),
}));

import MoneyPage, { meta } from '../money._index';
import MoneyEntryPage, { meta as entryMeta } from '../money.$id';

// What the real hook gives for these entries, worked out by the same ledger functions.
function moneyOf(entries: MoneyEntry[], over: Partial<MoneyState> = {}): MoneyState {
  return {
    status: 'ready', entries, serverEntries: entries, me: SAM, people, other: { userId: ALEX, name: 'Alex' }, canWrite: true, total: computeTotal(entries, SAM, ALEX), loans: loanLines(entries),
    settled: settledIds(entries), unsaved: 0, unsavedIds: new Set(), dataUpdatedAt: 1, refetch: vi.fn(), ...over,
  };
}
const actions = () => state.actions as ReturnType<typeof makeActions>;
const show = (entries: MoneyEntry[], over: Partial<MoneyState> = {}) => { state.money = moneyOf(entries, over); };
const renderPage = () => render(<MantineProvider env="test"><MemoryRouter><MoneyPage /></MemoryRouter></MantineProvider>);

beforeEach(() => {
  show([]);
  state.actions = makeActions();
});

describe('the Money page', () => {
  it('is titled, has one h1, says what will appear when empty, and has Add', () => {
    expect(meta({} as never)).toEqual([{ title: 'Money – Hearthwise' }]);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Money' })).toBeInTheDocument();
    expect(screen.getByText('All square')).toBeInTheDocument();
    expect(screen.getByText('No money entries yet. Add one when you share a cost or lend money.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('shows a loading indicator, and a retry when the ledger cannot be loaded', async () => {
    state.money = moneyOf([], { status: 'loading' });
    const { unmount } = renderPage();
    expect(screen.getByRole('status', { name: 'Loading money' })).toBeInTheDocument();
    unmount();
    const refetch = vi.fn();
    state.money = moneyOf([], { status: 'error', refetch });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('CUJ 1: a loan waits for the other person, and the total stays All square until they agree', () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000, description: 'Rent shortfall', status: 'waiting', agreedBy: undefined, agreedAt: undefined, version: 1 });
    show([loan]);
    renderPage();
    expect(screen.getByText('All square')).toBeInTheDocument();
    const waiting = screen.getByRole('heading', { level: 2, name: 'Waiting for Alex' }).closest('section') as HTMLElement;
    expect(within(waiting).getByText('Rent shortfall')).toBeInTheDocument();
    expect(within(waiting).getByText('Waiting for Alex', { selector: 'p' })).toBeInTheDocument();
  });

  it('CUJ 1: the other person sees it under Waiting for you, and agrees', async () => {
    const loan = waitingForMe({ kind: 'loan', amountPence: 5000, sharePence: 5000, description: 'Rent shortfall' });
    show([loan]);
    renderPage();
    const waiting = screen.getByRole('heading', { level: 2, name: 'Waiting for you' }).closest('section') as HTMLElement;
    expect(within(waiting).getByText('£50.00 from Alex to Sam')).toBeInTheDocument();
    await userEvent.click(within(waiting).getByRole('button', { name: 'Agree: Rent shortfall' }));
    expect(actions().respond).toHaveBeenCalledWith(loan, 'agree');
  });

  it('CUJ 1 to 3: the total and the loan\'s progress, from agreed entries', () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000, description: 'Rent shortfall', on: '2026-11-01' });
    const shop = entry({ description: 'Weekly shop', on: '2026-11-08' });
    const payment = entry({ kind: 'payment', paidBy: ALEX, amountPence: 2000, sharePence: 2000, loanId: loan.id, description: 'Payment', on: '2026-11-10' });
    show([loan, shop, payment]);
    renderPage();
    expect(screen.getByText('£61.70 to settle, from Alex to Sam')).toBeInTheDocument();
    expect(screen.getByText('£20.00 of £50.00')).toBeInTheDocument();
  });

  it('CUJ 4: a loan paid back more than is left shows paid back, tucked away, and the extra counts in the total', async () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000, description: 'Rent shortfall', on: '2026-11-01' });
    const shop = entry({ description: 'Weekly shop', on: '2026-11-08' });
    const payments = [
      entry({ kind: 'payment', paidBy: ALEX, amountPence: 2000, sharePence: 2000, loanId: loan.id, description: 'Payment one', on: '2026-11-10' }),
      entry({ kind: 'payment', paidBy: ALEX, amountPence: 3500, sharePence: 3500, loanId: loan.id, description: 'Payment two', on: '2026-11-12' }),
    ];
    show([loan, shop, ...payments]);
    renderPage();
    expect(screen.getByText('£26.70 to settle, from Alex to Sam')).toBeInTheDocument();
    expect(screen.queryByText('Rent shortfall')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Show settled' }));
    expect(screen.getByText('£50.00 of £50.00, paid back')).toBeInTheDocument();
  });

  it('CUJ 10: all square tucks everything away and says how many are hidden, then Show settled shows them', async () => {
    const shop = entry({ description: 'Weekly shop', on: '2026-11-08' });
    const back = entry({ kind: 'payment', paidBy: ALEX, amountPence: 3170, sharePence: 3170, description: 'Payment', on: '2026-11-10' });
    show([shop, back]);
    renderPage();
    expect(screen.getByText('All square')).toBeInTheDocument();
    expect(screen.getByText('Everything is settled. 2 entries are hidden.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Weekly shop' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Show settled' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(screen.getByRole('link', { name: 'Weekly shop' })).toBeInTheDocument();
    expect(screen.queryByText(/Everything is settled/)).not.toBeInTheDocument();
  });

  it('has no Show settled switch when nothing is settled', () => {
    show([entry()]);
    renderPage();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('CUJ 5: shows an entry the other person wants to check under Needs another look, with Change and Delete', async () => {
    const declined = entry({ status: 'declined', description: 'Weekly shop', agreedBy: undefined, agreedAt: undefined });
    show([declined]);
    renderPage();
    const section = screen.getByRole('heading', { level: 2, name: 'Needs another look' }).closest('section') as HTMLElement;
    expect(within(section).getByText('Alex wants to check this one')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Delete: Weekly shop' }));
    expect(actions().remove).toHaveBeenCalledWith(declined);
  });

  it('CUJ 5: Change opens the sheet on the entry, and saving a new amount edits it', async () => {
    const declined = entry({ status: 'declined', description: 'Weekly shop', version: 3, agreedBy: undefined, agreedAt: undefined });
    show([declined]);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Change: Weekly shop' }));
    expect(screen.getByRole('dialog', { name: 'Edit entry' })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('How much?'));
    await userEvent.type(screen.getByLabelText('How much?'), '36.40');
    await userEvent.selectOptions(screen.getByLabelText('Split'), 'equal');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions().edit).toHaveBeenCalledWith(declined, { money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CUJ 6: a change waiting shows beside the entry, and the total still counts the agreed figure', () => {
    const asked = entry({ description: 'Weekly shop', pendingChange: { id: 'r', by: SAM, at: 1, money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } } });
    show([asked]);
    renderPage();
    expect(screen.getByText('£31.70 to settle, from Alex to Sam')).toBeInTheDocument();
    expect(screen.getAllByText('Change waiting for Alex: £63.40 to £36.40')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: 'Waiting for Alex' })).toBeInTheDocument();
  });

  it('CUJ 7: marks an entry Not saved yet, and says how many changes are not saved', () => {
    const added = entry({ status: 'waiting', description: 'Offline add', agreedBy: undefined, agreedAt: undefined });
    show([added], { unsaved: 1, unsavedIds: new Set([added.id]) });
    renderPage();
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    expect(screen.getByText('1 change not saved yet')).toBeInTheDocument();
  });

  it('Add opens the sheet, and saving an entry hands it to the actions', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('dialog', { name: 'Add' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('What for?'), 'Weekly shop');
    await userEvent.type(screen.getByLabelText('How much?'), '63.40');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));
    expect(actions().add).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expense', description: 'Weekly shop', money: { paidBy: SAM, amountPence: 6340, sharePence: 3170 } }));
  });

  it('CUJ 11: with one member the entries and total show, nothing can be added or agreed, and the other person is a Former member', () => {
    const theirs = waitingForMe({ description: 'Rent' });
    const lonely = { ...people, otherName: 'Former member' };
    show([theirs], { canWrite: false, people: lonely, other: { userId: ALEX, name: 'Former member' } });
    renderPage();
    expect(screen.getByText('Adding or agreeing needs the two people this ledger is between.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Agree: Rent' })).toBeDisabled();
    expect(screen.getByText('£63.40 paid by Former member')).toBeInTheDocument();
  });

  it('has the Let them know box, sound headings and no violations', async () => {
    show([waitingForMe(), entry({ status: 'declined' }), entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 }), entry(), entry({ pendingChange: { id: 'r', by: SAM, at: 1, delete: true } })]);
    const { container } = renderPage();
    expect(screen.getByRole('checkbox', { name: 'Let Alex know' })).not.toBeChecked();
    expectSoundHeadings(container);
    await expectNoViolations(container);
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});

describe('the Money entry page', () => {
  const renderEntry = (id: string) => render(
    <MantineProvider env="test"><MemoryRouter initialEntries={[`/money/${id}`]}><Routes><Route path="/money/:id" element={<MoneyEntryPage />} /></Routes></MemoryRouter></MantineProvider>,
  );

  it('is titled Money and shows the entry with a way back', () => {
    const shop = entry({ description: 'Weekly shop' });
    show([shop]);
    renderEntry(shop.id);
    expect(entryMeta({} as never)).toEqual([{ title: 'Money – Hearthwise' }]);
    expect(screen.getByRole('heading', { level: 1, name: 'Weekly shop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Money' })).toHaveAttribute('href', '/money');
  });

  it('shows a loan\'s progress', () => {
    const loan = entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 });
    show([loan]);
    renderEntry(loan.id);
    expect(screen.getByText('£0.00 of £50.00')).toBeInTheDocument();
  });

  it('opens Change on an agreed entry, with a request for the money', async () => {
    const shop = entry({ description: 'Weekly shop' });
    show([shop]);
    renderEntry(shop.id);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('dialog', { name: 'Change entry' })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('How much?'));
    await userEvent.type(screen.getByLabelText('How much?'), '36.40');
    await userEvent.selectOptions(screen.getByLabelText('Split'), 'equal');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Alex to agree' }));
    expect(actions().askChange).toHaveBeenCalledWith(shop, { money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } });
  });

  it('says it cannot find an entry that is not in the list, with a way back', () => {
    show([entry()]);
    renderEntry('00000000-0000-4000-8000-00000000ffff');
    expect(screen.getByText("We can't find that entry. It may have been deleted a while ago.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Money' })).toBeInTheDocument();
  });

  it('shows a loading indicator, and a retry when it cannot load', async () => {
    state.money = moneyOf([], { status: 'loading' });
    const { unmount } = renderEntry('x');
    expect(screen.getByRole('status', { name: 'Loading the entry' })).toBeInTheDocument();
    unmount();
    const refetch = vi.fn();
    state.money = moneyOf([], { status: 'error', refetch });
    renderEntry('x');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('has sound headings and no violations', async () => {
    const shop = entry({ pendingChange: { id: 'r', by: ALEX, at: 1, delete: true } });
    show([shop]);
    const { container } = renderEntry(shop.id);
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });
});
