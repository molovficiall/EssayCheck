import type { Env, PagesFunction } from '../../lib/types';
import { HttpError, json, requireMethod } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { stripeRequest, validStripeSignature } from '../../lib/stripe';
import { z } from 'zod';

const stripeEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    data: z.object({ object: z.record(z.unknown()) }).passthrough(),
  })
  .passthrough();

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  requireMethod(request, ['POST']);
  if (!env.STRIPE_WEBHOOK_SECRET)
    throw new HttpError(503, 'Webhook is not configured');
  const raw = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  if (
    !(await validStripeSignature(raw, signature, env.STRIPE_WEBHOOK_SECRET))
  ) {
    await audit(
      request,
      env,
      'stripe',
      'webhook.signature_failure',
      'event',
      '',
      'denied',
    );
    throw new HttpError(400, 'Invalid signature');
  }
  let event: z.infer<typeof stripeEventSchema>;
  try {
    const parsed = stripeEventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error('Invalid event');
    event = parsed.data;
  } catch {
    throw new HttpError(400, 'Invalid event');
  }
  const existing = await env.DB.prepare(
    'SELECT event_id FROM stripe_events WHERE event_id = ?',
  )
    .bind(event.id)
    .first();
  if (existing) return json({ received: true, duplicate: true });
  const object = event.data.object;
  const orderId = String(
    (object.metadata as Record<string, unknown> | undefined)?.order_id ??
      object.client_reference_id ??
      '',
  );
  const now = Math.floor(Date.now() / 1000);
  if (event.type === 'checkout.session.completed' && orderId) {
    const order = await env.DB.prepare('SELECT status FROM orders WHERE id = ?')
      .bind(orderId)
      .first<{ status: string }>();
    if (!order) {
      await env.DB.prepare(
        'INSERT INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)',
      )
        .bind(event.id, event.type, now)
        .run();
      return json({ received: true });
    }
    if (order.status !== 'pending') {
      const paymentIntent = String(object.payment_intent ?? '');
      const shouldRefund = order.status !== 'paid' && paymentIntent !== '';
      if (shouldRefund) {
        const refund = await stripeRequest(
          env,
          '/v1/refunds',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ payment_intent: paymentIntent }),
          },
          `refund-${event.id}`,
        );
        if (!refund.ok) throw new HttpError(502, 'Late payment refund failed');
      }
      await env.DB.prepare(
        'INSERT INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)',
      )
        .bind(event.id, event.type, now)
        .run();
      return json({ received: true, refunded: shouldRefund });
    }
  }
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      'INSERT INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)',
    ).bind(event.id, event.type, now),
  ];
  if (event.type === 'checkout.session.completed' && orderId) {
    statements.push(
      env.DB.prepare(
        'UPDATE orders SET status = ?, email = ?, amount_total_cents = ?, shipping_json = ?, stripe_payment_intent = ?, updated_at = ? WHERE id = ? AND status = ?',
      ).bind(
        'paid',
        (object.customer_details as Record<string, unknown> | undefined)
          ?.email ?? null,
        object.amount_total ?? null,
        JSON.stringify(object.shipping_details ?? null),
        object.payment_intent ?? null,
        now,
        orderId,
        'pending',
      ),
    );
    const items = await env.DB.prepare(
      'SELECT variant_id, qty FROM order_items WHERE order_id = ?',
    )
      .bind(orderId)
      .all<{ variant_id: string; qty: number }>();
    for (const item of items.results) {
      statements.push(
        env.DB.prepare(
          'UPDATE product_variants SET stock = stock - ? WHERE id = ?',
        ).bind(item.qty, item.variant_id),
      );
    }
  } else if (event.type === 'checkout.session.expired' && orderId) {
    statements.push(
      env.DB.prepare(
        'UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
      ).bind('expired', now, orderId, 'pending'),
    );
  } else if (event.type === 'charge.refunded') {
    const paymentIntent = String(object.payment_intent ?? '');
    statements.push(
      env.DB.prepare(
        `UPDATE orders SET status = 'refunded', updated_at = ? WHERE stripe_payment_intent = ?`,
      ).bind(now, paymentIntent),
    );
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const stockConflict =
      event.type === 'checkout.session.completed' &&
      error instanceof Error &&
      error.message.toLowerCase().includes('insufficient stock');
    if (!stockConflict) throw error;
    const paymentIntent = String(object.payment_intent ?? '');
    if (!paymentIntent) throw error;
    const refund = await stripeRequest(
      env,
      '/v1/refunds',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ payment_intent: paymentIntent }),
      },
      `refund-${event.id}`,
    );
    if (!refund.ok)
      throw new HttpError(502, 'Inventory conflict refund failed');
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)',
      ).bind(event.id, event.type, now),
      env.DB.prepare(
        "UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'pending'",
      ).bind(now, orderId),
    ]);
    return json({ received: true, refunded: true });
  }
  return json({ received: true });
};
