import type { Env, PagesFunction } from '../../lib/types';
import { csrfToken } from '../../lib/csrf';
import { HttpError, json, requireMethod } from '../../lib/errors';
import { adminIdentity } from '../../lib/admin';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  requireMethod(request, ['GET']);
  if (!env.CSRF_SECRET || env.CSRF_SECRET.length < 32)
    throw new HttpError(503, 'Admin security is not configured');
  const identity = await adminIdentity(request, env);
  return json({
    email: identity.email,
    csrfToken: await csrfToken(identity.subject, env.CSRF_SECRET ?? ''),
  });
};
