# Stage 2 Build Prompt — Scrydex Client & Card Sync

> Paste this entire prompt into a fresh Claude Code session to build Stage 2.
> **Before pasting:** Fill in your real credentials in the "Your Credentials" section below.

---

## Your Credentials

**Fill these in with your real values before pasting this prompt:**

```
DATABASE_URL=<your Railway PostgreSQL URL>
SCRYDEX_API_KEY=<your Scrydex API key>
SCRYDEX_TEAM_ID=<your Scrydex team ID>
ACCESS_PASSWORD=<your dashboard password, 8+ chars>
SESSION_SECRET=<random 32+ char string>
EBAY_CLIENT_ID=<your eBay OAuth app ID>
EBAY_CLIENT_SECRET=<your eBay OAuth secret>
EXCHANGE_RATE_API_KEY=<your exchange rate API key>
```

---

## What you're building

**PokeSnipe** — a Pokemon card arbitrage scanner. Stage 1 (already deployed on Railway) set up the Express server, database, config, and health endpoint.

This is **Stage 2 of 13**. You are building the Scrydex API client and card sync pipeline. After this stage, the database will be populated with ~35,000+ cards, ~70,000+ variants, all with real pricing, trends, and images.

**How this works:** You (Claude) build the code, update the `.env` with the credentials above, run the sync against the real Scrydex API, verify real data lands in the database, then commit and push.

**IMPORTANT:** The project already exists with Stage 1 code. Do NOT re-initialize the project or overwrite existing files. Build on top of what's there.

---

## Existing project structure (from Stage 1)

```
src/
├── config/index.ts       ← Zod-validated config (already done)
├── db/
│   ├── pool.ts           ← PostgreSQL pool (already done)
│   └── migrate.ts        ← Migration runner (already done)
├── routes/health.ts      ← GET /healthz (already done)
├── middleware/            ← (empty)
├── services/             ← (empty — you'll add scrydex + sync here)
├── app.ts                ← Express app (already done)
└── server.ts             ← Boot sequence (already done)
migrations/               ← All 10 migration files (already done)
```

---

## Tech stack

- **Runtime:** Node.js 20, TypeScript
- **Existing packages:** express, pg, node-pg-migrate, pino, zod, dotenv, helmet
- **New package:** bottleneck (rate limiter)

---

## Step 1: Install new package

```bash
npm install bottleneck
```

---

## Step 2: Create `src/services/scrydex/client.ts`

The Scrydex API client. Every request to Scrydex goes through this file.

**Authentication:**
- Header `X-Api-Key: <SCRYDEX_API_KEY>` on every request
- Header `X-Team-ID: <SCRYDEX_TEAM_ID>` on every request

**Base URL:**
```
https://api.scrydex.com/pokemon/v1/en
```

Language is scoped in the URL path (`/en/`), NOT as a query parameter. This is critical.

**Rate limiting:**
- Scrydex allows 100 requests/second across all endpoints
- Use `bottleneck` with `maxConcurrent: 10`, `minTime: 13` (~80 req/sec, 20% headroom)
- On HTTP 429 or 5xx: retry up to 3 times with exponential backoff (1s, 2s, 4s)

**Methods to implement:**

```typescript
// GET /pokemon/v1/en/expansions?page_size=100&page={page}
getExpansions(page?: number): Promise<ExpansionResponse>

// GET /pokemon/v1/en/expansions/{id}/cards?include=prices&page_size=100&page={page}
getExpansionCards(expansionId: string, page: number): Promise<CardResponse>

// GET /account/v1/usage
getAccountUsage(): Promise<UsageResponse>
```

**Response shapes from the Scrydex API:**

Expansion list response:
```json
{
  "data": [
    {
      "id": "sv1",
      "name": "Scarlet & Violet",
      "series": "Scarlet & Violet",
      "code": "SV1",
      "total": 258,
      "printed_total": 198,
      "language": "English",
      "language_code": "EN",
      "release_date": "2023/03/31",
      "is_online_only": false,
      "logo": "https://images.scrydex.com/pokemon/sv1-logo/logo",
      "symbol": "https://images.scrydex.com/pokemon/sv1-symbol/symbol"
    }
  ],
  "page": 1,
  "pageSize": 100,
  "totalCount": 350
}
```

Card response (with `?include=prices`):
```json
{
  "data": [
    {
      "id": "sv1-1",
      "name": "Sprigatito",
      "supertype": "Pokemon",
      "subtypes": ["Basic"],
      "types": ["Grass"],
      "number": "1",
      "printed_number": "001/198",
      "rarity": "Common",
      "artist": "Some Artist",
      "language_code": "EN",
      "images": [
        { "type": "front", "small": "...", "medium": "...", "large": "..." }
      ],
      "expansion": {
        "id": "sv1",
        "name": "Scarlet & Violet",
        "series": "Scarlet & Violet",
        "total": 258,
        "printed_total": 198,
        "release_date": "2023/03/31"
      },
      "variants": [
        {
          "name": "normal",
          "images": [{ "type": "front", "small": "...", "medium": "...", "large": "..." }],
          "prices": [
            {
              "condition": "NM",
              "type": "raw",
              "is_perfect": false,
              "is_signed": false,
              "is_error": false,
              "low": 0.10,
              "market": 0.15,
              "currency": "USD",
              "trends": {
                "days_1": { "price_change": 0.0, "percent_change": 0.0 },
                "days_7": { "price_change": 0.01, "percent_change": 7.1 },
                "days_14": { "price_change": 0.02, "percent_change": 15.4 },
                "days_30": { "price_change": -0.01, "percent_change": -6.3 },
                "days_90": { "price_change": 0.03, "percent_change": 25.0 },
                "days_180": { "price_change": 0.05, "percent_change": 50.0 }
              }
            },
            {
              "condition": "LP",
              "type": "raw",
              "low": 0.08,
              "market": 0.12,
              "currency": "USD",
              "trends": { ... }
            },
            {
              "condition": "NM",
              "type": "graded",
              "grade": "10",
              "company": "PSA",
              "low": 5.00,
              "market": 8.50,
              "currency": "USD",
              "trends": { ... }
            }
          ]
        },
        {
          "name": "reverseHolofoil",
          "images": [...],
          "prices": [...]
        }
      ]
    }
  ],
  "page": 1,
  "pageSize": 100,
  "totalCount": 258
}
```

Usage response:
```json
{
  "total_credits": 50000,
  "remaining_credits": 47500,
  "used_credits": 2500,
  "overage_credit_rate": 0.002
}
```

**Credit costs:**
- General requests (`/cards`, `/expansions`): 1 credit each
- Price history: 3 credits each
- Monthly budget: 50,000 credits. A full sync uses ~400 credits (5% of budget).

---

## Step 3: Create `src/services/sync/transformers.ts`

Functions to transform Scrydex API responses into database rows.

```typescript
transformExpansion(apiExpansion) → {
  scrydex_id: apiExpansion.id,
  name: apiExpansion.name,
  code: apiExpansion.code,
  series: apiExpansion.series,
  printed_total: apiExpansion.printed_total,
  total: apiExpansion.total,
  release_date: apiExpansion.release_date,  // Convert "YYYY/MM/DD" to Date
  language_code: apiExpansion.language_code || 'EN',
  logo_url: apiExpansion.logo,
  symbol_url: apiExpansion.symbol,
}

transformCard(apiCard, expansionId) → {
  scrydex_card_id: apiCard.id,
  name: apiCard.name,
  number: apiCard.number,
  number_normalized: normalizeNumber(apiCard.number),  // "001" → "1", "TG15" → "TG15"
  expansion_id: expansionId,
  expansion_name: apiCard.expansion.name,
  expansion_code: apiCard.expansion.code || '',  // May not exist, use empty string
  printed_total: apiCard.expansion.printed_total,
  rarity: apiCard.rarity || null,
  supertype: apiCard.supertype || null,
  subtypes: apiCard.subtypes || [],
  artist: apiCard.artist || null,
  image_small: apiCard.images?.[0]?.small || null,
  image_medium: apiCard.images?.[0]?.medium || null,
  image_large: apiCard.images?.[0]?.large || null,
  market_price_usd: getBestNMPrice(apiCard.variants),  // Denormalized: best NM market price
}

transformVariant(apiVariant, cardId) → {
  card_id: cardId,
  name: apiVariant.name,
  image_small: apiVariant.images?.[0]?.small || null,
  image_medium: apiVariant.images?.[0]?.medium || null,
  image_large: apiVariant.images?.[0]?.large || null,
  prices: buildPricesJsonb(apiVariant.prices),
  graded_prices: buildGradedPricesJsonb(apiVariant.prices),
  trends: buildTrendsJsonb(apiVariant.prices),
}
```

**Critical: Price transformation logic.**

The Scrydex API returns a flat array of price objects per variant. You must split them into structured JSONB:

```typescript
function buildPricesJsonb(prices: ScrydexPrice[]): object {
  // Filter to type === 'raw' only
  // Group by condition (NM, LP, MP, HP, DM)
  // For each condition: { low, market }
  // Result: { "NM": { "low": 45.00, "market": 52.00 }, "LP": { ... }, ... }
}

function buildGradedPricesJsonb(prices: ScrydexPrice[]): object | null {
  // Filter to type === 'graded' only
  // Key: "{company}_{grade}" (e.g., "PSA_10", "CGC_9.5")
  // Value: { low, market } (also mid, high if available)
  // Result: { "PSA_10": { "low": 200, "market": 280 }, ... } or null if no graded prices
}

function buildTrendsJsonb(prices: ScrydexPrice[]): object {
  // Filter to type === 'raw' only (trends for raw conditions)
  // Group by condition
  // For each condition, extract trends object
  // Rename keys: "days_1" → "1d", "days_7" → "7d", "days_14" → "14d",
  //              "days_30" → "30d", "days_90" → "90d", "days_180" → "180d"
  // Result: { "NM": { "1d": { "price_change": 0.5, "percent_change": 1.2 }, "7d": { ... } }, "LP": { ... } }
}
```

**Important:** The Scrydex trends keys are `days_1`, `days_7`, etc. Our database schema expects `1d`, `7d`, etc. Rename them during transformation.

Log warnings when:
- A variant has zero price entries
- A card has zero variants
- Expected fields are missing

---

## Step 4: Create `src/services/sync/batch-insert.ts`

Efficient batch upsert helper for database writes.

```typescript
// Takes an array of rows, splits into chunks of 100
// Builds parameterized INSERT ... ON CONFLICT ... DO UPDATE SET ...
// Returns total rows upserted

async function batchUpsertExpansions(expansions: ExpansionRow[]): Promise<number>
async function batchUpsertCards(cards: CardRow[]): Promise<number>
async function batchUpsertVariants(variants: VariantRow[]): Promise<number>
```

**Upsert strategy (ON CONFLICT):**
- Expansions: `ON CONFLICT (scrydex_id) DO UPDATE SET name=EXCLUDED.name, ...`
- Cards: `ON CONFLICT (scrydex_card_id) DO UPDATE SET name=EXCLUDED.name, market_price_usd=EXCLUDED.market_price_usd, ...`
- Variants: `ON CONFLICT (card_id, name) DO UPDATE SET prices=EXCLUDED.prices, trends=EXCLUDED.trends, graded_prices=EXCLUDED.graded_prices, ...`

Always use parameterized queries (`$1, $2, ...`). Never string interpolation.

---

## Step 5: Create `src/services/sync/sync-service.ts`

The main sync orchestrator.

```typescript
export async function syncAll(): Promise<SyncResult> {
  // Step 1: Create sync_log entry (status: 'running')
  const logId = await createSyncLogEntry('full_sync');

  try {
    // Step 2: Check credits before starting
    const usage = await scrydexClient.getAccountUsage();
    log.info({ remainingCredits: usage.remaining_credits }, 'Scrydex credits check');

    // Step 3: Fetch all expansions (paginated)
    const allExpansions = await fetchAllExpansions();
    // Filter to English only (language_code === 'EN')
    // Filter out is_online_only === true
    const englishExpansions = allExpansions.filter(e => e.language_code === 'EN' && !e.is_online_only);

    // Step 4: Upsert expansions
    const expansionRows = englishExpansions.map(transformExpansion);
    const expansionsUpserted = await batchUpsertExpansions(expansionRows);

    // Step 5: For each expansion, fetch all card pages
    let totalCards = 0;
    let totalVariants = 0;

    for (const expansion of englishExpansions) {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await scrydexClient.getExpansionCards(expansion.id, page);

        // Transform cards and variants
        const cardRows = response.data.map(c => transformCard(c, expansion.id));
        const variantRows = response.data.flatMap(c =>
          (c.variants || []).map(v => transformVariant(v, c.id))
        );

        // Batch upsert
        totalCards += await batchUpsertCards(cardRows);
        totalVariants += await batchUpsertVariants(variantRows);

        // Check if more pages
        hasMore = page * 100 < response.totalCount;
        page++;
      }

      log.info({ expansion: expansion.name, cards: totalCards }, 'Expansion synced');
    }

    // Step 6: Update sync_log (status: 'completed')
    await completeSyncLog(logId, {
      expansions_synced: expansionsUpserted,
      cards_upserted: totalCards,
      variants_upserted: totalVariants,
    });

    return { expansions: expansionsUpserted, cards: totalCards, variants: totalVariants };

  } catch (error) {
    // Update sync_log with error
    await failSyncLog(logId, error.message);
    throw error;
  }
}
```

**Sync log helpers:**
```typescript
async function createSyncLogEntry(syncType: string): Promise<number>
// INSERT INTO sync_log (sync_type, status) VALUES ($1, 'running') RETURNING id

async function completeSyncLog(id: number, counts: { expansions_synced, cards_upserted, variants_upserted }): Promise<void>
// UPDATE sync_log SET status='completed', completed_at=NOW(), expansions_synced=$1, ... WHERE id=$2

async function failSyncLog(id: number, errorMessage: string): Promise<void>
// UPDATE sync_log SET status='failed', completed_at=NOW(), error_message=$1 WHERE id=$2
```

---

## Step 6: Create `src/scripts/run-sync.ts`

Standalone script to trigger sync manually:

```typescript
// Import pool, config, sync service
// Run syncAll()
// Log results
// Close pool
// process.exit(0)
```

Add/update npm script in `package.json`:
```json
"sync": "tsx src/scripts/run-sync.ts"
```

---

## Database schema reminder

The tables already exist from Stage 1 migrations. Here are the relevant columns:

**expansions:** `scrydex_id` (PK), `name`, `code`, `series`, `printed_total`, `total`, `release_date`, `language_code`, `logo_url`, `symbol_url`, `last_synced_at`

**cards:** `scrydex_card_id` (PK), `name`, `number`, `number_normalized`, `expansion_id` (FK→expansions), `expansion_name`, `expansion_code`, `printed_total`, `rarity`, `supertype`, `subtypes` (TEXT[]), `artist`, `image_small`, `image_medium`, `image_large`, `market_price_usd`, `last_synced_at`

**variants:** `id` (SERIAL PK), `card_id` (FK→cards), `name`, `image_small`, `image_medium`, `image_large`, `prices` (JSONB), `graded_prices` (JSONB), `trends` (JSONB), `last_price_update`, UNIQUE(`card_id`, `name`)

**sync_log:** `id` (SERIAL PK), `sync_type`, `started_at`, `completed_at`, `status`, `expansions_synced`, `cards_upserted`, `variants_upserted`, `credits_used`, `error_message`, `metadata` (JSONB)

---

## Verification — do all of this yourself after building

After writing all the code, run the sync and verify:

1. **Make sure `.env` has the real credentials** from the top of this prompt.

2. **Run the full sync:**
   ```bash
   npm run sync
   ```
   ✅ Should complete without errors. Watch the logs for progress.

3. **Check expansion count:**
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM expansions;"
   ```
   ✅ Should be ~350+ (all English Pokemon expansions).

4. **Check card count:**
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM cards;"
   ```
   ✅ Should be ~35,000+ cards.

5. **Check variant count:**
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM variants;"
   ```
   ✅ Should be ~70,000+ variants (avg ~2 per card).

6. **Spot-check a known card (Charizard from Base Set):**
   ```bash
   psql $DATABASE_URL -c "SELECT c.name, c.number, c.expansion_name, v.name as variant, v.prices FROM cards c JOIN variants v ON v.card_id = c.scrydex_card_id WHERE c.name ILIKE '%charizard%' AND c.number = '4' LIMIT 5;"
   ```
   ✅ Should show Charizard with pricing JSONB containing NM, LP, MP, HP with low/market values.

7. **Verify prices have ALL conditions (not just first):**
   ```bash
   psql $DATABASE_URL -c "SELECT v.name, v.prices FROM variants v WHERE v.prices != '{}' LIMIT 3;"
   ```
   ✅ JSONB should contain multiple conditions: `{"NM": {"low": ..., "market": ...}, "LP": {...}, ...}`

8. **Verify trends stored correctly:**
   ```bash
   psql $DATABASE_URL -c "SELECT v.trends FROM variants v WHERE v.trends != '{}' AND v.trends IS NOT NULL LIMIT 1;"
   ```
   ✅ Should contain per-condition trend windows with `1d`, `7d`, `30d`, `90d`, `180d` keys (NOT `days_1`, `days_7`).

9. **Verify graded prices where available:**
   ```bash
   psql $DATABASE_URL -c "SELECT v.graded_prices FROM variants v WHERE v.graded_prices IS NOT NULL AND v.graded_prices != '{}' LIMIT 1;"
   ```
   ✅ Should contain PSA/CGC/BGS prices keyed like `"PSA_10"`.

10. **Check sync log:**
    ```bash
    psql $DATABASE_URL -c "SELECT sync_type, status, expansions_synced, cards_upserted, variants_upserted, started_at, completed_at FROM sync_log ORDER BY started_at DESC LIMIT 1;"
    ```
    ✅ Status should be `completed`, counts should be > 0.

11. **Verify pg_trgm fuzzy search works on real data:**
    ```bash
    psql $DATABASE_URL -c "SELECT name FROM cards WHERE name % 'charzard' ORDER BY similarity(name, 'charzard') DESC LIMIT 5;"
    ```
    ✅ Should return Charizard cards despite the misspelling.

12. **Verify idempotency — run sync again:**
    ```bash
    npm run sync
    psql $DATABASE_URL -c "SELECT COUNT(*) FROM cards;"
    ```
    ✅ Same count as before (upserts, no duplicates).

13. **TypeScript compiles cleanly:**
    ```bash
    npx tsc --noEmit
    ```
    ✅ No type errors.

14. **Server still boots with the new code:**
    ```bash
    npm run dev
    ```
    ✅ Server starts, health endpoint responds. The sync service doesn't auto-run on boot yet (that's Stage 11).

If any check fails, fix the issue before moving on. Once everything passes, commit and push.

---

## Deliverable

A populated card database with real pricing, trends, and images for every English Pokemon card. ~35,000+ cards, ~70,000+ variants, all from live Scrydex data.

## What NOT to build yet

- No Card Catalog API endpoints (Stage 3)
- No eBay client (Stage 5)
- No auto-sync on boot or scheduled sync (Stage 11)
- No frontend (Stage 12)

Just the Scrydex client and sync pipeline. Keep it clean.
