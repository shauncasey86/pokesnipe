-- Stores learned confidence weight overrides from the feedback calibration loop.
-- Only one active row at a time (latest calibration result).
-- The confidence scorer falls back to spec defaults if no rows exist.
CREATE TABLE IF NOT EXISTS weight_overrides (
  id              SERIAL PRIMARY KEY,
  weights         JSONB NOT NULL,           -- { name: 0.32, denominator: 0.23, ... }
  baseline_weights JSONB NOT NULL,          -- Spec defaults at time of calibration
  sample_size     INTEGER NOT NULL,         -- Number of reviewed deals used
  accuracy_before NUMERIC(5,2),             -- Accuracy % with old weights
  accuracy_after  NUMERIC(5,2),             -- Accuracy % with new weights
  calibrated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB                     -- Signal-level stats, deltas, etc.
);

CREATE INDEX IF NOT EXISTS idx_weight_overrides_latest ON weight_overrides (calibrated_at DESC);
