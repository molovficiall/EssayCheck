import { describe, expect, it } from 'vitest';
import { dollarsToCents, getLinePrice } from '../functions/lib/money';

describe('money helpers', () => {
  it('converts decimal text to exact integer cents', () => {
    expect(dollarsToCents('19.99')).toBe(1999);
    expect(dollarsToCents('2.5')).toBe(250);
    expect(dollarsToCents('0.50')).toBe(50);
  });

  it('rejects malformed or fractional-cent prices', () => {
    expect(() => dollarsToCents('1.999')).toThrow();
    expect(() => dollarsToCents('-1')).toThrow();
    expect(() => dollarsToCents('01.00')).toThrow();
  });

  it('uses an explicit variant price when present', () => {
    expect(getLinePrice(1000, 1250)).toBe(1250);
    expect(getLinePrice(1000, null)).toBe(1000);
  });
});
