# Stage 9 Build Prompt — Liquidity Engine & Sales Velocity

> Paste this entire prompt into a fresh Claude Code session to build Stage 9.

---

## Your Railway Details

```
RAILWAY_PUBLIC_URL=<your Railway public URL, e.g. https://pokesnipe-production.up.railway.app>
```

All environment variables are already configured as Railway service variables. You do NOT need to create or modify any `.env` file.

---

## What you're building

**PokeSnipe** — a Pokemon card arbitrage scanner.

- **Stage 1** (done): Express server, PostgreSQL, migrations, health endpoint
- **Stage 2** (done): Scrydex client, card sync — ~35,000+ cards with real pricing
- **Stage 3** (done): Card Catalog API + React frontend
- **Stage 4** (done): Exchange rate service + pricing engine + buyer protection + tier classifier
- **Stage 5** (done): eBay client — OAuth2 auth, searchItems, getItem, budget tracker
- **Stage 6** (done): Signal extraction — title cleaner, junk detector, number extractor, variant detector, condition mapper, signal merger
- **Stage 7** (done): Matching engine — candidate lookup, name validator, variant resolver, confidence scorer, gates
- **Stage 8** (done): Scanner pipeline — deduplicator, enrichment gate, tier classifier, deal creator, scanner service, scan loop

This is **Stage 9 of 13**. You are building the liquidity engine — it assesses how easily a card can be resold based on real market data. Every signal uses real data: Scrydex trend data, condition pricing completeness, price spreads, eBay supply/demand, and Scrydex sales velocity. Liquidity grades then adjust deal tiers — a GRAIL-tier profit on an illiquid card gets capped to SLEEP because you can't easily resell it.

**No new packages needed.** This stage uses existing Scrydex client and database infrastructure.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. Pure functions are tested with Vitest. Liquidity data is verified live on Railway by checking deals in the database.

**IMPORTANT:** Build on top of the existing project. Do NOT re-initialize or overwrite existing files.

---

## Existing project structure (from Stages 1–8)

```
src/
├── config/index.ts                        ← Zod config (done)
├── db/pool.ts                             ← PostgreSQL pool (done)
├── routes/
│   ├── health.ts                          ← GET /healthz (done)
│   └── catalog.ts                         ← Card catalog API (done)
├── services/
│   ├── scrydex/                           ← Scrydex client (done)
│   ├── sync/                              ← Card sync (done)
│   ├── catalog/                           ← Catalog queries (done)
│   ├── exchange-rate/                     ← Exchange rate service (done)
│   ├── pricing/                           ← Pricing engine + buyer protection + tier (done)
│   ├── ebay/                              ← eBay auth, client, budget, rate limiter (done)
│   ├── extraction/                        ← Signal extraction pipeline (done)
│   ├── matching/                          ← Matching engine (done)
│   └── scanner/                           ← Scanner pipeline (done)
│       ├── deduplicator.ts                ← In-memory + DB dedup
│       ├── enrichment-gate.ts             ← Budget-aware enrichment decision
│       ├── tier-classifier.ts             ← GRAIL/HIT/FLIP/SLEEP classification
│       ├── deal-creator.ts                ← INSERT deals into DB
│       ├── scanner-service.ts             ← runScanCycle() — two-phase pipeline
│       ├── scan-loop.ts                   ← 5-minute interval with overlap protection
│       └── index.ts                       ← Re-exports
├── app.ts                                 ← Express app (done)
└── server.ts                              ← Boot sequence (done)
client/                                    ← React frontend (done)
```

---

## Reference: sales_velocity_cache table (already created in Stage 1 migrations)

The `sales_velocity_cache` table already exists:

```sql
CREATE TABLE sales_velocity_cache (
  card_id         TEXT NOT NULL REFERENCES cards(scrydex_card_id),
  variant_name    TEXT NOT NULL,
  sales_7d        INTEGER NOT NULL DEFAULT 0,
  sales_30d       INTEGER NOT NULL DEFAULT 0,
  median_price    NUMERIC(10,2),
  avg_days_between_sales NUMERIC(6,2),
  raw_listings    JSONB,                -- Full listings response for detail view
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (card_id, variant_name)
);
```

---

## Reference: Scrydex Listings API (for Tier 3 velocity)

The Scrydex `/cards/<id>/listings` endpoint returns **actual sold eBay listings** already matched to cards:

```
GET https://api.scrydex.com/pokemon/v1/cards/<id>/listings

Headers:
  X-Api-Key: YOUR_API_KEY
  X-Team-ID: YOUR_TEAM_ID

Query Parameters:
  days       — Listings sold within the last N days (e.g. 30)
  source     — Filter by source (e.g. "ebay")
  variant    — Filter by variant (e.g. "holofoil")
  page       — Page number
  page_size  — Max results per page

Cost: 3 credits per call
```

**Example response listing object:**
```json
{
  "id": "6d690f4c-e467-432a-9735-2ecc493ba012",
  "source": "ebay",
  "card_id": "zsv10pt5-105",
  "title": "2025 Pokemon Blk En-Black Bolt Illustration Rare Seismitoad #105 PSA 10",
  "variant": "holofoil",
  "company": "PSA",
  "grade": "10",
  "is_perfect": false,
  "is_error": false,
  "is_signed": false,
  "url": "https://www.ebay.com/itm/306453556017",
  "price": 2399.0,
  "currency": "USD",
  "sold_at": "2025/08/19"
}
```

Fields: `id`, `source`, `card_id`, `title`, `variant`, `company`, `grade`, `is_perfect`, `is_error`, `is_signed`, `url`, `price`, `currency`, `sold_at`

---

## Step 1: Create `src/services/liquidity/tier1-signals.ts`

Free signals derived from synced Scrydex data — no extra API calls needed.

```typescript
/**
 * Tier 1 Liquidity Signals — Free (from synced card data)
 *
 * These signals use data already in the database from the Scrydex card sync.
 * No API calls required.
 */

/**
 * Score trend activity: how many trend windows show non-zero price movement?
 * More movement = more actively traded = more liquid.
 *
 * Checks 4 windows: 1d, 7d, 30d, 90d
 * Score = count of non-zero windows / 4
 *
 * @param trends - The variant's trends data for a specific condition (e.g. trends.NM)
 *   Shape: { '1d': { percent_change: number }, '7d': { ... }, '30d': { ... }, '90d': { ... } }
 * @returns Score 0.0–1.0
 */
export function scoreTrendActivity(trends: Record<string, any> | null | undefined): number {
  if (!trends) return 0;

  const windows = ['1d', '7d', '30d', '90d'];
  const activeWindows = windows.filter(w => {
    const pct = trends[w]?.percent_change ?? trends[w]?.pct;
    return pct !== null && pct !== undefined && pct !== 0;
  });

  return activeWindows.length / windows.length;
}

/**
 * Score price completeness: how many conditions (NM/LP/MP/HP) have market pricing?
 * More conditions priced = more widely traded = more liquid.
 *
 * @param prices - The variant's prices object
 *   Shape: { NM: { market: number, low: number }, LP: { ... }, MP: { ... }, HP: { ... } }
 *   or nested under .raw: { raw: { NM: { market: ... } } }
 * @returns Score 0.0–1.0 (0.25 per condition)
 */
export function scorePriceCompleteness(prices: Record<string, any> | null | undefined): number {
  if (!prices) return 0;

  // Handle both { NM: { market: ... } } and { raw: { NM: { market: ... } } }
  const priceMap = prices.raw || prices;

  const conditions = ['NM', 'LP', 'MP', 'HP'];
  const pricedCount = conditions.filter(c =>
    priceMap[c]?.market != null && priceMap[c].market > 0
  ).length;

  return pricedCount / conditions.length;
}

/**
 * Score price spread: how tight is the low-to-market spread for this condition?
 * Tight spread (low ≈ market) = 1.0 — liquid, prices are stable
 * Wide spread (low << market) = lower score — volatile or thin market
 *
 * @param prices - The variant's prices object
 * @param condition - The condition to check (NM/LP/MP/HP)
 * @returns Score 0.0–1.0 (defaults to 0.3 if data missing)
 */
export function scorePriceSpread(
  prices: Record<string, any> | null | undefined,
  condition: string
): number {
  if (!prices) return 0.3;

  const priceMap = prices.raw || prices;
  const low = priceMap[condition]?.low;
  const market = priceMap[condition]?.market;

  if (low && market && market > 0) {
    return Math.min(low / market, 1.0);
  }

  return 0.3; // neutral default when data is missing
}
```

**Key design decisions:**
- All three functions are **pure** — they take data in, return a number, no I/O
- `scoreTrendActivity` counts how many of the 4 time windows (1d/7d/30d/90d) show non-zero change — this is a proxy for "is this card actively traded?"
- `scorePriceCompleteness` checks how many of 4 conditions have market pricing — if only NM is priced (0.25), the card is likely niche; if all 4 are priced (1.0), it's widely collected
- `scorePriceSpread` uses the low/market ratio — a tight spread (low ≈ market, ratio near 1.0) indicates stable pricing and active trading; a wide spread suggests thin or volatile markets

---

## Step 2: Create `src/services/liquidity/tier2-signals.ts`

Signals from the eBay listing itself — also free, no extra API calls.

```typescript
/**
 * Tier 2 Liquidity Signals — Free (from eBay listing data)
 *
 * These signals use data from the current scan batch and individual listings.
 * No API calls required.
 */

/**
 * Score concurrent supply: how many other eBay listings exist for this card
 * in the current scan batch?
 *
 * More supply = more sellers = more liquid market.
 * Linear scale capped at 5: 0→0.0, 1→0.2, 2→0.4, ..., 5+→1.0
 *
 * @param listingsForSameCard - Count of listings matching the same card in the scan batch
 * @returns Score 0.0–1.0
 */
export function scoreSupply(listingsForSameCard: number): number {
  return Math.min(listingsForSameCard / 5, 1.0);
}

/**
 * Score quantity sold: eBay's quantitySold field from the listing.
 * More sales from a single listing = active demand.
 *
 * Linear scale capped at 3: 0→0.0, 1→0.33, 2→0.67, 3+→1.0
 *
 * @param quantitySold - eBay's quantitySold value from the listing
 * @returns Score 0.0–1.0
 */
export function scoreSold(quantitySold: number): number {
  return Math.min(quantitySold / 3, 1.0);
}
```

**Note on concurrent supply:** In the scanner, you'll need to track how many listings in the current scan batch match the same card. The simplest approach is to build a `Map<string, number>` of cardId → count as you process listings, then pass the count to `scoreSupply()`.

---

## Step 3: Create `src/services/liquidity/tier3-velocity.ts`

Premium signal from the Scrydex `/cards/{id}/listings` endpoint. Costs 3 credits per call, so results are cached with a 7-day TTL.

```typescript
import pool from '../../db/pool.js';
import { logger } from '../../config/index.js';
// Import your existing Scrydex client — adjust path to match your actual export
// The key is: make a GET request to /pokemon/v1/cards/{cardId}/listings with the Scrydex API key
import { scrydexGet } from '../scrydex/client.js'; // or however your Scrydex client is exported

const log = logger.child({ module: 'tier3-velocity' });

export interface VelocityData {
  sales7d: number;
  sales30d: number;
  medianPrice: number | null;
  avgDaysBetweenSales: number | null;
  fetched: boolean;
}

/**
 * Get sales velocity for a card+variant.
 * Checks cache first (7-day TTL), then fetches from Scrydex if needed.
 *
 * @param cardId - Scrydex card ID (e.g. "zsv10pt5-105")
 * @param variantName - Variant name (e.g. "holofoil")
 * @param forceFetch - If true, bypass cache and fetch fresh data
 * @returns VelocityData with sales counts and pricing
 */
export async function getVelocity(
  cardId: string,
  variantName: string,
  forceFetch = false
): Promise<VelocityData> {
  // Check cache first (7-day TTL)
  if (!forceFetch) {
    const cached = await getCachedVelocity(cardId, variantName);
    if (cached) return cached;
  }

  // Fetch from Scrydex listings endpoint
  try {
    const response = await scrydexGet(
      `/pokemon/v1/cards/${cardId}/listings`,
      { days: 30, source: 'ebay', variant: variantName }
    );

    // Parse response — expect an array of listing objects
    const listings = Array.isArray(response) ? response : (response?.data || []);

    // Calculate metrics
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const sales30d = listings.length;
    const sales7d = listings.filter((l: any) => {
      const soldDate = new Date(l.sold_at?.replace(/\//g, '-'));
      return soldDate >= sevenDaysAgo;
    }).length;

    // Median price
    const prices = listings
      .map((l: any) => l.price)
      .filter((p: any) => typeof p === 'number' && p > 0)
      .sort((a: number, b: number) => a - b);
    const medianPrice = prices.length > 0
      ? prices[Math.floor(prices.length / 2)]
      : null;

    // Average days between sales
    let avgDaysBetweenSales: number | null = null;
    if (listings.length >= 2) {
      const dates = listings
        .map((l: any) => new Date(l.sold_at?.replace(/\//g, '-')).getTime())
        .filter((d: number) => !isNaN(d))
        .sort((a: number, b: number) => a - b);

      if (dates.length >= 2) {
        const totalDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
        avgDaysBetweenSales = Math.round((totalDays / (dates.length - 1)) * 100) / 100;
      }
    }

    // Cache the result
    await cacheVelocity(cardId, variantName, {
      sales7d,
      sales30d,
      medianPrice,
      avgDaysBetweenSales,
      rawListings: listings,
    });

    log.info(
      { cardId, variantName, sales7d, sales30d, medianPrice },
      'Fetched velocity from Scrydex'
    );

    return { sales7d, sales30d, medianPrice, avgDaysBetweenSales, fetched: true };
  } catch (err) {
    log.warn({ err, cardId, variantName }, 'Failed to fetch velocity from Scrydex');
    return { sales7d: 0, sales30d: 0, medianPrice: null, avgDaysBetweenSales: null, fetched: false };
  }
}

/**
 * Score the sales velocity — how actively is this card being sold?
 */
export function scoreVelocity(velocityData: VelocityData | null): number {
  if (!velocityData?.fetched) return 0.5; // neutral default when no data

  if (velocityData.sales7d >= 5) return 1.0;
  if (velocityData.sales7d >= 2) return 0.85;
  if (velocityData.sales30d >= 5) return 0.7;
  if (velocityData.sales30d >= 2) return 0.5;
  if (velocityData.sales30d >= 1) return 0.3;
  return 0.1;
}

// --- Cache helpers ---

async function getCachedVelocity(
  cardId: string,
  variantName: string
): Promise<VelocityData | null> {
  const { rows } = await pool.query(
    `SELECT sales_7d, sales_30d, median_price, avg_days_between_sales
     FROM sales_velocity_cache
     WHERE card_id = $1 AND variant_name = $2
       AND fetched_at > NOW() - INTERVAL '7 days'`,
    [cardId, variantName]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    sales7d: row.sales_7d,
    sales30d: row.sales_30d,
    medianPrice: row.median_price ? parseFloat(row.median_price) : null,
    avgDaysBetweenSales: row.avg_days_between_sales ? parseFloat(row.avg_days_between_sales) : null,
    fetched: true,
  };
}

async function cacheVelocity(
  cardId: string,
  variantName: string,
  data: {
    sales7d: number;
    sales30d: number;
    medianPrice: number | null;
    avgDaysBetweenSales: number | null;
    rawListings: any[];
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO sales_velocity_cache (card_id, variant_name, sales_7d, sales_30d, median_price, avg_days_between_sales, raw_listings)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (card_id, variant_name) DO UPDATE SET
       sales_7d = $3, sales_30d = $4, median_price = $5,
       avg_days_between_sales = $6, raw_listings = $7,
       fetched_at = NOW()`,
    [
      cardId, variantName,
      data.sales7d, data.sales30d, data.medianPrice, data.avgDaysBetweenSales,
      JSON.stringify(data.rawListings),
    ]
  );
}
```

**Key points:**
- The Scrydex call costs 3 credits — budget ~1,050 credits/month (2% of total)
- Cache TTL is 7 days — velocity data doesn't change rapidly enough to justify more frequent fetches
- `scoreVelocity` is a **pure function** — it just maps sales counts to a 0–1 score
- The `sold_at` date format from Scrydex is `YYYY/MM/DD` — note the slashes, which need converting for `Date()` parsing
- The `scrydexGet` import needs to match your actual Scrydex client from Stage 2 — adjust the import path and function name accordingly

---

## Step 4: Create `src/services/liquidity/composite.ts`

Combine all signals into a single composite liquidity score using a weighted arithmetic mean.

```typescript
import { scoreTrendActivity, scorePriceCompleteness, scorePriceSpread } from './tier1-signals.js';
import { scoreSupply, scoreSold } from './tier2-signals.js';
import { scoreVelocity, VelocityData } from './tier3-velocity.js';

export interface LiquiditySignals {
  trendActivity: number;
  priceCompleteness: number;
  priceSpread: number;
  supply: number;
  sold: number;
  velocity: number | null;  // null if velocity was not fetched
}

export interface LiquidityAssessment {
  composite: number;
  grade: 'high' | 'medium' | 'low' | 'illiquid';
  signals: LiquiditySignals;
}

/**
 * Calculate composite liquidity score.
 *
 * Uses weighted arithmetic mean (not geometric — see rationale below).
 *
 * Weights with velocity data:
 *   Tier 1 (free):    trend 0.15, prices 0.10, spread 0.10 = 0.35
 *   Tier 2 (free):    supply 0.15, sold 0.10              = 0.25
 *   Tier 3 (premium): velocity 0.40                       = 0.40
 *   Total = 1.00
 *
 * Weights without velocity data (redistributed):
 *   Tier 1 (free):    trend 0.25, prices 0.15, spread 0.15 = 0.55
 *   Tier 2 (free):    supply 0.25, sold 0.20               = 0.45
 *   Total = 1.00
 *
 * Why arithmetic mean (not geometric)?
 *   Confidence uses geometric mean because any single wrong field (wrong name,
 *   wrong set) means a wrong card — one low score should tank the composite.
 *   Liquidity uses arithmetic mean because a card can have zero eBay supply
 *   (nobody listing right now) but strong Scrydex trend activity — it's still
 *   liquid, just not on eBay this moment. Strong signals compensate for weak ones.
 */
export function compositeScore(signals: LiquiditySignals): number {
  const hasVelocity = signals.velocity !== null;

  const weights = hasVelocity
    ? { trend: 0.15, prices: 0.10, spread: 0.10, supply: 0.15, sold: 0.10, velocity: 0.40 }
    : { trend: 0.25, prices: 0.15, spread: 0.15, supply: 0.25, sold: 0.20, velocity: 0.00 };

  const composite =
    weights.trend * signals.trendActivity +
    weights.prices * signals.priceCompleteness +
    weights.spread * signals.priceSpread +
    weights.supply * signals.supply +
    weights.sold * signals.sold +
    weights.velocity * (signals.velocity ?? 0);

  return Math.round(composite * 1000) / 1000; // 3 decimal places
}

/**
 * Assign a liquidity grade from composite score.
 *
 * Thresholds:
 *   ≥0.75 → high     (actively traded, easy to resell)
 *   ≥0.50 → medium   (moderate demand)
 *   ≥0.25 → low      (thin market, may take time to sell)
 *   <0.25 → illiquid  (very few buyers, hard to sell)
 */
export function assignGrade(score: number): 'high' | 'medium' | 'low' | 'illiquid' {
  if (score >= 0.75) return 'high';
  if (score >= 0.50) return 'medium';
  if (score >= 0.25) return 'low';
  return 'illiquid';
}

/**
 * Full liquidity assessment — convenience function that computes all signals
 * and returns the composite score + grade.
 *
 * @param variant - The matched variant (with prices and trends data)
 * @param condition - The listing's condition (NM/LP/MP/HP)
 * @param ebaySignals - eBay-derived signals { concurrentSupply, quantitySold }
 * @param velocityData - Tier 3 velocity data (null if not fetched)
 */
export function calculateLiquidity(
  variant: { prices: Record<string, any>; trends?: Record<string, any> },
  condition: string,
  ebaySignals: { concurrentSupply: number; quantitySold: number },
  velocityData: VelocityData | null
): LiquidityAssessment {
  const signals: LiquiditySignals = {
    trendActivity: scoreTrendActivity(variant.trends?.[condition]),
    priceCompleteness: scorePriceCompleteness(variant.prices),
    priceSpread: scorePriceSpread(variant.prices, condition),
    supply: scoreSupply(ebaySignals.concurrentSupply),
    sold: scoreSold(ebaySignals.quantitySold),
    velocity: velocityData?.fetched ? scoreVelocity(velocityData) : null,
  };

  const score = compositeScore(signals);
  const grade = assignGrade(score);

  return { composite: score, grade, signals };
}
```

---

## Step 5: Create `src/services/liquidity/tier-adjuster.ts`

Adjust deal tiers based on liquidity grade. A GRAIL-tier profit on an illiquid card is not a real GRAIL.

```typescript
export type DealTier = 'GRAIL' | 'HIT' | 'FLIP' | 'SLEEP';
export type LiquidityGrade = 'high' | 'medium' | 'low' | 'illiquid';

/**
 * Adjust a deal's tier based on its liquidity grade.
 *
 * Rules:
 *   illiquid → always cap at SLEEP (can't resell, so profit is theoretical)
 *   low      → cap at FLIP (GRAIL→FLIP, HIT→FLIP, FLIP stays, SLEEP stays)
 *   medium   → GRAIL downgrades to HIT (GRAIL requires high liquidity)
 *   high     → no adjustment (liquid market supports the tier)
 *
 * The principle: GRAIL always implies both high profit AND high liquidity.
 */
export function adjustTierForLiquidity(tier: DealTier, grade: LiquidityGrade): DealTier {
  if (grade === 'illiquid') return 'SLEEP';
  if (grade === 'low' && (tier === 'GRAIL' || tier === 'HIT')) return 'FLIP';
  if (grade === 'medium' && tier === 'GRAIL') return 'HIT';
  return tier;
}
```

---

## Step 6: Create `src/services/liquidity/index.ts`

Re-export the public API for the liquidity module.

```typescript
export { scoreTrendActivity, scorePriceCompleteness, scorePriceSpread } from './tier1-signals.js';
export { scoreSupply, scoreSold } from './tier2-signals.js';
export { getVelocity, scoreVelocity } from './tier3-velocity.js';
export type { VelocityData } from './tier3-velocity.js';
export { compositeScore, assignGrade, calculateLiquidity } from './composite.js';
export type { LiquiditySignals, LiquidityAssessment } from './composite.js';
export { adjustTierForLiquidity } from './tier-adjuster.js';
export type { DealTier, LiquidityGrade } from './tier-adjuster.js';
```

---

## Step 7: Wire liquidity into the scanner pipeline

Update `src/services/scanner/scanner-service.ts` to calculate liquidity for every deal and apply tier adjustments.

### 7a. Add imports

Add these imports to `scanner-service.ts`:

```typescript
import { calculateLiquidity, getVelocity, adjustTierForLiquidity } from '../liquidity/index.js';
```

### 7b. Track concurrent supply

At the start of `runScanCycle()`, after getting listings, build a supply counter:

```typescript
// After searchItems returns listings, build a card supply map
// This tracks how many listings in this scan batch match the same card
const cardSupplyMap = new Map<string, number>();
```

Then, after matching a listing to a card (step 3c in the existing pipeline), increment the counter:

```typescript
// After match = await matchListing(signals):
if (match) {
  const cardId = match.card.scrydexCardId; // adjust field name to match your actual code
  cardSupplyMap.set(cardId, (cardSupplyMap.get(cardId) || 0) + 1);
}
```

### 7c. Calculate liquidity before creating the deal

In the Phase 2 section (after `realProfit` is calculated and before `createDeal()`), add:

```typescript
// Calculate liquidity assessment (Tier 1 + 2 — always free)
const concurrentSupply = cardSupplyMap.get(enrichedMatch.card.scrydexCardId) || 0;
const quantitySold = enriched.quantitySold || 0; // from getItem response

const liquidity = calculateLiquidity(
  enrichedMatch.variant,
  realCondition,
  { concurrentSupply, quantitySold },
  null  // velocity data — fetched conditionally below
);

// For high-profit deals (>40%), auto-fetch Tier 3 velocity (3 Scrydex credits)
let velocityData = null;
if (realProfit.profitPercent > 40) {
  velocityData = await getVelocity(
    enrichedMatch.card.scrydexCardId,
    enrichedMatch.variant.name || 'default'
  );
  // Recalculate liquidity with velocity data
  const liquidityWithVelocity = calculateLiquidity(
    enrichedMatch.variant,
    realCondition,
    { concurrentSupply, quantitySold },
    velocityData
  );
  Object.assign(liquidity, liquidityWithVelocity);
}

// Apply tier adjustment based on liquidity
const adjustedTier = adjustTierForLiquidity(tier, liquidity.grade);
```

### 7d. Pass liquidity data to deal-creator

Update the `createDeal()` call to include liquidity data:

```typescript
const deal = await createDeal({
  // ... existing fields ...
  tier: adjustedTier,  // ← use adjusted tier instead of raw tier
  // ... existing fields ...
  // Add these new fields:
  liquidityScore: liquidity.composite,
  liquidityGrade: liquidity.grade,
});
```

### 7e. Update deal-creator

In `src/services/scanner/deal-creator.ts`, add `liquidityScore` and `liquidityGrade` to the `DealInput` interface and the INSERT query:

```typescript
// Add to DealInput interface:
liquidityScore?: number;
liquidityGrade?: string;
```

Add these two fields to the INSERT column list and values:

```sql
-- Add to the INSERT columns:
liquidity_score, liquidity_grade

-- Add to the VALUES:
$29, $30
```

And add to the parameter array:
```typescript
data.liquidityScore || null, data.liquidityGrade || null
```

### 7f. Store liquidity signals in match_signals

Add the liquidity breakdown to the `matchSignals` JSONB so it's part of the audit trail:

```typescript
matchSignals: {
  extraction: enrichedSignals,
  confidence: enrichedMatch.confidence,
  phaseOneProfit: quickProfit,
  phaseTwoProfit: realProfit,
  enrichmentUsed: true,
  liquidity: {                          // ← Add this
    composite: liquidity.composite,
    grade: liquidity.grade,
    signals: liquidity.signals,
    velocityFetched: velocityData?.fetched || false,
  },
},
```

---

## Step 8: Create velocity fetch endpoint

Add an on-demand velocity fetch endpoint for the frontend (to be used in Stage 12's deal detail panel).

Create `src/routes/velocity.ts`:

```typescript
import { Router } from 'express';
import pool from '../db/pool.js';
import { getVelocity } from '../services/liquidity/index.js';
import { calculateLiquidity, assignGrade } from '../services/liquidity/index.js';
import { logger } from '../config/index.js';

const log = logger.child({ module: 'velocity-route' });
const router = Router();

/**
 * GET /api/deals/:id/velocity
 *
 * Fetches (or refreshes) Tier 3 velocity data for a deal's card.
 * Costs 3 Scrydex credits per call (cached 7 days).
 *
 * Returns updated liquidity assessment with velocity signal.
 */
router.get('/deals/:id/velocity', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the deal's card and variant info
    const { rows } = await pool.query(
      `SELECT d.deal_id, d.card_id, d.condition,
              v.name as variant_name, v.prices, v.trends
       FROM deals d
       LEFT JOIN variants v ON v.id = d.variant_id
       WHERE d.deal_id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = rows[0];
    if (!deal.card_id) {
      return res.status(400).json({ error: 'Deal has no matched card' });
    }

    // Fetch velocity (force fresh fetch, bypassing cache)
    const velocityData = await getVelocity(
      deal.card_id,
      deal.variant_name || 'default',
      true // forceFetch
    );

    // Recalculate liquidity with the new velocity data
    const variant = {
      prices: deal.prices || {},
      trends: deal.trends || {},
    };

    const liquidity = calculateLiquidity(
      variant,
      deal.condition || 'NM',
      { concurrentSupply: 0, quantitySold: 0 }, // we don't have scan-batch context here
      velocityData
    );

    // Update the deal's liquidity fields
    await pool.query(
      `UPDATE deals SET
         liquidity_score = $1,
         liquidity_grade = $2
       WHERE deal_id = $3`,
      [liquidity.composite, liquidity.grade, id]
    );

    log.info({ dealId: id, grade: liquidity.grade, score: liquidity.composite }, 'Velocity fetched for deal');

    return res.json({
      dealId: id,
      velocity: velocityData,
      liquidity: {
        composite: liquidity.composite,
        grade: liquidity.grade,
        signals: liquidity.signals,
      },
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch velocity');
    return res.status(500).json({ error: 'Failed to fetch velocity' });
  }
});

export default router;
```

Mount this router in `src/app.ts`:

```typescript
import velocityRouter from './routes/velocity.js';

// Mount after existing routes (no auth required yet — auth comes in Stage 10)
app.use('/api', velocityRouter);
```

---

## Step 9: Write Vitest pure function tests

Create tests for all the pure functions: tier1-signals, tier2-signals, composite scoring, and tier-adjuster.

### `src/__tests__/stage9/tier1-signals.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { scoreTrendActivity, scorePriceCompleteness, scorePriceSpread } from '../../services/liquidity/tier1-signals.js';

describe('tier1-signals', () => {
  describe('scoreTrendActivity', () => {
    it('returns 1.0 when all 4 windows have movement', () => {
      expect(scoreTrendActivity({
        '1d': { percent_change: 1.2 },
        '7d': { percent_change: -2.5 },
        '30d': { percent_change: 5.0 },
        '90d': { percent_change: 12.0 },
      })).toBe(1.0);
    });

    it('returns 0.5 when 2/4 windows have movement', () => {
      expect(scoreTrendActivity({
        '1d': { percent_change: 0 },
        '7d': { percent_change: 4.8 },
        '30d': { percent_change: 0 },
        '90d': { percent_change: 20 },
      })).toBe(0.5);
    });

    it('returns 0.0 for null/undefined trends', () => {
      expect(scoreTrendActivity(null)).toBe(0);
      expect(scoreTrendActivity(undefined)).toBe(0);
    });

    it('returns 0.0 when all windows are zero', () => {
      expect(scoreTrendActivity({
        '1d': { percent_change: 0 },
        '7d': { percent_change: 0 },
        '30d': { percent_change: 0 },
        '90d': { percent_change: 0 },
      })).toBe(0.0);
    });
  });

  describe('scorePriceCompleteness', () => {
    it('returns 1.0 when all 4 conditions are priced', () => {
      expect(scorePriceCompleteness({
        NM: { market: 52 },
        LP: { market: 38 },
        MP: { market: 24 },
        HP: { market: 12 },
      })).toBe(1.0);
    });

    it('returns 0.25 when only NM is priced', () => {
      expect(scorePriceCompleteness({ NM: { market: 52 } })).toBe(0.25);
    });

    it('returns 0.0 for null/undefined prices', () => {
      expect(scorePriceCompleteness(null)).toBe(0);
      expect(scorePriceCompleteness(undefined)).toBe(0);
    });

    it('handles nested .raw structure', () => {
      expect(scorePriceCompleteness({
        raw: { NM: { market: 52 }, LP: { market: 38 } }
      })).toBe(0.5);
    });

    it('ignores conditions with market = 0', () => {
      expect(scorePriceCompleteness({
        NM: { market: 52 },
        LP: { market: 0 },
      })).toBe(0.25);
    });
  });

  describe('scorePriceSpread', () => {
    it('returns 1.0 for tight spread (low = market)', () => {
      expect(scorePriceSpread({ NM: { low: 50, market: 50 } }, 'NM')).toBe(1.0);
    });

    it('returns ratio for normal spread', () => {
      expect(scorePriceSpread({ NM: { low: 40, market: 50 } }, 'NM')).toBeCloseTo(0.8);
    });

    it('returns 0.3 default when data is missing', () => {
      expect(scorePriceSpread(null, 'NM')).toBe(0.3);
      expect(scorePriceSpread({ NM: {} }, 'NM')).toBe(0.3);
    });

    it('caps at 1.0 even if low > market', () => {
      expect(scorePriceSpread({ NM: { low: 60, market: 50 } }, 'NM')).toBe(1.0);
    });
  });
});
```

### `src/__tests__/stage9/tier2-signals.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { scoreSupply, scoreSold } from '../../services/liquidity/tier2-signals.js';

describe('tier2-signals', () => {
  describe('scoreSupply', () => {
    it('returns 0.0 for no supply', () => {
      expect(scoreSupply(0)).toBe(0.0);
    });

    it('scales linearly', () => {
      expect(scoreSupply(1)).toBeCloseTo(0.2);
      expect(scoreSupply(3)).toBeCloseTo(0.6);
    });

    it('caps at 1.0 for 5+ listings', () => {
      expect(scoreSupply(5)).toBe(1.0);
      expect(scoreSupply(10)).toBe(1.0);
    });
  });

  describe('scoreSold', () => {
    it('returns 0.0 for no sales', () => {
      expect(scoreSold(0)).toBe(0.0);
    });

    it('scales linearly', () => {
      expect(scoreSold(1)).toBeCloseTo(0.333, 2);
      expect(scoreSold(2)).toBeCloseTo(0.667, 2);
    });

    it('caps at 1.0 for 3+ sold', () => {
      expect(scoreSold(3)).toBe(1.0);
      expect(scoreSold(10)).toBe(1.0);
    });
  });
});
```

### `src/__tests__/stage9/composite.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { compositeScore, assignGrade } from '../../services/liquidity/composite.js';

describe('composite liquidity', () => {
  describe('compositeScore', () => {
    it('returns high score for all strong signals with velocity', () => {
      const score = compositeScore({
        trendActivity: 1.0,
        priceCompleteness: 1.0,
        priceSpread: 0.9,
        supply: 0.8,
        sold: 0.7,
        velocity: 0.95,
      });
      expect(score).toBeGreaterThan(0.75);
    });

    it('returns low score for all weak signals without velocity', () => {
      const score = compositeScore({
        trendActivity: 0.0,
        priceCompleteness: 0.25,
        priceSpread: 0.1,
        supply: 0.0,
        sold: 0.0,
        velocity: null,
      });
      expect(score).toBeLessThan(0.25);
    });

    it('redistributes weights when velocity is null', () => {
      const withVelocity = compositeScore({
        trendActivity: 0.5, priceCompleteness: 0.5, priceSpread: 0.5,
        supply: 0.5, sold: 0.5, velocity: 0.5,
      });
      const withoutVelocity = compositeScore({
        trendActivity: 0.5, priceCompleteness: 0.5, priceSpread: 0.5,
        supply: 0.5, sold: 0.5, velocity: null,
      });
      // Both should equal 0.5 when all inputs are 0.5
      expect(withVelocity).toBeCloseTo(0.5);
      expect(withoutVelocity).toBeCloseTo(0.5);
    });
  });

  describe('assignGrade', () => {
    it('assigns high for ≥0.75', () => {
      expect(assignGrade(0.75)).toBe('high');
      expect(assignGrade(0.90)).toBe('high');
    });

    it('assigns medium for ≥0.50', () => {
      expect(assignGrade(0.50)).toBe('medium');
      expect(assignGrade(0.74)).toBe('medium');
    });

    it('assigns low for ≥0.25', () => {
      expect(assignGrade(0.25)).toBe('low');
      expect(assignGrade(0.49)).toBe('low');
    });

    it('assigns illiquid for <0.25', () => {
      expect(assignGrade(0.24)).toBe('illiquid');
      expect(assignGrade(0.0)).toBe('illiquid');
    });
  });
});
```

### `src/__tests__/stage9/tier-adjuster.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { adjustTierForLiquidity } from '../../services/liquidity/tier-adjuster.js';

describe('tier-adjuster', () => {
  it('does not adjust with high liquidity', () => {
    expect(adjustTierForLiquidity('GRAIL', 'high')).toBe('GRAIL');
    expect(adjustTierForLiquidity('HIT', 'high')).toBe('HIT');
    expect(adjustTierForLiquidity('FLIP', 'high')).toBe('FLIP');
    expect(adjustTierForLiquidity('SLEEP', 'high')).toBe('SLEEP');
  });

  it('downgrades GRAIL to HIT with medium liquidity', () => {
    expect(adjustTierForLiquidity('GRAIL', 'medium')).toBe('HIT');
  });

  it('does not downgrade HIT/FLIP/SLEEP with medium liquidity', () => {
    expect(adjustTierForLiquidity('HIT', 'medium')).toBe('HIT');
    expect(adjustTierForLiquidity('FLIP', 'medium')).toBe('FLIP');
    expect(adjustTierForLiquidity('SLEEP', 'medium')).toBe('SLEEP');
  });

  it('caps GRAIL and HIT to FLIP with low liquidity', () => {
    expect(adjustTierForLiquidity('GRAIL', 'low')).toBe('FLIP');
    expect(adjustTierForLiquidity('HIT', 'low')).toBe('FLIP');
  });

  it('does not downgrade FLIP/SLEEP with low liquidity', () => {
    expect(adjustTierForLiquidity('FLIP', 'low')).toBe('FLIP');
    expect(adjustTierForLiquidity('SLEEP', 'low')).toBe('SLEEP');
  });

  it('caps everything to SLEEP with illiquid', () => {
    expect(adjustTierForLiquidity('GRAIL', 'illiquid')).toBe('SLEEP');
    expect(adjustTierForLiquidity('HIT', 'illiquid')).toBe('SLEEP');
    expect(adjustTierForLiquidity('FLIP', 'illiquid')).toBe('SLEEP');
    expect(adjustTierForLiquidity('SLEEP', 'illiquid')).toBe('SLEEP');
  });
});
```

Run all Stage 9 tests:

```bash
npm test -- --run src/__tests__/stage9/
```

All tests should pass — they're pure functions with no I/O.

---

## Step 10: Verify on Railway

After pushing to GitHub and Railway auto-deploys:

### 10a. Check deployment health

```bash
curl https://<RAILWAY_URL>/healthz
# ✅ Should return {"status":"ok",...}
```

### 10b. Let the scanner run for 30+ minutes with liquidity enabled

Check the Railway logs for scan cycle output. You should now see liquidity data being calculated.

### 10c. Check deals have liquidity data

```bash
psql $DATABASE_URL -c "
  SELECT ebay_title, tier, profit_percent, liquidity_score, liquidity_grade
  FROM deals
  ORDER BY created_at DESC
  LIMIT 10;
"
# ✅ liquidity_grade should be 'high'/'medium'/'low'/'illiquid'
# ✅ liquidity_score should be between 0 and 1
```

### 10d. Verify tier adjustments

```bash
psql $DATABASE_URL -c "
  SELECT ebay_title, profit_percent, liquidity_grade, tier
  FROM deals
  WHERE liquidity_grade = 'illiquid';
"
# ✅ All illiquid deals should have tier = 'SLEEP' regardless of profit
```

### 10e. Check velocity cache

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM sales_velocity_cache;"
# ✅ Should have entries for cards where velocity was auto-fetched (>40% profit deals)
```

### 10f. Test on-demand velocity endpoint

```bash
DEAL_ID=$(psql -t $DATABASE_URL -c "SELECT deal_id FROM deals ORDER BY created_at DESC LIMIT 1;" | tr -d ' ')
curl "https://<RAILWAY_URL>/api/deals/$DEAL_ID/velocity"
# ✅ Should return JSON with velocity data and updated liquidity assessment
```

### 10g. Check liquidity in audit trail

```bash
psql $DATABASE_URL -c "SELECT match_signals->'liquidity' FROM deals ORDER BY created_at DESC LIMIT 1;"
# ✅ Should contain: composite, grade, signals breakdown, velocityFetched flag
```

---

## Deliverable

Deals now include real liquidity assessment based on actual market data:
- Tier 1: Scrydex trend activity, price completeness, price spread (free)
- Tier 2: eBay concurrent supply, quantity sold (free)
- Tier 3: Scrydex sales velocity (3 credits, cached 7 days, auto-fetched for high-profit deals)
- Tiers are adjusted: illiquid → SLEEP, low → cap at FLIP, medium → GRAIL downgrades to HIT

---

## What NOT to build yet

- **Stage 10**: Authentication & deals API endpoints
- **Stage 11**: Deal lifecycle (expiry, pruning, SSE push)
- **Stage 12**: Dashboard UI to view deals
- **Stage 13**: Observability, Telegram notifications, accuracy tracking
