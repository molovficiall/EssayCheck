import type { Env, PagesFunction } from '../lib/types';
import { authenticate } from '../lib/auth';
import { audit } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { withSecurityHeaders } from '../lib/headers';
import { rateLimit } from '../lib/ratelimit';

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    await authenticate(context.request, context.env);
    await rateLimit(context.request, context.env, 'admin', 30, 60);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    try {
      await audit(
        context.request,
        context.env,
        'unknown',
        error.status === 429 ? 'rate_limit' : 'auth.failure',
        'page',
        'catalog',
        'denied',
      );
    } catch (auditError) {
      console.error('Audit write failed', auditError);
    }
    return withSecurityHeaders(
      new Response(error.status === 429 ? 'Too many requests' : 'Not found', {
        status: error.status === 429 ? 429 : 404,
      }),
      {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    );
  }
  const response = await context.next();
  return withSecurityHeaders(response, {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
};
