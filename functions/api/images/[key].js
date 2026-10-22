import { ApiError, requireBindings } from '../../_lib.js';

export async function onRequestGet({ env, params }) {
  requireBindings(env, ['MEDIA']);
  const key = params.key;
  if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(key)) throw new ApiError(404, 'Image not found.');
  const object = await env.MEDIA.get(key);
  if (!object) throw new ApiError(404, 'Image not found.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}
