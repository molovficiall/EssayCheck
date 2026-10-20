import type { Env } from './types';
import { HttpError } from './errors';

const STRIPE_API = 'https://api.stripe.com';

export async function stripeRequest(
  env: Env,
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY)
    throw new HttpError(503, 'Payments are not configured');
  if (!/^\/v1\/[a-zA-Z0-9_/?=&%-]+$/.test(path))
    throw new HttpError(500, 'Invalid Stripe API path');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${env.STRIPE_SECRET_KEY}`);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  return fetch(`${STRIPE_API}${path}`, { ...init, headers });
}

export async function validStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const parts = signatureHeader.split(',').map((part) => part.split('='));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value ?? '');
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300)
    return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return signatures.some((candidate) => {
    let mismatch = candidate.length ^ expected.length;
    for (
      let index = 0;
      index < Math.max(candidate.length, expected.length);
      index++
    )
      mismatch |=
        (candidate.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
    return mismatch === 0;
  });
}
