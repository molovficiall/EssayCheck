import { HttpError, MEDIA_KEY, type Ctx } from '../../_lib';

export const onRequest: PagesFunction = async (c) => {
  const { request, env, params } = c as unknown as Ctx;
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  const key = String(params.key);
  if (!MEDIA_KEY.test(key)) throw new HttpError(404, 'Not found');
  const obj = await env.MEDIA.get(key);
  if (!obj) throw new HttpError(404, 'Not found');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    },
  });
};
