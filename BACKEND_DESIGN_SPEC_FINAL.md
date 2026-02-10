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

### 13.1 Four-Layer Test Pyramid

| Layer | Scope | Runner | External Calls |
|-------|-------|--------|----------------|
| **Unit** | Domain functions (pure, no I/O) | Vitest | None |
| **Integration** | Services + PostgreSQL | Vitest + test DB | None (fixtures) |
| **API** | HTTP endpoints (supertest) | Vitest + test DB | None (fixtures) |
| **Accuracy** | Match corpus regression | Vitest + test DB | None (fixtures) |

### 13.2 External API Testing

All external APIs (Scrydex, eBay, Telegram) tested via recorded `nock`/`msw` fixtures. Zero live API calls in CI.

### 13.3 Accuracy Gate

```yaml
# GitHub Actions: PR cannot merge if accuracy < 85%
- name: Accuracy gate
  run: |
    ACCURACY=$(npm run test:accuracy:report --silent | tail -1)
    if (( $(echo "$ACCURACY < 85" | bc -l) )); then
      echo "Accuracy $ACCURACY% is below 85% threshold"
      exit 1
    fi
```

### 13.4 Match Corpus

200+ entries covering modern sets (30%), legacy (20%), vintage (20%), graded (15%), edge cases (15%). Each entry has `ebayTitle`, `itemSpecifics`, `expectedCardId`, `expectedVariant`, `difficulty`, `tags`.

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
