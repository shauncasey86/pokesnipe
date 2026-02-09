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
  - [2.3 Scrydex Card Index](#23-scrydex-card-index)
  - [2.4 Signal Extraction](#24-signal-extraction)
  - [2.5 Local Index Matching](#25-local-index-matching)
  - [2.6 Confidence Scoring & Validation](#26-confidence-scoring--validation)
  - [2.7 Accuracy Measurement & Enforcement](#27-accuracy-measurement--enforcement)
  - [2.8 Manual Listing Lookup Tool](#28-manual-listing-lookup-tool)
  - [2.9 Public Card Catalog](#29-public-card-catalog)
  - [2.10 Implementation Roadmap](#210-implementation-roadmap)
  - [2.11 Backend API Contract](#211-backend-api-contract)

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

At 100 requests/second, this is unlikely to be a bottleneck. The heaviest load is the weekly full sync (~350 requests), which at 100 req/s completes in under 4 seconds. However:
- Implement a token-bucket rate limiter (100 tokens, refills at 100/second)
- On HTTP 429 response, back off exponentially: 1s → 2s → 4s → max 30s
- The card index sync should insert a 50ms delay between paginated requests to stay well under the limit and be a good API citizen

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

Both APIs must have independent circuit breakers:
- **Scrydex budget low:** Reduce sync frequency. Dashboard and matching continue to work from local card index.
- **eBay rate-limited:** Pause scanning, show countdown to retry. Resume automatically when backoff expires.
- **Both healthy:** Normal operation.

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

Build these indexes on the local card DB for fast matching:

| Index | Purpose | Example Query |
|---|---|---|
| `number + printedTotal` | Number-first matching | "Find all cards numbered 6 in sets with 162 cards" |
| `number + expansionId` | Direct card lookup | "Card #6 in expansion X" |
| `numberNormalized` | Prefix-agnostic search | "65" matches both "SV65" and "TG65" and "065" |
| `name (trigram/FTS)` | Fuzzy name search | "Charizard" finds "Charizard ex", "Charizard V" |
| `expansionName` | Expansion text search | "Surging Sparks" |
| `expansionCode` | Code lookup | "sv8" |

With PostgreSQL trigram indexes (`pg_trgm`) and GIN-backed full-text search, these queries execute in <1ms — orders of magnitude faster than a live API call. PostgreSQL is the right choice here because Railway's managed Postgres persists across redeploys and supports the fuzzy matching features (trigram similarity, FTS ranking) needed for card name lookup.

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

Same role as beta but restructured for per-field confidence:

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

**Improvements over beta:**
- **Per-field confidence** instead of a single score. `"123/456"` gives high-confidence number AND denominator, while a name extracted by position heuristic gets low confidence
- **Regex patterns are data-driven.** Load patterns from a config file so new formats don't require code changes
- **Pokemon name matching uses the local card index** — search all card names from the synced DB rather than maintaining a hardcoded ~300 name list
- **Set name matching uses the local expansion catalog** — search the expansion table rather than 9 era-specific regexes
- **Emoji and noise stripping** as the first normalization pass, before any regex matching

#### Step 2: Condition Mapper

Port the beta's condition mapping logic — this is one area the beta got right. eBay provides card condition through multiple channels, and we need all of them for accurate condition-specific pricing.

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
// Priority 4: Default to 'LP' (conservative — undervalues slightly)
```

**Why this matters for pricing:** The local card index stores prices per-condition. A NM Charizard might be $200 while an LP copy is $120. Using the wrong condition means the profit calculation is wrong. The beta's 3-priority condition mapping ensures we get the most accurate condition possible.

**Blocked conditions** — skip damaged/creased cards entirely:
```typescript
const BLOCKED_PATTERNS = ['damaged', 'dmg', 'creased', 'crease', 'water damage', 'torn', 'ripped'];
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

      const composite = weightedGeometricMean({
        numberMatch: { score: 1.0, weight: 0.20 },  // Already filtered by number
        denominatorMatch: { score: denomScore, weight: 0.25 },
        nameMatch: { score: nameScore, weight: 0.35 },       // Most important
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

  // One contains the other (handles "Pikachu" vs "Pikachu V")
  if (normalizedCard.startsWith(normalizedParsed) ||
      normalizedParsed.startsWith(normalizedCard)) {
    return 0.85;
  }

  // Levenshtein-based similarity
  return levenshteinSimilarity(normalizedParsed, normalizedCard);
}
```

**Minimum name similarity: 0.60** (up from beta's 0.25-0.30). This is the single most impactful change for accuracy. At the local-index scale, we can afford to be strict — rejecting a candidate costs nothing (no wasted API credit), and the correct card is almost certainly in the candidate set if the number was right.

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
  // Weighted geometric mean — any single low score drags the composite down
  const weights = {
    nameMatch: 0.30,         // Name match is the most important signal
    denominatorMatch: 0.25,  // Denominator validates the expansion implicitly
    numberMatch: 0.15,       // Usually 1.0 (filtered by number)
    expansionMatch: 0.10,    // Bonus validation signal
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
- Name similarity < 0.60
- Expansion language ≠ EN (should never happen with EN-only local index, but defensive check)
- Seller country ≠ GB
- No price data available for matched variant in local DB
- Local price data older than 7 days (stale — wait for next sync)
- Exchange rate > 6 hours stale (don't guess at currency conversion)

**Soft gates (confidence reduction):**
- Denominator mismatch (but within ±15): reduce confidence by 0.2
- Name similarity 0.6-0.7: reduce confidence by 0.1
- Only 1 narrowing signal used in candidate lookup: reduce confidence by 0.1
- Condition defaulted (not from structured data or title): reduce confidence by 0.05

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
  tier: 'S' | 'A' | 'B' | 'C';   // Configurable thresholds
  exchangeRate: number;
  exchangeRateAge: number;        // Minutes since last refresh
  priceTrend: {                   // From synced trend data
    days_7: number;               // % change over 7 days
    days_30: number;              // % change over 30 days
  };
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

### 2.7 Accuracy Measurement & Enforcement

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

3. **Confidence calibration:**
   - After collecting 200+ reviewed deals, bin by confidence score
   - Verify that 0.85+ confidence deals are actually correct 85%+ of the time
   - If not, adjust weights or thresholds

#### Accuracy Enforcement

**Target: ≥85% match accuracy**

Enforcement mechanisms:

1. **Confidence floor:** Don't show deals below the composite confidence threshold that corresponds to 85% empirical accuracy (start at 0.65, calibrate based on data).

2. **Regression testing:** Maintain a corpus of 200+ eBay titles with known correct matches. Run the full normalization + matching pipeline against this corpus on every code change. **GitHub Actions runs this suite on every PR** — the PR cannot merge if accuracy drops below 85%. Railway auto-deploys from `main`, so the accuracy gate prevents regressions from ever reaching production.

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

3. **Monitoring dashboard:** Track rolling 7-day accuracy from automated checks. Alert if it drops below 80%. This data is surfaced in the dashboard status bar and via Telegram alerts.

4. **Feedback loop:** When manual review finds incorrect matches, add the failing case to the regression corpus. This ensures the same error never recurs — the new test case runs in GitHub Actions on every subsequent PR.

---

### 2.8 Manual Listing Lookup Tool

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

### 2.9 Public Card Catalog

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

### 2.10 Implementation Roadmap

#### Phase 1: Card Index Foundation (Week 1-2)

**Goal:** Set up infrastructure and build the local card database with Scrydex sync.

- [ ] **GitHub repo:** Initialize repository, branch protection on `main` (require PR + passing CI)
- [ ] **Railway project:** Create Railway project, provision managed PostgreSQL, configure environment variables (see §2.2)
- [ ] **CI pipeline:** GitHub Actions workflow — lint, typecheck, test on every PR
- [ ] **Dockerfile + railway.toml:** Containerized build with Railway deployment config
- [ ] Project scaffolding with modular directory structure
- [ ] Database schema + migrations: `expansions`, `cards`, `variants`, `deals`, `deal_audit`, `match_corpus`, `preferences`
- [ ] Scrydex client with rate limiting and credit tracking
- [ ] Expansion sync: fetch all EN expansions, store in PostgreSQL
- [ ] **Full card sync: paginate all EN cards with `?include=prices`, store in PostgreSQL**
- [ ] Search indexes: PostgreSQL trigram (`pg_trgm`) + GIN indexes for number, name, expansion lookups
- [ ] Delta sync for hot sets (10 most recent expansions)
- [ ] Sync scheduler (`node-cron`): weekly full, daily delta, daily expansion check
- [ ] Unit tests for sync, storage, and index queries
- [ ] **First Railway deploy:** Verify sync runs on Railway, PostgreSQL connection healthy

```
pokesnipe/
├── Dockerfile                 # Multi-stage build: build TS → slim Node runtime
├── railway.toml               # Railway deployment config (build + start commands)
├── .github/
│   └── workflows/
│       ├── ci.yml             # Lint + typecheck + test + accuracy regression
│       └── deploy.yml         # (optional) Railway auto-deploys from main
├── src/
│   ├── index/                 # Scrydex card index (the core innovation)
│   │   ├── card-sync.ts            # Full + delta sync logic
│   │   ├── expansion-sync.ts       # Expansion catalog sync
│   │   ├── card-store.ts           # PostgreSQL read/write
│   │   ├── search-index.ts         # Number/name/expansion lookups
│   │   ├── sync-scheduler.ts       # node-cron scheduling
│   │   └── types.ts
│   ├── extraction/            # Signal extraction from eBay listings
│   │   ├── title-parser.ts
│   │   ├── structured-extractor.ts
│   │   ├── signal-merger.ts
│   │   └── types.ts
│   ├── matching/              # Local index matching engine
│   │   ├── candidate-lookup.ts     # Number-first candidate search
│   │   ├── disambiguator.ts        # Score + rank candidates
│   │   ├── variant-resolver.ts
│   │   ├── confidence.ts
│   │   ├── validator.ts
│   │   └── types.ts
│   ├── arbitrage/             # Arbitrage calculator
│   │   ├── price-engine.ts
│   │   ├── deal-classifier.ts
│   │   └── deal-store.ts
│   ├── scan/                  # eBay scanning
│   │   ├── ebay-poller.ts
│   │   ├── scan-scheduler.ts
│   │   └── ebay-client.ts
│   ├── lookup/                # Manual listing lookup tool
│   │   └── lookup-service.ts
│   ├── catalog/               # Public card catalog
│   │   └── catalog-service.ts
│   ├── api/                   # REST API + SSE (deals, lookup, catalog, preferences)
│   ├── config/                # Environment-based config (reads Railway env vars)
│   ├── database/              # PostgreSQL migrations, connection pool
│   └── utils/
├── test/
│   ├── fixtures/
│   │   └── match-corpus.json  # Accuracy regression corpus
│   └── accuracy/
│       └── match-corpus.test.ts
├── .env.example               # Template for local development (git-tracked)
└── .env                       # Local secrets (git-ignored)
```

#### Phase 2: Signal Extraction (Week 2-3)

**Goal:** Build the improved title parser and structured data extractor.

- [ ] Port regex patterns from beta as starting point
- [ ] Replace hardcoded Pokemon name list with local card DB lookup
- [ ] Replace era-specific set name regexes with local expansion catalog matching
- [ ] Build structured data extractor for eBay item specifics
- [ ] Build signal merger with per-field conflict resolution
- [ ] Create initial match corpus (100 titles) from beta's training data
- [ ] Unit tests: parse accuracy ≥ 90% on corpus

#### Phase 3: Local Matching Engine (Week 3-4)

**Goal:** Build the number-first local matching pipeline with composite confidence scoring.

- [ ] Candidate lookup: number+denominator → number+expansion → number-only → name search
- [ ] Candidate disambiguation: score by name, denominator, expansion signals
- [ ] Expansion cross-validation
- [ ] Name validation with 0.60 minimum threshold
- [ ] Variant resolver with mapping table
- [ ] Composite confidence scoring (weighted geometric mean)
- [ ] Confidence-gated processing (high/medium/low/reject)
- [ ] End-to-end integration tests: eBay title → local match → deal
- [ ] **Regression test suite with match corpus: accuracy ≥ 85%**
- [ ] **GitHub Actions accuracy gate:** CI fails if regression accuracy < 85%

#### Phase 4: Arbitrage, Lookup Tool & Presentation (Week 4-5)

**Goal:** Price calculation, deal storage, scanning, manual lookup tool, and dashboard.

- [ ] Price engine: condition-specific pricing from local variant data, currency conversion
- [ ] Deal classifier: tier assignment with configurable thresholds
- [ ] Deal store: database with deduplication and audit logging
- [ ] eBay poller with scan scheduling and rate limit handling
- [ ] **Manual listing lookup tool:** paste eBay URL → full pipeline evaluation with confidence breakdown
- [ ] REST API + SSE endpoints (deals stream, deals list, lookup, status, preferences)
- [ ] Dashboard frontend (deal feed, detail panel, filters, status bar, lookup tool)
- [ ] Telegram bot integration with test/status endpoints
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

#### Phase 6: Accuracy Loop (Ongoing)

**Goal:** Continuous improvement through measurement and feedback.

- [ ] Manual review workflow: sample deals, verify matches, record outcomes
- [ ] Confidence calibration: adjust thresholds based on empirical data
- [ ] Corpus growth: add every misidentified deal to regression suite
- [ ] Monitoring: accuracy dashboard with alerting
- [ ] Pattern updates: add new regex patterns when new card formats appear
- [ ] Sync health monitoring: alert if card index is stale or sync fails
- [ ] Railway health checks: ensure service stays alive, monitor restart frequency
- [ ] Database maintenance: PostgreSQL VACUUM, index health, connection pool tuning

---

### 2.11 Backend API Contract

This section defines the backend endpoints that serve the frontend dashboard (see `FRONTEND_DESIGN_SPEC.md`). Endpoints for the manual lookup tool (section 2.8) and public card catalog (section 2.9) are defined in their respective sections and not repeated here.

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
| `/api/status` | GET | Bearer token | System health |
| `/api/preferences` | GET/PUT | Bearer token | User preferences |
| `/api/notifications/telegram/test` | POST | Bearer token | Test Telegram config |
| `/api/notifications/telegram/status` | GET | Bearer token | Telegram health |
| `/api/lookup` | POST | Bearer token | Manual listing lookup (§2.8) |
| `/api/catalog/expansions` | GET | None (public) | Expansion list (§2.9) |
| `/api/catalog/expansions/:id` | GET | None (public) | Expansion detail (§2.9) |
| `/api/catalog/cards/search` | GET | None (public) | Card search (§2.9) |
| `/api/catalog/cards/:id` | GET | None (public) | Card detail (§2.9) |
| `/api/catalog/trending` | GET | None (public) | Price movers (§2.9) |

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
| **Title parsing** | 50+ regexes, single confidence score | Regex + structured data, per-field confidence |
| **Pokemon name matching** | Hardcoded ~300 names | Driven by local card index (~35,000 cards) |
| **Set name matching** | 9 era-specific regexes | Driven by local expansion catalog |
| **Match fallbacks** | 6 cascading strategies, thresholds lowered over time | Number-first candidate lookup, strict disambiguation, prefer "no match" over wrong match |
| **Name similarity threshold** | 0.25-0.30 | **0.60 minimum** |
| **Cost of a rejected match** | 1-6 wasted API credits | **Zero** (local query) |
| **Confidence scoring** | Single parse confidence (0-100) | Composite weighted geometric mean per field |
| **Confidence response** | Binary pass/fail at 28% | 4-tier graduated response (high/med/low/reject) |
| **Architecture** | God object (ArbitrageEngine, 1800 lines) | 5 separate layers, each independently testable |
| **Accuracy measurement** | None (only diagnostic stage counters) | Automated checks + manual review sampling + regression corpus |
| **State management** | In-memory Maps, lost on restart | PostgreSQL on Railway — persistent across redeploys |
| **Expansion updates** | Requires code change + redeploy | Automated daily sync |
| **Scan throughput** | Limited by Scrydex credit budget | **Limited only by eBay rate limits** (Scrydex is no longer a bottleneck) |
| **Deployment** | Manual (not documented) | GitHub → Railway auto-deploy, GitHub Actions CI with accuracy gate |
| **Database** | None (in-memory) | Managed PostgreSQL on Railway with trigram + FTS indexes |
| **Secrets management** | Hardcoded or .env file | Railway environment variables, never in repo |
