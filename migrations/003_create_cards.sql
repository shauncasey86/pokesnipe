CREATE TABLE IF NOT EXISTS cards (
  scrydex_card_id   TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  number            TEXT NOT NULL,
  number_normalized TEXT NOT NULL,
  expansion_id      TEXT NOT NULL REFERENCES expansions(scrydex_id),
  expansion_name    TEXT NOT NULL,
  expansion_code    TEXT NOT NULL,
  printed_total     INTEGER NOT NULL,
  rarity            TEXT,
  supertype         TEXT,
  subtypes          TEXT[] DEFAULT '{}',
  artist            TEXT,
  image_small       TEXT,
  image_medium      TEXT,
  image_large       TEXT,
  market_price_usd  NUMERIC(10,2),
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_number_norm ON cards (number_normalized);
CREATE INDEX IF NOT EXISTS idx_cards_number_printed ON cards (number_normalized, printed_total);
CREATE INDEX IF NOT EXISTS idx_cards_expansion ON cards (expansion_id);
CREATE INDEX IF NOT EXISTS idx_cards_number_expansion ON cards (number, expansion_id);
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm ON cards USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards (rarity);
CREATE INDEX IF NOT EXISTS idx_cards_supertype ON cards (supertype);
CREATE INDEX IF NOT EXISTS idx_cards_market_price ON cards (market_price_usd DESC NULLS LAST);
