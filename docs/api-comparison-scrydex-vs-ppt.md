# API Comparison: Scrydex vs Pokemon Price Tracker (PPT)

## Executive Summary

**Recommendation: Switch to Pokemon Price Tracker (PPT) on the $9.99/month plan.**

PPT provides all the data PokeSnipe needs at 1/10th the cost, with significantly more generous credit
allowances, additional useful features (title parsing, population data), and data sourced directly from
TCGPlayer. The migration is non-trivial but well-scoped, and the cost savings alone ($89/month) justify
the effort.

---

## 1. Pricing & Credit Economy

### Cost Comparison

| | Scrydex | PPT Basic | PPT Pro |
|---|---|---|---|
| **Monthly cost** | $99 | $9.99 | $99 |
| **Credit allowance** | 50,000/month | 20,000/day (~600k/month) | 200,000/day (~6M/month) |
| **Effective credits/dollar** | 505/$ | 60,060/$ | 60,606/$ |

### Credit Consumption Model (Fundamentally Different)

**Scrydex**: 1 credit per API *request* regardless of result size. Fetching 100 cards in one paginated
request = 1 credit.

**PPT**: 1 credit per *card returned*. Fetching 50 cards = 50 credits. Additional credits for
history (+1/card) and eBay data (+1/card).

### Estimated PPT Credit Usage for PokeSnipe Workloads

| Activity | Frequency | Scrydex Credits | PPT Credits |
|---|---|---|---|
| Full sync (all ~23k cards + prices) | Weekly | ~230 (paginated) | ~23,000 (1/card) |
| Hot refresh (10 recent sets, ~500 cards) | Daily | ~50 | ~500 |
| Expansion/set check | Daily | ~1 | ~1 (sets endpoint) |
| Velocity/eBay data (200 cards) | Weekly | 600 (3/listing call) | 400 (2/card: base+eBay) |
| On-demand velocity (user clicks, ~50/mo) | Ad-hoc | 150 | 100 |
| **Monthly total (est.)** | | **~1,860** | **~30,000** |

PPT uses more credits due to per-card billing, but the $9.99 plan provides 20,000 credits/day.
The heaviest operation (full sync at ~23k credits) can be spread across 2 days with room to spare.
Daily operations use ~500-1,000 credits/day, well under the 20k limit.

**Bottom line**: $9.99/month PPT plan covers all workloads with ~94% daily headroom on non-sync days.

---

## 2. Feature Comparison

### Data Coverage

| Feature | Scrydex | PPT | Winner |
|---|---|---|---|
| Card metadata (name, number, rarity, types, artist) | Yes | Yes | Tie |
| Card images (multiple sizes) | Yes (small/med/large) | Yes (200/400/800px CDN) | Tie |
| Raw pricing by condition (NM, LP, MP, HP) | Yes (NM/LP/MP/HP/DM) | Yes (Near Mint, LP, MP, HP, Damaged) | Tie |
| Graded pricing (PSA, CGC, BGS, SGC) | Yes (embedded in card variants) | Yes (via eBay data + population endpoint) | Scrydex slightly (inline) |
| Price trends (1d, 7d, 30d, etc.) | Yes (1d/7d/14d/30d/90d/180d built-in) | Requires client-side calculation from history | **Scrydex** |
| Price history (time series) | Yes (3 credits/call) | Yes (+1 credit/card, gap-filling interpolation) | **PPT** (interpolation) |
| Sold eBay listings | Yes (`/cards/{id}/listings`, 3 credits) | Yes (`includeEbay=true`, +1 credit/card) | Tie (different formats) |
| Sealed products | Yes | Yes | Tie |
| Japanese cards | Yes (language path scoping) | Yes (language query param) | Tie |
| Set/expansion listing | Yes | Yes | Tie |

### Unique to PPT (Not Available in Scrydex)

| Feature | Description | Value to PokeSnipe |
|---|---|---|
| **Title parsing** (`/parse-title`) | AI-powered eBay title parsing with fuzzy matching, confidence scores, and card suggestions | **High** - could replace or augment PokeSnipe's local card index matching, improving match accuracy |
| **Population data** (`/population`) | GemRate grading population data (PSA, CGC, BGS, SGC) with gem rates | **Medium** - useful for graded card scarcity assessment and pricing validation |
| **Multi-field search** | Search across name, setName, cardNumber, rarity, cardType simultaneously | **Medium** - simpler than Scrydex's Lucene syntax for basic searches |
| **Gap-filling interpolation** | Price history with interpolated missing data points | **Medium** - cleaner historical charts |

### Unique to Scrydex (Not Available in PPT)

| Feature | Description | Value to PokeSnipe |
|---|---|---|
| **Built-in price trends** | Pre-computed 1d/7d/14d/30d/90d/180d price changes and percentages | **Medium** - avoids client-side computation, but can be derived from PPT history |
| **Lucene search syntax** | Advanced query syntax with range searches, nested field queries, wildcards | **Low** - PokeSnipe uses expansion-scoped card fetching, not complex search queries |
| **Field selection** (`select` param) | Return only specific fields to reduce payload size | **Low** - optimization, not a core need |

---

## 3. Data Accuracy

The user reported "quirks with data accuracy" from Scrydex. Relevant observations:

**Scrydex concerns:**
- Pricing fields use `low` and `market` only for raw cards (no `mid` or `high`)
- Trend data is pre-computed server-side; calculation methodology is not documented
- Listing dates use non-standard YYYY/MM/DD format requiring client-side parsing
- No documented data freshness guarantees beyond "daily" implied by trend periods

**PPT concerns:**
- API docs have a known schema inconsistency: `PriceData` schema defines `lowPrice` but examples show
  `low` (section 7C of docs). This may indicate incomplete documentation rather than API bugs.
- Some schema fields lack `required` annotations, so field presence may be inconsistent
- API is at v2, suggesting at least one breaking change cycle
- No explicit currency/timezone policy documented

**PPT advantages for accuracy:**
- Sources data directly from TCGPlayer (the industry-standard pricing reference for Pokemon TCG)
- 23,000+ English cards with "daily price updates" explicitly stated
- Credit response headers (`X-API-Calls-Consumed`, `X-API-Calls-Breakdown`) provide transparency

**Verdict**: Without testing PPT directly, it's difficult to compare accuracy empirically.
TCGPlayer-sourced data is generally considered the gold standard for Pokemon TCG pricing.
A trial period on the $9.99 plan would allow direct comparison before committing to migration.

---

## 4. Migration Effort Assessment

### What Needs to Change

**ID System Remapping (High effort)**
- PokeSnipe uses Scrydex card IDs (e.g., `zsv10pt5-105`) as primary keys throughout
- PPT uses TCGPlayer IDs (numeric strings like `233294`)
- Database columns: `scrydex_card_id` in cards table, `card_id` FK in variants and velocity cache
- The card index matching system relies on these IDs
- Would need a mapping table or full re-key

**API Client Rewrite (Medium effort)**
- Replace `src/services/scrydex/client.ts` with PPT client
- Authentication changes: `X-Api-Key` + `X-Team-ID` headers -> `Authorization: Bearer` token
- Base URL change
- Response shape differences (PPT nests metadata differently)

**Transformer Updates (Medium effort)**
- `src/services/sync/transformers.ts` maps Scrydex-specific field names
- PPT uses different field names (e.g., `tcgPlayerId` vs `id`, `cardType` vs `supertype`)
- Price structure differs: PPT uses `condition` param on query, Scrydex nests conditions in variants
- Trend data no longer pre-computed; derive from history or remove

**Sync Service Updates (Medium effort)**
- `src/services/sync/sync-service.ts` pagination logic changes
- PPT uses offset-based pagination (limit/offset) vs Scrydex's page-based (page/page_size)
- Credit budget tracking needs updating for per-card billing model

**Velocity Fetching (Low effort)**
- `src/services/liquidity/tier3-velocity.ts` uses `/cards/{id}/listings` on Scrydex
- PPT equivalent: `/cards?tcgPlayerId=X&includeEbay=true` or possibly derive from eBay data structure
- Response format likely differs; listing object fields need remapping

**Configuration (Low effort)**
- Remove `SCRYDEX_API_KEY` and `SCRYDEX_TEAM_ID` from config
- Add PPT Bearer token
- Update rate limiter settings (PPT rate limits not documented as req/sec)

**Database Migration (Medium effort)**
- Rename `scrydex_card_id` -> `tcg_player_id` (or generic `external_card_id`)
- Re-sync all card data from PPT to populate with new IDs
- Clear velocity cache (will repopulate naturally)

### Files to Modify

| File | Changes |
|---|---|
| `src/config/index.ts` | Swap env vars |
| `src/services/scrydex/client.ts` | Full rewrite -> PPT client |
| `src/services/sync/transformers.ts` | Remap all field names and structures |
| `src/services/sync/sync-service.ts` | Update pagination, credit tracking, endpoint calls |
| `src/services/sync/batch-insert.ts` | Update column names if IDs change |
| `src/services/liquidity/tier3-velocity.ts` | Update velocity fetching endpoint and response parsing |
| `src/routes/status.ts` | Update usage/credit reporting |
| `src/routes/velocity.ts` | Minor: update references |
| `migrations/` | New migration for column renames |

---

## 5. Recommendation

### Switch to PPT $9.99/month plan

**Financial case:**
- Saves $89/month ($1,068/year)
- 12x more total credits available (600k/month vs 50k/month)
- Daily credit resets prevent monthly budget anxiety

**Feature case:**
- Title parsing endpoint (`/parse-title`) directly addresses PokeSnipe's core matching challenge -
  could improve deal detection accuracy
- Population data adds a new signal for graded card arbitrage
- TCGPlayer-sourced pricing is industry standard
- Gap-filling interpolation provides cleaner history data

**Risk mitigation:**
- Start with $9.99 plan as a trial alongside Scrydex (total cost: $109/month during overlap)
- Validate data accuracy and API reliability before full migration
- Build PPT client as a parallel data source, then cut over once validated

**What you lose:**
- Pre-computed price trends (must calculate client-side from history, ~20 lines of code)
- Lucene search syntax (not currently used for core functionality)
- Scrydex's generous per-request credit model (PPT's per-card model uses more credits, but the
  allowance is large enough that this doesn't matter)

### If staying at $99/month: Switch to PPT Pro

If you later need higher throughput (e.g., more frequent syncs, real-time monitoring), the PPT Pro
plan at $99/month provides 200,000 credits/day (vs Scrydex's 50,000/month) - that's 120x more credits
for the same price, plus all the additional PPT features.
