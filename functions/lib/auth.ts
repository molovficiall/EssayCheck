import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import type { Env, AuthenticatedData } from './types';
import { HttpError } from './errors';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authenticate(
  request: Request,
  env: Env,
  testKeyResolver?: JWTVerifyGetKey,
): Promise<AuthenticatedData> {
  const team = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!team || !audience || !token) throw new HttpError(404, 'Not found');
  const issuer = `https://${team}.cloudflareaccess.com`;
  let keyResolver = testKeyResolver;
  if (!keyResolver) {
    let jwks = jwksCache.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksCache.set(issuer, jwks);
    }
    keyResolver = jwks;
  }
  try {
    const { payload } = await jwtVerify(token, keyResolver, {
      issuer,
      audience,
      algorithms: ['RS256'],
    });
    const email =
      typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    const allowed = (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (!email || !allowed.includes(email) || typeof payload.sub !== 'string')
      throw new Error('Unauthorized');
    return { email, subject: payload.sub };
  } catch {
    throw new HttpError(404, 'Not found');
  }
}
