CREATE TABLE IF NOT EXISTS deals (
  deal_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          BIGSERIAL,
  ebay_item_id      TEXT NOT NULL UNIQUE,
  ebay_title        TEXT NOT NULL,
  card_id           TEXT REFERENCES cards(scrydex_card_id),
  variant_id        INTEGER REFERENCES variants(id),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'expired', 'sold', 'reviewed')),
  ebay_price_gbp    NUMERIC(10,2) NOT NULL,
  ebay_shipping_gbp NUMERIC(10,2) NOT NULL DEFAULT 0,
  buyer_prot_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost_gbp    NUMERIC(10,2) NOT NULL,
  market_price_usd  NUMERIC(10,2),
  market_price_gbp  NUMERIC(10,2),
  exchange_rate     NUMERIC(10,6),
  profit_gbp        NUMERIC(10,2),
  profit_percent    NUMERIC(6,2),
  tier              TEXT CHECK (tier IN ('GRAIL', 'HIT', 'FLIP', 'SLEEP')),
  confidence        NUMERIC(4,3),
  confidence_tier   TEXT CHECK (confidence_tier IN ('high', 'medium', 'low')),
  condition         TEXT CHECK (condition IN ('NM', 'LP', 'MP', 'HP', 'DM')),
  condition_source  TEXT,
  is_graded         BOOLEAN NOT NULL DEFAULT FALSE,
  grading_company   TEXT,
  grade             TEXT,
  liquidity_score   NUMERIC(4,3),
  liquidity_grade   TEXT CHECK (liquidity_grade IN ('high', 'medium', 'low', 'illiquid')),
  trend_7d          NUMERIC(6,2),
  trend_30d         NUMERIC(6,2),
  match_signals     JSONB NOT NULL,
  ebay_image_url    TEXT,
  ebay_url          TEXT NOT NULL,
  seller_name       TEXT,
  seller_feedback   INTEGER,
  listed_at         TIMESTAMPTZ,
  reviewed_at       TIMESTAMPTZ,
  is_correct_match  BOOLEAN,
  incorrect_reason  TEXT,
  condition_comps   JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '72 hours'
);

CREATE INDEX IF NOT EXISTS idx_deals_created ON deals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_event ON deals (event_id DESC);
CREATE INDEX IF NOT EXISTS idx_deals_tier ON deals (tier);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals (status);
CREATE INDEX IF NOT EXISTS idx_deals_card ON deals (card_id);
CREATE INDEX IF NOT EXISTS idx_deals_expires ON deals (expires_at) WHERE status = 'active';
