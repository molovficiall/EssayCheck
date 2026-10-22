const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const multer = require('multer');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const { rateLimit } = require('express-rate-limit');

const app = express();
const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const dataDirectory = path.join(__dirname, 'data');
const uploadDirectory = path.join(__dirname, 'uploads');
const productsPath = path.join(dataDirectory, 'products.json');
const settingsPath = path.join(dataDirectory, 'settings.json');
const orderNotificationsPath = path.join(dataDirectory, 'order-notifications.json');
const production = process.env.NODE_ENV === 'production';
const allowedSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

if (production) app.set('trust proxy', 1);
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12 || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('Set an ADMIN_PASSWORD of at least 12 characters and a SESSION_SECRET of at least 32 characters.');
}
if (production && new URL(baseUrl).protocol !== 'https:') {
  throw new Error('BASE_URL must use HTTPS in production.');
}
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Set STRIPE_SECRET_KEY to a Stripe test or live secret key.');
}
const smtpPort = Number(process.env.SMTP_PORT || 587);
if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.SMTP_HOST || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535 ||
    !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM || !process.env.ORDER_NOTIFICATION_EMAIL) {
  throw new Error('Set STRIPE_WEBHOOK_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, and ORDER_NOTIFICATION_EMAIL.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort !== 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
fs.mkdirSync(dataDirectory, { recursive: true });
fs.mkdirSync(uploadDirectory, { recursive: true });

const starterProducts = [
  { id: 'essential-tee', name: 'The Essential Tee', description: 'A considered everyday layer in substantial, soft cotton.', price: 4800, category: 'Tees', sizes: ['XS', 'S', 'M', 'L', 'XL'], featured: true, image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=85' },
  { id: 'studio-tee', name: 'Studio Heavyweight', description: 'A relaxed silhouette with a little more weight and a lot more character.', price: 6200, category: 'Tees', sizes: ['XS', 'S', 'M', 'L', 'XL'], featured: true, image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1000&q=85' },
  { id: 'everyday-long-sleeve', name: 'Everyday Long Sleeve', description: 'An easy, polished layer for cooler mornings and late evenings.', price: 6800, category: 'Long sleeves', sizes: ['XS', 'S', 'M', 'L', 'XL'], featured: false, image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=1000&q=85' },
  { id: 'weekend-tee', name: 'Weekend Tee', description: 'Clean lines, an easy fit, and the kind of comfort you reach for first.', price: 5200, category: 'Tees', sizes: ['XS', 'S', 'M', 'L', 'XL'], featured: false, image: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?auto=format&fit=crop&w=1000&q=85' }
];

if (!fs.existsSync(productsPath)) fs.writeFileSync(productsPath, JSON.stringify(starterProducts, null, 2));
if (!fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath, JSON.stringify({ featuredTitle: 'Selected for you', featuredColor: '#dceefa' }, null, 2));

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
const notificationLocks = new Map();
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

async function notifyPaidOrder(sessionId, eventId) {
  const existingLock = notificationLocks.get(sessionId);
  if (existingLock) return existingLock;
  const notification = (async () => {
    const notifications = readJson(orderNotificationsPath, {});
    if (notifications[sessionId]?.status === 'sent') return;

    const checkout = await stripe.checkout.sessions.retrieve(sessionId);
    if (checkout.mode !== 'payment' || checkout.payment_status !== 'paid' ||
        !checkout.metadata || checkout.metadata.shop !== 'atelier-shirt-shop') return;

    const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    const currency = (checkout.currency || 'usd').toUpperCase();
    const formatAmount = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((amount || 0) / 100);
    const orderLines = items.data.map((item) => `${item.description || 'Item'} × ${item.quantity} — ${formatAmount(item.amount_total)}`);
    const orderNumber = checkout.id;
    const text = [
      'A shirt shop order has been paid.',
      '',
      `Order: ${orderNumber}`,
      `Total: ${formatAmount(checkout.amount_total)}`,
      `Customer email: ${checkout.customer_details?.email || 'Not provided'}`,
      '',
      'Items:',
      ...orderLines
    ].join('\n');
    const html = `<h2>Paid order received</h2><p><strong>Order:</strong> ${escapeHtml(orderNumber)}</p><p><strong>Total:</strong> ${escapeHtml(formatAmount(checkout.amount_total))}</p><p><strong>Customer email:</strong> ${escapeHtml(checkout.customer_details?.email || 'Not provided')}</p><h3>Items</h3><ul>${items.data.map((item) => `<li>${escapeHtml(item.description || 'Item')} × ${item.quantity} — ${escapeHtml(formatAmount(item.amount_total))}</li>`).join('')}</ul>`;

    notifications[sessionId] = { status: 'pending', eventId, updatedAt: new Date().toISOString() };
    writeJson(orderNotificationsPath, notifications);
    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.ORDER_NOTIFICATION_EMAIL,
        subject: `Paid order received — ${orderNumber}`,
        text,
        html
      });
      notifications[sessionId] = { status: 'sent', eventId, updatedAt: new Date().toISOString() };
      writeJson(orderNotificationsPath, notifications);
    } catch (error) {
      notifications[sessionId] = { status: 'failed', eventId, updatedAt: new Date().toISOString() };
      writeJson(orderNotificationsPath, notifications);
      throw error;
    }
  })();
  notificationLocks.set(sessionId, notification);
  try {
    await notification;
  } finally {
    notificationLocks.delete(sessionId);
  }
}

app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('Invalid webhook signature.');
  }

  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return res.json({ received: true });
  }
  try {
    await notifyPaidOrder(event.data.object.id, event.id);
    res.json({ received: true });
  } catch (error) {
    console.error('Paid-order email notification failed:', error);
    res.status(500).json({ error: 'Order notification failed. Stripe can retry this webhook.' });
  }
});

if (production) {
  app.use((req, res, next) => {
    if (!req.secure) return res.status(400).send('HTTPS is required.');
    next();
  });
}
app.use(express.json({ limit: '20kb' }));
app.use(session({
  name: 'shop.sid',
  secret: process.env.SESSION_SECRET,
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDirectory, table: 'sessions' }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 4
  }
}));
app.get(['/', '/index.html', '/gallery.html', '/item.html', '/cart.html', '/checkout.html', '/privacy.html', '/terms.html'], (req, res) => {
  const filename = req.path === '/' ? 'index.html' : req.path.slice(1);
  res.sendFile(path.join(__dirname, filename));
});
app.get(['/styles.css', '/app.js', '/social.js'], (req, res) => res.sendFile(path.join(__dirname, path.basename(req.path))));
app.use('/uploads', express.static(uploadDirectory, {
  dotfiles: 'deny',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const imageTypes = {
  'image/jpeg': { extension: '.jpg', signature: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9 },
  'image/png': { extension: '.png', signature: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: '.webp', signature: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!Object.hasOwn(imageTypes, file.mimetype)) return callback(new Error('Upload a JPEG, PNG, or WebP image.'));
    callback(null, true);
  }
});

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function writeJson(file, data) {
  const temporaryPath = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryPath, file);
}

function publicProduct(product) {
  const { id, name, description, price, category, featured, image } = product;
  const sizes = Array.isArray(product.sizes) ? product.sizes.filter((size) => allowedSizes.includes(size)) : ['XS', 'S', 'M', 'L', 'XL'];
  return { id, name, description, price, category, sizes: sizes.length ? sizes : ['XS', 'S', 'M', 'L', 'XL'], featured, image };
}

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: 'Admin sign-in required.' });
  next();
}

function requireCsrf(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin !== new URL(baseUrl).origin) return res.status(403).json({ error: 'Request origin not allowed.' });
  const supplied = req.get('x-csrf-token') || '';
  const expected = req.session.csrfToken || '';
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (!expected || suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(403).json({ error: 'Request verification failed. Refresh and try again.' });
  }
  next();
}

function validateProduct(body) {
  body = body && typeof body === 'object' ? body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const price = Number(body.price);
  const suppliedSizes = Array.isArray(body.sizes) ? body.sizes : typeof body.sizes === 'string' ? body.sizes.split(',') : [];
  const sizes = [...new Set(suppliedSizes.map((size) => String(size).trim().toUpperCase()).filter(Boolean))];
  if (!name || name.length > 80) throw new Error('Name must be between 1 and 80 characters.');
  if (!description || description.length > 500) throw new Error('Description must be between 1 and 500 characters.');
  if (!category || category.length > 40) throw new Error('Category must be between 1 and 40 characters.');
  if (!Number.isFinite(price) || price < 1 || price > 10000) throw new Error('Price must be between $0.01 and $10,000.');
  if (!sizes.length || sizes.length > allowedSizes.length || sizes.some((size) => !allowedSizes.includes(size))) {
    throw new Error(`Choose one or more valid sizes: ${allowedSizes.join(', ')}.`);
  }
  return { name, description, category, price: Math.round(price * 100), sizes, featured: body.featured === 'true' || body.featured === true };
}

async function saveUploadedImage(file) {
  if (!file) return null;
  const type = imageTypes[file.mimetype];
  if (!type || !type.signature(file.buffer)) throw new Error('Upload a valid JPEG, PNG, or WebP image.');
  const filename = `${crypto.randomUUID()}${type.extension}`;
  fs.writeFileSync(path.join(uploadDirectory, filename), file.buffer, { flag: 'wx' });
  return `/uploads/${filename}`;
}

app.get('/api/products', (_req, res) => res.json(readJson(productsPath, []).map(publicProduct)));
app.get('/api/settings', (_req, res) => res.json(readJson(settingsPath, { featuredTitle: 'Selected for you', featuredColor: '#dceefa' })));

app.post('/api/checkout', checkoutLimiter, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
      return res.status(400).json({ error: 'Your cart is empty or contains too many items.' });
    }
    const products = readJson(productsPath, []);
    const quantities = new Map();
    body.items.forEach((item) => {
      if (!item || typeof item.id !== 'string' || typeof item.size !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
        throw new Error('Cart item is invalid.');
      }
      const product = products.find((candidate) => candidate.id === item.id);
      const productSizeList = product && Array.isArray(product.sizes) ? product.sizes : ['XS', 'S', 'M', 'L', 'XL'];
      if (!product || !productSizeList.includes(item.size)) throw new Error('A product size in your cart is no longer available.');
      const key = `${item.id}\u0000${item.size}`;
      const quantity = (quantities.get(key)?.quantity || 0) + item.quantity;
      if (quantity > 10) throw new Error('A product cannot be ordered more than 10 times at once.');
      quantities.set(key, { id: item.id, size: item.size, quantity });
    });
    const lineItems = Array.from(quantities.values(), ({ id, size, quantity }) => {
      const product = products.find((candidate) => candidate.id === id);
      return {
        quantity,
        price_data: {
          currency: 'usd',
          unit_amount: product.price,
          product_data: { name: `${product.name} — Size ${size}`, description: product.description }
        }
      };
    });
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'usd' },
          display_name: 'Standard shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 7 }
          }
        }
      }],
      metadata: { shop: 'atelier-shirt-shop' },
      success_url: `${baseUrl}/checkout.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart.html?cancelled=1`
    });
    res.json({ url: checkout.url });
  } catch (error) {
    if (error instanceof Error && !error.type) return res.status(400).json({ error: error.message });
    next(error);
  }
});

app.get('/api/checkout/verify', checkoutLimiter, async (req, res, next) => {
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return res.status(400).json({ error: 'Checkout session is invalid.' });
  try {
    const checkout = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({ paid: checkout.payment_status === 'paid' && checkout.metadata && checkout.metadata.shop === 'atelier-shirt-shop' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', loginLimiter, (req, res, next) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const password = typeof body.password === 'string' ? body.password : '';
  const submitted = Buffer.from(password);
  const expected = Buffer.from(process.env.ADMIN_PASSWORD);
  if (submitted.length !== expected.length || !crypto.timingSafeEqual(submitted, expected)) {
    return res.status(401).json({ error: 'That password was not accepted.' });
  }
  req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.admin = true;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    res.json({ authenticated: true, csrfToken: req.session.csrfToken });
  });
});

app.get('/api/admin/session', (req, res) => res.json({
  authenticated: Boolean(req.session.admin),
  csrfToken: req.session.admin ? req.session.csrfToken : null
}));

app.post('/api/admin/logout', requireAdmin, requireCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('shop.sid', { httpOnly: true, sameSite: 'strict', secure: production });
    res.json({ authenticated: false });
  });
});

app.post('/api/admin/products', requireAdmin, requireCsrf, upload.single('image'), async (req, res, next) => {
  let imagePath;
  try {
    const product = validateProduct(req.body);
    imagePath = await saveUploadedImage(req.file);
    if (!imagePath) throw new Error('Choose a product image to upload.');
    product.id = crypto.randomUUID();
    product.image = imagePath;
    const products = readJson(productsPath, []);
    products.push(product);
    writeJson(productsPath, products);
    res.status(201).json(publicProduct(product));
  } catch (error) {
    if (imagePath) fs.rmSync(path.join(uploadDirectory, path.basename(imagePath)), { force: true });
    if (error instanceof Error && !error.type) return res.status(400).json({ error: error.message });
    next(error);
  }
});

app.put('/api/admin/products/:id', requireAdmin, requireCsrf, upload.single('image'), async (req, res, next) => {
  let imagePath;
  try {
    const updates = validateProduct(req.body);
    imagePath = await saveUploadedImage(req.file);
    const products = readJson(productsPath, []);
    const index = products.findIndex((product) => product.id === req.params.id);
    if (index < 0) throw new Error('Product not found.');
    const previousImage = products[index].image;
    products[index] = { ...products[index], ...updates, image: imagePath || previousImage };
    writeJson(productsPath, products);
    if (imagePath && previousImage.startsWith('/uploads/')) fs.rmSync(path.join(uploadDirectory, path.basename(previousImage)), { force: true });
    res.json(publicProduct(products[index]));
  } catch (error) {
    if (imagePath) fs.rmSync(path.join(uploadDirectory, path.basename(imagePath)), { force: true });
    if (error instanceof Error && !error.type) return res.status(error.message === 'Product not found.' ? 404 : 400).json({ error: error.message });
    next(error);
  }
});

app.delete('/api/admin/products/:id', requireAdmin, requireCsrf, (req, res) => {
  const products = readJson(productsPath, []);
  const product = products.find((candidate) => candidate.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  writeJson(productsPath, products.filter((candidate) => candidate.id !== req.params.id));
  if (product.image.startsWith('/uploads/')) fs.rmSync(path.join(uploadDirectory, path.basename(product.image)), { force: true });
  res.json({ removed: true });
});

app.put('/api/admin/settings', requireAdmin, requireCsrf, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const featuredTitle = typeof body.featuredTitle === 'string' ? body.featuredTitle.trim() : '';
  const featuredColor = typeof body.featuredColor === 'string' ? body.featuredColor : '';
  if (!featuredTitle || featuredTitle.length > 60 || !/^#[0-9a-fA-F]{6}$/.test(featuredColor)) {
    return res.status(400).json({ error: 'Enter a section name (up to 60 characters) and a valid hex color.' });
  }
  const settings = { featuredTitle, featuredColor };
  writeJson(settingsPath, settings);
  res.json(settings);
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Image upload failed. Use an image under 5 MB.' });
  if (error.message === 'Upload a JPEG, PNG, or WebP image.') return res.status(400).json({ error: error.message });
  if (error.status === 400) return res.status(400).json({ error: 'Request could not be processed.' });
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, () => console.log(`Shirt shop ready at ${baseUrl}`));
