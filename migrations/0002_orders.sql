CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
    checkout_key TEXT UNIQUE,
    status TEXT NOT NULL CHECK(status IN ('pending','paid','expired','refunded','failed')),
    email TEXT,
    amount_total_cents INTEGER,
    currency TEXT NOT NULL,
    shipping_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    name_snapshot TEXT NOT NULL,
    color_snapshot TEXT NOT NULL,
    size_snapshot TEXT NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    qty INTEGER NOT NULL
);

CREATE TABLE stripe_events (
    event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    processed_at INTEGER NOT NULL
);

CREATE INDEX idx_orders_stripe_session ON orders(stripe_session_id);
