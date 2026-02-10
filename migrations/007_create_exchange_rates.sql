CREATE TABLE IF NOT EXISTS exchange_rates (
  id              SERIAL PRIMARY KEY,
  from_currency   TEXT NOT NULL DEFAULT 'USD',
  to_currency     TEXT NOT NULL DEFAULT 'GBP',
  rate            NUMERIC(10,6) NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_latest
  ON exchange_rates (from_currency, to_currency, fetched_at DESC);
