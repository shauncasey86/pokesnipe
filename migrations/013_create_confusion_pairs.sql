-- Tracks known incorrect match patterns so the matcher can penalise
-- candidates that previously led to wrong matches.
--
-- When a reviewer marks a deal as incorrect (wrong_card / wrong_set),
-- a row is inserted here recording the signals that produced the bad match.
-- During candidate scoring the matcher checks this table and applies a
-- confidence penalty to candidates that match a known confusion pattern.
CREATE TABLE IF NOT EXISTS confusion_pairs (
  id                SERIAL PRIMARY KEY,
  card_number_norm  TEXT NOT NULL,              -- normalized card number from the listing
  wrong_card_id     TEXT NOT NULL               -- card_id that was incorrectly matched
                    REFERENCES cards(scrydex_card_id),
  correct_card_id   TEXT                        -- card_id reviewer said was correct (optional)
                    REFERENCES cards(scrydex_card_id),
  reason            TEXT NOT NULL,              -- incorrect_reason from review
  deal_id           UUID REFERENCES deals(deal_id),
  ebay_title        TEXT,                       -- original listing title for diagnostics
  signals           JSONB,                      -- snapshot of confidence signals at match time
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup index: the matcher queries by (card_number_norm, wrong_card_id)
CREATE INDEX IF NOT EXISTS idx_confusion_card_number
  ON confusion_pairs (card_number_norm, wrong_card_id);

-- Allow querying by correct_card_id for correction pairs
CREATE INDEX IF NOT EXISTS idx_confusion_correct_card
  ON confusion_pairs (correct_card_id) WHERE correct_card_id IS NOT NULL;

-- Add optional correct_card_id to deals table for reviewer corrections
ALTER TABLE deals ADD COLUMN IF NOT EXISTS correct_card_id TEXT REFERENCES cards(scrydex_card_id);
