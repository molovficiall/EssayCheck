import { describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { authenticate } from '../functions/lib/auth';
import { csrfToken, verifyCsrf } from '../functions/lib/csrf';
import type { Env } from '../functions/lib/types';

async function accessRequest(claims: {
  email: string;
  audience?: string;
  expires?: number;
  tokenText?: boolean;
}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const kid = crypto.randomUUID();
  const jwk = await exportJWK(publicKey);
  const keySet = { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] };
  const team = `team-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const token = claims.tokenText
    ? 'invalid.jwt.assertion'
    : await new SignJWT({ email: claims.email })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(`https://${team}.cloudflareaccess.com`)
        .setAudience(claims.audience ?? 'catalog-audience')
        .setSubject('access-subject-1')
        .setIssuedAt(now)
        .setExpirationTime(claims.expires ?? now + 300)
        .sign(privateKey);
  return {
    request: new Request('https://shop.example/api/internal/session', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }),
    env: {
      ACCESS_TEAM_DOMAIN: team,
      ACCESS_AUD: 'catalog-audience',
      ADMIN_EMAILS: 'store@example.com',
    } as Env,
    keyResolver: createLocalJWKSet(keySet),
  };
}

describe('Cloudflare Access authentication', () => {
  it('rejects missing, invalid, expired, wrong-audience, and non-allowlisted assertions', async () => {
    const env = {
      ACCESS_TEAM_DOMAIN: 'team',
      ACCESS_AUD: 'audience',
      ADMIN_EMAILS: 'store@example.com',
    } as Env;
    await expect(
      authenticate(
        new Request('https://shop.example/api/internal/session'),
        env,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const invalid = await accessRequest({
      email: 'store@example.com',
      tokenText: true,
    });
    await expect(
      authenticate(invalid.request, invalid.env, invalid.keyResolver),
    ).rejects.toMatchObject({ status: 404 });

    const expired = await accessRequest({
      email: 'store@example.com',
      expires: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(
      authenticate(expired.request, expired.env, expired.keyResolver),
    ).rejects.toMatchObject({ status: 404 });

    const wrongAudience = await accessRequest({
      email: 'store@example.com',
      audience: 'different-audience',
    });
    await expect(
      authenticate(
        wrongAudience.request,
        wrongAudience.env,
        wrongAudience.keyResolver,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const notAllowed = await accessRequest({ email: 'stranger@example.com' });
    await expect(
      authenticate(notAllowed.request, notAllowed.env, notAllowed.keyResolver),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('accepts a valid signed assertion for an allowlisted email', async () => {
    const input = await accessRequest({ email: 'STORE@example.com' });
    await expect(
      authenticate(input.request, input.env, input.keyResolver),
    ).resolves.toEqual({
      email: 'store@example.com',
      subject: 'access-subject-1',
    });
  });
});

describe('CSRF verification', () => {
  const secret = 'a-high-entropy-test-secret-which-is-more-than-32-chars';
  const subject = 'access-subject-1';

  it('accepts the matching token on a same-origin state-changing request', async () => {
    const token = await csrfToken(subject, secret);
    const request = new Request('https://shop.example/api/internal/products', {
      method: 'POST',
      headers: {
        Origin: 'https://shop.example',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': token,
      },
    });
    await expect(verifyCsrf(request, subject, secret)).resolves.toBeUndefined();
  });

  it('rejects missing tokens and cross-origin requests', async () => {
    const missing = new Request('https://shop.example/api/internal/products', {
      method: 'POST',
      headers: {
        Origin: 'https://shop.example',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    await expect(verifyCsrf(missing, subject, secret)).rejects.toMatchObject({
      status: 404,
    });
    const crossOrigin = new Request(
      'https://shop.example/api/internal/products',
      {
        method: 'POST',
        headers: {
          Origin: 'https://attacker.example',
          'Sec-Fetch-Site': 'cross-site',
          'X-CSRF-Token': await csrfToken(subject, secret),
        },
      },
    );
    await expect(
      verifyCsrf(crossOrigin, subject, secret),
    ).rejects.toMatchObject({ status: 404 });
  });
});
