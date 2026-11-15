import type { MoneyEntry } from '../money/types';

// The total, loan progress and settled set. Pure, and worked out from the entries each time: nothing here is stored. The server,
// the app, the overlay and the check tool all use these.
export interface Total {
  direction: 'square' | 'toMe' | 'fromMe';
  pence: number;
}

// Agreed and live. Waiting, declined and deleted entries never count.
export const isCounted = (entry: MoneyEntry): boolean => entry.status === 'agreed' && entry.deletedAt === undefined;

// What the payer is owed by the other member for this entry: the share, or for a payment the whole amount.
const owedToPayer = (entry: MoneyEntry): number => (entry.kind === 'payment' ? entry.amountPence : entry.sharePence);

// How much `person` is owed by the other member: an entry they paid adds to it and one the other paid takes from it. A payment
// sent by the person reduces what they owe, which is the same as adding to what they are owed.
function credit(entries: readonly MoneyEntry[], person: string, other: string): number {
  let sum = 0;
  for (const entry of entries) {
    if (!isCounted(entry)) continue;
    if (entry.paidBy === person) sum += owedToPayer(entry);
    else if (entry.paidBy === other) sum -= owedToPayer(entry);
  }
  return sum;
}

// `toMe` means the other member pays me.
export function computeTotal(entries: readonly MoneyEntry[], me: string, other: string): Total {
  const owed = credit(entries, me, other);
  if (owed === 0) return { direction: 'square', pence: 0 };
  return { direction: owed > 0 ? 'toMe' : 'fromMe', pence: Math.abs(owed) };
}

// The agreed, live payments that count toward a loan: sent by its borrower, who is the member who is not the loan's payer.
function countedPayments(entries: readonly MoneyEntry[], loan: MoneyEntry): MoneyEntry[] {
  return entries.filter(entry => entry.kind === 'payment' && entry.loanId === loan.id && entry.paidBy !== loan.paidBy && isCounted(entry));
}

// Not capped at the loan's amount: the page shows progress up to the amount, and the total counts every payment anyway.
export function loanProgress(entries: readonly MoneyEntry[], loanId: string): number {
  const loan = entries.find(entry => entry.id === loanId && entry.kind === 'loan');
  if (!loan) return 0;
  return countedPayments(entries, loan).reduce((sum, payment) => sum + payment.amountPence, 0);
}

// Every user id named in the ledger, deleted entries included, in order. A ledger belongs to these people.
export function participants(entries: readonly MoneyEntry[]): string[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    for (const id of [entry.paidBy, entry.createdBy, entry.proposedBy, entry.agreedBy]) if (id !== undefined) ids.add(id);
  }
  return [...ids].sort();
}

const byDateThenId = (a: MoneyEntry, b: MoneyEntry): number => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function settledIds(entries: readonly MoneyEntry[]): Set<string> {
  const counted = entries.filter(isCounted);
  const settled = new Set<string>();
  const loans = counted.filter(entry => entry.kind === 'loan');
  const openLoans = new Set<string>();

  for (const loan of loans) {
    if (loanProgress(counted, loan.id) >= loan.amountPence) {
      settled.add(loan.id);
      for (const payment of countedPayments(counted, loan)) settled.add(payment.id);
    } else {
      openLoans.add(loan.id);
    }
  }

  // The last point where the running total is exactly zero: everything up to it is settled, apart from what still matters.
  const [first] = participants(counted);
  if (first === undefined) return settled;
  const ordered = [...counted].sort(byDateThenId);
  let running = 0;
  let point = -1;
  ordered.forEach((entry, index) => {
    running += entry.paidBy === first ? owedToPayer(entry) : -owedToPayer(entry);
    if (running === 0) point = index;
  });
  for (const entry of ordered.slice(0, point + 1)) {
    const linkedToOpenLoan = entry.kind === 'payment' && entry.loanId !== undefined && openLoans.has(entry.loanId);
    if (openLoans.has(entry.id) || linkedToOpenLoan || entry.pendingChange !== undefined) continue;
    settled.add(entry.id);
  }
  return settled;
}
