CREATE TABLE IF NOT EXISTS sales_velocity_cache (
  card_id         TEXT NOT NULL REFERENCES cards(scrydex_card_id),
  variant_name    TEXT NOT NULL,
  sales_7d        INTEGER NOT NULL DEFAULT 0,
  sales_30d       INTEGER NOT NULL DEFAULT 0,
  median_price    NUMERIC(10,2),
  avg_days_between_sales NUMERIC(6,2),
  raw_listings    JSONB,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (card_id, variant_name)
);
