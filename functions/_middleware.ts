import { HttpError, authAdmin, csrfOk, type Ctx } from './_lib';

const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
  "font-src 'self'", "connect-src 'self'", "manifest-src 'self'",
  "form-action 'self' https://checkout.stripe.com", "base-uri 'none'", "object-src 'none'",
  "frame-ancestors 'none'", 'upgrade-insecure-requests',
].join('; ');

function harden(res: Response, noStore: boolean, admin: boolean) {
  const r = new Response(res.body, res);
  r.headers.set('Content-Security-Policy', CSP);
  r.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  r.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  r.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (noStore) r.headers.set('Cache-Control', 'no-store');
  if (admin) r.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return r;
}

export const onRequest: PagesFunction = async (c) => {
  const ctx = c as unknown as Ctx;
  const { pathname } = new URL(ctx.request.url);
  const admin = /^\/(api\/)?internal(\/|$)/.test(pathname);
  const api = pathname.startsWith('/api/');
  try {
    if (admin) {
      const actor = await authAdmin(ctx.request, ctx.env);
      if (!actor) return harden(new Response('Not found', { status: 404 }), true, true); // don't reveal the route
      if (!csrfOk(ctx.request)) throw new HttpError(403, 'Forbidden');
      ctx.data.actor = actor;
    }
    return harden(await ctx.next(), admin || (api && !pathname.startsWith('/api/media/')), admin);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error('unhandled', e);
    const msg = e instanceof HttpError ? e.message : 'Server error';
    return harden(new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } }), true, admin);
  }
};
