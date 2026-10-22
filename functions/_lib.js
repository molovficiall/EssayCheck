const ALLOWED_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SESSION_TTL = 4 * 60 * 60 * 1000;
const RATE_WINDOW = 15 * 60 * 1000;
const STARTER_PRODUCTS = [
  { id: 'essential-tee', name: 'The Essential Tee', description: 'A considered everyday layer in substantial, soft cotton.', price: 4800, category: 'Tees', sizes: ['XS', 'S', 'M', 'L', 'XL'], featured: true, image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=85' },
  { id: 'studio-tee', name: 'Studio Heavyweight', description: 'A relaxed silhouette with a little more weight and a lot more character.', price: 6200, category: 'Tees', sizes: ['XS', 'S', 'M', 'L', 'XL'], featured: true, image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1000&q=85' },
  { id: 'everyday-long-sleeve', name: 'Everyday Long Sleeve', description: 'An easy, polished layer for cooler mornings and late evenings.', price: 6800, category: 'Long sleeves', sizes: ['XS', 'S', 'M', 'L', 'XL'], featured: false, image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1000&q=85' },
  { id: 'weekend-tee', name: 'Weekend Tee', description: 'Clean lines, an easy fit, and the kind of comfort you reach for first.', price: 5200, category: 'Tees', sizes: ['XS', 'S', 'M', 'L', 'XL'], featured: false, image: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?auto=format&fit=crop&w=1000&q=85' }
];

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

export function errorResponse(error) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error('Pages Function request failed:', error);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

export function requireBindings(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new ApiError(503, `Cloudflare binding is not configured: ${missing.join(', ')}.`);
}

export async function readJson(request, maxBytes = 20 * 1024) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'Send a JSON request.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new ApiError(413, 'Request body is too large.');
  const text = new TextDecoder().decode(await readBodyBytes(request, maxBytes));
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Request body is not valid JSON.');
  }
}

export async function readBodyBytes(request, maxBytes) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      reader.cancel().catch((error) => console.error('Request body cancellation failed:', error));
      throw new ApiError(413, 'Request body is too large.');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function ensureSeeded(env) {
  requireBindings(env, ['DB']);
  const statements = STARTER_PRODUCTS.map((product) => env.DB.prepare(
    'INSERT OR IGNORE INTO products (id, name, description, price, category, sizes, featured, image, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(product.id, product.name, product.description, product.price, product.category, JSON.stringify(product.sizes), Number(product.featured), product.image, Date.now()));
  statements.push(
    env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('featuredTitle', 'Selected for you'),
    env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('featuredColor', '#dceefa')
  );
  await env.DB.batch(statements);
}

function toPublicProduct(row) {
  let sizes;
  try {
    sizes = JSON.parse(row.sizes);
  } catch {
    sizes = [];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    category: row.category,
    sizes: Array.isArray(sizes) ? sizes.filter((size) => ALLOWED_SIZES.includes(size)) : [],
    featured: Boolean(row.featured),
    image: row.image
  };
}

export async function listProducts(env) {
  await ensureSeeded(env);
  const result = await env.DB.prepare('SELECT id, name, description, price, category, sizes, featured, image FROM products ORDER BY created_at DESC, id')
    .all();
  return result.results.map(toPublicProduct);
}

export async function getSettings(env) {
  await ensureSeeded(env);
  const result = await env.DB.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)')
    .bind('featuredTitle', 'featuredColor').all();
  const settings = Object.fromEntries(result.results.map((row) => [row.key, row.value]));
  return { featuredTitle: settings.featuredTitle || 'Selected for you', featuredColor: settings.featuredColor || '#dceefa' };
}

function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function digestHex(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function constantTimeStringEqual(left, right) {
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)), crypto.subtle.digest('SHA-256', new TextEncoder().encode(right))]);
  const first = new Uint8Array(a);
  const second = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first[index] ^ second[index];
  return difference === 0;
}

function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const segment of cookie.split(';')) {
    const separator = segment.indexOf('=');
    if (separator >= 0 && segment.slice(0, separator).trim() === name) return segment.slice(separator + 1).trim();
  }
  return '';
}

function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `shop.sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function createAdminSession(request, env, password) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) throw new ApiError(503, 'Admin password is not configured safely.');
  if (!await constantTimeStringEqual(password, env.ADMIN_PASSWORD)) throw new ApiError(401, 'That password was not accepted.');
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = Date.now() + SESSION_TTL;
  await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO admin_sessions (token_hash, csrf_token, expires_at) VALUES (?, ?, ?)')
    .bind(await digestHex(token), csrfToken, expiresAt).run();
  return json({ authenticated: true, csrfToken }, 200, { 'Set-Cookie': sessionCookie(request, token, SESSION_TTL / 1000) });
}

export async function currentAdmin(request, env) {
  const token = cookieValue(request, 'shop.sid');
  if (!token || token.length > 128) return null;
  const tokenHash = await digestHex(token);
  const row = await env.DB.prepare('SELECT token_hash, csrf_token, expires_at FROM admin_sessions WHERE token_hash = ?')
    .bind(tokenHash).first();
  if (!row || row.expires_at <= Date.now()) {
    if (row) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return { tokenHash, csrfToken: row.csrf_token };
}

export async function requireAdmin(request, env, requireCsrf = false) {
  requireBindings(env, ['DB']);
  const session = await currentAdmin(request, env);
  if (!session) throw new ApiError(401, 'Admin sign-in required.');
  if (requireCsrf) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'Request origin not allowed.');
    if (!await constantTimeStringEqual(request.headers.get('x-csrf-token') || '', session.csrfToken)) {
      throw new ApiError(403, 'Request verification failed. Refresh and try again.');
    }
  }
  return session;
}

export async function destroyAdminSession(request, env, session) {
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(session.tokenHash).run();
  return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
}

export async function enforceRateLimit(request, env, bucket, limit) {
  requireBindings(env, ['DB']);
  if (!env.IP_SALT || env.IP_SALT.length < 32) throw new ApiError(503, 'IP_SALT must be configured with at least 32 characters.');
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = await digestHex(`${env.IP_SALT}:${ip}`);
  const windowStart = Math.floor(Date.now() / RATE_WINDOW) * RATE_WINDOW;
  await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(windowStart - 24 * 60 * 60 * 1000).run();
  await env.DB.prepare(`
    INSERT INTO rate_limits (bucket, ip_hash, window_start, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(bucket, ip_hash) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
      window_start = excluded.window_start
  `).bind(bucket, ipHash, windowStart).run();
  const row = await env.DB.prepare('SELECT count FROM rate_limits WHERE bucket = ? AND ip_hash = ?')
    .bind(bucket, ipHash).first();
  if (row && row.count > limit) throw new ApiError(429, 'Too many requests. Please wait and try again.');
}

export function validateProduct(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const price = Number(body.price);
  const suppliedSizes = typeof body.sizes === 'string' ? body.sizes.split(',') : [];
  const sizes = [...new Set(suppliedSizes.map((size) => size.trim().toUpperCase()).filter(Boolean))];
  if (!name || name.length > 80) throw new ApiError(400, 'Name must be between 1 and 80 characters.');
  if (!description || description.length > 500) throw new ApiError(400, 'Description must be between 1 and 500 characters.');
  if (!category || category.length > 40) throw new ApiError(400, 'Category must be between 1 and 40 characters.');
  if (!Number.isFinite(price) || price < 0.01 || price > 10000) throw new ApiError(400, 'Price must be between $0.01 and $10,000.');
  if (!sizes.length || sizes.length > ALLOWED_SIZES.length || sizes.some((size) => !ALLOWED_SIZES.includes(size))) {
    throw new ApiError(400, `Choose one or more valid sizes: ${ALLOWED_SIZES.join(', ')}.`);
  }
  return { name, description, category, price: Math.round(price * 100), sizes, featured: body.featured === 'true' };
}

export async function readProductForm(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 5 * 1024 * 1024 + 64 * 1024) throw new ApiError(413, 'Image upload failed. Use an image under 5 MB.');
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new ApiError(415, 'Send a multipart product form.');
  }
  const formBytes = await readBodyBytes(request, 5 * 1024 * 1024 + 64 * 1024);
  let form;
  try {
    form = await new Response(formBytes, { headers: { 'Content-Type': contentType } }).formData();
  } catch {
    throw new ApiError(400, 'Product form could not be read.');
  }
  const fields = Object.fromEntries(['name', 'description', 'category', 'price', 'sizes', 'featured'].map((key) => [key, String(form.get(key) || '')]));
  const product = validateProduct(fields);
  const image = form.get('image');
  if (!(image instanceof File) || !image.size) return { product, image: null };
  if (image.size > 5 * 1024 * 1024) throw new ApiError(413, 'Image upload failed. Use an image under 5 MB.');
  const bytes = new Uint8Array(await image.arrayBuffer());
  const type = image.type;
  const validJpeg = type === 'image/jpeg' && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  const validPng = type === 'image/png' && bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const validWebp = type === 'image/webp' && bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!validJpeg && !validPng && !validWebp) throw new ApiError(400, 'Upload a valid JPEG, PNG, or WebP image.');
  const extension = type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp';
  return { product, image: { key: `${crypto.randomUUID()}.${extension}`, bytes, type } };
}

export async function saveImage(env, image) {
  requireBindings(env, ['MEDIA']);
  await env.MEDIA.put(image.key, image.bytes, { httpMetadata: { contentType: image.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return `/api/images/${image.key}`;
}

export async function deleteImage(env, imageUrl) {
  const match = /^\/api\/images\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/i.exec(imageUrl || '');
  if (match && env.MEDIA) await env.MEDIA.delete(match[1]);
}

export async function stripeRequest(env, endpoint, options = {}) {
  if (!env.STRIPE_SECRET_KEY || !/^sk_(test|live)_/.test(env.STRIPE_SECRET_KEY)) {
    throw new ApiError(503, 'Stripe is not configured. Set STRIPE_SECRET_KEY in Pages settings.');
  }
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...options.headers }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('Stripe API request failed:', response.status, data?.error?.type || 'unknown error');
    throw new ApiError(502, 'Secure checkout is temporarily unavailable. Please try again.');
  }
  return data;
}

export function getSiteUrl(request, env) {
  const configured = env.SITE_URL || new URL(request.url).origin;
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new ApiError(503, 'SITE_URL must be a valid site origin.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new ApiError(503, 'SITE_URL must be an HTTP(S) origin without a path.');
  }
  if (new URL(request.url).protocol === 'https:' && url.protocol !== 'https:') {
    throw new ApiError(503, 'SITE_URL must use HTTPS for secure storefront requests.');
  }
  return url.origin;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function hexBytes(hex) {
  if (typeof hex !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
}

export async function verifyStripeSignature(body, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const fields = signatureHeader.split(',').map((part) => part.split('=', 2));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bodyBytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const signed = new Uint8Array([...new TextEncoder().encode(`${timestamp}.`), ...bodyBytes]);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));
  return signatures.some((signature) => {
    const supplied = hexBytes(signature);
    if (!supplied || supplied.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ supplied[index];
    return difference === 0;
  });
}
