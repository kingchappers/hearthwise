import { describe, expect, it } from 'vitest';
import type { MoneyEntry } from '../../../src/money/types';
import type { People } from '../moneyText';
import { amountLine, changeSummary, hiddenText, kindLabel, loanText, shareLine, stateLabel, totalText, unsavedText } from '../moneyText';

const SAM = 'u-sam';
const ALEX = 'u-alex';
const entry = (over: Partial<MoneyEntry> = {}): MoneyEntry => ({
  id: 'e1', kind: 'expense', paidBy: SAM, amountPence: 6340, sharePence: 3170, description: 'Weekly shop', on: '2026-11-15', fieldTimes: {},
  status: 'agreed', version: 2, createdBy: SAM, createdAt: 1, proposedBy: SAM, agreedAt: 2, agreedBy: ALEX, updatedAt: 2, updatedBy: ALEX, ...over,
});
const people: People = { meId: SAM, meName: 'Sam', otherId: ALEX, otherName: 'Alex' };
const former: People = { ...people, otherName: 'Former member' };

describe('totalText', () => {
  it('says who pays whom and how much, by words and not by colour', () => {
    expect(totalText({ direction: 'fromMe', pence: 3000 }, 'Sam', 'Alex')).toBe('£30.00 to settle, from Sam to Alex');
    expect(totalText({ direction: 'toMe', pence: 3000 }, 'Sam', 'Alex')).toBe('£30.00 to settle, from Alex to Sam');
  });

  it('says All square at zero', () => {
    expect(totalText({ direction: 'square', pence: 0 }, 'Sam', 'Alex')).toBe('All square');
    expect(totalText({ direction: 'square', pence: 0 }, 'Sam', 'Alex', 0)).toBe('All square');
    expect(totalText({ direction: 'square', pence: 0 }, 'Sam', 'Alex', 1)).toBe('All square so far (1 entry waiting)');
    expect(totalText({ direction: 'square', pence: 0 }, 'Sam', 'Alex', 3)).toBe('All square so far (3 entries waiting)');
    // A total that is not square needs no qualification.
    expect(totalText({ direction: 'toMe', pence: 3000 }, 'Sam', 'Alex', 2)).toBe('£30.00 to settle, from Alex to Sam');
  });
});

describe('the fixed lines', () => {
  it('counts unsaved changes', () => {
    expect(unsavedText(1)).toBe('1 change not saved yet');
    expect(unsavedText(2)).toBe('2 changes not saved yet');
  });

  it('says how many settled entries are hidden', () => {
    expect(hiddenText(1)).toBe('Everything is settled. 1 entry is hidden.');
    expect(hiddenText(4)).toBe('Everything is settled. 4 entries are hidden.');
  });

  it('shows a loan\'s progress, and says paid back', () => {
    expect(loanText(0, 5000, false)).toBe('£0.00 of £50.00');
    expect(loanText(5000, 5000, true)).toBe('£50.00 of £50.00, paid back');
  });

  it('names the kinds', () => {
    expect([kindLabel('expense'), kindLabel('loan'), kindLabel('payment')]).toEqual(['Shared expense', 'Loan', 'Payment']);
  });
});

describe('amountLine and shareLine', () => {
  it('says who paid an expense, and each person\'s share in words', () => {
    expect(amountLine(entry(), people)).toBe('£63.40 paid by Sam');
    expect(shareLine(entry(), people)).toBe("Alex's share: £31.70 of £63.40");
  });

  it('says a loan or a payment goes from one person to the other, with no share line', () => {
    expect(amountLine(entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 }), people)).toBe('£50.00 from Sam to Alex');
    expect(amountLine(entry({ kind: 'payment', paidBy: ALEX, amountPence: 2000, sharePence: 2000 }), people)).toBe('£20.00 from Alex to Sam');
    expect(shareLine(entry({ kind: 'loan', amountPence: 5000, sharePence: 5000 }), people)).toBeUndefined();
  });

  it('names a former member', () => {
    expect(amountLine(entry({ paidBy: ALEX }), former)).toBe('£63.40 paid by Former member');
  });
});

describe('stateLabel', () => {
  it('says nothing for an agreed entry with no request', () => {
    expect(stateLabel(entry(), people)).toBeUndefined();
  });

  it('says who a waiting entry waits for', () => {
    expect(stateLabel(entry({ status: 'waiting' }), people)).toBe('Waiting for Alex');
    expect(stateLabel(entry({ status: 'waiting', proposedBy: ALEX }), people)).toBe('Waiting for you');
  });

  it('says the other person wants to check a declined entry, and tells the person who asked that they asked', () => {
    expect(stateLabel(entry({ status: 'declined' }), people)).toBe('Alex wants to check this one');
    expect(stateLabel(entry({ status: 'declined', proposedBy: ALEX }), people)).toBe('You asked Alex to check this');
  });

  it('says a change or a delete is waiting, with the old and the new amount', () => {
    const change = { id: 'r', by: SAM, at: 1, money: { paidBy: SAM, amountPence: 3640, sharePence: 1820 } };
    expect(stateLabel(entry({ pendingChange: change }), people)).toBe('Change waiting for Alex: £63.40 to £36.40');
    expect(stateLabel(entry({ pendingChange: { ...change, by: ALEX } }), people)).toBe('Change waiting for you: £63.40 to £36.40');
    expect(stateLabel(entry({ pendingChange: { id: 'r', by: SAM, at: 1, delete: true } }), people)).toBe('Delete waiting for Alex');
    expect(stateLabel(entry({ pendingChange: { id: 'r', by: ALEX, at: 1, delete: true } }), people)).toBe('Delete waiting for you');
  });
});

describe('changeSummary', () => {
  it('shows the amount when it moves, otherwise the share, otherwise who paid', () => {
    expect(changeSummary(entry(), { paidBy: SAM, amountPence: 3640, sharePence: 1820 }, people)).toBe('£63.40 to £36.40');
    expect(changeSummary(entry(), { paidBy: SAM, amountPence: 6340, sharePence: 6340 }, people)).toBe("Alex's share £31.70 to £63.40");
    expect(changeSummary(entry(), { paidBy: ALEX, amountPence: 6340, sharePence: 3170 }, people)).toBe('Paid by Alex');
  });
});
