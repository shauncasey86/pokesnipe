// src/services/database/postgres.ts
import { Pool, PoolClient, QueryResult, PoolConfig, QueryResultRow } from 'pg';
import { logger } from '../../utils/logger.js';

let pool: Pool | null = null;

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

function getPoolConfig(): PoolConfig | null {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (connectionString) {
    return {
      connectionString,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: parseInt(process.env.PG_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  if (process.env.PGHOST || process.env.PG_HOST) {
    return {
      host: process.env.PGHOST || process.env.PG_HOST,
      port: parseInt(process.env.PGPORT || process.env.PG_PORT || '5432', 10),
      database: process.env.PGDATABASE || process.env.PG_DATABASE || 'pokesnipe',
      user: process.env.PGUSER || process.env.PG_USER,
      password: process.env.PGPASSWORD || process.env.PG_PASSWORD,
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.PG_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  return null;
}

export async function initializePool(): Promise<boolean> {
  const config = getPoolConfig();

  if (!config) {
    logger.info('DATABASE_INIT', {
      mode: 'none',
      reason: 'No PostgreSQL configuration found (DATABASE_URL or PG_HOST not set)'
    });
    return false;
  }

  try {
    pool = new Pool(config);

    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('DATABASE_CONNECTED', {
      host: config.connectionString ? '[connection-string]' : config.host,
      database: config.database || '[from-connection-string]',
      maxConnections: config.max,
    });

    pool.on('error', (err) => {
      logger.error('DATABASE_POOL_ERROR', { error: err.message });
    });

    return true;
  } catch (err) {
    logger.error('DATABASE_INIT_ERROR', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    pool = null;
    return false;
  }
}

export function getPool(): Pool | null {
  return pool;
}

export function isConnected(): boolean {
  return pool !== null;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool.query<T>(text, params);
}

export async function getClient(): Promise<PoolClient> {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool.connect();
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('DATABASE_DISCONNECTED');
  }
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY,
  ebay_item_id VARCHAR(255) UNIQUE NOT NULL,
  ebay_url TEXT NOT NULL,
  affiliate_url TEXT,
  title TEXT NOT NULL,
  image_url TEXT,
  scrydex_image_url TEXT,
  card_id VARCHAR(255),
  card_name VARCHAR(255),
  card_number VARCHAR(50),
  expansion_id VARCHAR(255),
  expansion_name VARCHAR(255),
  expansion_logo TEXT,
  expansion_symbol TEXT,
  ebay_price_gbp DECIMAL(10, 2) NOT NULL,
  shipping_gbp DECIMAL(10, 2) DEFAULT 0,
  total_cost_gbp DECIMAL(10, 2) NOT NULL,
  market_value_usd DECIMAL(10, 2),
  market_value_gbp DECIMAL(10, 2),
  exchange_rate DECIMAL(10, 6),
  profit_gbp DECIMAL(10, 2),
  discount_percent DECIMAL(5, 2),
  tier VARCHAR(20) NOT NULL,
  is_graded BOOLEAN DEFAULT FALSE,
  grading_company VARCHAR(50),
  grade VARCHAR(20),
  raw_condition VARCHAR(20),
  detected_variant VARCHAR(100),
  ebay_condition VARCHAR(100),
  ebay_condition_id VARCHAR(20),
  condition_source VARCHAR(30),
  seller_name VARCHAR(255),
  seller_feedback INTEGER,
  seller_feedback_percent DECIMAL(5, 2),
  item_location VARCHAR(255),
  item_country VARCHAR(10),
  found_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  listing_time TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  match_confidence INTEGER,
  match_type VARCHAR(50),
  match_details JSONB,
  scrydex_card JSONB,
  all_prices JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_ebay_item_id ON deals(ebay_item_id);
CREATE INDEX IF NOT EXISTS idx_deals_tier ON deals(tier);
CREATE INDEX IF NOT EXISTS idx_deals_found_at ON deals(found_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_expires_at ON deals(expires_at);
CREATE INDEX IF NOT EXISTS idx_deals_discount ON deals(discount_percent DESC);
CREATE INDEX IF NOT EXISTS idx_deals_profit ON deals(profit_gbp DESC);
CREATE INDEX IF NOT EXISTS idx_deals_expansion ON deals(expansion_id);

CREATE TABLE IF NOT EXISTS scanner_stats (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  scans_completed INTEGER DEFAULT 0,
  listings_processed INTEGER DEFAULT 0,
  deals_found INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  premium_deals INTEGER DEFAULT 0,
  high_deals INTEGER DEFAULT 0,
  standard_deals INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_deals_updated_at ON deals;
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scanner_stats_updated_at ON scanner_stats;
CREATE TRIGGER update_scanner_stats_updated_at
  BEFORE UPDATE ON scanner_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Training corpus persistence
CREATE TABLE IF NOT EXISTS training_corpus (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  ebay_title TEXT NOT NULL,
  ebay_item_id VARCHAR(255),
  ebay_price DECIMAL(10, 2),
  parsed JSONB NOT NULL,
  capture_reason VARCHAR(50) NOT NULL,
  scrydex_matched BOOLEAN DEFAULT FALSE,
  scrydex_card_id VARCHAR(255),
  scrydex_card_name VARCHAR(255),
  expansion_matched VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  expected JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corpus_status ON training_corpus(status);
CREATE INDEX IF NOT EXISTS idx_corpus_reason ON training_corpus(capture_reason);
CREATE INDEX IF NOT EXISTS idx_corpus_timestamp ON training_corpus(timestamp DESC);

CREATE TABLE IF NOT EXISTS training_feedback (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  deal_id VARCHAR(255) NOT NULL,
  ebay_title TEXT NOT NULL,
  matched_card_name VARCHAR(255),
  matched_expansion VARCHAR(255),
  matched_card_number VARCHAR(50),
  confidence INTEGER,
  feedback_type VARCHAR(50) NOT NULL,
  wrong_match_reason VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add column if missing (for existing databases)
DO $$ BEGIN
  ALTER TABLE training_feedback ADD COLUMN IF NOT EXISTS wrong_match_reason VARCHAR(50);
EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_feedback_type ON training_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON training_feedback(timestamp DESC);

-- Set match failures tracking (for improving expansion matching)
CREATE TABLE IF NOT EXISTS set_match_failures (
  id SERIAL PRIMARY KEY,
  parsed_set_name VARCHAR(255) NOT NULL,
  card_number VARCHAR(50),
  promo_prefix VARCHAR(20),
  ebay_title TEXT,
  ebay_item_id VARCHAR(255),
  near_misses JSONB,  -- Array of {expansionId, expansionName, matchScore}
  hit_count INTEGER DEFAULT 1,
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_expansion_id VARCHAR(255),
  notes TEXT,
  UNIQUE(parsed_set_name, card_number)
);

CREATE INDEX IF NOT EXISTS idx_set_match_failures_count ON set_match_failures(hit_count DESC);
CREATE INDEX IF NOT EXISTS idx_set_match_failures_resolved ON set_match_failures(resolved);
CREATE INDEX IF NOT EXISTS idx_set_match_failures_set_name ON set_match_failures(parsed_set_name);

-- User preferences table (single user system)
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1,
  -- Deal filtering preferences
  min_discount_percent DECIMAL(5, 2) DEFAULT 20,
  show_graded_deals BOOLEAN DEFAULT TRUE,
  show_raw_deals BOOLEAN DEFAULT TRUE,
  preferred_grading_companies TEXT[] DEFAULT ARRAY['PSA', 'CGC', 'BGS'],
  min_grade DECIMAL(3, 1) DEFAULT 7,
  max_grade DECIMAL(3, 1) DEFAULT 10,
  show_premium_tier BOOLEAN DEFAULT TRUE,
  show_high_tier BOOLEAN DEFAULT TRUE,
  show_standard_tier BOOLEAN DEFAULT TRUE,
  -- Display preferences
  currency VARCHAR(10) DEFAULT 'GBP',
  enable_sounds BOOLEAN DEFAULT TRUE,
  compact_view BOOLEAN DEFAULT FALSE,
  -- Scanner preferences
  daily_credit_budget INTEGER DEFAULT 1500,
  operating_hours_start INTEGER DEFAULT 6,
  operating_hours_end INTEGER DEFAULT 23,
  auto_start_scanner BOOLEAN DEFAULT FALSE,
  -- Notification preferences
  desktop_notifications BOOLEAN DEFAULT TRUE,
  premium_deal_sound BOOLEAN DEFAULT TRUE,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Ensure only one row exists
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default preferences if not exists
INSERT INTO user_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`;

// Schema migrations for existing tables
// These run after CREATE TABLE IF NOT EXISTS to add any missing columns
const SCHEMA_MIGRATIONS = `
-- Add scrydex_image_url column if missing (added for card image display)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'scrydex_image_url'
  ) THEN
    ALTER TABLE deals ADD COLUMN scrydex_image_url TEXT;
    RAISE NOTICE 'Added scrydex_image_url column to deals table';
  END IF;
END $$;

-- Add raw_condition column if missing (added for condition tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'raw_condition'
  ) THEN
    ALTER TABLE deals ADD COLUMN raw_condition VARCHAR(20);
    RAISE NOTICE 'Added raw_condition column to deals table';
  END IF;
END $$;

-- Add detected_variant column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'detected_variant'
  ) THEN
    ALTER TABLE deals ADD COLUMN detected_variant VARCHAR(100);
    RAISE NOTICE 'Added detected_variant column to deals table';
  END IF;
END $$;

-- Add condition_source column if missing (tracks where condition was determined from)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'condition_source'
  ) THEN
    ALTER TABLE deals ADD COLUMN condition_source VARCHAR(30);
    RAISE NOTICE 'Added condition_source column to deals table';
  END IF;
END $$;

-- Add scanner_mode column to user_preferences if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'scanner_mode'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN scanner_mode VARCHAR(20) DEFAULT 'both';
    RAISE NOTICE 'Added scanner_mode column to user_preferences table';
  END IF;
END $$;

-- Add min_profit_gbp column to user_preferences if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'min_profit_gbp'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN min_profit_gbp DECIMAL(10, 2) DEFAULT 5;
    RAISE NOTICE 'Added min_profit_gbp column to user_preferences table';
  END IF;
END $$;

-- Add ungraded_conditions column to user_preferences if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'ungraded_conditions'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN ungraded_conditions TEXT[] DEFAULT ARRAY['NM', 'LP', 'MP'];
    RAISE NOTICE 'Added ungraded_conditions column to user_preferences table';
  END IF;
END $$;

-- Add tier threshold columns to user_preferences if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'tier_premium_value'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN tier_premium_value INTEGER DEFAULT 1000;
    RAISE NOTICE 'Added tier_premium_value column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'tier_premium_discount'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN tier_premium_discount INTEGER DEFAULT 10;
    RAISE NOTICE 'Added tier_premium_discount column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'tier_high_value'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN tier_high_value INTEGER DEFAULT 500;
    RAISE NOTICE 'Added tier_high_value column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'tier_high_discount'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN tier_high_discount INTEGER DEFAULT 15;
    RAISE NOTICE 'Added tier_high_discount column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'tier_standard_value'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN tier_standard_value INTEGER DEFAULT 0;
    RAISE NOTICE 'Added tier_standard_value column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'tier_standard_discount'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN tier_standard_discount INTEGER DEFAULT 20;
    RAISE NOTICE 'Added tier_standard_discount column to user_preferences table';
  END IF;
END $$;

-- Add search_type column for choosing between dynamic and custom search modes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'search_type'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN search_type VARCHAR(20) DEFAULT 'dynamic';
    RAISE NOTICE 'Added search_type column to user_preferences table';
  END IF;
END $$;

-- Add custom_search_terms JSONB column for storing user-defined search terms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'custom_search_terms'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN custom_search_terms JSONB DEFAULT '[]'::jsonb;
    RAISE NOTICE 'Added custom_search_terms column to user_preferences table';
  END IF;
END $$;

-- Telegram notification settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'telegram_enabled'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN telegram_enabled BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added telegram_enabled column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'telegram_bot_token'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN telegram_bot_token TEXT;
    RAISE NOTICE 'Added telegram_bot_token column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'telegram_chat_id'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN telegram_chat_id TEXT;
    RAISE NOTICE 'Added telegram_chat_id column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'telegram_min_profit'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN telegram_min_profit DECIMAL(10, 2) DEFAULT 0;
    RAISE NOTICE 'Added telegram_min_profit column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'telegram_min_discount'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN telegram_min_discount DECIMAL(5, 2) DEFAULT 0;
    RAISE NOTICE 'Added telegram_min_discount column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'telegram_alert_premium'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN telegram_alert_premium BOOLEAN DEFAULT TRUE;
    RAISE NOTICE 'Added telegram_alert_premium column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'telegram_alert_high'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN telegram_alert_high BOOLEAN DEFAULT TRUE;
    RAISE NOTICE 'Added telegram_alert_high column to user_preferences table';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'telegram_alert_standard'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN telegram_alert_standard BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added telegram_alert_standard column to user_preferences table';
  END IF;
END $$;
`;

export async function initializeSchema(): Promise<boolean> {
  if (!pool) {
    logger.warn('DATABASE_SCHEMA_SKIP', { reason: 'No database connection' });
    return false;
  }

  try {
    // Create tables if they don't exist
    await pool.query(SCHEMA_SQL);
    logger.info('DATABASE_SCHEMA_INITIALIZED');

    // Run migrations to add any missing columns to existing tables
    try {
      await pool.query(SCHEMA_MIGRATIONS);
      logger.info('DATABASE_MIGRATIONS_APPLIED');
    } catch (migrationErr) {
      // Log but don't fail - migrations are best-effort
      logger.warn('DATABASE_MIGRATION_WARNING', {
        error: migrationErr instanceof Error ? migrationErr.message : 'Unknown',
      });
    }

    return true;
  } catch (err) {
    logger.error('DATABASE_SCHEMA_ERROR', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return false;
  }
}