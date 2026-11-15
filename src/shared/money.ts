// The one place money is read and shown. Money is a whole number of pence everywhere; text is parsed as text, never as a float.
export const MAX_PENCE = 100_000_000;

export type PoundsResult = { ok: true; pence: number } | { ok: false; message: string };

export type SplitMode = 'equal' | 'payerCovers' | 'otherCovers' | 'fixed' | 'percent';

const refuse = (message: string): PoundsResult => ({ ok: false, message });
const AMOUNT = /^£?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/;
const COMMA_DECIMAL = /^£?\d+,\d{1,2}$/;

export function parsePounds(text: string): PoundsResult {
  const typed = text.trim();
  if (typed === '' || typed === '£') return refuse('Type an amount, like 12.50');
  if (COMMA_DECIMAL.test(typed)) return refuse('Use a full stop, like 12.50');
  const match = AMOUNT.exec(typed);
  if (!match || (match[1] === undefined && match[2] === undefined)) return refuse('Use an amount like 12.50');
  const pounds = Number((match[1] ?? '0').replace(/,/g, ''));
  const pence = pounds * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (pence === 0) return refuse('The amount must be more than £0.00');
  if (pence > MAX_PENCE) return refuse('The amount can be at most £1,000,000.00');
  return { ok: true, pence };
}

export function formatPounds(pence: number): string {
  const pounds = Math.floor(pence / 100).toLocaleString('en-GB');
  return `£${pounds}.${String(pence % 100).padStart(2, '0')}`;
}

// The other member's share, as the form works it out from the payer's side. `value` is pence for `fixed` and a whole percentage
// for `percent`. The odd penny stays with the payer, so every share rounds down.
export function shareFor(mode: SplitMode, totalPence: number, value = 0): number {
  if (mode === 'equal') return Math.floor(totalPence / 2);
  if (mode === 'payerCovers') return 0;
  if (mode === 'otherCovers') return totalPence;
  if (mode === 'fixed') return value;
  return Math.floor((totalPence * value) / 100);
}
