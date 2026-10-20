PRAGMA foreign_keys = ON;

CREATE TABLE products (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    base_price_cents INTEGER NOT NULL CHECK(base_price_cents >= 50),
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),
    release_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE product_colors (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    hex TEXT NOT NULL CHECK(length(hex)=7),
    sort INTEGER NOT NULL
);

CREATE TABLE product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id TEXT NOT NULL REFERENCES product_colors(id) ON DELETE CASCADE,
    size TEXT NOT NULL,
    sku TEXT UNIQUE,
    price_override_cents INTEGER,
    stock INTEGER NOT NULL CHECK(stock >= 0),
    UNIQUE(product_id,color_id,size)
);

CREATE TABLE product_images (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    r2_key TEXT NOT NULL,
    alt TEXT NOT NULL,
    color_id TEXT REFERENCES product_colors(id) ON DELETE SET NULL,
    sort INTEGER NOT NULL,
    content_type TEXT NOT NULL
);

CREATE INDEX idx_products_status_release ON products(status, release_at);
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_images_product_sort ON product_images(product_id, sort);

CREATE TRIGGER prevent_negative_stock
BEFORE UPDATE OF stock ON product_variants
WHEN NEW.stock < 0
BEGIN
    SELECT RAISE(ABORT, 'insufficient stock');
END;
