import type { Env, PagesFunction } from '../../../lib/types';
import { adminIdentity, logAdmin } from '../../../lib/admin';
import { HttpError, json, readJson, requireMethod } from '../../../lib/errors';
import { parse, productSchema } from '../../../lib/validate';

export const onRequest: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Not found');
  if (request.method === 'GET') {
    requireMethod(request, ['GET']);
    await adminIdentity(request, env);
    const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?')
      .bind(id)
      .first();
    if (!product) throw new HttpError(404, 'Not found');
    const [colors, variants, images] = await Promise.all([
      env.DB.prepare(
        'SELECT id, name, hex, sort FROM product_colors WHERE product_id = ? ORDER BY sort',
      )
        .bind(id)
        .all(),
      env.DB.prepare(
        'SELECT id, color_id AS colorId, size, sku, price_override_cents AS priceOverrideCents, stock FROM product_variants WHERE product_id = ?',
      )
        .bind(id)
        .all(),
      env.DB.prepare(
        'SELECT id, r2_key AS key, alt, color_id AS colorId, sort, content_type AS contentType FROM product_images WHERE product_id = ? ORDER BY sort',
      )
        .bind(id)
        .all(),
    ]);
    return json({
      product: {
        ...product,
        colors: colors.results,
        variants: variants.results,
        images: images.results,
      },
    });
  }
  if (request.method === 'PUT') {
    requireMethod(request, ['PUT']);
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
    const exists = await env.DB.prepare('SELECT id FROM products WHERE id = ?')
      .bind(id)
      .first();
    if (!exists) throw new HttpError(404, 'Not found');
    const statements = [
      env.DB.prepare(
        `UPDATE products SET slug=?, name=?, description=?, base_price_cents=?, currency=?, status=?, release_at=?, updated_at=? WHERE id=?`,
      ).bind(
        product.slug,
        product.name,
        product.description,
        product.basePriceCents,
        product.currency,
        product.status,
        product.releaseAt ?? null,
        Math.floor(Date.now() / 1000),
        id,
      ),
      env.DB.prepare('DELETE FROM product_variants WHERE product_id = ?').bind(
        id,
      ),
      env.DB.prepare('DELETE FROM product_colors WHERE product_id = ?').bind(
        id,
      ),
      env.DB.prepare('DELETE FROM product_images WHERE product_id = ?').bind(
        id,
      ),
    ];
    statements.push(
      ...product.colors.map((color) =>
        env.DB.prepare(
          'INSERT INTO product_colors (id, product_id, name, hex, sort) VALUES (?, ?, ?, ?, ?)',
        ).bind(color.id, id, color.name, color.hex, color.sort),
      ),
    );
    statements.push(
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
    );
    statements.push(
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
    );
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
    await logAdmin(
      request,
      env,
      identity.email,
      'product.update',
      'product',
      id,
    );
    return json({ saved: true });
  }
  if (request.method === 'DELETE') {
    const identity = await adminIdentity(request, env, true);
    await env.DB.prepare(
      "UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?",
    )
      .bind(Math.floor(Date.now() / 1000), id)
      .run();
    await logAdmin(
      request,
      env,
      identity.email,
      'product.archive',
      'product',
      id,
    );
    return json({ archived: true });
  }
  throw new HttpError(405, 'Method not allowed');
};
