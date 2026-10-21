import { allow, json, loadProducts, type Ctx } from '../_lib';

export const onRequest: PagesFunction = async (c) => {
  const { request, env } = c as unknown as Ctx;
  allow(request, ['GET']);
  const list = await loadProducts(env, "WHERE status='published'");
  const out = list.map(({ status, created_at, updated_at, ...p }) => ({
    ...p,
    variants: p.variants.map((v: any) => ({ id: v.id, color: v.color, hex: v.hex, size: v.size, stock: Math.min(v.stock, 10) })),
  }));
  const r = json({ currency: env.CURRENCY.toUpperCase(), products: out });
  r.headers.set('Cache-Control', 'public, max-age=15');
  return r;
};
