import { describe, expect, it } from 'vitest';
import { cartSchema } from '../functions/lib/validate';

describe('server cart input', () => {
  it('limits carts to 25 lines and each quantity to ten', () => {
    const makeLine = (index: number) => ({
      productId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      colorId: crypto.randomUUID(),
      sizeId: 'M',
      qty: 10,
    });
    expect(
      cartSchema.safeParse({
        lines: Array.from({ length: 25 }, (_, index) => makeLine(index + 1)),
      }).success,
    ).toBe(true);
    expect(
      cartSchema.safeParse({
        lines: Array.from({ length: 26 }, (_, index) => makeLine(index + 1)),
      }).success,
    ).toBe(false);
  });

  it('rejects non-integer quantities', () => {
    expect(
      cartSchema.safeParse({
        lines: [
          {
            productId: crypto.randomUUID(),
            colorId: crypto.randomUUID(),
            sizeId: 'M',
            qty: 1.5,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate variants so a client cannot split a stock request', () => {
    const line = {
      productId: crypto.randomUUID(),
      colorId: crypto.randomUUID(),
      sizeId: 'M',
      qty: 6,
    };
    expect(cartSchema.safeParse({ lines: [line, line] }).success).toBe(false);
  });
});
