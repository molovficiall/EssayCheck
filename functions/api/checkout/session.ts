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
import { z } from 'zod';
import { stripeRequest } from '../../lib/stripe';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  requireMethod(request, ['POST']);
  requireSameOrigin(request);
  await rateLimit(request, env, 'checkout', 10, 60);
  if (!env.STRIPE_SECRET_KEY || !env.SITE_URL)
    throw new HttpError(503, 'Checkout is not configured');
  const idempotencyKey = z
    .string()
    .uuid()
    .safeParse(request.headers.get('idempotency-key'));
  if (!idempotencyKey.success)
    throw new HttpError(400, 'A UUID Idempotency-Key is required');
  const input = parse(cartSchema, await readJson(request));
  const products: Array<Record<string, unknown>> = [];
  for (const line of input.lines) {
    const row = await env.DB.prepare(
      `SELECT p.id AS productId, p.name, p.base_price_cents, p.currency, c.name AS color,
        v.id AS variantId, v.size, v.stock, COALESCE(v.price_override_cents, p.base_price_cents) AS price
        ,(SELECT '/api/media/' || r2_key FROM product_images WHERE product_id=p.id ORDER BY sort LIMIT 1) AS image
       FROM product_variants v JOIN products p ON p.id=v.product_id
       JOIN product_colors c ON c.id=v.color_id
       WHERE p.id=? AND c.id=? AND v.size=? AND p.status='published'
       AND (p.release_at IS NULL OR p.release_at <= ?)`,
    )
      .bind(
        line.productId,
        line.colorId,
        line.sizeId,
        Math.floor(Date.now() / 1000),
      )
      .first<Record<string, unknown>>();
    if (!row || Number(row.stock) < line.qty)
      throw new HttpError(409, 'Cart is no longer available');
    products.push({ ...row, qty: line.qty });
  }
  const now = Math.floor(Date.now() / 1000);
  const currency = (env.CURRENCY ?? 'usd').toLowerCase();
  if (
    products.some(
      (product) => String(product.currency).toLowerCase() !== currency,
    )
  ) {
    throw new HttpError(
      409,
      'Product currency does not match store configuration',
    );
  }
  let order = await env.DB.prepare(
    'SELECT id, stripe_session_id FROM orders WHERE checkout_key = ?',
  )
    .bind(idempotencyKey.data)
    .first<{ id: string; stripe_session_id: string | null }>();
  if (order?.stripe_session_id) {
    const prior = await stripeRequest(
      env,
      `/v1/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`,
    );
    const priorSession = (await prior.json()) as { url?: string };
    if (prior.ok && priorSession.url) return json({ url: priorSession.url });
  }
  if (!order) {
    const orderId = crypto.randomUUID();
    const statements = [
      env.DB.prepare(
        'INSERT INTO orders (id, status, currency, checkout_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(orderId, 'pending', currency, idempotencyKey.data, now, now),
      ...products.map((product) =>
        env.DB.prepare(
          `INSERT INTO order_items
          (id, order_id, product_id, variant_id, name_snapshot, color_snapshot, size_snapshot, unit_price_cents, qty)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          orderId,
          product.productId,
          product.variantId,
          product.name,
          product.color,
          product.size,
          product.price,
          product.qty,
        ),
      ),
    ];
    try {
      await env.DB.batch(statements);
      order = { id: orderId, stripe_session_id: null };
    } catch (error) {
      order = await env.DB.prepare(
        'SELECT id, stripe_session_id FROM orders WHERE checkout_key = ?',
      )
        .bind(idempotencyKey.data)
        .first<{ id: string; stripe_session_id: string | null }>();
      if (!order) throw error;
    }
  }
  const orderId = order.id;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('client_reference_id', orderId);
  form.set(
    'success_url',
    `${env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
  );
  form.set('cancel_url', `${env.SITE_URL}/cancel.html`);
  form.set('expires_at', String(now + 1800));
  form.set('metadata[order_id]', orderId);
  form.set(
    'automatic_tax[enabled]',
    env.AUTOMATIC_TAX === 'true' ? 'true' : 'false',
  );
  const countries = (env.ALLOWED_SHIP_COUNTRIES ?? 'US')
    .split(',')
    .map((country) => country.trim())
    .filter(Boolean);
  countries.forEach((country, index) =>
    form.set(
      `shipping_address_collection[allowed_countries][${index}]`,
      country,
    ),
  );
  products.forEach((product, index) => {
    form.set(`line_items[${index}][quantity]`, String(product.qty));
    form.set(`line_items[${index}][price_data][currency]`, currency);
    form.set(
      `line_items[${index}][price_data][unit_amount]`,
      String(product.price),
    );
    form.set(
      `line_items[${index}][price_data][product_data][name]`,
      `${product.name} — ${product.color} / ${product.size}`,
    );
    if (product.image)
      form.set(
        `line_items[${index}][price_data][product_data][images][0]`,
        `${env.SITE_URL}${product.image}`,
      );
    form.set(
      `line_items[${index}][price_data][product_data][metadata][product_id]`,
      String(product.productId),
    );
    form.set(
      `line_items[${index}][price_data][product_data][metadata][variant_id]`,
      String(product.variantId),
    );
  });
  const stripeResponse = await stripeRequest(
    env,
    '/v1/checkout/sessions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    },
    idempotencyKey.data,
  );
  const session = (await stripeResponse.json()) as {
    id?: string;
    url?: string;
  };
  if (!stripeResponse.ok || !session.id || !session.url) {
    await env.DB.prepare(
      'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?',
    )
      .bind('failed', Math.floor(Date.now() / 1000), orderId)
      .run();
    throw new HttpError(502, 'Unable to start checkout');
  }
  await env.DB.prepare(
    'UPDATE orders SET stripe_session_id = ?, updated_at = ? WHERE id = ?',
  )
    .bind(session.id, Math.floor(Date.now() / 1000), orderId)
    .run();
  return json({ url: session.url });
};
