import type { Env, PagesFunction } from './lib/types';
import { withSecurityHeaders } from './lib/headers';
import { errorResponse } from './lib/errors';

const CSP =
  "default-src 'none'; script-src 'self' 'sha256-YpRMMFhihbXkPqZFO1THVpTWEKbt7Rfp9e0mYxtXnrs='; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; form-action 'self' https://checkout.stripe.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests";

export const onRequest: PagesFunction<Env> = async (context) => {
  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await context.next();
  } catch (error) {
    response = errorResponse(error, requestId);
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Request-ID', requestId);
  return withSecurityHeaders(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
};
