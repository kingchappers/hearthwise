import { describe, expect, it } from 'vitest';
import type { MoneyEntry } from '../../../src/money/types';
import { blankForm, evaluateForm, formFromEntry, paymentDescription, splitOptions, textFromPence } from '../moneyForm';
import type { FormState } from '../moneyForm';
import type { People } from '../moneyText';

const SAM = 'u-sam';
const ALEX = 'u-alex';
const people: People = { meId: SAM, meName: 'Sam', otherId: ALEX, otherName: 'Alex' };
const form = (over: Partial<FormState> = {}): FormState => ({ ...blankForm('expense', SAM, '2026-11-15'), description: 'Weekly shop', amount: '63.40', ...over });

describe('blankForm', () => {
  it('starts with the caller as payer, today, an equal split and no loan', () => {
    expect(blankForm('expense', SAM, '2026-11-15')).toEqual({
      kind: 'expense', paidBy: SAM, description: '', amount: '', on: '2026-11-15', splitMode: 'equal', splitValue: '', loanId: '',
    });
  });
});

describe('evaluateForm: the share for each split, with either member as payer', () => {
  it('equal: half, rounded down, so the odd penny stays with the payer', () => {
    expect(evaluateForm(form(), people)).toMatchObject({ valid: true, amountPence: 6340, sharePence: 3170 });
    expect(evaluateForm(form({ amount: '10.01' }), people).sharePence).toBe(500);
  });

  it('shows the other person\'s share by name, never as I or they, whoever paid', () => {
    expect(evaluateForm(form(), people).shareText).toBe("Alex's share: £31.70");
    expect(evaluateForm(form({ paidBy: ALEX }), people).shareText).toBe("Sam's share: £31.70");
  });

  it('payer covers it all gives no share, and the other person covers it all gives the total', () => {
    expect(evaluateForm(form({ splitMode: 'payerCovers' }), people).sharePence).toBe(0);
    expect(evaluateForm(form({ splitMode: 'otherCovers' }), people).sharePence).toBe(6340);
  });

  it('a fixed share takes the amount typed, including none', () => {
    expect(evaluateForm(form({ splitMode: 'fixed', splitValue: '12.50' }), people).sharePence).toBe(1250);
    expect(evaluateForm(form({ splitMode: 'fixed', splitValue: '0' }), people).sharePence).toBe(0);
  });

  it('a percentage is for the other member and rounds down', () => {
    expect(evaluateForm(form({ amount: '10.00', splitMode: 'percent', splitValue: '33' }), people).sharePence).toBe(330);
    expect(evaluateForm(form({ amount: '0.01', splitMode: 'percent', splitValue: '50' }), people).sharePence).toBe(0);
    expect(evaluateForm(form({ splitMode: 'percent', splitValue: '100' }), people).sharePence).toBe(6340);
  });

  it('a loan and a payment are always the whole amount', () => {
    expect(evaluateForm(form({ kind: 'loan', splitMode: 'payerCovers' }), people).sharePence).toBe(6340);
    expect(evaluateForm(form({ kind: 'payment', description: '' }), people)).toMatchObject({ valid: true, sharePence: 6340 });
  });
});

describe('evaluateForm: what is wrong', () => {
  it('says how to type an amount, and gives no money until it is right', () => {
    expect(evaluateForm(form({ amount: '' }), people).errors.amount).toBe('Type an amount, like 12.50');
    expect(evaluateForm(form({ amount: '12,50' }), people).errors.amount).toBe('Use a full stop, like 12.50');
    const bad = evaluateForm(form({ amount: '12.505' }), people);
    expect(bad.valid).toBe(false);
    expect(bad.money).toBeUndefined();
  });

  it('refuses a share above the total, with the total in the words', () => {
    const result = evaluateForm(form({ amount: '50', splitMode: 'fixed', splitValue: '60' }), people);
    expect(result.errors.share).toBe("A share can't be more than the total, £50.00.");
    expect(result.valid).toBe(false);
  });

  it('refuses a percentage that is not a whole number from 0 to 100', () => {
    for (const value of ['', '101', '12.5', '-1', 'x']) {
      expect(evaluateForm(form({ splitMode: 'percent', splitValue: value }), people).errors.share, value).toBe('Use a whole percentage from 0 to 100.');
    }
  });

  it('wants a description for an expense and a loan, but not for a payment', () => {
    expect(evaluateForm(form({ description: '  ' }), people).errors.description).toBe('Say what it was for.');
    expect(evaluateForm(form({ kind: 'payment', description: '' }), people).errors.description).toBeUndefined();
    expect(evaluateForm(form({ description: 'x'.repeat(121) }), people).errors.description).toBe('Use 120 characters or fewer.');
  });

  it('wants a date', () => {
    expect(evaluateForm(form({ on: '' }), people).errors.on).toBe('Choose a date.');
  });
});

describe('evaluateForm: the money it gives', () => {
  it('gives the money group, with a loan id only on a payment', () => {
    expect(evaluateForm(form(), people).money).toEqual({ paidBy: SAM, amountPence: 6340, sharePence: 3170 });
    const loanId = '11111111-1111-4111-8111-111111111111';
    expect(evaluateForm(form({ kind: 'payment', loanId }), people).money).toEqual({ paidBy: SAM, amountPence: 6340, sharePence: 6340, loanId });
    expect(evaluateForm(form({ kind: 'loan', loanId }), people).money).toEqual({ paidBy: SAM, amountPence: 6340, sharePence: 6340 });
    expect(evaluateForm(form({ kind: 'payment' }), people).money).toEqual({ paidBy: SAM, amountPence: 6340, sharePence: 6340 });
  });

  it('trims the description', () => {
    expect(evaluateForm(form({ description: '  Shop  ' }), people).description).toBe('Shop');
  });
});

describe('splitOptions', () => {
  it('names the payer and the other person', () => {
    expect(splitOptions(SAM, people)).toEqual([
      { value: 'equal', label: 'Equal' }, { value: 'payerCovers', label: 'Sam covers it all' }, { value: 'otherCovers', label: 'Alex covers it all' },
      { value: 'fixed', label: 'A fixed share for Alex' }, { value: 'percent', label: 'A percentage for Alex' },
    ]);
    expect(splitOptions(ALEX, people)[1].label).toBe('Alex covers it all');
    expect(splitOptions(ALEX, people)[3].label).toBe('A fixed share for Sam');
  });
});

describe('formFromEntry', () => {
  const entry: MoneyEntry = {
    id: 'e1', kind: 'expense', paidBy: SAM, amountPence: 6340, sharePence: 3170, description: 'Weekly shop', on: '2026-11-10', fieldTimes: {}, status: 'waiting',
    version: 1, createdBy: SAM, createdAt: 1, proposedBy: SAM, updatedAt: 1, updatedBy: SAM,
  };

  it('shows the current share as a fixed share, so nothing is recomputed until a mode is chosen', () => {
    expect(formFromEntry(entry)).toEqual({ kind: 'expense', paidBy: SAM, description: 'Weekly shop', amount: '63.40', on: '2026-11-10', splitMode: 'fixed', splitValue: '31.70', loanId: '' });
    expect(evaluateForm(formFromEntry(entry), people)).toMatchObject({ valid: true, amountPence: 6340, sharePence: 3170 });
  });

  it('keeps a payment\'s loan', () => {
    expect(formFromEntry({ ...entry, kind: 'payment', loanId: 'L' }).loanId).toBe('L');
  });
});

describe('textFromPence and paymentDescription', () => {
  it('writes pence as the text a person would type', () => {
    expect([textFromPence(5), textFromPence(1250), textFromPence(100000000)]).toEqual(['0.05', '12.50', '1000000.00']);
  });

  it('describes a payment from the loan it is for, cut to the limit', () => {
    expect(paymentDescription(undefined)).toBe('Payment');
    expect(paymentDescription('Rent shortfall')).toBe('Payment for Rent shortfall');
    expect(Array.from(paymentDescription('x'.repeat(200)))).toHaveLength(120);
  });
});
