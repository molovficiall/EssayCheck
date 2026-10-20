import type { Env, PagesFunction } from '../../lib/types';
import { json } from '../../lib/errors';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.slug, p.name, p.description, p.base_price_cents AS priceCents, p.currency,
      (SELECT json_group_array(json_object('id', c.id, 'name', c.name, 'hex', c.hex))
       FROM product_colors c WHERE c.product_id = p.id ORDER BY c.sort) AS colors,
      (SELECT json_group_array(json_object('id', v.id, 'colorId', v.color_id, 'size', v.size, 'stock', v.stock, 'priceCents', COALESCE(v.price_override_cents, p.base_price_cents)))
       FROM product_variants v WHERE v.product_id = p.id) AS variants,
      (SELECT json_group_array(json_object('url', '/api/media/' || i.r2_key, 'alt', i.alt, 'colorId', i.color_id))
       FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort) AS images
     FROM products p
     WHERE p.status = 'published' AND (p.release_at IS NULL OR p.release_at <= ?)
     ORDER BY p.created_at DESC`,
  )
    .bind(Math.floor(Date.now() / 1000))
    .all();
  return json({ products: results.map(normalizeProduct) });
};

function normalizeJson(value: unknown): unknown[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeProduct(
  product: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...product,
    colors: normalizeJson(product.colors),
    variants: normalizeJson(product.variants),
    images: normalizeJson(product.images),
  };
}
