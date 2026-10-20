import type { Env } from './types';
import { HttpError } from './errors';

export async function rateLimit(
  request: Request,
  env: Env,
  name: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const key = `${name}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  if (env.RATE_KV) {
    const count = Number((await env.RATE_KV.get(key)) ?? '0');
    if (count >= limit) throw new HttpError(429, 'Too many requests');
    await env.RATE_KV.put(key, String(count + 1), {
      expirationTtl: windowSeconds,
    });
    return;
  }
  await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END`,
  )
    .bind(key, now, now - windowSeconds, now - windowSeconds)
    .run();
  const row = await env.DB.prepare(
    'SELECT count FROM rate_limits WHERE key = ?',
  )
    .bind(key)
    .first<{ count: number }>();
  if ((row?.count ?? limit + 1) > limit)
    throw new HttpError(429, 'Too many requests');
}
