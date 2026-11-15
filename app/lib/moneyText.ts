// The words the money screens use. Neutral by rule (docs/brand.md): who pays whom is said in words, never by colour, and nothing here
// assigns blame.
import { formatPounds } from '../../src/shared/money';
import type { Total } from '../../src/shared/ledger';
import type { MoneyChange, MoneyEntry, MoneyKind } from '../../src/money/types';

export function totalText(total: Total, meName: string, otherName: string): string {
  if (total.direction === 'square') return 'All square';
  const [from, to] = total.direction === 'toMe' ? [otherName, meName] : [meName, otherName];
  return `${formatPounds(total.pence)} to settle, from ${from} to ${to}`;
}

export const unsavedText = (count: number): string => `${count} ${count === 1 ? 'change' : 'changes'} not saved yet`;

export const hiddenText = (count: number): string => `Everything is settled. ${count} ${count === 1 ? 'entry is' : 'entries are'} hidden.`;

export function loanText(progress: number, amountPence: number, paidBack: boolean): string {
  return `${formatPounds(progress)} of ${formatPounds(amountPence)}${paidBack ? ', paid back' : ''}`;
}

const KIND_LABELS: Record<MoneyKind, string> = { expense: 'Shared expense', loan: 'Loan', payment: 'Payment' };
export const kindLabel = (kind: MoneyKind): string => KIND_LABELS[kind];

// The two people of the ledger, as the person looking sees them.
export interface People {
  meId: string;
  meName: string;
  otherId: string;
  otherName: string;
}

export const nameOf = (people: People, userId: string): string => (userId === people.meId ? people.meName : people.otherName);

// The member who is not the payer: the one the share is for.
export const counterpartOf = (people: People, entry: Pick<MoneyEntry, 'paidBy'>): string => (entry.paidBy === people.meId ? people.otherId : people.meId);

export const possessive = (name: string): string => (name === 'you' ? 'Your' : `${name}'s`);

export function amountLine(entry: MoneyEntry, people: People): string {
  const amount = formatPounds(entry.amountPence);
  if (entry.kind === 'expense') return `${amount} paid by ${nameOf(people, entry.paidBy)}`;
  return `${amount} from ${nameOf(people, entry.paidBy)} to ${nameOf(people, counterpartOf(people, entry))}`;
}

// Only an expense has a share worth a line: a loan or a payment is the whole amount.
export function shareLine(entry: MoneyEntry, people: People): string | undefined {
  if (entry.kind !== 'expense') return undefined;
  return `${possessive(nameOf(people, counterpartOf(people, entry)))} share: ${formatPounds(entry.sharePence)} of ${formatPounds(entry.amountPence)}`;
}

export function changeSummary(entry: MoneyEntry, change: MoneyChange, people: People): string {
  if (change.amountPence !== entry.amountPence) return `${formatPounds(entry.amountPence)} to ${formatPounds(change.amountPence)}`;
  if (change.sharePence !== entry.sharePence) {
    return `${possessive(nameOf(people, counterpartOf(people, entry)))} share ${formatPounds(entry.sharePence)} to ${formatPounds(change.sharePence)}`;
  }
  return `Paid by ${nameOf(people, change.paidBy)}`;
}

// The state of an entry for the person looking: who it waits for, or what is asked of it. Nothing for an agreed entry with no request.
export function stateLabel(entry: MoneyEntry, people: People): string | undefined {
  const request = entry.pendingChange;
  const { meId, otherName } = people;
  if (request) {
    const waitingFor = request.by === meId ? otherName : 'you';
    if (request.delete) return `Delete waiting for ${waitingFor}`;
    return request.money ? `Change waiting for ${waitingFor}: ${changeSummary(entry, request.money, { ...people, meName: 'you' })}` : `Change waiting for ${waitingFor}`;
  }
  if (entry.status === 'waiting') return entry.proposedBy === meId ? `Waiting for ${otherName}` : 'Waiting for you';
  if (entry.status === 'declined') return entry.proposedBy === meId ? `${otherName} wants to check this one` : `Waiting for ${otherName}`;
  return undefined;
}
