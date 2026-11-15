import { describe, expect, it } from 'vitest';
import { formatPounds, MAX_PENCE, parsePounds, shareFor } from '../money';

describe('parsePounds', () => {
  it.each([
    ['12', 1200], ['12.5', 1250], ['12.50', 1250], ['£12.50', 1250], ['1,000', 100000], ['£1,000.50', 100050], ['.50', 50],
    ['1.15', 115], ['0.29', 29], ['19.99', 1999], [' 12 ', 1200], ['1,000,000', 100000000], ['0.01', 1],
  ])('reads %s as %i pence', (text, pence) => {
    expect(parsePounds(text)).toEqual({ ok: true, pence });
  });

  it.each(['12.', '1,00', '1,0000', '12.505', '0', '0.00', '-5', '', '   ', 'abc', '£', '1.2.3', '12 50', '1,00,000'])('refuses %j', text => {
    const result = parsePounds(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  it('tells a comma decimal to use a full stop', () => {
    expect(parsePounds('12,50')).toEqual({ ok: false, message: 'Use a full stop, like 12.50' });
  });

  it('refuses an amount above the limit and accepts the limit', () => {
    expect(parsePounds('1,000,000.01').ok).toBe(false);
    expect(parsePounds('1000000')).toEqual({ ok: true, pence: MAX_PENCE });
  });
});

describe('formatPounds', () => {
  it.each([[0, '£0.00'], [5, '£0.05'], [1250, '£12.50'], [100000, '£1,000.00'], [100000000, '£1,000,000.00']])('shows %i as %s', (pence, text) => {
    expect(formatPounds(pence)).toBe(text);
  });
});

describe('shareFor', () => {
  it('splits equally with the odd penny staying with the payer', () => {
    expect(shareFor('equal', 6340)).toBe(3170);
    expect(shareFor('equal', 1001)).toBe(500);
  });
  it('gives nothing when the payer covers it and everything when the other covers it', () => {
    expect(shareFor('payerCovers', 5000)).toBe(0);
    expect(shareFor('otherCovers', 5000)).toBe(5000);
  });
  it('takes a fixed share as typed', () => {
    expect(shareFor('fixed', 5000, 1234)).toBe(1234);
  });
  it('works out a whole percentage, rounded down', () => {
    expect(shareFor('percent', 1000, 33)).toBe(330);
    expect(shareFor('percent', 1001, 33)).toBe(330);
    expect(shareFor('percent', 1000, 0)).toBe(0);
    expect(shareFor('percent', 1000, 100)).toBe(1000);
  });
});
