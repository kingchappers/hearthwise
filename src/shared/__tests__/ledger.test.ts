import { describe, expect, it } from 'vitest';
import type { MoneyEntry } from '../../money/types';
import { computeTotal, isCounted, loanProgress, participants, settledIds } from '../ledger';

const SAM = 'auth0|sam';
const ALEX = 'auth0|alex';
let n = 0;

function entry(over: Partial<MoneyEntry> & Pick<MoneyEntry, 'kind' | 'paidBy' | 'amountPence'>): MoneyEntry {
  n += 1;
  return {
    id: `e${String(n).padStart(4, '0')}`, sharePence: over.kind === 'expense' ? over.amountPence : over.amountPence, description: 'x', on: '2026-11-01', fieldTimes: {},
    status: 'agreed', version: 1, createdBy: over.paidBy, createdAt: 1, proposedBy: over.paidBy, agreedAt: 2, agreedBy: over.paidBy === SAM ? ALEX : SAM, updatedAt: 2, updatedBy: over.paidBy,
    ...over,
  };
}
const loan = (amountPence: number, over: Partial<MoneyEntry> = {}): MoneyEntry => entry({ kind: 'loan', paidBy: SAM, amountPence, ...over });
const expense = (amountPence: number, sharePence: number, over: Partial<MoneyEntry> = {}): MoneyEntry => entry({ kind: 'expense', paidBy: SAM, amountPence, sharePence, ...over });
const payment = (amountPence: number, over: Partial<MoneyEntry> = {}): MoneyEntry => entry({ kind: 'payment', paidBy: ALEX, amountPence, ...over });
const total = (entries: MoneyEntry[], me = SAM, other = ALEX) => computeTotal(entries, me, other);

describe('computeTotal: the worked examples', () => {
  const rent = loan(5000, { id: 'rent' });
  const shop = expense(6340, 3170, { id: 'shop' });
  const first = payment(2000, { loanId: 'rent' });
  const second = payment(3500, { loanId: 'rent' });

  it('CUJ 1: a loan waiting for agreement does not count, then it does', () => {
    expect(total([{ ...rent, status: 'waiting' }])).toEqual({ direction: 'square', pence: 0 });
    expect(total([rent])).toEqual({ direction: 'toMe', pence: 5000 });
    expect(total([rent], ALEX, SAM)).toEqual({ direction: 'fromMe', pence: 5000 });
  });
  it('CUJ 2: an equal split of £63.40 adds £31.70', () => {
    expect(total([rent, shop])).toEqual({ direction: 'toMe', pence: 8170 });
  });
  it('CUJ 3: Alex paying £20.00 takes it down to £61.70', () => {
    expect(total([rent, shop, first])).toEqual({ direction: 'toMe', pence: 6170 });
  });
  it('CUJ 4: paying back more than is left still counts in full', () => {
    expect(total([rent, shop, first, second])).toEqual({ direction: 'toMe', pence: 2670 });
  });
  it('CUJ 10: square when the entries add up to zero', () => {
    expect(total([rent, payment(5000, { loanId: 'rent' })])).toEqual({ direction: 'square', pence: 0 });
  });
});

describe('computeTotal: each kind and payer', () => {
  it('counts an expense Alex paid as Sam paying Alex his share', () => {
    expect(total([expense(1000, 400, { paidBy: ALEX })])).toEqual({ direction: 'fromMe', pence: 400 });
  });
  it('counts a payment Sam sent as Alex paying Sam less back', () => {
    expect(total([payment(700, { paidBy: SAM })])).toEqual({ direction: 'toMe', pence: 700 });
  });
  it('counts a loan Alex made as Sam owing Alex', () => {
    expect(total([loan(900, { paidBy: ALEX })])).toEqual({ direction: 'fromMe', pence: 900 });
  });
  it('counts an expense with a zero share as nothing', () => {
    expect(total([expense(1000, 0)])).toEqual({ direction: 'square', pence: 0 });
  });
});

describe('what counts', () => {
  const base = loan(5000);
  it('counts only agreed, live entries', () => {
    expect(isCounted(base)).toBe(true);
    expect(isCounted({ ...base, status: 'waiting' })).toBe(false);
    expect(isCounted({ ...base, status: 'declined' })).toBe(false);
    expect(isCounted({ ...base, deletedAt: 5 })).toBe(false);
    expect(total([{ ...base, deletedAt: 5 }])).toEqual({ direction: 'square', pence: 0 });
  });
  it('counts an entry with a change request at its current figure', () => {
    const asked = { ...base, pendingChange: { id: 'r', by: ALEX, at: 3, money: { paidBy: SAM, amountPence: 100, sharePence: 100 } } };
    expect(total([asked])).toEqual({ direction: 'toMe', pence: 5000 });
  });
  it('ignores an entry paid by someone who is not either person', () => {
    expect(total([loan(5000, { paidBy: 'auth0|stranger' })])).toEqual({ direction: 'square', pence: 0 });
  });
});

describe('loanProgress', () => {
  const rent = loan(5000, { id: 'rent' });
  it('sums the agreed, live payments from the borrower that name the loan', () => {
    const entries = [rent, payment(2000, { loanId: 'rent' }), payment(500, { loanId: 'rent', status: 'waiting' }), payment(300, { loanId: 'rent', deletedAt: 1 }), payment(400)];
    expect(loanProgress(entries, 'rent')).toBe(2000);
  });
  it('does not count a payment sent by the lender', () => {
    expect(loanProgress([rent, payment(2000, { loanId: 'rent', paidBy: SAM })], 'rent')).toBe(0);
  });
  it('is the full sum even above the loan amount', () => {
    expect(loanProgress([rent, payment(3500, { loanId: 'rent' }), payment(2000, { loanId: 'rent' })], 'rent')).toBe(5500);
  });
  it('is zero for a loan that is not there', () => {
    expect(loanProgress([], 'missing')).toBe(0);
  });
  it('keeps old payments counting from the borrower after the loan changes payer', () => {
    const flipped = { ...rent, paidBy: ALEX };
    expect(loanProgress([flipped, payment(2000, { loanId: 'rent' })], 'rent')).toBe(0);
  });
});

describe('participants', () => {
  it('lists every id named in paidBy, createdBy, proposedBy and agreedBy, deleted entries included', () => {
    const e = loan(100, { createdBy: 'a', proposedBy: 'b', agreedBy: 'c', paidBy: 'd', deletedAt: 1 });
    expect(participants([e])).toEqual(['a', 'b', 'c', 'd']);
  });
  it('leaves out an agreedBy that is not set', () => {
    const { agreedBy: _agreedBy, ...rest } = loan(100);
    expect(participants([rest as MoneyEntry])).toEqual([SAM]);
  });
});

describe('settledIds', () => {
  it('settles a paid-back loan and its payments', () => {
    const rent = loan(5000, { id: 'rent', on: '2026-11-01' });
    const a = payment(2000, { loanId: 'rent', on: '2026-11-02' });
    const b = payment(3000, { loanId: 'rent', on: '2026-11-03' });
    expect(settledIds([rent, a, b])).toEqual(new Set([rent.id, a.id, b.id]));
  });

  it('settles nothing while a loan is open', () => {
    const rent = loan(5000, { id: 'rent' });
    const a = payment(2000, { loanId: 'rent', on: '2026-11-02' });
    expect(settledIds([rent, a]).size).toBe(0);
  });

  it('settles everything up to the last point where the total is exactly zero', () => {
    const e1 = expense(1000, 500, { on: '2026-11-01' });
    const e2 = payment(500, { on: '2026-11-02' });
    const later = expense(300, 150, { on: '2026-11-03' });
    expect(settledIds([e1, e2, later])).toEqual(new Set([e1.id, e2.id]));
  });

  it('puts entries in order by date, then id, so input order does not matter', () => {
    const e1 = expense(1000, 500, { on: '2026-11-01' });
    const e2 = payment(500, { on: '2026-11-02' });
    expect(settledIds([e2, e1])).toEqual(settledIds([e1, e2]));
  });

  it('keeps an open loan, and the payments linked to it, visible inside the all-square prefix', () => {
    const rent = loan(5000, { id: 'rent', on: '2026-11-01' });
    const partial = payment(3000, { loanId: 'rent', on: '2026-11-02' });
    const owedBack = expense(4000, 2000, { paidBy: ALEX, on: '2026-11-03' });
    expect(total([rent, partial, owedBack])).toEqual({ direction: 'square', pence: 0 });
    expect(settledIds([rent, partial, owedBack])).toEqual(new Set([owedBack.id]));
  });

  it('keeps an entry with a change request visible', () => {
    const e1 = expense(1000, 500, { on: '2026-11-01' });
    const e2 = payment(500, { on: '2026-11-02', pendingChange: { id: 'r', by: SAM, at: 3, delete: true } });
    expect(settledIds([e1, e2])).toEqual(new Set([e1.id]));
  });

  it('does not settle waiting, declined or deleted entries', () => {
    const e1 = expense(1000, 500, { on: '2026-11-01' });
    const e2 = payment(500, { on: '2026-11-02' });
    const waiting = payment(500, { on: '2026-11-02', status: 'waiting' });
    const declined = payment(500, { on: '2026-11-02', status: 'declined' });
    const deleted = payment(500, { on: '2026-11-02', deletedAt: 9 });
    expect(settledIds([e1, e2, waiting, declined, deleted])).toEqual(new Set([e1.id, e2.id]));
  });

  it('shows an entry again when a late edit means the total is no longer zero', () => {
    const e1 = expense(1000, 500, { on: '2026-11-01' });
    const e2 = payment(500, { on: '2026-11-02' });
    expect(settledIds([e1, e2]).size).toBe(2);
    expect(settledIds([{ ...e1, sharePence: 600 }, e2]).size).toBe(0);
  });

  it('settles nothing for no entries', () => {
    expect(settledIds([]).size).toBe(0);
  });
});

// A small seeded generator, so a failure can be repeated.
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
function randomEntries(next: () => number): MoneyEntry[] {
  const count = 1 + Math.floor(next() * 12);
  const entries: MoneyEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const paidBy = next() < 0.5 ? SAM : ALEX;
    const amount = 1 + Math.floor(next() * 10000);
    const kinds = ['expense', 'loan', 'payment'] as const;
    const kind = kinds[Math.floor(next() * 3)];
    const share = kind === 'expense' ? Math.floor(next() * (amount + 1)) : amount;
    const status = next() < 0.8 ? 'agreed' : 'waiting';
    const loans = entries.filter(e => e.kind === 'loan');
    const loanId = kind === 'payment' && loans.length > 0 && next() < 0.7 ? loans[Math.floor(next() * loans.length)].id : undefined;
    entries.push(entry({ kind, paidBy, amountPence: amount, sharePence: share, status, ...(loanId === undefined ? {} : { loanId }), on: `2026-11-${String(1 + Math.floor(next() * 28)).padStart(2, '0')}` }));
  }
  return entries;
}
function shuffled<T>(items: T[], next: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

describe('properties', () => {
  const seeds = Array.from({ length: 200 }, (_, index) => index + 1);

  it('gives the same total for the same entries in any order', () => {
    for (const seed of seeds) {
      const next = random(seed);
      const entries = randomEntries(next);
      expect(total(shuffled(entries, next))).toEqual(total(entries));
      expect(settledIds(shuffled(entries, next))).toEqual(settledIds(entries));
    }
  });

  it('gives the original total after a delete, then a restore and an agreement', () => {
    for (const seed of seeds) {
      const next = random(seed);
      const entries = randomEntries(next).map(e => ({ ...e, status: 'agreed' as const }));
      const target = entries[Math.floor(next() * entries.length)];
      const swap = (change: Partial<MoneyEntry>): MoneyEntry[] => entries.map(e => (e === target ? { ...e, ...change } : e));
      const without = entries.filter(e => e !== target);
      expect(total(swap({ deletedAt: 9, deletedBy: SAM }))).toEqual(total(without));
      expect(total(swap({ status: 'waiting' }))).toEqual(total(without));
      expect(total(swap({ status: 'agreed' }))).toEqual(total(entries));
    }
  });

  it('counts each payment in at most one loan\'s progress', () => {
    for (const seed of seeds) {
      const entries = randomEntries(random(seed));
      const loans = entries.filter(e => e.kind === 'loan');
      for (const pay of entries.filter(e => e.kind === 'payment')) {
        const contributes = loans.filter(l => loanProgress([l, pay], l.id) > 0).length;
        expect(contributes).toBeLessThanOrEqual(1);
      }
    }
  });
});
