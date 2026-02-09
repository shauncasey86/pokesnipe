# PokeSnipe Arbitrage Scanner: Critical Evaluation & Redesign

## Table of Contents

- [Part 1: Critical Evaluation of pokesnipe-beta](#part-1-critical-evaluation)
  - [1.1 Data Ingestion & Normalization](#11-data-ingestion--normalization)
  - [1.2 Matching Logic & Heuristics](#12-matching-logic--heuristics)
  - [1.3 Error Handling & Edge Cases](#13-error-handling--edge-cases)
  - [1.4 Architectural & Scalability Limitations](#14-architectural--scalability-limitations)
  - [1.5 Flawed Assumptions](#15-flawed-assumptions)
- [Part 2: Ground-Up Redesign](#part-2-ground-up-redesign)
  - [2.1 High-Level Architecture](#21-high-level-architecture)
  - [2.2 API Budget & Rate Limit Constraints](#22-api-budget--rate-limit-constraints)
  - [2.3 Data Collection Layer](#23-data-collection-layer)
  - [2.4 Normalization Pipeline](#24-normalization-pipeline)
  - [2.5 Matching Engine](#25-matching-engine)
  - [2.6 Confidence Scoring & Validation](#26-confidence-scoring--validation)
  - [2.7 Accuracy Measurement & Enforcement](#27-accuracy-measurement--enforcement)
  - [2.8 Implementation Roadmap](#28-implementation-roadmap)

---

## Part 1: Critical Evaluation

### 1.1 Data Ingestion & Normalization

#### Problem: Title Parsing is a Regex Minefield

The title parser (`src/services/parser/title-parser.ts`) is the single most critical component — and its weakest point. It uses **50+ regex patterns** executed sequentially against free-text eBay titles. This approach has fundamental limits:

**Specific failures:**

- **Pattern ordering fragility** (lines 16-46): The comment "order matters (most specific first)" reveals the core problem. Card number extraction uses 17+ regex patterns tried in priority order. A title like `"PSA 10 Charizard SV65/SV94 Hidden Fates"` must match `CARD_NUMBER_SHINY_VAULT` before `CARD_NUMBER_STANDARD`. If a new format appears (e.g., a future set uses `MV` prefix), the entire priority chain needs manual updates.

- **Pokemon name matching via hardcoded list** (line 144): `POKEMON_NAMES` is a single massive regex alternation of ~300+ names. This is inherently incomplete — new Pokemon, regional forms, and alternate spellings not in the list will silently fail. The list also creates false positives: the word "Rosa" is listed as a Pokemon name and would match seller names or unrelated text.

- **Set name extraction across 9 era-specific regexes** (lines 159-179): Each Pokemon TCG era has its own regex (`WOTC`, `EX_ERA`, `DP_ERA`, etc.). Adding a new set requires editing the correct era regex and updating the `EN_SET_CODE_MAP`. This is a maintenance disaster that will drift out of sync with Scrydex's actual expansion catalog over time.

- **Name corrections are manually curated** (lines 308-386): `NAME_CORRECTIONS` maps ~80 misspellings to correct names. This was clearly built reactively from observed failures. There's no systematic approach — each new misspelling requires a code change.

- **Normalization is shallow** (lines 499-515): `normalizeTitle()` only handles smart quotes, HTML entities, and known misspellings. It doesn't handle:
  - Unicode normalization (accented characters beyond Pokémon)
  - Seller-added noise like "🔥🔥🔥 LOOK 🔥🔥🔥"
  - Parenthetical descriptions like "(read description)"
  - Double/triple spaces after emoji removal

#### Problem: eBay Data is Underutilized

The eBay Browse API returns structured `itemSpecifics` / `localizedAspects` data that often includes the card name, set name, and card number as seller-provided fields. The beta uses `conditionDescriptors` from eBay's API but mostly ignores the richer item specifics that could provide pre-parsed card attributes. The system relies almost entirely on title parsing when structured data may already be available.

#### Problem: No Expansion Catalog Sync

The expansion database is hardcoded in `src/services/expansion/index.ts` with 500+ entries loaded at constructor time from a static snapshot. When Scrydex adds a new expansion, the system requires:
1. A code change to the hardcoded list
2. ID remapping validation against Scrydex's live API
3. Redeployment

The `fetchExpansionLogos()` method (line 66) does validate against Scrydex live data but only for logo/symbol enrichment — it doesn't add missing expansions.

---

### 1.2 Matching Logic & Heuristics

#### Problem: The Fallback Cascade Creates False Matches

The Scrydex query logic in `arbitrage-engine.ts` (lines 762-1162) implements **6 fallback strategies** when the primary query fails:

```
Primary Query → Fallback 2 (zero-padded) → Fallback 3 (wildcard) →
Fallback 3.5 (standard wildcard) → Fallback 3.5b (SIR direct) →
Fallback 4 (name search) → Fallback 5 (OR multi-expansion)
```

**Fallback 1 is disabled** (line 821-831) because it was causing wrong matches — stripping the `SV` prefix from `SV65` and matching card #65 in the main set instead. This is a red flag: the system's own developers discovered a fallback was producing incorrect results and disabled it, but the same class of problem exists in other fallbacks.

**Fallback 5** (lines 1074-1152) searches across the 8 most recent expansions with a name similarity threshold of just **0.25** (25%). This means `"Pikachu"` would match `"Pikachu V"`, `"Pikachu VMAX"`, `"Pikachu ex"`, or even `"Detective Pikachu"` — all completely different cards with vastly different prices.

**The denominator-inference fallback** (lines 506-583) tries to guess the expansion from the card number denominator (e.g., `/162` → find sets with ~162 cards). Multiple sets share similar card counts, and the ±5 tolerance (expansion service line 363) makes this even broader. Combined with the 0.25 name similarity threshold, this is a high-risk path for wrong matches.

#### Problem: Name Similarity is Too Permissive

`calculateNameSimilarity()` is used as a validation gate with a threshold of **0.3** (30%) for the primary match (line 1233) and **0.25** for fallback matches. At 0.3 similarity:
- `"Eevee"` vs `"Eevee V"` = passes (shared substring)
- `"Charizard"` vs `"Charizard ex"` = passes
- These are **different cards** with prices that can differ by 10-100x

The comment on line 1232 says "Relaxed from 0.4 to 0.3 to allow more partial matches" — the threshold was lowered to increase match volume, trading accuracy for coverage. This is the wrong tradeoff for an arbitrage scanner where a false match means buying the wrong card.

#### Problem: Variant Matching is Incomplete

The variant detection in `findVariantPrices()` (lines 1709-1798) builds a target variant string from parsed attributes:
- `isHolo` + `is1stEd` → `"firstEditionHolofoil"`

But the mapping between eBay title variants and Scrydex variant names is implicit and fragile. If Scrydex names a variant `"1stEditionHolofoil"` instead of `"firstEditionHolofoil"`, the exact match on line 1754 fails. The fallback (lines 1762-1773) tries broader matching but only for 1st Edition specifically.

Cards that are **not explicitly marked** as holo/reverse/etc. in the title default to no variant targeting, which means they may match the wrong variant's prices. A Base Set Charizard that doesn't say "holo" in the title will still be a holo card — but the system won't know that.

#### Problem: No Confidence Scoring at the Match Level

The `matchConfidence` stored in the deal (line 1547) is actually the **title parse confidence**, not the **match confidence**. There's no composite score that reflects:
- How the expansion was matched (exact vs fuzzy vs denominator inference)
- How the card number was resolved (direct vs wildcard vs padded)
- How similar the name was
- Whether the printed total validated

A deal found via exact expansion match + exact number + 95% name similarity should score far higher than one found via denominator-OR-query + wildcard + 30% name similarity. The system treats them identically.

---

### 1.3 Error Handling & Edge Cases

#### Problem: Silent Failures in Async Paths

- **Deal store has sync/async inconsistency** (`deal-store.ts`): Both `add()` and `addAsync()` methods exist. The sync `add()` returns immediately but the write may not complete. The engine correctly uses `addAsync()` (line 1583), but the interface's existence invites misuse.

- **Preferences loading swallows errors** (line 300-303): If the database query fails, preferences silently retain their previous values. No metric is emitted, no user-visible indication exists.

- **Exchange rate fallback is dangerous** (`currency/exchange-rate.ts`): The hardcoded fallback of 1.27 GBP/USD could be significantly wrong. A 5% exchange rate error on a £500 card is £25 — enough to turn a profitable deal into a loss.

#### Problem: Race Conditions in Cache Management

- **processedListings** is marked as processed *before* the pipeline completes (line 370-371). If the pipeline errors mid-way, the listing is permanently skipped for 24 hours even though it was never actually evaluated.

- **Cache pruning** runs on a 30-minute interval (line 184-186) using `setInterval`. During high-throughput scans, the sorted-eviction logic (`pruneExpiredProcessedListings`, lines 306-334) iterates and sorts the entire `processedListingsTimestamps` map — an O(n log n) operation on up to 10,000 entries that blocks the event loop.

#### Problem: No Handling for Scrydex API Changes

The system hardcodes assumptions about Scrydex's response format:
- `card.variants[].name` must match specific strings like `"holofoil"`, `"reverseHolofoil"`, `"firstEditionHolofoil"`
- `card.variants[].prices[].type` must be `"raw"` or `"graded"`
- `card.expansion.printed_total` must exist for validation

If Scrydex renames variants, adds new price types, or restructures responses, the system silently produces wrong results rather than failing explicitly.

---

### 1.4 Architectural & Scalability Limitations

#### Problem: God Object Anti-Pattern

`ArbitrageEngine` (arbitrage-engine.ts, ~1800 lines) is responsible for:
- Listing deduplication
- Title parsing orchestration
- Expansion matching
- Scrydex querying (6 fallback strategies)
- Name validation
- Printed total validation
- Condition determination
- Variant matching
- Price extraction
- Currency conversion
- Profit calculation
- Tier classification
- User preference filtering
- Deal creation and storage
- Diagnostics tracking
- Cache management

This violates single-responsibility principle. Any change to matching logic risks breaking pricing logic. Testing individual behaviors requires mocking the entire engine's state.

#### Problem: Monolithic Scanner Loop

`scanner-loop.ts` (1562 lines) manages query rotation, budget tracking, interval calculation, dynamic query generation, and scan orchestration in a single class. The scan interval is recalculated after every scan based on remaining budget — but the budget tracking assumes exactly 4 credits per scan (line noted in explorer summary), which may not match reality as fallback queries consume additional credits.

#### Problem: In-Process State

All caches (`processedListings`, `queriedCards`, `failedQueries`) are in-memory Maps on the `ArbitrageEngine` instance. This means:
- A process restart loses all deduplication state → re-processes all listings
- Cannot horizontally scale (no shared state)
- Memory grows unboundedly between prune intervals

#### Problem: No Separation Between Match and Arbitrage

The system conflates two distinct concerns:
1. **"Is this eBay listing for card X?"** (identification/matching)
2. **"Is card X underpriced?"** (arbitrage calculation)

These are currently interleaved in `processListing()`. The matching logic cannot be tested, measured, or improved without running the full arbitrage pipeline.

---

### 1.5 Flawed Assumptions

#### Assumption: "Card number + expansion is sufficient for unique identification"

Multiple cards can share the same number within an expansion when variants exist (e.g., different artwork versions). The system partially handles this with variant detection but has no fallback when variant detection fails — it just takes the first Scrydex result.

#### Assumption: "eBay titles follow predictable patterns"

Sellers use wildly inconsistent formats:
- `"Charizard 4/102 Base Set Holo PSA 10"` (structured)
- `"PSA 10 GEM MINT CHARIZARD!!! Base Set WOTC 1999 4/102 Pokemon INVEST 🔥"` (noisy)
- `"Zard BS 4 Grail Card Psa10"` (abbreviated)

The regex approach handles the first format well but degrades on the second and fails on the third.

#### Assumption: "Scrydex market prices are reliable reference values"

Market prices from Scrydex are aggregated from historical sales. For low-liquidity cards (niche sets, unusual grades), the `market` price may be based on very few data points. Using this as the sole reference for profit calculation means deals on illiquid cards are unreliable.

#### Assumption: "A single confidence threshold is sufficient"

The system uses a single pass/fail threshold (28% with card number, 40% without) to decide whether to proceed. There's no graduated response — a 29% confidence listing is processed the same as a 95% confidence listing, consuming the same API credits and producing deals with the same visual treatment.

#### Assumption: "Lowering thresholds increases deal discovery"

Comments throughout the code reveal a pattern of relaxing thresholds:
- Name similarity: "Relaxed from 0.4 to 0.3" (line 1232)
- Printed total tolerance: ±25 (line 683)
- Confidence minimum: 28% (line 463)
- Denominator tolerance: ±5 (expansion service line 363)

Each relaxation increases match volume but also increases false positive rate. Without measuring accuracy, the system has no feedback loop to know if these changes improved or degraded real-world performance.

---

## Part 2: Ground-Up Redesign

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA COLLECTION LAYER                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ eBay Poller   │  │ Scrydex Catalog  │  │ Exchange Rate Svc    │ │
│  │ (Browse API)  │  │ Sync Service     │  │ (periodic refresh)   │ │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬────────────┘ │
│         │                   │                        │              │
└─────────┼───────────────────┼────────────────────────┼──────────────┘
          │                   │                        │
          ▼                   ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      NORMALIZATION PIPELINE                          │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ Title Parser  │  │ Structured Data  │  │ Signal Merger         │ │
│  │ (regex+rules) │  │ Extractor        │  │ (combine all signals) │ │
│  │               │  │ (item specifics) │  │                       │ │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬────────────┘ │
│         │                   │                        │              │
│         └───────────────────┴────────────────────────┘              │
│                             │                                       │
│                    NormalizedListing                                 │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MATCHING ENGINE                              │
│  ┌──────────────────┐  ┌─────────────────┐  ┌────────────────────┐ │
│  │ Expansion Resolver│  │ Card Resolver   │  │ Variant Resolver   │ │
│  │ (catalog lookup)  │  │ (Scrydex query) │  │ (price selection)  │ │
│  └────────┬─────────┘  └────────┬────────┘  └────────┬───────────┘ │
│           │                     │                     │             │
│           └─────────────────────┴─────────────────────┘             │
│                                 │                                   │
│                          MatchResult                                │
│                    (card + confidence score)                         │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ARBITRAGE CALCULATOR                           │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ Price Engine  │  │ Deal Classifier  │  │ Deal Store            │ │
│  │ (profit calc) │  │ (tier + filter)  │  │ (persist + dedup)     │ │
│  └──────────────┘  └──────────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                            │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ REST API      │  │ Dashboard        │  │ Telegram Notifier     │ │
│  └──────────────┘  └──────────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Key design principles:**
1. **Each layer is independently testable** — you can unit test the Title Parser without Scrydex, test the Matching Engine with mock listings, and test the Arbitrage Calculator with mock match results.
2. **Data flows in one direction** — no component reaches back up the pipeline.
3. **Confidence is accumulated** — each layer adds confidence signals, and the final score reflects the full match quality.

---

### 2.2 API Budget & Rate Limit Constraints

Every design decision must account for two hard API constraints. Overage charges on Scrydex and rate-limit suspensions on eBay are both unacceptable.

#### Scrydex API Limits

| Constraint | Value | Notes |
|---|---|---|
| **Monthly credit cap** | **50,000 credits** | Hard budget — no overage charges permitted |
| **Per-second rate limit** | **100 requests/second** | Applied across all endpoints globally |
| **Standard request cost** | 1 credit | Cards, expansions, sealed products |
| **Price history request cost** | 3 credits | `/cards/{id}/listings` endpoint |
| **Usage refresh lag** | 20-30 minutes | `GET /account/v1/usage` updates are delayed |

**Budget allocation (monthly):**

| Purpose | Credits | % of Budget | Frequency |
|---|---|---|---|
| Catalog sync | ~500 | 1% | Daily (3-5 paginated calls × 30 days) |
| Card matching (primary) | ~35,000 | 70% | Per-listing Scrydex queries |
| Card matching (fallbacks) | ~8,000 | 16% | Padded/wildcard/scoped retries |
| Usage monitoring | ~720 | 1.4% | Hourly usage checks (24/day × 30) |
| Manual searches | ~2,000 | 4% | Dashboard search, ad-hoc queries |
| **Safety buffer** | **~3,780** | **7.6%** | **Unallocated — prevents overage** |

**Daily budget derivation:**

```
Base daily budget = 50,000 ÷ 30 = 1,666 credits/day
Safety margin (10%) = 1,666 × 0.9 = 1,500 credits/day (usable)

Dynamic adjustment:
  remaining_credits = 50,000 - month_to_date_usage
  days_remaining = days_left_in_billing_cycle
  effective_daily = floor(remaining_credits × 0.9 / days_remaining)
  clamped_daily = clamp(effective_daily, 100, 3,000)
```

The system must check `GET /account/v1/usage` every hour to track actual consumption and dynamically adjust the daily budget. If `remaining_credits < 2,000`, halt all automated scanning and alert the operator.

**Credit-aware query strategy:**

The matching engine must minimize Scrydex API calls per listing:

1. **Cache-first:** Check the local query cache before any API call. The beta's `queriedCards` map (expansion:number → card data) should be persisted to Redis/database so it survives restarts.
2. **One-shot matching preferred:** The primary `expansion.id:{id} number:{number}` query costs 1 credit. If it hits, no further credits are spent on that listing.
3. **Fallback budget:** Each fallback strategy costs 1 additional credit. Cap total fallback attempts at **2 per listing** (down from the beta's 5). At 40 listings/scan × 2 fallbacks worst-case = 120 credits/scan max.
4. **Batch where possible:** The daily catalog sync should use `page_size=100` to minimize pagination calls (e.g., ~350 EN expansions = 4 calls = 4 credits).
5. **Never call price_history:** At 3 credits per call, the `/listings` endpoint is too expensive for automated use. Use `?include=prices` on card queries instead (included in the 1-credit card request).
6. **Kill switch:** If `daily_credits_used >= effective_daily_budget`, stop scanning immediately. Do not queue — halt.

**Rate limit handling (100 req/s):**

At 100 requests/second, this is unlikely to be a bottleneck for a single-instance scanner. However:
- Implement a token-bucket rate limiter (100 tokens, refills at 100/second)
- On HTTP 429 response, back off exponentially: 1s → 2s → 4s → max 30s
- Log all 429 responses as warnings for monitoring
- The catalog sync (which fetches multiple pages rapidly) should insert a 50ms delay between paginated requests to stay well under the limit

#### eBay Browse API Limits

eBay's exact rate limits vary by account tier and are not publicly documented at fixed numbers. The beta observed these constraints:

| Constraint | Observed Value | Notes |
|---|---|---|
| **Per-call rate limit** | ~5,000 calls/day (varies) | Returns HTTP 429 when exceeded |
| **Results per search** | Max 200 items (paginated) | `limit` param, max 200 per page |
| **OAuth token lifetime** | 2 hours | Must refresh before expiry |
| **Category filter** | 183454 | Pokemon CCG Singles |
| **Market** | EBAY-GB | UK-only marketplace |

**eBay budget strategy:**

Since eBay's exact limits are opaque and account-dependent:

1. **Query the Analytics API:** `GET /developer/analytics/v1_beta/rate_limit/` returns your actual rate limits, remaining calls, and reset time. Check this before each scan cycle.
2. **Conservative scan scheduling:**
   ```
   Operating hours: 06:00 - 23:00 UK time (17 hours)
   Scans per day target: ~80-120 (depends on eBay allowance)
   Scan interval: dynamically calculated = operating_minutes_remaining / scans_remaining
   Clamped to: [10 minutes, 30 minutes]
   ```
3. **Listings per scan:** 40 items (1 API call). The beta used `limit=40` which balances coverage vs. credit consumption. Increasing to 200 would give broader coverage per scan but fewer total scans per day.
4. **Exponential backoff on 429:** 1 min → 2 min → 4 min → max 5 min. Reset consecutive counter on successful request.
5. **Avoid item-level enrichment calls:** The beta made additional per-item API calls for condition enrichment. In v2, extract everything needed from the initial search response (which includes `itemSpecifics` and `conditionDescriptors`).

#### Combined Credit Budget Tracking

The footer status bar must display:

```
Scrydex: 1,240 / 50,000 (monthly) | 312 / 1,500 (today) | Buffer: 3,780
eBay: 1,847 / ~5,000 (daily) | Status: OK
```

Both APIs must have independent circuit breakers:
- **Scrydex exhausted:** Stop all automated scanning + card resolution. Dashboard still works (cached data). Alert via Telegram.
- **eBay rate-limited:** Pause scanning, show countdown to retry. Resume automatically when backoff expires.
- **Both healthy:** Normal operation.

---

### 2.3 Data Collection Layer

#### eBay Poller

Responsibility: Fetch new listings from eBay Browse API and emit raw `EbayListing` objects.

```typescript
// Poller is ONLY responsible for fetching. No parsing, no filtering.
interface EbayListing {
  itemId: string;
  title: string;
  price: number;           // GBP
  shippingCost: number;    // GBP
  imageUrl: string;
  url: string;
  seller: SellerInfo;
  country: string;
  conditionId: string;
  conditionDescriptors: ConditionDescriptor[];
  itemSpecifics: Record<string, string>;  // KEY: use this
  listingTime: Date;
}
```

**Changes from beta:**
- Extract and preserve `itemSpecifics` / `localizedAspects` from eBay API — fields like "Card Name", "Set", "Card Number" are often available as structured seller-provided data
- Poller emits events (or pushes to a queue) rather than calling the engine directly
- Credit budget management lives here, not in the engine

#### Scrydex Catalog Sync

Responsibility: Maintain a **local mirror** of the Scrydex expansion catalog. Runs on a schedule (daily), not on-demand.

```typescript
interface LocalExpansion {
  scrydexId: string;       // The canonical Scrydex ID - single source of truth
  name: string;
  code: string;
  series: string;
  printedTotal: number;
  total: number;           // Including secret rares
  releaseDate: Date;
  languageCode: string;
  logo: string | null;
  symbol: string | null;
  lastSyncedAt: Date;
}
```

**Changes from beta:**
- **No hardcoded expansion list.** The catalog is fetched from `GET /pokemon/v1/expansions?q=language_code:EN` and stored in the database
- **No local-to-Scrydex ID remapping.** Use Scrydex IDs as the canonical identifier from the start. The beta's `scrydexIdMap` remapping layer was an artifact of having a separate hardcoded list
- **Incremental sync:** Only fetch expansions newer than `lastSyncedAt`
- Build and persist **derived lookup tables**: name→id, code→id, alias→id, printedTotal→[ids]

---

### 2.4 Normalization Pipeline

This is the core improvement. Instead of parsing a title into a guess, we extract **signals from multiple sources** and merge them.

#### Step 1: Title Parser (improved)

Same role as beta but restructured:

```typescript
interface TitleSignals {
  // Each field has a value AND a confidence
  cardName: { value: string; confidence: number } | null;
  cardNumber: { value: string; raw: string; confidence: number } | null;
  setName: { value: string; confidence: number } | null;
  setCode: { value: string; confidence: number } | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  variant: VariantSignals;
  language: string;
  isFirstEdition: boolean;
  isShadowless: boolean;
  isJunk: boolean;
  isFake: boolean;
}
```

**Improvements over beta:**
- **Per-field confidence** instead of a single score. A title might have high-confidence card number (`"123/456"` is unambiguous) but low-confidence card name (extracted by position heuristic)
- **Regex patterns are data-driven, not code.** Load patterns from a config file or database so new patterns don't require code changes
- **Pokemon name matching uses the Scrydex catalog** — query all card names from synced expansions rather than maintaining a hardcoded list
- **Set name matching uses the expansion catalog** — search the local expansion mirror rather than era-specific regexes
- **Emoji and noise stripping** as the first normalization pass

#### Step 2: Structured Data Extractor

New component that doesn't exist in the beta. Extracts signals from eBay's structured fields:

```typescript
function extractStructuredSignals(listing: EbayListing): StructuredSignals {
  const specifics = listing.itemSpecifics;
  return {
    cardName: specifics['Card Name'] || specifics['Character'] || null,
    cardNumber: specifics['Card Number'] || null,
    setName: specifics['Set'] || specifics['Expansion'] || null,
    rarity: specifics['Rarity'] || null,
    language: specifics['Language'] || null,
    gradingCompany: specifics['Professional Grader'] || null,
    grade: specifics['Grade'] || null,
    year: specifics['Year Manufactured'] || null,
  };
}
```

When eBay sellers fill in item specifics, this data is often more reliable than title parsing because eBay provides dropdown menus for many fields.

#### Step 3: Signal Merger

Combines title-parsed signals and structured signals into a single `NormalizedListing`:

```typescript
function mergeSignals(
  title: TitleSignals,
  structured: StructuredSignals
): NormalizedListing {
  // For each field, pick the higher-confidence source
  // If both agree, boost confidence
  // If they conflict, flag for review and use the more reliable source

  const cardNumber = resolveConflict(
    title.cardNumber,          // confidence from regex match quality
    structured.cardNumber       // confidence = 0.9 (structured data is reliable)
  );
  // ...
}
```

**Conflict resolution rules:**
| Title says | Structured says | Resolution |
|---|---|---|
| "123/456" | "123" | Agree → confidence boost |
| "123/456" | "456" | Conflict → flag, prefer title (has denominator) |
| null | "123" | Use structured |
| "123/456" | null | Use title |

Output:

```typescript
interface NormalizedListing {
  ebayItemId: string;
  ebayTitle: string;

  // Resolved fields
  cardName: string | null;
  cardNumber: string | null;       // Normalized: no leading zeros, correct prefix
  printedNumber: string | null;    // Original format: "123/456"
  denominator: number | null;      // Extracted: 456
  setName: string | null;
  setCode: string | null;

  // Card attributes
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  variant: ResolvedVariant;
  condition: CardCondition;
  conditionSource: string;
  language: string;
  isFirstEdition: boolean;
  isShadowless: boolean;

  // Metadata
  confidence: NormalizationConfidence;  // Per-field + aggregate
  signals: { title: TitleSignals; structured: StructuredSignals };
  warnings: string[];

  // Passthrough
  price: number;
  shippingCost: number;
  seller: SellerInfo;
  country: string;
  imageUrl: string;
  url: string;
  listingTime: Date;
}
```

---

### 2.5 Matching Engine

The matching engine takes a `NormalizedListing` and returns a `MatchResult`. It is a **pure function** (given the same inputs and catalog state, it produces the same output). It does not store deals, track diagnostics, or manage caches.

#### Stage 1: Expansion Resolution

```typescript
interface ExpansionResolveResult {
  expansion: LocalExpansion | null;
  method: 'exact_id' | 'exact_name' | 'code' | 'alias' | 'fuzzy' | 'denominator' | 'none';
  confidence: number;            // 0.0 - 1.0
  alternatives: LocalExpansion[];
  denominatorValidated: boolean; // true if printed total matches
}
```

**Resolution strategy (ordered by confidence):**
1. **Set code match** (confidence: 0.98) — `"sv8"` → Surging Sparks. Lookup against expansion catalog.
2. **Exact name match** (confidence: 0.95) — `"Surging Sparks"` → exact match in catalog.
3. **Alias match** (confidence: 0.92) — `"SuMo"` → `"Sun & Moon"`. Maintained alias table.
4. **Promo prefix match** (confidence: 0.90) — `"SVP"` → SV Black Star Promos.
5. **Fuzzy name match** (confidence: 0.60-0.85) — Levenshtein distance with score. Only accept if edit distance ≤ 2 for short names, ≤ 3 for long names.
6. **Denominator inference** (confidence: 0.40-0.60) — Multiple candidates, weighted by recency. Only used if no other signal works.

**Denominator cross-validation:** If expansion is matched by name AND the listing has a denominator, check `|denominator - expansion.printedTotal| ≤ 5`. If it matches, boost confidence +0.15. If it doesn't match and the expansion was fuzzy-matched, **reject the match** (don't just log a warning).

#### Stage 2: Card Resolution

```typescript
interface CardResolveResult {
  card: ScrydexCard | null;
  method: 'exact_number' | 'padded_number' | 'scoped_search' | 'name_and_number' | 'none';
  confidence: number;
  nameMatchScore: number;       // 0.0 - 1.0
  numberMatchExact: boolean;
}
```

**Resolution strategy (ordered by confidence):**

1. **Exact query** (confidence: 0.95) — `expansion.id:{id} number:{number}`. Single Scrydex API call.
2. **Padded query** (confidence: 0.90) — For subset cards, try zero-padded: `TG7` → `TG07`.
3. **Expansion-scoped search** (confidence: 0.80) — If exact fails, search within the expansion and find exact number match in results.
4. **Name + number cross-expansion** (confidence: 0.50) — Only if expansion confidence < 0.7. Search recent expansions. Require name similarity ≥ 0.6 (not 0.25).

**Critical change: No more cascading fallbacks to broader searches.** If the card isn't found in the matched expansion after strategies 1-3, and expansion confidence was ≥ 0.7, return `card: null`. Don't guess. A missed deal is better than a wrong deal.

**Name validation is mandatory, not optional:**
```typescript
function validateNameMatch(parsedName: string, scrydexName: string): number {
  // Normalize both: lowercase, remove punctuation, remove type suffixes (V, VMAX, ex, GX)
  const normalizedParsed = normalizeName(parsedName);
  const normalizedScrydex = normalizeName(scrydexName);

  // Exact match after normalization
  if (normalizedParsed === normalizedScrydex) return 1.0;

  // One contains the other (handles "Pikachu" vs "Pikachu V")
  if (normalizedScrydex.startsWith(normalizedParsed) ||
      normalizedParsed.startsWith(normalizedScrydex)) {
    return 0.85;
  }

  // Levenshtein-based similarity
  return levenshteinSimilarity(normalizedParsed, normalizedScrydex);
}
```

**Minimum name similarity: 0.6** (up from beta's 0.3). This is the single most impactful change for accuracy.

#### Stage 3: Variant Resolution

```typescript
interface VariantResolveResult {
  variant: ScrydexVariant | null;
  method: 'exact' | 'inferred' | 'default';
  confidence: number;
  prices: ScrydexPrice[];
}
```

**Variant matching strategy:**

1. Build a normalized variant key from listing signals:
   ```
   [1stEdition?] + [Shadowless?] + [Holo|ReverseHolo|Normal]
   ```

2. Match against Scrydex variant names using a **mapping table** (not string matching):
   ```typescript
   const VARIANT_MAP: Record<string, string[]> = {
     'holofoil': ['holofoil', 'holo', 'unlimitedHolofoil'],
     'reverseHolofoil': ['reverseHolofoil', 'reverseHolo'],
     'firstEditionHolofoil': ['firstEditionHolofoil', '1stEditionHolofoil', 'firstEditionHolo'],
     'normal': ['normal', 'unlimited', 'unlimitedNormal'],
     // ...
   };
   ```

3. If no variant is detected from the listing but the card only has ONE variant with prices, use it (common for modern singles).

4. If multiple variants exist and none is detected, **default to the lowest-priced variant** (conservative) and set confidence to 0.5.

#### Composite Confidence Score

```typescript
interface MatchResult {
  listing: NormalizedListing;
  card: ScrydexCard;
  expansion: LocalExpansion;
  variant: ScrydexVariant;
  prices: ScrydexPrice[];

  confidence: {
    expansion: number;       // 0.0 - 1.0
    card: number;            // 0.0 - 1.0
    name: number;            // 0.0 - 1.0
    variant: number;         // 0.0 - 1.0
    normalization: number;   // From the normalization pipeline
    composite: number;       // Weighted average
  };

  method: {
    expansion: string;
    card: string;
    variant: string;
  };
}

function calculateCompositeConfidence(scores: ConfidenceScores): number {
  // Weighted geometric mean — any single low score drags the composite down
  // This prevents high expansion confidence from masking low name confidence
  const weights = {
    expansion: 0.25,
    card: 0.25,
    name: 0.30,    // Name match is the most important signal
    variant: 0.10,
    normalization: 0.10,
  };

  let weightedProduct = 1;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const score = scores[key as keyof ConfidenceScores];
    weightedProduct *= Math.pow(score, weight);
    totalWeight += weight;
  }

  return Math.pow(weightedProduct, 1 / totalWeight);
}
```

**Confidence-gated processing:**

| Composite Confidence | Action |
|---|---|
| ≥ 0.85 | **High confidence** — process automatically, show in dashboard |
| 0.65 - 0.84 | **Medium confidence** — process but flag with warning badge |
| 0.45 - 0.64 | **Low confidence** — log for training data only, do not display as deal |
| < 0.45 | **Reject** — skip entirely |

---

### 2.6 Confidence Scoring & Validation

#### Validation Layers

Every match passes through explicit validation before becoming a deal:

```typescript
interface ValidationResult {
  passed: boolean;
  checks: {
    denominatorMatch: boolean | null;   // null = no denominator to check
    nameMatch: boolean;
    expansionLanguage: boolean;
    priceDataAvailable: boolean;
    exchangeRateFresh: boolean;
    sellerCountry: boolean;
  };
  failedCheck: string | null;
}
```

**Hard gates (instant rejection):**
- Name similarity < 0.6
- Expansion language ≠ EN
- Seller country ≠ GB
- No price data available for matched variant
- Exchange rate > 6 hours stale (don't guess at currency conversion)

**Soft gates (confidence reduction):**
- Denominator mismatch (but within ±15): reduce confidence by 0.2
- Name similarity 0.6-0.7: reduce confidence by 0.1
- Expansion matched via fuzzy/denominator: inherent lower confidence already
- Condition defaulted (not from structured data or title): reduce confidence by 0.05

#### Accuracy Tracking

Every deal should be stored with its match metadata for later analysis:

```typescript
interface DealAuditRecord {
  dealId: string;
  ebayItemId: string;
  ebayTitle: string;

  // What we parsed
  normalizedListing: NormalizedListing;

  // What we matched
  matchResult: MatchResult;

  // Confidence breakdown
  confidence: ConfidenceBreakdown;

  // Outcome (populated later via manual review or automated checks)
  reviewedAt: Date | null;
  isCorrectMatch: boolean | null;    // Human-verified
  incorrectReason: string | null;    // "wrong_card" | "wrong_expansion" | "wrong_variant" | "wrong_price"

  createdAt: Date;
}
```

This audit table is the foundation for measuring and improving accuracy over time.

---

### 2.7 Accuracy Measurement & Enforcement

#### How to Measure Accuracy

**Definition:** A match is "accurate" if the Scrydex card returned is the same card being sold in the eBay listing. Specifically:
1. Correct Pokemon / card name
2. Correct expansion / set
3. Correct card number
4. Correct variant (holo vs non-holo, 1st edition vs unlimited)

**Measurement approach:**

1. **Automated validation (continuous):**
   - Cross-check: if eBay listing has item specifics for "Set" and "Card Number", verify they match our resolved expansion and number
   - Denominator validation: verify listing denominator matches expansion printed_total
   - Name containment check: verify parsed name appears in Scrydex card name (or vice versa)
   - Track: `automated_accuracy = validated_correct / total_validated`

2. **Manual review sampling (weekly):**
   - Random sample 50 deals from the audit table
   - Human reviewer checks each against the eBay listing
   - Record `isCorrectMatch` and `incorrectReason`
   - Track: `manual_accuracy = correct / reviewed`

3. **Confidence calibration:**
   - After collecting 200+ reviewed deals, bin by confidence score
   - Verify that 0.85+ confidence deals are actually correct 85%+ of the time
   - If not, adjust weights or thresholds

#### Accuracy Enforcement

**Target: ≥85% match accuracy**

Enforcement mechanisms:

1. **Confidence floor:** Don't show deals below the composite confidence threshold that corresponds to 85% empirical accuracy (start at 0.65, calibrate based on data).

2. **Regression testing:** Maintain a corpus of 200+ eBay titles with known correct matches. Run the full normalization + matching pipeline against this corpus on every code change. Fail the build if accuracy drops below 85%.

```typescript
// test/accuracy/match-corpus.test.ts
describe('Match accuracy corpus', () => {
  const corpus = loadCorpus('test/fixtures/match-corpus.json');

  it('should maintain ≥85% accuracy on known matches', () => {
    let correct = 0;
    let total = 0;

    for (const entry of corpus) {
      const normalized = normalize(entry.ebayListing);
      const match = matchEngine.resolve(normalized);
      total++;

      if (match.card?.id === entry.expectedCardId &&
          match.expansion?.scrydexId === entry.expectedExpansionId) {
        correct++;
      }
    }

    const accuracy = correct / total;
    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });
});
```

3. **Monitoring dashboard:** Track rolling 7-day accuracy from automated checks. Alert if it drops below 80%.

4. **Feedback loop:** When manual review finds incorrect matches, add the failing case to the regression corpus. This ensures the same error never recurs.

---

### 2.8 Implementation Roadmap

#### Phase 1: Foundation (Week 1-2)

**Goal:** Establish the project structure, data layer, and Scrydex catalog sync.

- [ ] Project scaffolding with modular directory structure
- [ ] Database schema: `expansions`, `deals`, `deal_audit`, `match_corpus`
- [ ] Scrydex Catalog Sync Service: fetch all EN expansions, store locally
- [ ] Expansion lookup service: name/code/alias/fuzzy/denominator resolution
- [ ] Unit tests for expansion resolution with 95%+ coverage

```
src/
├── collection/          # Data collection layer
│   ├── ebay-poller.ts
│   ├── catalog-sync.ts
│   └── exchange-rate.ts
├── normalization/       # Normalization pipeline
│   ├── title-parser.ts
│   ├── structured-extractor.ts
│   ├── signal-merger.ts
│   └── types.ts
├── matching/            # Matching engine
│   ├── expansion-resolver.ts
│   ├── card-resolver.ts
│   ├── variant-resolver.ts
│   ├── confidence.ts
│   └── types.ts
├── arbitrage/           # Arbitrage calculator
│   ├── price-engine.ts
│   ├── deal-classifier.ts
│   └── deal-store.ts
├── api/                 # REST API
├── config/
├── database/
└── utils/
```

#### Phase 2: Normalization (Week 2-3)

**Goal:** Build the improved title parser and structured data extractor.

- [ ] Port regex patterns from beta as starting point
- [ ] Replace hardcoded Pokemon name list with catalog-driven lookup
- [ ] Replace era-specific set name regexes with catalog-driven matching
- [ ] Build structured data extractor for eBay item specifics
- [ ] Build signal merger with per-field conflict resolution
- [ ] Create initial match corpus (100 titles) from beta's training data
- [ ] Unit tests: parse accuracy ≥ 90% on corpus

#### Phase 3: Matching Engine (Week 3-4)

**Goal:** Build the card resolution pipeline with composite confidence scoring.

- [ ] Expansion resolver with ordered strategy chain
- [ ] Card resolver with exact → padded → scoped search (no broad fallbacks)
- [ ] Name validation with 0.6 minimum threshold
- [ ] Variant resolver with mapping table
- [ ] Composite confidence scoring (weighted geometric mean)
- [ ] Confidence-gated processing (high/medium/low/reject)
- [ ] Integration tests: end-to-end matching against live Scrydex API
- [ ] Regression test suite with match corpus: accuracy ≥ 85%

#### Phase 4: Arbitrage & Presentation (Week 4-5)

**Goal:** Price calculation, deal storage, and dashboard.

- [ ] Price engine: extract correct price from variant, convert currency
- [ ] Deal classifier: tier assignment with configurable thresholds
- [ ] Deal store: PostgreSQL with deduplication and audit logging
- [ ] REST API endpoints
- [ ] Dashboard frontend
- [ ] Telegram notifications for high-confidence deals only

#### Phase 5: Accuracy Loop (Ongoing)

**Goal:** Continuous improvement through measurement and feedback.

- [ ] Manual review workflow: sample deals, verify matches, record outcomes
- [ ] Confidence calibration: adjust thresholds based on empirical data
- [ ] Corpus growth: add every misidentified deal to regression suite
- [ ] Monitoring: accuracy dashboard with alerting
- [ ] Pattern updates: add new regex patterns when new card formats appear

---

### Summary of Key Differences from Beta

| Aspect | Beta | Redesign |
|---|---|---|
| Expansion catalog | Hardcoded 500+ entries with ID remapping | Live-synced from Scrydex, Scrydex IDs canonical |
| Title parsing | 50+ regexes, single confidence score | Regex + structured data, per-field confidence |
| Pokemon name matching | Hardcoded ~300 names | Catalog-driven from Scrydex card database |
| Set name matching | 9 era-specific regexes | Catalog-driven from expansion mirror |
| Match fallbacks | 6 cascading strategies, thresholds lowered over time | 3 strategies max, strict thresholds, prefer "no match" over wrong match |
| Name similarity threshold | 0.25-0.30 | 0.60 minimum |
| Confidence scoring | Single parse confidence (0-100) | Composite weighted score per field |
| Confidence response | Binary pass/fail at 28% | 4-tier graduated response |
| Architecture | God object (ArbitrageEngine, 1800 lines) | 4 separate layers, each independently testable |
| Accuracy measurement | None (only diagnostic stage counters) | Automated checks + manual review sampling + regression corpus |
| State management | In-memory Maps, lost on restart | Database-backed with Redis cache |
| Expansion updates | Requires code change + redeploy | Automated daily sync |
