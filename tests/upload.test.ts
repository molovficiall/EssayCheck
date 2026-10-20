import { describe, expect, it } from 'vitest';
import { validateImageUpload } from '../functions/lib/media';

describe('image uploads', () => {
  it('accepts the supported signatures and rejects mismatched MIME values', () => {
    expect(
      validateImageUpload('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff]), 3)
        .extension,
    ).toBe('jpg');
    expect(
      validateImageUpload(
        'image/png',
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        8,
      ).extension,
    ).toBe('png');
    expect(
      validateImageUpload(
        'image/webp',
        new TextEncoder().encode('RIFFxxxxWEBP'),
        12,
      ).extension,
    ).toBe('webp');
    expect(() =>
      validateImageUpload('image/png', new Uint8Array([1, 2, 3]), 3),
    ).toThrow();
    expect(() =>
      validateImageUpload('image/svg+xml', new Uint8Array([60, 115]), 2),
    ).toThrow();
  });

  it('rejects zero-byte and oversized uploads', () => {
    expect(() =>
      validateImageUpload('image/png', new Uint8Array([1]), 0),
    ).toThrow();
    expect(() =>
      validateImageUpload(
        'image/jpeg',
        new Uint8Array([0xff, 0xd8, 0xff]),
        5 * 1024 * 1024 + 1,
      ),
    ).toThrow();
  });
});
