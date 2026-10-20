import { describe, expect, it } from 'vitest';
import { validStripeSignature } from '../functions/lib/stripe';

async function signature(body: string, secret: string, time: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${time}.${body}`),
  );
  const digest = [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `t=${time},v1=${digest}`;
}

describe('Stripe signatures', () => {
  it('verifies a fresh valid signature and rejects tampering and old timestamps', async () => {
    const body = '{"id":"evt_test"}';
    const now = Math.floor(Date.now() / 1000);
    const valid = await signature(body, 'whsec_test', now);
    expect(await validStripeSignature(body, valid, 'whsec_test', now)).toBe(
      true,
    );
    expect(
      await validStripeSignature(`${body} `, valid, 'whsec_test', now),
    ).toBe(false);
    const old = await signature(body, 'whsec_test', now - 301);
    expect(await validStripeSignature(body, old, 'whsec_test', now)).toBe(
      false,
    );
  });
});
