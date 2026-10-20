import type { Env, PagesFunction } from '../../lib/types';
import {
  HttpError,
  json,
  readJson,
  requireMethod,
  requireSameOrigin,
} from '../../lib/errors';
import { parse, cartSchema } from '../../lib/validate';
import { rateLimit } from '../../lib/ratelimit';
import { prepared } from '../../lib/db';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  requireMethod(request, ['POST']);
  requireSameOrigin(request);
  await rateLimit(request, env, 'cart', 60, 60);
  const input = parse(cartSchema, await readJson(request));
  const lines: Record<string, unknown>[] = [];
  let subtotal = 0;
  let invalid = false;
  for (let index = 0; index < input.lines.length; index++) {
    const line = input.lines[index];
    const row = await prepared(
      env.DB,
      `SELECT p.id AS productId, p.slug, p.name, p.currency, p.base_price_cents,
        c.id AS colorId, c.name AS color, c.hex, v.size AS sizeId, v.id AS variantId,
        v.stock, COALESCE(v.price_override_cents, p.base_price_cents) AS priceCents,
        (SELECT '/api/media/' || r2_key FROM product_images WHERE product_id = p.id ORDER BY sort LIMIT 1) AS image
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN product_colors c ON c.id = v.color_id
       WHERE p.id = ? AND c.id = ? AND v.size = ? AND p.status = 'published'
         AND (p.release_at IS NULL OR p.release_at <= ?)`,
      [
        line.productId,
        line.colorId,
        line.sizeId,
        Math.floor(Date.now() / 1000),
      ],
    ).first<Record<string, unknown>>();
    if (!row) {
      invalid = true;
      lines.push({ index, valid: false, reason: 'unavailable', qty: line.qty });
      continue;
    }
    const stock = Number(row.stock);
    if (stock < line.qty) {
      invalid = true;
      lines.push({
        index,
        valid: false,
        reason: stock > 0 ? 'insufficient_stock' : 'sold_out',
        available: stock,
      });
      continue;
    }
    const optionsResult = await env.DB.prepare(
      `SELECT v.color_id AS colorId, c.name AS color, c.hex, v.size AS sizeId, v.stock
       FROM product_variants v JOIN product_colors c ON c.id=v.color_id
       WHERE v.product_id=? ORDER BY c.sort, v.size`,
    )
      .bind(line.productId)
      .all();
    const priceCents = Number(row.priceCents);
    subtotal += priceCents * line.qty;
    lines.push({
      ...row,
      options: optionsResult.results,
      qty: line.qty,
      valid: true,
    });
  }
  if (invalid) throw new HttpError(409, 'Cart needs attention', { lines });
  return json({ lines, subtotal, currency: env.CURRENCY ?? 'usd' });
};
