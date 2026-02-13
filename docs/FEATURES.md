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

### Junk Detection

Two-stage junk filtering prevents non-card and low-quality listings from entering the pipeline:

**Title-based (Phase 1):** Pattern matching against the cleaned title to detect bulk lots, fakes/proxies, non-card products (booster boxes, tins, sleeves, playmats, code cards), and non-English text (Unicode character ranges for Japanese, Korean, Chinese scripts, plus language keywords like "japanese", "french", "german").

**Description-based (Phase 2):** After enrichment fetches the full eBay item details, the description HTML is stripped of tags, collapsed, and scanned for fake/fan-art signals. Only fake patterns are checked at this stage — words like "booster" or "bundle" appear legitimately in seller marketing copy and would cause false positives.

### Foreign Card Filtering

All listings are filtered to English-only cards through multiple layers:

- **eBay search filter:** Queries are restricted to `itemLocationCountry:GB` and `deliveryCountry:GB`, limiting results to UK-based sellers
- **Title detection:** Junk detector catches language keywords (japanese, korean, french, etc.) and non-Latin Unicode characters (Hiragana, Katakana, CJK, Hangul) in the listing title
- **Structured language data:** After signal extraction, the eBay-reported language field is checked — cards where the language doesn't start with "English" are rejected

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

Confidence weights are not fixed — they are automatically calibrated based on user feedback (see [Feedback Learning](#feedback-learning)).

### Variant Resolution

Correctly distinguishes between card variants (holofoil vs. reverse holo vs. 1st edition). When multiple variants exist, defaults to the cheapest to ensure a conservative profit estimate.

### Confusion Pair Awareness

When a user marks a deal as incorrectly matched (`wrong_card`, `wrong_set`, or `wrong_variant`), the system records the card number and the wrongly-matched card as a confusion pair. On future matches:

- **Penalty (–0.15):** Candidates that previously caused an incorrect match receive a confidence penalty
- **Boost (+0.10):** If the reviewer provided the correct card ID, that candidate receives a confidence boost

Only match-related review reasons trigger confusion pairs — condition or price issues don't indicate a matching error.

### Learned Junk Scoring

The system learns from user-reported junk listings and applies soft confidence penalties to future listings showing similar signals:

- **Learned keywords:** When a listing is reported as junk, novel tokens (words not found in the card catalog or common stop words) are extracted from the title and stored. Future listings containing these tokens receive a confidence penalty of 0.15.
- **Seller reputation:** Sellers with 3 or more junk reports receive a scaled penalty (0.05 per report, capped at 0.20). A seller with 5 junk reports gets a 0.15 penalty; one with 7+ gets the maximum 0.20.

These are soft penalties subtracted from the confidence composite, not hard blocks. A genuinely good deal with strong match signals can overcome them. Caches refresh every 30 minutes.

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
- USD → GBP exchange rate conversion (refreshed every 4 hours)

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

### On-Demand Velocity Refresh

Users can manually refresh Tier 3 velocity data for any specific deal's card via the deal detail panel. This costs 3 Scrydex credits, updates the deal's liquidity score and grade in real-time, and the result is cached for 7 days.

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
- **Accuracy feedback** — Mark deals as correct or incorrect with reason selection and optional correct card ID

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

Real-time Telegram messages for high-value deals. Each alert includes card name, set, eBay price, market price, profit, condition, confidence, and a direct link to the eBay listing. Configurable by tier (GRAIL only, GRAIL + HIT, or all tiers). 30-second cooldown prevents spam during large scan batches. A test message endpoint verifies that Telegram credentials are correctly configured.

### System Alerts

Automated warnings for operational issues:

- Sync failures
- Scrydex credit thresholds (low and critical)
- eBay rate limiting (3+ consecutive 429 responses)
- Stale exchange rate (>4 hours old)
- Accuracy drops (7-day rolling below 80%, minimum 10 reviewed deals)
- Stale card index (no sync in >48 hours)

---

## Deal Lifecycle

Deals move through a defined lifecycle to keep the feed current and manage storage.

### Status Flow

- **Active** — Visible in the deal feed. Created when the scanner identifies a profitable listing.
- **Reviewed** — User marked the deal as incorrect. Removed from the active feed but preserved for accuracy tracking.
- **Expired** — Automatically set when a deal passes its 72-hour expiry window. No longer shown in the feed.

### Automatic Expiry

Active deals expire 72 hours after creation. An hourly background job checks for deals past their `expires_at` timestamp and transitions them to expired status.

### Pruning

Unreviewed deals older than 30 days are permanently deleted by the hourly cleanup job. Reviewed deals (whether correct or incorrect) are kept indefinitely — they form the accuracy tracking corpus used for confidence calibration.

---

## Feedback Learning

The system learns from user reviews to improve matching accuracy over time. Three feedback mechanisms work together.

### Confusion Pairs

When a deal is reviewed as `wrong_card`, `wrong_set`, or `wrong_variant`, the card number and incorrectly matched card ID are recorded as a confusion pair. If the reviewer provides the correct card ID, it's stored as a correction. The matching engine queries these pairs during candidate scoring and applies penalties (–0.15) to previously confused cards and boosts (+0.10) to known corrections.

### Learned Junk Keywords

When a deal is reported as a junk listing, novel tokens are extracted from the eBay title by subtracting known card names, expansion names, common Pokemon TCG terminology, and standard eBay listing words. The remaining tokens — words unique to junk listings — are stored and matched against future listings. Sellers accumulating 3+ junk reports receive an additional scaled penalty.

### Confidence Weight Calibration

The confidence scorer uses 6 weighted signals. Rather than relying solely on hand-tuned weights, the system can learn better weights from reviewed deals:

- **Calibration runs daily at 05:00** or can be triggered manually via API
- **Signal separation analysis:** Computes the mean score of each signal for correct vs. incorrect matches. Signals with higher separation (high scores on correct matches, low on incorrect) get more weight.
- **Reason-aware penalties:** Groups incorrect deals by review reason and applies targeted adjustments. For example, if many `wrong_set` errors have high expansion and denominator signal scores (misleadingly confident), those signals receive a downward adjustment.
- **Safety constraints:** Weights can drift at most ±0.10 from spec defaults, with a minimum weight of 0.03 per signal. Weights are renormalized to sum to 1.0.
- **Improvement gate:** New weights are only applied if they improve accuracy on the review corpus by more than 0.5%. If not, the current weights are kept.
- **Minimum sample:** Requires at least 20 reviewed deals (including at least 3 incorrect) before calibration runs.

Default signal weights: name (0.30), denominator (0.25), number (0.15), expansion (0.10), variant (0.10), normalization (0.10).

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

USD → GBP exchange rate fetched every 4 hours. No deals are created if the rate is stale (>4 hours). The boot sequence requires a fresh rate before starting the scanner.

---

## Background Jobs

All background jobs are managed by a central scheduler. Each job logs audit events to the `sync_log` table for observability.

| Job | Schedule | Purpose |
|-----|----------|---------|
| `ebay-scan` | Every 5 min | Search eBay and create deals |
| `deal-cleanup` | Every hour | Expire old deals + prune unreviewed stale deals |
| `exchange-rate` | Every 4h (:30) | Refresh GBP/USD exchange rate |
| `hot-refresh` | Daily at 03:00 | Re-sync 10 most recent expansions |
| `expansion-check` | Daily at 04:00 | Detect and sync new expansions |
| `weight-calibration` | Daily at 05:00 | Calibrate confidence weights from reviewed deals |
| `full-sync` | Weekly (Sunday 03:00) | Full card database re-sync |
| `velocity-prefetch` | Weekly (Sunday 05:00) | Cache velocity for top 200 matched cards |
| `accuracy-check` | Every 6 hours | Alert if 7-day accuracy drops below 80% |
| `card-index-check` | Every 12 hours | Alert if no sync in >48 hours |

### Audit Logging

Every background job persists its results to the `sync_log` table — job type, status, duration, counts of items processed (expansions synced, cards upserted, variants upserted, deals created, listings processed, enrichment calls), and error details. These logs are viewable via the Audit view in the dashboard.

### Scanner State Persistence

When the scanner is paused or resumed via the API, the state is persisted to the preferences table. On application restart, the scanner restores its previous paused/running state automatically.

---

## Budget Management

### eBay API

- 5,000 daily API calls
- ~288 search calls/day (one per 5-minute cycle)
- ~2,880 enrichment calls/day (~10 per cycle)
- 37% daily headroom. Enrichment threshold tightens automatically when budget runs low

### eBay Rate Limiting

The eBay client tracks consecutive 429 (rate limit) responses and implements exponential backoff using the `Retry-After` header (or a 5-second default). After 3 consecutive 429s, a Telegram alert is sent. The counter resets on the next successful request.

### Scrydex Credits

- 50,000 monthly budget
- Full sync: ~400 credits. Weekly refresh: ~400. Daily hot refresh: ~50
- Typical monthly usage: ~2,500 credits (5% of budget)
- Sales velocity lookups: 3 credits each, cached 7 days
- Overage status fetched from Scrydex API and displayed in the system status bar

---

## Accuracy Tracking

- Every deal can be marked as correct or incorrect by the user
- Incorrect matches include a reason: `wrong_card`, `wrong_set`, `wrong_variant`, `wrong_condition`, `wrong_price`, `bad_image`, or `junk_listing`
- Reviewers can optionally provide the correct card ID when reporting `wrong_card`, `wrong_set`, or `wrong_variant` — this feeds into confusion pair learning
- Marking a deal as `junk_listing` triggers learned keyword extraction and seller reputation tracking
- 7-day rolling accuracy metric displayed in the status bar, with breakdowns by incorrect reason
- Accuracy check runs every 6 hours — alerts via Telegram if accuracy drops below 80% (minimum 10 reviewed deals)
- All match signals stored in the deal record for audit and future calibration

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
- Scanner paused state restored from preferences on restart
