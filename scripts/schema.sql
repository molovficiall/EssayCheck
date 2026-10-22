CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 50),
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
  images TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  hex TEXT NOT NULL,
  size TEXT NOT NULL,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  UNIQUE (product_id, color, size)
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  session_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','expired','review')),
  email TEXT,
  total_cents INTEGER,
  items TEXT NOT NULL,
  shipping TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
  actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT
);
CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, w INTEGER NOT NULL, n INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
