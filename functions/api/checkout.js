import { ApiError, enforceRateLimit, getSiteUrl, listProducts, json, readJson, stripeRequest } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  await enforceRateLimit(request, env, 'checkout', 20);
  const body = await readJson(request);
  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 30) {
    throw new ApiError(400, 'Your cart is empty or contains too many items.');
  }

  const products = await listProducts(env);
  const quantities = new Map();
  for (const item of body.items) {
    if (!item || typeof item.id !== 'string' || typeof item.size !== 'string' ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      throw new ApiError(400, 'Cart item is invalid.');
    }
    const product = products.find((candidate) => candidate.id === item.id);
    if (!product || !product.sizes.includes(item.size)) {
      throw new ApiError(400, 'A product size in your cart is no longer available.');
    }
    const key = `${item.id}\u0000${item.size}`;
    const quantity = (quantities.get(key)?.quantity || 0) + item.quantity;
    if (quantity > 10) throw new ApiError(400, 'A product cannot be ordered more than 10 times at once.');
    quantities.set(key, { id: item.id, size: item.size, quantity });
  }

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('shipping_address_collection[allowed_countries][0]', 'US');
  form.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', '0');
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');
  form.set('shipping_options[0][shipping_rate_data][display_name]', 'Standard shipping');
  form.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
  form.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', '3');
  form.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
  form.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', '7');
  form.set('metadata[shop]', 'atelier-shirt-shop');
  const siteUrl = getSiteUrl(request, env);
  form.set('success_url', `${siteUrl}/checkout.html?success=1&session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${siteUrl}/cart.html?cancelled=1`);

  for (const [index, item] of [...quantities.values()].entries()) {
    const product = products.find((candidate) => candidate.id === item.id);
    const prefix = `line_items[${index}]`;
    form.set(`${prefix}[quantity]`, String(item.quantity));
    form.set(`${prefix}[price_data][currency]`, 'usd');
    form.set(`${prefix}[price_data][unit_amount]`, String(product.price));
    form.set(`${prefix}[price_data][product_data][name]`, `${product.name} — Size ${item.size}`);
    form.set(`${prefix}[price_data][product_data][description]`, product.description);
  }

  const checkout = await stripeRequest(env, 'checkout/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  if (typeof checkout.url !== 'string') throw new ApiError(502, 'Stripe did not return a checkout link.');
  return json({ url: checkout.url });
}
