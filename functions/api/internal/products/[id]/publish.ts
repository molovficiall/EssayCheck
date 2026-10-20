import type { Env, PagesFunction } from '../../../../lib/types';
import { adminIdentity, logAdmin } from '../../../../lib/admin';
import {
  HttpError,
  json,
  readJson,
  requireMethod,
} from '../../../../lib/errors';
import { z } from 'zod';
import { parse } from '../../../../lib/validate';

const stateSchema = z
  .object({ status: z.enum(['draft', 'published']) })
  .strict();

export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  requireMethod(request, ['POST']);
  const identity = await adminIdentity(request, env, true);
  const { status } = parse(stateSchema, await readJson(request));
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Not found');
  if (status === 'published') {
    const ready = await env.DB.prepare(
      `SELECT
      (SELECT COUNT(*) FROM product_images WHERE product_id=p.id) AS images,
      (SELECT COUNT(*) FROM product_variants WHERE product_id=p.id AND stock > 0) AS stock
      FROM products p WHERE p.id=?`,
    )
      .bind(id)
      .first<{ images: number; stock: number }>();
    if (!ready || ready.images < 1 || ready.stock < 1)
      throw new HttpError(
        422,
        'Publishing requires an image and at least one in-stock variant',
      );
  }
  const result = await env.DB.prepare(
    'UPDATE products SET status=?, updated_at=? WHERE id=?',
  )
    .bind(status, Math.floor(Date.now() / 1000), id)
    .run();
  if (!result.meta.changes) throw new HttpError(404, 'Not found');
  await logAdmin(
    request,
    env,
    identity.email,
    `product.${status}`,
    'product',
    id,
  );
  return json({ status });
};
