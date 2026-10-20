import { describe, expect, it } from 'vitest';
import {
  cartSchema,
  hexSchema,
  parse,
  slugSchema,
} from '../functions/lib/validate';

describe('request validation', () => {
  it('accepts strict slugs and colors and rejects malformed values', () => {
    expect(slugSchema.safeParse('field-tee-02').success).toBe(true);
    expect(slugSchema.safeParse('Field Tee').success).toBe(false);
    expect(hexSchema.safeParse('#00b8d4').success).toBe(true);
    expect(hexSchema.safeParse('#fff').success).toBe(false);
  });

  it('rejects unknown input keys and invalid cart quantities', () => {
    const line = {
      productId: crypto.randomUUID(),
      colorId: crypto.randomUUID(),
      sizeId: 'M',
      qty: 1,
    };
    expect(cartSchema.safeParse({ lines: [line], price: 1 }).success).toBe(
      false,
    );
    expect(
      cartSchema.safeParse({ lines: [{ ...line, qty: 11 }] }).success,
    ).toBe(false);
    expect(() => parse(cartSchema, { lines: [], unexpected: true })).toThrow();
  });
});
