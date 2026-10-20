import { z } from 'zod';
import { HttpError } from './errors';

export const cartSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            colorId: z.string().uuid(),
            sizeId: z.string().min(1).max(20),
            qty: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(25),
  })
  .strict()
  .superRefine(({ lines }, context) => {
    const seen = new Set<string>();
    for (const [index, line] of lines.entries()) {
      const key = `${line.productId}:${line.colorId}:${line.sizeId}`;
      if (seen.has(key))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index],
          message: 'Duplicate cart variant',
        });
      seen.add(key);
    }
  });

export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const hexSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const productSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: slugSchema,
    description: z.string().max(2000),
    basePriceCents: z.number().int().min(50),
    currency: z.string().length(3).toLowerCase(),
    status: z.enum(['draft', 'published', 'archived']),
    releaseAt: z.number().int().nullable().optional(),
    colors: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().min(1).max(40),
            hex: hexSchema,
            sort: z.number().int(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    variants: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            colorId: z.string().uuid(),
            size: z.string().min(1).max(20),
            sku: z.string().max(80).nullable(),
            priceOverrideCents: z.number().int().min(50).nullable(),
            stock: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    images: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            key: z.string().regex(/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/),
            alt: z.string().trim().min(1).max(200),
            colorId: z.string().uuid().nullable(),
            sort: z.number().int(),
            contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'Invalid request', result.error.flatten());
  }
  return result.data;
}
