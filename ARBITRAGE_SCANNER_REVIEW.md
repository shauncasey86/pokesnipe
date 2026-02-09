# PokeSnipe Arbitrage Scanner: Critical Evaluation & Redesign

## Table of Contents

- [Part 1: Critical Evaluation of pokesnipe-beta](#part-1-critical-evaluation)
  - [1.1 Data Ingestion & Normalization](#11-data-ingestion--normalization)
  - [1.2 Matching Logic & Heuristics](#12-matching-logic--heuristics)
  - [1.3 Error Handling & Edge Cases](#13-error-handling--edge-cases)
  - [1.4 Architectural & Scalability Limitations](#14-architectural--scalability-limitations)
  - [1.5 Flawed Assumptions](#15-flawed-assumptions)
- [Part 2: Ground-Up Redesign](#part-2-ground-up-redesign)
  - [2.1 High-Level Architecture](#21-high-level-architecture) *(layered architecture, process lifecycle, dependency injection)*
  - [2.2 API Budget & Rate Limit Constraints](#22-api-budget--rate-limit-constraints) *(token-bucket, circuit breakers, retry policy)*
  - [2.3 Scrydex Card Index](#23-scrydex-card-index) *(PostgreSQL DDL, sync idempotency, search indexes)*
  - [2.4 Signal Extraction](#24-signal-extraction) *(5-phase parsing pipeline, DB-driven name matching)*
  - [2.5 Local Index Matching](#25-local-index-matching) *(Jaro-Winkler, asymmetric substring, candidate cap)*
  - [2.6 Confidence Scoring & Validation](#26-confidence-scoring--validation) *(log-space geometric mean, hard/soft gates)*
  - [2.7 Liquidity Assessment](#27-liquidity-assessment)
  - [2.8 Accuracy Measurement & Enforcement](#28-accuracy-measurement--enforcement) *(corpus format, calibration curves, seeding strategy)*
  - [2.9 Manual Listing Lookup Tool](#29-manual-listing-lookup-tool)
  - [2.10 Public Card Catalog](#210-public-card-catalog)
  - [2.11 Observability & Operational Excellence](#211-observability--operational-excellence) **NEW** *(structured logging, metrics, alerting)*
  - [2.12 Error Handling Philosophy](#212-error-handling-philosophy) **NEW** *(typed error hierarchy, category-based response)*
  - [2.13 Security](#213-security) **NEW** *(auth, input validation, SQL injection prevention)*
  - [2.14 Configuration Management](#214-configuration-management) **NEW** *(typed AppConfig, env-var overrides)*
  - [2.15 Implementation Roadmap](#215-implementation-roadmap) *(revised with infrastructure tasks)*
  - [2.16 Backend API Contract](#216-backend-api-contract)

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

### Why the Beta's Fundamental Approach is Wrong

The beta — and my initial redesign proposal — both follow the same pipeline:

```
eBay listing → parse title → guess expansion → query Scrydex live → hope it matches
```

This is **eBay-first, Scrydex-reactive.** Every listing triggers 1-6 live Scrydex API calls. At 40 listings per scan, that's 40-240 credits per scan cycle. With a 50,000 credit/month budget, you're constantly rationing, throttling, and burning credits on failed queries.

The better approach inverts the pipeline entirely:

```
Scrydex → local card index (background) → eBay listing → match locally → zero API credits
```

**Scrydex-first, eBay-reactive.** Build a local database of every English card with prices. When an eBay listing arrives, match it against the local index. The matching is a database query, not an API call. Scrydex credits are spent on bulk syncing (cheap, predictable) rather than per-listing lookups (expensive, unpredictable).

**The numbers make this obvious:**
- ~350 English expansions, ~25,000-40,000 English cards total
- At 100 cards per page, a full sync = 250-400 API calls = **250-400 credits** (one-time)
- With `?include=prices`, each call returns price data at no extra cost (still 1 credit)
- Weekly full resync = 1,600 credits/month
- Leaves **48,000+ credits** for targeted refreshes, manual queries, and safety buffer
- Beta approach: 1,500 credits/day × 30 = **45,000 credits/month** on reactive per-listing queries

This isn't a marginal improvement. It's a **97% reduction in matching-related API costs.**

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│              BACKGROUND: SCRYDEX CARD INDEX (runs independently)     │
│                                                                     │
│  ┌───────────────┐     ┌──────────────────┐     ┌───────────────┐  │
│  │ Catalog Sync   │────▶│ Local Card DB    │────▶│ Search Index  │  │
│  │ (daily/weekly) │     │ (all EN cards +  │     │ (number, name,│  │
│  │                │     │  prices, images) │     │  expansion)   │  │
│  └───────────────┘     └──────────────────┘     └───────────────┘  │
│         ▲                                              │            │
│    Scrydex API                                         │            │
│    (~400 credits                                       │            │
│     per full sync)                                     │            │
└────────────────────────────────────────────────────────┼────────────┘
                                                         │
                    ┌────────────────────────────────────┘
                    │ LOCAL LOOKUPS (zero API credits)
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SCAN-TIME PIPELINE (per eBay listing)             │
│                                                                     │
│  eBay Listing                                                       │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────────────────────────────┐                       │
│  │ Signal Extraction                         │                      │
│  │ • Title parser (regex → card number, name)│                      │
│  │ • Item specifics (structured fields)      │                      │
│  │ • Merge + per-field confidence            │                      │
│  └──────────────────┬───────────────────────┘                       │
│                     │ NormalizedListing                              │
│                     ▼                                               │
│  ┌──────────────────────────────────────────┐                       │
│  │ Local Index Matching                      │                      │
│  │ • Number-first: query local DB by number  │                      │
│  │ • Disambiguate by denominator + name      │                      │
│  │ • Score candidates → composite confidence │                      │
│  └──────────────────┬───────────────────────┘                       │
│                     │ MatchResult (card + prices + confidence)       │
│                     ▼                                               │
│  ┌──────────────────────────────────────────┐                       │
│  │ Arbitrage Calculator                      │                      │
│  │ • Price comparison (GBP conversion)       │                      │
│  │ • Profit calc + tier classification       │                      │
│  │ • Confidence gating (high/med/low/reject) │                      │
│  └──────────────────┬───────────────────────┘                       │
│                     │                                               │
│                     ▼                                               │
│              Deal (stored) → Dashboard / Telegram                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Key design principles:**
1. **Scrydex-first, not eBay-first.** The card database exists locally before any eBay scanning begins. Matching is a local database query, not an API call.
2. **API credits are spent on bulk syncing, not per-listing lookups.** A full card index sync costs ~400 credits. The beta spent that much in a single scan cycle.
3. **Number-first matching.** Card numbers are the most reliable signal in eBay titles. Match on number first, disambiguate on name/expansion second. This inverts the beta's approach of guessing expansion first.
4. **Each component is independently testable.** The matching engine works entirely offline against the local index.
5. **Confidence is accumulated per field** and a composite score gates whether a match becomes a deal.
6. **Fail safe, not fail silent.** Every pipeline stage returns typed results with explicit error states. No swallowed errors, no silent fallbacks to wrong data. A clean "no match" is always preferable to a wrong match.
7. **Configuration over code.** All thresholds, weights, and behavioral parameters live in a typed config object loaded from environment or DB — never inline magic numbers. Every config value has a documented reason for its default.
8. **Observe everything.** Structured logging with correlation IDs, Prometheus-compatible metrics, and health checks at every integration boundary. You cannot improve what you cannot measure.

#### Deployment Topology

Source code is hosted on **GitHub** and deployed to **Railway.app**. The application runs as a **single Railway service** — one Node.js process handles the eBay scanner, Scrydex sync scheduler, REST/SSE API, and frontend serving. This is deliberately simple for v1.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Railway                                                            │
│                                                                     │
│  ┌───────────────────────────────────┐   ┌───────────────────────┐ │
│  │  pokesnipe (Node.js service)      │──▶│  PostgreSQL (managed) │ │
│  │  • REST API + SSE                 │   │  • Card index         │ │
│  │  • eBay scanner (in-process)      │   │  • Deals + audit      │ │
│  │  • Scrydex sync scheduler         │   │  • Preferences        │ │
│  │  • Static frontend serving        │   └───────────────────────┘ │
│  └───────────────────────────────────┘                              │
│       ▲                                                             │
│       │ HTTPS (Railway-provided domain or custom)                   │
└───────┼─────────────────────────────────────────────────────────────┘
        │
   ┌────┴────┐
   │ Browser  │  Dashboard / Public Catalog
   └─────────┘
```

**Why a single service:** The eBay scanner, sync scheduler, and API server share the same database and card index. Running them in one process avoids inter-service communication complexity. Railway's managed PostgreSQL handles persistence — no volumes or file-system state. If the service restarts, in-process schedulers resume on boot and the local card index is immediately available from PostgreSQL.

**Why PostgreSQL over SQLite:** Railway services are ephemeral — the filesystem doesn't survive redeploys. PostgreSQL is a managed Railway add-on with automatic backups, persistent storage, and native support for trigram indexes (`pg_trgm`) and full-text search needed for card name matching.

**CI/CD pipeline:** GitHub → Railway auto-deploy on push to `main`. GitHub Actions runs linting, tests, and the accuracy regression suite on every PR. Railway builds from the Dockerfile in the repo root.

#### Process Lifecycle & Graceful Shutdown

The single-process architecture requires careful lifecycle management. Railway sends SIGTERM before killing a service (30-second grace period). The process must:

```typescript
// src/lifecycle.ts
interface ServiceLifecycle {
  start(): Promise<void>;   // Initialize in dependency order
  stop(): Promise<void>;    // Shutdown in reverse order
  isHealthy(): boolean;     // Health check for Railway
  isReady(): boolean;       // Readiness check (index loaded?)
}

// Boot sequence (order matters — each depends on the previous):
// 1. Database connection pool (verify connectivity)
// 2. Load card index metadata from PostgreSQL (expansion count, card count, last sync)
// 3. Start sync scheduler (registers cron jobs but does NOT run immediately)
// 4. Start eBay poller (begins scanning only if card index has data)
// 5. Start HTTP server (REST API + SSE + frontend)

// Shutdown sequence (reverse order):
// 1. Stop accepting new HTTP connections (server.close())
// 2. Stop eBay poller (finish current scan, then stop)
// 3. Stop sync scheduler (cancel pending cron jobs)
// 4. Drain SSE connections (send close event to all clients)
// 5. Drain database connection pool (wait for in-flight queries, max 10s)
```

**Critical rule: eBay scanning MUST NOT start until the card index has data.** On first deploy (empty database), the boot sequence runs a full sync before enabling the scanner. On subsequent boots, the existing PostgreSQL data is immediately available. This prevents the beta's failure mode where scanning starts before the system can match anything.

**Health & readiness endpoints:**
```
GET /health          → 200 if process is alive (Railway health check)
GET /health/ready    → 200 if card index is loaded AND DB is connected
                       503 if card index is empty OR DB is down
```

Railway routes traffic only to services returning 200 on the health check. The `/health/ready` endpoint ensures no traffic arrives before the system can serve meaningful results.

#### Layered Architecture

The codebase is organized into strict layers with enforced dependency direction. No layer may import from a layer above it.

```
┌──────────────────────────────────────────────────┐
│  HTTP Layer (api/)                                │
│  Routes, SSE, request validation, auth middleware │
├──────────────────────────────────────────────────┤
│  Application Layer (services/)                    │
│  Orchestration: scan loop, sync scheduler,        │
│  deal pipeline, lookup service, catalog service   │
├──────────────────────────────────────────────────┤
│  Domain Layer (domain/)                           │
│  Pure logic: title parser, signal merger,         │
│  matching engine, confidence scorer,              │
│  arbitrage calculator, liquidity assessor         │
│  — NO I/O, NO side effects, fully testable       │
├──────────────────────────────────────────────────┤
│  Infrastructure Layer (infra/)                    │
│  PostgreSQL repos, Scrydex client, eBay client,   │
│  exchange rate client, Telegram client,           │
│  rate limiters, config loader                     │
└──────────────────────────────────────────────────┘
```

**The domain layer is the most important layer.** It contains all matching logic, scoring, and calculation with zero external dependencies. It takes typed inputs and returns typed outputs. This means:
- The matching engine can be tested with a simple in-memory card array — no database, no API mocks
- Confidence scoring is a pure function — deterministic, no side effects
- Title parsing takes a string and returns a typed result — no I/O

**Dependency injection:** Services receive their dependencies via constructor parameters, not global imports. This enables testing with real implementations in integration tests and simple stubs in unit tests. No DI framework — just constructor parameters and TypeScript interfaces.

```typescript
// Example: ScanPipeline receives all its dependencies explicitly
class ScanPipeline {
  constructor(
    private readonly ebayPoller: EbayPoller,
    private readonly signalExtractor: SignalExtractor,
    private readonly matchingEngine: MatchingEngine,
    private readonly arbitrageCalc: ArbitrageCalculator,
    private readonly dealStore: DealStore,
    private readonly config: ScanConfig,
  ) {}
}
```

---

### 2.2 API Budget & Rate Limit Constraints

Every design decision must account for two hard API constraints. Overage charges on Scrydex and rate-limit suspensions on eBay are both unacceptable. The Scrydex-first architecture fundamentally changes how credits are spent — bulk syncing replaces per-listing queries.

#### Scrydex API Limits

| Constraint | Value | Notes |
|---|---|---|
| **Monthly credit cap** | **50,000 credits** | Hard budget — no overage charges permitted |
| **Per-second rate limit** | **100 requests/second** | Applied across all endpoints globally |
| **Standard request cost** | 1 credit **per request (not per card)** | A page of 100 cards = 1 credit |
| **`?include=prices`** | Still 1 credit | Price data + trend data bundled free with card queries |
| **Price history request cost** | 3 credits | `/cards/{id}/listings` endpoint |
| **Usage refresh lag** | 20-30 minutes | `GET /account/v1/usage` updates are delayed |

**Budget allocation (monthly) — Scrydex-first model:**

| Purpose | Credits | % of Budget | Frequency |
|---|---|---|---|
| **Full card index sync** | **~1,600** | **3.2%** | Weekly full resync (4 × ~400 credits) |
| Hot-set delta refresh | ~900 | 1.8% | Daily refresh of 10 most recent sets |
| Expansion catalog sync | ~120 | 0.2% | Daily (4 paginated calls × 30 days) |
| High-value price verification | ~1,500 | 3% | 500 targeted price_history calls for top deals |
| Usage monitoring | ~720 | 1.4% | Hourly usage checks (24/day × 30) |
| Manual / dashboard queries | ~2,000 | 4% | Ad-hoc searches from the UI |
| **Unallocated safety buffer** | **~43,160** | **86.3%** | **Prevents overage — massive headroom** |

Compare with the beta: **70% of budget went to per-listing Scrydex queries.** The Scrydex-first model spends **<5% on automated sync** and leaves 86% unallocated.

**Why the numbers work:**
```
~350 EN expansions × ~100 cards avg = ~35,000 cards
At page_size=100: ~350 paginated requests per full sync
With ?include=prices: 350 requests × 1 credit = ~350 credits per full sync
Weekly full resync: 350 × 4 weeks = ~1,400 credits/month
Daily delta (10 recent sets × ~5 pages): 50 × 30 = ~1,500 credits/month
Total automated sync: ~2,900 credits/month = 5.8% of budget
```

**Credit monitoring:**

The system must check `GET /account/v1/usage` every hour. However, because automated consumption is so low (~100 credits/day for syncing), the kill-switch thresholds are much more relaxed:
- If `remaining_credits < 5,000`: reduce sync frequency to weekly-only, alert operator
- If `remaining_credits < 2,000`: halt all automated syncing, alert via Telegram
- Dashboard and cached local data continue to work regardless — matching is local

**Key rule: Never call price_history for automated matching.** At 3 credits per call, `/cards/{id}/listings` is reserved for manual verification of high-value deals only. The `?include=prices` parameter on standard card queries returns current market/low prices at no extra cost.

**Rate limit handling (100 req/s):**

At 100 requests/second, this is unlikely to be a bottleneck. The heaviest load is the weekly full sync (~350 requests), which at 100 req/s completes in under 4 seconds. However, we must be a good API citizen and handle transient failures robustly:

```typescript
// src/infra/rate-limiter.ts — Generic token-bucket, reusable for any API
interface RateLimiterConfig {
  maxTokens: number;        // Bucket capacity (e.g., 100)
  refillRate: number;       // Tokens per second (e.g., 100)
  retryAttempts: number;    // Max retries on 429 (e.g., 4)
  retryBaseMs: number;      // Base backoff delay (e.g., 1000)
  retryMaxMs: number;       // Max backoff delay (e.g., 30000)
  courtesyDelayMs: number;  // Delay between sequential calls (e.g., 50)
}

// Implementation requirements:
// 1. Token bucket is checked BEFORE each request (await limiter.acquire())
// 2. If no token available, caller awaits until one refills — never rejects
// 3. On HTTP 429, the limiter enters backoff state:
//    - retryBaseMs * 2^attempt, jittered by ±20%, capped at retryMaxMs
//    - Jitter prevents thundering herd when multiple requests back off simultaneously
// 4. courtesyDelayMs is inserted between sequential requests in bulk operations
//    (e.g., sync pagination) to stay well below the limit voluntarily
// 5. All delays are awaited — never use setTimeout callbacks
// 6. Metrics emitted: tokens_consumed, backoffs_triggered, courtesy_delays
```

**Retry policy for all external calls:**
```
Retryable: HTTP 429, 500, 502, 503, 504, ECONNRESET, ETIMEDOUT
Not retryable: HTTP 400, 401, 403, 404 (client errors — retrying won't help)
Max attempts: 4 (initial + 3 retries)
Backoff: exponential with jitter — 1s, 2s, 4s (±20% jitter)
Circuit breaker: after 5 consecutive failures, open circuit for 60s before retrying
```

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
3. **Listings per scan:** 40-200 items (1 API call). Since matching is now local (zero Scrydex cost per listing), we can increase to `limit=200` for broader coverage without any credit penalty. The only constraint is eBay's daily call allowance.
4. **Exponential backoff on 429:** 1 min → 2 min → 4 min → max 5 min. Reset consecutive counter on successful request.
5. **Avoid item-level enrichment calls:** Extract everything needed from the initial search response (which includes `itemSpecifics` and `conditionDescriptors`). No per-item follow-up calls.

#### Combined Budget Tracking

The footer status bar must display:

```
Scrydex: 2,340 / 50,000 (monthly) | Card Index: 34,892 cards | Last sync: 2h ago
eBay: 1,847 / ~5,000 (daily) | Status: OK
```

Both APIs must have independent **circuit breakers** following the standard three-state pattern (closed → open → half-open):

```typescript
// Circuit breaker states:
// CLOSED:    Normal operation. Failures increment a counter.
// OPEN:      After N consecutive failures, reject all calls immediately.
//            After a timeout, transition to HALF_OPEN.
// HALF_OPEN: Allow ONE request through. If it succeeds → CLOSED.
//            If it fails → OPEN (restart timeout).

interface CircuitBreakerConfig {
  failureThreshold: number;   // Consecutive failures to trip (default: 5)
  resetTimeoutMs: number;     // Time in OPEN state before trying again (default: 60_000)
  name: string;               // For logging: "scrydex", "ebay", "exchange_rate"
}
```

- **Scrydex circuit open:** Reduce sync frequency. Dashboard and matching continue from local card index. Alert operator.
- **eBay circuit open:** Pause scanning, show countdown to next retry. Resume automatically when half-open test succeeds.
- **Exchange rate circuit open:** Use last known rate (stored in DB with timestamp). **Halt deal creation if rate is >6 hours stale** — do not fall back to a hardcoded rate. The beta's hardcoded 1.27 fallback was a critical bug: a 5% exchange rate error on a £500 card is £25.
- **All healthy:** Normal operation.

The critical insight: **eBay rate limits are now the only bottleneck.** Scrydex budget is no longer a constraining factor for scan throughput.

#### Secrets & Environment Variables

All API credentials are stored as **Railway environment variables** — never committed to the GitHub repository. The application reads them via `process.env` at startup.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Railway-managed PostgreSQL connection string (auto-injected by Railway) |
| `SCRYDEX_API_KEY` | Scrydex API key |
| `SCRYDEX_TEAM_ID` | Scrydex team identifier |
| `EBAY_CLIENT_ID` | eBay OAuth client ID |
| `EBAY_CLIENT_SECRET` | eBay OAuth client secret |
| `EBAY_REFRESH_TOKEN` | eBay long-lived refresh token |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (optional) |
| `TELEGRAM_CHAT_ID` | Telegram chat ID (optional) |
| `EXCHANGE_RATE_API_KEY` | Currency conversion API key |
| `DASHBOARD_SECRET` | Bearer token for private API endpoints |
| `NODE_ENV` | `production` on Railway, `development` locally |
| `PORT` | HTTP port (Railway injects this automatically) |

**Local development** uses a `.env` file (git-ignored). Railway's environment variable UI handles production secrets. No secrets in code, no secrets in Docker images.

**Startup validation:** All required environment variables are validated at boot using a schema (e.g., Zod). If any required variable is missing or malformed, the process exits immediately with a clear error — not a cryptic runtime crash minutes later.

```typescript
// src/infra/config.ts — Validated at process start, before any service initializes
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SCRYDEX_API_KEY: z.string().min(1),
  SCRYDEX_TEAM_ID: z.string().min(1),
  EBAY_CLIENT_ID: z.string().min(1),
  EBAY_CLIENT_SECRET: z.string().min(1),
  EBAY_REFRESH_TOKEN: z.string().min(1),
  DASHBOARD_SECRET: z.string().min(32, 'Dashboard secret must be at least 32 characters'),
  // Optional services — scanner works without them
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  EXCHANGE_RATE_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
});

// Parse once, export typed config. If invalid, process.exit(1) with details.
export const config = envSchema.parse(process.env);
```

**Principle:** Fail fast and loud on misconfiguration. A missing API key should crash at boot with `"SCRYDEX_API_KEY is required"`, not 3 hours later with `"Cannot read property 'headers' of undefined"`.

---

### 2.3 Scrydex Card Index

This is the heart of the Scrydex-first architecture. A background service builds and maintains a **complete local database of every English Pokemon card with current prices.** Matching happens against this local index — not via live API calls.

#### Card Index Schema

```typescript
interface LocalCard {
  scrydexCardId: string;       // Canonical Scrydex card ID
  name: string;                // e.g., "Charizard ex"
  number: string;              // e.g., "6", "TG07", "SV65"
  numberNormalized: string;    // Stripped prefixes, no leading zeros: "6", "7", "65"
  expansionId: string;         // FK → LocalExpansion
  expansionName: string;       // Denormalized for fast access
  expansionCode: string;       // e.g., "sv8"
  printedTotal: number;        // Denominator: /162
  rarity: string | null;
  supertype: string | null;    // "Pokémon", "Trainer", "Energy"
  subtypes: string[];          // ["Stage 2", "ex"], ["Item"], etc.
  artist: string | null;
  images: {                    // Included in sync response — no extra credit
    small: string | null;      // e.g., "https://images.scrydex.com/pokemon/sv8-6/small"
    medium: string | null;
    large: string | null;
  };
  variants: LocalVariant[];
  lastSyncedAt: Date;
}

interface LocalVariant {
  name: string;                // e.g., "holofoil", "reverseHolofoil", "normal"
  images: {                    // Variant-specific images (may differ from card images)
    small: string | null;
    medium: string | null;
    large: string | null;
  };
  prices: LocalVariantPrices;
  lastPriceUpdate: Date;
}

interface LocalVariantPrices {
  // Per-condition pricing (NM, LP, MP, HP)
  conditions: Record<string, {
    low: number | null;        // USD — lowest known sale
    market: number | null;     // USD — market average
    trends: {                  // Price movement data
      days_1: { priceChange: number; percentChange: number } | null;
      days_7: { priceChange: number; percentChange: number } | null;
      days_30: { priceChange: number; percentChange: number } | null;
      days_90: { priceChange: number; percentChange: number } | null;
    };
  }>;
  // Graded pricing (PSA 10, PSA 9, CGC 9.5, etc.)
  graded: Record<string, {     // key: "PSA 10", "CGC 9.5", etc.
    low: number | null;
    mid: number | null;
    high: number | null;
    market: number | null;
  }> | null;
}

interface LocalExpansion {
  scrydexId: string;           // Canonical Scrydex ID — single source of truth
  name: string;
  code: string;
  series: string;
  printedTotal: number;
  total: number;               // Including secret rares
  releaseDate: Date;
  languageCode: string;
  logo: string | null;          // Expansion logo URL from Scrydex CDN
  symbol: string | null;        // Expansion symbol URL from Scrydex CDN
  lastSyncedAt: Date;
}
```

**Images are free.** Card images (small/medium/large), variant images, expansion logos, and expansion symbols are all returned as CDN URLs in the standard API response. No extra credits, no extra requests. We store the URLs in the local DB and reference them directly from the Scrydex CDN — no need to download or cache the actual image files.

#### PostgreSQL Schema

The TypeScript interfaces above map to these PostgreSQL tables. This is the authoritative schema — the TypeScript types are generated from or validated against it.

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- Trigram similarity for fuzzy name matching
CREATE EXTENSION IF NOT EXISTS btree_gin; -- GIN index support for composite queries

-- Expansions: ~350 rows, synced daily
CREATE TABLE expansions (
  scrydex_id      TEXT PRIMARY KEY,            -- Canonical Scrydex ID (e.g., "sv8")
  name            TEXT NOT NULL,               -- "Surging Sparks"
  code            TEXT NOT NULL,               -- "sv8"
  series          TEXT NOT NULL,               -- "Scarlet & Violet"
  printed_total   INTEGER NOT NULL,
  total           INTEGER NOT NULL,            -- Including secret rares
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

-- Cards: ~35,000 rows, synced weekly (hot sets daily)
CREATE TABLE cards (
  scrydex_card_id   TEXT PRIMARY KEY,
  name              TEXT NOT NULL,             -- "Charizard ex"
  number            TEXT NOT NULL,             -- "6", "TG07", "SV65"
  number_normalized TEXT NOT NULL,             -- "6", "7", "65" (prefix-stripped, no leading zeros)
  expansion_id      TEXT NOT NULL REFERENCES expansions(scrydex_id),
  expansion_name    TEXT NOT NULL,             -- Denormalized for query performance
  expansion_code    TEXT NOT NULL,             -- Denormalized
  printed_total     INTEGER NOT NULL,
  rarity            TEXT,
  supertype         TEXT,                      -- "Pokémon", "Trainer", "Energy"
  subtypes          TEXT[] DEFAULT '{}',       -- {"Stage 2", "ex"}
  artist            TEXT,
  image_small       TEXT,
  image_medium      TEXT,
  image_large       TEXT,
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core matching indexes (these power the number-first lookup strategy)
CREATE INDEX idx_cards_number_norm ON cards (number_normalized);
CREATE INDEX idx_cards_number_printed ON cards (number_normalized, printed_total);
CREATE INDEX idx_cards_expansion ON cards (expansion_id);
CREATE INDEX idx_cards_number_expansion ON cards (number, expansion_id);
CREATE INDEX idx_cards_name_trgm ON cards USING GIN (name gin_trgm_ops);

-- Variants: ~70,000 rows (avg 2 variants per card)
-- Stored as separate rows, not JSONB, for direct query access
CREATE TABLE variants (
  id              SERIAL PRIMARY KEY,
  card_id         TEXT NOT NULL REFERENCES cards(scrydex_card_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,               -- "holofoil", "reverseHolofoil", "normal"
  image_small     TEXT,
  image_medium    TEXT,
  image_large     TEXT,
  -- Prices stored per-condition as JSONB for flexibility
  -- Structure: { "NM": { "low": 1.50, "market": 2.00, "trends": {...} }, "LP": {...} }
  prices          JSONB NOT NULL DEFAULT '{}',
  -- Graded prices: { "PSA 10": { "low": 50, "mid": 75, "high": 100, "market": 80 } }
  graded_prices   JSONB,
  last_price_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, name)
);

CREATE INDEX idx_variants_card ON variants (card_id);
CREATE INDEX idx_variants_prices ON variants USING GIN (prices);

-- Deals: arbitrage opportunities found by the scanner
CREATE TABLE deals (
  deal_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ebay_item_id      TEXT NOT NULL,
  ebay_title        TEXT NOT NULL,
  card_id           TEXT REFERENCES cards(scrydex_card_id),
  variant_id        INTEGER REFERENCES variants(id),
  -- Pricing snapshot (frozen at deal creation — does not change with future syncs)
  ebay_price_gbp    NUMERIC(10,2) NOT NULL,
  ebay_shipping_gbp NUMERIC(10,2) NOT NULL DEFAULT 0,
  scrydex_price_usd NUMERIC(10,2),
  exchange_rate     NUMERIC(10,6),
  market_price_gbp  NUMERIC(10,2),
  profit_gbp        NUMERIC(10,2),
  profit_percent    NUMERIC(6,2),
  tier              TEXT CHECK (tier IN ('S', 'A', 'B', 'C')),
  -- Match metadata
  confidence        NUMERIC(4,3),              -- 0.000 to 1.000
  confidence_tier   TEXT CHECK (confidence_tier IN ('high', 'medium', 'low')),
  condition         TEXT CHECK (condition IN ('NM', 'LP', 'MP', 'HP')),
  condition_source  TEXT,
  liquidity_score   NUMERIC(4,3),
  liquidity_grade   TEXT CHECK (liquidity_grade IN ('high', 'medium', 'low', 'illiquid')),
  -- Signals snapshot (for audit/debugging)
  match_signals     JSONB NOT NULL,            -- Full NormalizedListing + MatchResult
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
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deals_created ON deals (created_at DESC);
CREATE INDEX idx_deals_tier ON deals (tier);
CREATE INDEX idx_deals_ebay_item ON deals (ebay_item_id);
CREATE INDEX idx_deals_card ON deals (card_id);
CREATE UNIQUE INDEX idx_deals_dedup ON deals (ebay_item_id, card_id, variant_id);

-- Sales velocity cache (from Scrydex /listings endpoint, 3 credits per call)
CREATE TABLE sales_velocity_cache (
  card_id         TEXT NOT NULL REFERENCES cards(scrydex_card_id),
  variant_name    TEXT NOT NULL,
  sales_7d        INTEGER NOT NULL DEFAULT 0,
  sales_30d       INTEGER NOT NULL DEFAULT 0,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (card_id, variant_name)
);

-- Exchange rate history (never rely on hardcoded fallback)
CREATE TABLE exchange_rates (
  id              SERIAL PRIMARY KEY,
  from_currency   TEXT NOT NULL DEFAULT 'USD',
  to_currency     TEXT NOT NULL DEFAULT 'GBP',
  rate            NUMERIC(10,6) NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exchange_rates_latest ON exchange_rates (from_currency, to_currency, fetched_at DESC);

-- User preferences (single-user for v1)
CREATE TABLE preferences (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Singleton row
  data            JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync log: track every sync operation for debugging and monitoring
CREATE TABLE sync_log (
  id              SERIAL PRIMARY KEY,
  sync_type       TEXT NOT NULL,              -- 'full', 'delta', 'expansion', 'manual'
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  expansions_synced INTEGER DEFAULT 0,
  cards_upserted    INTEGER DEFAULT 0,
  credits_used      INTEGER DEFAULT 0,
  error_message     TEXT,
  metadata          JSONB
);
```

**Why separate tables for variants instead of JSONB on cards:** Variants need to be joined in queries (e.g., "find all cards where the holofoil NM market price > $50"). JSONB queries are possible but slower and harder to index. Separate rows enable standard SQL joins and straightforward indexing.

**Why `NUMERIC` for prices instead of `INTEGER` cents:** PostgreSQL `NUMERIC` is exact decimal arithmetic — no floating point errors on currency. Storing as cents with integer math is also valid, but `NUMERIC(10,2)` is more readable in queries and psql output.

**Migration strategy:** Use a migration tool (e.g., `node-pg-migrate` or `drizzle-kit`) that tracks applied migrations in a `pgmigrations` table. Each migration is a numbered SQL file in `src/database/migrations/`. Migrations run at boot before any other initialization.

#### Sync Strategies

**Initial full sync (one-time, ~400 credits):**

**Important: Scrydex charges 1 credit per API request (per page), NOT per card.** A single request returning 100 cards costs the same 1 credit as a request returning 1 card. This is what makes the full sync economically viable.

```
1. Fetch all EN expansions:
   GET /pokemon/v1/expansions?q=language_code:EN&page_size=100
   → ~350 expansions / 100 per page = ~4 requests = 4 credits

2. For each expansion, fetch all cards with prices:
   GET /pokemon/v1/cards?q=expansion.id:{id}&include=prices&page_size=100
   → ~350 expansions × ~1 page avg = ~350 requests = ~350 credits
   (Large sets like SV 151 with 200+ cards need 2-3 pages)

Total: ~400 requests = ~400 credits for the ENTIRE English card catalog
       including current prices, trend data, and image URLs.

NOT 40,000 credits — each page of up to 100 cards costs just 1 credit.
```

**Weekly full resync (~400 credits):**

Re-fetch everything to catch price movements, new printings, and corrections. Run during off-peak hours (e.g., 03:00 UK time Sunday). Upsert into the local DB — don't delete/recreate. Scheduling is handled in-process using `node-cron` (or similar) — the Railway service runs continuously, so cron-style scheduling works naturally. If the service restarts mid-sync, the scheduler re-registers on boot and the next scheduled window triggers a full resync.

**Sync idempotency and error recovery:**

Syncs MUST be idempotent and resumable. A sync interrupted at any point (process crash, API error, Railway restart) must be safely re-runnable without data corruption.

```typescript
// Every sync operation follows this pattern:
async function syncExpansionCards(expansionId: string, syncLogId: number): Promise<SyncResult> {
  let page = 1;
  let totalUpserted = 0;
  let creditsUsed = 0;

  while (true) {
    // 1. Fetch one page from Scrydex
    const response = await scrydex.getCards({
      q: `expansion.id:${expansionId}`,
      include: 'prices',
      page_size: 100,
      page,
    });
    creditsUsed++;

    // 2. Upsert cards + variants in a single transaction
    //    ON CONFLICT (scrydex_card_id) DO UPDATE — idempotent
    const upserted = await db.transaction(async (tx) => {
      let count = 0;
      for (const card of response.data) {
        await tx.upsertCard(mapToLocalCard(card));
        for (const variant of card.variants) {
          await tx.upsertVariant(mapToLocalVariant(card.id, variant));
        }
        count++;
      }
      return count;
    });
    totalUpserted += upserted;

    // 3. Update sync progress (allows monitoring mid-sync)
    await db.updateSyncLog(syncLogId, { cards_upserted: totalUpserted, credits_used: creditsUsed });

    // 4. Check if more pages exist
    if (!response.hasMore) break;
    page++;

    // 5. Courtesy delay between pages
    await delay(50);
  }

  return { totalUpserted, creditsUsed };
}
```

**Key sync rules:**
- All card/variant writes use `INSERT ... ON CONFLICT DO UPDATE` (PostgreSQL upsert) — re-running the same sync is always safe
- Each expansion is synced independently — if expansion #50 fails, expansions #1-49 are committed and don't need re-syncing
- The `sync_log` table tracks progress so the dashboard can show "Syncing: 150/350 expansions..."
- Sync never deletes cards — if a card disappears from Scrydex (rare), it stays in local DB with a stale `last_synced_at`. A separate cleanup job can prune cards not seen in 90+ days
- Transactions are per-expansion-page, not per-sync — keeps transaction duration short (<1s)

**What `?include=prices` returns per card:**
- `low` — lowest known sale price (USD)
- `market` — average market price (USD)
- `trends` — price change data for 1, 7, 14, 30, 90, and 180-day windows (both absolute and percentage)
- Per condition (NM, LP, MP, HP) and per variant (holofoil, reverseHolofoil, etc.)
- All included in the same 1-credit request — no extra cost

This means the local DB always has current market prices AND historical trend data for every card, refreshed weekly.

**Daily hot-set refresh (~50 credits):**

Only re-fetch the 10 most recently released expansions (where prices are most volatile). These are the sets most likely to have arbitrage opportunities. This keeps prices on new sets no more than ~24 hours stale.

```typescript
async function dailyHotRefresh(db: Database, scrydex: ScrydexClient) {
  const recentSets = await db.getExpansions({
    orderBy: 'releaseDate DESC',
    limit: 10,
  });
  for (const set of recentSets) {
    await syncCardsForExpansion(db, scrydex, set.scrydexId);
    await delay(50); // Rate limit courtesy
  }
}
```

**Expansion catalog sync (daily, ~4 credits):**

Check for new expansions added to Scrydex. If a new expansion appears, trigger a full card sync for that expansion only.

#### Search Indexes

Indexes are defined in the PostgreSQL DDL above (§2.3 PostgreSQL Schema). The key indexes that power matching:

| Index | SQL | Purpose |
|---|---|---|
| Number + printed total | `idx_cards_number_printed` | Number-first matching: "all cards numbered 6 in sets with ~162 cards" |
| Number + expansion | `idx_cards_number_expansion` | Direct lookup: "card #6 in expansion X" |
| Normalized number | `idx_cards_number_norm` | Prefix-agnostic: "65" matches SV65, TG65, 065 |
| Name trigram (GIN) | `idx_cards_name_trgm` | Fuzzy name: `similarity('Charzard', name) > 0.4` |
| Expansion name trigram | `idx_expansions_name_trgm` | Fuzzy set name: "Surging Spark" finds "Surging Sparks" |

With `pg_trgm` GIN indexes, fuzzy name queries execute in <5ms on 35,000 cards — orders of magnitude faster than a live API call. Use `similarity()` for ranking and `%` operator for index-accelerated filtering.

**Example matching query (number + denominator strategy):**
```sql
SELECT c.*, v.name as variant_name, v.prices
FROM cards c
JOIN variants v ON v.card_id = c.scrydex_card_id
WHERE c.number_normalized = '6'
  AND c.printed_total BETWEEN 157 AND 167  -- ±5 tolerance
ORDER BY similarity(c.name, 'Charizard ex') DESC
LIMIT 10;
-- Executes in <2ms with proper indexes
```

#### eBay Poller

Responsibility: Fetch new listings from eBay Browse API and emit raw `EbayListing` objects. Unchanged from the beta's role, but simplified because it no longer triggers Scrydex calls.

```typescript
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

**Key changes from beta:**
- Extract and preserve `itemSpecifics` / `localizedAspects` — fields like "Card Name", "Set", "Card Number" are often available as structured seller-provided data
- Poller emits events (or pushes to a queue) rather than calling the engine directly
- Can now use `limit=200` per search since matching is free (local DB lookups)
- No Scrydex credit budget management needed — matching costs zero credits

---

### 2.4 Signal Extraction

Before matching against the local card index, we extract **signals from multiple sources** on each eBay listing and merge them into a normalized form. This is the same multi-signal approach but now feeds into local DB queries, not live API calls.

#### Step 1: Title Parser

**Fundamental departure from beta:** The beta's title parser was a monolithic 1,447-line class with 50+ regexes executed sequentially. Patterns overlapped, precedence was fragile, and new card formats required code changes. The redesign replaces this with a **phased pipeline** where each phase has a single responsibility and produces typed, testable output.

```typescript
interface TitleSignals {
  cardName: { value: string; confidence: number } | null;
  cardNumber: { value: string; raw: string; confidence: number } | null;
  denominator: { value: number; confidence: number } | null;
  setName: { value: string; confidence: number } | null;
  setCode: { value: string; confidence: number } | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  variant: VariantSignals;
  language: string;
  isFirstEdition: boolean;
  isShadowless: boolean;
  isJunk: boolean;    // Lot, bundle, empty tin, etc.
  isFake: boolean;    // Proxy, custom, orica, etc.
}
```

**Parsing pipeline — 5 phases, each independently testable:**

```
Phase 1: Clean       → Remove noise (emoji, HTML, seller junk, normalize Unicode)
Phase 2: Classify    → Early-exit detection (junk, fake, non-English, lot/bundle)
Phase 3: Extract     → Pull structured tokens (card number, grading, variant flags)
Phase 4: Identify    → Match remaining tokens against local DB (name, set)
Phase 5: Assemble    → Combine extractions into TitleSignals with per-field confidence
```

**Phase 1 — Cleaning (pure string transform, no regex matching):**
```typescript
function cleanTitle(raw: string): string {
  let title = raw;
  // 1. Unicode normalization (NFC — composed form, handles accented chars)
  title = title.normalize('NFC');
  // 2. Strip emoji (Unicode emoji ranges, not a hardcoded list)
  title = title.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
  // 3. Decode HTML entities (&amp; → &, &#39; → ')
  title = decodeHTMLEntities(title);
  // 4. Normalize quotes (smart quotes → straight quotes)
  title = title.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // 5. Strip parenthetical noise: "(read description)", "(see photos)", etc.
  title = title.replace(/\((?:read|see|check|look|view)\b[^)]*\)/gi, '');
  // 6. Collapse multiple spaces to single space, trim
  title = title.replace(/\s+/g, ' ').trim();
  return title;
}
```

**Phase 2 — Classification (early exit to save processing):**
```typescript
// Junk detection uses a compiled RegExp from a data-driven list, not inline patterns
const JUNK_PATTERNS = [
  /\b(lot|bundle|collection|bulk|set of \d+|job lot)\b/i,
  /\b(empty|tin only|box only|no cards|etb|booster)\b/i,
  /\b(sleeve|binder|toploader|penny|protector)\b/i,
];
const FAKE_PATTERNS = [
  /\b(proxy|proxies|custom|orica|fake|replica|fan\s*made|unofficial)\b/i,
];
// Non-English detection: title contains CJK characters or explicit language markers
const NON_ENGLISH_PATTERNS = [
  /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FFF]/,
  /\b(japanese|japan|jpn|korean|kor|chinese|french|german|italian|spanish)\b/i,
];
```

**Phase 3 — Structured extraction (card number is king):**

Card number extraction is the highest-value parse. The redesign uses a **prioritized pattern array loaded from config** instead of 17 inline regexes:

```typescript
// src/domain/extraction/patterns/card-number.ts
// Patterns are tried in order. First match wins. Each pattern produces typed output.
interface NumberPattern {
  name: string;                    // For logging/debugging
  regex: RegExp;
  extract: (match: RegExpMatchArray) => {
    number: string;
    denominator?: number;
    prefix?: string;               // "SV", "TG", "GG", etc.
    confidence: number;            // How reliable this pattern is (0.0-1.0)
  };
}

const CARD_NUMBER_PATTERNS: NumberPattern[] = [
  // Highest confidence: explicit number/denominator format
  {
    name: 'standard_with_denominator',
    regex: /\b(\d{1,4})\s*[\/\\]\s*(\d{1,4})\b/,
    extract: (m) => ({
      number: m[1], denominator: parseInt(m[2]), confidence: 0.95,
    }),
  },
  {
    name: 'prefixed_with_denominator',  // "SV065/198", "TG07/30"
    regex: /\b([A-Z]{1,4})(\d{1,4})\s*[\/\\]\s*(\d{1,4})\b/,
    extract: (m) => ({
      number: m[2].replace(/^0+/, ''), prefix: m[1],
      denominator: parseInt(m[3]), confidence: 0.95,
    }),
  },
  {
    name: 'hash_format',  // "#123" or "# 123"
    regex: /(?:^|\s)#\s*(\d{1,4})\b/,
    extract: (m) => ({ number: m[1], confidence: 0.80 }),
  },
  // ... additional patterns loaded from config, not hardcoded
];
```

**Why this is better than beta:** Each pattern is a named, self-documenting unit with an explicit confidence score. Adding a new format means appending to the array — not inserting into a fragile priority chain. Patterns can be loaded from a JSON config file at startup, enabling updates without code changes.

**Phase 4 — DB-driven identification (no hardcoded Pokemon name lists):**

The beta maintained a hardcoded list of ~300 Pokemon names and 9 era-specific set name regexes. This drifted from reality as new cards were released. The redesign replaces ALL hardcoded name/set lists with lookups against the local card index.

```typescript
// After phases 1-3, we have a cleaned title with card number extracted.
// Remaining tokens are candidate name/set fragments.

function identifyCardName(
  tokens: string[],       // Title tokens after number + noise removal
  db: CardNameIndex,      // Pre-loaded from PostgreSQL: Set<string> of all card names
): { value: string; confidence: number } | null {
  // Strategy 1: Try progressively shorter token windows against the card name index
  // "Charizard ex Obsidian Flames" → try "Charizard ex Obsidian Flames",
  //   then "Charizard ex Obsidian", then "Charizard ex", then "Charizard"
  for (let windowSize = Math.min(tokens.length, 5); windowSize >= 1; windowSize--) {
    for (let start = 0; start <= tokens.length - windowSize; start++) {
      const candidate = tokens.slice(start, start + windowSize).join(' ');
      // Use pg_trgm similarity threshold, not exact match
      const match = db.findBySimilarity(candidate, threshold: 0.6);
      if (match) {
        return { value: match.name, confidence: match.similarity };
      }
    }
  }
  return null;
}

function identifySetName(
  tokens: string[],
  db: ExpansionNameIndex,  // Pre-loaded: all expansion names + codes
): { value: string; confidence: number } | null {
  // Same sliding window approach against expansion catalog
  // This replaces the beta's 9 era-specific regexes with a single DB lookup
  // ...
}
```

**Pre-loaded indexes for title matching:** At boot, load all unique card names and expansion names from PostgreSQL into in-memory `Set<string>` structures for fast lookup during title parsing. These are refreshed when the card index syncs. This is O(1) lookup vs the beta's O(n) regex scan across 300+ names.

**Improvements over beta:**
- **Per-field confidence** instead of a single score. `"123/456"` gives high-confidence number AND denominator, while a name extracted by sliding window gets confidence proportional to the `pg_trgm` similarity score
- **Regex patterns are data-driven.** Card number patterns are defined as typed objects loaded from config, not inline regexes
- **Pokemon name matching uses the local card index** — trigram similarity against all ~35,000 card names, not a hardcoded ~300 name list
- **Set name matching uses the local expansion catalog** — fuzzy match against the expansion table, not 9 era-specific regexes
- **Cleaning is a separate phase** — emoji/Unicode/noise stripping runs first, independently testable, so downstream phases see clean input
- **Early exit on junk** — lots, bundles, fakes, non-English cards are rejected in phase 2 before any expensive matching
- **No name correction map** — the beta had 80+ hardcoded misspelling corrections. Trigram similarity handles misspellings naturally: `"Charzard"` has >0.6 similarity to `"Charizard"`

#### Step 2: Condition Mapper

The beta's condition mapping cascade (descriptors → specifics → title → default) was structurally sound. We keep the priority order but fix two issues: (1) the beta used exact-match string lookups that missed partial matches like "Near Mint or Better - Factory Sealed", and (2) the default to LP is too generous — it should be a conservative default with a confidence penalty.

```typescript
interface ConditionResult {
  condition: ScrydexCondition;  // 'NM' | 'LP' | 'MP' | 'HP'
  source: 'condition_descriptor' | 'item_specifics' | 'title' | 'default';
  rawValue: string | null;
  blocked: boolean;             // true = damaged/creased, skip entirely
}

// Priority 1: conditionDescriptors (most reliable — numeric eBay IDs)
// eBay's PRODUCT fieldgroup returns structured condition for trading cards
const DESCRIPTOR_MAP: Record<string, ScrydexCondition> = {
  '400010': 'NM',   // Near Mint or Better
  '400015': 'LP',   // Lightly Played (Excellent)
  '400016': 'MP',   // Moderately Played (Very Good)
  '400017': 'HP',   // Heavily Played (Poor)
};

// Priority 2: localizedAspects (seller-provided structured data)
const ASPECT_CONDITION_MAP: Record<string, ScrydexCondition> = {
  'near mint or better': 'NM',
  'near mint': 'NM',
  'lightly played (excellent)': 'LP',
  'lightly played': 'LP',
  'moderately played (very good)': 'MP',
  'moderately played': 'MP',
  'heavily played (poor)': 'HP',
  'heavily played': 'HP',
  // ...
};

// Priority 3: Title regex (last resort)
// Priority 4: Default to 'LP' (conservative — undervalues slightly) with confidence penalty

// IMPROVEMENT over beta: Use .startsWith() / .includes() matching instead of exact match
// "Near Mint or Better - Factory Sealed" starts with "near mint or better" → maps to NM
// Beta's exact match would miss this.
```

**Why this matters for pricing:** The local card index stores prices per-condition. A NM Charizard might be $200 while an LP copy is $120. Using the wrong condition means the profit calculation is wrong.

**Default condition handling:** When no condition source is available, default to LP (conservative — slightly undervalues) BUT apply a confidence penalty of -0.05 to the composite score. This ensures deals relying on a guessed condition are ranked lower than deals with explicit condition data.

**Blocked conditions** — skip damaged/creased cards entirely:
```typescript
const BLOCKED_PATTERNS = [
  /\b(damaged|dmg|heavily?\s*damaged)\b/i,
  /\b(creased?|crease[sd]?)\b/i,
  /\b(water\s*damage[d]?|water\s*stain)\b/i,
  /\b(torn|ripped|bent|warped)\b/i,
  /\b(poor|destroyed|trashed)\b/i,
];
// Use regex patterns instead of exact substring match — handles plurals, tenses
```

**eBay API requirement:** To get `conditionDescriptors`, the search request MUST include `fieldgroups=EXTENDED,PRODUCT`. This replaces the beta's approach of making per-item enrichment calls.

#### Step 3: Structured Data Extractor

New component that extracts signals from eBay's structured fields (via `localizedAspects` from the `EXTENDED` fieldgroup):

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

#### Step 4: Signal Merger

Combines title-parsed signals, condition mapping, and structured signals into a single `NormalizedListing`:

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

### 2.5 Local Index Matching

The matching engine takes a `NormalizedListing` and returns a `MatchResult` by querying the **local card index** — not Scrydex. It is a pure function: given the same inputs and local DB state, it produces the same output. It costs **zero API credits** per listing.

This inverts the beta's approach:
- **Beta:** Guess expansion first → query Scrydex by expansion + number → cascade through 6 fallbacks
- **Redesign:** Extract number first → query local DB for all cards with that number → disambiguate by denominator + name + expansion signals

#### Stage 1: Number-First Candidate Lookup

Card numbers are the most reliable signal in eBay titles. A listing saying `"123/456"` gives us two strong signals: number=123 and denominator=456. We use these to query the local card index directly.

```typescript
interface CandidateLookupResult {
  candidates: LocalCard[];
  method: 'number_and_denominator' | 'number_only' | 'name_search' | 'none';
  narrowingApplied: string[];
}

function findCandidates(listing: NormalizedListing, db: CardIndex): CandidateLookupResult {
  const { cardNumber, denominator, setName, setCode, cardName } = listing;

  // Strategy 1: Number + denominator (most specific, typical case)
  if (cardNumber && denominator) {
    // Query: all cards where number="123" AND expansion.printedTotal ≈ 456
    const candidates = db.findByNumberAndDenominator(
      cardNumber,
      denominator,
      tolerance: 5  // ±5 for secret rares beyond printed total
    );
    if (candidates.length > 0) {
      return { candidates, method: 'number_and_denominator', narrowingApplied: ['number', 'denominator'] };
    }
  }

  // Strategy 2: Number + expansion signal (when denominator is missing)
  if (cardNumber && (setName || setCode)) {
    const expansion = resolveExpansion(setName, setCode, db);
    if (expansion) {
      const candidates = db.findByNumberAndExpansion(cardNumber, expansion.scrydexId);
      if (candidates.length > 0) {
        return { candidates, method: 'number_only', narrowingApplied: ['number', 'expansion'] };
      }
    }
  }

  // Strategy 3: Number only (broad — may return many candidates)
  if (cardNumber) {
    const candidates = db.findByNumber(cardNumber);
    if (candidates.length > 0 && candidates.length <= 50) {
      return { candidates, method: 'number_only', narrowingApplied: ['number'] };
    }
  }

  // Strategy 4: Name search (last resort — no card number extracted)
  if (cardName) {
    const candidates = db.searchByName(cardName, limit: 20);
    return { candidates, method: 'name_search', narrowingApplied: ['name'] };
  }

  return { candidates: [], method: 'none', narrowingApplied: [] };
}
```

**Why number-first beats expansion-first:**
- Card numbers are unambiguous in eBay titles: `"123/456"` is a regex, not a fuzzy match
- The beta's expansion-first approach required guessing the set from free text, then querying Scrydex live. If the set guess was wrong, every subsequent step failed
- Number + denominator alone narrows to 1-3 candidate cards in most cases, because few sets share the same printed total
- No API credits consumed — it's a local DB query

#### Stage 2: Candidate Disambiguation

With candidates returned, we score each one against all available signals:

```typescript
interface ScoredCandidate {
  card: LocalCard;
  scores: {
    numberMatch: number;       // 1.0 if exact, 0.9 if normalized match
    denominatorMatch: number;  // 1.0 if exact, scaled by distance
    nameMatch: number;         // Levenshtein similarity (0.0-1.0)
    expansionMatch: number;    // How well the set signal matches
  };
  composite: number;
}

function disambiguate(
  candidates: LocalCard[],
  listing: NormalizedListing,
): ScoredCandidate[] {
  return candidates
    .map(card => {
      const nameScore = listing.cardName
        ? validateNameMatch(listing.cardName, card.name)
        : 0.5;  // No name signal = neutral

      const denomScore = listing.denominator
        ? scoreDenominator(listing.denominator, card.printedTotal)
        : 0.5;

      const expScore = scoreExpansionMatch(listing, card);

      // Weighted geometric mean — any single zero score makes the whole product zero.
      // To avoid this, floor all scores at 0.01 (effectively -∞ in log space).
      // This means a zero score drags the composite very low but doesn't annihilate it.
      const composite = weightedGeometricMean({
        numberMatch: { score: 1.0, weight: 0.15 },  // Already filtered by number
        denominatorMatch: { score: denomScore, weight: 0.25 },
        nameMatch: { score: nameScore, weight: 0.40 },       // Most important signal
        expansionMatch: { score: expScore, weight: 0.20 },
      });

      return { card, scores: { numberMatch: 1.0, denominatorMatch: denomScore, nameMatch: nameScore, expansionMatch: expScore }, composite };
    })
    .filter(c => c.scores.nameMatch >= 0.60)  // Hard floor: reject if name similarity < 0.60
    .sort((a, b) => b.composite - a.composite);
}
```

**Name validation is mandatory, not optional:**

```typescript
function validateNameMatch(parsedName: string, cardName: string): number {
  const normalizedParsed = normalizeName(parsedName);
  const normalizedCard = normalizeName(cardName);

  // Exact match after normalization
  if (normalizedParsed === normalizedCard) return 1.0;

  // One contains the other — but PENALIZE the direction that drops a suffix.
  // "Pikachu" matching "Pikachu V" is a DANGEROUS match — these are different cards.
  // "Pikachu V" matching "Pikachu" is safe (title has more info than needed).
  if (normalizedParsed.startsWith(normalizedCard)) {
    return 0.80;  // Parsed name is LONGER than card name — safe, title has extra tokens
  }
  if (normalizedCard.startsWith(normalizedParsed)) {
    return 0.65;  // Parsed name is SHORTER — might be missing a critical suffix (V, ex, VMAX)
  }

  // Use Jaro-Winkler distance instead of Levenshtein.
  // Jaro-Winkler is specifically designed for short strings (names) and gives higher
  // scores to strings that match from the beginning — ideal for card names where
  // the base Pokemon name is the prefix and the variant suffix differs.
  // Levenshtein treats all positions equally, which is wrong for "Pikachu" vs "Pikachu VMAX".
  return jaroWinklerSimilarity(normalizedParsed, normalizedCard);
}

// Name normalization: lowercase, strip diacritics, normalize spacing, remove punctuation
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Strip diacritics: é → e
    .replace(/['']/g, '')                                // Remove apostrophes
    .replace(/[-–—]/g, ' ')                              // Hyphens → spaces
    .replace(/[^a-z0-9 ]/g, '')                          // Strip remaining punctuation
    .replace(/\s+/g, ' ')                                // Collapse whitespace
    .trim();
}
```

**Why Jaro-Winkler over Levenshtein:** For card name matching, the beginning of the name is the most important part. "Charizard ex" vs "Charizard V" share the prefix "Charizard" but are completely different cards. Jaro-Winkler's prefix weighting correctly assigns higher similarity to shared prefixes. Levenshtein gives a misleadingly high score (1 edit distance) for names that are semantically very different. Additionally, Jaro-Winkler handles transpositions (common in typos) better than Levenshtein.

**Substring matching is asymmetric:** The beta treated "Pikachu" matching "Pikachu V" the same as "Pikachu V" matching "Pikachu". These are fundamentally different cases. If the title says "Pikachu" but the card is "Pikachu V", the listing might be for a completely different card. If the title says "Pikachu V Special Art" but the card is "Pikachu V", the title just has extra descriptive text. The redesign scores these differently.

**Minimum name similarity: 0.60** (up from beta's 0.25-0.30). This is the single most impactful change for accuracy. At the local-index scale, we can afford to be strict — rejecting a candidate costs nothing (no wasted API credit), and the correct card is almost certainly in the candidate set if the number was right.

**Performance guard:** Cap candidate lists at 50 entries before disambiguation scoring. If a number-only lookup returns >50 candidates (e.g., card number "1" exists in every expansion), skip disambiguation and return no match — the signals are too weak. This prevents O(n²) scoring on ambiguous lookups.

#### Stage 3: Expansion Cross-Validation

If the top candidate scores well on name but the listing also has expansion signals, cross-validate:

```typescript
function crossValidateExpansion(
  topCandidate: ScoredCandidate,
  listing: NormalizedListing,
  db: CardIndex,
): { validated: boolean; confidenceAdjust: number } {
  if (!listing.setName && !listing.setCode && !listing.denominator) {
    return { validated: false, confidenceAdjust: 0 };  // No signal to validate against
  }

  const card = topCandidate.card;

  // Denominator check
  if (listing.denominator) {
    const denomDiff = Math.abs(listing.denominator - card.printedTotal);
    if (denomDiff <= 5) return { validated: true, confidenceAdjust: +0.10 };
    if (denomDiff > 15) return { validated: false, confidenceAdjust: -0.20 };
  }

  // Expansion name/code check
  if (listing.setCode && card.expansionCode.toLowerCase() === listing.setCode.toLowerCase()) {
    return { validated: true, confidenceAdjust: +0.15 };
  }

  if (listing.setName) {
    const expNameSimilarity = levenshteinSimilarity(
      listing.setName.toLowerCase(),
      card.expansionName.toLowerCase()
    );
    if (expNameSimilarity >= 0.85) return { validated: true, confidenceAdjust: +0.10 };
    if (expNameSimilarity < 0.50) return { validated: false, confidenceAdjust: -0.15 };
  }

  return { validated: false, confidenceAdjust: 0 };
}
```

#### Stage 4: Variant Resolution

```typescript
interface VariantResolveResult {
  variant: LocalVariant | null;
  method: 'exact' | 'inferred' | 'default';
  confidence: number;
}
```

**Variant matching strategy:**

1. Build a normalized variant key from listing signals:
   ```
   [1stEdition?] + [Shadowless?] + [Holo|ReverseHolo|Normal]
   ```

2. Match against the card's local variant names using a **mapping table** (not string matching):
   ```typescript
   const VARIANT_MAP: Record<string, string[]> = {
     'holofoil': ['holofoil', 'holo', 'unlimitedHolofoil'],
     'reverseHolofoil': ['reverseHolofoil', 'reverseHolo'],
     'firstEditionHolofoil': ['firstEditionHolofoil', '1stEditionHolofoil', 'firstEditionHolo'],
     'normal': ['normal', 'unlimited', 'unlimitedNormal'],
   };
   ```

3. If no variant is detected but the card only has ONE variant with prices, use it (common for modern singles).

4. If multiple variants exist and none is detected, **default to the lowest-priced variant** (conservative) and set confidence to 0.5.

#### Composite Confidence & Match Result

```typescript
interface MatchResult {
  listing: NormalizedListing;
  card: LocalCard;
  variant: LocalVariant;

  confidence: {
    numberMatch: number;     // 0.0 - 1.0
    denominatorMatch: number;// 0.0 - 1.0
    nameMatch: number;       // 0.0 - 1.0
    expansionMatch: number;  // 0.0 - 1.0
    variant: number;         // 0.0 - 1.0
    normalization: number;   // From the signal extraction pipeline
    composite: number;       // Weighted geometric mean
  };

  method: {
    lookup: string;          // 'number_and_denominator' | 'number_only' | 'name_search'
    variant: string;         // 'exact' | 'inferred' | 'default'
  };
}

function calculateCompositeConfidence(scores: ConfidenceScores): number {
  // WHY GEOMETRIC MEAN (not arithmetic):
  // Arithmetic mean: (0.95 + 0.95 + 0.10) / 3 = 0.67 — one bad signal hides in the average
  // Geometric mean: (0.95 × 0.95 × 0.10)^(1/3) = 0.45 — one bad signal drags the whole score down
  //
  // For arbitrage, a single wrong field (wrong name, wrong set) means a wrong card.
  // Geometric mean penalizes this correctly. Arithmetic mean is too forgiving.

  const weights = {
    nameMatch: 0.30,         // Name match is the most important signal
    denominatorMatch: 0.25,  // Denominator validates the expansion implicitly
    numberMatch: 0.15,       // Usually 1.0 (filtered by number)
    expansionMatch: 0.10,    // Bonus validation signal
    variant: 0.10,
    normalization: 0.10,
  };

  // Use log-space arithmetic to avoid floating-point underflow on many small values.
  // Floor all scores at 0.01 to prevent a single zero from annihilating the product.
  let weightedLogSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const score = Math.max(scores[key as keyof ConfidenceScores], 0.01);
    weightedLogSum += weight * Math.log(score);
    totalWeight += weight;
  }

  return Math.exp(weightedLogSum / totalWeight);
}
```

**Confidence-gated processing:**

| Composite Confidence | Action |
|---|---|
| >= 0.85 | **High confidence** — process automatically, show in dashboard |
| 0.65 - 0.84 | **Medium confidence** — process but flag with warning badge |
| 0.45 - 0.64 | **Low confidence** — log for training data only, do not display as deal |
| < 0.45 | **Reject** — skip entirely |

**Critical difference from beta:** A rejected or low-confidence match costs **nothing** — no wasted API credit, no fallback cascade. The beta's 6-layer fallback existed because each miss was expensive (a wasted Scrydex credit). With local matching, we can afford to be strict and prefer "no match" over a wrong match.

---

### 2.6 Confidence Scoring & Validation

#### Validation Layers

Every match passes through explicit validation before becoming a deal. Because matching is local and free, we can apply stricter validation than the beta without worrying about wasted API credits.

```typescript
interface ValidationResult {
  passed: boolean;
  checks: {
    denominatorMatch: boolean | null;   // null = no denominator to check
    nameMatch: boolean;
    expansionLanguage: boolean;
    priceDataAvailable: boolean;
    priceDataFresh: boolean;            // Local prices not stale (< 7 days)
    exchangeRateFresh: boolean;
    sellerCountry: boolean;
  };
  failedCheck: string | null;
}
```

**Hard gates (instant rejection):**

These checks produce a binary pass/fail. If ANY hard gate fails, the match is rejected immediately with the `failedCheck` field recording which gate failed. This is logged for diagnostics but never becomes a deal.

| Gate | Threshold | Why |
|---|---|---|
| Name similarity | < 0.60 | Below this, wrong card matches are more likely than right ones |
| Expansion language | ≠ EN | Defensive check — EN-only index should prevent this |
| Seller country | ≠ GB | eBay-GB only (configurable for future markets) |
| Price data missing | Variant has no `market` price in local DB | Cannot calculate profit without a reference price |
| Price data stale | `last_synced_at` > 7 days ago | Wait for next sync rather than use stale prices |
| Exchange rate stale | Last fetched > 6 hours ago | **NEVER fall back to a hardcoded rate.** Halt deal creation and alert operator. The beta's hardcoded 1.27 GBP/USD was a critical risk. |
| eBay listing price | ≤ 0 or > £10,000 | Obvious data quality issue — reject |
| Composite confidence | < 0.45 | Below reject threshold (see confidence tiers) |

**Soft gates (confidence reduction):**

These don't reject the match, but they reduce the composite confidence score, which can drop the match into a lower confidence tier.

| Condition | Penalty | Rationale |
|---|---|---|
| Denominator mismatch within ±15 | -0.20 | Might be wrong set (secret rares can exceed printed total) |
| Name similarity 0.60-0.70 | -0.10 | Borderline match — proceed with caution |
| Only 1 narrowing signal in candidate lookup | -0.10 | Ambiguous match (e.g., number-only with no denominator or set) |
| Condition defaulted to LP | -0.05 | No explicit condition data — price comparison less reliable |
| Graded card (PSA/CGC/BGS detected) | -0.05 | Graded pricing is more complex; raw market price comparison may be misleading |
| Seller feedback < 50 | -0.03 | New/low-feedback seller — higher risk of condition misrepresentation |

#### Arbitrage Calculation

Once a match passes validation, compute profitability using local price data:

```typescript
interface ArbitrageResult {
  ebayPriceGBP: number;           // Listing price + shipping
  condition: ScrydexCondition;    // NM | LP | MP | HP (from condition mapper)
  conditionSource: string;        // How condition was determined
  scrydexPriceUSD: number;        // From local variant prices FOR THIS CONDITION
  scrydexPriceGBP: number;        // Converted at current exchange rate
  profitGBP: number;              // scrydexPriceGBP - ebayPriceGBP - fees
  profitPercent: number;
  baseTier: 'S' | 'A' | 'B' | 'C';   // Tier from profit thresholds alone
  tier: 'S' | 'A' | 'B' | 'C';       // Final tier after liquidity adjustment (§2.7)
  exchangeRate: number;
  exchangeRateAge: number;        // Minutes since last refresh
  priceTrend: {                   // From synced trend data
    days_7: number;               // % change over 7 days
    days_30: number;              // % change over 30 days
  };
  liquidity: LiquidityAssessment; // See §2.7 — independent axis from confidence
}
```

**Condition-specific pricing is critical.** The local card index stores separate prices for NM, LP, MP, and HP conditions. The arbitrage calculator must use the price matching the listing's mapped condition — not a generic "market" price. A NM Charizard at $200 vs LP at $120 is a completely different deal evaluation. The price trend data (synced free with `?include=prices`) is also surfaced to help gauge whether a card's value is rising or falling.

Price data comes from the local card index — no live Scrydex call needed. The exchange rate service is the only external dependency at deal-evaluation time.

#### Audit Trail

Every deal is stored with full match metadata for accuracy measurement:

```typescript
interface DealAuditRecord {
  dealId: string;
  ebayItemId: string;
  ebayTitle: string;

  // What we parsed
  normalizedListing: NormalizedListing;

  // What we matched (from local index)
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

### 2.7 Liquidity Assessment

Profit on paper means nothing if the card won't sell. This scanner is built for **quick flips** — buy underpriced on eBay, sell at market within days. A card showing 40% profit but no active market is a trap: you're stuck holding inventory with no buyers. Liquidity must be assessed independently from confidence and surfaced as a first-class signal in every deal.

#### Available Signals

Liquidity signals come from three sources at different cost levels:

**Tier 1 — Free (already in the local card index from `?include=prices`):**

These are computed once during card sync and stored on every card in PostgreSQL. Zero additional API cost.

| Signal | Source | What It Tells You |
|---|---|---|
| **Trend activity** | `trends.days_1` through `days_90` | Non-zero `percentChange` across recent windows means active trading. All-null/all-zero = stale market |
| **Price completeness** | `conditions` keys in `LocalVariantPrices` | Cards with NM, LP, MP, HP all priced = deep market. Single condition priced = thin data |
| **Price spread** | `low` vs `market` per condition | Tight ratio (low/market > 0.7) = stable, liquid market. Wide spread = volatile/illiquid |
| **Variant price depth** | Number of variants with non-null `market` | Multiple variants priced (normal, holo, reverse) = widely traded card |
| **1-day trend presence** | `trends.days_1` non-null | Most granular signal. If Scrydex has 1-day price movement data, the card traded yesterday |

**Tier 2 — Low-cost (from eBay during normal scanning, no extra API calls):**

These are extracted per-listing from data the eBay Browse API already returns.

| Signal | Source | What It Tells You |
|---|---|---|
| **Concurrent supply** | Count of eBay listings matching the same card in the scan batch | High supply = cards circulate actively. Zero other listings = niche |
| **`quantitySold`** | `EbayListing.quantitySold` (eBay Browse API field) | Copies the seller has already sold from this listing. Multiple = proven demand |
| **Seller feedback score** | `EbayListing.seller.feedbackScore` | High-volume sellers tend to list liquid cards — they know what moves |

**Tier 3 — On-demand (Scrydex `/cards/{id}/listings`, 3 credits per call):**

Only fetched selectively for high-profit deals where the free signals are ambiguous.

| Signal | Source | What It Tells You |
|---|---|---|
| **Sales velocity** | Count of listings returned with `sold_at` in last 7/30 days | Direct measure of how often the card changes hands. The gold standard |
| **Recent sale prices** | `price` field on returned listings | Confirm the `market` price reflects actual recent transactions, not stale aggregates |

#### When to Call `/listings` (Credit Budget)

The `/listings` endpoint costs 3 credits per call — too expensive for every card, but worthwhile for high-value deals where free signals are inconclusive.

```
Call /listings when ALL of the following are true:
  1. Deal profit > configurable threshold (default: £10 absolute)
  2. Deal confidence tier = high or medium
  3. Tier-1 liquidity score = medium or ambiguous (high liquidity = don't need it, low = don't waste credits)
  4. Card hasn't had /listings fetched in the last 7 days (cache locally)

Budget impact:
  Estimated 50-100 calls/month × 3 credits = 150-300 credits
  < 1% of monthly budget — negligible
```

Results from `/listings` calls are cached in PostgreSQL per card with a 7-day TTL. If the same card appears in multiple deals within a week, the cached velocity data is reused.

#### Composite Liquidity Score

Combine the available signals into a single 0-1 score using a weighted average. Unlike confidence scoring (geometric mean where any low score drags the composite down), liquidity uses an **arithmetic mean** — a card can have some weak signals and still be liquid if other signals are strong.

```typescript
interface LiquidityAssessment {
  composite: number;              // 0.0 - 1.0
  grade: 'high' | 'medium' | 'low' | 'illiquid';

  // Tier 1: from local card index (always available)
  trendActivity: number;          // 0-1: proportion of trend windows with non-zero movement
  priceCompleteness: number;      // 0-1: conditions priced / 4
  priceSpread: number;            // 0-1: low/market ratio (1.0 = tight, 0 = huge gap)
  variantDepth: number;           // 0-1: variants with prices / total variants

  // Tier 2: from eBay listing (available at deal time)
  concurrentSupply: number;       // Raw count of matching eBay listings in current scan
  quantitySold: number;           // From eBay listing (0 if not available)

  // Tier 3: from Scrydex /listings (optional, cached)
  salesVelocity: {
    sales7d: number;              // Sold listings in last 7 days
    sales30d: number;             // Sold listings in last 30 days
    fetched: boolean;             // Whether /listings was actually called
    fetchedAt: Date | null;       // Cache timestamp
  } | null;
}

function calculateLiquidity(
  card: LocalCard,
  variant: LocalVariant,
  condition: string,
  ebaySignals: { concurrentSupply: number; quantitySold: number },
  salesCache: SalesVelocityCache | null,
): LiquidityAssessment {
  // Tier 1: Trend activity
  // Count how many of the 4 trend windows (1d, 7d, 30d, 90d) have non-zero percentChange
  const conditionPrices = variant.prices.conditions[condition];
  const trendWindows = conditionPrices?.trends
    ? [conditionPrices.trends.days_1, conditionPrices.trends.days_7,
       conditionPrices.trends.days_30, conditionPrices.trends.days_90]
    : [];
  const activeWindows = trendWindows.filter(t => t !== null && t.percentChange !== 0).length;
  const trendActivity = activeWindows / 4;

  // Tier 1: Price completeness
  const conditionsPriced = Object.values(variant.prices.conditions)
    .filter(c => c.market !== null).length;
  const priceCompleteness = conditionsPriced / 4;

  // Tier 1: Price spread (tight = liquid)
  const low = conditionPrices?.low;
  const market = conditionPrices?.market;
  const priceSpread = (low && market && market > 0)
    ? Math.min(low / market, 1.0)   // Capped at 1.0
    : 0.3;                           // Unknown = assume moderate spread

  // Tier 1: Variant depth
  const variantsWithPrices = card.variants.filter(v =>
    Object.values(v.prices.conditions).some(c => c.market !== null)
  ).length;
  const variantDepth = card.variants.length > 0
    ? variantsWithPrices / card.variants.length
    : 0;

  // Tier 2: eBay supply signal (diminishing returns — 5+ listings = max signal)
  const supplyScore = Math.min(ebaySignals.concurrentSupply / 5, 1.0);

  // Tier 2: Quantity sold (diminishing returns — 3+ = max signal)
  const soldScore = Math.min(ebaySignals.quantitySold / 3, 1.0);

  // Tier 3: Sales velocity (if available from cache)
  let velocityScore = 0.5;  // Neutral default if not fetched
  if (salesCache?.fetched) {
    // 5+ sales in 7 days = very liquid. 0 sales in 30 days = illiquid
    if (salesCache.sales7d >= 5) velocityScore = 1.0;
    else if (salesCache.sales7d >= 2) velocityScore = 0.85;
    else if (salesCache.sales30d >= 5) velocityScore = 0.7;
    else if (salesCache.sales30d >= 2) velocityScore = 0.5;
    else if (salesCache.sales30d >= 1) velocityScore = 0.3;
    else velocityScore = 0.1;  // Zero sales in 30 days
  }

  // WHY ARITHMETIC MEAN (not geometric like confidence):
  // Liquidity is about aggregate signal strength. A card can have zero eBay supply
  // (nobody else is listing it right now) but strong Scrydex trend activity — it's
  // still liquid, just not on eBay at this moment. Geometric mean would punish the
  // zero supply score too harshly. Arithmetic mean lets strong signals compensate
  // for weak ones, which is the correct behavior for liquidity estimation.
  const weights = salesCache?.fetched
    ? { trendActivity: 0.15, priceCompleteness: 0.10, priceSpread: 0.10,
        variantDepth: 0.05, supplyScore: 0.15, soldScore: 0.10, velocityScore: 0.35 }
    : { trendActivity: 0.25, priceCompleteness: 0.15, priceSpread: 0.15,
        variantDepth: 0.10, supplyScore: 0.20, soldScore: 0.15, velocityScore: 0.00 };

  const composite =
    weights.trendActivity * trendActivity +
    weights.priceCompleteness * priceCompleteness +
    weights.priceSpread * priceSpread +
    weights.variantDepth * variantDepth +
    weights.supplyScore * supplyScore +
    weights.soldScore * soldScore +
    weights.velocityScore * velocityScore;

  const grade =
    composite >= 0.75 ? 'high' :
    composite >= 0.50 ? 'medium' :
    composite >= 0.25 ? 'low' :
    'illiquid';

  return {
    composite, grade,
    trendActivity, priceCompleteness, priceSpread, variantDepth,
    concurrentSupply: ebaySignals.concurrentSupply,
    quantitySold: ebaySignals.quantitySold,
    salesVelocity: salesCache ? {
      sales7d: salesCache.sales7d,
      sales30d: salesCache.sales30d,
      fetched: salesCache.fetched,
      fetchedAt: salesCache.fetchedAt,
    } : null,
  };
}
```

#### Liquidity Grades

| Grade | Composite | Flip Expectation | Dashboard Treatment |
|---|---|---|---|
| **High** | >= 0.75 | Sells within days | Full confidence in deal. No warning |
| **Medium** | 0.50 - 0.74 | 1-2 weeks | Show deal. Subtle amber liquidity indicator |
| **Low** | 0.25 - 0.49 | Weeks to months | Show with strong warning. "Low liquidity" label |
| **Illiquid** | < 0.25 | May never sell at target | **Hidden by default** (filterable). Red "Illiquid" badge if shown |

#### Integration with Deal Evaluation

Liquidity is assessed **after** matching and **before** tier assignment. It does not affect confidence (those are independent axes), but it **does affect deal tier**:

```typescript
function adjustTierForLiquidity(
  baseTier: 'S' | 'A' | 'B' | 'C',
  liquidity: LiquidityAssessment,
): 'S' | 'A' | 'B' | 'C' {
  // Illiquid cards are capped at C-tier regardless of profit
  if (liquidity.grade === 'illiquid') return 'C';

  // Low liquidity cards are capped at B-tier
  if (liquidity.grade === 'low' && (baseTier === 'S' || baseTier === 'A')) return 'B';

  // Medium liquidity: downgrade S to A (still a deal, but temper expectations)
  if (liquidity.grade === 'medium' && baseTier === 'S') return 'A';

  // High liquidity: no adjustment
  return baseTier;
}
```

**Why not just filter illiquid deals out entirely?** Because the user should still be able to see them. A card might be illiquid at market price but the eBay listing is so far below market that you could sell it for less than market and still profit. The liquidity signal informs the decision — it doesn't make it.

#### EbayListing Updates

The eBay poller must now extract `quantitySold` from the Browse API response:

```typescript
interface EbayListing {
  // ... existing fields ...
  quantitySold: number;            // NEW: copies sold from this listing (0 if unavailable)
}
```

#### Concurrent Supply Tracking

During each scan cycle, the arbitrage engine tracks how many eBay listings matched the same local card. This is a free signal computed as a side effect of normal matching:

```typescript
// After matching all listings in a scan batch:
const supplyMap = new Map<string, number>();  // scrydexCardId → count of listings

for (const deal of scanResults) {
  const cardId = deal.matchResult.card.scrydexCardId;
  supplyMap.set(cardId, (supplyMap.get(cardId) || 0) + 1);
}

// Attach concurrent supply count to each deal
for (const deal of scanResults) {
  deal.liquidity.concurrentSupply = supplyMap.get(deal.matchResult.card.scrydexCardId) || 0;
}
```

This accumulates over time in PostgreSQL — the `deals` table records which cards appear repeatedly across scan cycles, building a rolling picture of supply depth.

---

### 2.8 Accuracy Measurement & Enforcement

#### How to Measure Accuracy

**Definition:** A match is "accurate" if the local card index entry matched is the same card being sold in the eBay listing. Specifically:
1. Correct Pokemon / card name
2. Correct expansion / set
3. Correct card number
4. Correct variant (holo vs non-holo, 1st edition vs unlimited)

**Measurement approach:**

1. **Automated validation (continuous):**
   - Cross-check: if eBay listing has item specifics for "Set" and "Card Number", verify they match our resolved expansion and number
   - Denominator validation: verify listing denominator matches expansion printed_total
   - Name containment check: verify parsed name appears in matched card name (or vice versa)
   - Track: `automated_accuracy = validated_correct / total_validated`

2. **Manual review sampling (weekly):**
   - Random sample 50 deals from the audit table
   - Human reviewer checks each against the eBay listing
   - Record `isCorrectMatch` and `incorrectReason`
   - Track: `manual_accuracy = correct / reviewed`

3. **Confidence calibration (statistical methodology):**
   - After collecting 200+ reviewed deals, bin by confidence score in 0.1 buckets
   - For each bucket, compute: `empirical_accuracy = correct / total_in_bucket`
   - Plot a **calibration curve**: X = predicted confidence, Y = empirical accuracy
   - A well-calibrated system has points along the Y=X diagonal
   - If the 0.85+ bucket has only 70% accuracy → confidence is over-estimated → increase name weight or raise thresholds
   - If the 0.65-0.75 bucket has 95% accuracy → confidence is under-estimated → you can lower the display threshold safely
   - Re-calibrate quarterly as the card index grows and new sets introduce new naming patterns
   - **Minimum sample size per bucket: 30 deals.** Below this, the calibration data is not statistically meaningful

#### Accuracy Enforcement

**Target: ≥85% match accuracy**

Enforcement mechanisms:

1. **Confidence floor:** Don't show deals below the composite confidence threshold that corresponds to 85% empirical accuracy (start at 0.65, calibrate based on data).

2. **Regression testing:** Maintain a corpus of 200+ eBay titles with known correct matches. Run the full normalization + matching pipeline against this corpus on every code change. **GitHub Actions runs this suite on every PR** — the PR cannot merge if accuracy drops below 85%. Railway auto-deploys from `main`, so the accuracy gate prevents regressions from ever reaching production.

**Corpus entry format:**
```json
{
  "id": "corpus-001",
  "ebayTitle": "PSA 10 GEM MINT Charizard ex 006/197 Obsidian Flames Pokemon 2023",
  "itemSpecifics": {
    "Card Name": "Charizard ex",
    "Card Number": "006",
    "Set": "Obsidian Flames"
  },
  "expectedCardId": "sv3-6",
  "expectedExpansionId": "sv3",
  "expectedVariant": "holofoil",
  "difficulty": "easy",
  "tags": ["graded", "modern", "ex_suffix"],
  "addedAt": "2025-02-01",
  "source": "manual_review"
}
```

**Corpus seeding strategy:**
- **Phase 1 (before launch):** Manually curate 100 entries from the beta's historical deal data. Cover:
  - 30% modern sets (SV era) — most common listings
  - 20% legacy sets (XY, SM era) — different title conventions
  - 20% vintage (WOTC, Base Set) — highest error rate in beta
  - 15% graded cards (PSA/CGC/BGS) — grading info in title
  - 15% edge cases: abbreviated names, misspelled sellers, multi-language, special art variants
- **Phase 2 (ongoing):** Every manual review that identifies a mismatch is automatically added to the corpus (one-click in the dashboard review UI)
- **Phase 3 (growth):** Target 500+ entries within 3 months of production operation

**Corpus test implementation:**
```typescript
// test/accuracy/match-corpus.test.ts
describe('Match accuracy corpus', () => {
  const corpus = loadCorpus('test/fixtures/match-corpus.json');

  it('should maintain ≥85% overall accuracy', () => {
    const results = corpus.map(entry => {
      const normalized = normalize(entry.ebayTitle, entry.itemSpecifics);
      const match = matchEngine.resolve(normalized);
      return {
        id: entry.id,
        correct: match.card?.id === entry.expectedCardId &&
                 match.expansion?.scrydexId === entry.expectedExpansionId,
        expected: entry.expectedCardId,
        actual: match.card?.id ?? null,
        confidence: match.confidence?.composite ?? 0,
      };
    });

    const correct = results.filter(r => r.correct).length;
    const accuracy = correct / results.length;

    // Log failures for debugging
    const failures = results.filter(r => !r.correct);
    if (failures.length > 0) {
      console.table(failures.map(f => ({
        id: f.id, expected: f.expected, actual: f.actual, confidence: f.confidence,
      })));
    }

    expect(accuracy).toBeGreaterThanOrEqual(0.85);
  });

  // Individual test per corpus entry — so CI shows WHICH entries failed
  for (const entry of loadCorpus('test/fixtures/match-corpus.json')) {
    it(`should correctly match: ${entry.id} — ${entry.ebayTitle.slice(0, 60)}`, () => {
      const normalized = normalize(entry.ebayTitle, entry.itemSpecifics);
      const match = matchEngine.resolve(normalized);
      // Individual entries may fail — the aggregate 85% threshold is what gates the PR
      // This just provides visibility into which specific cases are failing
    });
  }
});
```

3. **Monitoring dashboard:** Track rolling 7-day accuracy from automated checks. Alert if it drops below 80%. This data is surfaced in the dashboard status bar and via Telegram alerts.

4. **Feedback loop:** When manual review finds incorrect matches, add the failing case to the regression corpus. This ensures the same error never recurs — the new test case runs in GitHub Actions on every subsequent PR. The dashboard review UI should have a "Add to corpus" button that generates the JSON entry and opens a GitHub PR automatically (via GitHub API).

---

### 2.9 Manual Listing Lookup Tool

A standalone tool where you can paste an eBay listing URL (or item ID) and get a full pipeline evaluation — without waiting for the scanner to pick it up.

#### Workflow

```
1. User pastes eBay URL or item ID into the dashboard
2. System fetches the listing via eBay Browse API (1 call)
3. Runs full pipeline: signal extraction → condition mapping → local index matching
4. Displays detailed result:
   - Parsed signals (what we extracted from title + structured data)
   - Match result (which card, which variant, confidence breakdown)
   - Arbitrage calculation (eBay price vs Scrydex value, profit/loss)
   - Card image side-by-side with eBay listing image
   - Confidence breakdown per field (name, number, denominator, expansion, variant)
   - Condition mapping detail (source, raw value, mapped condition)
```

#### Interface

```typescript
// POST /api/lookup
interface LookupRequest {
  ebayUrl?: string;        // Full eBay listing URL
  ebayItemId?: string;     // Or just the item ID
}

interface LookupResponse {
  listing: EbayListing;                // Raw eBay data
  signals: {
    title: TitleSignals;
    structured: StructuredSignals;
    condition: ConditionResult;
  };
  normalized: NormalizedListing;       // Merged signals
  match: MatchResult | null;          // Best match from local index
  candidates: ScoredCandidate[];      // All candidates considered (top 10)
  arbitrage: ArbitrageResult | null;  // Profit calc if matched
  warnings: string[];                 // Any issues encountered
  processingTime: number;             // ms — should be <100ms for local matching
}
```

#### Use Cases

- **Deal verification:** Before buying, paste the listing to confirm the match is correct and the profit calculation is accurate
- **Debugging mismatches:** See exactly why a listing was matched (or not matched) — which signals fired, what confidence each field got
- **Training data collection:** Mark lookup results as correct/incorrect to grow the regression corpus
- **Manual arbitrage hunting:** Paste interesting listings you find browsing eBay to check if they're underpriced
- **Quick card search:** Also support searching the local card index directly by card name, number, or set — useful for price checking without an eBay listing

---

### 2.10 Public Card Catalog

Since the local card index contains a complete, regularly-updated database of every English Pokemon card with images and pricing, we should expose this as a browsable public catalog. This adds value beyond arbitrage and builds the foundation for a broader product.

#### Features

- **Set browser:** Browse all ~350 English expansions, view every card in a set with images
- **Card search:** Full-text search by card name, number, set name, or artist
- **Price display:** Current market prices per condition (NM/LP/MP/HP) with trend indicators
- **Card detail page:** Large card image, all variants with prices, price history trends (1/7/14/30/90/180 days), expansion info with logo
- **Filtering:** By set, by type (Pokemon/Trainer/Energy), by rarity, by price range
- **Sorting:** By price, by price trend (biggest movers), by release date, by number

#### API Endpoints

```typescript
// Public card catalog endpoints — no authentication required

GET /api/catalog/expansions
  // List all expansions with logos, card counts, release dates
  // Params: ?series=Scarlet+%26+Violet&sort=releaseDate

GET /api/catalog/expansions/:id
  // Expansion detail with full card list
  // Params: ?sort=number&include=prices

GET /api/catalog/cards/search
  // Full-text card search
  // Params: ?q=charizard&set=base1&sort=priceMarket

GET /api/catalog/cards/:id
  // Card detail with all variants, prices, trends, images

GET /api/catalog/trending
  // Cards with biggest price movements (up or down)
  // Params: ?period=7d&direction=up&limit=50
```

#### Data Freshness

The catalog is always backed by the same local card index used for arbitrage matching. Price data is as fresh as the last sync:
- **Recent sets (top 10):** Updated daily
- **All other sets:** Updated weekly
- **New expansions:** Detected and synced within 24 hours of appearing on Scrydex

#### Deployment

The public catalog is served by the same Railway service as the dashboard. Railway provides an HTTPS domain automatically (e.g., `pokesnipe-production.up.railway.app`), but a **custom domain** should be configured for the catalog (e.g., `catalog.pokesnipe.com`) — Railway supports this natively via their domain settings.

**SEO considerations:** Card detail pages should use server-side rendering (SSR) so they're indexable by search engines. The Railway service renders HTML for card/expansion URLs when the request doesn't have an `Accept: application/json` header. This means `/api/catalog/cards/:id` serves JSON for the SPA and pre-rendered HTML for crawlers — or use a separate `/catalog/cards/:id` route for the public HTML pages.

#### Value Proposition

- **For the arbitrage scanner:** The catalog doubles as a verification tool — users can browse to the matched card and visually confirm it's correct
- **For the community:** A fast, free, well-indexed Pokemon card price database with images
- **For SEO/traffic:** Card pages are statically renderable, indexable, and attract organic search traffic. Custom domain on Railway gives a clean public URL.
- **For future monetization:** A catalog with pricing data is a natural platform for alerts, wishlists, and collection tracking

---

### 2.11 Observability & Operational Excellence

The beta had zero observability — no structured logging, no metrics, no alerting beyond basic console output. You cannot improve what you cannot measure. The redesign treats observability as a first-class concern, not an afterthought.

#### Structured Logging

All logs are JSON-formatted with consistent fields. This enables log aggregation, searching, and alerting in Railway's log viewer (or any external service like Datadog, Logtail, etc.).

```typescript
// Every log entry includes:
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;            // ISO 8601
  service: string;              // 'sync', 'scanner', 'matching', 'api'
  correlationId?: string;       // Traces a single listing through the full pipeline
  // Structured context — never interpolated into the message string
  context?: Record<string, unknown>;
  // Error details (only for level: 'error')
  error?: {
    name: string;
    message: string;
    stack?: string;
    cause?: string;
  };
}

// Example: a matching pipeline log trail
// All entries share the same correlationId for end-to-end tracing
{ level: "info",  service: "scanner",  correlationId: "abc123", message: "Processing listing", context: { ebayItemId: "394827163", title: "Charizard ex 006/197..." } }
{ level: "debug", service: "matching", correlationId: "abc123", message: "Candidates found", context: { count: 3, method: "number_and_denominator" } }
{ level: "info",  service: "matching", correlationId: "abc123", message: "Match resolved", context: { cardId: "sv3-6", confidence: 0.92, tier: "high" } }
{ level: "info",  service: "arbitrage", correlationId: "abc123", message: "Deal created", context: { dealId: "uuid-...", profitGBP: 32.50, tier: "S" } }
```

**Log levels:**
- `debug`: Detailed pipeline internals (candidate lists, score breakdowns). Disabled in production by default; enabled via env var for troubleshooting.
- `info`: Business events (deal created, sync completed, scan started). Always enabled.
- `warn`: Recoverable issues (stale exchange rate, low API credits, pattern parse failure).
- `error`: Unrecoverable issues requiring attention (DB connection lost, API auth failure, sync abort).

**Implementation:** Use `pino` (fastest Node.js structured logger, Railway-compatible). Do NOT use `winston` (slower, heavier, unnecessary features). Pino outputs newline-delimited JSON by default — Railway's log viewer parses this natively.

#### Metrics

Track operational health with counters and gauges. These power the dashboard status bar and enable alerting.

```typescript
// Key metrics (implemented as simple counters/gauges stored in-process, exposed via /api/status)
interface Metrics {
  // Scanner
  scanner_scans_total: number;             // Total scan cycles completed
  scanner_listings_processed_total: number; // Total eBay listings processed
  scanner_listings_matched_total: number;   // Listings that resolved to a match
  scanner_listings_rejected_total: number;  // Listings rejected (junk, fake, no match)
  scanner_deals_created_total: number;      // Deals written to DB

  // Matching quality
  matching_confidence_histogram: number[];  // Distribution of composite confidence scores
  matching_method_counter: Record<string, number>;  // Counts by method: number_and_denominator, number_only, name_search

  // Sync
  sync_last_full_at: Date | null;
  sync_last_delta_at: Date | null;
  sync_cards_total: number;                // Total cards in local index
  sync_expansions_total: number;           // Total expansions in local index

  // API budgets
  scrydex_credits_used_month: number;
  scrydex_credits_remaining: number;
  ebay_calls_today: number;
  ebay_daily_limit: number;

  // Accuracy
  accuracy_automated_7d: number | null;
  accuracy_manual_total: number;
  accuracy_manual_correct: number;
}
```

No external metrics service needed for v1. Metrics are held in-process and exposed via the `/api/status` endpoint and SSE status events. If scaling requires external metrics later, the counters can be exported to Prometheus (prom-client library) with minimal code change.

#### Alerting

Alerts are sent via Telegram (same bot as deal notifications) and are distinct from deal alerts.

| Alert | Trigger | Severity |
|---|---|---|
| Sync failed | Full or delta sync completes with status `failed` | Critical |
| API credits low | Scrydex remaining < 5,000 | Warning |
| API credits critical | Scrydex remaining < 2,000 | Critical |
| eBay rate limited | 3+ consecutive 429 responses | Warning |
| Exchange rate stale | Last fetch > 4 hours ago | Warning |
| Accuracy drop | Rolling 7-day automated accuracy < 80% | Critical |
| Card index stale | No successful sync in > 48 hours | Critical |
| DB connection lost | PostgreSQL connection pool exhausted | Critical |
| Process restart | Boot detected with existing card index (Railway redeploy) | Info |

---

### 2.12 Error Handling Philosophy

The beta swallowed errors pervasively — `catch` blocks logged warnings and continued with stale or default data. This is the worst possible pattern for an arbitrage scanner: a silent error means a wrong price, which means buying the wrong card.

**Principle: Make errors visible, not silent.**

#### Error Categories

```typescript
// All custom errors extend a base class with structured metadata
abstract class PokeSnipeError extends Error {
  abstract readonly category: 'transient' | 'permanent' | 'configuration' | 'data_quality';
  abstract readonly severity: 'critical' | 'warning' | 'info';
  readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.context = context;
    this.name = this.constructor.name;
  }
}

// Transient: retry is appropriate (network timeout, 429, 503)
class ScrydexApiError extends PokeSnipeError {
  readonly category = 'transient';
  readonly severity = 'warning';
}

// Permanent: do not retry (404, invalid API key, malformed response)
class ScrydexNotFoundError extends PokeSnipeError {
  readonly category = 'permanent';
  readonly severity = 'info';
}

// Configuration: crash at startup (missing env var, invalid DB URL)
class ConfigurationError extends PokeSnipeError {
  readonly category = 'configuration';
  readonly severity = 'critical';
}

// Data quality: log and skip this listing (cannot parse title, no price data)
class DataQualityError extends PokeSnipeError {
  readonly category = 'data_quality';
  readonly severity = 'info';
}
```

#### Error Handling Rules

| Category | Response | Retry? | Log Level |
|---|---|---|---|
| Transient | Retry with backoff | Yes (up to 3x) | `warn` |
| Permanent | Skip and log | No | `info` |
| Configuration | Crash process | No | `error` + exit(1) |
| Data quality | Skip listing, log for analysis | No | `info` |

**Rules that prevent beta's mistakes:**
1. **Never catch and ignore.** Every `catch` block must either retry, skip with logging, or re-throw.
2. **Never use default values for critical data.** Exchange rate, API credentials, and DB connections must be present and fresh — no fallbacks.
3. **Fail the listing, not the scan.** If one eBay listing fails to match, log it and move to the next. Never let a single bad listing crash the scan loop.
4. **Fail the scan, not the process.** If a scan cycle fails (eBay API down), log it and schedule the next scan. Never let a scan failure crash the process.
5. **Crash the process for configuration errors.** Missing API keys, invalid DB URL, or malformed config should crash immediately at startup — not fail silently 3 hours into production.

---

### 2.13 Security

#### API Authentication

**Private endpoints** (deals, preferences, lookup) are protected by a bearer token:

```typescript
// Middleware: verify DASHBOARD_SECRET on all private routes
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = authHeader.slice(7);
  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(Buffer.from(token), Buffer.from(config.DASHBOARD_SECRET))) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  next();
}
```

**Why constant-time comparison:** A naive `===` string comparison returns faster when the first differing character is early in the string. An attacker can measure response times to guess the secret one character at a time. `crypto.timingSafeEqual` takes the same time regardless of where characters differ.

**Public endpoints** (catalog) require no authentication but have rate limiting:

```typescript
// Rate limit public catalog endpoints: 60 requests per minute per IP
// Prevents scraping abuse while allowing normal browsing
app.use('/api/catalog', rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
}));
```

#### Input Validation

All API inputs are validated with Zod schemas before processing. Never trust client input.

```typescript
// Example: lookup endpoint validates eBay URL/item ID format
const lookupSchema = z.object({
  ebayUrl: z.string().url().optional(),
  ebayItemId: z.string().regex(/^\d{9,15}$/).optional(),
}).refine(data => data.ebayUrl || data.ebayItemId, {
  message: 'Either ebayUrl or ebayItemId is required',
});
```

**SQL injection prevention:** Use parameterized queries exclusively. The PostgreSQL client (`pg` or Drizzle ORM) parameterizes by default. Never concatenate user input into SQL strings. The trigram similarity queries use `$1` placeholders:
```sql
SELECT * FROM cards WHERE similarity(name, $1) > 0.4 ORDER BY similarity(name, $1) DESC
-- $1 is bound as a parameter, never interpolated
```

#### Sensitive Data

- API keys and secrets are Railway environment variables — never in code or logs
- eBay listing URLs are logged for debugging, but seller personal data (email, address) is never stored
- Telegram bot tokens and chat IDs are stored in PostgreSQL preferences but are NOT exposed via the public catalog API
- The `match_signals` JSONB on deals stores pipeline data for debugging — ensure it never contains raw API credentials

---

### 2.14 Configuration Management

The beta embedded magic numbers throughout the codebase: confidence thresholds, discount percentages, cache TTLs, similarity cutoffs. Changing any of them required a code change and redeployment.

The redesign centralizes ALL tunable parameters into a single typed configuration object with documented defaults.

```typescript
// src/infra/config.ts — Single source of truth for all behavioral parameters
interface AppConfig {
  // From environment variables (validated at boot)
  env: EnvConfig;

  // Matching thresholds
  matching: {
    nameSimilarityMin: number;          // Default: 0.60 — hard floor for name match
    nameSimilarityAlgorithm: 'jaro-winkler' | 'levenshtein';  // Default: 'jaro-winkler'
    denominatorTolerance: number;       // Default: 5 — ±N for printed total
    maxCandidates: number;              // Default: 50 — cap before disambiguation
    compositeWeights: {                 // Weighted geometric mean weights
      nameMatch: number;                // Default: 0.40
      denominatorMatch: number;         // Default: 0.25
      numberMatch: number;              // Default: 0.15
      expansionMatch: number;           // Default: 0.20
    };
  };

  // Confidence tiers
  confidence: {
    highThreshold: number;              // Default: 0.85
    mediumThreshold: number;            // Default: 0.65
    lowThreshold: number;               // Default: 0.45
    // Below lowThreshold = reject
  };

  // Deal tier thresholds (overridable via preferences API)
  tiers: {
    S: { minProfitPercent: number; minProfitGBP: number };  // Default: 40%, £10
    A: { minProfitPercent: number; minProfitGBP: number };  // Default: 25%, £5
    B: { minProfitPercent: number; minProfitGBP: number };  // Default: 15%, £3
    C: { minProfitPercent: number; minProfitGBP: number };  // Default: 5%, £1
  };

  // Sync schedule
  sync: {
    fullSyncCron: string;               // Default: '0 3 * * 0' (Sunday 3AM UK)
    deltaSyncCron: string;              // Default: '0 4 * * *' (daily 4AM UK)
    expansionSyncCron: string;          // Default: '0 5 * * *' (daily 5AM UK)
    hotSetCount: number;                // Default: 10 — recent sets for daily delta
    courtesyDelayMs: number;            // Default: 50 — delay between API pages
  };

  // Scanner
  scanner: {
    operatingHoursStart: number;        // Default: 6 (06:00 UK)
    operatingHoursEnd: number;          // Default: 23 (23:00 UK)
    minIntervalMinutes: number;         // Default: 10
    maxIntervalMinutes: number;         // Default: 30
    listingsPerScan: number;            // Default: 200
    ebayCategory: string;               // Default: '183454' (Pokemon CCG Singles)
    ebayMarketplace: string;            // Default: 'EBAY-GB'
  };

  // Liquidity
  liquidity: {
    highThreshold: number;              // Default: 0.75
    mediumThreshold: number;            // Default: 0.50
    lowThreshold: number;               // Default: 0.25
    velocityCallMinProfit: number;      // Default: 10 (£10 minimum to justify 3-credit /listings call)
    velocityCacheTTLDays: number;       // Default: 7
  };

  // Exchange rate
  exchangeRate: {
    refreshIntervalMinutes: number;     // Default: 60
    maxStalenessMinutes: number;        // Default: 360 (6 hours — hard gate for deal creation)
  };

  // API budgets
  scrydex: {
    monthlyBudget: number;              // Default: 50000
    warningThreshold: number;           // Default: 5000
    criticalThreshold: number;          // Default: 2000
  };
}

// Defaults are defined once, in code, with comments explaining each value.
// Environment variables can override any default:
//   MATCHING_NAME_SIMILARITY_MIN=0.55 → config.matching.nameSimilarityMin = 0.55
// Preferences API can override tier thresholds at runtime.
```

**Why this matters:** When confidence calibration (§2.8) reveals that the name similarity threshold should be 0.55 instead of 0.60, you change ONE environment variable on Railway — no code change, no PR, no redeploy. The same config object is used in tests, so threshold changes are immediately reflected in the regression suite.

---

### 2.15 Implementation Roadmap (Revised)

#### Phase 1: Card Index Foundation (Week 1-2)

**Goal:** Set up infrastructure and build the local card database with Scrydex sync.

- [ ] **GitHub repo:** Initialize repository, branch protection on `main` (require PR + passing CI)
- [ ] **Railway project:** Create Railway project, provision managed PostgreSQL, configure environment variables (see §2.2)
- [ ] **CI pipeline:** GitHub Actions workflow — lint, typecheck, test, ESLint import boundary enforcement on every PR
- [ ] **Dockerfile + railway.toml:** Containerized build with Railway deployment config
- [ ] Project scaffolding with layered architecture (domain/infra/services/api — see §2.1)
- [ ] **Infrastructure foundation:**
  - [ ] Zod-validated config loader with all defaults documented (§2.14)
  - [ ] Pino structured logger with correlation ID support (§2.11)
  - [ ] Token-bucket rate limiter (reusable for Scrydex + eBay) (§2.2)
  - [ ] Circuit breaker (3-state: closed/open/half-open) (§2.2)
  - [ ] Typed error hierarchy (transient/permanent/config/data_quality) (§2.12)
  - [ ] Process lifecycle manager with graceful shutdown (§2.1)
  - [ ] Health + readiness endpoints
- [ ] Database schema + migrations (§2.3 PostgreSQL Schema): `expansions`, `cards`, `variants`, `deals`, `sales_velocity_cache`, `exchange_rates`, `preferences`, `sync_log`
- [ ] Scrydex client with rate limiting, circuit breaker, and credit tracking
- [ ] Expansion sync: fetch all EN expansions, store in PostgreSQL
- [ ] **Full card sync: paginate all EN cards with `?include=prices`, upsert to PostgreSQL with idempotent transactions**
- [ ] Search indexes: PostgreSQL trigram (`pg_trgm`) + GIN indexes (defined in DDL)
- [ ] Delta sync for hot sets (10 most recent expansions)
- [ ] Sync scheduler (`node-cron`): weekly full, daily delta, daily expansion check
- [ ] Sync log tracking: progress, credits used, duration
- [ ] Unit tests for sync, storage, and index queries
- [ ] **First Railway deploy:** Verify sync runs on Railway, PostgreSQL connection healthy, health endpoints responding

```
pokesnipe/
├── Dockerfile                 # Multi-stage build: build TS → slim Node runtime
├── railway.toml               # Railway deployment config (build + start commands)
├── .github/
│   └── workflows/
│       └── ci.yml             # Lint + typecheck + test + accuracy regression
│
├── src/
│   ├── main.ts                # Entry point: boot sequence, lifecycle management
│   │
│   │  ┌─── DOMAIN LAYER (pure logic, zero I/O, fully unit-testable) ───┐
│   ├── domain/
│   │   ├── extraction/        # Signal extraction from eBay listings
│   │   │   ├── title-parser.ts          # 5-phase parsing pipeline
│   │   │   ├── condition-mapper.ts      # eBay condition → NM/LP/MP/HP
│   │   │   ├── structured-extractor.ts  # eBay item specifics extraction
│   │   │   ├── signal-merger.ts         # Merge title + structured signals
│   │   │   └── types.ts
│   │   ├── matching/          # Local index matching engine
│   │   │   ├── candidate-lookup.ts      # Number-first candidate search
│   │   │   ├── disambiguator.ts         # Score + rank candidates
│   │   │   ├── name-similarity.ts       # Jaro-Winkler + normalization
│   │   │   ├── variant-resolver.ts      # Variant mapping table
│   │   │   ├── confidence.ts            # Weighted geometric mean composite
│   │   │   ├── validator.ts             # Hard + soft gates
│   │   │   └── types.ts
│   │   ├── arbitrage/         # Arbitrage calculator
│   │   │   ├── price-engine.ts          # Condition-specific pricing
│   │   │   ├── deal-classifier.ts       # Tier assignment (S/A/B/C)
│   │   │   ├── liquidity-assessor.ts    # Composite liquidity scoring
│   │   │   └── types.ts
│   │   └── errors.ts          # Typed error hierarchy (§2.12)
│   │
│   │  ┌─── INFRASTRUCTURE LAYER (I/O, external APIs, database) ────────┐
│   ├── infra/
│   │   ├── config.ts           # Zod-validated env config (§2.14)
│   │   ├── database/
│   │   │   ├── connection.ts            # PostgreSQL pool + health check
│   │   │   ├── migrations/              # Numbered SQL migration files
│   │   │   └── migrate.ts              # Migration runner (boot-time)
│   │   ├── repositories/       # Database access (queries, upserts)
│   │   │   ├── card-repo.ts
│   │   │   ├── expansion-repo.ts
│   │   │   ├── variant-repo.ts
│   │   │   ├── deal-repo.ts
│   │   │   └── preference-repo.ts
│   │   ├── clients/            # External API clients
│   │   │   ├── scrydex-client.ts        # Rate-limited Scrydex API
│   │   │   ├── ebay-client.ts           # OAuth + Browse API
│   │   │   ├── exchange-rate-client.ts  # Currency conversion
│   │   │   └── telegram-client.ts       # Notifications + alerts
│   │   ├── rate-limiter.ts     # Token-bucket rate limiter (§2.2)
│   │   ├── circuit-breaker.ts  # 3-state circuit breaker (§2.2)
│   │   └── logger.ts          # Pino structured logger (§2.11)
│   │
│   │  ┌─── APPLICATION LAYER (orchestration, scheduling) ──────────────┐
│   ├── services/
│   │   ├── sync-service.ts     # Card index sync orchestration
│   │   ├── scan-service.ts     # eBay scan loop + deal pipeline
│   │   ├── lookup-service.ts   # Manual listing lookup
│   │   ├── catalog-service.ts  # Public card catalog queries
│   │   └── alert-service.ts   # Telegram alerting for ops events
│   │
│   │  ┌─── HTTP LAYER (routes, middleware, SSE) ───────────────────────┐
│   ├── api/
│   │   ├── routes/
│   │   │   ├── deals.ts
│   │   │   ├── catalog.ts
│   │   │   ├── lookup.ts
│   │   │   ├── preferences.ts
│   │   │   ├── status.ts
│   │   │   └── health.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts                  # Bearer token validation
│   │   │   ├── rate-limit.ts            # Public endpoint rate limiting
│   │   │   └── validation.ts            # Zod request validation
│   │   └── sse.ts              # Server-Sent Events deal stream
│   │
│   └── patterns/              # Data-driven config (loaded at boot, not hardcoded)
│       └── card-number.json    # Card number regex patterns (§2.4)
│
├── test/
│   ├── unit/                  # Domain layer tests (pure logic, no mocks needed)
│   │   ├── extraction/
│   │   ├── matching/
│   │   └── arbitrage/
│   ├── integration/           # Service + infra tests (requires test DB)
│   ├── fixtures/
│   │   └── match-corpus.json  # Accuracy regression corpus
│   └── accuracy/
│       └── match-corpus.test.ts
│
├── .env.example               # Template for local development (git-tracked)
└── .env                       # Local secrets (git-ignored)
```

**Dependency rule enforcement:** The domain layer imports NOTHING from infra, services, or api. This is enforced by an ESLint rule (e.g., `eslint-plugin-import` with `no-restricted-paths`). If a domain file imports from `../infra/`, the linter fails the build. This ensures all domain logic remains pure and testable.

#### Phase 2: Signal Extraction (Week 2-3)

**Goal:** Build the 5-phase title parsing pipeline and structured data extractor.

- [ ] Phase 1 (Clean): Unicode normalization, emoji strip, HTML decode, noise removal
- [ ] Phase 2 (Classify): Junk/fake/non-English early-exit detection
- [ ] Phase 3 (Extract): Data-driven card number patterns (from JSON config), grading detection, variant flags
- [ ] Phase 4 (Identify): DB-driven name/set identification using in-memory card name index + pg_trgm similarity
- [ ] Phase 5 (Assemble): Combine extractions into TitleSignals with per-field confidence
- [ ] Condition mapper with 4-priority cascade (descriptors → specifics → title → default)
- [ ] Build structured data extractor for eBay item specifics (localizedAspects)
- [ ] Build signal merger with per-field conflict resolution
- [ ] Create initial match corpus (100 titles) from beta's training data
- [ ] Unit tests: parse accuracy ≥ 90% on corpus

#### Phase 3: Local Matching Engine (Week 3-4)

**Goal:** Build the number-first local matching pipeline with composite confidence scoring.

- [ ] Candidate lookup: number+denominator → number+expansion → number-only → name search (cap at 50 candidates)
- [ ] Candidate disambiguation: score by name, denominator, expansion signals
- [ ] Expansion cross-validation with confidence adjustment
- [ ] Name validation with Jaro-Winkler similarity, 0.60 minimum threshold, asymmetric substring scoring
- [ ] Variant resolver with explicit mapping table (not string matching)
- [ ] Composite confidence scoring (weighted geometric mean in log-space, 0.01 floor)
- [ ] Hard + soft validation gates (§2.6)
- [ ] Confidence-gated processing (high/medium/low/reject)
- [ ] Liquidity assessment integration (§2.7)
- [ ] End-to-end integration tests: eBay title → local match → deal (domain layer, no DB needed)
- [ ] **Seed regression corpus: 100 entries covering modern/legacy/vintage/graded/edge cases**
- [ ] **Regression test suite: accuracy ≥ 85% on corpus**
- [ ] **GitHub Actions accuracy gate:** CI fails if regression accuracy < 85%

#### Phase 4: Arbitrage, Lookup Tool & Presentation (Week 4-5)

**Goal:** Price calculation, deal storage, scanning, manual lookup tool, and dashboard.

- [ ] Price engine: condition-specific pricing from local variant data, currency conversion with staleness hard gate (no hardcoded fallback rates!)
- [ ] Exchange rate service: periodic refresh, DB persistence, staleness tracking
- [ ] Deal classifier: tier assignment with configurable thresholds (from AppConfig, not hardcoded)
- [ ] Deal store: PostgreSQL with deduplication (`idx_deals_dedup`) and audit logging (`match_signals` JSONB)
- [ ] eBay poller with scan scheduling, rate limit handling, circuit breaker
- [ ] **Manual listing lookup tool:** paste eBay URL → full pipeline evaluation with confidence breakdown
- [ ] REST API + SSE endpoints (deals stream, deals list, lookup, status, preferences)
- [ ] Auth middleware: constant-time bearer token comparison (§2.13)
- [ ] Input validation middleware: Zod schemas on all endpoints (§2.13)
- [ ] Dashboard frontend (deal feed, detail panel, filters, status bar, lookup tool)
- [ ] Telegram bot integration: deal alerts + operational alerts (separate channels)
- [ ] **Railway production deploy:** Full pipeline running — eBay scan → match → deal → dashboard

#### Phase 5: Public Card Catalog (Week 5-6)

**Goal:** Expose the local card index as a browsable public catalog.

- [ ] Public API endpoints: expansion list, card search, card detail, trending
- [ ] Set browser UI: expansion grid with logos, card counts, release dates
- [ ] Card search: full-text search by name, number, set, artist
- [ ] Card detail page: large image, variant prices, trend data, expansion info
- [ ] Trending page: biggest price movers (7d/30d up/down)
- [ ] Server-side rendering for SEO (card pages should be indexable)
- [ ] **Custom domain on Railway** for the public catalog (e.g., `catalog.pokesnipe.com`)

#### Phase 6: Accuracy Loop & Operational Maturity (Ongoing)

**Goal:** Continuous improvement through measurement and feedback. Production hardening.

- [ ] Manual review workflow: sample 50 deals/week, verify matches, record outcomes in `deals.is_correct_match`
- [ ] Confidence calibration: bin reviewed deals by confidence score, plot calibration curve, adjust thresholds (§2.8)
- [ ] Corpus growth: "Add to corpus" button in dashboard review UI → auto-generate JSON entry → open GitHub PR
- [ ] Accuracy monitoring: rolling 7-day automated accuracy with Telegram alerting on <80%
- [ ] Pattern updates: add new card number formats to `patterns/card-number.json` (no code change)
- [ ] Sync health monitoring: alert if card index is stale (>48h) or sync fails
- [ ] Database maintenance: automated VACUUM ANALYZE via PostgreSQL scheduled task, connection pool monitoring
- [ ] Log analysis: review structured logs for common rejection reasons, identify parsing gaps
- [ ] Load testing: simulate high-throughput scan with 200 listings/cycle to verify <100ms matching latency

---

### 2.16 Backend API Contract

This section defines the backend endpoints that serve the frontend dashboard (see `FRONTEND_DESIGN_SPEC.md`). Endpoints for the manual lookup tool (section 2.9) and public card catalog (section 2.10) are defined in their respective sections and not repeated here.

#### Real-Time Deal Stream

The deal feed requires real-time push — the dashboard should not poll. Use **Server-Sent Events (SSE)** over WebSocket for simplicity: SSE is unidirectional (server → client), works through proxies/CDNs, reconnects automatically, and the dashboard has no need to send structured messages back over the same channel.

```typescript
// GET /api/deals/stream
// Accept: text/event-stream
// Connection: keep-alive

// Event types:

// New deal discovered by the scanner
event: deal
data: {
  dealId: string;
  ebayItemId: string;
  cardName: string;
  cardNumber: string;
  expansionName: string;
  expansionLogo: string;          // URL from local index
  cardImage: string;              // URL from local index
  ebayImage: string;              // eBay listing image URL
  ebayPriceGBP: number;
  marketPriceGBP: number;
  profitGBP: number;
  profitPercent: number;
  tier: 'S' | 'A' | 'B' | 'C';
  confidence: number;             // Composite score 0-1
  confidenceTier: 'high' | 'medium' | 'low';
  condition: string;              // NM | LP | MP | HP
  priceTrend7d: number;           // % change
  liquidityGrade: 'high' | 'medium' | 'low' | 'illiquid';
  liquidityScore: number;         // 0-1 composite
  ebayUrl: string;
  listedAt: string;               // ISO 8601
  createdAt: string;              // ISO 8601
}

// System status update (emitted every 30s, or on state change)
event: status
data: {
  scanner: {
    state: 'running' | 'paused' | 'stopped' | 'error';
    lastScanAt: string;
    errorMessage: string | null;
  };
  ebay: {
    callsToday: number;
    dailyLimit: number;            // ~5,000
  };
  scrydex: {
    creditsUsedMonth: number;
    monthlyLimit: number;          // 50,000
  };
  cardIndex: {
    totalCards: number;
    lastSyncAt: string;
    nextSyncAt: string;
    syncState: 'idle' | 'syncing' | 'failed';
  };
  deals: {
    countToday: number;
    countByTier: { S: number; A: number; B: number; C: number };
  };
  accuracy: {
    rolling7d: number | null;      // null if <10 reviewed deals
    totalReviewed: number;
  };
}

// Heartbeat to keep connection alive (every 15s)
event: ping
data: { ts: string }
```

**Reconnection:** SSE has built-in reconnection via the `Last-Event-Id` header. Each `deal` event includes the deal ID as the SSE `id` field. On reconnect, the server replays any deals the client missed.

**Filtering:** The SSE stream sends all deals. Client-side filtering (by tier, confidence, condition, profit minimum) is applied in the frontend — this keeps the server stream simple and avoids per-client filter state on the backend.

**Railway compatibility:** Railway supports long-lived HTTP connections (SSE, WebSocket). However, Railway's default request timeout is 5 minutes for inactive connections. The `ping` heartbeat every 15 seconds keeps the SSE connection alive well within this window. If Railway's load balancer ever drops the connection, the browser's `EventSource` reconnects automatically with `Last-Event-Id`.

#### Deal REST API

For initial page load, historical browsing, and any state the SSE stream doesn't cover.

```typescript
// GET /api/deals
// Paginated deal list for initial load and historical browsing
//
// Query parameters:
//   page: number (default 1)
//   limit: number (default 50, max 200)
//   tier: string (comma-separated: "S,A,B")
//   confidenceMin: number (0-1, e.g., 0.65)
//   condition: string (comma-separated: "NM,LP")
//   profitMin: number (minimum profit %, e.g., 10)
//   since: string (ISO 8601 — deals after this timestamp)
//   sort: string (default "-createdAt", options: "-profitPercent", "-confidence", "createdAt")
//   q: string (free text search across card name, expansion name, eBay title)
//
// Response:
interface DealListResponse {
  deals: DealSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface DealSummary {
  dealId: string;
  ebayItemId: string;
  cardName: string;
  cardNumber: string;
  expansionName: string;
  expansionLogo: string;
  cardImage: string;
  ebayImage: string;
  ebayPriceGBP: number;
  marketPriceGBP: number;
  profitGBP: number;
  profitPercent: number;
  tier: 'S' | 'A' | 'B' | 'C';
  confidence: number;
  confidenceTier: 'high' | 'medium' | 'low';
  condition: string;
  priceTrend7d: number;
  liquidityGrade: 'high' | 'medium' | 'low' | 'illiquid';
  liquidityScore: number;
  ebayUrl: string;
  listedAt: string;
  createdAt: string;
}

// GET /api/deals/:dealId
// Full deal detail including match audit data
//
// Response:
interface DealDetailResponse {
  deal: DealSummary;

  // Match confidence breakdown (per-field)
  confidence: {
    composite: number;
    fields: {
      name: number;
      number: number;
      denominator: number;
      expansion: number;
      variant: number;
      normalization: number;
    };
    tier: 'high' | 'medium' | 'low';
  };

  // Price breakdown
  pricing: {
    ebayPrice: number;            // GBP
    ebayShipping: number;         // GBP
    ebayFees: number;             // GBP (estimated)
    ebayCostTotal: number;        // GBP
    scrydexPriceUSD: number;      // USD (for this condition)
    exchangeRate: number;
    exchangeRateAge: number;      // minutes
    marketPriceGBP: number;       // converted
    profitGBP: number;
    profitPercent: number;
    priceTrend: { days_7: number; days_30: number };
  };

  // All conditions and their prices for this card variant
  priceTable: {
    condition: string;             // NM | LP | MP | HP
    priceUSD: number;
    priceGBP: number;
    isListingCondition: boolean;   // true for the condition matched to this listing
  }[];

  // Condition mapping detail
  conditionMapping: {
    source: string;                // "conditionDescriptors" | "localizedAspects" | "title" | "default"
    rawValue: string;              // What the source provided
    mappedCondition: string;       // NM | LP | MP | HP
  };

  // Match details (expandable in UI)
  matchDetails: {
    signals: {
      title: TitleSignals;
      structured: StructuredSignals | null;
      condition: ConditionResult;
    };
    normalized: NormalizedListing;
    candidateCount: number;
    topCandidates: ScoredCandidate[];  // Top 10 with scores
    matchedCard: {
      scrydexId: string;
      name: string;
      number: string;
      expansion: string;
      variant: string;
      imageUrl: string;
    };
  };

  // Liquidity breakdown (see §2.7)
  liquidity: {
    composite: number;
    grade: 'high' | 'medium' | 'low' | 'illiquid';
    signals: {
      trendActivity: number;        // 0-1
      priceCompleteness: number;    // 0-1
      priceSpread: number;          // 0-1
      variantDepth: number;         // 0-1
      concurrentSupply: number;     // Raw count
      quantitySold: number;         // From eBay listing
    };
    salesVelocity: {
      sales7d: number;
      sales30d: number;
      fetchedAt: string;            // ISO 8601
    } | null;                        // null if /listings wasn't called
  };

  // Accuracy review state
  review: {
    reviewedAt: string | null;
    isCorrectMatch: boolean | null;
    incorrectReason: string | null;
  };
}

// POST /api/deals/:dealId/review
// Submit accuracy feedback for a deal
//
// Body:
interface DealReviewRequest {
  isCorrectMatch: boolean;
  incorrectReason?: 'wrong_card' | 'wrong_expansion' | 'wrong_variant' | 'wrong_price';
}

// GET /api/deals/:dealId/liquidity
// On-demand sales velocity fetch from Scrydex /listings (3 credits).
// Returns cached data if available and <7 days old. Otherwise calls
// Scrydex and caches the result.
//
// Response:
interface DealLiquidityResponse {
  dealId: string;
  liquidity: {
    composite: number;            // Updated composite with velocity data
    grade: 'high' | 'medium' | 'low' | 'illiquid';
    signals: {
      trendActivity: number;
      priceCompleteness: number;
      priceSpread: number;
      variantDepth: number;
      concurrentSupply: number;
      quantitySold: number;
    };
    salesVelocity: {
      sales7d: number;
      sales30d: number;
      fetchedAt: string;          // ISO 8601
    };
  };
  cached: boolean;                // true if from cache (no credits spent)
  creditsUsed: number;            // 0 if cached, 3 if freshly fetched
}
```

#### System Status API

Standalone endpoint for initial page load (the SSE stream provides ongoing updates).

```typescript
// GET /api/status
// Returns the same structure as the SSE `status` event
// Used for initial dashboard render before SSE connection is established
```

#### Preferences API

User preferences persist across sessions and control deal filtering defaults, notification thresholds, and display settings.

```typescript
// GET /api/preferences
// PUT /api/preferences
//
// Body (all fields optional on PUT — partial updates merge):
interface UserPreferences {
  // Deal tier thresholds (% profit)
  tiers: {
    S: { minProfit: number; minProfitGBP: number };   // default: 40%, £10
    A: { minProfit: number; minProfitGBP: number };   // default: 25%, £5
    B: { minProfit: number; minProfitGBP: number };   // default: 15%, £3
    C: { minProfit: number; minProfitGBP: number };   // default: 5%, £1
  };

  // Default filter state for deal feed
  defaultFilters: {
    tiers: ('S' | 'A' | 'B' | 'C')[];              // default: ['S', 'A', 'B']
    confidenceMin: 'high' | 'medium' | 'low';       // default: 'medium'
    conditions: ('NM' | 'LP' | 'MP' | 'HP')[];      // default: all
    profitMinPercent: number;                         // default: 10
    timeRange: '1h' | '6h' | '24h' | 'all';         // default: '6h'
    showGraded: boolean;                              // default: false
  };

  // Notification settings
  notifications: {
    telegram: {
      enabled: boolean;
      botToken: string | null;          // Encrypted at rest
      chatId: string | null;
      minTier: 'S' | 'A' | 'B' | 'C'; // default: 'S'
      minConfidence: 'high' | 'medium'; // default: 'high'
      minProfitPercent: number;          // default: 30
      watchedExpansions: string[];       // Scrydex expansion IDs, empty = all
      watchedCards: string[];            // Scrydex card IDs, empty = none
    };
    inApp: {
      soundEnabled: boolean;            // default: true
      soundOnTier: 'S' | 'A';          // default: 'S'
      toastDuration: number;            // seconds, default: 5
    };
  };

  // Display preferences
  display: {
    currency: 'GBP' | 'USD' | 'both';  // default: 'GBP'
    theme: 'dark' | 'light';            // default: 'dark'
    ebayFeePercent: number;              // default: 12.8 (eBay UK final value fee)
  };
}
```

**Storage:** Single-user for v1, stored in PostgreSQL on Railway. No full authentication layer needed initially, but **private endpoints must not be publicly accessible.** Two approaches:

1. **Simple shared secret:** Private API endpoints require an `Authorization: Bearer <token>` header where the token is a `DASHBOARD_SECRET` environment variable on Railway. The frontend stores this in localStorage after a one-time entry. Simple, sufficient for single-user.
2. **Path-based split:** Public catalog routes (`/api/catalog/*`) are open. Everything else (`/api/deals/*`, `/api/preferences`, `/api/notifications/*`, `/api/lookup`) is behind the bearer token check.

The public catalog endpoints remain unauthenticated — they're the public-facing product. If multi-user is added later, replace the shared secret with proper auth (e.g., GitHub OAuth).

#### Telegram Bot Integration

```typescript
// POST /api/notifications/telegram/test
// Send a test message to verify bot token and chat ID are configured correctly
//
// Response:
interface TelegramTestResponse {
  success: boolean;
  error: string | null;       // e.g., "Invalid bot token", "Chat not found"
  messageId: number | null;   // Telegram message ID if successful
}

// GET /api/notifications/telegram/status
// Check current Telegram integration health
//
// Response:
interface TelegramStatusResponse {
  configured: boolean;          // bot token + chat ID are set
  lastMessageAt: string | null; // ISO 8601
  lastError: string | null;
  messagesSentToday: number;
}
```

**Message format:** Telegram notifications use a compact template:

```
🟢 S-tier Deal: Charizard ex #006/197
Obsidian Flames · NM
eBay: £12.50 → Market: £45.00
Profit: +£32.50 (+260%)
Confidence: 92% (high)
🔗 ebay.co.uk/itm/...
```

#### Endpoint Summary

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/deals/stream` | GET (SSE) | Bearer token | Real-time deal push |
| `/api/deals` | GET | Bearer token | Paginated deal list |
| `/api/deals/:id` | GET | Bearer token | Deal detail with audit |
| `/api/deals/:id/review` | POST | Bearer token | Accuracy feedback |
| `/api/deals/:id/liquidity` | GET | Bearer token | On-demand sales velocity (§2.7) |
| `/api/status` | GET | Bearer token | System health |
| `/api/preferences` | GET/PUT | Bearer token | User preferences |
| `/api/notifications/telegram/test` | POST | Bearer token | Test Telegram config |
| `/api/notifications/telegram/status` | GET | Bearer token | Telegram health |
| `/api/lookup` | POST | Bearer token | Manual listing lookup (§2.9) |
| `/api/catalog/expansions` | GET | None (public) | Expansion list (§2.10) |
| `/api/catalog/expansions/:id` | GET | None (public) | Expansion detail (§2.10) |
| `/api/catalog/cards/search` | GET | None (public) | Card search (§2.10) |
| `/api/catalog/cards/:id` | GET | None (public) | Card detail (§2.10) |
| `/api/catalog/trending` | GET | None (public) | Price movers (§2.10) |

All private endpoints require `Authorization: Bearer <DASHBOARD_SECRET>`. The `DASHBOARD_SECRET` is a Railway environment variable. Public catalog endpoints are open — they serve the public-facing card database.

---

### Summary of Key Differences from Beta

| Aspect | Beta | Redesign |
|---|---|---|
| **Core architecture** | eBay-first: parse title → query Scrydex live per listing | Scrydex-first: sync all cards locally → match against local index |
| **Scrydex API cost per listing** | 1-6 credits (primary + fallbacks) | **0 credits** (local DB query) |
| **Monthly Scrydex budget usage** | ~45,000 / 50,000 (90%) | ~3,000 / 50,000 (6%) |
| **Matching approach** | Expansion-first: guess set → query API by expansion + number | Number-first: extract number → query local DB → disambiguate |
| **Expansion catalog** | Hardcoded 500+ entries with ID remapping | Live-synced from Scrydex, Scrydex IDs canonical |
| **Card price data** | Fetched live per listing from Scrydex | Pre-synced locally with weekly/daily refresh |
| **Title parsing** | Monolithic 1,447-line class, 50+ inline regexes, single confidence score | 5-phase pipeline (clean→classify→extract→identify→assemble), data-driven patterns from JSON config, per-field confidence |
| **Pokemon name matching** | Hardcoded ~300 names as regex alternation | Trigram similarity against local card index (~35,000 cards), handles misspellings naturally |
| **Set name matching** | 9 era-specific regexes + 1000+ hardcoded aliases | `pg_trgm` fuzzy match against expansion catalog, no hardcoded lists |
| **Name similarity algorithm** | Levenshtein (treats all positions equally) | **Jaro-Winkler** (prefix-weighted, better for names) with asymmetric substring scoring |
| **Name similarity threshold** | 0.25-0.30 | **0.60 minimum** |
| **Match fallbacks** | 6 cascading strategies, thresholds lowered over time | Number-first candidate lookup, strict disambiguation, prefer "no match" over wrong match |
| **Cost of a rejected match** | 1-6 wasted API credits | **Zero** (local query) |
| **Confidence scoring** | Single parse confidence (0-100) | Composite weighted geometric mean per field (log-space, 0.01 floor) |
| **Confidence response** | Binary pass/fail at 28% | 4-tier graduated response (high/med/low/reject) with calibration methodology |
| **Validation** | Implicit (if parse succeeds, proceed) | Explicit hard + soft gates with typed results and documented thresholds |
| **Architecture** | God object (ArbitrageEngine, 1800 lines) | 4-layer architecture (domain/infra/services/api) with enforced dependency boundaries |
| **Domain testability** | Required full engine mock | Domain layer is pure functions — zero I/O, tested with simple arrays |
| **Accuracy measurement** | None (only diagnostic stage counters) | Automated checks + manual review sampling + regression corpus + calibration curves |
| **Regression testing** | None | 200+ entry corpus, GitHub Actions gate at 85%, individual failure reporting |
| **State management** | In-memory Maps, lost on restart | PostgreSQL on Railway — persistent across redeploys with defined DDL |
| **Expansion updates** | Requires code change + redeploy | Automated daily sync |
| **Scan throughput** | Limited by Scrydex credit budget | **Limited only by eBay rate limits** (Scrydex is no longer a bottleneck) |
| **Deployment** | Manual (not documented) | GitHub → Railway auto-deploy, GitHub Actions CI with accuracy gate |
| **Database** | None (in-memory) | Managed PostgreSQL with defined schema, migrations, trigram + GIN indexes |
| **Secrets management** | Hardcoded or .env file | Railway environment variables, Zod-validated at boot, never in repo |
| **Configuration** | Magic numbers scattered across codebase | Single typed `AppConfig` object, env-var overridable, documented defaults |
| **Error handling** | Silent catch-and-continue, swallowed errors | Typed error hierarchy (transient/permanent/config/data_quality), fail fast on config |
| **Exchange rate** | Hardcoded 1.27 GBP/USD fallback | DB-persisted with staleness hard gate — **never** uses a hardcoded fallback |
| **Rate limiting** | None (relied on eBay not blocking) | Token-bucket rate limiter per API + circuit breaker (3-state) |
| **Observability** | `console.log` | Pino structured JSON logging with correlation IDs, typed metrics, Telegram alerts |
| **Liquidity assessment** | None | Composite score from trend activity, price completeness, eBay supply, and optional sales velocity |
| **Security** | None | Bearer token auth with constant-time comparison, Zod input validation, parameterized SQL |
| **Process lifecycle** | None (crash = lost state) | Ordered boot sequence, graceful shutdown, health/readiness endpoints |
