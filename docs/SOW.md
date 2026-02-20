# PokeSnipe v2 — Scope of Works (SOW)

## Master Build Specification

**Version**: 1.0
**Status**: Draft — Pending Approval
**Repository**: New greenfield repo
**Deployment**: Railway (single service + Redis)

---

## 1. Project Overview

### Purpose
PokeSnipe v2 is a Pokemon TCG arbitrage platform that:
- Ingests authoritative card catalog data from Scrydex
- Discovers underpriced listings on eBay UK
- Scores and ranks profitable buying opportunities
- Tracks card inventory and realized profit

### North-Star Metrics
- Deals surfaced per day: 40-60 (up from ~10-20)
- 7-day accuracy: >85%
- Graded deal share: >20% (up from ~5%)
- Median condition of deals: LP-NM (up from LP)

### Pain Points Being Solved
1. Many listings skipped as duplicates (over-aggressive dedup)
2. Too few listings pass gating (binary gates too strict)
3. Too many listings have low card condition (no condition-targeted queries)
4. Too few graded listings (no graded-specific search strategy)

---

## 2. Technical Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Frontend** | User-provided HTML mockup | - | Served as static files by Fastify |
| **Backend** | Fastify | 5.x | High-performance, schema-first, native TypeScript |
| **Language** | TypeScript | 5.9+ | Strict mode, shared types between client/server |
| **Database** | PostgreSQL | 16+ | Railway-managed |
| **ORM** | Drizzle ORM | Latest | Type-safe SQL, schema-as-code, kit migrations |
| **Job Queue** | BullMQ | Latest | Redis-backed, retries, scheduling, concurrency |
| **Cache/Queue** | Redis | 7+ | Railway-managed, used by BullMQ + caching |
| **Auth** | Session cookies | - | Password-per-user, `connect-pg-simple` session store |
| **Validation** | Zod | Latest | Request/response schema validation |
| **Logging** | Pino | Latest | Structured JSON logs, Fastify-native |
| **Rate Limiting** | Bottleneck | 2.x | API client rate limiting (eBay, Scrydex) |
| **Testing** | Vitest | Latest | Unit + integration tests |
| **Deployment** | Railway | - | Docker, single service + Redis addon |
| **Container** | Docker | - | Multi-stage build (build → production) |

### Monorepo Structure
```
pokesnipe-v2/
├── package.json              # Root: backend deps + scripts
├── tsconfig.json             # Backend TypeScript config
├── drizzle.config.ts         # Drizzle ORM config
├── Dockerfile                # Multi-stage (build client → build server → run)
├── railway.toml              # Railway deployment config
├── .env.example              # Required environment variables
├── src/                      # Backend source
│   ├── server.ts             # Fastify entry point + boot sequence
│   ├── config/               # Zod-validated env config
│   ├── db/
│   │   ├── index.ts          # Drizzle client + pool
│   │   └── schema/           # Drizzle table definitions (schema-as-code)
│   ├── routes/               # Fastify route plugins (auto-prefixed)
│   ├── middleware/            # Auth, validation hooks
│   ├── services/             # Business logic layer
│   │   ├── scrydex/          # Scrydex API client
│   │   ├── ebay/             # eBay API client + OAuth
│   │   ├── sync/             # Catalog sync orchestration
│   │   ├── scanner/          # eBay scanning pipeline
│   │   ├── extraction/       # Signal extraction (title, condition, grading, etc.)
│   │   ├── matching/         # Card matching engine
│   │   ├── scoring/          # Deal scoring (replaces binary gating)
│   │   ├── pricing/          # Profit calculation + fees
│   │   ├── liquidity/        # Liquidity scoring
│   │   ├── inventory/        # Inventory management
│   │   ├── notifications/    # Telegram alerts
│   │   └── exchange-rate/    # GBP/USD conversion
│   ├── jobs/                 # BullMQ job definitions + workers
│   ├── utils/                # Shared helpers
│   └── __tests__/            # Backend tests
├── client/                   # User-provided HTML mockup
│   └── dist/                 # Static files served by Fastify
└── migrations/               # Drizzle Kit SQL migrations (generated)
```

### Deployment Architecture
```
Railway Service (Single Container)
├── Fastify Server (port 3000)
│   ├── API routes (/api/*)
│   ├── Static file serving (client/dist/)
│   ├── SSE endpoint (/api/deals/stream)
│   └── BullMQ workers (in-process)
├── PostgreSQL (Railway addon)
└── Redis (Railway addon)
```

### Environment Variables
```
# Required
DATABASE_URL=postgresql://...        # Railway-provided
REDIS_URL=redis://...                # Railway-provided
ACCESS_PASSWORD=<min 8 chars>        # Initial user password
SESSION_SECRET=<min 32 chars>        # Cookie signing

# Scrydex
SCRYDEX_API_KEY=<key>
SCRYDEX_TEAM_ID=<team>

# eBay
EBAY_CLIENT_ID=<id>
EBAY_CLIENT_SECRET=<secret>

# Exchange Rate
EXCHANGE_RATE_API_KEY=<key>

# Optional
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_ID=<chat_id>
NODE_ENV=production|development
PORT=3000
```

---

## 3. Development Stages

### CRITICAL RULES
- Stages are built in strict sequential order (1 → 2 → 3 → 4 → 5 → 6)
- Each stage is independently deployable to Railway
- No stage may depend on a later stage's implementation
- Each stage gets its own set of commits
- No business logic in Stage 1
- No API integrations in Stage 1

---

### Stage 1 — Project Scaffolding + Serve Mockup

**Goal**: Backend project scaffolding. Fastify server serves the user's existing HTML mockup as static files. No backend business logic, no database, no API integrations.

**Frontend**: The HTML mockup is user-provided and defines all frontend design, layout, and interaction. This SOW does not specify frontend UI elements — it specifies backend services, API routes, and the contracts between them.

**What Gets Built**:

1. **Project Scaffolding**
   - Initialize monorepo (`package.json` root)
   - TypeScript + ESLint + Prettier config
   - Fastify server that serves static files from `client/dist/`
   - Dockerfile (multi-stage: build server → copy client → run)
   - `railway.toml` config
   - `.env.example`

2. **Static File Serving**
   - Fastify serves the user's HTML mockup from `client/dist/`
   - All client-side routes handled by serving `index.html` as fallback

3. **Routes** (URL paths the frontend uses)
   - `/login`
   - `/` — Dashboard
   - `/expansions` — Expansions browser
   - `/expansions/:id` — Expansion detail
   - `/expansions/:id/cards/:cardId` — Card detail
   - `/inventory`
   - `/api-tools` — API Tools (Scrydex | eBay | Matcher tabs)
   - `/arbitrage`
   - `/settings`

**What Does NOT Get Built**:
- No database connection
- No API routes (except static file serving)
- No Scrydex/eBay integration
- No real authentication backend
- No business logic

**Acceptance Criteria**:
- [ ] `npm run build` produces compiled server
- [ ] `npm start` runs Fastify, serves HTML mockup, all routes accessible
- [ ] Docker build succeeds
- [ ] Deploys to Railway successfully

---

### Stage 2 — Scrydex API Raw Integration Tool

**Goal**: Authoritative card dataset ingestion. Query Scrydex, store raw payloads, display results.

**What Gets Built**:

1. **Database Foundation**
   - PostgreSQL connection via Drizzle ORM
   - Drizzle schema definitions for:
     - `users` (id, username, password_hash, created_at)
     - `sessions` (connect-pg-simple session store)
     - `scrydex_raw_payloads` (id, endpoint, params, response JSONB, fetched_at)
     - `expansions` (scrydex_id, name, series, code, printed_total, total, release_date, language_code, is_online_only, logo_url, symbol_url, synced_at)
     - `cards` (id, scrydex_card_id, name, number, number_normalized, printed_number, supertype, subtypes, types, rarity, artist, hp, expansion_id FK, image_small/medium/large, market_price_usd, raw_data JSONB, synced_at)
     - `variants` (id, card_id FK, name, image_small/medium/large, prices JSONB, graded_prices JSONB, trends JSONB, synced_at)
     - `sync_log` (id, job_type, status, duration_ms, items_processed, errors JSONB, metadata JSONB, created_at)
   - Drizzle Kit migrations (`drizzle-kit generate` + `drizzle-kit migrate`)
   - Auto-migration on boot

2. **Real Authentication**
   - Password hashing (bcrypt)
   - Session-based auth (Fastify session plugin + connect-pg-simple)
   - Login/logout API routes
   - Auth middleware (Fastify `onRequest` hook)
   - Initial user seed from `ACCESS_PASSWORD` env var

3. **Scrydex API Client** (`src/services/scrydex/client.ts`)
   - HTTP client with `X-Api-Key` + `X-Team-ID` headers
   - Rate limiter: Bottleneck (100 req/sec, 10 concurrent)
   - Retry: exponential backoff (1s, 2s, 4s) on 429 and 5xx
   - Methods:
     - `listExpansions(page, pageSize)` → paginated expansion list
     - `getExpansion(id)` → single expansion
     - `listCards(expansionId, page, pageSize, includesPrices)` → paginated cards
     - `getCard(id, includesPrices)` → single card
     - `getListings(cardId, params)` → sold listings (3 credits)
     - `getUsage()` → credit consumption
   - All responses stored in `scrydex_raw_payloads` table

4. **Sync Service** (`src/services/sync/`)
   - `syncExpansions()`: Paginate all English expansions → upsert to `expansions` table
   - `syncCards(expansionId)`: Paginate cards with prices → upsert to `cards` + `variants` tables
   - `syncAll()`: Full catalog sync (all expansions → all cards)
   - Transformers: Scrydex response → normalized Drizzle schema
   - Log every sync to `sync_log` table

5. **BullMQ Job Infrastructure**
   - Redis connection
   - Job queue: `scrydex-sync`
   - Worker process (in-process with Fastify)
   - Jobs:
     - `full-sync`: Sync all expansions + cards (manual trigger or scheduled)
     - `expansion-sync`: Sync single expansion's cards
   - Job status tracking (BullMQ dashboard endpoint optional)

6. **API Routes** (`src/routes/scrydex.ts`)
   - `POST /api/scrydex/query/expansions` — Query Scrydex expansions (proxy with raw response)
   - `POST /api/scrydex/query/cards` — Query Scrydex cards (proxy with raw response)
   - `POST /api/scrydex/query/card/:id` — Query single card (proxy with raw response)
   - `GET /api/scrydex/usage` — Get Scrydex credit usage
   - `POST /api/scrydex/sync/full` — Trigger full catalog sync (enqueues BullMQ job)
   - `POST /api/scrydex/sync/expansion/:id` — Trigger single expansion sync
   - `GET /api/scrydex/sync/status` — Get latest sync_log entries
   - All routes require auth

7. **Connect Mockup — Scrydex Tab**
   - Connect existing mockup to Scrydex API endpoints listed above

**Scrydex API Integration Details** (from repo docs):
- Base URL: `https://api.scrydex.com`
- Auth headers: `X-Api-Key`, `X-Team-ID`
- Pagination: page-based, max 100/page, continue until received < pageSize
- Credits: 1/request general, 3/request for listings
- Rate limit: 100 req/sec
- Date format: `YYYY/MM/DD` (parse to ISO)
- Lucene search syntax on `q` parameter
- `?include=prices` required for variant pricing
- English scope: `/pokemon/v1/en/...`
- Filter: `language_code === 'EN'`, exclude `is_online_only === true`

**What Does NOT Get Built**:
- No eBay integration
- No arbitrage logic
- No inventory
- No Telegram notifications

**Acceptance Criteria**:
- [ ] Auth works: login, logout, protected routes redirect to login
- [ ] Scrydex API queries execute and return raw JSON
- [ ] Raw payloads stored in `scrydex_raw_payloads` table
- [ ] Full sync ingests ~350 expansions, ~35k cards, ~70k variants
- [ ] Sync progress visible in sync_log
- [ ] Scrydex API endpoints return raw JSON, parsed data, and credit usage
- [ ] Rate limiting prevents exceeding 100 req/sec
- [ ] Retry works on 429/5xx responses
- [ ] BullMQ job runs full sync in background without blocking API

---

### Stage 3 — eBay API Raw Enrichment Tool

**Goal**: Market listing ingestion. Fetch eBay data, store raw payloads, link to cards.

**What Gets Built**:

1. **Database Additions**
   - `ebay_raw_payloads` (id, endpoint, params, response JSONB, fetched_at)
   - `ebay_listings` (id, ebay_item_id, title, price_value, price_currency, shipping_cost, condition_text, condition_descriptors JSONB, seller_username, seller_feedback_score, category_id, item_location, image_url, ebay_url, buying_options, listed_at, raw_data JSONB, fetched_at)
   - `ebay_listing_cards` (id, ebay_listing_id FK, card_id FK, match_confidence, match_method, matched_at) — link table
   - `exchange_rates` (id, from_currency, to_currency, rate, fetched_at)

2. **eBay API Client** (`src/services/ebay/client.ts`)
   - OAuth2 client credentials flow (client_id + client_secret → bearer token)
   - Token caching: refresh 5min before expiry
   - Rate limiter: Bottleneck (5 req/sec, 5 concurrent)
   - Retry: exponential backoff on 429 (respect Retry-After header)
   - Methods:
     - `searchItems(query, filters, sort, limit)` → search results
     - `getItem(itemId)` → enriched item detail (condition descriptors, aspects, description)
   - All responses stored in `ebay_raw_payloads` table
   - Daily call counter (5,000/day budget)

3. **Search Strategies** (`src/services/ebay/query-strategies.ts`)
   Three query configurations:
   - **Graded**: `"pokemon psa cgc bgs sgc graded slab"`, category 183454, deliveryCountry:GB, FIXED_PRICE
   - **NM-Targeted**: `"pokemon card"`, conditions:{NEW|LIKE_NEW}, category 183454, deliveryCountry:GB, FIXED_PRICE
   - **General**: `"pokemon card"`, category 183454, deliveryCountry:GB, FIXED_PRICE
   All use `sort=newlyListed`

4. **Signal Extraction** (`src/services/extraction/`)
   Port and improve from current codebase:
   - `title-cleaner.ts` — Unicode normalization, emoji strip, HTML decode, collapse whitespace
   - `junk-detector.ts` — Phase 1 (title: bulk, fake, non-card, non-English) + Phase 2 (description: fake)
   - `number-extractor.ts` — Card number patterns (fraction, hash, promo)
   - `variant-detector.ts` — Holofoil, reverse, 1st edition, full art, alt art, etc.
   - `condition-mapper.ts` — 5-priority chain (descriptors → aspects → conditionText → title → default) + grading detection
   - `structured-extractor.ts` — localizedAspects parsing
   - `signal-merger.ts` — Combine title + structured + descriptor signals

5. **Basic Card Matching** (`src/services/matching/`)
   Simplified matching for this stage (full scoring engine in Stage 5):
   - Match by card number + set name
   - Match by card number + denominator
   - Fuzzy name match (pg_trgm)
   - Store match in `ebay_listing_cards` with confidence + method

6. **Exchange Rate Service**
   - Fetch USD/GBP rate from ExchangeRate API
   - Cache in `exchange_rates` table
   - Refresh every 4 hours
   - BullMQ recurring job

7. **BullMQ Jobs**
   - `ebay-search`: Execute search queries, store results (manual trigger for now)
   - `ebay-enrich`: Fetch getItem for specific listing (manual trigger)
   - `exchange-rate-refresh`: Recurring every 4h

8. **API Routes** (`src/routes/ebay.ts`)
   - `POST /api/ebay/search` — Execute eBay search with query params (returns raw + parsed)
   - `POST /api/ebay/item/:id` — Fetch enriched item detail
   - `GET /api/ebay/listings` — List stored eBay listings (paginated)
   - `GET /api/ebay/listings/:id` — Get single listing with match info
   - `GET /api/ebay/budget` — Daily call count and remaining budget
   - `POST /api/ebay/search/graded` — Execute graded search strategy
   - `POST /api/ebay/search/nm` — Execute NM-targeted search strategy
   - `POST /api/ebay/search/general` — Execute general search strategy

9. **Connect Mockup — eBay Tab**
   - Connect existing mockup to eBay API endpoints listed above

10. **Card Matcher Service** (`src/services/matcher/`)
    - Accepts raw eBay API JSON (single item — either search result or enriched `getItem` format)
    - Normalizes input into the shape expected by the extraction pipeline:
      - Maps `condition` string → `conditionText` for Priority 3 condition chain
      - Normalizes `conditionDescriptors` format variations (both `{ values: [{ content: "..." }] }` and `{ value: "..." }` shapes)
      - Passes through `localizedAspects` for structured extraction
    - Pipes through existing extraction pipeline (`extractSignals()`) → `NormalizedListing`
    - Pipes through existing matching pipeline (`matchListing()`) → `MatchResult | null`
    - Returns: extraction output, match result (card + variant + confidence signals), condition assessment with priority level source
    - No live eBay API calls — uses pasted JSON as input
    - Uses already-synced Scrydex data in database for card lookup

11. **Matcher API Route** (`src/routes/matcher.ts`)
    - `POST /api/matcher` — Accept raw eBay JSON, run extraction + matching, return full results
    - Request: `{ item: <raw eBay JSON object> }`
    - Response: extraction results, match results (or null), confidence breakdown, condition assessment
    - Requires auth

12. **Connect Mockup — Matcher Tab**
    - Connect existing mockup to `POST /api/matcher` endpoint

**What Does NOT Get Built**:
- No automated scanning (scanner loop)
- No deal scoring or profit calculation
- No arbitrage pipeline
- No Telegram alerts
- No inventory

**Acceptance Criteria**:
- [ ] eBay OAuth token acquired and cached
- [ ] All 3 search strategies return listings
- [ ] Raw payloads stored in `ebay_raw_payloads`
- [ ] Listings parsed and stored in `ebay_listings`
- [ ] Enrichment (getItem) returns condition descriptors and aspects
- [ ] Signal extraction works: condition, grading, card number, variant detected
- [ ] Basic card matching links listings to cards with confidence
- [ ] eBay API endpoints return search results, raw JSON, and parsed listings
- [ ] Rate limiting prevents exceeding 5 req/sec
- [ ] Budget counter tracks daily API usage
- [ ] Exchange rate refreshes every 4h
- [ ] Card Matcher: pasting eBay search result JSON returns correct card match with confidence breakdown
- [ ] Card Matcher: pasting eBay enriched item JSON returns correct card match with condition from descriptors (priority 1)
- [ ] Card Matcher: condition priority source correctly reported (1-5 scale)
- [ ] Card Matcher: achieves ≥85% match success rate on test corpus of 50+ real eBay listings

---

### Stage 4 — Expansion & Card Database (Browsable Layer)

**Goal**: Browsable catalog. Expansion list, expansion detail, card pages with Scrydex + eBay data.

**What Gets Built**:

1. **API Routes — Catalog** (`src/routes/catalog.ts`)
   - `GET /api/expansions` — List all expansions (grouped by series, sorted by release date)
   - `GET /api/expansions/:id` — Expansion detail + card count + price stats
   - `GET /api/expansions/:id/cards` — Cards in expansion (paginated, sortable, filterable)
   - `GET /api/cards/search` — Search cards across all expansions (full-text search with pg_trgm)
   - `GET /api/cards/:id` — Card detail with all variants, prices, trends, linked eBay listings
   - `GET /api/cards/:id/raw` — Raw Scrydex payload for card
   - `GET /api/cards/:id/ebay` — Linked eBay listings for card

2. **Connect Mockup — Expansions Page**
   - Connect existing mockup to catalog API endpoints listed above

3. **Connect Mockup — Expansion Detail Page**
   - Connect existing mockup to catalog API endpoints listed above

4. **Connect Mockup — Card Detail Page**
   - Connect existing mockup to catalog API endpoints listed above

5. **Database Additions**
   - Full-text search index: `CREATE INDEX ... USING gin (name gin_trgm_ops)` on cards table
   - Views or materialized views for expansion stats (card count, avg price, etc.)

7. **BullMQ Jobs** (evolved)
   - `full-sync` now also triggers after deploy if catalog is empty
   - `hot-refresh`: Daily sync of 10 most recent expansions (cron: `0 3 * * *`)
   - `expansion-check`: Daily check for new expansions (cron: `0 4 * * *`)

**What Does NOT Get Built**:
- No arbitrage scoring
- No deal creation
- No inventory
- No Telegram alerts

**Acceptance Criteria**:
- [ ] `GET /api/expansions` returns all ~350 English expansions grouped by series
- [ ] `GET /api/expansions/:id/cards` returns all cards with correct pricing
- [ ] `GET /api/cards/:id` returns all variants, prices, graded prices, trends
- [ ] `GET /api/cards/:id/ebay` returns linked eBay listings (from Stage 3 data)
- [ ] `GET /api/cards/:id/raw` returns full Scrydex JSON payload
- [ ] `GET /api/cards/search` returns fuzzy-matched results via pg_trgm
- [ ] Sorting and filtering query params work on all list endpoints
- [ ] Hot refresh runs daily and updates recent sets
- [ ] All API responses return within 2 seconds

---

### Stage 5 — eBay Arbitrage Tool (Option A: Multi-Query Scoring Engine)

**Goal**: Automated deal discovery. Multi-query scanning, soft scoring, prioritized enrichment, real-time alerts.

**What Gets Built**:

1. **Database Additions**
   - `deals` table:
     - id, ebay_item_id, fingerprint, query_source ('graded'|'nm_targeted'|'general')
     - card_id FK, variant_id FK, status ('active'|'reviewed'|'expired')
     - title, listing_price_gbp, shipping_price_gbp, total_cost_gbp
     - seller_id, seller_name, ebay_url, image_url
     - deal_score (composite [0,1]), confidence, match_signals JSONB
     - profit_pct, profit_gbp, market_price_gbp, tier ('GRAIL'|'HIT'|'FLIP'|'SLEEP')
     - condition, condition_source, is_graded, grading_company, grade, cert_number
     - liquidity_score, liquidity_grade, liquidity_signals JSONB
     - is_enriched, enriched_at
     - review_status, review_reason, reviewed_at
     - created_at, expires_at
   - `seen_items` table: ebay_item_id PK, fingerprint, first_seen, last_seen
   - `enrichment_cache` table: ebay_item_id PK, response_data JSONB, fetched_at
   - `velocity_cache` table: card_id, variant_name, sales_7d, sales_30d, median_price, avg_days_between, fetched_at, expires_at
   - `confusion_pairs` table: ebay_card_id, correct_card_id, reason, created_at
   - `junk_reports` table: ebay_item_id, seller_id, reason, learned_tokens TEXT[], created_at
   - `weight_overrides` table: signal_name, weight, previous_weight, applied_at

2. **Content Fingerprint Dedup** (`src/services/scanner/dedup-service.ts`)
   - Two-layer dedup:
     - Layer 1: Exact item_id match (DB lookup, not in-memory)
     - Layer 2: Content fingerprint — `SHA256(normalizedTitle | sellerId | priceBucket)`
   - 48h window for fingerprint matching
   - Hourly cleanup: delete `seen_items` older than 7 days
   - Track dedup reason (exact_item_id vs content_fingerprint) for metrics

3. **Scoring Engine** (`src/services/scoring/deal-scorer.ts`)
   - Replaces binary gating with composite deal_score [0, 1]:
     - 0.30 x confidence (match quality)
     - 0.30 x normalized_profit (0% = 0.0, 50%+ = 1.0)
     - 0.20 x liquidity_score
     - 0.10 x condition_bonus (NM=1.0, LP=0.7, MP=0.4, HP=0.2, DM=0.0)
     - 0.10 x graded_bonus (graded=1.0, raw=0.0)
     - +0.05 enrichment bonus if enriched
   - Very soft floor: skip only if confidence < 0.40 (vs current 0.65)
   - No binary enrichment gate — enrichment is prioritized by score

4. **Scanner Pipeline** (`src/services/scanner/scanner-service.ts`)
   - BullMQ recurring job: every 5 minutes
   - Multi-query strategy:
     - Every cycle: general search (200 items)
     - Every 3rd cycle (15min): graded search (100 items) + NM search (100 items)
   - Pipeline stages:
     1. Multi-query fetch
     2. Two-layer dedup (item_id + fingerprint)
     3. Junk filter Phase 1 (title-based)
     4. Signal extraction (with query-context condition prior)
     5. Card matching + confidence scoring
     6. Deal scoring (composite score)
     7. Prioritized enrichment (top N by deal_score, budget-aware)
     8. Re-score with enriched signals
     9. Deal creation + tier classification
     10. Notifications (Telegram for GRAIL/HIT)
     11. SSE broadcast

5. **Improved Grading Detection** (`src/services/extraction/condition-mapper.ts`)
   - Relaxed title patterns: match with or without space (`PSA10`, `PSA 10`)
   - Text grades: `gem mint`, `mint`, `pristine`
   - Contextual: `graded 10`, `slab`, `slabbed`, cert number patterns
   - Query-context boost: listings from graded query with weak grading signals → flag for priority enrichment

6. **Improved Condition Assessment**
   - Query-context prior: NM-targeted search results default to NM (not LP) when no condition signal
   - Graded default: graded cards default to NM
   - Seller history heuristic: if seller has 5+ enriched listings, use their median condition as prior
   - Still falls back to LP as last resort

7. **Pricing Engine** (`src/services/pricing/pricing-engine.ts`)
   - Market price lookup from variant prices (condition-specific)
   - Graded price lookup from variant graded_prices (company + grade specific)
   - Fee calculation: eBay buyer protection (tiered UK schedule) + shipping
   - FX conversion: USD → GBP via exchange_rates table
   - Profit calculation: market_price_gbp - total_cost_gbp

8. **Liquidity Engine** (`src/services/liquidity/`)
   - 6 signals:
     - Trend activity (6 time windows from Scrydex trends)
     - Price completeness (conditions with pricing)
     - Price spread (low-to-market ratio)
     - eBay supply (listings in current batch)
     - Quantity sold (from eBay data)
     - Sales velocity (Scrydex listings endpoint, 3 credits, cached 7 days)
   - Composite score [0, 1] → grade (High/Medium/Low/Illiquid)
   - Illiquid cards capped at SLEEP tier

9. **Feedback System**
   - Deal review: correct/incorrect with reason
   - Confusion pairs: store wrong matches for penalty in future scoring
   - Junk reports: extract novel tokens for learned junk scoring
   - Seller reputation: 3+ junk reports → seller penalty
   - Weight calibration: daily job learns optimal confidence weights from reviewed deals

10. **Notification Service** (`src/services/notifications/telegram.ts`)
    - Telegram bot messages for GRAIL/HIT deals
    - Message format: card name, eBay price, market price, profit %, link
    - 30s cooldown between messages
    - Configurable tier threshold
    - Test endpoint for credential verification

11. **API Routes** (`src/routes/deals.ts`, `src/routes/arbitrage.ts`)
    - `GET /api/deals` — List deals (paginated, filterable by tier/condition/graded/query_source)
    - `GET /api/deals/:id` — Deal detail (full breakdown)
    - `GET /api/deals/stream` — SSE real-time deal feed
    - `PUT /api/deals/:id/review` — Submit review feedback
    - `POST /api/lookup` — Manual eBay URL evaluation
    - `GET /api/arbitrage/status` — Scanner status, budget, accuracy, pipeline metrics
    - `POST /api/arbitrage/scanner/pause` — Pause/resume scanner
    - `GET /api/arbitrage/metrics` — Pipeline funnel metrics

12. **Connect Mockup — Dashboard Page**
    - Connect existing mockup to deals + arbitrage API endpoints listed above

13. **Connect Mockup — Arbitrage Page**
    - Connect existing mockup to arbitrage API endpoints listed above

14. **BullMQ Jobs** (full set)
    - `ebay-scan`: Every 5min — scanner cycle
    - `deal-cleanup`: Every hour — expire old deals, prune stale data, clean seen_items
    - `exchange-rate`: Every 4h — refresh GBP/USD
    - `hot-refresh`: Daily 03:00 — sync 10 recent expansions
    - `expansion-check`: Daily 04:00 — detect new Scrydex expansions
    - `weight-calibration`: Daily 05:00 — learn confidence weights from feedback
    - `full-sync`: Weekly Sun 03:00 — complete catalog refresh
    - `velocity-prefetch`: Weekly Sun 05:00 — cache velocity for top 200 cards
    - `accuracy-check`: Every 6h — alert if 7-day accuracy drops
    - `card-index-check`: Every 12h — alert if no sync >48h

**Acceptance Criteria**:
- [ ] Scanner runs every 5 minutes with multi-query strategy
- [ ] Graded search produces measurable graded deals (>10% of total)
- [ ] NM-targeted search shifts condition distribution toward NM
- [ ] Content fingerprint dedup working (false positive rate <5%)
- [ ] Deal scoring ranks all matched listings (no binary gate)
- [ ] Enrichment prioritized by deal_score (top N per cycle)
- [ ] Telegram alerts fire for GRAIL/HIT deals
- [ ] SSE stream delivers real-time deal updates
- [ ] Feedback system records reviews and updates confusion pairs
- [ ] All BullMQ jobs run on schedule
- [ ] API budget stays under 60% (3,000 of 5,000 calls/day)

---

### Stage 6 — Inventory Management System

**Goal**: Operational layer for tracking purchased cards, costs, and profit.

**What Gets Built**:

1. **Database Additions**
   - `inventory_items` table:
     - id, card_id FK, variant_id FK
     - status ('owned'|'listed'|'sold')
     - is_graded, grading_company, grade, cert_number
     - purchase_price_gbp, purchase_date, purchase_source (manual|arbitrage|ebay_url)
     - listing_price_gbp, listed_at, listing_url
     - sale_price_gbp, sale_date, sale_platform
     - fees_gbp (auto-calculated based on platform)
     - net_profit_gbp (auto: sale_price - purchase_price - fees)
     - notes
     - deal_id FK (nullable — link to arbitrage deal if sourced from scanner)
     - created_at, updated_at

2. **Inventory Service** (`src/services/inventory/`)
   - CRUD operations for inventory items
   - Auto-link to card record via card_id
   - Fee calculation per platform (eBay UK fee schedule)
   - Net profit auto-calculation on sale
   - Stats aggregation:
     - Total inventory value (sum of purchase prices for owned items)
     - Cost basis (sum of all purchase prices)
     - Realized profit (sum of net_profit for sold items)
     - Unrealized profit (sum of market_value - purchase_price for owned items)
     - Breakdown by expansion, graded vs raw, grading company

3. **API Routes** (`src/routes/inventory.ts`)
   - `GET /api/inventory` — List inventory items (paginated, filterable, sortable)
   - `GET /api/inventory/:id` — Item detail
   - `POST /api/inventory` — Add item (manual entry)
   - `PUT /api/inventory/:id` — Update item (change status, add sale info)
   - `DELETE /api/inventory/:id` — Remove item
   - `POST /api/inventory/from-deal/:dealId` — Create inventory item from arbitrage deal
   - `GET /api/inventory/stats` — Aggregated statistics
   - `GET /api/inventory/export` — CSV export

4. **Connect Mockup — Inventory Page**
   - Connect existing mockup to inventory API endpoints listed above

5. **Deal → Inventory Integration**
   - "Add to Inventory" button on deal detail panel
   - Pre-fills: card, variant, condition/grading, purchase price (eBay price + shipping + fees)
   - Sets source = 'arbitrage', links deal_id

**Acceptance Criteria**:
- [ ] Can add inventory items manually with all required fields
- [ ] Can create inventory item from arbitrage deal (pre-filled)
- [ ] Status transitions work (owned → listed → sold)
- [ ] Fees and net profit auto-calculated
- [ ] Stats dashboard shows accurate totals
- [ ] Breakdowns by expansion, graded/raw, grading company are correct
- [ ] CSV export works
- [ ] Card search typeahead returns relevant results
- [ ] Inventory list filters and sorts correctly

---

## 4. Cross-Cutting Concerns

### Observability

| Metric | Type | Alert |
|--------|------|-------|
| `scanner.cycle.listings_found` | Counter (per query_source) | <10 for 3 consecutive cycles |
| `scanner.cycle.duplicates_skipped` | Counter (per reason) | >80% = investigate |
| `scanner.cycle.deals_created` | Counter (per tier, query_source) | 0 for 6 consecutive |
| `scanner.dedup.false_positive_rate` | Gauge | >5% |
| `ebay.api.calls_today` | Counter | >4,000 warning |
| `ebay.api.429_count` | Counter | >3 consecutive = circuit breaker |
| `scrydex.credits.used_month` | Gauge | >40,000 warning |
| `deals.accuracy.7day` | Gauge | <80% |
| `deals.graded_share` | Gauge | <10% |
| `deals.condition_distribution` | Histogram | >50% LP+MP+HP |

### Testing Strategy

| Stage | Tests |
|-------|-------|
| 1 | Server starts, static files served, Docker builds |
| 2 | Scrydex client (mocked HTTP), transformer unit tests, sync integration test |
| 3 | eBay client (mocked HTTP), signal extraction unit tests, matching unit tests |
| 4 | Catalog API route tests, search functionality |
| 5 | Full scanner pipeline integration test (recorded fixtures), scoring unit tests, dedup unit tests, grading detection unit tests |
| 6 | Inventory CRUD, fee calculation, profit calculation, stats aggregation |

### Security
- All API keys in environment variables (validated at boot via Zod)
- Passwords hashed with bcrypt (cost factor 12)
- Session cookies: HttpOnly, Secure, SameSite=Strict, 7-day expiry
- Parameterized queries via Drizzle ORM (SQL injection safe)
- Zod validation on all API inputs
- Helmet security headers
- No PII beyond usernames

### Rate Limit Safety
- eBay: Bottleneck 5 req/sec + daily counter + circuit breaker on 3x 429
- Scrydex: Bottleneck 100 req/sec + monthly credit counter
- ExchangeRate: Simple 4h interval

---

## 5. Success Metrics (Definition of Done for Full System)

| Pain Point | Metric | Target | How Measured |
|------------|--------|--------|--------------|
| #1: Over-dedup | False positive dedup rate | <5% | Sample 100 skipped listings weekly |
| #1: Over-dedup | Unique listings processed/cycle | 200-300 | Scanner metrics |
| #2: Gating scarcity | Deals created/day | 40-60 | Daily deal count |
| #2: Gating scarcity | Enrichment coverage | Top 15-20 by score/cycle | Scanner metrics |
| #3: Low condition | NM share of deals | >40% | Condition distribution |
| #3: Low condition | Median condition score | >0.85 (LP-NM) | Condition scoring |
| #4: Low graded | Graded deal share | >20% | is_graded percentage |
| #4: Low graded | Graded deals/day | >8 | Daily graded count |
| Overall | 7-day accuracy | >85% | Reviewed deal accuracy |
| Overall | Time to deal | <10min | listing_date to deal creation |
| Overall | Budget efficiency | <60% of daily eBay budget | API call count |

---

## 6. Appendix: Scrydex API Reference (Key Endpoints)

| Endpoint | Method | Credits | Description |
|----------|--------|---------|-------------|
| `/pokemon/v1/en/expansions` | GET | 1/page | List English expansions |
| `/pokemon/v1/en/expansions/{id}` | GET | 1 | Single expansion |
| `/pokemon/v1/en/expansions/{id}/cards?include=prices` | GET | 1/page | Cards in expansion with pricing |
| `/pokemon/v1/cards/{id}` | GET | 1 | Single card |
| `/pokemon/v1/cards/{id}/listings` | GET | 3 | Sold listings (velocity data) |
| `/account/v1/usage` | GET | 1 | Credit consumption |

- Auth: `X-Api-Key` + `X-Team-ID` headers on every request
- Rate: 100 req/sec (all plans)
- Credits: 50,000/month
- Pagination: `page` + `page_size` (max 100)
- Search: Lucene syntax on `q` parameter
- Dates: `YYYY/MM/DD` format
