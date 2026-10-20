import { HttpError } from './errors';

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return mismatch === 0;
}

export async function csrfToken(
  subject: string,
  secret: string,
): Promise<string> {
  if (secret.length < 32)
    throw new HttpError(503, 'CSRF protection is not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(subject),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyCsrf(
  request: Request,
  subject: string,
  secret: string,
): Promise<void> {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin !== new URL(request.url).origin || fetchSite !== 'same-origin') {
    throw new HttpError(404, 'Not found');
  }
  const expected = await csrfToken(subject, secret);
  const actual = request.headers.get('x-csrf-token') ?? '';
  if (!constantTimeEqual(actual, expected))
    throw new HttpError(404, 'Not found');
}
