# Stage 1 Build Prompt — Foundation

> Paste this entire prompt into a fresh Claude Code session to build Stage 1.

---

## What you're building

**PokeSnipe** — a Pokémon card arbitrage scanner. It syncs card data from Scrydex (a pricing API), searches eBay for underpriced listings, and surfaces profitable deals in a dashboard.

This is **Stage 1 of 13**. You are building the foundation: project scaffolding, database migrations, config validation, health endpoint, and boot sequence. Nothing connects to external APIs yet — just the skeleton.

**Development workflow:** Code is written in Claude Code → pushed to GitHub → auto-deployed to Railway. There is no local dev environment beyond the Railway-provided PostgreSQL.

---

## Tech stack

- **Runtime:** Node.js 20, TypeScript
- **Framework:** Express
- **Database:** PostgreSQL 16 (Railway-hosted)
- **Migrations:** node-pg-migrate
- **Config:** Zod (validate env vars at startup)
- **Logging:** Pino + pino-pretty
- **Testing:** Vitest (pure function tests only) + live curl/psql verification

---

## Step 1: Initialize project

```bash
npm init -y
npm install express pg node-pg-migrate pino pino-pretty zod dotenv helmet cookie-parser
npm install -D typescript @types/express @types/node @types/pg vitest @types/cookie-parser tsx
npx tsc --init
```

Configure `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create `.gitignore`:
```
node_modules/
dist/
.env
```

---

## Step 2: Create folder structure

```
src/
├── config/
│   └── index.ts          ← Zod-validated AppConfig
├── db/
│   ├── pool.ts           ← PostgreSQL connection pool
│   └── migrate.ts        ← Migration runner wrapper
├── routes/
│   └── health.ts         ← GET /healthz
├── middleware/            ← (empty for now)
├── services/             ← (empty for now)
├── app.ts                ← Express app setup
└── server.ts             ← Boot sequence entry point
migrations/
├── 001_create_extensions.sql
├── 002_create_expansions.sql
├── 003_create_cards.sql
├── 004_create_variants.sql
├── 005_create_deals.sql
├── 006_create_velocity_cache.sql
├── 007_create_exchange_rates.sql
├── 008_create_preferences.sql
├── 009_create_api_credentials.sql
└── 010_create_sync_log.sql
```

---

## Step 3: Create `src/config/index.ts`

Define a Zod schema for every env var. Parse `process.env` through it at import time. If any required var is missing, Zod throws a clear error with the field name. Export the validated config object.

```typescript
// Required fields:
// DATABASE_URL (string, required)
// ACCESS_PASSWORD (string, required, min 8 chars)
// SESSION_SECRET (string, required, min 32 chars)
// SCRYDEX_API_KEY (string, required)
// SCRYDEX_TEAM_ID (string, required)
// EBAY_CLIENT_ID (string, required)
// EBAY_CLIENT_SECRET (string, required)
// EXCHANGE_RATE_API_KEY (string, required)
//
// Optional fields:
// TELEGRAM_BOT_TOKEN (string, optional)
// TELEGRAM_CHAT_ID (string, optional)
// NODE_ENV (default: 'development')
// PORT (default: 3000, coerce to number)
```

---

## Step 4: Create `src/db/pool.ts`

Create and export a `pg.Pool` using `config.DATABASE_URL`. Set `max: 10` connections. Add an error handler on the pool (`pool.on('error', ...)`) that logs with Pino but doesn't crash the process.

---

## Step 5: Create `src/db/migrate.ts`

A function that runs `node-pg-migrate` programmatically using the pool's connection string. Direction: `'up'`. Migrations directory: `./migrations`. Log output to Pino logger. Also export this as a standalone script so `npm run migrate` works.

---

## Step 6: Create migration SQL files

**IMPORTANT:** Use these exact schemas. Each migration must be idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

### `migrations/001_create_extensions.sql`
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
```

### `migrations/002_create_expansions.sql`
```sql
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
```

### `migrations/003_create_cards.sql`
```sql
CREATE TABLE IF NOT EXISTS cards (
  scrydex_card_id   TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  number            TEXT NOT NULL,
  number_normalized TEXT NOT NULL,
  expansion_id      TEXT NOT NULL REFERENCES expansions(scrydex_id),
  expansion_name    TEXT NOT NULL,
  expansion_code    TEXT NOT NULL,
  printed_total     INTEGER NOT NULL,
  rarity            TEXT,
  supertype         TEXT,
  subtypes          TEXT[] DEFAULT '{}',
  artist            TEXT,
  image_small       TEXT,
  image_medium      TEXT,
  image_large       TEXT,
  market_price_usd  NUMERIC(10,2),
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_number_norm ON cards (number_normalized);
CREATE INDEX IF NOT EXISTS idx_cards_number_printed ON cards (number_normalized, printed_total);
CREATE INDEX IF NOT EXISTS idx_cards_expansion ON cards (expansion_id);
CREATE INDEX IF NOT EXISTS idx_cards_number_expansion ON cards (number, expansion_id);
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm ON cards USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards (rarity);
CREATE INDEX IF NOT EXISTS idx_cards_supertype ON cards (supertype);
CREATE INDEX IF NOT EXISTS idx_cards_market_price ON cards (market_price_usd DESC NULLS LAST);
```

### `migrations/004_create_variants.sql`
```sql
CREATE TABLE IF NOT EXISTS variants (
  id              SERIAL PRIMARY KEY,
  card_id         TEXT NOT NULL REFERENCES cards(scrydex_card_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  image_small     TEXT,
  image_medium    TEXT,
  image_large     TEXT,
  prices          JSONB NOT NULL DEFAULT '{}',
  graded_prices   JSONB DEFAULT '{}',
  trends          JSONB DEFAULT '{}',
  last_price_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, name)
);

CREATE INDEX IF NOT EXISTS idx_variants_card ON variants (card_id);
CREATE INDEX IF NOT EXISTS idx_variants_prices ON variants USING GIN (prices);
```

**Prices JSONB structure** (for reference — you don't insert data yet, just create the column):
```json
{
  "raw": {
    "NM": { "low": 45.00, "market": 52.00 },
    "LP": { "low": 30.00, "market": 38.00 },
    "MP": { "low": 18.00, "market": 24.00 },
    "HP": { "low": 8.00,  "market": 12.00 }
  },
  "graded": {
    "PSA_10": { "low": 200.00, "market": 280.00 },
    "PSA_9":  { "low": 90.00,  "market": 120.00 }
  }
}
```

**Trends JSONB structure:**
```json
{
  "NM": {
    "1d":   { "price_change": 0.50, "percent_change": 1.2 },
    "7d":   { "price_change": 2.00, "percent_change": 4.8 },
    "30d":  { "price_change": 5.00, "percent_change": 12.1 },
    "90d":  { "price_change": 8.00, "percent_change": 20.0 },
    "180d": { "price_change": 12.00, "percent_change": 30.5 }
  }
}
```

### `migrations/005_create_deals.sql`
```sql
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
```

### `migrations/006_create_velocity_cache.sql`
```sql
CREATE TABLE IF NOT EXISTS sales_velocity_cache (
  card_id         TEXT NOT NULL REFERENCES cards(scrydex_card_id),
  variant_name    TEXT NOT NULL,
  sales_7d        INTEGER NOT NULL DEFAULT 0,
  sales_30d       INTEGER NOT NULL DEFAULT 0,
  median_price    NUMERIC(10,2),
  avg_days_between_sales NUMERIC(6,2),
  raw_listings    JSONB,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (card_id, variant_name)
);
```

### `migrations/007_create_exchange_rates.sql`
```sql
CREATE TABLE IF NOT EXISTS exchange_rates (
  id              SERIAL PRIMARY KEY,
  from_currency   TEXT NOT NULL DEFAULT 'USD',
  to_currency     TEXT NOT NULL DEFAULT 'GBP',
  rate            NUMERIC(10,6) NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_latest
  ON exchange_rates (from_currency, to_currency, fetched_at DESC);
```

### `migrations/008_create_preferences.sql`
```sql
CREATE TABLE IF NOT EXISTS preferences (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data            JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `migrations/009_create_api_credentials.sql`
```sql
CREATE TABLE IF NOT EXISTS api_credentials (
  service         TEXT PRIMARY KEY,
  credentials     BYTEA NOT NULL,
  iv              BYTEA NOT NULL,
  last_tested     TIMESTAMPTZ,
  is_valid        BOOLEAN,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `migrations/010_create_sync_log.sql`
```sql
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
```

---

## Step 7: Create `src/routes/health.ts`

Express router with `GET /healthz`:
- Query `SELECT 1` against the pool
- Success: return `{ status: 'ok', timestamp: new Date().toISOString() }` with 200
- Failure: return `{ status: 'error' }` with 503

---

## Step 8: Create `src/app.ts`

Set up Express app:
- `helmet()` for security headers
- `express.json()` for body parsing
- `cookie-parser()` for cookie parsing
- Pino HTTP logger middleware
- Mount health route at `/healthz`
- Export the app (don't listen here)

---

## Step 9: Create `src/server.ts`

Boot sequence:
```
Step 1: Import config (Zod validates env vars — crashes here if invalid)
Step 2: Connect to DB pool (test with SELECT 1)
Step 3: Run migrations
Step 4: Start Express on config.PORT
Step 5: Log "Server ready on port XXXX"
```

Wrap everything in a try/catch. If any step fails, log the error and `process.exit(1)`.

---

## Step 10: Add npm scripts to `package.json`

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "tsx src/db/migrate.ts"
  }
}
```

---

## Step 11: Create `.env` file (gitignored)

```
DATABASE_URL=postgresql://...          # Your Railway PostgreSQL URL
ACCESS_PASSWORD=changeme123            # Any 8+ char password
SESSION_SECRET=change-this-to-a-real-32-char-secret!!
SCRYDEX_API_KEY=your-key
SCRYDEX_TEAM_ID=your-team
EBAY_CLIENT_ID=your-client-id
EBAY_CLIENT_SECRET=your-secret
EXCHANGE_RATE_API_KEY=your-key
```

---

## How to verify (all live, no mocks)

After everything is built, run these checks:

1. **Start the server:**
   ```bash
   npm run dev
   ```
   ✅ Should see "Server ready on port 3000" in the terminal. No errors.

2. **Test missing env vars:** Temporarily remove `DATABASE_URL` from `.env`, restart. ✅ Should see a clear Zod error like `"DATABASE_URL: Required"` and the process should exit with code 1. Restore the var after.

3. **Test health endpoint:**
   ```bash
   curl http://localhost:3000/healthz
   ```
   ✅ Should return `{"status":"ok","timestamp":"..."}` with HTTP 200.

4. **Verify migrations ran — check all tables exist:**
   ```bash
   psql $DATABASE_URL -c "\dt"
   ```
   ✅ Should list: `expansions`, `cards`, `variants`, `deals`, `sales_velocity_cache`, `exchange_rates`, `preferences`, `api_credentials`, `sync_log`, `pgmigrations`.

5. **Verify migrations are idempotent — run them again:**
   ```bash
   npm run migrate
   ```
   ✅ Should complete with no errors and no changes.

6. **Spot-check table schemas:**
   ```bash
   psql $DATABASE_URL -c "\d expansions"
   psql $DATABASE_URL -c "\d cards"
   psql $DATABASE_URL -c "\d variants"
   psql $DATABASE_URL -c "\d deals"
   ```
   ✅ Columns, types, constraints, and indexes should match the migration SQL exactly.

7. **Verify pg_trgm extension:**
   ```bash
   psql $DATABASE_URL -c "SELECT 'charizard' % 'charzard';"
   ```
   ✅ Should return `t` (true).

8. **Test DB connection resilience:** Stop PostgreSQL, hit the health endpoint:
   ```bash
   curl http://localhost:3000/healthz
   ```
   ✅ Should return HTTP 503 with `{"status":"error"}`. The server itself should NOT crash.

---

## Deliverable

A running Express server connected to PostgreSQL with all tables created, a health endpoint, Zod config validation, and structured Pino logging. Ready to receive data in Stage 2.

## What NOT to build yet

- No Scrydex client (Stage 2)
- No eBay client (Stage 5)
- No authentication (Stage 10)
- No SSE (Stage 10)
- No frontend (Stage 12)
- No background jobs (Stage 11)

Just the foundation. Keep it clean.
