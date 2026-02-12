-- Tracks listings reported as junk/fake/fan art via the review UI.
--
-- Two learning mechanisms:
-- 1. Learned keywords: novel tokens (not in the card catalog) extracted from
--    junk listing titles. Used as a soft confidence penalty on future scans.
-- 2. Seller reputation: sellers with multiple junk reports receive a confidence
--    penalty proportional to their report count.
CREATE TABLE IF NOT EXISTS junk_reports (
  id              SERIAL PRIMARY KEY,
  deal_id         UUID NOT NULL REFERENCES deals(deal_id),
  ebay_item_id    TEXT NOT NULL,
  ebay_title      TEXT NOT NULL,
  seller_name     TEXT,
  learned_tokens  TEXT[] NOT NULL DEFAULT '{}',   -- novel tokens extracted from title
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by seller for reputation scoring
CREATE INDEX IF NOT EXISTS idx_junk_reports_seller
  ON junk_reports (seller_name) WHERE seller_name IS NOT NULL;

-- Prevent duplicate reports for the same deal
CREATE UNIQUE INDEX IF NOT EXISTS idx_junk_reports_deal
  ON junk_reports (deal_id);
