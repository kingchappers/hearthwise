// The add and edit form's rules, pure: what a person typed becomes the money group the server takes, or the words that say what to fix.
import type { MoneyChange, MoneyEntry, MoneyKind } from '../../src/money/types';
import { MAX_DESCRIPTION } from '../../src/shared/moneyValidation';
import { formatPounds, parsePounds, shareFor } from '../../src/shared/money';
import type { SplitMode } from '../../src/shared/money';
import { counterpartOf, nameOf, possessive } from './moneyText';
import type { People } from './moneyText';

export interface FormState {
  kind: MoneyKind;
  paidBy: string;
  description: string;
  // What was typed, in pounds.
  amount: string;
  // YYYY-MM-DD.
  on: string;
  splitMode: SplitMode;
  // Pounds for a fixed share, a whole percentage for a percentage.
  splitValue: string;
  // The loan a payment is for, or '' for none.
  loanId: string;
}

export const blankForm = (kind: MoneyKind, paidBy: string, today: string): FormState =>
  ({ kind, paidBy, description: '', amount: '', on: today, splitMode: 'equal', splitValue: '', loanId: '' });

export function textFromPence(pence: number): string {
  return `${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, '0')}`;
}

// An entry opened to edit shows its share as a fixed share. Choosing a mode again works the share out from the new amount.
export const formFromEntry = (entry: MoneyEntry): FormState => ({
  kind: entry.kind, paidBy: entry.paidBy, description: entry.description, amount: textFromPence(entry.amountPence), on: entry.on,
  splitMode: 'fixed', splitValue: textFromPence(entry.sharePence), loanId: entry.loanId ?? '',
});

export function paymentDescription(loanDescription: string | undefined): string {
  if (loanDescription === undefined) return 'Payment';
  return Array.from(`Payment for ${loanDescription}`).slice(0, MAX_DESCRIPTION).join('');
}

export function splitOptions(paidBy: string, people: People): { value: SplitMode; label: string }[] {
  const payer = nameOf(people, paidBy);
  const other = nameOf(people, counterpartOf(people, { paidBy }));
  return [
    { value: 'equal', label: 'Equal' },
    { value: 'payerCovers', label: `${payer} covers it all` },
    { value: 'otherCovers', label: `${other} covers it all` },
    { value: 'fixed', label: `A fixed share for ${other}` },
    { value: 'percent', label: `A percentage for ${other}` },
  ];
}

export interface Evaluated {
  errors: { description?: string; amount?: string; share?: string; on?: string };
  amountPence?: number;
  sharePence?: number;
  // "Alex's share: £31.70", for an expense whose share is known.
  shareText?: string;
  // The trimmed description, and for a payment with none typed the one made from its loan.
  description: string;
  money?: MoneyChange;
  valid: boolean;
}

const NO_SHARE = /^£?0+(\.0{1,2})?$/;

// The other member's share in pence, or the words that say what is wrong with it.
function shareOf(form: FormState, amountPence: number): { pence: number } | { error: string } {
  if (form.kind !== 'expense') return { pence: amountPence };
  const typed = form.splitValue.trim();
  let pence: number;
  if (form.splitMode === 'fixed') {
    if (NO_SHARE.test(typed)) pence = 0;
    else {
      const parsed = parsePounds(typed);
      if (!parsed.ok) return { error: parsed.message };
      pence = parsed.pence;
    }
  } else if (form.splitMode === 'percent') {
    if (!/^\d{1,3}$/.test(typed) || Number(typed) > 100) return { error: 'Use a whole percentage from 0 to 100.' };
    pence = shareFor('percent', amountPence, Number(typed));
  } else {
    pence = shareFor(form.splitMode, amountPence);
  }
  if (pence > amountPence) return { error: `A share can't be more than the total, ${formatPounds(amountPence)}.` };
  return { pence };
}

export function evaluateForm(form: FormState, people: People): Evaluated {
  const errors: Evaluated['errors'] = {};
  const description = form.description.trim();
  if (form.kind !== 'payment' && description === '') errors.description = 'Say what it was for.';
  else if (Array.from(description).length > MAX_DESCRIPTION) errors.description = `Use ${MAX_DESCRIPTION} characters or fewer.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.on)) errors.on = 'Choose a date.';

  const amount = parsePounds(form.amount);
  if (!amount.ok) {
    errors.amount = amount.message;
    return { errors, description, valid: false };
  }
  const share = shareOf(form, amount.pence);
  if ('error' in share) {
    errors.share = share.error;
    return { errors, amountPence: amount.pence, description, valid: false };
  }

  const money: MoneyChange = { paidBy: form.paidBy, amountPence: amount.pence, sharePence: share.pence };
  if (form.kind === 'payment' && form.loanId !== '') money.loanId = form.loanId;
  const result: Evaluated = { errors, amountPence: amount.pence, sharePence: share.pence, description, money, valid: Object.keys(errors).length === 0 };
  if (form.kind === 'expense') {
    result.shareText = `${possessive(nameOf(people, counterpartOf(people, form)))} share: ${formatPounds(share.pence)}`;
  }
  return result;
}
