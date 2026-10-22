import { HttpError, ProductIn, allow, audit, json, loadProducts, readJson, type Ctx } from '../../_lib';

async function save(c: Ctx, id: string | null) {
  const { request, env } = c;
  const p = await readJson(request, ProductIn, 131072);
  const now = Date.now();
  const pid = id ?? crypto.randomUUID();
  const stmts: D1PreparedStatement[] = [];
  if (id) {
    stmts.push(env.DB.prepare('UPDATE products SET slug=?,name=?,description=?,price_cents=?,status=?,images=?,updated_at=? WHERE id=?')
      .bind(p.slug, p.name, p.description, p.price_cents, p.status, JSON.stringify(p.images), now, id));
  } else {
    stmts.push(env.DB.prepare('INSERT INTO products(id,slug,name,description,price_cents,status,images,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(pid, p.slug, p.name, p.description, p.price_cents, p.status, JSON.stringify(p.images), now, now));
  }
  // upsert by (product,color,size) so variant IDs stay stable for carts already in the wild
  for (const v of p.variants) {
    stmts.push(env.DB.prepare(
      'INSERT INTO variants(id,product_id,color,hex,size,stock) VALUES(?,?,?,?,?,?) ON CONFLICT(product_id,color,size) DO UPDATE SET hex=excluded.hex, stock=excluded.stock')
      .bind(crypto.randomUUID(), pid, v.color, v.hex, v.size, v.stock));
  }
  try { await env.DB.batch(stmts); } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'Slug already in use');
    throw e;
  }
  // remove variants no longer present
  const all = (await env.DB.prepare('SELECT id,color,size FROM variants WHERE product_id=?').bind(pid).all<any>()).results;
  const drop = all.filter(r => !p.variants.some(v => v.color === r.color && v.size === r.size));
  if (drop.length) await env.DB.batch(drop.map(r => env.DB.prepare('DELETE FROM variants WHERE id=?').bind(r.id)));
  await audit(env, c.data.actor!, id ? 'product.update' : 'product.create', pid);
  return json({ id: pid });
}

export const onRequest: PagesFunction = async (c) => {
  const ctx = c as unknown as Ctx;
  const { request, env } = ctx;
  allow(request, ['GET', 'POST', 'PUT', 'DELETE']);
  const id = new URL(request.url).searchParams.get('id');
  if (id !== null && !/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Bad id');
  if (request.method === 'GET') return json(await loadProducts(env, '', []));
  if (request.method === 'POST') return save(ctx, null);
  if (!id) throw new HttpError(400, 'id required');
  if (request.method === 'PUT') return save(ctx, id);
  await env.DB.prepare("UPDATE products SET status='archived', updated_at=? WHERE id=?").bind(Date.now(), id).run();
  await audit(env, ctx.data.actor!, 'product.archive', id);
  return json({ ok: true });
};
