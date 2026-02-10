CREATE TABLE IF NOT EXISTS sync_log (
  id              SERIAL PRIMARY KEY,
  sync_type       TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running',
  expansions_synced INTEGER DEFAULT 0,
  cards_upserted    INTEGER DEFAULT 0,
  variants_upserted INTEGER DEFAULT 0,
  credits_used      INTEGER DEFAULT 0,
  error_message     TEXT,
  metadata          JSONB
);
