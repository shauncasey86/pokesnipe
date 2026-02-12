# PokeSnipe — Feature Overview

> Automatically find profitable Pokemon cards on eBay by comparing real market prices, then get alerted in real-time so you can buy before competitors.

---

## Deal Discovery Scanner

The core engine that runs every 5 minutes, searching eBay for newly-listed Pokemon cards and evaluating them against real market data.

### Two-Phase Evaluation

- **Phase 1 — Broad Search:** Scans up to 200 newly-listed eBay cards per cycle. Extracts signals from the title, filters out junk/bundles/non-cards, matches against the local card database, and runs a quick profit estimate. Roughly half of listings are rejected at this stage.
- **Phase 2 — Targeted Enrichment:** For listings showing strong profit potential, fetches detailed eBay data (structured item specifics, condition descriptors, grading info) and re-evaluates with higher accuracy. Only ~10 listings per cycle are enriched, keeping API costs low.

### Signal Extraction

From every eBay listing, the scanner extracts:

- Card name, number, and set
- Condition (Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged)
- Grading details (PSA, CGC, BGS grades and certification numbers)
- Variant type (holofoil, reverse holo, 1st edition, full art, alt art, etc.)
- Listing price, shipping cost, seller info, and images
- Rarity, language, and year from structured eBay fields

### Condition Detection

A 5-priority fallback chain ensures the most accurate condition classification:

1. eBay condition descriptors (numeric IDs — most reliable)
2. eBay localised item aspects (seller-filled dropdowns)
3. eBay condition text field
4. Title keyword parsing (regex patterns)
5. Default to Lightly Played (conservative assumption)

Supports both numeric descriptor IDs and text-based names. Graded cards are automatically detected and priced against graded market values. Unknown descriptors are logged for visibility rather than silently dropped.

---

## Matching Engine

Matches eBay listing signals against a local database of 35,000+ Pokemon cards.

### Lookup Strategies

Four strategies tried in priority order:

1. **Number + Set Size** — Most specific (e.g., card 4 in a 102-card set)
2. **Number + Prefix** — For promo cards (SV065, SM60, SWSH050)
3. **Number Only** — Broad search, capped at 50 candidates
4. **Name Search** — Fuzzy matching via pg_trgm (handles misspellings like "Charzard")

### Confidence Scoring

A weighted composite score from 6 independent signals (name similarity, number match, set denomination, expansion match, variant match, extraction quality). Cards must meet a 0.65 minimum confidence threshold to create a deal.

- **High confidence (0.85+):** Auto-processed, shown prominently
- **Medium confidence (0.65–0.84):** Processed with caution badge
- **Low confidence (below 0.65):** Rejected, not shown

### Variant Resolution

Correctly distinguishes between card variants (holofoil vs. reverse holo vs. 1st edition). When multiple variants exist, defaults to the cheapest to ensure a conservative profit estimate.

---

## Pricing Engine

All profit calculations use real market prices per condition — no fabricated multipliers or guesses.

### Condition-Specific Pricing

Each card variant has independent market prices for NM, LP, MP, HP, and DM conditions. The engine uses the price matching the listing's detected condition, with a fallback chain (NM → LP → MP → HP → DM) when exact condition pricing is unavailable.

### Graded Card Pricing

When a graded card is detected (PSA, CGC, BGS, etc.), the engine uses graded market values (e.g., PSA 10 price) instead of raw condition prices. Falls back to raw pricing if the specific grade isn't priced.

### Fee-Inclusive Profit

Every profit calculation includes:

- eBay listing price
- Shipping cost
- Buyer protection fee (eBay UK tiered fee schedule)
- USD → GBP exchange rate conversion (refreshed hourly)

### Conservative Estimate

Each deal includes both a market-price profit and a conservative estimate using the lower-bound price from Scrydex, giving a realistic profit range rather than a single optimistic number.

### Deal Tiers

| Tier | Profit | Description |
|------|--------|-------------|
| **GRAIL** | >40% | Rare, chase-tier opportunity |
| **HIT** | 25–40% | Solid profitable deal |
| **FLIP** | 15–25% | Quick turnaround opportunity |
| **SLEEP** | 5–15% | Low-margin sleeper |

---

## Liquidity Engine

Assesses how quickly and easily a card can be resold, using 6 real data signals.

### Signals

- **Trend Activity** — Is the card's price actively moving? Checks 6 time windows (1 day, 7 days, 14 days, 30 days, 90 days, 180 days)
- **Price Completeness** — How many conditions have market pricing? Bonus credit for graded price data
- **Price Spread** — How tight is the low-to-market spread? Tighter spreads indicate more liquid markets
- **eBay Supply** — How many copies of this card appeared in the current scan batch?
- **Quantity Sold** — eBay's sold count for this specific listing
- **Sales Velocity** — Real sales data from Scrydex (how many sold in the last 7/30 days), fetched on-demand and cached for 7 days

### Liquidity Grades

- **High (0.75+)** — Actively traded, easy to resell
- **Medium (0.50–0.74)** — Moderate demand
- **Low (0.25–0.49)** — Thin market, may take time to sell
- **Illiquid (below 0.25)** — Very few buyers. Deals capped at SLEEP tier regardless of profit

---

## Live Dashboard

A real-time web interface for monitoring and acting on deals.

### Deal Feed

- Vertical list of deals, newest first
- Each deal shows: card image, name, set, eBay price vs. market price, profit (GBP and percentage), tier badge, condition pill, liquidity grade, confidence bar, time since listed, and price trend direction
- New deals slide in at the top with animation
- "Fresh Heat" indicator when new deals arrive while scrolled down
- GRAIL deals trigger a toast notification

### Deal Detail Panel

Clicking a deal opens a detailed sidebar showing:

- **Profit breakdown** — eBay price, shipping, fees, total cost, market value in USD and GBP, net profit
- **Match confidence** — Per-signal breakdown (name, number, denomination, expansion, variant, extraction quality)
- **Liquidity assessment** — Per-signal bars with scores
- **Condition comps** — Real market prices for all conditions (NM through DM) plus graded prices when available
- **Price trends** — Real price movements across all time windows
- **Expansion info** — Logo, set name, release date, card count
- **Card metadata** — Rarity, supertype, artist
- **Quick action** — "Snag on eBay" button linking directly to the listing
- **Accuracy feedback** — Mark deals as correct or incorrect with reason selection

### Filter Bar

Instant client-side filtering by tier, condition, liquidity grade, confidence level, time window, minimum profit percentage, and graded/ungraded toggle. Filter defaults are saveable.

### System Status Bar

Always-visible footer showing:

- Scanner status (running, paused, stopped) with last scan time
- Today's deal count with GRAIL and HIT tallies
- 7-day accuracy percentage
- eBay API budget usage
- Scrydex credit usage
- Card index size and last sync time

### Real-Time Updates

The dashboard receives live updates via Server-Sent Events — no polling. Supports automatic reconnection with event replay so no deals are missed.

---

## Manual Lookup Tool

Paste any eBay URL to evaluate it through the full pipeline instantly.

- Opens a modal overlay with a single text input
- Fetches the full eBay listing, extracts signals, matches against the database, and calculates profit and liquidity
- Returns the same detailed breakdown as a scanned deal
- Includes a debug panel showing raw eBay data, all match candidates with scores, and signal extraction details
- Actions: open on eBay, mark as correct/incorrect for accuracy corpus

---

## Public Card Catalog

The entire synced card database is exposed as a public, browsable catalog — no login required.

### Expansion Browser

- Browse all ~350 English Pokemon expansions grouped by series
- Each expansion shows logo, name, code, card count, and release date
- Sortable by release date, name, or card count

### Card Browsing

- Visual grid of card thumbnails within each expansion
- Optional list view sortable by price, trend, number, or name
- Responsive layout (4 columns on desktop, 2 on mobile)

### Card Detail

- Large card image with variant selector tabs
- Per-condition pricing table (NM through DM) with low and market values
- Graded prices when available (PSA, CGC, BGS by grade)
- Price trend charts across all time windows
- Expansion info, rarity, artist, and card metadata

### Search

- Full-text search across card names, set names, artists, and card numbers
- Fuzzy matching handles misspellings

### Trending Cards

- Discover biggest price movers (up or down)
- Filter by time period, direction, minimum price, and condition

---

## Notifications

### Telegram Deal Alerts

Real-time Telegram messages for high-value deals. Each alert includes card name, set, eBay price, market price, profit, condition, confidence, and a direct link to the eBay listing. Configurable by tier (GRAIL only, GRAIL + HIT, or all tiers). 30-second cooldown prevents spam during large scan batches.

### System Alerts

Automated warnings for operational issues:

- Sync failures
- Scrydex credit thresholds (low and critical)
- eBay rate limiting
- Stale exchange rate (>4 hours old)
- Accuracy drops (7-day rolling below 80%)
- Stale card index (no sync in >48 hours)

---

## Data Synchronisation

### Card Database (via Scrydex)

- **~350 expansions**, **~35,000 cards**, **~70,000 card variants** synced with full pricing and trend data
- Prices stored per condition (NM/LP/MP/HP) with both low and market values
- Graded prices stored separately (PSA 10, CGC 9.5, BGS 9, etc.)
- Trend data across 6 time windows (1d, 7d, 14d, 30d, 90d, 180d) for both raw conditions and graded tiers

### Sync Schedule

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Full sync | Weekly (Sunday 03:00) | Complete catalog refresh |
| Hot refresh | Daily (03:00) | Re-sync 10 most recent expansions |
| Expansion check | Daily (04:00) | Detect newly released sets |
| Velocity pre-fetch | Weekly (Sunday 05:00) | Cache sales data for top 200 cards |

### Exchange Rate

USD → GBP exchange rate fetched hourly. No deals are created if the rate is stale (>6 hours). The boot sequence requires a fresh rate before starting the scanner.

---

## Budget Management

### eBay API

- 5,000 daily API calls
- ~288 search calls/day (one per 5-minute cycle)
- ~2,880 enrichment calls/day (~10 per cycle)
- 37% daily headroom. Enrichment threshold tightens automatically when budget runs low

### Scrydex Credits

- 50,000 monthly budget
- Full sync: ~400 credits. Weekly refresh: ~400. Daily hot refresh: ~50
- Typical monthly usage: ~2,500 credits (5% of budget)
- Sales velocity lookups: 3 credits each, cached 7 days

---

## Accuracy Tracking

- Every deal can be marked as correct or incorrect by the user
- Incorrect matches include a reason: wrong card, wrong set, wrong variant, or wrong price
- 7-day rolling accuracy metric displayed in the status bar
- All match signals stored in the deal record for audit and future improvement

---

## Security

- Single-password authentication with session cookies (7-day expiry)
- API keys encrypted at rest (AES-256-GCM)
- Input validation via Zod schemas on all endpoints
- Parameterised SQL queries (no string interpolation)
- Security headers via Helmet
- Public catalog endpoints require no authentication
- All deal and system endpoints require authentication

---

## Deployment

- Hosted on Railway with automatic deploys from GitHub
- PostgreSQL database (Railway-managed)
- Automatic database migrations on boot
- Configuration validated at startup — fails fast on missing environment variables
- Graceful shutdown: completes in-flight scans, flushes pending writes, closes connections
