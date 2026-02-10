# Stage 8 Build Prompt — Scanner Pipeline (End to End)

> Paste this entire prompt into a fresh Claude Code session to build Stage 8.

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

This is **Stage 8 of 13**. You are building the scanner pipeline — the end-to-end orchestrator that ties together Stages 4–7 into a working arbitrage scanner. It searches eBay, extracts signals, matches against the card database, evaluates profit, and creates deals. After this stage, PokeSnipe will be autonomously finding real arbitrage opportunities.

**No new packages needed.** This stage wires together everything from Stages 4–7.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. Pure functions are tested with Vitest. The scanner is tested live on Railway by letting it run and checking deals in the database.

**IMPORTANT:** Build on top of the existing project. Do NOT re-initialize or overwrite existing files.

---

## Existing project structure (from Stages 1–7)

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
│   │   ├── title-cleaner.ts
│   │   ├── junk-detector.ts
│   │   ├── number-extractor.ts
│   │   ├── variant-detector.ts
│   │   ├── condition-mapper.ts
│   │   ├── structured-extractor.ts
│   │   ├── signal-merger.ts
│   │   └── index.ts                       ← extractSignals() pipeline
│   └── matching/                          ← Matching engine (done)
│       ├── candidate-lookup.ts            ← DB queries to find card candidates
│       ├── name-validator.ts              ← Jaro-Winkler name matching
│       ├── expansion-validator.ts         ← Expansion name matching
│       ├── variant-resolver.ts            ← Resolve to specific variant
│       ├── confidence-scorer.ts           ← Weighted geometric mean confidence
│       ├── gates.ts                       ← Confidence gates (pass/fail)
│       └── index.ts                       ← matchListing() pipeline
├── app.ts                                 ← Express app (done)
└── server.ts                              ← Boot sequence (done)
client/                                    ← React frontend (done)
```

---

## Reference: Deals table schema (already created in Stage 1 migrations)

The `deals` table already exists. You'll INSERT into it from `deal-creator.ts`:

```sql
CREATE TABLE deals (
  deal_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          BIGSERIAL,          -- Monotonic for SSE ordering
  ebay_item_id      TEXT NOT NULL UNIQUE,
  ebay_title        TEXT NOT NULL,
  card_id           TEXT REFERENCES cards(scrydex_card_id),
  variant_id        INTEGER REFERENCES variants(id),
  -- Status lifecycle
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'expired', 'sold', 'reviewed')),
  -- Pricing snapshot (frozen at creation)
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
  -- Match metadata
  confidence        NUMERIC(4,3),
  confidence_tier   TEXT CHECK (confidence_tier IN ('high', 'medium', 'low')),
  condition         TEXT CHECK (condition IN ('NM', 'LP', 'MP', 'HP', 'DM')),
  condition_source  TEXT,
  is_graded         BOOLEAN NOT NULL DEFAULT FALSE,
  grading_company   TEXT,
  grade             TEXT,
  liquidity_score   NUMERIC(4,3),
  liquidity_grade   TEXT CHECK (liquidity_grade IN ('high', 'medium', 'low', 'illiquid')),
  -- Trend snapshot
  trend_7d          NUMERIC(6,2),       -- % change over 7 days
  trend_30d         NUMERIC(6,2),       -- % change over 30 days
  -- Signals snapshot (for audit)
  match_signals     JSONB NOT NULL,
  -- eBay listing metadata
  ebay_image_url    TEXT,
  ebay_url          TEXT NOT NULL,
  seller_name       TEXT,
  seller_feedback   INTEGER,
  listed_at         TIMESTAMPTZ,
  -- Review state
  reviewed_at       TIMESTAMPTZ,
  is_correct_match  BOOLEAN,
  incorrect_reason  TEXT,
  -- All condition comps snapshot
  condition_comps   JSONB,              -- {"NM":{"low":45,"market":52},"LP":{...},...}
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '72 hours'
);

-- Indexes (already exist):
CREATE INDEX idx_deals_created ON deals (created_at DESC);
CREATE INDEX idx_deals_event ON deals (event_id DESC);
CREATE INDEX idx_deals_tier ON deals (tier);
CREATE INDEX idx_deals_status ON deals (status);
```

---

## Step 1: Create `src/services/scanner/deduplicator.ts`

Track which eBay item IDs have already been processed to avoid creating duplicate deals.

**Two-layer dedup:**
1. **In-memory `Set<string>`** — fast check for items seen in recent scan cycles
2. **DB check** — catches items from previous server restarts

```typescript
import pool from '../../db/pool.js';
import { logger } from '../../config/index.js'; // or however your logger is set up

const log = logger.child({ module: 'deduplicator' });

const seen = new Set<string>();
const MAX_SEEN = 10_000;

/**
 * Check if an eBay item has already been processed.
 * Returns true if duplicate (skip it), false if new.
 */
export async function isDuplicate(itemId: string): Promise<boolean> {
  // Layer 1: in-memory
  if (seen.has(itemId)) return true;

  // Layer 2: database
  const { rows } = await pool.query(
    'SELECT 1 FROM deals WHERE ebay_item_id = $1 LIMIT 1',
    [itemId]
  );
  if (rows.length > 0) {
    seen.add(itemId); // cache for future checks
    return true;
  }

  return false;
}

/**
 * Mark an item as processed (add to in-memory set).
 * Call this AFTER deciding to process the item (not after creating the deal).
 */
export function markProcessed(itemId: string): void {
  if (seen.size >= MAX_SEEN) {
    // Evict oldest entries (Set iterates in insertion order)
    const iterator = seen.values();
    const toEvict = seen.size - MAX_SEEN + 1000; // evict 1000 at a time
    for (let i = 0; i < toEvict; i++) {
      const val = iterator.next().value;
      if (val) seen.delete(val);
    }
    log.info({ evicted: toEvict, remaining: seen.size }, 'Evicted old entries from dedup set');
  }
  seen.add(itemId);
}

/**
 * Get current dedup set size (for diagnostics).
 */
export function getDedupStats(): { memorySize: number; maxSize: number } {
  return { memorySize: seen.size, maxSize: MAX_SEEN };
}
```

**Key points:**
- The `isDuplicate` + `markProcessed` pattern is intentional — we check first, then mark, so we can process the item in between
- The in-memory set is capped at 10,000 to prevent memory leaks on long-running processes
- Eviction removes the oldest 1,000 entries when the cap is hit (Set preserves insertion order)

---

## Step 2: Create `src/services/scanner/enrichment-gate.ts`

Decides whether a Phase 1 match (title-only) deserves a `getItem()` API call (Phase 2). This is a **pure function** — no I/O.

The gate balances finding deals vs. conserving eBay API budget (5,000 calls/day).

```typescript
export interface PhaseOneMatch {
  titleOnlyProfitPercent: number;
  confidence: { composite: number };
  isDuplicate: boolean;
}

export interface BudgetStatus {
  remaining: number;
}

/**
 * Should we spend a getItem() call on this listing?
 *
 * Normal mode: 15% profit threshold
 * Low budget mode (<500 remaining): 25% profit threshold
 *
 * Also requires minimum confidence of 0.50 and not a duplicate.
 */
export function shouldEnrich(match: PhaseOneMatch, budget: BudgetStatus): boolean {
  // If budget is low (<500 remaining), raise the threshold
  const profitThreshold = budget.remaining < 500 ? 25 : 15;

  return (
    match.titleOnlyProfitPercent >= profitThreshold &&
    match.confidence.composite >= 0.50 &&
    !match.isDuplicate
  );
}
```

**Budget-aware logic:**
- Normal operation (500+ calls left): enrich anything with ≥15% title-only profit and ≥0.50 confidence
- Low budget (<500 calls left): raise threshold to ≥25% — only enrich high-potential deals
- Always skip duplicates — no point enriching something we've already processed

---

## Step 3: Create `src/services/scanner/tier-classifier.ts`

Assign a deal tier based on profit percentage and confidence. This is a **pure function**.

> Note: Stage 4 may already have a tier classifier in `src/services/pricing/`. This Stage 8 version adds confidence requirements. If Stage 4 already exports `classifyTier`, you can either:
> (a) Extend the existing function with confidence parameters, OR
> (b) Create a new `src/services/scanner/tier-classifier.ts` that wraps or replaces it.
>
> Choose whichever approach is cleaner. The key requirement is the logic below.

```typescript
export type DealTier = 'GRAIL' | 'HIT' | 'FLIP' | 'SLEEP';

/**
 * Classify a deal into a tier based on profit % and confidence.
 *
 * Thresholds:
 *   GRAIL: >40% profit AND ≥0.85 confidence
 *   HIT:   >25% profit AND ≥0.65 confidence
 *   FLIP:  >15% profit (any confidence)
 *   SLEEP: 5-15% profit (any confidence)
 *
 * The liquidityGrade parameter is a placeholder for Stage 9.
 * In Stage 9, liquidity will further constrain tiers:
 *   illiquid → cap at SLEEP
 *   low → cap at FLIP
 *   medium → GRAIL downgrades to HIT
 */
export function classifyTier(
  profitPercent: number,
  confidence: number,
  liquidityGrade: string
): DealTier {
  // For now, classify on profit + confidence only
  // (Stage 9 will add liquidity adjustments)
  if (profitPercent > 40 && confidence >= 0.85) return 'GRAIL';
  if (profitPercent > 25 && confidence >= 0.65) return 'HIT';
  if (profitPercent > 15) return 'FLIP';
  return 'SLEEP';
}
```

---

## Step 4: Create `src/services/scanner/deal-creator.ts`

Insert a new deal into the `deals` table with full pricing snapshot and audit trail.

```typescript
import pool from '../../db/pool.js';
import { logger } from '../../config/index.js';

const log = logger.child({ module: 'deal-creator' });

export interface DealInput {
  // eBay listing data
  ebayItemId: string;
  ebayTitle: string;
  ebayPriceGBP: number;
  ebayShippingGBP: number;
  ebayImageUrl?: string;
  ebayUrl: string;
  sellerName?: string;
  sellerFeedback?: number;
  listedAt?: string;
  // Card match data
  cardId: string;
  variantId: number;
  // Pricing data
  buyerProtFee: number;
  totalCostGBP: number;
  marketPriceUSD: number;
  marketPriceGBP: number;
  exchangeRate: number;
  profitGBP: number;
  profitPercent: number;
  // Match metadata
  tier: string;
  confidence: number;
  confidenceTier: string;
  condition: string;
  conditionSource: string;
  isGraded: boolean;
  gradingCompany?: string;
  grade?: string;
  // Signals audit trail
  matchSignals: Record<string, unknown>;
  // Condition comps snapshot (all conditions, not just matched)
  conditionComps?: Record<string, unknown>;
}

export interface Deal {
  dealId: string;
  eventId: number;
  ebayItemId: string;
  tier: string;
  profitGBP: number;
  profitPercent: number;
  createdAt: Date;
}

/**
 * Insert a new deal into the deals table.
 * Returns the created deal with event_id (for SSE push in Stage 11).
 */
export async function createDeal(data: DealInput): Promise<Deal> {
  const { rows } = await pool.query(
    `INSERT INTO deals (
      ebay_item_id, ebay_title, card_id, variant_id,
      ebay_price_gbp, ebay_shipping_gbp, buyer_prot_fee, total_cost_gbp,
      market_price_usd, market_price_gbp, exchange_rate,
      profit_gbp, profit_percent, tier,
      confidence, confidence_tier, condition, condition_source,
      is_graded, grading_company, grade,
      match_signals, condition_comps,
      ebay_image_url, ebay_url, seller_name, seller_feedback, listed_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14,
      $15, $16, $17, $18,
      $19, $20, $21,
      $22, $23,
      $24, $25, $26, $27, $28
    ) RETURNING deal_id, event_id, ebay_item_id, tier, profit_gbp, profit_percent, created_at`,
    [
      data.ebayItemId, data.ebayTitle, data.cardId, data.variantId,
      data.ebayPriceGBP, data.ebayShippingGBP, data.buyerProtFee, data.totalCostGBP,
      data.marketPriceUSD, data.marketPriceGBP, data.exchangeRate,
      data.profitGBP, data.profitPercent, data.tier,
      data.confidence, data.confidenceTier, data.condition, data.conditionSource,
      data.isGraded, data.gradingCompany || null, data.grade || null,
      JSON.stringify(data.matchSignals), data.conditionComps ? JSON.stringify(data.conditionComps) : null,
      data.ebayImageUrl || null, data.ebayUrl, data.sellerName || null, data.sellerFeedback || null, data.listedAt || null
    ]
  );

  const deal = rows[0];
  log.info(
    { dealId: deal.deal_id, eventId: deal.event_id, tier: deal.tier, profit: deal.profit_gbp },
    'Deal created'
  );

  return {
    dealId: deal.deal_id,
    eventId: deal.event_id,
    ebayItemId: deal.ebay_item_id,
    tier: deal.tier,
    profitGBP: parseFloat(deal.profit_gbp),
    profitPercent: parseFloat(deal.profit_percent),
    createdAt: deal.created_at,
  };
}
```

**Key points:**
- The `RETURNING` clause gives us the `event_id` (auto-incrementing BIGSERIAL) which will be used for SSE ordering in Stage 11
- All pricing fields are frozen at deal creation time — they represent a snapshot, not live values
- `match_signals` JSONB stores the full audit trail: extraction signals, confidence breakdown, enrichment data
- `condition_comps` JSONB stores all condition price comparisons (not just the matched condition)
- If INSERT fails due to `UNIQUE(ebay_item_id)` constraint, the deduplicator missed it — catch and log, don't crash

**Error handling:** Wrap the INSERT in a try/catch. If it fails with a unique constraint violation (code `23505`), log a warning and return null — the deduplicator will catch most duplicates, but a race condition between parallel scans could cause this.

```typescript
// Add this error handling around the INSERT:
try {
  // ... the INSERT query above ...
} catch (err: any) {
  if (err.code === '23505') {
    // Duplicate ebay_item_id — race condition, not a real error
    log.warn({ ebayItemId: data.ebayItemId }, 'Duplicate deal (race condition)');
    return null as any; // or adjust return type to Promise<Deal | null>
  }
  throw err; // re-throw other errors
}
```

---

## Step 5: Create `src/services/scanner/scanner-service.ts`

The main scanner orchestrator. This implements the **two-phase pipeline**:

- **Phase 1** (cheap): Search eBay → extract signals from titles → match against card DB → estimate profit
- **Phase 2** (expensive): For promising matches, call `getItem()` for full listing data → re-extract → re-match → calculate real profit → create deal

```typescript
import { logger } from '../../config/index.js';
import { isDuplicate, markProcessed } from './deduplicator.js';
import { shouldEnrich } from './enrichment-gate.js';
import { classifyTier } from './tier-classifier.js';
import { createDeal } from './deal-creator.js';

// Import from existing stages — adjust paths to match your actual exports:
import { searchItems, getItem } from '../ebay/client.js';          // Stage 5
import { canMakeCall, trackCall, getBudgetStatus } from '../ebay/budget.js';  // Stage 5
import { extractSignals } from '../extraction/index.js';           // Stage 6
import { matchListing } from '../matching/index.js';               // Stage 7
import { calculateProfit } from '../pricing/engine.js';            // Stage 4
import { getValidRate } from '../exchange-rate/index.js';          // Stage 4

const log = logger.child({ module: 'scanner' });

export interface ScanResult {
  dealsCreated: number;
  listingsProcessed: number;
  enrichmentCalls: number;
  skippedDuplicate: number;
  skippedJunk: number;
  skippedNoMatch: number;
  skippedGate: number;
  errors: number;
}

/**
 * Run a single scan cycle.
 *
 * 1. Search eBay for Pokemon card listings (1 API call, up to 200 results)
 * 2. For each listing:
 *    a. Dedup check
 *    b. Extract signals from title (Phase 1)
 *    c. Match against card database
 *    d. Quick profit estimate (title-parsed condition or default LP)
 *    e. Enrichment gate — should we spend a getItem() call?
 *    f. If yes: getItem() → re-extract → re-match → real profit → create deal
 */
export async function runScanCycle(): Promise<ScanResult> {
  const stats: ScanResult = {
    dealsCreated: 0,
    listingsProcessed: 0,
    enrichmentCalls: 0,
    skippedDuplicate: 0,
    skippedJunk: 0,
    skippedNoMatch: 0,
    skippedGate: 0,
    errors: 0,
  };

  // Step 1: Check budget
  if (!canMakeCall()) {
    log.warn('Budget exhausted, skipping scan cycle');
    return stats;
  }

  // Step 2: Search eBay — PHASE 1
  // Search for Pokemon TCG single cards on eBay UK
  // Adjust the search query and filters to match your eBay client's API.
  // The key parameters: category for Pokemon TCG, Buy It Now, sorted by newest
  let listings;
  try {
    listings = await searchItems({
      q: 'pokemon card',
      limit: 200,
      filter: [
        'buyingOptions:{FIXED_PRICE}',        // Buy It Now only
        'deliveryCountry:GB',                  // UK listings
        'conditions:{USED}',                   // singles, not sealed
        'price:[0.50..500]',                   // reasonable price range (GBP)
        'priceCurrency:GBP',
      ],
      sort: 'newlyListed',
    });
    trackCall(); // 1 search call used
  } catch (err) {
    log.error({ err }, 'eBay search failed');
    stats.errors++;
    return stats;
  }

  if (!listings?.itemSummaries?.length) {
    log.info('No listings returned from eBay search');
    return stats;
  }

  log.info({ count: listings.itemSummaries.length }, 'Processing listings from eBay');

  // Step 3: Process each listing
  for (const listing of listings.itemSummaries) {
    stats.listingsProcessed++;

    try {
      // 3a. Dedup check
      if (await isDuplicate(listing.itemId)) {
        stats.skippedDuplicate++;
        continue;
      }
      markProcessed(listing.itemId);

      // 3b. Extract signals from title (Phase 1 — title only)
      const signals = extractSignals(listing);
      if (signals.rejected) {
        stats.skippedJunk++;
        continue;
      }

      // 3c. Match against card database
      const match = await matchListing(signals);
      if (!match) {
        stats.skippedNoMatch++;
        continue;
      }

      // 3d. Quick profit estimate (title-parsed condition or default LP)
      const ebayPriceGBP = parseFloat(listing.price?.value || '0');
      const ebayShippingGBP = parseFloat(listing.shippingOptions?.[0]?.shippingCost?.value || '0');
      const titleCondition = signals.condition?.condition || 'LP';

      const quickProfit = calculateProfit({
        ebayPriceGBP,
        shippingGBP: ebayShippingGBP,
        condition: titleCondition,
        variantPrices: match.variant.prices,
        exchangeRate: await getValidRate(),
      });

      // 3e. Enrichment gate — should we spend a getItem() call?
      if (!shouldEnrich(
        {
          titleOnlyProfitPercent: quickProfit.profitPercent,
          confidence: match.confidence,
          isDuplicate: false,
        },
        getBudgetStatus()
      )) {
        stats.skippedGate++;
        continue;
      }

      // 3f. PHASE 2 — Enrichment: call getItem() for full listing data
      if (!canMakeCall()) {
        log.warn('Budget exhausted mid-cycle, stopping enrichment');
        break;
      }

      let enriched;
      try {
        enriched = await getItem(listing.itemId);
        trackCall(); // 1 getItem call used
        stats.enrichmentCalls++;
      } catch (err) {
        log.warn({ err, itemId: listing.itemId }, 'getItem failed, skipping');
        stats.errors++;
        continue;
      }

      // Re-extract signals with enriched data (condition descriptors, full description, etc.)
      const enrichedSignals = extractSignals({ ...listing, ...enriched });

      // Re-match with enriched signals
      const enrichedMatch = await matchListing(enrichedSignals);
      if (!enrichedMatch) {
        stats.skippedNoMatch++;
        continue;
      }

      // Recalculate profit with real condition from enrichment
      const realCondition = enrichedSignals.condition?.condition || titleCondition;
      const exchangeRate = await getValidRate();
      const realProfit = calculateProfit({
        ebayPriceGBP,
        shippingGBP: ebayShippingGBP,
        condition: realCondition,
        variantPrices: enrichedMatch.variant.prices,
        exchangeRate,
      });

      // Skip if not profitable after enrichment
      if (realProfit.profitPercent < 5) continue;

      // 3g. Classify tier and create deal
      const tier = classifyTier(
        realProfit.profitPercent,
        enrichedMatch.confidence.composite,
        'unknown' // liquidity — placeholder until Stage 9
      );

      const confidenceTier =
        enrichedMatch.confidence.composite >= 0.85 ? 'high' :
        enrichedMatch.confidence.composite >= 0.65 ? 'medium' : 'low';

      const deal = await createDeal({
        ebayItemId: listing.itemId,
        ebayTitle: listing.title,
        ebayPriceGBP,
        ebayShippingGBP,
        ebayImageUrl: listing.image?.imageUrl || listing.thumbnailImages?.[0]?.imageUrl,
        ebayUrl: listing.itemWebUrl,
        sellerName: listing.seller?.username,
        sellerFeedback: listing.seller?.feedbackScore,
        listedAt: listing.itemCreationDate,
        cardId: enrichedMatch.card.scrydexCardId,
        variantId: enrichedMatch.variant.id,
        buyerProtFee: realProfit.buyerProtFee,
        totalCostGBP: realProfit.totalCostGBP,
        marketPriceUSD: realProfit.marketPriceUSD,
        marketPriceGBP: realProfit.marketPriceGBP,
        exchangeRate,
        profitGBP: realProfit.profitGBP,
        profitPercent: realProfit.profitPercent,
        tier,
        confidence: enrichedMatch.confidence.composite,
        confidenceTier,
        condition: realCondition,
        conditionSource: enrichedSignals.condition?.source || 'default',
        isGraded: enrichedSignals.isGraded || false,
        gradingCompany: enrichedSignals.gradingCompany,
        grade: enrichedSignals.grade,
        matchSignals: {
          extraction: enrichedSignals,
          confidence: enrichedMatch.confidence,
          phaseOneProfit: quickProfit,
          phaseTwoProfit: realProfit,
          enrichmentUsed: true,
        },
        conditionComps: realProfit.conditionComps,
      });

      if (deal) {
        stats.dealsCreated++;
        log.info(
          { dealId: deal.dealId, tier, profit: deal.profitGBP, confidence: enrichedMatch.confidence.composite },
          'New deal found'
        );
      }
    } catch (err) {
      log.error({ err, itemId: listing.itemId }, 'Error processing listing');
      stats.errors++;
    }
  }

  return stats;
}
```

**Important notes on adapting this to your actual code:**
- The import paths above are approximate — adjust them to match your actual file structure and export names from Stages 4–7
- The `listing` object fields (`itemId`, `price.value`, `shippingOptions`, `image`, `seller`, etc.) follow the eBay Browse API response shape from Stage 5
- The `calculateProfit` function signature should match what Stage 4 built — the key inputs are eBay price, shipping, condition, variant prices, and exchange rate
- The `matchListing` function from Stage 7 returns a match object with `card`, `variant`, `confidence` — adapt field names to what Stage 7 actually exports
- The `extractSignals` function from Stage 6 takes a listing object and returns normalized signals — adapt to actual interface

**The pipeline must be resilient:** Each listing is processed independently. If one fails, log the error and continue to the next. Never let a single bad listing crash the entire scan cycle.

---

## Step 6: Create `src/services/scanner/scan-loop.ts`

Runs the scanner on a 5-minute interval with overlap protection.

```typescript
import { logger } from '../../config/index.js';
import { runScanCycle } from './scanner-service.js';
import { getDedupStats } from './deduplicator.js';

const log = logger.child({ module: 'scan-loop' });

let isRunning = false;
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start the scan loop. Runs immediately, then every 5 minutes.
 * Overlap protection ensures only one scan runs at a time.
 */
export function startScanLoop(): void {
  log.info({ intervalMs: SCAN_INTERVAL_MS }, 'Starting scan loop');

  // Run first scan immediately
  runOnce();

  // Then schedule recurring scans
  setInterval(runOnce, SCAN_INTERVAL_MS);
}

async function runOnce(): Promise<void> {
  if (isRunning) {
    log.warn('Previous scan still running, skipping this cycle');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const result = await runScanCycle();
    const durationMs = Date.now() - startTime;
    const dedupStats = getDedupStats();

    log.info(
      {
        ...result,
        durationMs,
        dedupMemorySize: dedupStats.memorySize,
      },
      'Scan cycle complete'
    );
  } catch (err) {
    log.error({ err }, 'Scan cycle failed unexpectedly');
  } finally {
    isRunning = false;
  }
}
```

**Key points:**
- `isRunning` flag prevents overlapping scans — if a scan takes longer than 5 minutes, the next interval is skipped
- First scan runs immediately on startup (don't wait 5 minutes for the first results)
- Duration logging helps monitor scan performance
- The `finally` block ensures `isRunning` is always reset, even on unexpected errors

---

## Step 7: Create `src/services/scanner/index.ts`

Re-export the public API for the scanner module.

```typescript
export { startScanLoop } from './scan-loop.js';
export { runScanCycle } from './scanner-service.js';
export { shouldEnrich } from './enrichment-gate.js';
export { classifyTier } from './tier-classifier.js';
export { getDedupStats } from './deduplicator.js';
```

---

## Step 8: Wire into boot sequence

In `src/server.ts`, import and start the scan loop after the server is listening and any startup tasks (like card sync) are complete.

```typescript
import { startScanLoop } from './services/scanner/index.js';

// ... existing boot sequence ...

// After server.listen() and after card sync completes:
startScanLoop();
log.info('Scanner loop started');
```

**Placement:** The scan loop should start AFTER:
1. Database connection is established
2. Migrations have run
3. Server is listening (health check works)
4. Initial card sync is complete (or at least scheduled)

This ensures the scanner has cards to match against when it runs.

---

## Step 9: Write Vitest pure function tests

Create tests for the two pure functions: `enrichment-gate` and `tier-classifier`.

### `src/__tests__/stage8/enrichment-gate.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { shouldEnrich } from '../../services/scanner/enrichment-gate.js';

describe('enrichment-gate', () => {
  const match = (profit: number, confidence: number, isDuplicate = false) => ({
    titleOnlyProfitPercent: profit,
    confidence: { composite: confidence },
    isDuplicate,
  });

  const budget = (remaining: number) => ({ remaining });

  describe('normal budget (≥500 remaining)', () => {
    it('enriches profitable + confident matches', () => {
      expect(shouldEnrich(match(20, 0.80), budget(4000))).toBe(true);
    });

    it('skips low profit (<15%)', () => {
      expect(shouldEnrich(match(10, 0.80), budget(4000))).toBe(false);
    });

    it('skips low confidence (<0.50)', () => {
      expect(shouldEnrich(match(30, 0.40), budget(4000))).toBe(false);
    });

    it('skips duplicates', () => {
      expect(shouldEnrich(match(30, 0.80, true), budget(4000))).toBe(false);
    });

    it('enriches at exactly 15% threshold', () => {
      expect(shouldEnrich(match(15, 0.50), budget(500))).toBe(true);
    });
  });

  describe('low budget (<500 remaining)', () => {
    it('raises threshold to 25%', () => {
      expect(shouldEnrich(match(20, 0.80), budget(300))).toBe(false); // 20% < 25%
    });

    it('enriches at 25%+ with low budget', () => {
      expect(shouldEnrich(match(30, 0.80), budget(300))).toBe(true);  // 30% ≥ 25%
    });

    it('still requires minimum confidence', () => {
      expect(shouldEnrich(match(30, 0.40), budget(300))).toBe(false);
    });
  });
});
```

### `src/__tests__/stage8/tier-classifier.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { classifyTier } from '../../services/scanner/tier-classifier.js';

describe('tier-classifier', () => {
  it('classifies GRAIL (>40% profit + ≥0.85 confidence)', () => {
    expect(classifyTier(45, 0.90, 'high')).toBe('GRAIL');
  });

  it('downgrades high-profit low-confidence to HIT', () => {
    expect(classifyTier(45, 0.70, 'high')).toBe('HIT'); // >40% but <0.85 confidence
  });

  it('classifies HIT (>25% profit + ≥0.65 confidence)', () => {
    expect(classifyTier(30, 0.70, 'high')).toBe('HIT');
  });

  it('downgrades medium-profit low-confidence to FLIP', () => {
    expect(classifyTier(30, 0.50, 'high')).toBe('FLIP'); // >25% but <0.65 confidence
  });

  it('classifies FLIP (>15% profit)', () => {
    expect(classifyTier(20, 0.60, 'high')).toBe('FLIP');
  });

  it('classifies SLEEP (5-15% profit)', () => {
    expect(classifyTier(10, 0.50, 'high')).toBe('SLEEP');
  });

  it('classifies very low profit as SLEEP', () => {
    expect(classifyTier(6, 0.90, 'high')).toBe('SLEEP');
  });

  it('handles boundary: exactly 40% + high confidence', () => {
    expect(classifyTier(40, 0.85, 'high')).toBe('HIT'); // NOT GRAIL (must be >40%, not ≥40%)
  });

  it('handles boundary: exactly 25% + medium confidence', () => {
    expect(classifyTier(25, 0.65, 'high')).toBe('FLIP'); // NOT HIT (must be >25%)
  });

  it('handles boundary: exactly 15%', () => {
    expect(classifyTier(15, 0.50, 'high')).toBe('SLEEP'); // NOT FLIP (must be >15%)
  });
});
```

Run the tests:

```bash
npm test -- --run src/__tests__/stage8/
```

All tests should pass. These are pure functions with no I/O — they test the decision logic in isolation.

---

## Step 10: Verify on Railway

After pushing to GitHub and Railway auto-deploys:

### 10a. Check deployment health

```bash
curl https://<RAILWAY_URL>/healthz
# ✅ Should return {"status":"ok",...}
```

### 10b. Check logs for scanner startup

In the Railway dashboard, check the deployment logs. You should see:
```
Starting scan loop { intervalMs: 300000 }
```
And within a few seconds, the first scan cycle:
```
Processing listings from eBay { count: 200 }
Scan cycle complete { dealsCreated: N, listingsProcessed: 200, enrichmentCalls: M, ... }
```

### 10c. Let the scanner run for 30+ minutes (6+ cycles)

Then check deals were created:

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM deals;"
# ✅ Should have deals (exact count depends on current eBay listings)
```

### 10d. Inspect deal quality

```bash
psql $DATABASE_URL -c "
  SELECT ebay_title, ebay_price_gbp, market_price_gbp, profit_gbp, profit_percent, tier, condition, confidence
  FROM deals
  ORDER BY created_at DESC
  LIMIT 5;
"
```

Verify manually:
- `profit_gbp` ≈ `market_price_gbp - total_cost_gbp` (where total_cost = price + shipping + buyer protection fee)
- `tier` matches the profit thresholds: GRAIL >40%, HIT >25%, FLIP >15%, SLEEP 5-15%
- `condition` is NM/LP/MP/HP (not null)
- `confidence` is between 0 and 1

### 10e. Check audit trail

```bash
psql $DATABASE_URL -c "SELECT match_signals FROM deals ORDER BY created_at DESC LIMIT 1;"
```

The `match_signals` JSONB should contain:
- `extraction` — the signal extraction output
- `confidence` — the confidence breakdown (name, number, expansion, variant, etc.)
- `phaseOneProfit` — the quick profit estimate from Phase 1
- `phaseTwoProfit` — the real profit after enrichment
- `enrichmentUsed: true`

### 10f. Check no duplicate deals

```bash
psql $DATABASE_URL -c "SELECT ebay_item_id, COUNT(*) FROM deals GROUP BY ebay_item_id HAVING COUNT(*) > 1;"
# ✅ Should return 0 rows (no duplicates)
```

### 10g. Check budget tracking in logs

In the Railway logs, look for scan cycle summaries. The `enrichmentCalls` count shows how many getItem() calls were made per cycle. Over time:
- Budget should not exceed 5,000 calls/day
- Each cycle uses 1 (search) + N (getItem) calls
- With 288 cycles/day and ~10 enrichments per cycle, that's ~3,168 calls — well within budget

---

## Deliverable

A working arbitrage scanner that:
1. Searches eBay every 5 minutes for Pokemon card listings
2. Extracts signals from titles and matches against the card database
3. Uses a two-phase pipeline: cheap title-only matching → expensive enrichment for promising matches
4. Creates deals in the database with full pricing snapshots and audit trails
5. Respects eBay API budget constraints with an adaptive enrichment gate
6. Prevents duplicate deals with two-layer deduplication
7. Is resilient — a single bad listing never crashes the scan cycle

---

## What NOT to build yet

- **Stage 9**: Liquidity engine and sales velocity scoring — the `liquidityGrade` parameter in `classifyTier` is a placeholder
- **Stage 10**: Auth and deals API — no REST endpoints for deals yet
- **Stage 11**: Deal lifecycle (expiry, pruning, SSE push)
- **Stage 12**: Dashboard UI to view deals
- **Stage 13**: Observability, Telegram notifications, accuracy tracking
