import { describe, expect, it } from 'vitest';
import { MONEY_PREFIX, moneyKey } from '../keys';

describe('moneyKey', () => {
  it('lives under the household with the MONEY# prefix', () => {
    expect(MONEY_PREFIX).toBe('MONEY#');
    expect(moneyKey('h1', 'e1')).toEqual({ PK: 'HH#h1', SK: 'MONEY#e1' });
  });
});
