CREATE TABLE IF NOT EXISTS api_credentials (
  service         TEXT PRIMARY KEY,
  credentials     BYTEA NOT NULL,
  iv              BYTEA NOT NULL,
  last_tested     TIMESTAMPTZ,
  is_valid        BOOLEAN,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
