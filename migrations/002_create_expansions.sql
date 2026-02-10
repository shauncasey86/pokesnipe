CREATE TABLE IF NOT EXISTS expansions (
  scrydex_id      TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  series          TEXT NOT NULL,
  printed_total   INTEGER NOT NULL,
  total           INTEGER NOT NULL,
  release_date    DATE NOT NULL,
  language_code   TEXT NOT NULL DEFAULT 'EN',
  logo_url        TEXT,
  symbol_url      TEXT,
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expansions_release ON expansions (release_date DESC);
CREATE INDEX IF NOT EXISTS idx_expansions_code ON expansions (code);
CREATE INDEX IF NOT EXISTS idx_expansions_name_trgm ON expansions USING GIN (name gin_trgm_ops);
