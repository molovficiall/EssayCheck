import { ApiError, escapeHtml, json, readBodyBytes, requireBindings, stripeRequest, verifyStripeSignature } from '../../_lib.js';

function formatAmount(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((amount || 0) / 100);
  } catch {
    return `${((amount || 0) / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

async function claimNotification(env, sessionId) {
  const now = Date.now();
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO order_notifications (session_id, status, updated_at) VALUES (?, ?, ?)')
    .bind(sessionId, 'pending', now).run();
  if (inserted.meta.changes === 1) return true;
  const row = await env.DB.prepare('SELECT status, updated_at FROM order_notifications WHERE session_id = ?').bind(sessionId).first();
  if (row?.status === 'sent') return false;
  const reclaimed = await env.DB.prepare("UPDATE order_notifications SET updated_at = ? WHERE session_id = ? AND status = 'pending' AND updated_at < ?")
    .bind(now, sessionId, now - 60_000).run();
  if (reclaimed.meta.changes === 1) return true;
  throw new ApiError(503, 'Order notification is already being processed. Please retry.');
}

async function sendPaidOrderNotice(env, sessionId) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM || !env.ORDER_NOTIFICATION_EMAIL) {
    throw new ApiError(503, 'Order email is not configured. Set the Resend and notification settings in Pages.');
  }
  const checkout = await stripeRequest(env, `checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (checkout.mode !== 'payment' || checkout.payment_status !== 'paid' || checkout.metadata?.shop !== 'atelier-shirt-shop') return false;
  const lineItems = await stripeRequest(env, `checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=100`);
  const currency = (checkout.currency || 'usd').toUpperCase();
  const total = formatAmount(checkout.amount_total, currency);
  const customerEmail = checkout.customer_details?.email || 'Not provided';
  const rows = (lineItems.data || []).map((item) => ({
    name: item.description || 'Item',
    quantity: item.quantity || 0,
    total: formatAmount(item.amount_total, currency)
  }));
  const text = [
    'A shirt shop order has been paid.',
    '',
    `Order: ${sessionId}`,
    `Total: ${total}`,
    `Customer email: ${customerEmail}`,
    '',
    'Items:',
    ...rows.map((item) => `${item.name} × ${item.quantity} — ${item.total}`)
  ].join('\n');
  const html = `<h2>Paid order received</h2><p><strong>Order:</strong> ${escapeHtml(sessionId)}</p><p><strong>Total:</strong> ${escapeHtml(total)}</p><p><strong>Customer email:</strong> ${escapeHtml(customerEmail)}</p><h3>Items</h3><ul>${rows.map((item) => `<li>${escapeHtml(item.name)} × ${item.quantity} — ${escapeHtml(item.total)}</li>`).join('')}</ul>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [env.ORDER_NOTIFICATION_EMAIL],
      subject: `Paid order received — ${sessionId}`,
      text,
      html
    })
  });
  if (!response.ok) {
    console.error('Order email provider returned status:', response.status);
    throw new ApiError(502, 'Order email could not be sent. Stripe can retry this webhook.');
  }
  return true;
}

export async function onRequestPost({ request, env }) {
  requireBindings(env, ['DB']);
  if (!env.STRIPE_WEBHOOK_SECRET) throw new ApiError(503, 'STRIPE_WEBHOOK_SECRET is not configured.');
  const rawBody = await readBodyBytes(request, 1_000_000);
  const valid = await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) throw new ApiError(400, 'Invalid webhook signature.');

  let event;
  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    throw new ApiError(400, 'Webhook payload is not valid JSON.');
  }
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return json({ received: true });
  }
  const sessionId = event.data?.object?.id;
  if (typeof sessionId !== 'string' || !/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    throw new ApiError(400, 'Webhook checkout session is invalid.');
  }
  if (!await claimNotification(env, sessionId)) return json({ received: true });
  const sent = await sendPaidOrderNotice(env, sessionId);
  if (!sent) {
    await env.DB.prepare("DELETE FROM order_notifications WHERE session_id = ? AND status = 'pending'").bind(sessionId).run();
    return json({ received: true });
  }
  await env.DB.prepare("UPDATE order_notifications SET status = 'sent', updated_at = ? WHERE session_id = ?")
    .bind(Date.now(), sessionId).run();
  return json({ received: true });
}
