import type { Env, PagesFunction } from '../../lib/types';
import { HttpError, json } from '../../lib/errors';
import { slugSchema } from '../../lib/validate';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const result = slugSchema.safeParse(params.slug);
  if (!result.success) throw new HttpError(404, 'Product not found');
  const slug = result.data;
  const product = await env.DB.prepare(
    `SELECT p.id, p.slug, p.name, p.description, p.base_price_cents AS priceCents, p.currency,
      (SELECT json_group_array(json_object('id', c.id, 'name', c.name, 'hex', c.hex))
       FROM product_colors c WHERE c.product_id = p.id ORDER BY c.sort) AS colors,
      (SELECT json_group_array(json_object('id', v.id, 'colorId', v.color_id, 'size', v.size, 'stock', v.stock, 'priceCents', COALESCE(v.price_override_cents, p.base_price_cents)))
       FROM product_variants v WHERE v.product_id = p.id) AS variants,
      (SELECT json_group_array(json_object('url', '/api/media/' || i.r2_key, 'alt', i.alt, 'colorId', i.color_id))
       FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort) AS images
     FROM products p
     WHERE p.slug = ? AND p.status = 'published' AND (p.release_at IS NULL OR p.release_at <= ?)`,
  )
    .bind(slug, Math.floor(Date.now() / 1000))
    .first<Record<string, unknown>>();
  if (!product) throw new HttpError(404, 'Product not found');
  const normalize = (value: unknown): unknown[] => {
    if (typeof value !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  return json({
    product: {
      ...product,
      colors: normalize(product.colors),
      variants: normalize(product.variants),
      images: normalize(product.images),
    },
  });
};
