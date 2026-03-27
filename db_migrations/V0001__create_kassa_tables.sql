CREATE TABLE IF NOT EXISTS t_p33261395_self_service_kassa.products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  price INTEGER NOT NULL,
  category VARCHAR(100) NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📦',
  barcode VARCHAR(50) UNIQUE NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p33261395_self_service_kassa.transactions (
  id SERIAL PRIMARY KEY,
  total INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p33261395_self_service_kassa.transaction_items (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES t_p33261395_self_service_kassa.transactions(id),
  product_id INTEGER NOT NULL REFERENCES t_p33261395_self_service_kassa.products(id),
  product_name VARCHAR(200) NOT NULL,
  product_price INTEGER NOT NULL,
  product_emoji TEXT NOT NULL DEFAULT '📦',
  qty INTEGER NOT NULL DEFAULT 1
);
