import { HttpError, allow, audit, json, verifyStripe, type Ctx } from '../_lib';

export const onRequest: PagesFunction = async (c) => {
  const { request, env } = c as unknown as Ctx;
  allow(request, ['POST']);
  const raw = await request.text();
  if (raw.length > 262144) throw new HttpError(413, 'Too large');
  if (!(await verifyStripe(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    await audit(env, 'stripe', 'webhook.bad_signature');
    throw new HttpError(400, 'Bad signature');
  }
  const ev = JSON.parse(raw);
  const seen = await env.DB.prepare('SELECT 1 FROM events WHERE id=?').bind(ev.id).first();
  if (seen) return json({ ok: true }); // replay / retry: already processed

  const o = ev.data?.object;
  if (ev.type === 'checkout.session.completed' && o?.payment_status === 'paid') {
    const order = await env.DB.prepare('SELECT items FROM orders WHERE id=?').bind(o.client_reference_id).first<{ items: string }>();
    if (order) {
      const items: { vid: string; qty: number }[] = JSON.parse(order.items);
      const ship = o.collected_information?.shipping_details ?? o.shipping_details ?? null;
      const stmts = [
        env.DB.prepare('INSERT INTO events(id,ts) VALUES(?,?)').bind(ev.id, Date.now()),
        env.DB.prepare('UPDATE orders SET status=?, email=?, total_cents=?, shipping=? WHERE id=?')
          .bind('paid', o.customer_details?.email ?? null, o.amount_total ?? null, ship ? JSON.stringify(ship) : null, o.client_reference_id),
        ...items.map(i => env.DB.prepare('UPDATE variants SET stock = stock - ?1 WHERE id = ?2 AND stock >= ?1').bind(i.qty, i.vid)),
      ];
      const res = await env.DB.batch(stmts); // atomic
      if (res.slice(2).some(r => r.meta.changes === 0)) { // sold out between checkout and payment
        await env.DB.prepare("UPDATE orders SET status='review' WHERE id=?").bind(o.client_reference_id).run();
        await audit(env, 'stripe', 'order.oversold', o.client_reference_id);
      }
      return json({ ok: true });
    }
  } else if (ev.type === 'checkout.session.expired') {
    await env.DB.prepare("UPDATE orders SET status='expired' WHERE id=? AND status='pending'").bind(o.client_reference_id).run();
  }
  await env.DB.prepare('INSERT OR IGNORE INTO events(id,ts) VALUES(?,?)').bind(ev.id, Date.now()).run();
  return json({ ok: true });
};
