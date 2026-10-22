import { errorResponse, json } from './_lib.js';

export async function onRequest(context) {
  try {
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://images.unsplash.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests");
    if (new URL(context.request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
