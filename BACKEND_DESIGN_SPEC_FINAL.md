# PokeSnipe Backend Design Specification — Final Production Build

> **Status:** Production-ready specification
> **Supersedes:** Ground-up redesign section of `ARBITRAGE_SCANNER_REVIEW.md`
> **Incorporates:** Team review observations, Scrydex API documentation cross-reference, eBay Browse API best practices

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Scrydex Integration](#2-scrydex-integration)
3. [eBay Integration](#3-ebay-integration)
4. [Matching Engine](#4-matching-engine)
5. [Pricing Engine](#5-pricing-engine)
6. [Liquidity Engine](#6-liquidity-engine)
7. [Deal Lifecycle](#7-deal-lifecycle)
8. [Card Catalog](#8-card-catalog)
9. [Database Schema](#9-database-schema)
10. [API Contract](#10-api-contract)
11. [Authentication & Security](#11-authentication--security)
12. [Observability](#12-observability)
13. [Testing Strategy](#13-testing-strategy)
14. [Configuration & Deployment](#14-configuration--deployment)

---

## 1. Architecture Overview

### Core Philosophy

**Scrydex-first, eBay-second.** Scrydex has already done the hard work of matching eBay sold listings to card IDs with correct variant, condition, and grading info. Our pipeline leverages this:

```
Know the card → Know the real comps → Search eBay for underpriced listings
```

NOT the old approach:

```
Search eBay → Guess which card it is → Guess the price
```

### System Layers

```
┌─────────────────────────────────────────────────────────────┐
│  API Layer (Express)                                         │
│  REST endpoints + SSE streams + Card Catalog (public)        │
├─────────────────────────────────────────────────────────────┤
│  Service Layer                                               │
│  ScannerService · SyncService · MatchingEngine               │
│  PricingEngine · LiquidityEngine · DealManager               │
│  CatalogService · NotificationService                        │
├─────────────────────────────────────────────────────────────┤
│  Domain Layer (pure functions, zero I/O)                     │
│  Signal extraction · Confidence scoring · Buyer Protection   │
│  Name validation · Variant resolution · Tier classification  │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                        │
│  ScrydexClient · EbayClient · PostgreSQL pool                │
│  ExchangeRateService · TelegramClient · RateLimiter          │
└─────────────────────────────────────────────────────────────┘
```

### Process Lifecycle

```
Boot sequence:
  1. Validate config (Zod) — fail fast on missing env vars
  2. Connect PostgreSQL — run pending migrations
  3. Load exchange rate — halt if stale and no fresh rate available
  4. Start Express server — health endpoint live
  5. Check card index freshness — trigger sync if stale (>48h)
  6. Start scanner loop — begin eBay polling
  7. Start scheduled jobs — daily hot refresh, weekly full sync

Shutdown:
  1. Stop accepting new requests
  2. Complete in-flight scan cycle
  3. Flush pending deal writes
  4. Close SSE connections gracefully
  5. Close DB pool
```

### Data Flow — Deal Discovery Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  eBay Search  │────▶│  Filter &    │────▶│  Match vs    │
│  (200/query,  │     │  Deduplicate │     │  Local Index │
│  newlyListed) │     │  (bulk/dupe) │     │  (0 credits) │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                              ┌────────────────────┘
                              ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  Enrich via  │────▶│  Price with   │
                     │  getItem()   │     │  REAL comps   │
                     │  (top hits)  │     │  per condition │
                     └──────────────┘     └──────┬───────┘
                                                  │
                              ┌────────────────────┘
                              ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  Assess      │────▶│  Create Deal  │
                     │  Liquidity   │     │  + SSE Push   │
                     │  (real data) │     │  + Telegram   │
                     └──────────────┘     └──────────────┘
```

---

## 2. Scrydex Integration

### 2.1 Rate Limiting — Corrected

**Problem identified:** The beta throttled at 5 req/sec. Scrydex allows 100 req/sec.

From `scrydex-docs/rate-limits.txt`:
> Per-Second Limit: 100 requests per second across all endpoints.

**Corrected implementation:**

```typescript
// scrydexClient.ts
const limiter = new TokenBucket({
  capacity: 80,        // 80 tokens max (20% headroom from 100 limit)
  refillRate: 80,      // 80 tokens per second
});
```

**Credit budget** is the real constraint, not request rate:
- Monthly budget: 50,000 credits
- Full sync: ~400 credits (1 credit per page of 100 cards)
- Weekly resync: ~400 credits
- Daily hot refresh (10 sets): ~50 credits
- Listings calls: ~150-300 credits/month
- Monthly total: ~2,500 credits = **5% of budget**

### 2.2 URL Path Language Scoping

From `scrydex-docs/pokemon-api-reference.txt:26-34`, language scoping uses URL path, not query param:

```
CORRECT:  /pokemon/v1/en/cards
WRONG:    /pokemon/v1/cards?language=en
```

All Scrydex requests must use the path-based approach:

```typescript
const SCRYDEX_BASE = 'https://api.scrydex.com/pokemon/v1/en';

// Endpoints:
// GET /pokemon/v1/en/cards?page_size=100&page=1&include=prices
// GET /pokemon/v1/en/expansions?page_size=100
// GET /pokemon/v1/en/cards/{id}/listings?days=30&source=ebay
```

### 2.3 Card Sync — Full Pricing Storage

**Critical fix:** Store ALL price entries per variant, not just `prices[0]`.

Scrydex returns per-condition pricing for each variant:

```json
{
  "variant": "holofoil",
  "prices": [
    { "condition": "NM", "type": "raw", "low": 45.00, "market": 52.00, "currency": "USD" },
    { "condition": "LP", "type": "raw", "low": 30.00, "market": 38.00, "currency": "USD" },
    { "condition": "MP", "type": "raw", "low": 18.00, "market": 24.00, "currency": "USD" },
    { "condition": "HP", "type": "raw", "low": 8.00, "market": 12.00, "currency": "USD" },
    { "condition": "NM", "type": "graded", "company": "PSA", "grade": "10", "low": 200.00, "market": 280.00 }
  ]
}
```

**Storage structure on the `variants` table:**

```typescript
// prices JSONB column structure:
{
  "raw": {
    "NM": { "low": 45.00, "market": 52.00 },
    "LP": { "low": 30.00, "market": 38.00 },
    "MP": { "low": 18.00, "market": 24.00 },
    "HP": { "low": 8.00,  "market": 12.00 }
  },
  "graded": {
    "PSA_10": { "low": 200.00, "market": 280.00 },
    "PSA_9":  { "low": 90.00,  "market": 120.00 },
    "CGC_9.5": { "low": 100.00, "market": 140.00 }
  }
}
```

**No more fabricated condition multipliers.** The old approach:

```typescript
// WRONG — deleted:
const deriveComps = (prices) => ({
  NM: market,
  LP: market * 0.85,   // fabricated
  MP: market * 0.62,   // fabricated
  HP: market * 0.40    // fabricated
});
```

Is replaced by real Scrydex data per condition.

### 2.4 Trend Data Storage

Scrydex pricing includes trend objects. These MUST be stored, not discarded.

```json
{
  "trends": {
    "1d":   { "price_change": 0.50, "percent_change": 1.2 },
    "7d":   { "price_change": 2.00, "percent_change": 4.8 },
    "14d":  { "price_change": -1.50, "percent_change": -3.5 },
    "30d":  { "price_change": 5.00, "percent_change": 12.1 },
    "90d":  { "price_change": 8.00, "percent_change": 20.0 },
    "180d": { "price_change": 12.00, "percent_change": 30.5 }
  }
}
```

**Storage:** `trends` JSONB column on the `variants` table, keyed by condition:

```typescript
// trends JSONB column structure:
{
  "NM": {
    "1d":   { "price_change": 0.50, "percent_change": 1.2 },
    "7d":   { "price_change": 2.00, "percent_change": 4.8 },
    "30d":  { "price_change": 5.00, "percent_change": 12.1 },
    "90d":  { "price_change": 8.00, "percent_change": 20.0 },
    "180d": { "price_change": 12.00, "percent_change": 30.5 }
  },
  "LP": { ... }
}
```

**Usage in deal evaluation:**
- A card trending up 20% over 7 days is a better buy than one trending down 30%
- Trend data feeds into both the liquidity engine and the deal detail UI
- The old `min(1, marketPriceUsd / 100)` formula for "trend" is deleted

### 2.5 Scrydex Listings Endpoint — Systematic Use

From `scrydex-docs/listings.txt`, the `/cards/<id>/listings` endpoint returns actual sold eBay listings already matched to cards:

```
Fields: card_id, source ("ebay"), title, variant, price, currency, sold_at,
        company (PSA/CGC/BGS), grade, is_perfect, is_error, is_signed
Filters: days, source, variant, grade, company, condition
Cost: 3 credits per call
```

**Integration strategy — three tiers of usage:**

| Tier | When | Budget Impact |
|------|------|---------------|
| **On-demand** | User clicks "Fetch velocity" in deal detail panel | ~50 calls/month = 150 credits |
| **Auto-enrich** | Deal profit >£10, confidence ≥ medium, no cached data | ~100 calls/month = 300 credits |
| **Batch pre-fetch** | Weekly: top 200 most-matched cards | ~200 calls/month = 600 credits |

Total: ~1,050 credits/month = **2% of budget**

**Cache:** Results stored in `sales_velocity_cache` table with 7-day TTL per card+variant.

**What this gives us that we currently lack:**
- Real sold comps (not fabricated condition multipliers)
- Real velocity (sold listings per day/week, not `null`)
- Real liquidity based on actual transaction volume
- Correct variant matching (Scrydex knows holofoil vs reverse holo)
- Graded vs raw distinction with real price data

### 2.6 Sync Service — Batch Inserts

**Problem identified:** Individual INSERTs in a loop = 50,000+ round-trips for a full sync.

**Fix:** Batch inserts with 100 rows per statement:

```typescript
async function batchUpsertCards(cards: LocalCard[]): Promise<number> {
  const BATCH_SIZE = 100;
  let totalUpserted = 0;

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);

    // Build multi-row VALUES clause
    const values = batch.map((card, idx) => {
      const offset = idx * 10; // number of params per card
      return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5},
              $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10})`;
    }).join(', ');

    const params = batch.flatMap(card => [
      card.scrydexId, card.name, card.number, card.numberNormalized,
      card.expansionId, card.printedTotal, card.rarity, card.supertype,
      card.imageSmall, card.imageLarge
    ]);

    await db.query(`
      INSERT INTO cards (scrydex_card_id, name, number, number_normalized,
        expansion_id, printed_total, rarity, supertype, image_small, image_large)
      VALUES ${values}
      ON CONFLICT (scrydex_card_id) DO UPDATE SET
        name = EXCLUDED.name,
        number = EXCLUDED.number,
        market_price_usd = EXCLUDED.market_price_usd,
        last_synced_at = NOW()
    `, params);

    totalUpserted += batch.length;
  }

  return totalUpserted;
}
```

Same pattern for variants and their prices/trends. Reduces sync time from minutes to seconds.

### 2.7 Sync Schedule

| Sync Type | Frequency | Credits | What It Does |
|-----------|-----------|---------|--------------|
| **Full sync** | Weekly (Sun 03:00 UK) | ~400 | All expansions + all cards + all prices + all trends |
| **Hot refresh** | Daily (03:00 UK) | ~50 | 10 most recent expansions only |
| **Expansion check** | Daily (04:00 UK) | ~4 | Check for new expansions, sync if found |
| **Listings pre-fetch** | Weekly (Sun 05:00 UK) | ~600 | Top 200 most-matched cards velocity data |
| **Initial sync** | On first boot | ~400 | Full catalog build |

All syncs are idempotent via `ON CONFLICT ... DO UPDATE`.

---

## 3. eBay Integration

### 3.1 Search Optimization

**Three fixes** from team review, all validated against eBay Browse API docs:

#### Fix 1: Increase results per query (25 → 200)

eBay supports up to 200 results per request. Same API call cost, 8x more coverage:

```typescript
const listings = await searchItems('pokemon', 200, {
  categoryId: '183454',  // Individual Trading Cards
  sort: 'newlyListed',
  filter: buildFilterString()
});
```

#### Fix 2: Sort by `newlyListed`

Default "Best Match" ordering is useless for arbitrage. Fresh listings before competitors:

```typescript
sort: 'newlyListed'  // Most recently listed first
```

Note: `newlyListed` sorts by `itemCreationDate` which is retained if an item is relisted. Priority Listings are only returned with Best Match sort — we don't need them.

#### Fix 3: Add price and buying option filters

```typescript
function buildFilterString(): string {
  const filters = [
    'price:[10..],priceCurrency:GBP',          // Skip sub-£10 (margins negligible after fees)
    'buyingOptions:{FIXED_PRICE}',              // Skip auctions (can't buy immediately)
    'conditionIds:{2750|4000|1000|1500|2000|2500|3000}', // Graded, Ungraded, New-Acceptable
    'deliveryCountry:GB',                       // UK delivery
  ];
  return filters.join(',');
}
```

### 3.2 Two-Phase eBay Evaluation

**Critical finding:** The eBay Browse API `item_summary/search` endpoint does NOT return `localizedAspects` (item specifics) or full `conditionDescriptors`. Those only come from the individual `getItem()` endpoint. The previous redesign spec incorrectly assumed `fieldgroups=EXTENDED,PRODUCT` would provide item specifics in search results — it does not.

We **need** `getItem()` enrichment to get:
- `localizedAspects`: Card Name, Set, Card Number, Rarity (seller-provided structured fields)
- `conditionDescriptors`: The numeric condition descriptor IDs that tell us exact card condition (NM/LP/MP/HP) and grading details (company, grade, cert number)

Without enrichment, we only have the title to work with — no structured condition data, no item specifics.

**Solution: Two-phase evaluation pipeline.**

```
Phase 1: BROAD SEARCH (1 API call per cycle, 200 results)
  - Search with sort=newlyListed, price/condition filters
  - Get: title, price, shipping, condition text, images
  - Do NOT get: localizedAspects, conditionDescriptors (empty in search)
  - Run title-only matching against local index
  - Filter: reject bulk/junk, deduplicate, match to card
  - Quick profit estimate using title-parsed condition (or default LP)

Phase 2: TARGETED ENRICHMENT (selective getItem calls)
  - Only for listings that show potential profit after Phase 1
  - Call getItem(itemId) to get full localizedAspects + conditionDescriptors
  - Extract real condition from conditionDescriptors (see §3.4)
  - Re-run matching with enriched structured signals
  - Recalculate profit with correct condition-specific price
  - Confidence typically increases (structured data confirms title parse)
```

#### eBay API Budget — The Critical Calculation

```
Daily eBay limit: 5,000 API calls

SEARCH CALLS:
  1 search call per cycle (returns 200 results)
  288 cycles/day (every 5 minutes)
  = 288 search calls/day

getItem ENRICHMENT CALLS:
  Per cycle (200 search results):
    ~50% rejected immediately (bulk, junk, dupes, non-cards) = 100 skipped
    ~30% no match against local index                        = 60 skipped
    ~20% matched to a card                                   = 40 matches

  Of those ~40 matches, only enrich listings with profit potential:
    ~25% show potential profit ≥15% after title-only estimate = 10 enrichments

  10 getItem calls × 288 cycles/day = 2,880 calls/day

TOTAL: 288 (search) + 2,880 (getItem) = 3,168 calls/day

HEADROOM: 5,000 - 3,168 = 1,832 calls remaining (37% buffer)
  - Manual lookups: ~50/day
  - Deal status checks: ~100/day
  - Still ~1,682 spare capacity
```

**Budget control — enrichment gate:**

```typescript
function shouldEnrich(match: PhaseOneMatch): boolean {
  // Only spend a getItem call if this listing looks profitable
  // Title-only profit estimate uses default LP condition (conservative)
  return (
    match.titleOnlyProfitPercent >= 15 &&   // Must show clear profit potential
    match.confidence.composite >= 0.50 &&   // Reasonable match quality
    !match.isDuplicate                       // Not already enriched
  );
}
```

If the daily budget drops below 500 remaining calls, enrichment threshold tightens to ≥25% profit to preserve budget for search calls. The system always prioritises search calls over enrichment.

**Scan interval adjustment:** If budget is running low, the scan interval can stretch from 5 minutes to 10 or 15 minutes, reducing both search and enrichment calls proportionally.

**getItem returns:**
- `localizedAspects`: Structured seller-provided fields ("Card Name", "Set", "Card Number", "Rarity", "Professional Grader", "Grade")
- `conditionDescriptors`: Structured condition with numeric descriptor IDs (see §3.4 for full mapping)
- `description`: Full listing description (can extract additional signals)

### 3.3 eBay Rate Limiting

```typescript
const ebayLimiter = new TokenBucket({
  capacity: 25,         // Burst of 25
  refillRate: 5,        // 5 per second (conservative, eBay limits vary by app tier)
});

// Track daily budget
const ebayBudget = {
  dailyLimit: 5000,
  used: 0,
  resetAt: nextMidnightUTC(),
};
```

### 3.4 Condition Descriptor Mapping (from getItem enrichment)

eBay uses numeric descriptor IDs for trading card conditions in category 183454. These come from the `conditionDescriptors` array in the `getItem()` response.

**Descriptor structure:** Each descriptor has a `name` (descriptor type ID) and `values` (array of value IDs).

#### Ungraded Cards (conditionId: 4000 / USED_VERY_GOOD)

Descriptor name: `40001` (Card Condition)

| Card Condition | Value ID |
|----------------|----------|
| Near Mint or Better | `400010` |
| Lightly Played (Excellent) | `400015` |
| Moderately Played (Very Good) | `400016` |
| Heavily Played (Poor) | `400017` |

**Mapping to Scrydex conditions:**

```typescript
const UNGRADED_CONDITION_MAP: Record<string, ScrydexCondition> = {
  '400010': 'NM',   // Near Mint or Better
  '400015': 'LP',   // Lightly Played (Excellent)
  '400016': 'MP',   // Moderately Played (Very Good)
  '400017': 'HP',   // Heavily Played (Poor)
};
```

#### Graded Cards (conditionId: 2750 / LIKE_NEW)

Three descriptors for graded cards:

**Descriptor name: `27501` (Professional Grader)**

| Grading Company | Value ID |
|-----------------|----------|
| PSA | `275010` |
| BCCG | `275011` |
| BVG | `275012` |
| BGS | `275013` |
| CSG | `275014` |
| CGC | `275015` |
| SGC | `275016` |
| KSA | `275017` |
| GMA | `275018` |
| HGA | `275019` |
| ISA | `2750110` |
| PCA | `2750111` |
| GSG | `2750112` |
| PGS | `2750113` |
| MNT | `2750114` |
| TAG | `2750115` |
| Rare Edition | `2750116` |
| RCG | `2750117` |
| PCG | `2750118` |
| Ace Grading | `2750119` |
| CGA | `2750120` |
| TCG | `2750121` |
| ARK | `2750122` |
| Other | `2750123` |

**Descriptor name: `27502` (Grade)**

| Grade | Value ID |
|-------|----------|
| 10 | `275020` |
| 9.5 | `275021` |
| 9 | `275022` |
| 8.5 | `275023` |
| 8 | `275024` |
| 7.5 | `275025` |
| 7 | `275026` |
| 6.5 | `275027` |
| 6 | `275028` |
| 5.5 | `275029` |
| 5 | `2750210` |
| 4.5 | `2750211` |
| 4 | `2750212` |
| 3.5 | `2750213` |
| 3 | `2750214` |
| 2.5 | `2750215` |
| 2 | `2750216` |
| 1.5 | `2750217` |
| 1 | `2750218` |
| Authentic | `2750219` |
| Authentic Altered | `2750220` |
| Authentic - Trimmed | `2750221` |
| Authentic - Coloured | `2750222` |

**Descriptor name: `27503` (Certification Number)** — free text field, the slab serial number.

#### Condition Extraction Logic

```typescript
interface ConditionResult {
  condition: 'NM' | 'LP' | 'MP' | 'HP';
  source: 'condition_descriptor' | 'localized_aspects' | 'title' | 'default';
  isGraded: boolean;
  gradingCompany: string | null;     // "PSA", "CGC", "BGS", etc.
  grade: string | null;              // "10", "9.5", "9", etc.
  certNumber: string | null;         // Slab serial number
  rawDescriptorIds: string[];        // For audit trail
}

function extractCondition(listing: EnrichedEbayListing): ConditionResult {
  const descriptors = listing.conditionDescriptors || [];

  // Check if graded (conditionId 2750 or descriptor 27501 present)
  const graderDescriptor = descriptors.find(d => d.name === '27501');
  const gradeDescriptor = descriptors.find(d => d.name === '27502');
  const certDescriptor = descriptors.find(d => d.name === '27503');

  if (graderDescriptor) {
    // GRADED CARD
    const companyId = graderDescriptor.values?.[0];
    const gradeId = gradeDescriptor?.values?.[0];
    return {
      condition: 'NM',  // Graded cards are priced separately, not by raw condition
      source: 'condition_descriptor',
      isGraded: true,
      gradingCompany: GRADER_MAP[companyId] || 'Unknown',
      grade: GRADE_MAP[gradeId] || null,
      certNumber: certDescriptor?.values?.[0] || null,
      rawDescriptorIds: [companyId, gradeId, certDescriptor?.values?.[0]].filter(Boolean),
    };
  }

  // Check for ungraded condition descriptor (name 40001)
  const conditionDescriptor = descriptors.find(d => d.name === '40001');
  if (conditionDescriptor) {
    const conditionId = conditionDescriptor.values?.[0];
    const mapped = UNGRADED_CONDITION_MAP[conditionId];
    if (mapped) {
      return {
        condition: mapped,
        source: 'condition_descriptor',
        isGraded: false,
        gradingCompany: null, grade: null, certNumber: null,
        rawDescriptorIds: [conditionId],
      };
    }
  }

  // Fallback: localizedAspects (from getItem enrichment)
  const aspects = listing.localizedAspects;
  if (aspects?.['Card Condition']) {
    const mapped = mapAspectToCondition(aspects['Card Condition']);
    if (mapped) {
      return { condition: mapped, source: 'localized_aspects', isGraded: false,
               gradingCompany: null, grade: null, certNumber: null, rawDescriptorIds: [] };
    }
  }

  // Fallback: title parsing (least reliable)
  const titleCondition = parseConditionFromTitle(listing.title);
  if (titleCondition) {
    return { condition: titleCondition, source: 'title', isGraded: false,
             gradingCompany: null, grade: null, certNumber: null, rawDescriptorIds: [] };
  }

  // Default: LP (conservative — slightly undervalues) with confidence penalty
  return { condition: 'LP', source: 'default', isGraded: false,
           gradingCompany: null, grade: null, certNumber: null, rawDescriptorIds: [] };
}
```

**Priority order:** Condition descriptors (most reliable, numeric IDs from eBay) → localizedAspects (seller-filled dropdowns) → title parsing (regex, least reliable) → default LP.

### 3.5 EbayListing Interface

```typescript
interface EbayListing {
  itemId: string;
  title: string;
  price: { value: number; currency: string };
  shipping: { value: number; currency: string } | null;
  condition: string | null;              // Text: "Used", "Like New", etc.
  conditionId: string | null;            // "2750" (Graded) or "4000" (Ungraded)
  conditionDescriptors: ConditionDescriptor[];  // Only populated after getItem()
  image: string | null;
  itemWebUrl: string;
  seller: { username: string; feedbackScore: number; feedbackPercentage: number };
  listingDate: string;                   // itemCreationDate
  quantitySold: number;                  // Copies sold from this listing
  buyingOptions: string[];               // ['FIXED_PRICE']

  // Phase 2 enrichment (null until getItem() called):
  localizedAspects: Record<string, string> | null;
  enriched: boolean;
}

interface ConditionDescriptor {
  name: string;       // "40001" | "27501" | "27502" | "27503"
  values: string[];   // ["400010"] | ["275010"] | ["275020"] | ["cert-number"]
}
```

---

## 4. Matching Engine

### 4.1 Pipeline Overview

The matching engine is unchanged from the redesign spec in principle — number-first candidate lookup against the local PostgreSQL index, zero API credits per match. Key stages:

```
Signal Extraction (title parse + structured data)
  → Candidate Lookup (number + denominator → local DB)
  → Disambiguation (name similarity, expansion cross-validation)
  → Variant Resolution
  → Confidence Scoring (weighted geometric mean)
  → Validation Gates (hard + soft)
```

### 4.2 Signal Extraction — 5-Phase Pipeline

```
Phase 1: Clean       → Unicode NFC, strip emoji, decode HTML, collapse whitespace
Phase 2: Classify    → Early-exit: junk/bundle/lot, fake/proxy, non-English
Phase 3: Extract     → Card number, grading info, variant flags, condition from title
Phase 4: Identify    → Name + set via pg_trgm against local index (not hardcoded lists)
Phase 5: Assemble    → Merge title signals + structured signals → NormalizedListing
```

**Phase 5 now has two passes:**
- **Pass A (Phase 1):** Title-only signals from search results
- **Pass B (Phase 2 enrichment):** Merge with `localizedAspects` from `getItem()` if called

When structured data is available, it takes priority for card name, card number, and set identification (sellers fill these from eBay dropdown menus — more reliable than free-text titles).

### 4.3 Structured Data Extractor

```typescript
function extractStructuredSignals(aspects: Record<string, string>): StructuredSignals {
  return {
    cardName: aspects['Card Name'] || aspects['Character'] || null,
    cardNumber: aspects['Card Number'] || null,
    setName: aspects['Set'] || aspects['Expansion'] || null,
    rarity: aspects['Rarity'] || null,
    language: aspects['Language'] || null,
    gradingCompany: aspects['Professional Grader'] || null,
    grade: aspects['Grade'] || null,
    year: aspects['Year Manufactured'] || null,
  };
}
```

### 4.4 Candidate Lookup — Number-First

Unchanged from redesign spec. Four strategies in priority order:

1. **Number + denominator** — most specific (e.g., card 6 in sets with ~197 cards)
2. **Number + expansion signal** — when denominator missing but set name/code extracted
3. **Number only** — broad, capped at 50 candidates
4. **Name search** — last resort, pg_trgm similarity ≥ 0.6

### 4.5 Disambiguation & Confidence

Weighted geometric mean with these weights:

| Signal | Weight | Why |
|--------|--------|-----|
| Name match | 0.30 | Most important — wrong name = wrong card |
| Denominator match | 0.25 | Validates expansion implicitly |
| Number match | 0.15 | Usually 1.0 (filtered by number) |
| Expansion match | 0.10 | Bonus validation |
| Variant | 0.10 | Affects pricing |
| Normalization | 0.10 | Signal extraction quality |

**Hard gates:** Name similarity < 0.60, price data missing/stale, exchange rate stale, listing price ≤ 0 or > £10,000.

**Confidence tiers:**

| Composite | Tier | Action |
|-----------|------|--------|
| ≥ 0.85 | High | Process automatically, show in dashboard |
| 0.65–0.84 | Medium | Process but flag with warning badge |
| 0.45–0.64 | Low | Log for training only, do not display |
| < 0.45 | Reject | Skip entirely |

### 4.6 Variant Resolution — Getting the Right Card Version

Many Pokemon cards exist in multiple variants within the same expansion. For example, Base Set Charizard #4/102 exists as:
- `holofoil` (the standard holo) — NM ~$350
- `firstEditionHolofoil` (1st Edition stamp) — NM ~$5,000

Getting the wrong variant means comparing against the wrong price — a 14x difference in this case.

**Variant signals come from three sources (in priority order):**

1. **eBay conditionDescriptors / localizedAspects** (Phase 2 enrichment) — most reliable
2. **Title keywords** — "holo", "reverse holo", "1st edition", "shadowless", "full art", "alt art"
3. **Card data inference** — if the card only has one variant, use it automatically

```typescript
// Variant keyword mapping (title → Scrydex variant names)
const VARIANT_KEYWORDS: Record<string, string[]> = {
  'holofoil':              ['holo', 'holographic', 'holo rare'],
  'reverseHolofoil':       ['reverse holo', 'reverse', 'rev holo', 'reverse holographic'],
  'firstEditionHolofoil':  ['1st edition holo', '1st ed holo', 'first edition holo'],
  'firstEditionNormal':    ['1st edition', '1st ed', 'first edition'],  // no "holo" keyword
  'unlimitedHolofoil':     ['unlimited holo'],
  'unlimitedNormal':       ['unlimited'],
  'normal':                [],  // Default if no variant keywords found
};

function resolveVariant(
  listing: NormalizedListing,
  cardVariants: LocalVariant[]
): { variant: LocalVariant; method: string; confidence: number } {
  // 1. If only one variant exists with prices → use it (common for modern singles)
  const pricedVariants = cardVariants.filter(v =>
    Object.values(v.prices.raw || {}).some(c => c?.market != null)
  );
  if (pricedVariants.length === 1) {
    return { variant: pricedVariants[0], method: 'single_variant', confidence: 0.95 };
  }

  // 2. Match variant keywords from title/structured data against card's available variants
  const detected = detectVariantFromSignals(listing);
  if (detected) {
    const match = cardVariants.find(v =>
      VARIANT_KEYWORDS[v.name]?.some(kw => detected.includes(kw)) || v.name === detected
    );
    if (match) {
      return { variant: match, method: 'keyword_match', confidence: 0.85 };
    }
  }

  // 3. Default to the LOWEST-PRICED variant (conservative — underestimates profit)
  const cheapest = pricedVariants.sort((a, b) =>
    (a.prices.raw?.NM?.market || 0) - (b.prices.raw?.NM?.market || 0)
  )[0];
  if (cheapest) {
    return { variant: cheapest, method: 'default_cheapest', confidence: 0.50 };
  }

  return null; // No variant with pricing data
}
```

**Why default to cheapest variant:** If we can't determine the variant, using the cheapest price means we'll underestimate profit rather than overestimate it. A deal that's still profitable at the cheapest variant price is safe to show. The alternative (guessing the expensive variant) would create false positives.

### 4.7 Graded Card Handling

Graded card detection now uses the real eBay condition descriptor IDs from §3.4 rather than title parsing alone.

**Detection priority:**
1. `conditionId: '2750'` (LIKE_NEW) + descriptor `27501` (Professional Grader) — definitive
2. Title keywords: "PSA 10", "CGC 9.5", "BGS 10 Black Label", etc. — fallback before enrichment

**When a graded card is detected:**
1. Match to the underlying card as normal (the card identity is the same)
2. Extract grading company + grade from descriptors (§3.4)
3. Look up graded pricing from `variants.graded_prices` (e.g., `PSA_10`, `CGC_9.5`)
4. Compare eBay price against the correct graded tier price
5. Flag as `isGraded: true` in the deal — separate filter in the UI

**Grading opportunity detection:** If a listing appears to be an ungraded raw card priced well below the PSA 10 value for that card, flag it as a potential grading opportunity. This is a separate signal shown in the deal detail panel — "Grading upside: PSA 10 value is £XXX".

---

## 5. Pricing Engine

### 5.1 Condition-Specific Real Pricing

All profit calculations use **real Scrydex prices per condition**, not fabricated multipliers.

```typescript
function calculateArbitrage(
  listing: NormalizedListing,
  match: MatchResult,
  exchangeRate: number
): ArbitrageResult {
  const condition = listing.condition;   // NM, LP, MP, HP
  const variant = match.variant;

  // Get REAL price for this specific condition
  const conditionPrices = variant.prices.raw[condition];
  if (!conditionPrices || !conditionPrices.market) {
    // Fall back to next-lower condition if exact condition not priced
    const fallbackCondition = findNextPricedCondition(variant, condition);
    if (!fallbackCondition) return null; // No price data — cannot evaluate
  }

  const marketPriceUSD = conditionPrices.market;
  const marketPriceGBP = marketPriceUSD * exchangeRate;

  // Total acquisition cost
  const ebayPriceGBP = listing.price + (listing.shippingCost || 0);
  const buyerProtectionFee = calculateBuyerProtectionFee(listing.price);
  const totalCostGBP = ebayPriceGBP + buyerProtectionFee.totalFee;

  // Profit
  const profitGBP = marketPriceGBP - totalCostGBP;
  const profitPercent = (profitGBP / totalCostGBP) * 100;

  // Trend data from Scrydex (real, not fabricated)
  const trends = variant.trends?.[condition];

  return {
    ebayPriceGBP,
    shippingGBP: listing.shippingCost || 0,
    buyerProtectionFee,
    totalCostGBP,
    condition,
    conditionSource: listing.conditionSource,
    marketPriceUSD,
    marketPriceGBP,
    profitGBP,
    profitPercent,
    exchangeRate,
    trends: {
      '1d': trends?.['1d'] || null,
      '7d': trends?.['7d'] || null,
      '30d': trends?.['30d'] || null,
      '90d': trends?.['90d'] || null,
    },
    // Graded pricing (if available)
    gradedComps: listing.isGraded ? variant.prices.graded : null,
    // All condition comps (for display in detail panel)
    allConditionComps: {
      NM: variant.prices.raw['NM'] || null,
      LP: variant.prices.raw['LP'] || null,
      MP: variant.prices.raw['MP'] || null,
      HP: variant.prices.raw['HP'] || null,
    },
    baseTier: classifyTier(profitPercent),
    tier: null,  // Set after liquidity adjustment
  };
}
```

### 5.2 Buyer Protection Fee

Unchanged from redesign spec — pure function, eBay UK private seller tiered fee:

```
£0.10 flat + 7% on first £20 + 4% on £20–£300 + 2% on £300–£4,000
```

### 5.3 Tier Classification

| Tier | Label | Profit Threshold | Dashboard Name |
|------|-------|-----------------|----------------|
| **GRAIL** | G | >40% | Chase-tier |
| **HIT** | H | 25–40% | Solid hit |
| **FLIP** | F | 15–25% | Quick flip |
| **SLEEP** | S | 5–15% | Sleeper |

Tiers are adjusted by liquidity (see §6).

---

## 6. Liquidity Engine

### 6.1 Real Data, Not Heuristics

Every liquidity signal now uses real data sources:

| Signal | Old (Fabricated) | New (Real) |
|--------|-----------------|------------|
| **Trend** | `min(1, marketPriceUsd/100)` — just normalizes price | Scrydex trend data: real % change over 1d/7d/30d/90d |
| **Prices** | Binary: `prices ? 0.9 : 0.3` | Condition completeness: how many of NM/LP/MP/HP are priced |
| **Spread** | `1 - profitPct/100` — circular | `low/market` ratio from Scrydex (tight = liquid) |
| **Supply** | `1 - marketPriceUsd/200` — backwards | Count of matching eBay listings in scan batch |
| **Sold** | `confidence * 1.1` — wrong metric entirely | eBay `quantitySold` + Scrydex listings endpoint sales count |
| **Velocity** | `null` — never populated | Scrydex `/cards/{id}/listings` — real sales per 7d/30d |

### 6.2 Composite Scoring

```typescript
function calculateLiquidity(
  variant: LocalVariant,
  condition: string,
  ebaySignals: { concurrentSupply: number; quantitySold: number },
  salesCache: SalesVelocityCache | null,
): LiquidityAssessment {
  // Tier 1: Trend activity (free — from synced card data)
  const trends = variant.trends?.[condition];
  const trendWindows = ['1d', '7d', '30d', '90d']
    .map(w => trends?.[w]?.percent_change)
    .filter(v => v !== null && v !== undefined && v !== 0);
  const trendActivity = trendWindows.length / 4;

  // Tier 1: Price completeness (free)
  const conditionsPriced = ['NM', 'LP', 'MP', 'HP']
    .filter(c => variant.prices.raw[c]?.market != null).length;
  const priceCompleteness = conditionsPriced / 4;

  // Tier 1: Price spread (free)
  const low = variant.prices.raw[condition]?.low;
  const market = variant.prices.raw[condition]?.market;
  const priceSpread = (low && market && market > 0)
    ? Math.min(low / market, 1.0)
    : 0.3;

  // Tier 2: eBay supply (free — from scan batch)
  const supplyScore = Math.min(ebaySignals.concurrentSupply / 5, 1.0);

  // Tier 2: Quantity sold (free — from eBay listing)
  const soldScore = Math.min(ebaySignals.quantitySold / 3, 1.0);

  // Tier 3: Sales velocity (3 credits — cached 7 days)
  let velocityScore = 0.5; // neutral default
  if (salesCache?.fetched) {
    if (salesCache.sales7d >= 5) velocityScore = 1.0;
    else if (salesCache.sales7d >= 2) velocityScore = 0.85;
    else if (salesCache.sales30d >= 5) velocityScore = 0.7;
    else if (salesCache.sales30d >= 2) velocityScore = 0.5;
    else if (salesCache.sales30d >= 1) velocityScore = 0.3;
    else velocityScore = 0.1;
  }

  // Weighted arithmetic mean (not geometric — see rationale in §6.3)
  const weights = salesCache?.fetched
    ? { trend: 0.15, prices: 0.10, spread: 0.10, supply: 0.15, sold: 0.10, velocity: 0.40 }
    : { trend: 0.25, prices: 0.15, spread: 0.15, supply: 0.25, sold: 0.20, velocity: 0.00 };

  const composite =
    weights.trend * trendActivity +
    weights.prices * priceCompleteness +
    weights.spread * priceSpread +
    weights.supply * supplyScore +
    weights.sold * soldScore +
    weights.velocity * velocityScore;

  const grade =
    composite >= 0.75 ? 'high' :
    composite >= 0.50 ? 'medium' :
    composite >= 0.25 ? 'low' :
    'illiquid';

  return { composite, grade, trendActivity, priceCompleteness, priceSpread,
           concurrentSupply: ebaySignals.concurrentSupply,
           quantitySold: ebaySignals.quantitySold,
           salesVelocity: salesCache };
}
```

### 6.3 Why Arithmetic Mean for Liquidity

Confidence uses geometric mean because any single wrong field (wrong name, wrong set) means a wrong card — one low score should tank the composite.

Liquidity uses arithmetic mean because a card can have zero eBay supply (nobody listing right now) but strong Scrydex trend activity — it's still liquid, just not on eBay this moment. Strong signals compensate for weak ones.

### 6.4 Liquidity → Tier Adjustment

```typescript
function adjustTierForLiquidity(baseTier: string, liquidityGrade: string): string {
  if (liquidityGrade === 'illiquid') return 'SLEEP';
  if (liquidityGrade === 'low' && ['GRAIL', 'HIT'].includes(baseTier)) return 'FLIP';
  if (liquidityGrade === 'medium' && baseTier === 'GRAIL') return 'HIT';
  return baseTier;
}
```

GRAIL always implies both high profit AND high liquidity.

---

## 7. Deal Lifecycle

### 7.1 Deal Creation

Deals are created when a listing passes all gates: matching confidence ≥ 0.65, profit ≥ 5%, price data fresh, exchange rate fresh.

Each deal is assigned a monotonic `event_id` (PostgreSQL BIGSERIAL) for SSE ordering, plus a UUID `deal_id` for API reference.

### 7.2 Deal Expiry & Cleanup

**Problem identified:** Deals accumulate indefinitely with no lifecycle management.

**Solution:**

```typescript
// Deal status lifecycle:
type DealStatus = 'active' | 'expired' | 'sold' | 'reviewed';

// Expiry rules:
const DEAL_TTL_HOURS = 72;  // Default: 3 days

// Cleanup job (runs every hour):
async function cleanupDeals() {
  // 1. Mark old deals as expired
  await db.query(`
    UPDATE deals SET status = 'expired'
    WHERE status = 'active'
    AND created_at < NOW() - INTERVAL '${DEAL_TTL_HOURS} hours'
  `);

  // 2. Hard-delete deals older than 30 days (keep reviewed deals for corpus)
  await db.query(`
    DELETE FROM deals
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND is_correct_match IS NULL
  `);
}
```

**eBay listing status check:** Optionally, on deal detail view, check if the eBay listing is still active via `getItem()`. If the item is ended/sold, mark the deal accordingly. This is not done proactively (would burn too many API calls) but on-demand when the user views a deal.

### 7.3 Deduplication

```sql
CREATE UNIQUE INDEX idx_deals_dedup ON deals (ebay_item_id);
```

If the same eBay item appears in a later scan cycle, skip it. The `ebay_item_id` uniqueness constraint prevents duplicates at the DB level.

---

## 8. Card Catalog

### 8.1 Rationale

We're already syncing the full Scrydex card index with pricing, trends, images, and expansion data for the arbitrage scanner. Exposing this as a browsable public catalog is essentially free — the data is already in PostgreSQL.

### 8.2 Features

- **Expansion browser:** Browse all ~350 English expansions with logos, card counts, release dates. Group by series (Scarlet & Violet, Sword & Shield, etc.)
- **Card grid/list:** View all cards in an expansion as a visual grid (card images) or sortable list
- **Card detail:** Large card image, all variants with per-condition pricing, trend charts (1d/7d/30d/90d/180d), expansion info, rarity, artist
- **Search:** Full-text search by card name, number, set name, or artist via pg_trgm
- **Filtering:** By set, type (Pokemon/Trainer/Energy), rarity, price range, trending direction
- **Sorting:** By price, price trend (biggest movers), card number, release date, name
- **Trending cards:** Surface cards with biggest price movements (up or down) across configurable time windows
- **Price comparison:** Show all condition prices (NM/LP/MP/HP) and graded prices (PSA 10, CGC 9.5, etc.) for each variant

### 8.3 Catalog API Endpoints

All catalog endpoints are **public** — no authentication required.

```
GET /api/catalog/expansions
  Query: ?series=Scarlet+%26+Violet&sort=releaseDate&order=desc&page=1&limit=50
  Returns: Paginated list of expansions with logo URLs, card counts, release dates

GET /api/catalog/expansions/:id
  Query: ?sort=number&order=asc&include=prices
  Returns: Expansion detail + paginated card list with images and prices

GET /api/catalog/cards/search
  Query: ?q=charizard&set=sv3&rarity=rare&type=pokemon&sort=market_price&order=desc
  Returns: Paginated search results with card images, prices, trends

GET /api/catalog/cards/:id
  Returns: Full card detail — all variants, all condition prices, all trend data,
           graded prices, expansion info, images (small/medium/large)

GET /api/catalog/trending
  Query: ?period=7d&direction=up&limit=50&min_price=5
  Returns: Cards with biggest price movements, sorted by percent_change
```

### 8.4 Data Freshness

The catalog is backed by the same local card index used for arbitrage:
- **Recent sets (top 10):** Prices updated daily
- **All other sets:** Prices updated weekly
- **New expansions:** Detected within 24h of appearing on Scrydex

### 8.5 SEO & Public Access

Card detail pages use server-side rendering for search engine indexing:
- `/catalog/expansions` → browsable HTML
- `/catalog/cards/:id` → pre-rendered card page with structured data (JSON-LD)
- API endpoints serve JSON when `Accept: application/json`, HTML otherwise

### 8.6 Integration with Arbitrage Dashboard

- Deal detail panel links to the catalog card page
- Catalog card page shows a "recent deals" section if the user is authenticated
- Manual lookup tool can search the catalog directly by card name/number

---

## 9. Database Schema

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

------------------------------------------------------------
-- EXPANSIONS (~350 rows, synced daily)
------------------------------------------------------------
CREATE TABLE expansions (
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

CREATE INDEX idx_expansions_release ON expansions (release_date DESC);
CREATE INDEX idx_expansions_code ON expansions (code);
CREATE INDEX idx_expansions_name_trgm ON expansions USING GIN (name gin_trgm_ops);

------------------------------------------------------------
-- CARDS (~35,000 rows, synced weekly, hot sets daily)
------------------------------------------------------------
CREATE TABLE cards (
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
  market_price_usd  NUMERIC(10,2),     -- Best NM market price (denormalized for quick sorts)
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cards_number_norm ON cards (number_normalized);
CREATE INDEX idx_cards_number_printed ON cards (number_normalized, printed_total);
CREATE INDEX idx_cards_expansion ON cards (expansion_id);
CREATE INDEX idx_cards_number_expansion ON cards (number, expansion_id);
CREATE INDEX idx_cards_name_trgm ON cards USING GIN (name gin_trgm_ops);
CREATE INDEX idx_cards_rarity ON cards (rarity);
CREATE INDEX idx_cards_supertype ON cards (supertype);
CREATE INDEX idx_cards_market_price ON cards (market_price_usd DESC NULLS LAST);

------------------------------------------------------------
-- VARIANTS (~70,000 rows, avg 2 per card)
------------------------------------------------------------
CREATE TABLE variants (
  id              SERIAL PRIMARY KEY,
  card_id         TEXT NOT NULL REFERENCES cards(scrydex_card_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  image_small     TEXT,
  image_medium    TEXT,
  image_large     TEXT,
  -- Per-condition raw pricing:
  -- { "NM": {"low":45,"market":52}, "LP": {"low":30,"market":38}, ... }
  prices          JSONB NOT NULL DEFAULT '{}',
  -- Per-condition graded pricing:
  -- { "PSA_10": {"low":200,"market":280}, "CGC_9.5": {"low":100,"market":140} }
  graded_prices   JSONB DEFAULT '{}',
  -- Per-condition trend data:
  -- { "NM": {"1d":{"price_change":0.5,"percent_change":1.2}, "7d":{...}, ...} }
  trends          JSONB DEFAULT '{}',
  last_price_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, name)
);

CREATE INDEX idx_variants_card ON variants (card_id);
CREATE INDEX idx_variants_prices ON variants USING GIN (prices);

------------------------------------------------------------
-- DEALS (arbitrage opportunities)
------------------------------------------------------------
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

CREATE INDEX idx_deals_created ON deals (created_at DESC);
CREATE INDEX idx_deals_event ON deals (event_id DESC);
CREATE INDEX idx_deals_tier ON deals (tier);
CREATE INDEX idx_deals_status ON deals (status);
CREATE INDEX idx_deals_card ON deals (card_id);
CREATE INDEX idx_deals_expires ON deals (expires_at) WHERE status = 'active';

------------------------------------------------------------
-- SALES VELOCITY CACHE (from Scrydex /listings, 7-day TTL)
------------------------------------------------------------
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

------------------------------------------------------------
-- EXCHANGE RATES
------------------------------------------------------------
CREATE TABLE exchange_rates (
  id              SERIAL PRIMARY KEY,
  from_currency   TEXT NOT NULL DEFAULT 'USD',
  to_currency     TEXT NOT NULL DEFAULT 'GBP',
  rate            NUMERIC(10,6) NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exchange_rates_latest
  ON exchange_rates (from_currency, to_currency, fetched_at DESC);

------------------------------------------------------------
-- PREFERENCES (singleton)
------------------------------------------------------------
CREATE TABLE preferences (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data            JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- API CREDENTIALS (encrypted)
------------------------------------------------------------
CREATE TABLE api_credentials (
  service         TEXT PRIMARY KEY,
  credentials     BYTEA NOT NULL,
  iv              BYTEA NOT NULL,
  last_tested     TIMESTAMPTZ,
  is_valid        BOOLEAN,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- SYNC LOG
------------------------------------------------------------
CREATE TABLE sync_log (
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

## 10. API Contract

### 10.1 Authentication Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `POST /auth/login` | POST | No | Password → session cookie |
| `POST /auth/logout` | POST | No | Clear session |

### 10.2 Deal Routes (Authenticated)

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/deals` | GET | List deals (paginated, filterable) |
| `GET /api/deals/stream` | GET (SSE) | Live deal feed |
| `GET /api/deals/:id` | GET | Full deal detail |
| `POST /api/deals/:id/review` | POST | Mark correct/incorrect |
| `GET /api/deals/:id/velocity` | GET | Fetch/return sales velocity (triggers Scrydex /listings if not cached) |

### 10.3 Lookup Routes (Authenticated)

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/lookup` | POST | Evaluate an eBay URL through full pipeline |

### 10.4 System Routes (Authenticated)

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/status` | GET | System health, metrics, API usage |
| `GET /api/preferences` | GET | Load user preferences |
| `PUT /api/preferences` | PUT | Save preferences (partial update) |
| `GET /api/settings` | GET | API key status (not raw keys) |
| `PUT /api/settings` | PUT | Store encrypted credentials |
| `POST /api/notifications/telegram/test` | POST | Test Telegram config |

### 10.5 Card Catalog Routes (Public — No Auth)

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/catalog/expansions` | GET | List all expansions |
| `GET /api/catalog/expansions/:id` | GET | Expansion detail + card list |
| `GET /api/catalog/cards/search` | GET | Full-text card search |
| `GET /api/catalog/cards/:id` | GET | Card detail (all variants, prices, trends) |
| `GET /api/catalog/trending` | GET | Biggest price movers |

### 10.6 Health Route (Public)

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /healthz` | GET | Kubernetes/Railway health check |

### 10.7 SSE Event Types

```
event: deal      — New deal created (full deal data for feed row)
event: status    — System status update (every 30s)
event: ping      — Keepalive (every 15s)
```

SSE uses `Last-Event-Id` header for replay on reconnect. Event IDs are monotonic `event_id` values from the deals table.

---

## 11. Authentication & Security

### 11.1 Password Authentication

Single-user tool. Password checked against `ACCESS_PASSWORD` env var (constant-time comparison). Session stored as httpOnly cookie, 7-day expiry.

### 11.2 Security Measures

- **Input validation:** Zod schemas on all request bodies
- **SQL injection:** Parameterized queries only (no string interpolation)
- **XSS:** Helmet security headers, httpOnly cookies
- **API keys:** AES-256-GCM encrypted in PostgreSQL, never exposed via API
- **Secrets:** Railway environment variables, Zod-validated at boot

---

## 12. Observability

### 12.1 Structured Logging

Pino JSON logger with correlation IDs tracing listings through the full pipeline:

```typescript
{ level: "info", service: "scanner", correlationId: "abc123",
  message: "Deal created", context: { dealId: "uuid", profitGBP: 32.50, tier: "GRAIL" } }
```

### 12.2 Metrics (via /api/status)

- Scanner: scans total, listings processed/matched/rejected, deals created
- Matching: confidence histogram, method distribution
- Sync: last full/delta timestamps, cards total, expansions total
- API budgets: Scrydex credits used/remaining, eBay calls today/limit
- Accuracy: automated 7d rolling, manual total/correct

### 12.3 Telegram Alerts

| Alert | Trigger | Severity |
|-------|---------|----------|
| Sync failed | Full/delta sync fails | Critical |
| Credits low | Scrydex < 5,000 remaining | Warning |
| Credits critical | Scrydex < 2,000 remaining | Critical |
| eBay rate limited | 3+ consecutive 429s | Warning |
| Exchange rate stale | Last fetch > 4h ago | Warning |
| Accuracy drop | 7d automated < 80% | Critical |
| Card index stale | No sync in > 48h | Critical |

---

## 13. Testing Strategy

### 13.1 Live Data Testing

All testing uses **live data** — real APIs, real database, real eBay listings. No mocks, no fixtures, no recorded responses.

| Layer | Scope | How to test |
|-------|-------|-------------|
| **Pure functions** | Buyer protection calc, tier classifier, confidence scorer, condition mapper | Vitest unit tests — these are pure math/logic, no external calls needed |
| **API clients** | Scrydex, eBay, exchange rate | Run against live APIs, verify real responses come back correctly |
| **Services** | Sync, scanner, matching, pricing | Run against live database + live APIs, verify real data flows through |
| **Endpoints** | REST + SSE | `curl` against running server, verify real responses |
| **End-to-end** | Full pipeline | Let the scanner run, inspect real deals in the database |

### 13.2 Why Live Data

- Mocked tests give false confidence — they test your mocks, not your code
- The eBay API response shape changes; mocks won't catch that
- Scrydex data structure is complex (nested JSONB); easier to verify with real data
- The whole point of this app is to process real-world data accurately

### 13.3 Testing Approach Per Stage

1. **Pure function tests (Vitest):** For functions with no I/O (buyer protection calc, tier classifier, condition ID mapping, Jaro-Winkler scoring). These run fast and don't need external services.
2. **Live smoke tests:** After deploying each stage, run `curl` commands and `psql` queries against the Railway instance to verify real data.
3. **Manual verification:** For matching accuracy, visually inspect deals — does the matched card look right? Is the profit calculation correct?

### 13.4 Match Corpus

200+ entries covering modern sets (30%), legacy (20%), vintage (20%), graded (15%), edge cases (15%). Each entry has `ebayTitle`, `itemSpecifics`, `expectedCardId`, `expectedVariant`, `difficulty`, `tags`. Built from **real eBay listings** encountered during live testing.

---

## 14. Configuration & Deployment

### 14.1 Environment Variables

**Required:**
```
DATABASE_URL              # PostgreSQL connection
ACCESS_PASSWORD           # Dashboard password (≥8 chars)
SESSION_SECRET            # Session signing (≥32 chars)
SCRYDEX_API_KEY           # Scrydex authentication
SCRYDEX_TEAM_ID           # Scrydex team identifier
EBAY_CLIENT_ID            # eBay OAuth app ID
EBAY_CLIENT_SECRET        # eBay OAuth secret
EXCHANGE_RATE_API_KEY     # USD→GBP conversion
```

**Optional:**
```
TELEGRAM_BOT_TOKEN        # Deal notifications
TELEGRAM_CHAT_ID          # Target chat
NODE_ENV                  # production|development|test
PORT                      # Default: 3000
```

### 14.2 Railway Deployment

```
GitHub push to main → Railway auto-deploy
  → Multi-stage Docker build (backend + frontend)
  → Run migrations
  → Boot sequence (§1)
  → Live
```

### 14.3 Background Worker Schedule

| Job | Interval | What |
|-----|----------|------|
| eBay scan | Every 5 minutes | Search + match + deal creation |
| Deal cleanup | Every 1 hour | Expire old deals, prune stale |
| Exchange rate | Every 1 hour | Refresh USD/GBP rate |
| Hot refresh | Daily 03:00 | Re-sync 10 most recent expansions |
| Expansion check | Daily 04:00 | Check for new expansions |
| Full sync | Weekly Sun 03:00 | Full catalog resync |
| Listings pre-fetch | Weekly Sun 05:00 | Top 200 matched cards velocity |

---

## 15. Phased Build Plan

Each stage is built, tested, and verified before moving to the next. No stage depends on a later stage working. Each stage produces a deployable, testable artifact.

**Principle:** Build the data foundation first (card database + catalog), then layer the scanner on top. No point building the matching engine if there's nothing to match against.

**Build workflow:** All code is written in Claude Code, pushed to GitHub, and auto-deployed to Railway.

**Testing approach:** All tests use **live data** — real APIs, real database, real eBay listings. No mocks, no fixtures, no simulated responses. Each stage lists:

1. **Vitest (pure functions only):** For math and logic that has no external dependencies (buyer protection calc, tier classifier, condition mapping). These are the only automated tests.
2. **Live API tests:** Run real API calls against Scrydex, eBay, exchange rate services. Verify real responses parse correctly and real data flows into the database.
3. **Live smoke tests:** After deploying to Railway, verify with `curl` and `psql $DATABASE_URL` against real production data.

The goal: if it works with real data on Railway, it works. Period.

---

### Stage 1: Foundation — Database, Config, Boot Sequence

**Install these packages:**
```bash
npm init -y
npm install express pg node-pg-migrate pino pino-pretty zod dotenv helmet cookie-parser
npm install -D typescript @types/express @types/node @types/pg vitest @types/cookie-parser tsx
npx tsc --init  # Generate tsconfig.json
```

**Step-by-step:**

1. **Create project folder structure:**
   ```
   src/
   ├── config/
   │   └── index.ts          ← Zod-validated AppConfig
   ├── db/
   │   ├── pool.ts           ← PostgreSQL connection pool
   │   └── migrate.ts        ← Migration runner wrapper
   ├── routes/
   │   └── health.ts         ← GET /healthz
   ├── middleware/            ← (empty for now, used later)
   ├── services/             ← (empty for now, used later)
   ├── app.ts                ← Express app setup (middleware, routes)
   └── server.ts             ← Boot sequence entry point
   migrations/
   ├── 001_create_extensions.sql    ← pg_trgm, uuid-ossp
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

2. **Create `src/config/index.ts`** — Define a Zod schema for every env var the app needs. Parse `process.env` through it at import time. If any required var is missing, Zod throws a clear error with the field name. Export the validated config object.
   ```typescript
   // Key fields:
   // DATABASE_URL (required), ACCESS_PASSWORD (required, min 8 chars),
   // SESSION_SECRET (required, min 32 chars), SCRYDEX_API_KEY (required),
   // SCRYDEX_TEAM_ID (required), EBAY_CLIENT_ID (required),
   // EBAY_CLIENT_SECRET (required), EXCHANGE_RATE_API_KEY (required),
   // TELEGRAM_BOT_TOKEN (optional), TELEGRAM_CHAT_ID (optional),
   // NODE_ENV (default: 'development'), PORT (default: 3000)
   ```

3. **Create `src/db/pool.ts`** — Create and export a `pg.Pool` using `config.DATABASE_URL`. Set `max: 10` connections. Add an error handler on the pool (`pool.on('error', ...)`) that logs but doesn't crash the process.

4. **Create `src/db/migrate.ts`** — A function that runs `node-pg-migrate` programmatically using the pool's connection string. Direction: `'up'`. Migrations directory: `./migrations`. Log output to Pino logger.

5. **Create migration SQL files** — One file per table, using the exact schemas from §9 of this spec. Include all indexes, constraints, `pg_trgm` extension, and `uuid-ossp` extension. Each migration must be idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

6. **Create `src/routes/health.ts`** — A simple Express router with `GET /healthz` that queries `SELECT 1` against the pool. Returns `{ status: 'ok', timestamp: new Date().toISOString() }` with 200 if DB responds, or `{ status: 'error' }` with 503 if the query fails.

7. **Create `src/app.ts`** — Set up Express app with `helmet()`, `express.json()`, `cookie-parser()`, Pino HTTP logger. Mount health route. Export the app (don't listen here — that happens in server.ts).

8. **Create `src/server.ts`** — The boot sequence:
   ```
   Step 1: Import config (Zod validates env vars — crashes here if invalid)
   Step 2: Connect to DB pool (test with SELECT 1)
   Step 3: Run migrations
   Step 4: Start Express on config.PORT
   Step 5: Log "Server ready on port XXXX"
   ```
   Wrap everything in a try/catch. If any step fails, log the error and `process.exit(1)`.

9. **Add npm scripts to `package.json`:**
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

10. **Create `.env` file** (gitignored) with all required env vars pointing at your local PostgreSQL.

**How to test — do each of these manually:**

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
   ✅ Should complete with no errors and no changes (all migrations already applied).

6. **Spot-check table schemas:**
   ```bash
   psql $DATABASE_URL -c "\d expansions"
   psql $DATABASE_URL -c "\d cards"
   psql $DATABASE_URL -c "\d variants"
   psql $DATABASE_URL -c "\d deals"
   ```
   ✅ Columns, types, constraints, and indexes should match §9 exactly.

7. **Verify pg_trgm extension:**
   ```bash
   psql $DATABASE_URL -c "SELECT 'charizard' % 'charzard';"
   ```
   ✅ Should return `t` (true) — proves the extension is active.

8. **Test DB connection resilience:** Stop PostgreSQL, then hit the health endpoint:
   ```bash
   curl http://localhost:3000/healthz
   ```
   ✅ Should return HTTP 503 with `{"status":"error"}`. Start PostgreSQL again, retry — should return 200. The server itself should NOT have crashed.

**Deliverable:** A running Express server with an empty database, ready to receive data.

---

### Stage 2: Scrydex Client & Card Sync

**Install these packages:**
```bash
npm install bottleneck   # Rate limiter (simpler than writing our own token bucket)
```

**Step-by-step:**

1. **Create `src/services/scrydex/client.ts`** — The API client. Every request goes through this file.
   - Base URL: `https://api.scrydex.com/pokemon/v1/en` (language in path, not query param)
   - Headers: `Authorization: Bearer <SCRYDEX_API_KEY>`, `X-Team-Id: <SCRYDEX_TEAM_ID>`
   - Rate limiter: Use `bottleneck` with `maxConcurrent: 10`, `minTime: 13` (≈80 req/sec, stays under 100/sec limit)
   - Retry: On 429 or 5xx, retry up to 3 times with exponential backoff (1s, 2s, 4s)
   - Methods to create:
     - `getExpansions()` → `GET /expansions` — returns all expansions
     - `getExpansionCards(expansionId, page)` → `GET /expansions/{id}/cards?include=prices&page={page}` — returns cards with pricing
     - `getAccountCredits()` → `GET /account` — returns remaining Scrydex credits
   - Every response should log the credits remaining (from response headers or account endpoint)

2. **Create `src/services/scrydex/rate-limiter.ts`** — Wrap Bottleneck instance. Export a `schedule(fn)` method that queues API calls. Log when approaching rate limit.

3. **Create `src/services/sync/sync-service.ts`** — The main sync orchestrator.
   - `syncAll()` method — the full sync flow:
     ```
     Step 1: Create sync_log entry (status: 'running')
     Step 2: Fetch all expansions → upsert into expansions table
     Step 3: For each expansion, fetch all pages of cards
     Step 4: For each card, extract ALL variants with ALL prices
     Step 5: Batch insert cards (100 per INSERT)
     Step 6: Batch insert variants (100 per INSERT)
     Step 7: Update sync_log (status: 'completed', counts)
     ```
   - **Critical: Extract ALL price data per variant, not just the first price.** Each variant from Scrydex has a `prices` object with conditions (NM, LP, MP, HP). Each condition has `low` and `market`. Store the entire prices object as JSONB.
   - **Store trend data:** Each variant has trend data per condition per time window (1d, 7d, 14d, 30d, 90d, 180d). Store as JSONB in the `trends` column.
   - **Store graded prices:** If the variant has graded pricing (PSA 10, CGC 9.5, etc.), store in `graded_prices` JSONB column.

4. **Create `src/services/sync/batch-insert.ts`** — Helper for efficient database writes.
   - Takes an array of rows + table name + column definitions
   - Splits into chunks of 100 rows
   - Builds a single `INSERT INTO ... VALUES ($1,$2,...),($3,$4,...) ON CONFLICT ... DO UPDATE SET ...` statement per chunk
   - Uses parameterized queries (never string interpolation)
   - Returns count of rows upserted

5. **Create `src/services/sync/transformers.ts`** — Functions to transform Scrydex API responses into database rows.
   - `transformExpansion(apiExpansion)` → `{ scrydex_expansion_id, name, code, series, ... }`
   - `transformCard(apiCard, expansionId)` → `{ scrydex_card_id, expansion_id, name, number, ... }`
   - `transformVariant(apiVariant, cardId)` → `{ card_id, name, prices: {...}, trends: {...}, graded_prices: {...} }`
   - Log warnings when expected data is missing (e.g., a variant with no prices)

6. **Add a sync trigger** — For now, add a temporary route or npm script to trigger sync manually:
   ```json
   "scripts": {
     "sync": "tsx src/scripts/run-sync.ts"
   }
   ```
   Create `src/scripts/run-sync.ts` that imports the sync service and runs `syncAll()`.

**How to test — all live data:**

```bash
# Run a full sync against the real Scrydex API
npm run sync

# Check expansion count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM expansions;"
# ✅ Should be ~350+

# Check card count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM cards;"
# ✅ Should be ~35,000+

# Check variant count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM variants;"
# ✅ Should be ~70,000+

# Spot-check a known card — Charizard from Base Set
psql $DATABASE_URL -c "SELECT c.name, c.number, v.name as variant, v.prices FROM cards c JOIN variants v ON v.card_id = c.scrydex_card_id WHERE c.name ILIKE '%charizard%' AND c.number = '4' LIMIT 5;"
# ✅ Should show Charizard with holofoil variant, prices JSONB should contain NM, LP, MP, HP with low/market values

# Verify prices have ALL conditions, not just first
psql $DATABASE_URL -c "SELECT v.prices FROM variants v LIMIT 1;"
# ✅ JSONB should look like: {"raw": {"NM": {"low": 45.00, "market": 52.00}, "LP": {"low": 30.00, "market": 38.00}, ...}}

# Verify trends stored
psql $DATABASE_URL -c "SELECT v.trends FROM variants v WHERE v.trends IS NOT NULL LIMIT 1;"
# ✅ Should contain per-condition trend windows: {"NM": {"1d": ..., "7d": ..., "30d": ...}, ...}

# Verify graded prices where available
psql $DATABASE_URL -c "SELECT v.graded_prices FROM variants v WHERE v.graded_prices IS NOT NULL LIMIT 1;"
# ✅ Should contain PSA/CGC/BGS prices

# Check sync log
psql $DATABASE_URL -c "SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 1;"
# ✅ status should be 'completed', expansions_synced/cards_upserted/variants_upserted should be > 0

# Verify pg_trgm fuzzy search works
psql $DATABASE_URL -c "SELECT name FROM cards WHERE name % 'charzard' LIMIT 5;"
# ✅ Should return Charizard cards despite the misspelling

# Verify idempotency — run sync again
npm run sync
psql $DATABASE_URL -c "SELECT COUNT(*) FROM cards;"
# ✅ Same count as before (no duplicates)
```

**Deliverable:** A populated card database with real pricing, trends, and images for every English Pokemon card.

---

### Stage 3: Card Catalog API & Frontend

**Install these packages:**
```bash
# Backend (already have express, pg from Stage 1)
# No new backend packages needed

# Frontend — create Vite React project
cd client   # or wherever frontend lives
npm create vite@latest . -- --template react-ts
npm install react-router-dom
npm install -D @types/react @types/react-dom
```

**Step-by-step — Backend API:**

1. **Create `src/routes/catalog.ts`** — Express router with all public catalog endpoints. No auth middleware on any of these routes.

2. **Create `src/services/catalog/queries.ts`** — Database query functions for the catalog. Each function takes query params and returns structured data. All queries use parameterized `$1, $2` syntax (no string interpolation).

   **Endpoints to build:**

   a. **`GET /api/catalog/expansions`** — List all expansions.
      - Query params: `?sort=release_date|name|card_count` (default: `-release_date`), `?series=Scarlet & Violet` (optional filter), `?page=1&limit=24`
      - SQL: `SELECT * FROM expansions ORDER BY release_date DESC LIMIT $1 OFFSET $2`
      - Response: `{ data: [...], total: 350, page: 1, limit: 24 }`
      - Each expansion object: `{ id, name, code, series, logo, cardCount, releaseDate }`

   b. **`GET /api/catalog/expansions/:id`** — Expansion detail with card list.
      - URL param: expansion `scrydex_expansion_id`
      - Query params: `?sort=number|name|price` (default: `number`), `?rarity=...`, `?page=1&limit=50`
      - SQL: Join `cards` and `variants` for this expansion. For each card, include the default variant's NM market price for the list view.
      - Response: `{ expansion: {...}, cards: { data: [...], total: 180, page: 1 } }`

   c. **`GET /api/catalog/cards/search`** — Full-text card search using pg_trgm.
      - Query params: `?q=charizard` (required), `?page=1&limit=24`
      - SQL: `SELECT * FROM cards WHERE name % $1 ORDER BY similarity(name, $1) DESC LIMIT $2 OFFSET $3`
      - This handles misspellings automatically (pg_trgm fuzzy matching)
      - Response: `{ data: [...], total: 42, page: 1, query: "charizard" }`

   d. **`GET /api/catalog/cards/:id`** — Full card detail with all variants, prices, trends.
      - URL param: card `scrydex_card_id`
      - SQL: Fetch card + JOIN all variants. Include expansion info.
      - Response shape:
        ```json
        {
          "card": { "id", "name", "number", "image", "rarity", "supertype", "subtypes", "artist" },
          "expansion": { "id", "name", "code", "series", "logo" },
          "variants": [
            {
              "name": "holofoil",
              "image": "...",
              "prices": { "NM": {"low": 45, "market": 52}, "LP": {...}, "MP": {...}, "HP": {...} },
              "trends": { "NM": {"1d": {...}, "7d": {...}, "30d": {...}, "90d": {...}, "180d": {...}}, ... },
              "gradedPrices": { "PSA_10": {"low": 200, "market": 280}, ... } | null
            }
          ]
        }
        ```

   e. **`GET /api/catalog/trending`** — Biggest price movers.
      - Query params: `?period=1d|7d|14d|30d|90d` (default: `7d`), `?direction=up|down|both` (default: `both`), `?minPrice=5` (default: 5, filters bulk), `?condition=NM|LP|MP|HP` (default: `NM`), `?limit=50`
      - SQL: Query variants JSONB trends column, extract the percentage change for the requested period and condition, sort by absolute change descending.
      - Response: `{ data: [{ card, variant, currentPrice, priceChange, percentChange, period }], total: 50 }`

3. **Mount the catalog router** in `src/app.ts`:
   ```typescript
   app.use('/api/catalog', catalogRouter);  // No auth middleware
   ```

4. **Add pagination helper** — `src/utils/pagination.ts`. Takes `page` and `limit` query params, returns `{ offset, limit, page }`. Validates: page ≥ 1, limit between 1-100, defaults: page=1, limit=24.

**Step-by-step — Frontend:**

5. **Create the Vite React project** in a `client/` directory at the project root. Use React + TypeScript template.

6. **Set up React Router** in `client/src/App.tsx` with routes:
   ```
   /catalog                → ExpansionBrowser
   /catalog/expansions/:id → ExpansionDetail
   /catalog/cards/:id      → CardDetail
   /catalog/search         → SearchResults
   /catalog/trending       → TrendingCards
   ```

7. **Create shared components** in `client/src/components/`:
   - `Header.tsx` — Top nav with logo "PokeSnipe", nav tabs (Dashboard, Catalog), search bar. Use the glass morphism design from §12 of the frontend spec.
   - `CardGrid.tsx` — Responsive grid that renders card thumbnails. Props: cards array, columns (4/3/2 responsive). Each card shows: image, name, number, NM price.
   - `PriceTable.tsx` — Tabular display of per-condition prices (NM/LP/MP/HP with low/market columns). Uses DM Mono font for alignment.
   - `TrendDisplay.tsx` — Shows trend arrows and percentages for each time window. Green for positive, red for negative, grey for <1%.
   - `Pagination.tsx` — Page controls (prev/next, page numbers).
   - `SearchBar.tsx` — Text input with search icon. On submit, navigates to `/catalog/search?q=...`.

8. **Create page components** in `client/src/pages/catalog/`:
   - `ExpansionBrowser.tsx` — Fetches `GET /api/catalog/expansions`, renders grid of expansion cards grouped by series. Each card shows logo, name, code, card count, release date. Click navigates to expansion detail.
   - `ExpansionDetail.tsx` — Fetches `GET /api/catalog/expansions/:id`, shows expansion header (large logo, name, stats) + card grid. Sort and filter controls. Click card navigates to card detail.
   - `CardDetail.tsx` — Fetches `GET /api/catalog/cards/:id`, shows large card image, variant selector tabs, price table per condition, graded prices, trend chart, expansion info. This is the most complex page — refer to §7.5 of the frontend spec.
   - `SearchResults.tsx` — Reads `?q=` from URL, fetches `GET /api/catalog/cards/search?q=...`, renders results as card grid.
   - `TrendingCards.tsx` — Fetches `GET /api/catalog/trending`, shows filter controls (period, direction, min price, condition) and results list with price movement data.

9. **Set up API fetching** — Create `client/src/api/catalog.ts` with typed fetch functions:
   ```typescript
   export async function getExpansions(params): Promise<ExpansionListResponse> { ... }
   export async function getExpansionDetail(id): Promise<ExpansionDetailResponse> { ... }
   export async function getCard(id): Promise<CardDetailResponse> { ... }
   export async function searchCards(query, params): Promise<SearchResponse> { ... }
   export async function getTrending(params): Promise<TrendingResponse> { ... }
   ```

10. **Configure Vite proxy** — In `vite.config.ts`, proxy `/api` to the Express backend so frontend dev server can call the API without CORS issues. For production, Express serves the built static files from `client/dist/`.

11. **Add build integration** — Update the backend to serve frontend static files:
    ```typescript
    // In src/app.ts (production only):
    app.use(express.static(path.join(__dirname, '../client/dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));
    ```

**How to test — all against live Railway with real synced data:**

```bash
RAILWAY_URL="https://your-app.railway.app"

# Test expansion list
curl "$RAILWAY_URL/api/catalog/expansions?limit=5" | jq '.data | length'
# ✅ Should return 5

curl "$RAILWAY_URL/api/catalog/expansions" | jq '.total'
# ✅ Should be ~350+

# Test expansion detail — get first expansion ID, then fetch its cards
EXPANSION_ID=$(curl -s "$RAILWAY_URL/api/catalog/expansions?limit=1" | jq -r '.data[0].id')
curl "$RAILWAY_URL/api/catalog/expansions/$EXPANSION_ID" | jq '.cards.data | length'
# ✅ Should return cards for that expansion

# Test card search
curl "$RAILWAY_URL/api/catalog/cards/search?q=charizard" | jq '.data[0].name'
# ✅ Should return "Charizard" or "Charizard ex" etc.

# Test misspelled search
curl "$RAILWAY_URL/api/catalog/cards/search?q=charzard" | jq '.data | length'
# ✅ Should return results (pg_trgm fuzzy match)

# Test card detail — get a card ID from search
CARD_ID=$(curl -s "$RAILWAY_URL/api/catalog/cards/search?q=charizard&limit=1" | jq -r '.data[0].id')
curl "$RAILWAY_URL/api/catalog/cards/$CARD_ID" | jq '.'
# ✅ Should show: card info, expansion info, variants array
# ✅ Each variant should have prices with NM/LP/MP/HP, trends, optional gradedPrices

# Test trending
curl "$RAILWAY_URL/api/catalog/trending?period=7d&limit=10" | jq '.data | length'
# ✅ Should return up to 10 trending cards with price change data

# Test sorting
curl "$RAILWAY_URL/api/catalog/expansions?sort=name&limit=3" | jq '[.data[].name]'
# ✅ Should be in alphabetical order

# Test pagination
PAGE1=$(curl -s "$RAILWAY_URL/api/catalog/expansions?page=1&limit=5" | jq '[.data[].id]')
PAGE2=$(curl -s "$RAILWAY_URL/api/catalog/expansions?page=2&limit=5" | jq '[.data[].id]')
# ✅ PAGE1 and PAGE2 should have different IDs (no overlap)

# Test frontend loads
curl -s "$RAILWAY_URL/catalog" | grep -c "<!DOCTYPE html"
# ✅ Should return 1 (HTML page served)

# Test no auth required (no cookie, no token)
curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/catalog/expansions"
# ✅ Should return 200 (not 401)
```

**Frontend manual testing (in browser):**
- Open `https://your-app.railway.app/catalog` — expansion grid should load with logos
- Click an expansion — should show card grid with images and prices
- Click a card — should show full detail: image, variant selector, all condition prices, trends, graded prices
- Type in search bar — results should appear, misspellings should work
- Click "Trending" — should show price movers with real data
- Test on mobile width (Chrome DevTools) — grid should reflow to fewer columns

**Deliverable:** A working, browsable card catalog — useful on its own before any arbitrage scanning exists.

---

### Stage 4: Exchange Rate & Pricing Engine

**Install these packages:**
```bash
npm install node-fetch   # Or use built-in fetch if Node 18+
```

**Step-by-step:**

1. **Create `src/services/exchange-rate/exchange-rate-service.ts`** — Fetches USD→GBP rate from an exchange rate API (e.g., exchangerate-api.com or similar service using `EXCHANGE_RATE_API_KEY`).
   - `fetchRate()` — Makes the API call, returns `{ rate: number, fetchedAt: Date }`
   - `saveRate(rate)` — Inserts into `exchange_rates` table
   - `getLatestRate()` — Queries the most recent rate: `SELECT rate, fetched_at FROM exchange_rates WHERE from_currency='USD' AND to_currency='GBP' ORDER BY fetched_at DESC LIMIT 1`
   - `isStale()` — Returns `true` if the latest rate is older than 6 hours
   - **Hard gate:** Export a `getValidRate()` function that calls `getLatestRate()` and throws `ExchangeRateStaleError` if the rate is >6 hours old. This is called by the pricing engine — no stale rates ever reach a deal.
   - **No hardcoded fallback.** If there's no rate in the DB (first boot), throw an error. The sync must run before deals can be created.

2. **Create `src/services/pricing/buyer-protection.ts`** — Pure function, zero dependencies. Calculates eBay Buyer Protection fee using tiered bands.
   ```typescript
   // eBay Buyer Protection fee tiers (UK):
   // First £10.00 of total: 3%
   // £10.01 – £50.00: 5%
   // £50.01 – £500.00: 4%
   // £500.01+: 2%
   // Plus flat fee of £0.10 per transaction
   //
   // Example: £50 item
   //   £10.00 × 3% = £0.30
   //   £40.00 × 5% = £2.00
   //   + £0.10 flat = £2.40
   //   Total fee: £2.40

   export function calculateBuyerProtection(itemPriceGBP: number): number { ... }
   ```
   **Important:** This is a pure function — it takes a number (item price in GBP) and returns a number (the fee). No DB calls, no side effects. Easy to test.

3. **Create `src/services/pricing/pricing-engine.ts`** — The core profit calculator.
   - `calculateProfit(input)` takes:
     ```typescript
     interface ProfitInput {
       ebayPriceGBP: number;        // eBay listing price in GBP
       shippingGBP: number;         // Shipping cost in GBP
       condition: 'NM' | 'LP' | 'MP' | 'HP';
       variantPrices: {             // From Scrydex variant.prices
         NM?: { low: number; market: number };
         LP?: { low: number; market: number };
         MP?: { low: number; market: number };
         HP?: { low: number; market: number };
       };
       exchangeRate: number;        // USD → GBP
     }
     ```
   - Returns:
     ```typescript
     interface ProfitResult {
       totalCostGBP: number;      // eBay price + shipping + buyer protection fee
       marketValueUSD: number;    // Scrydex market price for this condition
       marketValueGBP: number;    // marketValueUSD × exchangeRate
       profitGBP: number;         // marketValueGBP - totalCostGBP
       profitPercent: number;     // (profitGBP / totalCostGBP) × 100
       buyerProtectionFee: number;
       breakdown: { ebay, shipping, fee, totalCost, marketUSD, fxRate, marketGBP, profit };
     }
     ```
   - **Key rule:** Use the condition-specific price from Scrydex. If the listing is LP condition, use the LP market price, not NM. If the condition price is missing, fall back to LP price (conservative).

4. **Wire the exchange rate fetching into the boot sequence** — After DB connection and migration, fetch the initial exchange rate. Log a warning if it fails (scanner won't work until a rate exists, but the server can still serve the catalog).

**How to test — pure function tests + live API:**

**Vitest (pure functions only — `src/__tests__/stage4/`):**

- `buyer-protection.test.ts` — Pure math, no external calls:
  ```typescript
  expect(calculateBuyerProtection(10)).toBeCloseTo(0.40);    // £10 × 3% + £0.10 flat
  expect(calculateBuyerProtection(50)).toBeCloseTo(2.40);    // (£10×3%) + (£40×5%) + £0.10
  expect(calculateBuyerProtection(500)).toBeCloseTo(20.40);  // + (£450×4%)
  expect(calculateBuyerProtection(1000)).toBeCloseTo(30.40); // + (£500×2%)
  expect(calculateBuyerProtection(0)).toBe(0);
  ```

- `pricing-engine.test.ts` — Pure math:
  ```typescript
  // Profitable deal
  const result = calculateProfit({
    ebayPriceGBP: 12.50, shippingGBP: 1.99, condition: 'NM',
    variantPrices: { NM: { low: 45, market: 52 } }, exchangeRate: 0.789
  });
  expect(result.profitGBP).toBeGreaterThan(0);

  // Loss — eBay price higher than market
  const loss = calculateProfit({
    ebayPriceGBP: 100, shippingGBP: 5, condition: 'NM',
    variantPrices: { NM: { low: 45, market: 52 } }, exchangeRate: 0.789
  });
  expect(loss.profitGBP).toBeLessThan(0);

  // Condition-specific: LP listing uses LP price
  const lpResult = calculateProfit({
    ebayPriceGBP: 12.50, shippingGBP: 1.99, condition: 'LP',
    variantPrices: { NM: { low: 45, market: 52 }, LP: { low: 30, market: 38 } }, exchangeRate: 0.789
  });
  expect(lpResult.marketValueUSD).toBe(38);
  ```

**Live tests on Railway:**

```bash
# Verify exchange rate fetched from real API on boot
psql $DATABASE_URL -c "SELECT rate, fetched_at FROM exchange_rates ORDER BY fetched_at DESC LIMIT 1;"
# ✅ Should show a real USD→GBP rate (around 0.78-0.82) with recent timestamp

# Verify pricing engine against a real card from the synced database
# Pick a card with known pricing, manually calculate expected profit, then test via the lookup endpoint (once built)
curl "$RAILWAY_URL/healthz"
# ✅ Server still healthy after exchange rate integration
```

**Deliverable:** A pricing engine that produces correct profit calculations for any card + condition + eBay price combination.

---

### Stage 5: eBay Client & Search

**No new packages needed** (uses `bottleneck` from Stage 2, built-in `fetch` or `node-fetch`).

**Step-by-step:**

1. **Create `src/services/ebay/auth.ts`** — eBay OAuth2 client credentials flow.
   - eBay uses OAuth2 "client credentials" grant — you POST to the token endpoint with your app ID and secret to get an access token.
   - Token endpoint: `https://api.ebay.com/identity/v1/oauth2/token`
   - Request: `POST` with `Content-Type: application/x-www-form-urlencoded`, body: `grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope`
   - Auth header: `Basic <base64(CLIENT_ID:CLIENT_SECRET)>`
   - Response: `{ access_token: "v^1.1#i...", expires_in: 7200, token_type: "Application Access Token" }`
   - **Cache the token in memory.** Store `{ token, expiresAt }`. Before any API call, check if the token is expired or will expire in <5 minutes. If so, fetch a new one.
   - Export `getAccessToken()` that returns a valid token (auto-refreshes if needed).

2. **Create `src/services/ebay/client.ts`** — The eBay Browse API client.
   - Base URL: `https://api.ebay.com/buy/browse/v1`
   - All requests include: `Authorization: Bearer <token>`, `X-EBAY-C-MARKETPLACE-ID: EBAY_GB`, `Content-Type: application/json`

   **Method 1: `searchItems(query, limit, options)`**
   ```typescript
   // Endpoint: GET /item_summary/search
   // Query params:
   //   q: 'pokemon'
   //   limit: 200
   //   category_ids: '183454'  (Individual Trading Cards)
   //   sort: 'newlyListed'
   //   filter: 'price:[10..],priceCurrency:GBP,buyingOptions:{FIXED_PRICE},conditionIds:{2750|4000|1000|1500|2000|2500|3000},deliveryCountry:GB'
   //
   // Returns: { itemSummaries: [...], total: number, next: string | null }
   ```

   **Method 2: `getItem(itemId)`**
   ```typescript
   // Endpoint: GET /item/{itemId}
   // Returns the FULL listing including:
   //   - localizedAspects: [{ type, name, value }]  ← Card Name, Set, Card Number, etc.
   //   - conditionDescriptors: [{ name, values }]   ← Condition IDs from §3.4
   //   - description: string                         ← Full listing description
   //   - All the fields from search (price, shipping, images, seller, etc.)
   ```

3. **Create `src/services/ebay/rate-limiter.ts`** — eBay rate limiter using Bottleneck.
   - `maxConcurrent: 5`, `minTime: 200` (5 req/sec — conservative for eBay)
   - Parse rate limit headers from responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
   - If `X-RateLimit-Remaining` drops below 10, slow down automatically

4. **Create `src/services/ebay/budget.ts`** — Daily API call budget tracker.
   ```typescript
   // In-memory counter (resets at midnight UTC)
   const budget = {
     dailyLimit: 5000,
     used: 0,
     resetAt: nextMidnightUTC(),
   };

   export function trackCall(): void { ... }         // Increment counter
   export function getRemainingBudget(): number { ... } // dailyLimit - used
   export function canMakeCall(): boolean { ... }     // used < dailyLimit
   export function getBudgetStatus(): BudgetStatus { ... } // For /api/status
   ```
   - Every API call (search or getItem) calls `trackCall()` after executing
   - `canMakeCall()` is checked BEFORE making any API call
   - If budget exhausted, log a warning and skip until reset

5. **Create `src/services/ebay/types.ts`** — TypeScript interfaces for eBay API responses.
   - `EbaySearchResponse` — the full search response shape
   - `EbayItemSummary` — a single item from search results
   - `EbayItemDetail` — the full getItem response
   - `EbayConditionDescriptor` — `{ name: string, values: string[] }`
   - `EbayLocalizedAspect` — `{ type: string, name: string, value: string }`

**How to test — live eBay API calls:**

Create `src/scripts/test-ebay.ts` — a real test script that calls the live eBay API:

```bash
npx tsx src/scripts/test-ebay.ts
```

The script should:
1. Get a real OAuth token → print "Token obtained: v^1.1#i..."
2. Call `searchItems('pokemon', 10, ...)` (limit 10 to conserve budget) → print item count
3. Verify all results are Buy It Now, £10+, from category 183454
4. Pick one item, call `getItem(itemId)` → print whether `localizedAspects` and `conditionDescriptors` are present
5. Print budget: "API calls used: 2/5000"

```bash
# Verify the output:
# ✅ "Token obtained" (OAuth works with real credentials)
# ✅ "Search returned N items" (real search works)
# ✅ "All items are FIXED_PRICE" (filter applied correctly)
# ✅ "All items are £10+" (price filter works)
# ✅ "getItem returned localizedAspects: true" (real enrichment data available)
# ✅ "getItem returned conditionDescriptors: true" (real condition data available)
# ✅ "Budget: 2/5000" (tracking works)
```

Keep `src/scripts/test-ebay.ts` in the project — it's useful for diagnosing eBay API issues later.

**Deliverable:** Working eBay API client that can search listings and fetch individual item details.

---

### Stage 6: Signal Extraction & Condition Mapping

**No new packages needed.** All signal extraction is pure TypeScript string processing and mapping.

**Step-by-step:**

1. **Create `src/services/extraction/title-cleaner.ts`** — Phase 1: Clean raw eBay titles.
   - Strip emojis (regex: `[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}...]/gu`)
   - Decode HTML entities (`&amp;` → `&`, `&#39;` → `'`, etc.)
   - Collapse multiple spaces to single space
   - Trim whitespace
   - Lowercase for matching (keep original for display)
   - Export: `cleanTitle(raw: string): { cleaned: string; original: string }`

2. **Create `src/services/extraction/junk-detector.ts`** — Phase 2: Classify listing as junk/bulk/fake and reject early.
   - **Bulk patterns** (reject these): `lot`, `bundle`, `bulk`, `collection`, `x10`, `x20`, `x50`, `x100`, `set of`, `mystery`, `random`, `grab bag`, `job lot`
   - **Fake patterns** (reject these): `custom`, `proxy`, `orica`, `replica`, `fake`, `unofficial`, `fan made`, `altered art` (when clearly custom)
   - **Non-card patterns** (reject these): `booster`, `booster box`, `etb`, `elite trainer`, `tin`, `binder`, `sleeve`, `playmat`, `deck box`, `code card`, `online code`
   - Check against the cleaned lowercase title. If any pattern matches, return `{ isJunk: true, reason: 'bulk_lot' | 'fake' | 'non_card' }`
   - Export: `detectJunk(title: string): { isJunk: boolean; reason?: string }`

3. **Create `src/services/extraction/number-extractor.ts`** — Phase 3: Extract card number from title.
   - Try patterns in priority order (first match wins):
     ```
     1. "SV065/198" → { number: 65, prefix: 'SV', denominator: 198 }
     2. "TG15/TG30"  → { number: 15, prefix: 'TG', denominator: 30 }
     3. "123/456"    → { number: 123, prefix: null, denominator: 456 }
     4. "#123"       → { number: 123, prefix: null, denominator: null }
     5. "No. 123"    → { number: 123, prefix: null, denominator: null }
     ```
   - Regex patterns: `/(SV|TG|GG|SWSH|SM|XY)?0*(\d{1,4})\s*\/\s*0*(\d{1,4})/i`, `/#0*(\d{1,4})/`, `/\bNo\.?\s*0*(\d{1,4})\b/i`
   - Strip leading zeros (065 → 65)
   - Export: `extractCardNumber(title: string): CardNumber | null`

4. **Create `src/services/extraction/variant-detector.ts`** — Phase 3b: Detect variant from title keywords.
   - Uses the keyword map from §4.6:
     ```
     'reverseHolofoil': ['reverse holo', 'reverse', 'rev holo']  ← check BEFORE 'holofoil'
     'firstEditionHolofoil': ['1st edition holo', '1st ed holo'] ← check BEFORE 'firstEditionNormal'
     'holofoil': ['holo', 'holographic', 'holo rare']
     'firstEditionNormal': ['1st edition', '1st ed', 'first edition']
     'unlimitedHolofoil': ['unlimited holo']
     'normal': [] (default)
     ```
   - **Order matters:** Check longer patterns first ("reverse holo" before "holo", "1st edition holo" before "1st edition")
   - Also detect: `'full art'`, `'alt art'`, `'alternate art'`, `'secret rare'`, `'gold'`, `'rainbow'`, `'shadowless'`
   - Export: `detectVariant(title: string): string | null` — returns Scrydex variant name or null

5. **Create `src/services/extraction/condition-mapper.ts`** — Map eBay condition descriptors to Scrydex conditions.
   - Import the full descriptor ID maps from §3.4 of this spec
   - `extractCondition(listing)` — the priority chain:
     ```
     Priority 1: conditionDescriptors (most reliable)
       - Check for graded: descriptor name '27501' present → graded card
       - Check for ungraded: descriptor name '40001' → map value to NM/LP/MP/HP
     Priority 2: localizedAspects
       - Look for aspect named 'Card Condition' → map text to NM/LP/MP/HP
     Priority 3: Title parsing
       - Look for 'near mint', 'nm', 'lightly played', 'lp', 'moderately played', 'mp', 'heavily played', 'hp'
     Priority 4: Default LP (conservative)
     ```
   - For graded cards, also extract: grading company (from `27501`), grade (from `27502`), cert number (from `27503`)
   - Export: `extractCondition(listing): ConditionResult` (interface from §3.4)

6. **Create `src/services/extraction/structured-extractor.ts`** — Extract signals from `localizedAspects` (the structured fields from getItem enrichment).
   - Look for these aspect names: `'Card Name'`, `'Set'`, `'Card Number'`, `'Rarity'`, `'Professional Grader'`, `'Grade'`, `'Language'`, `'Year Manufactured'`
   - Map them to our normalized structure
   - Export: `extractStructuredData(aspects: LocalizedAspect[]): StructuredSignals`

7. **Create `src/services/extraction/signal-merger.ts`** — Phase 5: Merge all signals into a `NormalizedListing`.
   - Takes: title signals (number, variant, condition from title) + structured signals (from localizedAspects) + condition descriptor signals
   - **Rule: Structured data wins over title data when both exist.** If the title says "Holo" but localizedAspects says the card name, use localizedAspects for the name.
   - **Rule: Condition descriptors win over everything** for condition.
   - If signals conflict (title says NM but descriptor says LP), log a warning and use the higher-priority source.
   - Export: `mergeSignals(titleSignals, structuredSignals, conditionResult): NormalizedListing`

8. **Create `src/services/extraction/index.ts`** — The main extraction pipeline that ties it all together:
   ```typescript
   export function extractSignals(listing: EbayListing): ExtractionResult {
     const cleaned = cleanTitle(listing.title);
     const junk = detectJunk(cleaned.cleaned);
     if (junk.isJunk) return { rejected: true, reason: junk.reason };

     const cardNumber = extractCardNumber(cleaned.cleaned);
     const variant = detectVariant(cleaned.cleaned);
     const condition = extractCondition(listing);  // Uses descriptors if enriched
     const structured = listing.localizedAspects
       ? extractStructuredData(listing.localizedAspects) : null;

     return mergeSignals({ cardNumber, variant, titleCondition: condition }, structured, condition);
   }
   ```

**How to test:**

**Automated tests (`src/__tests__/stage6/`)** — All pure function tests, no DB or API needed:

- `title-cleaner.test.ts`:
  ```typescript
  expect(cleanTitle('🔥 Charizard  ex  &amp; Friends!! 🔥').cleaned)
    .toBe('charizard ex & friends!!');
  expect(cleanTitle('   lots   of   spaces   ').cleaned).toBe('lots of spaces');
  ```

- `junk-detector.test.ts`:
  ```typescript
  // Bulk → rejected
  expect(detectJunk('pokemon card lot bundle x50')).toEqual({ isJunk: true, reason: 'bulk_lot' });
  expect(detectJunk('mystery grab bag 10 random cards')).toEqual({ isJunk: true, reason: 'bulk_lot' });
  // Fake → rejected
  expect(detectJunk('custom proxy charizard orica')).toEqual({ isJunk: true, reason: 'fake' });
  // Non-card → rejected
  expect(detectJunk('pokemon booster box scarlet violet')).toEqual({ isJunk: true, reason: 'non_card' });
  // Real card → not rejected
  expect(detectJunk('charizard ex 006/197 obsidian flames')).toEqual({ isJunk: false });
  expect(detectJunk('pikachu vmax 044/185 vivid voltage')).toEqual({ isJunk: false });
  ```

- `number-extractor.test.ts`:
  ```typescript
  // Standard format
  expect(extractCardNumber('Charizard 006/197')).toEqual({ number: 6, prefix: null, denominator: 197 });
  // Prefix format
  expect(extractCardNumber('SV065/198 Iono SAR')).toEqual({ number: 65, prefix: 'SV', denominator: 198 });
  // Trainer gallery
  expect(extractCardNumber('TG15/TG30 Pikachu')).toEqual({ number: 15, prefix: 'TG', denominator: 30 });
  // Hash format
  expect(extractCardNumber('Mewtwo #150')).toEqual({ number: 150, prefix: null, denominator: null });
  // No number
  expect(extractCardNumber('Pokemon Card Holo Rare')).toBeNull();
  ```

- `variant-detector.test.ts`:
  ```typescript
  expect(detectVariant('reverse holo charizard')).toBe('reverseHolofoil');
  expect(detectVariant('holo rare pikachu')).toBe('holofoil');
  expect(detectVariant('1st edition holo charizard')).toBe('firstEditionHolofoil');
  expect(detectVariant('1st edition dark blastoise')).toBe('firstEditionNormal');
  expect(detectVariant('charizard ex 006/197')).toBeNull();  // No variant keyword → null
  ```

- `condition-mapper.test.ts`:
  ```typescript
  // From condition descriptors (highest priority)
  expect(extractCondition({
    conditionDescriptors: [{ name: '40001', values: ['400010'] }]
  }).condition).toBe('NM');

  expect(extractCondition({
    conditionDescriptors: [{ name: '40001', values: ['400015'] }]
  }).condition).toBe('LP');

  // Graded card
  const graded = extractCondition({
    conditionDescriptors: [
      { name: '27501', values: ['275010'] },  // PSA
      { name: '27502', values: ['275020'] },  // Grade 10
      { name: '27503', values: ['cert-123'] }
    ]
  });
  expect(graded.isGraded).toBe(true);
  expect(graded.gradingCompany).toBe('PSA');
  expect(graded.grade).toBe('10');
  expect(graded.certNumber).toBe('cert-123');

  // No descriptors → fall back to title
  expect(extractCondition({
    conditionDescriptors: [],
    title: 'Near Mint Charizard'
  }).condition).toBe('NM');

  // Nothing at all → default LP
  expect(extractCondition({
    conditionDescriptors: [], title: 'Charizard ex', localizedAspects: null
  }).condition).toBe('LP');
  expect(extractCondition({
    conditionDescriptors: [], title: 'Charizard ex', localizedAspects: null
  }).source).toBe('default');
  ```

- `signal-merger.test.ts`:
  ```typescript
  // Structured data overrides title data
  const result = mergeSignals(
    { cardNumber: { number: 6 }, variant: 'holofoil' },
    { cardName: 'Charizard ex', set: 'Obsidian Flames', cardNumber: '006' },
    { condition: 'NM', source: 'condition_descriptor' }
  );
  expect(result.cardName).toBe('Charizard ex');  // From structured, not title
  expect(result.condition).toBe('NM');            // From descriptor
  ```

```bash
npm test -- --run src/__tests__/stage6/
```

**No Railway smoke tests needed** — this stage is entirely pure functions with no external dependencies. If the automated tests pass, it works.

**Deliverable:** A signal extraction pipeline that converts raw eBay listings into structured, typed data.

---

### Stage 7: Matching Engine

**Install these packages:**
```bash
npm install jaro-winkler   # String similarity (or use 'string-similarity' / 'natural')
```

**Step-by-step:**

1. **Create `src/services/matching/candidate-lookup.ts`** — Find candidate cards from our local database using the extracted card number.
   - Primary query: `SELECT * FROM cards WHERE number = $1` (the extracted card number)
   - If a denominator was extracted (e.g., `/197`), narrow further: `AND printed_total = $2` or match against the expansion's total card count
   - If a prefix was extracted (e.g., `SV`, `TG`), use it to filter by number prefix
   - Returns an array of 0-N candidate cards
   - **If no number was extracted**, fall back to name-based lookup: `SELECT * FROM cards WHERE name % $1 LIMIT 20` (pg_trgm similarity)
   - Export: `findCandidates(signals: NormalizedListing): Promise<CandidateCard[]>`

2. **Create `src/services/matching/name-validator.ts`** — Compare the eBay listing's card name against each candidate using Jaro-Winkler similarity.
   - For each candidate card, compute `jaroWinkler(listing.cardName, candidate.name)`
   - **Hard gate:** If the best similarity is < 0.60, reject all candidates (no match)
   - **Soft gate:** If similarity is between 0.60-0.75, flag as low confidence but allow
   - Return candidates sorted by similarity score (best first)
   - Export: `validateNames(listingName: string, candidates: CandidateCard[]): ValidatedCandidate[]`

3. **Create `src/services/matching/expansion-validator.ts`** — Cross-validate the expansion if the eBay title or structured data mentions a set name.
   - If the listing mentions "Obsidian Flames" or "sv3", check if the candidate card's expansion matches
   - Match against expansion name (fuzzy) and code (exact)
   - Boost confidence if expansion matches, penalize if it conflicts
   - Export: `validateExpansion(listing: NormalizedListing, candidate: CandidateCard): ExpansionScore`

4. **Create `src/services/matching/variant-resolver.ts`** — Determine which variant of the card the listing is selling. Uses the logic from §4.6:
   - Step 1: Get all variants for the matched card: `SELECT * FROM variants WHERE card_id = $1`
   - Step 2: Filter to variants that have pricing data (prices JSONB is not empty/null)
   - Step 3: If only 1 priced variant → auto-select (confidence 0.95)
   - Step 4: If multiple priced variants → check listing's detected variant keyword against the variant keyword map
   - Step 5: If no keyword match → default to the CHEAPEST priced variant (confidence 0.50, conservative)
   - Export: `resolveVariant(listing: NormalizedListing, cardVariants: Variant[]): VariantMatch`

5. **Create `src/services/matching/confidence-scorer.ts`** — Calculate composite confidence score.
   - Individual scores (0-1 each):
     - `nameScore` — Jaro-Winkler similarity
     - `numberScore` — 1.0 if number matches, 0.0 if not, 0.5 if no number extracted
     - `denominatorScore` — 1.0 if denominator matches printed_total, 0.0 if conflicts, 0.5 if not extracted
     - `expansionScore` — 1.0 if matches, 0.0 if conflicts, 0.5 if not checked
     - `variantScore` — Confidence from variant resolver (0.95/0.85/0.50)
     - `extractionScore` — Higher if data came from structured fields vs. title-only
   - **Composite:** Weighted geometric mean (see §4.5 for weights)
   - Export: `calculateConfidence(scores: ScoreComponents): CompositeConfidence`

6. **Create `src/services/matching/gates.ts`** — Validation gates that determine whether a match is accepted.
   - **Hard gates** (instant reject):
     - Name similarity < 0.60
     - Number extracted but doesn't match any candidate
     - Denominator extracted and conflicts with all candidates
   - **Soft gates** (allow but flag):
     - Composite confidence < 0.45 → reject
     - Composite 0.45-0.65 → low tier (log only, don't display)
     - Composite 0.65-0.85 → medium (display with warning badge)
     - Composite ≥ 0.85 → high (display confidently)
   - Export: `applyGates(match: MatchResult): GatedResult`

7. **Create `src/services/matching/index.ts`** — The main matching pipeline:
   ```typescript
   export async function matchListing(signals: NormalizedListing): Promise<MatchResult | null> {
     const candidates = await findCandidates(signals);
     if (candidates.length === 0) return null;

     const validated = validateNames(signals.cardName, candidates);
     if (validated.length === 0) return null;  // Hard gate: no name close enough

     const bestCandidate = validated[0];
     const expansionScore = validateExpansion(signals, bestCandidate);
     const variantMatch = await resolveVariant(signals, bestCandidate.variants);
     const confidence = calculateConfidence({ ...scores });
     const gated = applyGates({ candidate: bestCandidate, variant: variantMatch, confidence });

     return gated;
   }
   ```

**How to test — pure function tests + live data:**

**Vitest (pure functions only — `src/__tests__/stage7/`):**

These functions take plain data in and return plain data out — no DB, no API:

- `name-validator.test.ts`:
  ```typescript
  // Build candidate objects inline (plain data, not from DB):
  const candidates = [
    { name: 'Charizard ex', id: 'charizard-ex-sv3-6' },
    { name: 'Charizard VMAX', id: 'charizard-vmax-swsh4-100' },
    { name: 'Pikachu VMAX', id: 'pikachu-vmax-swsh4-44' },
  ];

  // Exact match → high score
  const exact = validateNames('Charizard ex', candidates);
  expect(exact[0].similarity).toBeGreaterThan(0.95);

  // Misspelled → still matches
  const fuzzy = validateNames('Charzard ex', candidates);
  expect(fuzzy[0].similarity).toBeGreaterThan(0.60);
  expect(fuzzy[0].card.name).toBe('Charizard ex');

  // Completely wrong name → hard gate rejects
  const wrong = validateNames('Totally Different Card', candidates);
  expect(wrong.length).toBe(0);  // All below 0.60 threshold
  ```

- `variant-resolver.test.ts`:
  ```typescript
  // Single variant → auto-select
  const single = await resolveVariant(
    { variant: null },
    [{ name: 'normal', prices: { NM: { market: 5 } } }]
  );
  expect(single.variant.name).toBe('normal');
  expect(single.confidence).toBe(0.95);

  // Multi-variant + keyword → correct match
  const holo = await resolveVariant(
    { variant: 'holofoil' },
    [{ name: 'holofoil', prices: { NM: { market: 350 } } }, { name: 'normal', prices: { NM: { market: 5 } } }]
  );
  expect(holo.variant.name).toBe('holofoil');
  expect(holo.confidence).toBe(0.85);

  // Multi-variant + no keyword → cheapest (conservative)
  const noKeyword = await resolveVariant(
    { variant: null },
    [{ name: 'holofoil', prices: { NM: { market: 350 } } }, { name: 'normal', prices: { NM: { market: 5 } } }]
  );
  expect(noKeyword.variant.name).toBe('normal');  // Cheapest
  expect(noKeyword.confidence).toBe(0.50);
  ```

- `confidence-scorer.test.ts`:
  ```typescript
  // High confidence (all signals agree)
  expect(calculateConfidence({ nameScore: 0.95, numberScore: 1.0, denominatorScore: 1.0, expansionScore: 1.0, variantScore: 0.95, extractionScore: 1.0 }).composite).toBeGreaterThan(0.90);

  // Low confidence (name fuzzy, no number)
  expect(calculateConfidence({ nameScore: 0.65, numberScore: 0.5, denominatorScore: 0.5, expansionScore: 0.5, variantScore: 0.50, extractionScore: 0.3 }).composite).toBeLessThan(0.60);
  ```

- `gates.test.ts`:
  ```typescript
  // High composite → accepted
  expect(applyGates({ confidence: { composite: 0.90 } }).accepted).toBe(true);
  // Low composite → rejected
  expect(applyGates({ confidence: { composite: 0.40 } }).accepted).toBe(false);
  ```

```bash
npm test -- --run src/__tests__/stage7/
```

**Live data test — run against Railway with real synced database + real eBay listings:**

Create `src/scripts/test-matching.ts` that:
1. Fetches 10 real eBay listings via `searchItems()`
2. Runs each through `extractSignals()` + `matchListing()` (which queries the real synced card database)
3. Prints: title → matched card name + variant + confidence (or "no match")
4. You manually verify the matches are correct

```bash
npx tsx src/scripts/test-matching.ts
# Review output:
# ✅ "Charizard ex 006/197 Obsidian Flames" → Charizard ex (sv3-6) holofoil [0.92]
# ✅ "Pokemon Card Lot x20 Bundle" → REJECTED (bulk_lot)
# ✅ "Pikachu VMAX 044/185" → Pikachu VMAX (swsh4-44) normal [0.88]
# ✅ No wrong matches (false positives)
```

Keep `src/scripts/test-matching.ts` in the project — useful for debugging matching issues later.

**Deliverable:** A matching engine that correctly identifies which card an eBay listing is selling.

---

### Stage 8: Scanner Pipeline — End to End

**No new packages needed.** This stage wires together everything from Stages 4-7.

**Step-by-step:**

1. **Create `src/services/scanner/deduplicator.ts`** — Track which eBay item IDs have already been processed.
   - Keep an in-memory `Set<string>` of processed item IDs
   - Also check the `deals` table: `SELECT 1 FROM deals WHERE ebay_item_id = $1`
   - Export: `isDuplicate(itemId: string): Promise<boolean>` and `markProcessed(itemId: string): void`
   - Cap the in-memory set at 10,000 entries (evict oldest when full)

2. **Create `src/services/scanner/enrichment-gate.ts`** — Decides whether a Phase 1 match deserves a `getItem()` call.
   ```typescript
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

3. **Create `src/services/scanner/tier-classifier.ts`** — Assign deal tier based on profit and confidence.
   ```typescript
   export function classifyTier(profitPercent: number, confidence: number, liquidityGrade: string): DealTier {
     // Base tier from profit:
     //   >40% → GRAIL, 25-40% → HIT, 15-25% → FLIP, 5-15% → SLEEP
     // Liquidity adjustment (applied in Stage 9, for now just use profit):
     //   illiquid → cap at SLEEP, low → cap at FLIP, medium → GRAIL downgrades to HIT
     let tier: DealTier;
     if (profitPercent > 40 && confidence >= 0.85) tier = 'GRAIL';
     else if (profitPercent > 25 && confidence >= 0.65) tier = 'HIT';
     else if (profitPercent > 15) tier = 'FLIP';
     else tier = 'SLEEP';
     return tier;
   }
   ```

4. **Create `src/services/scanner/deal-creator.ts`** — Insert a new deal into the database.
   - Takes: matched card, variant, condition, profit result, eBay listing data, match signals
   - Inserts into `deals` table with all fields from §9 schema
   - Stores full audit trail in `match_signals` JSONB column (all extraction signals, confidence breakdown, enrichment data)
   - Returns the created deal (with `event_id` for SSE)
   - Export: `createDeal(data: DealInput): Promise<Deal>`

5. **Create `src/services/scanner/scanner-service.ts`** — The main scanner orchestrator. This is the core loop.
   ```typescript
   export async function runScanCycle(): Promise<ScanResult> {
     // Step 1: Check budget
     if (!canMakeCall()) { log.warn('Budget exhausted, skipping cycle'); return; }

     // Step 2: PHASE 1 — Search eBay
     const listings = await searchItems('pokemon', 200, { ... });
     trackCall();  // 1 search call used

     // Step 3: For each listing:
     const results = [];
     for (const listing of listings.itemSummaries) {
       // 3a. Check dedup
       if (await isDuplicate(listing.itemId)) continue;
       markProcessed(listing.itemId);

       // 3b. Extract signals (title-only for now)
       const signals = extractSignals(listing);
       if (signals.rejected) continue;

       // 3c. Match against card index
       const match = await matchListing(signals);
       if (!match) continue;

       // 3d. Quick profit estimate (title-parsed condition or default LP)
       const quickProfit = calculateProfit({
         ebayPriceGBP: listing.price.value,
         shippingGBP: listing.shipping?.value || 0,
         condition: signals.condition?.condition || 'LP',
         variantPrices: match.variant.prices,
         exchangeRate: await getValidRate()
       });

       // 3e. PHASE 2 — Enrichment gate
       if (shouldEnrich({ titleOnlyProfitPercent: quickProfit.profitPercent, confidence: match.confidence, isDuplicate: false }, getBudgetStatus())) {
         // Call getItem for full data
         const enriched = await getItem(listing.itemId);
         trackCall();  // 1 getItem call used

         // Re-extract with enriched data
         const enrichedSignals = extractSignals({ ...listing, ...enriched });
         const enrichedMatch = await matchListing(enrichedSignals);
         if (!enrichedMatch) continue;

         // Recalculate profit with real condition
         const realProfit = calculateProfit({
           ebayPriceGBP: listing.price.value,
           shippingGBP: listing.shipping?.value || 0,
           condition: enrichedSignals.condition.condition,
           variantPrices: enrichedMatch.variant.prices,
           exchangeRate: await getValidRate()
         });

         if (realProfit.profitPercent < 5) continue;  // Not profitable after enrichment

         // 3f. Create deal
         const tier = classifyTier(realProfit.profitPercent, enrichedMatch.confidence.composite, 'unknown');
         const deal = await createDeal({ listing, match: enrichedMatch, profit: realProfit, tier, signals: enrichedSignals });
         results.push(deal);
       }
     }

     return { dealsCreated: results.length, listingsProcessed: listings.itemSummaries.length };
   }
   ```

6. **Create `src/services/scanner/scan-loop.ts`** — Runs the scanner on a 5-minute interval.
   ```typescript
   let isRunning = false;

   export function startScanLoop(): void {
     setInterval(async () => {
       if (isRunning) { log.warn('Previous scan still running, skipping'); return; }
       isRunning = true;
       try {
         const result = await runScanCycle();
         log.info({ ...result }, 'Scan cycle complete');
       } catch (err) {
         log.error({ err }, 'Scan cycle failed');
       } finally {
         isRunning = false;
       }
     }, 5 * 60 * 1000);  // 5 minutes
   }
   ```

7. **Wire into boot sequence** — In `src/server.ts`, after DB connection and migrations, call `startScanLoop()`.

**How to test — pure function tests + live data:**

**Vitest (pure functions only — `src/__tests__/stage8/`):**

- `enrichment-gate.test.ts`:
  ```typescript
  // Profitable + confident → enrich
  expect(shouldEnrich({ titleOnlyProfitPercent: 20, confidence: { composite: 0.80 }, isDuplicate: false }, { remaining: 4000 })).toBe(true);
  // Low profit → skip
  expect(shouldEnrich({ titleOnlyProfitPercent: 10, confidence: { composite: 0.80 }, isDuplicate: false }, { remaining: 4000 })).toBe(false);
  // Low budget → higher threshold
  expect(shouldEnrich({ titleOnlyProfitPercent: 20, confidence: { composite: 0.80 }, isDuplicate: false }, { remaining: 300 })).toBe(false);  // 20% < 25% threshold
  expect(shouldEnrich({ titleOnlyProfitPercent: 30, confidence: { composite: 0.80 }, isDuplicate: false }, { remaining: 300 })).toBe(true);   // 30% ≥ 25%
  ```

- `tier-classifier.test.ts`:
  ```typescript
  expect(classifyTier(45, 0.90, 'high')).toBe('GRAIL');
  expect(classifyTier(30, 0.70, 'high')).toBe('HIT');
  expect(classifyTier(20, 0.60, 'high')).toBe('FLIP');
  expect(classifyTier(10, 0.50, 'high')).toBe('SLEEP');
  ```

```bash
npm test -- --run src/__tests__/stage8/
```

**Live data test — let the scanner run on Railway with real eBay API:**

```bash
# Let the scanner run for 30+ minutes (6+ cycles)
# Then check deals were created:
psql $DATABASE_URL -c "SELECT COUNT(*) FROM deals;"
# ✅ Should have some deals (depends on current eBay listings)

# Inspect a deal:
psql $DATABASE_URL -c "SELECT card_name, ebay_price_gbp, market_value_gbp, profit_gbp, profit_percent, tier, condition, confidence FROM deals ORDER BY created_at DESC LIMIT 5;"
# ✅ Verify manually:
#   - profit_gbp = market_value_gbp - (ebay_price + shipping + fee)
#   - tier matches profit thresholds (GRAIL >40%, HIT >25%, etc.)
#   - condition is NM/LP/MP/HP (not null)

# Check match signals audit trail:
psql $DATABASE_URL -c "SELECT match_signals FROM deals ORDER BY created_at DESC LIMIT 1;" | jq '.'
# ✅ Should contain: extraction signals, confidence breakdown, enrichment data

# Check no duplicate deals:
psql $DATABASE_URL -c "SELECT ebay_item_id, COUNT(*) FROM deals GROUP BY ebay_item_id HAVING COUNT(*) > 1;"
# ✅ Should return 0 rows (no duplicates)

# Check budget tracking (in application logs):
# Look for log lines like: "Scan cycle complete: { dealsCreated: 2, listingsProcessed: 200 }"
# ✅ Budget counter should increment by ~1 (search) + N (getItem calls)
```

**Deliverable:** A working arbitrage scanner that finds real deals automatically.

---

### Stage 9: Liquidity Engine & Sales Velocity

**No new packages needed.**

**Step-by-step:**

1. **Create `src/services/liquidity/tier1-signals.ts`** — Free signals from synced Scrydex data (no extra API calls).
   - **Trend activity:** Does this card have real price movement? Check the variant's `trends` JSONB.
     ```typescript
     // Score 0-1: how many trend windows have non-zero changes?
     // If 4/6 windows have movement → 0.67
     function scoreTrendActivity(trends: TrendData): number { ... }
     ```
   - **Price completeness:** How many conditions have pricing data?
     ```typescript
     // If NM + LP + MP + HP all have prices → 1.0
     // If only NM has prices → 0.25
     function scorePriceCompleteness(prices: PriceData): number { ... }
     ```
   - **Price spread:** Is the low-to-market spread tight (liquid) or wide (illiquid)?
     ```typescript
     // tight spread (low ≈ market) → 1.0, wide spread → 0.0
     function scorePriceSpread(prices: PriceData, condition: string): number { ... }
     ```

2. **Create `src/services/liquidity/tier2-signals.ts`** — Signals from the eBay listing itself.
   - **Concurrent supply:** How many other listings exist for this card in the current scan batch? More supply = more liquid.
     ```typescript
     function scoreSupply(listingsForSameCard: number): number {
       // 0 → 0.0, 1-2 → 0.3, 3-5 → 0.6, 6+ → 1.0
     }
     ```
   - **Quantity sold:** eBay's `quantitySold` field from the listing. More sales from a single listing = active demand.
     ```typescript
     function scoreSold(quantitySold: number): number {
       // 0 → 0.0, 1-2 → 0.4, 3-5 → 0.7, 6+ → 1.0
     }
     ```

3. **Create `src/services/liquidity/tier3-velocity.ts`** — Premium signal from Scrydex `/listings` endpoint (costs 3 credits/call).
   - Call `GET /pokemon/v1/en/cards/{cardId}/listings?days=30&source=ebay`
   - Parse response: count of sold listings in last 7 days and 30 days
   - Calculate median price and average days between sales
   - **Cache in `sales_velocity_cache` table** with 7-day TTL
   - Before calling the API, check the cache first: `SELECT * FROM sales_velocity_cache WHERE card_id = $1 AND variant_name = $2 AND fetched_at > NOW() - INTERVAL '7 days'`
   - Score:
     ```typescript
     function scoreVelocity(sales7d: number): number {
       // 0 → 0.0, 1-2 → 0.3, 3-5 → 0.6, 6-10 → 0.8, 11+ → 1.0
     }
     ```

4. **Create `src/services/liquidity/composite.ts`** — Combine all signals into a single liquidity score.
   ```typescript
   // Weighted arithmetic mean (weights from §6):
   // Tier 1 (free): trend 0.15, completeness 0.10, spread 0.15
   // Tier 2 (from listing): supply 0.15, sold 0.15
   // Tier 3 (premium): velocity 0.30
   //
   // If velocity is not available, redistribute its weight equally among other signals.

   function compositeScore(signals: LiquiditySignals): number { ... }

   function assignGrade(score: number): 'high' | 'medium' | 'low' | 'illiquid' {
     if (score >= 0.70) return 'high';
     if (score >= 0.45) return 'medium';
     if (score >= 0.20) return 'low';
     return 'illiquid';
   }
   ```

5. **Create `src/services/liquidity/tier-adjuster.ts`** — Adjust deal tiers based on liquidity.
   ```typescript
   export function adjustTierForLiquidity(tier: DealTier, grade: LiquidityGrade): DealTier {
     if (grade === 'illiquid') return 'SLEEP';        // Always cap at SLEEP
     if (grade === 'low' && tier === 'GRAIL') return 'HIT';
     if (grade === 'low' && tier === 'HIT') return 'FLIP';
     if (grade === 'medium' && tier === 'GRAIL') return 'HIT';  // GRAIL requires high liquidity
     return tier;  // 'high' liquidity → no adjustment
   }
   ```

6. **Wire into scanner** — Update `scanner-service.ts` to:
   - Calculate Tier 1+2 liquidity signals for every deal (free)
   - For high-profit deals (>40%), auto-fetch Tier 3 velocity (costs 3 Scrydex credits)
   - Apply tier adjustment before saving the deal
   - Store liquidity signals in the deal's JSONB column

7. **Create velocity fetch endpoint** — For on-demand fetching from the frontend:
   - `GET /api/deals/:id/velocity` — Fetches velocity for the deal's card, caches it, returns updated liquidity data
   - This allows the frontend to show a "Fetch velocity → 3cr" button

**How to test — pure function tests + live data:**

**Vitest (pure functions only — `src/__tests__/stage9/`):**

All liquidity scoring functions are pure math — they take numbers in and return numbers out:

- `tier1-signals.test.ts`:
  ```typescript
  // Trend activity: card with movement in 4/6 windows
  expect(scoreTrendActivity({ NM: { '1d': { pct: 1.2 }, '7d': { pct: 4.8 }, '30d': { pct: 0 }, '90d': { pct: 20 }, '180d': { pct: 0 } } })).toBeCloseTo(0.60);

  // Price completeness: all 4 conditions priced
  expect(scorePriceCompleteness({ NM: { market: 52 }, LP: { market: 38 }, MP: { market: 24 }, HP: { market: 12 } })).toBe(1.0);

  // Only NM priced
  expect(scorePriceCompleteness({ NM: { market: 52 } })).toBe(0.25);
  ```

- `tier2-signals.test.ts`:
  ```typescript
  expect(scoreSupply(0)).toBe(0.0);
  expect(scoreSupply(3)).toBeCloseTo(0.6);
  expect(scoreSupply(10)).toBe(1.0);
  expect(scoreSold(0)).toBe(0.0);
  expect(scoreSold(5)).toBeCloseTo(0.7);
  ```

- `composite.test.ts`:
  ```typescript
  // High liquidity card: all signals strong
  const high = compositeScore({ trendActivity: 0.8, priceCompleteness: 1.0, priceSpread: 0.9, supply: 0.8, sold: 0.7, velocity: 0.95 });
  expect(assignGrade(high)).toBe('high');

  // Illiquid card: no movement, no supply
  const illiq = compositeScore({ trendActivity: 0.0, priceCompleteness: 0.25, priceSpread: 0.1, supply: 0.0, sold: 0.0, velocity: null });
  expect(assignGrade(illiq)).toBe('illiquid');
  ```

- `tier-adjuster.test.ts`:
  ```typescript
  expect(adjustTierForLiquidity('GRAIL', 'high')).toBe('GRAIL');     // No change
  expect(adjustTierForLiquidity('GRAIL', 'medium')).toBe('HIT');     // Downgraded
  expect(adjustTierForLiquidity('GRAIL', 'illiquid')).toBe('SLEEP'); // Capped
  expect(adjustTierForLiquidity('HIT', 'low')).toBe('FLIP');         // Downgraded
  expect(adjustTierForLiquidity('FLIP', 'high')).toBe('FLIP');       // No change
  ```

```bash
npm test -- --run src/__tests__/stage9/
```

**Live data test — verify on Railway with real deals:**

```bash
# Check deals now have liquidity data:
psql $DATABASE_URL -c "SELECT card_name, tier, profit_percent, liquidity_grade, liquidity_score FROM deals ORDER BY created_at DESC LIMIT 10;"
# ✅ liquidity_grade should be 'high'/'medium'/'low'/'illiquid'
# ✅ liquidity_score should be between 0 and 1

# Verify tier adjustments applied:
psql $DATABASE_URL -c "SELECT card_name, profit_percent, liquidity_grade, tier FROM deals WHERE liquidity_grade = 'illiquid';"
# ✅ All illiquid deals should have tier = 'SLEEP' regardless of profit

# Check velocity cache:
psql $DATABASE_URL -c "SELECT COUNT(*) FROM sales_velocity_cache;"
# ✅ Should have entries for cards where velocity was fetched

# Test on-demand velocity fetch:
DEAL_ID=$(psql -t $DATABASE_URL -c "SELECT id FROM deals ORDER BY created_at DESC LIMIT 1;" | tr -d ' ')
curl "$RAILWAY_URL/api/deals/$DEAL_ID/velocity"
# ✅ Should return updated liquidity data with velocity signal filled in
```

**Deliverable:** Deals now include real liquidity assessment based on actual market data.

---

### Stage 10: Authentication & API Endpoints

**Install these packages:**
```bash
npm install express-session connect-pg-simple uuid
npm install -D @types/express-session @types/uuid
```

**Step-by-step:**

1. **Create `src/middleware/auth.ts`** — Password authentication and session handling.
   - Use `express-session` with `connect-pg-simple` (stores sessions in PostgreSQL)
   - Session config: `secret: config.SESSION_SECRET`, `cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' }`
   - `POST /auth/login` handler:
     - Receives `{ password: string }` in body
     - Compare against `config.ACCESS_PASSWORD` using **constant-time comparison** (`crypto.timingSafeEqual`)
     - If match: set `req.session.authenticated = true`, return 200
     - If no match: return 401 `{ error: 'Invalid password' }`
   - `POST /auth/logout` handler: `req.session.destroy()`, return 200
   - `requireAuth` middleware: Check `req.session.authenticated === true`. If not, return 401.
   - Mount on `app.use('/auth', authRouter)` (no auth middleware on these routes)

2. **Create `src/routes/deals.ts`** — All deal endpoints (protected with `requireAuth`).
   - **`GET /api/deals`** — Paginated deal list.
     - Query params: `?page=1&limit=50&sort=-createdAt&tier=GRAIL,HIT&status=active`
     - SQL: `SELECT * FROM deals WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
     - Response: `{ data: [...], total: 142, page: 1 }`
   - **`GET /api/deals/:id`** — Full deal detail including match_signals, liquidity breakdown, condition comps, trends.
   - **`POST /api/deals/:id/review`** — Mark deal as correct or incorrect.
     - Body (Zod validated): `{ isCorrectMatch: boolean, reason?: 'wrong_card' | 'wrong_set' | 'wrong_variant' | 'wrong_price' }`
     - Updates deal: `status = 'reviewed'`, stores review data
   - **`GET /api/deals/:id/velocity`** — Trigger velocity fetch (from Stage 9) and return updated liquidity.

3. **Create `src/routes/lookup.ts`** — Manual lookup endpoint (protected).
   - **`POST /api/lookup`** — Takes `{ ebayUrl: string }`, extracts item ID, runs full pipeline.
     - Validate URL format (Zod: must be an eBay URL)
     - Extract item ID from URL (regex: `/itm/(\d+)` or `/itm/.+/(\d+)`)
     - Call `getItem(itemId)` to fetch full listing
     - Run through extraction → matching → pricing pipeline
     - Return full result: matched card, variant, condition, profit breakdown, confidence, debug data

4. **Create `src/routes/status.ts`** — System status endpoint (protected).
   - **`GET /api/status`** — Returns system health metrics:
     ```json
     {
       "scanner": { "status": "running", "lastScan": "2025-01-15T10:30:00Z", "dealsToday": 47, "grailsToday": 3 },
       "sync": { "lastFull": "2025-01-12T03:00:00Z", "lastDelta": "2025-01-15T03:00:00Z", "totalCards": 35892, "totalExpansions": 354 },
       "ebay": { "callsToday": 1847, "dailyLimit": 5000, "status": "healthy" },
       "scrydex": { "creditsUsed": 2340, "creditsRemaining": 47660, "status": "healthy" },
       "exchangeRate": { "rate": 0.789, "fetchedAt": "2025-01-15T09:00:00Z", "isStale": false },
       "accuracy": { "rolling7d": 91.2, "totalReviewed": 156, "totalCorrect": 142 }
     }
     ```

5. **Create `src/routes/preferences.ts`** — User preferences (protected).
   - **`GET /api/preferences`** — Returns preferences JSONB from the singleton `preferences` table.
   - **`PUT /api/preferences`** — Partial update: merge incoming JSON with existing preferences. Zod schema validates the structure.

6. **Create `src/routes/sse.ts`** — Server-Sent Events for live deal stream (protected).
   - **`GET /api/deals/stream`** — SSE endpoint.
   - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
   - On connect: Check `Last-Event-Id` header. If present, replay all deals with `event_id > lastEventId`.
   - **Deal events:** When a new deal is created (from scanner), emit `event: deal\nid: {event_id}\ndata: {deal JSON}\n\n`
   - **Status events:** Every 30 seconds, emit `event: status\ndata: {status JSON}\n\n`
   - **Ping:** Every 15 seconds, emit `:ping\n\n` (keepalive comment)
   - **Important:** Use an in-memory event emitter. When the scanner creates a deal, it emits an event. All SSE connections listen for that event and send it to clients.

7. **Create `src/middleware/validation.ts`** — Zod validation middleware.
   ```typescript
   export function validate(schema: ZodSchema) {
     return (req, res, next) => {
       const result = schema.safeParse(req.body);
       if (!result.success) {
         return res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
       }
       req.body = result.data;
       next();
     };
   }
   ```

8. **Mount all routes** in `src/app.ts`:
   ```typescript
   app.use('/auth', authRouter);                      // No auth
   app.use('/api/catalog', catalogRouter);             // No auth (from Stage 3)
   app.use('/api/deals', requireAuth, dealsRouter);    // Auth required
   app.use('/api/lookup', requireAuth, lookupRouter);  // Auth required
   app.use('/api/status', requireAuth, statusRouter);  // Auth required
   app.use('/api/preferences', requireAuth, prefsRouter); // Auth required
   ```

**How to test — all against live Railway with real data:**

No automated tests for this stage — auth, API endpoints, and SSE are all integration points that need a running server with real data. Test everything live.

```bash
# Test login
curl -c cookies.txt -X POST "$RAILWAY_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"your-access-password"}'
# ✅ Should return 200

# Test protected endpoint with cookie
curl -b cookies.txt "$RAILWAY_URL/api/deals?limit=5" | jq '.data | length'
# ✅ Should return deal data

# Test protected endpoint WITHOUT cookie
curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/deals"
# ✅ Should return 401

# Test deal detail
DEAL_ID=$(curl -s -b cookies.txt "$RAILWAY_URL/api/deals?limit=1" | jq -r '.data[0].id')
curl -b cookies.txt "$RAILWAY_URL/api/deals/$DEAL_ID" | jq '.cardName, .profitGBP, .tier'
# ✅ Should show full deal data

# Test deal review
curl -b cookies.txt -X POST "$RAILWAY_URL/api/deals/$DEAL_ID/review" \
  -H "Content-Type: application/json" \
  -d '{"isCorrectMatch":true}'
# ✅ Should return 200

# Test manual lookup (use a real eBay listing URL)
curl -b cookies.txt -X POST "$RAILWAY_URL/api/lookup" \
  -H "Content-Type: application/json" \
  -d '{"ebayUrl":"https://www.ebay.co.uk/itm/123456789"}'
# ✅ Should return matched card, profit breakdown, confidence

# Test system status
curl -b cookies.txt "$RAILWAY_URL/api/status" | jq '.'
# ✅ Should show scanner, sync, eBay, Scrydex, exchange rate metrics

# Test SSE stream (leave running for 30s to see events)
curl -b cookies.txt -N "$RAILWAY_URL/api/deals/stream"
# ✅ Should see ping comments every 15s
# ✅ Should see status events every 30s
# ✅ Should see deal events when scanner finds something

# Test Zod validation
curl -b cookies.txt -X POST "$RAILWAY_URL/api/lookup" \
  -H "Content-Type: application/json" \
  -d '{"notAUrl": 123}'
# ✅ Should return 400 with validation error
```

**Deliverable:** Complete backend API — the scanner finds deals, the API serves them.

---

### Stage 11: Deal Lifecycle & Background Jobs

**Install these packages:**
```bash
npm install node-cron
npm install -D @types/node-cron
```

**Step-by-step:**

1. **Create `src/services/lifecycle/deal-expiry.ts`** — Expire old deals.
   ```typescript
   export async function expireOldDeals(): Promise<number> {
     // Set status = 'expired' for active deals past their expires_at
     const result = await pool.query(
       `UPDATE deals SET status = 'expired' WHERE status = 'active' AND expires_at < NOW() RETURNING id`
     );
     return result.rowCount;
   }
   ```

2. **Create `src/services/lifecycle/deal-pruner.ts`** — Hard-delete unreviewed stale deals.
   ```typescript
   export async function pruneStaleDeals(): Promise<number> {
     // Delete deals that are >30 days old AND were never reviewed
     const result = await pool.query(
       `DELETE FROM deals WHERE status IN ('active', 'expired') AND created_at < NOW() - INTERVAL '30 days' RETURNING id`
     );
     return result.rowCount;
   }
   ```
   - **Do NOT delete reviewed deals** — those are used for accuracy tracking.

3. **Create `src/services/lifecycle/deal-status.ts`** — Track deal status transitions.
   - Status flow: `active` → `expired` (TTL), `active` → `reviewed` (user action), `active` → `sold` (if detected)
   - Export: `updateDealStatus(dealId: string, status: DealStatus): Promise<void>`

4. **Create `src/services/jobs/scheduler.ts`** — Central job scheduler using `node-cron`.
   ```typescript
   import cron from 'node-cron';

   const jobs: Map<string, { task: cron.ScheduledTask; isRunning: boolean }> = new Map();

   export function registerJob(name: string, schedule: string, fn: () => Promise<void>): void {
     const task = cron.schedule(schedule, async () => {
       const job = jobs.get(name)!;
       if (job.isRunning) {
         log.warn({ job: name }, 'Job still running, skipping');
         return;
       }
       job.isRunning = true;
       try {
         await fn();
         log.info({ job: name }, 'Job completed');
       } catch (err) {
         log.error({ job: name, err }, 'Job failed');
       } finally {
         job.isRunning = false;
       }
     });
     jobs.set(name, { task, isRunning: false });
   }
   ```

5. **Create `src/services/jobs/register-all.ts`** — Register all background jobs at boot.
   ```typescript
   export function registerAllJobs(): void {
     // Scanner — every 5 minutes (already running from Stage 8, move here)
     registerJob('ebay-scan', '*/5 * * * *', runScanCycle);

     // Deal cleanup — every hour
     registerJob('deal-expiry', '0 * * * *', async () => {
       const expired = await expireOldDeals();
       const pruned = await pruneStaleDeals();
       log.info({ expired, pruned }, 'Deal cleanup complete');
     });

     // Exchange rate refresh — every hour
     registerJob('exchange-rate', '30 * * * *', async () => {
       await fetchAndSaveRate();
     });

     // Hot refresh — daily at 03:00 (re-sync 10 most recent expansions)
     registerJob('hot-refresh', '0 3 * * *', async () => {
       const recent = await getRecentExpansions(10);
       for (const exp of recent) {
         await syncExpansionCards(exp.id);
       }
     });

     // Expansion check — daily at 04:00 (detect new sets)
     registerJob('expansion-check', '0 4 * * *', async () => {
       const newExps = await checkForNewExpansions();
       for (const exp of newExps) {
         await syncExpansionCards(exp.id);
       }
     });

     // Full sync — weekly Sunday at 03:00
     registerJob('full-sync', '0 3 * * 0', syncAll);

     // Listings pre-fetch — weekly Sunday at 05:00 (top 200 matched cards velocity)
     registerJob('velocity-prefetch', '0 5 * * 0', async () => {
       const topCards = await getTopMatchedCards(200);
       for (const card of topCards) {
         await fetchAndCacheVelocity(card.id, card.variantName);
       }
     });
   }
   ```

6. **Create helper functions:**
   - `getRecentExpansions(n)` — `SELECT * FROM expansions ORDER BY release_date DESC LIMIT $1`
   - `checkForNewExpansions()` — Fetch expansions from Scrydex, compare against DB, return new ones
   - `getTopMatchedCards(n)` — `SELECT card_id, COUNT(*) FROM deals GROUP BY card_id ORDER BY COUNT(*) DESC LIMIT $1`

7. **Wire into boot sequence** — Replace the `startScanLoop()` from Stage 8 with `registerAllJobs()`. The scanner is now managed by the job scheduler alongside all other background tasks.

**How to test — all against live Railway:**

No automated tests for this stage — deal lifecycle and background jobs run against the real database with real timing. Test everything live on Railway.

```bash
# Check deal expiry — look for expired deals
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM deals GROUP BY status;"
# ✅ Should show 'active' and possibly 'expired' deals

# Manually test expiry by checking an old deal:
psql $DATABASE_URL -c "SELECT id, status, created_at, expires_at FROM deals WHERE expires_at < NOW() LIMIT 5;"
# ✅ These should have status = 'expired'

# Check exchange rate is being refreshed:
psql $DATABASE_URL -c "SELECT fetched_at FROM exchange_rates ORDER BY fetched_at DESC LIMIT 5;"
# ✅ Should show multiple entries, latest within the last hour

# Check sync log for hot refresh runs:
psql $DATABASE_URL -c "SELECT sync_type, started_at, status FROM sync_log WHERE sync_type = 'hot_refresh' ORDER BY started_at DESC LIMIT 3;"
# ✅ Should show completed hot refresh entries

# Check job overlap protection in logs:
# Look for: "Job still running, skipping" messages (shouldn't appear often, but proves the guard works)

# Verify jobs survive restart:
# Redeploy on Railway, then check after 10 minutes:
psql $DATABASE_URL -c "SELECT COUNT(*) FROM deals WHERE created_at > NOW() - INTERVAL '10 minutes';"
# ✅ Should have new deals (scanner re-registered after restart)
```

**Deliverable:** Self-maintaining system — deals expire, prices stay fresh, new sets appear automatically.

---

### Stage 12: Frontend — Dashboard

**Install these packages (in `client/`):**
```bash
cd client
npm install @fontsource/plus-jakarta-sans @fontsource/dm-mono
# Plus Jakarta Sans and DM Mono are the two fonts from the design system
```

**Step-by-step:**

The frontend spec (FRONTEND_DESIGN_SPEC_FINAL.md) is the detailed reference for this stage. This build guide covers the implementation order and how things connect.

1. **Set up the design system** — Create `client/src/styles/`:
   - `variables.css` — All CSS custom properties from §12 of the frontend spec (`--bg0`, `--bg1`, `--glass`, `--tMax`, `--greenB`, `--red`, etc.)
   - `global.css` — Base styles: body background `--bg0`, default font Plus Jakarta Sans, box-sizing, scrollbar styling
   - `glass.css` — Glass morphism utility classes: `.glass` (backdrop-filter + rgba), `.glass-hover`, `.grad-border` (gradient border trick)
   - Import both fonts in `main.tsx`

2. **Create the Login page** — `client/src/pages/Login.tsx`
   - Centered card on radial gradient background (see §10 of frontend spec)
   - Password input → `POST /auth/login` on submit
   - On success: redirect to `/` (dashboard)
   - On failure: shake animation + "Invalid password" error
   - Store auth state in React context (or just check cookie existence)

3. **Create the auth context** — `client/src/context/AuthContext.tsx`
   - On app load: `GET /api/status`. If 200 → authenticated. If 401 → show login.
   - Export: `useAuth()` hook → `{ isAuthenticated, login, logout }`
   - Wrap all routes in `AuthProvider`
   - Dashboard routes require auth, catalog routes don't

4. **Create the deal feed** — `client/src/pages/Dashboard.tsx` + `client/src/components/DealFeed.tsx`
   - On mount: `GET /api/deals?limit=50&sort=-createdAt` to load initial deals
   - Store deals in state array
   - Open SSE connection: `new EventSource('/api/deals/stream')`
   - On `event: deal` → prepend new deal to state array (appears at top)
   - Each deal renders as a `DealCard` component (see §2 of frontend spec)
   - `DealCard` shows: thumbnail, card name, eBay price → market price, profit, confidence bar, liquidity pill, condition pill, graded badge, time listed, trend arrow
   - Tier determines visual treatment (GRAIL = gradient glow, SLEEP = 35% opacity)
   - "FRESH HEAT ↑" pill appears if user has scrolled down and new deals arrive

5. **Create the deal detail panel** — `client/src/components/DealDetailPanel.tsx`
   - Right-side panel (440px fixed width on desktop, bottom sheet on mobile)
   - On deal click: `GET /api/deals/:id` to fetch full detail
   - Panel sections (each as a sub-component):
     - **Header:** Tier badge, card name, images (Scrydex + eBay side by side)
     - **Profit Hero:** Large profit number (42px), percentage, tier tagline
     - **CTA:** "SNAG ON EBAY →" button → `window.open(deal.ebayUrl, '_blank')`
     - **No BS Pricing:** Simple breakdown (eBay + shipping + fees = total cost, market USD → GBP, profit)
     - **Match Confidence:** Composite score + per-field bars
     - **Liquidity:** Per-signal bars + "Fetch velocity → 3cr" button
     - **Comps by Condition:** Table of NM/LP/MP/HP prices from Scrydex
     - **Price Trends:** 1d/7d/30d/90d trend arrows with real data
     - **Card Data:** Rarity, types, artist, "View in Catalog →" link
     - **Footer:** "Correct" / "Wrong" review buttons
   - See §3 of frontend spec for full layout details

6. **Create the filter bar** — `client/src/components/FilterBar.tsx`
   - Horizontal bar below header (see §4 of frontend spec)
   - Filter groups: Tier, Condition, Liquidity, Confidence, Time, Min Profit, Graded
   - Each group is a `FilterGroup` component (glass capsule with toggle chips)
   - **Filtering is 100% client-side** — filter the in-memory deals array, no API calls
   - Apply filters: `deals.filter(d => selectedTiers.includes(d.tier) && selectedConditions.includes(d.condition) && ...)`
   - "SAVE" button calls `PUT /api/preferences` to persist default filters

7. **Create the system status footer** — `client/src/components/StatusFooter.tsx`
   - 42px bar at bottom (see §5 of frontend spec)
   - Left zone: scanner status, time since last scan, deals today, accuracy
   - Right zone: eBay budget, Scrydex credits, card index count
   - Data from SSE `event: status` messages (updates every 30s)
   - Status dots: green/amber/red

8. **Create the manual lookup tool** — `client/src/components/LookupModal.tsx`
   - Triggered by header button
   - Centered overlay: paste eBay URL → `POST /api/lookup` → show result
   - Loading states: "Fetching..." → "Extracting..." → "Matching..." (amber text)
   - Result: card info, condition, liquidity, profit hero, "Open on eBay" button
   - Expandable debug section: raw eBay data, candidates, signals

9. **Create the settings modal** — `client/src/components/SettingsModal.tsx`
   - Triggered by gear icon in header
   - Two tabs: General (tier thresholds, display, sound) and Notifications (Telegram config)
   - Changes debounced (500ms), sent as `PUT /api/preferences`
   - Telegram: "Test Message" button calls `POST /api/notifications/telegram/test`

10. **Create notifications** — `client/src/components/`:
    - `Toast.tsx` — Top-right notification for GRAIL deals, auto-dismiss 5s
    - `SSEBanner.tsx` — Connection status banner (reconnecting/lost)
    - `SystemBanner.tsx` — Persistent amber/red banners for warnings/errors

11. **Handle responsive layout:**
    - ≤920px: Detail panel becomes bottom sheet (75vh, rounded top corners)
    - ≤640px: Card images hide, filter groups collapse, footer hides API section
    - Use CSS media queries or a responsive hook

12. **Update routing** in `client/src/App.tsx`:
    ```
    /               → Dashboard (requires auth)
    /catalog/*      → Catalog pages (no auth, from Stage 3)
    ```

**How to test — manual browser testing against live Railway:**

No automated frontend tests — the dashboard is tested by using it with real data. Deploy to Railway and test in a real browser.

Open `https://your-app.railway.app/` in a browser and test:

- [ ] **Login:** Enter password → dashboard loads. Wrong password → error message.
- [ ] **Deal feed:** Deals appear in the list. GRAIL deals have gradient glow. SLEEP deals are dimmed.
- [ ] **Live updates:** Leave the page open. After a scan cycle (5 min), new deals slide in at the top without refreshing.
- [ ] **Deal detail:** Click a deal → right panel opens with full breakdown. Check:
  - Profit number matches eBay price + fees vs market value
  - Condition comps show NM/LP/MP/HP with real prices (not all the same)
  - Trends show real data (arrows, percentages)
  - Liquidity shows per-signal bars
  - "SNAG ON EBAY" opens the correct eBay listing in a new tab
- [ ] **Fetch velocity:** In the liquidity section, click "Fetch → 3cr". Bar should fill in after a moment.
- [ ] **Filters:** Toggle tier filters → deals filter instantly. Toggle conditions → deals filter. Try all filter groups.
- [ ] **Save filters:** Change some filters, click SAVE. Refresh the page. Filters should persist.
- [ ] **Manual lookup:** Click the lookup button. Paste a real eBay listing URL. Verify it returns a result with card match, profit, confidence.
- [ ] **Deal review:** In the detail panel footer, click "Correct" or "Wrong". Verify it saves.
- [ ] **Status footer:** Bottom bar shows scanner status, deal counts, API budgets. Should update every 30s.
- [ ] **Responsive:** Open Chrome DevTools, toggle device toolbar:
  - 920px width: detail panel becomes bottom sheet
  - 640px width: card images hide, some filters collapse
- [ ] **SSE reconnection:** Disconnect WiFi briefly → "Reconnecting..." banner. Reconnect → banner disappears, missed deals appear.
- [ ] **Graded badge:** If any deals are graded cards, verify the blue PSA/CGC badge shows.

**Deliverable:** Working arbitrage dashboard — scan, evaluate, buy.

---

### Stage 13: Observability, Testing & Production Hardening

**Install these packages:**
```bash
npm install pino-pretty   # Already installed from Stage 1, but ensure it's there
```

**Step-by-step:**

1. **Enhance Pino logging with correlation IDs** — `src/services/logger/correlation.ts`
   - Generate a unique `correlationId` (UUID) when an eBay listing enters the pipeline
   - Pass it through every function: extraction → matching → pricing → deal creation
   - Every log line includes `correlationId` so you can trace a single listing from search result to deal
   ```typescript
   // Before (generic):
   log.info('Deal created');

   // After (traceable):
   log.info({ correlationId: 'abc-123', service: 'scanner', dealId: 'uuid', profitGBP: 32.50, tier: 'GRAIL' }, 'Deal created');
   ```
   - Update all log calls across the codebase to include: `service` (scanner/sync/catalog/auth), `correlationId` (when applicable), `context` (relevant data)

2. **Create Telegram alert service** — `src/services/notifications/telegram.ts`
   - Uses Telegram Bot API: `POST https://api.telegram.org/bot<TOKEN>/sendMessage`
   - Body: `{ chat_id: config.TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }`
   - Alert functions:
     ```typescript
     export async function sendAlert(severity: 'critical' | 'warning', title: string, details: string): Promise<void> {
       if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) return;  // Skip if not configured
       const emoji = severity === 'critical' ? '🚨' : '⚠️';
       const text = `${emoji} <b>${title}</b>\n${details}`;
       await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' })
       });
     }
     ```

3. **Wire alerts into existing services** — Add alert triggers at the right places:
   ```typescript
   // In sync service — after sync failure:
   catch (err) { await sendAlert('critical', 'Sync Failed', `${err.message}`); }

   // In Scrydex client — when credits drop below threshold:
   if (creditsRemaining < 5000) await sendAlert('warning', 'Scrydex Credits Low', `${creditsRemaining} remaining`);
   if (creditsRemaining < 2000) await sendAlert('critical', 'Scrydex Credits Critical', `${creditsRemaining} remaining`);

   // In eBay client — on 3+ consecutive 429s:
   if (consecutive429s >= 3) await sendAlert('warning', 'eBay Rate Limited', `${consecutive429s} consecutive 429 responses`);

   // In exchange rate service — stale rate:
   if (isStale()) await sendAlert('warning', 'Exchange Rate Stale', `Last fetch: ${lastFetchedAt}`);

   // In accuracy tracker — rolling average drops:
   if (rolling7dAccuracy < 80) await sendAlert('critical', 'Accuracy Drop', `7-day rolling: ${rolling7dAccuracy}%`);

   // In sync service — no sync in 48h:
   if (hoursSinceLastSync > 48) await sendAlert('critical', 'Card Index Stale', `Last sync: ${lastSyncAt}`);
   ```

4. **Create GRAIL/HIT deal notifications** — `src/services/notifications/deal-alerts.ts`
   - When a GRAIL or HIT deal is created, send a Telegram message:
     ```
     GRAIL DEAL
     Charizard ex 006/197 — Obsidian Flames
     eBay: £12.50 → Market: £44.97
     Profit: +£29.50 (+190%)
     Condition: NM · Confidence: 0.92
     Link: ebay.co.uk/itm/123456789
     ```
   - Configurable: user can set which tiers trigger notifications (via preferences)

5. **Create accuracy tracking** — `src/services/accuracy/tracker.ts`
   - **Manual accuracy:** Track user reviews (correct/incorrect from deal review endpoint)
   ```typescript
   export async function getAccuracyStats(): Promise<AccuracyStats> {
     const result = await pool.query(`
       SELECT
         COUNT(*) FILTER (WHERE status = 'reviewed') as total_reviewed,
         COUNT(*) FILTER (WHERE status = 'reviewed' AND review_correct = true) as total_correct
       FROM deals
       WHERE created_at > NOW() - INTERVAL '7 days'
     `);
     const { total_reviewed, total_correct } = result.rows[0];
     return {
       rolling7d: total_reviewed > 0 ? (total_correct / total_reviewed) * 100 : null,
       totalReviewed: total_reviewed,
       totalCorrect: total_correct
     };
   }
   ```
   - Wire into `/api/status` response

6. **Create match accuracy script** — `src/scripts/test-accuracy.ts`
   - A script that tests matching accuracy against **real eBay listings + real synced database**:
     ```typescript
     // Fetch 50 real eBay listings via searchItems()
     // Run each through extractSignals() + matchListing()
     // For each match, print: eBay title → matched card + variant + confidence
     // Manually review and count correct/incorrect matches
     // Print accuracy: "Accuracy: 42/50 (84%)"
     ```
   - Run periodically to track matching quality as the algorithm improves
   - Keep this script in the project: `src/scripts/test-accuracy.ts`

7. **Create GitHub Actions CI pipeline** — `.github/workflows/ci.yml`
   ```yaml
   name: CI
   on: [push, pull_request]

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - run: npm ci
         - run: npm run build
         - run: npx tsc --noEmit
         - run: npm test
         # Pure function tests only — no DB, no API keys needed
   ```

9. **Create Dockerfile** — Multi-stage build for Railway:
   ```dockerfile
   # Stage 1: Build
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build
   RUN cd client && npm ci && npm run build

   # Stage 2: Production
   FROM node:20-alpine
   WORKDIR /app
   COPY --from=builder /app/dist ./dist
   COPY --from=builder /app/client/dist ./client/dist
   COPY --from=builder /app/node_modules ./node_modules
   COPY --from=builder /app/package.json ./
   COPY --from=builder /app/migrations ./migrations
   EXPOSE 3000
   CMD ["node", "dist/server.js"]
   ```

10. **Create Railway config** — `railway.toml`:
    ```toml
    [build]
    builder = "dockerfile"

    [deploy]
    healthcheckPath = "/healthz"
    healthcheckTimeout = 30
    restartPolicyType = "on_failure"
    restartPolicyMaxRetries = 3
    ```

11. **Add npm scripts** for all the new commands:
    ```json
    {
      "scripts": {
        "dev": "tsx watch src/server.ts",
        "build": "tsc",
        "start": "node dist/server.js",
        "test": "vitest run",
        "test:watch": "vitest",
        "sync": "tsx src/scripts/run-sync.ts",
        "migrate": "tsx src/db/migrate.ts"
      }
    }
    ```

**How to test — all live:**

```bash
# Type check and pure function tests
npx tsc --noEmit
npm test
```

**Live tests on Railway:**

```bash
# 1. Verify structured logs in Railway log viewer
# Go to Railway dashboard → your service → Logs
# ✅ Logs should be JSON format with service, correlationId, message
# ✅ Search for a correlationId to see the full pipeline trace for one listing

# 2. Test Telegram alerts
curl -b cookies.txt -X POST "$RAILWAY_URL/api/notifications/telegram/test"
# ✅ Should receive a test message in your Telegram chat

# 3. Verify accuracy tracking in status
curl -b cookies.txt "$RAILWAY_URL/api/status" | jq '.accuracy'
# ✅ Should show rolling7d, totalReviewed, totalCorrect

# 4. Verify Docker build works
docker build -t pokesnipe .
# ✅ Should complete without errors

# 5. Run CI pipeline locally (to verify before pushing)
npm test
npx tsc --noEmit
npm run test:accuracy
# ✅ All should pass

# 6. Full 24-hour soak test on Railway:
# Leave the system running for 24 hours, then check:

psql $DATABASE_URL -c "SELECT COUNT(*) FROM deals WHERE created_at > NOW() - INTERVAL '24 hours';"
# ✅ Deals accumulating

psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM deals GROUP BY status;"
# ✅ Mix of active, expired, reviewed

psql $DATABASE_URL -c "SELECT fetched_at FROM exchange_rates ORDER BY fetched_at DESC LIMIT 5;"
# ✅ Hourly entries

psql $DATABASE_URL -c "SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 5;"
# ✅ Hot refresh entries, no failures

# Check eBay budget stayed within limits:
curl -b cookies.txt "$RAILWAY_URL/api/status" | jq '.ebay'
# ✅ callsToday < 5000
```

**Deliverable:** Production-ready system with monitoring, testing, and deployment pipeline.
