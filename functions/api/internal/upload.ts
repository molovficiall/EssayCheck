import { HttpError, allow, audit, json, type Ctx } from '../../_lib';

const MAX = 5 * 1024 * 1024;
function sniff(b: Uint8Array): { ext: string; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: 'webp', type: 'image/webp' };
  return null;
}

export const onRequest: PagesFunction = async (c) => {
  const { request, env, data } = c as unknown as Ctx;
  allow(request, ['POST']);
  if (Number(request.headers.get('content-length') || 0) > MAX) throw new HttpError(413, 'Image over 5 MB');
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > MAX) throw new HttpError(413, 'Image over 5 MB');
  const kind = sniff(buf); // trust magic bytes, never the client's MIME or filename
  if (!kind) throw new HttpError(415, 'Use JPEG, PNG or WebP');
  const key = `${crypto.randomUUID()}.${kind.ext}`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: kind.type } });
  await audit(env, data.actor!, 'media.upload', key);
  return json({ key });
};
