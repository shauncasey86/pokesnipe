CREATE TABLE IF NOT EXISTS preferences (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data            JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
