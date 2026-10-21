import { z } from 'zod';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface Env {
  DB: D1Database; MEDIA: R2Bucket;
  SITE_URL: string; CURRENCY: string; SHIP_COUNTRIES: string; AUTOMATIC_TAX: string;
  STRIPE_SECRET_KEY: string; STRIPE_WEBHOOK_SECRET: string;
  ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string; ADMIN_EMAILS: string;
  IP_SALT: string; DEV_BYPASS_AUTH?: string;
}
export type Ctx = EventContext<Env, string, { actor?: string }>;

export class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export const allow = (req: Request, methods: string[]) => {
  if (!methods.includes(req.method)) throw new HttpError(405, 'Method not allowed');
};

/** Reads a JSON body with a hard size cap and strict content-type (A03/A04). */
export async function readJson<T extends z.ZodTypeAny>(req: Request, schema: T, max = 65536): Promise<z.infer<T>> {
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) throw new HttpError(415, 'JSON required');
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) throw new HttpError(413, 'Too large');
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'Too large');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, 'Invalid input: ' + r.error.issues.map(i => i.path.join('.') + ' ' + i.message).slice(0, 3).join('; '));
  return r.data;
}

// ---------- schemas ----------
export const MEDIA_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
export const ProductIn = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(2000),
  price_cents: z.number().int().min(50).max(1_000_000),
  status: z.enum(['draft', 'published', 'archived']),
  images: z.array(z.object({ key: z.string().regex(MEDIA_KEY), alt: z.string().trim().min(1).max(140) }).strict()).max(8),
  variants: z.array(z.object({
    color: z.string().trim().min(1).max(30),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    size: z.string().regex(/^[A-Za-z0-9 .\-]{1,10}$/),
    stock: z.number().int().min(0).max(100000),
  }).strict()).min(1).max(120),
}).strict();
export const CheckoutIn = z.object({
  lines: z.array(z.object({ vid: z.string().uuid(), qty: z.number().int().min(1).max(10) }).strict()).min(1).max(25),
}).strict();

// ---------- rate limit (fixed window in D1) ----------
export async function rateLimit(env: Env, req: Request, bucket: string, limit: number, windowSec = 60) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const w = Math.floor(Date.now() / 1000 / windowSec);
  const k = `${bucket}:${await sha256(ip + env.IP_SALT)}`;
  const row = await env.DB.prepare(
    'INSERT INTO rl(k,w,n) VALUES(?1,?2,1) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN w=?2 THEN n+1 ELSE 1 END, w=?2 RETURNING n'
  ).bind(k, w).first<{ n: number }>();
  if (row && row.n > limit) throw new HttpError(429, 'Too many requests');
}

export async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let r = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) r |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return r === 0;
}

export const audit = (env: Env, actor: string, action: string, target = '') =>
  env.DB.prepare('INSERT INTO audit(ts,actor,action,target) VALUES(?,?,?,?)').bind(Date.now(), actor, action, target).run();

// ---------- admin auth: Cloudflare Access JWT (A01/A07) ----------
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function authAdmin(req: Request, env: Env): Promise<string | null> {
  const host = new URL(req.url).hostname;
  if (env.DEV_BYPASS_AUTH === '1' && (host === 'localhost' || host === '127.0.0.1')) return 'dev@localhost';
  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  try {
    jwks ??= createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`, audience: env.ACCESS_AUD, algorithms: ['RS256'],
    });
    const email = String(payload.email || '').toLowerCase();
    const admins = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    return email && admins.includes(email) ? email : null;
  } catch { return null; }
}

/** CSRF defence for cookie-authenticated admin writes: same-origin Origin + custom header (forces CORS preflight). */
export function csrfOk(req: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.get('Origin');
  return origin === new URL(req.url).origin && req.headers.get('X-Idek') === '1';
}

// ---------- Stripe (fetch only; no SDK) ----------
export function form(obj: Record<string, string | number | boolean>) {
  return new URLSearchParams(Object.entries(obj).map(([k, v]): [string, string] => [k, String(v)])).toString();
}
export async function stripe(env: Env, path: string, body: Record<string, string | number | boolean>, idem: string) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idem,
    },
    body: form(body),
  });
  if (!r.ok) { console.error('stripe', r.status, await r.text()); throw new HttpError(502, 'Payment provider error'); }
  return r.json() as Promise<any>;
}

/** Verifies Stripe-Signature (HMAC-SHA256, 5 min tolerance, constant-time compare) (A08). */
export async function verifyStripe(body: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(p => p.split('='));
  const t = parts.find(p => p[0] === 't')?.[1];
  const sigs = parts.filter(p => p[0] === 'v1').map(p => p[1]);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return sigs.some(s => safeEqual(s, hex));
}

// ---------- catalog ----------
export async function loadProducts(env: Env, where: string, bind: unknown[] = []) {
  const ps = (await env.DB.prepare(`SELECT * FROM products ${where} ORDER BY created_at DESC`).bind(...bind).all<any>()).results;
  if (!ps.length) return [];
  const vs = (await env.DB.prepare('SELECT * FROM variants ORDER BY rowid').all<any>()).results;
  return ps.map(p => ({ ...p, images: JSON.parse(p.images), variants: vs.filter(v => v.product_id === p.id) }));
}
