CREATE TABLE IF NOT EXISTS variants (
  id              SERIAL PRIMARY KEY,
  card_id         TEXT NOT NULL REFERENCES cards(scrydex_card_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  image_small     TEXT,
  image_medium    TEXT,
  image_large     TEXT,
  prices          JSONB NOT NULL DEFAULT '{}',
  graded_prices   JSONB DEFAULT '{}',
  trends          JSONB DEFAULT '{}',
  last_price_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, name)
);

CREATE INDEX IF NOT EXISTS idx_variants_card ON variants (card_id);
CREATE INDEX IF NOT EXISTS idx_variants_prices ON variants USING GIN (prices);
