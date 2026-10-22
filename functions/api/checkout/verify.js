import { ApiError, enforceRateLimit, json, stripeRequest } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  await enforceRateLimit(request, env, 'checkout-verify', 20);
  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new ApiError(400, 'Checkout session is invalid.');
  const checkout = await stripeRequest(env, `checkout/sessions/${encodeURIComponent(sessionId)}`);
  return json({ paid: checkout.payment_status === 'paid' && checkout.metadata?.shop === 'atelier-shirt-shop' });
}
