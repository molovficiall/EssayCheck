import { CheckoutIn, HttpError, allow, json, rateLimit, readJson, stripe, type Ctx } from '../_lib';

export const onRequest: PagesFunction = async (c) => {
  const { request, env } = c as unknown as Ctx;
  allow(request, ['POST']);
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new HttpError(403, 'Forbidden');
  await rateLimit(env, request, 'checkout', 10);
  const { lines } = await readJson(request, CheckoutIn);

  // merge duplicate variants, then price EVERYTHING from the database (never from the client)
  const qty = new Map<string, number>();
  for (const l of lines) qty.set(l.vid, (qty.get(l.vid) || 0) + l.qty);
  const rows = await env.DB.batch(
    [...qty.keys()].map(id => env.DB.prepare(
      `SELECT v.id vid, v.color, v.size, v.stock, p.name, p.price_cents, p.status, p.images
       FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`).bind(id)));
  const items: { vid: string; qty: number; price_cents: number; name: string; image?: string }[] = [];
  for (const r of rows) {
    const v = r.results[0] as any;
    if (!v || v.status !== 'published') throw new HttpError(409, 'An item is no longer available');
    const q = qty.get(v.vid)!;
    if (q > 10 || q > v.stock) throw new HttpError(409, `Only ${v.stock} left of ${v.name} (${v.color}, ${v.size})`);
    const img = JSON.parse(v.images)[0]?.key;
    items.push({ vid: v.vid, qty: q, price_cents: v.price_cents, name: `${v.name} - ${v.color} / ${v.size}`, image: img });
  }

  const orderId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO orders(id,status,items,created_at) VALUES(?,?,?,?)')
    .bind(orderId, 'pending', JSON.stringify(items.map(({ image, ...i }) => i)), Date.now()).run();

  const body: Record<string, string | number | boolean> = {
    mode: 'payment',
    success_url: `${env.SITE_URL}/success`,
    cancel_url: `${env.SITE_URL}/`,
    client_reference_id: orderId,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    'automatic_tax[enabled]': env.AUTOMATIC_TAX === 'true',
  };
  env.SHIP_COUNTRIES.split(',').forEach((cc, i) => (body[`shipping_address_collection[allowed_countries][${i}]`] = cc.trim()));
  items.forEach((it, i) => {
    body[`line_items[${i}][quantity]`] = it.qty;
    body[`line_items[${i}][price_data][currency]`] = env.CURRENCY;
    body[`line_items[${i}][price_data][unit_amount]`] = it.price_cents;
    body[`line_items[${i}][price_data][product_data][name]`] = it.name;
    if (it.image) body[`line_items[${i}][price_data][product_data][images][0]`] = `${env.SITE_URL}/api/media/${it.image}`;
  });
  const s = await stripe(env, 'checkout/sessions', body, orderId);
  await env.DB.prepare('UPDATE orders SET session_id=? WHERE id=?').bind(s.id, orderId).run();
  return json({ url: s.url });
};
