import type { Env, PagesFunction } from '../../lib/types';
import { HttpError, requireMethod } from '../../lib/errors';
import { z } from 'zod';

const keySchema = z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/);

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  requireMethod(request, ['GET']);
  const parsed = keySchema.safeParse(params.key);
  if (!parsed.success) throw new HttpError(404, 'Not found');
  const key = parsed.data;
  const image = await env.MEDIA.get(key);
  if (!image) throw new HttpError(404, 'Not found');
  const type = image.httpMetadata?.contentType;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type ?? ''))
    throw new HttpError(404, 'Not found');
  return new Response(image.body, {
    headers: {
      'Content-Type': type!,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
