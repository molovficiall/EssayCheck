import type { Env, PagesFunction } from '../../../lib/types';
import { adminIdentity, logAdmin } from '../../../lib/admin';
import { HttpError, json, readJson, requireMethod } from '../../../lib/errors';
import { parse, productSchema } from '../../../lib/validate';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  requireMethod(request, ['GET']);
  await adminIdentity(request, env);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.slug, p.name, p.description, p.base_price_cents AS basePriceCents, p.currency, p.status,
      p.release_at AS releaseAt, p.updated_at AS updatedAt,
      (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id=p.id) AS stock,
      (SELECT '/api/media/' || r2_key FROM product_images WHERE product_id=p.id ORDER BY sort LIMIT 1) AS image
     FROM products p ORDER BY p.updated_at DESC`,
  ).all();
  return json({ products: results });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  requireMethod(request, ['POST']);
  const identity = await adminIdentity(request, env, true);
  const product = parse(productSchema, await readJson(request, 128 * 1024));
  if (product.currency !== (env.CURRENCY ?? 'usd').toLowerCase())
    throw new HttpError(400, 'Currency must match store configuration');
  if (
    product.status === 'published' &&
    (!product.images.length ||
      !product.variants.some((variant) => variant.stock > 0))
  ) {
    throw new HttpError(
      422,
      'Publishing requires an image and at least one in-stock variant',
    );
  }
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    env.DB.prepare(
      `INSERT INTO products (id, slug, name, description, base_price_cents, currency, status, release_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      product.slug,
      product.name,
      product.description,
      product.basePriceCents,
      product.currency,
      product.status,
      product.releaseAt ?? null,
      now,
      now,
    ),
    ...product.colors.map((color) =>
      env.DB.prepare(
        'INSERT INTO product_colors (id, product_id, name, hex, sort) VALUES (?, ?, ?, ?, ?)',
      ).bind(color.id, id, color.name, color.hex, color.sort),
    ),
    ...product.variants.map((variant) =>
      env.DB.prepare(
        `INSERT INTO product_variants (id, product_id, color_id, size, sku, price_override_cents, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        variant.id,
        id,
        variant.colorId,
        variant.size,
        variant.sku,
        variant.priceOverrideCents,
        variant.stock,
      ),
    ),
    ...product.images.map((image) =>
      env.DB.prepare(
        `INSERT INTO product_images (id, product_id, r2_key, alt, color_id, sort, content_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        image.id,
        id,
        image.key,
        image.alt,
        image.colorId,
        image.sort,
        image.contentType,
      ),
    ),
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('unique')
    )
      throw new HttpError(409, 'Slug or SKU already exists');
    throw error;
  }
  await logAdmin(request, env, identity.email, 'product.create', 'product', id);
  return json({ id }, 201);
};
