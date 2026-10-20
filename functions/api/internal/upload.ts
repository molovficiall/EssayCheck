import type { Env, PagesFunction } from '../../lib/types';
import { adminIdentity, logAdmin } from '../../lib/admin';
import { HttpError, json, requireMethod } from '../../lib/errors';
import { z } from 'zod';
import { validateImageUpload } from '../../lib/media';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  requireMethod(request, ['POST']);
  const identity = await adminIdentity(request, env, true);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
    throw new HttpError(415, 'Expected image upload');
  const form = await request.formData();
  let hasUnknownField = false;
  form.forEach((_value, key) => {
    if (key !== 'file') hasUnknownField = true;
  });
  if (hasUnknownField || form.getAll('file').length !== 1)
    throw new HttpError(400, 'Invalid upload fields');
  const file = z.instanceof(File).safeParse(form.get('file'));
  if (!file.success) throw new HttpError(400, 'Image file required');
  const upload = file.data;
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const verified = validateImageUpload(upload.type, bytes, upload.size);
  const key = `${crypto.randomUUID()}.${verified.extension}`;
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: verified.contentType },
  });
  await logAdmin(request, env, identity.email, 'media.upload', 'media', key);
  return json({ key, contentType: verified.contentType }, 201);
};
