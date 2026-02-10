# PokeSnipe Frontend Design Specification — Final Production Build

> **Status:** Production-ready specification
> **Supersedes:** `FRONTEND_DESIGN_SPEC.md`
> **Pairs with:** `BACKEND_DESIGN_SPEC_FINAL.md`

---

## Table of Contents

1. [User Goals & Modes](#1-user-goals--modes)
2. [Dashboard — Deal Feed](#2-dashboard--deal-feed)
3. [Dashboard — Deal Detail Panel](#3-dashboard--deal-detail-panel)
4. [Dashboard — Filter Bar](#4-dashboard--filter-bar)
5. [Dashboard — System Status Footer](#5-dashboard--system-status-footer)
6. [Manual Lookup Tool](#6-manual-lookup-tool)
7. [Card Catalog](#7-card-catalog)
8. [Notifications](#8-notifications)
9. [Settings](#9-settings)
10. [Authentication](#10-authentication)
11. [Layout & Responsive Behavior](#11-layout--responsive-behavior)
12. [Visual Design System](#12-visual-design-system)
13. [Data Flow & SSE Lifecycle](#13-data-flow--sse-lifecycle)
14. [Frontend Testing](#14-frontend-testing)
15. [Deployment](#15-deployment)

---

## 1. User Goals & Modes

Four modes of operation, in order of frequency:

1. **Scan & Act (50%)** — Monitor incoming deals, evaluate in seconds, click through to buy on eBay. Speed is everything.
2. **Investigate (20%)** — Paste an eBay URL to manually evaluate. Quick price check while browsing eBay independently.
3. **Browse Catalog (20%)** — Explore the card catalog for price research, trending cards, set browsing. The full Scrydex card index as a browsable product.
4. **Monitor (10%)** — Glance at system health: scanner running, syncs current, card index healthy. Takes <2 seconds.

---

## 2. Dashboard — Deal Feed

### Primary Surface — 70% of Dashboard Screen Time

A live-updating vertical list of arbitrage opportunities, newest first.

#### Deal Card Fields

| Field | Purpose | Visual Treatment |
|-------|---------|-----------------|
| **Card image + tier badge** | Instant visual ID + deal quality | 48x67px thumbnail, type-color stripe at top edge, tier pill badge at bottom-left |
| **Card name + number** | Primary identifier | 14px/700 weight, `--tMax` color. Number in muted 12px |
| **Expansion name + code** | Context | 12px, `--tMut` color, dot-separated |
| **eBay price → Market price** | Cost vs value at a glance | DM Mono 11px, arrow separator |
| **Profit (GBP + %)** | The reason to act | 22px/800, `--greenB` with text-shadow glow. Percentage in DM Mono 11px below |
| **Confidence bar** | Trust level | 3px tall, 64px wide, color-coded (green ≥0.85, amber ≥0.65, red below) |
| **Liquidity pill** | Can you flip this quickly? | "HIGH" (green) / "MED" (amber) / "LOW" (orange) / "ILLIQ" (red, dimmed) |
| **Condition pill** | NM / LP / MP / HP | Color-coded (NM green, LP amber, MP orange, HP red) |
| **Graded badge** | PSA/CGC/BGS grade | Blue pill with grade text, only shown if `is_graded: true` |
| **Time listed** | Urgency signal | DM Mono 10px, turns red after 60 minutes |
| **Price trend** | Card rising or falling? | DM Mono 10px, arrow (↑/↓/→) + percentage, green/red/grey. **Real trend data from Scrydex** |

#### Deal Tiers

| Tier | Label | Criteria | Visual |
|------|-------|----------|--------|
| **GRAIL** | G | >40% profit + high confidence + high liquidity | Gradient `#ff6b35 → #ff3b6f`, strong glow, full opacity |
| **HIT** | H | 25-40% profit + high confidence | Gradient `#ffd60a → #ffaa00`, standard glow |
| **FLIP** | F | 15-25% profit + medium+ confidence | Gradient `#6b7fa0 → #4a5a78`, subtle |
| **SLEEP** | S | 5-15% profit | Gradient `#3a4060 → #2a3050`, row at 35% opacity |

Liquidity affects tier: illiquid → capped at SLEEP, low → capped at FLIP, medium → GRAIL downgrades to HIT. GRAIL always implies high profit AND high liquidity.

#### Real-Time Behavior

- New deals slide in at top with `fadeSlide` animation (staggered 30ms/row, max 300ms)
- Feed does NOT auto-scroll — user controls position
- "FRESH HEAT ↑" pill appears if scrolled down and new items arrive
- GRAIL deals trigger a toast notification (top-right, auto-dismiss 5s)

#### Data Source

- **Initial load:** `GET /api/deals?limit=50&sort=-createdAt`
- **Real-time:** SSE `GET /api/deals/stream` → `event: deal` messages
- **Filtering:** Client-side against in-memory list (instant, no round-trip)
- **Reconnection:** EventSource auto-reconnects with `Last-Event-Id` replay

---

## 3. Dashboard — Deal Detail Panel

Clicking a deal opens a **right-side panel** (440px fixed width). Feed stays visible on the left. Empty state shows PokeBall icon + "SELECT A DEAL / TO INSPECT".

Full detail fetched via `GET /api/deals/:dealId`.

### Panel Sections

#### 3.1 Header + Images

- Sticky header: tier badge (large), card name, close button
- Side-by-side images: Scrydex reference + eBay listing (5:7 ratio, glass background)
- Card info: name + number (20px/800), expansion with logo, condition pill, liquidity pill
- If graded: grading company + grade badge (e.g., "PSA 10 GEM MINT")

#### 3.2 Profit Hero

The dominant visual element:

- `GradBorder` wrapper with gradient
- Profit at 42px/800 weight, `--greenB`, text-shadow glow
- Percentage + tier context: "+XX% · GRAIL territory" / "Solid hit" / "Quick flip" / "Sleeper"
- Tagline: "No BS profit · Fees included"

#### 3.3 CTA Button

"SNAG ON EBAY →" — full width, gradient `#34d399 → #2dd4bf`, 800 weight

#### 3.4 NO BS PRICING

Clean, simple breakdown — fees are included in the total, no detailed tier breakdown needed:

```
eBay price     £12.50
Shipping       £1.99
Fees (inc.)    £0.98
─────────────────────────────
Total cost     £15.47

Market (USD)   $57.00
FX rate        ×0.789
Market (GBP)   £44.97
┌─────────────────────────────┐
│ Profit    +£29.50 (+190%)   │
└─────────────────────────────┘
```

Buyer Protection fee is calculated on the backend and included as a single "Fees (inc.)" line. No need for tiered sub-rows — just show the total fee amount.

#### 3.5 MATCH CONFIDENCE

- Composite score: 30px/800, colored by value, text-shadow glow
- Per-field bars (grid: 66px label | flex bar | 38px value):
  - Name, Number, Denom, Expan, Variant, Extract
- Bars: 5px tall, green ≥0.85, amber ≥0.65, red <0.65

#### 3.6 LIQUIDITY — Real Data

Updated to show **real signals** instead of fabricated heuristics:

```
LIQUIDITY: [HIGH] 0.82 · COMPOSITE

Per-signal bars:
  Trend:     ████████████░░░  0.75    ← Real Scrydex trend activity (1d/7d/30d/90d)
  Prices:    ██████████░░░░░  0.50    ← Conditions priced: 2/4
  Spread:    ████████████░░░  0.80    ← Low/market ratio (tight = liquid)
  Supply:    ██████████████░  0.90    ← eBay listings for this card in scan batch
  Sold:      █████████░░░░░░  0.67    ← eBay quantitySold from listing
  Velocity:  ████████████████  0.95   ← Real: 8 sales in 7d (from Scrydex /listings)
             OR
  Velocity:  ░░░░░░░░░░░░░░░  —      [Fetch → 3cr]  (if not yet fetched)
```

When "Fetch → 3cr" is clicked:
1. Calls `GET /api/deals/:id/velocity`
2. Backend calls Scrydex `/cards/{id}/listings?days=30&source=ebay`
3. Response cached for 7 days
4. Bar fills with animation, grade may update

#### 3.7 COMPS BY CONDITION — Real Prices

**No more fabricated multipliers.** Shows actual Scrydex prices per condition:

```
COMPS BY CONDITION

       Low       Market
  ● NM  £36.00    £41.02    ← Real Scrydex NM price
    LP  £24.00    £29.97    ← Real Scrydex LP price
    MP  £14.40    £18.93    ← Real Scrydex MP price
    HP  £6.40     £9.46     ← Real Scrydex HP price

Active condition (from listing) highlighted with bullet + bold
```

If the card has graded pricing, show a "GRADED" section:

```
GRADED COMPS (if available)

  PSA 10  £160.00   £221.00
  PSA 9   £72.00    £94.68
  CGC 9.5 £80.00    £110.40
```

#### 3.8 PRICE TRENDS — Real Data

New section showing real Scrydex trend data:

```
PRICE TRENDS (NM)

  1d   +£0.39  (+1.2%)   →  ← grey (minimal movement)
  7d   +£1.58  (+4.8%)   ↑  ← green (rising)
  30d  +£3.95  (+12.1%)  ↑  ← green (strong rise)
  90d  +£6.32  (+20.0%)  ↑  ← green (strong trend)
```

Color coding: green for positive, red for negative, grey for <1% change.

#### 3.9 EXPANSION

- Logo + set name + code
- Total cards, release date, series

#### 3.10 CARD DATA

- Rarity, supertype, subtypes, artist
- Link: "View in Catalog →" links to `/catalog/cards/:id`

#### 3.11 Footer — Accuracy Actions

- "✓ Correct" / "✗ Wrong" buttons
- "Wrong" expands to reason pills: "Wrong Card", "Wrong Set", "Wrong Variant", "Wrong Price"
- If already reviewed: shows verdict with "Undo" button

---

## 4. Dashboard — Filter Bar

Dedicated filter nav bar below the header, always visible:

| Group | Label | Type | Options | Default |
|-------|-------|------|---------|---------|
| **Tier** | `TIER` | Multi-select | GRAIL / HIT / FLIP / SLEEP | GRAIL + HIT + FLIP |
| **Condition** | `COND` | Multi-select | NM / LP / MP / HP | NM + LP + MP |
| **Liquidity** | `LIQ` | Multi-select | HI / MD / LO | HI + MD |
| **Confidence** | `CONF` | Multi-select | HI / MD | HI + MD |
| **Time** | `TIME` | Single-select | 1H / 6H / 24H / ALL | 6H |
| **Min Profit** | `MIN%` | Stepper (+/-) | 0-100% | 10% |
| **Graded** | `GRADED` | Toggle | ON / OFF | OFF |

Each FilterGroup is a glass capsule with chips inside. Filters are client-side, additive (AND logic), instant.

"SAVE" button persists defaults via `PUT /api/preferences`.

---

## 5. Dashboard — System Status Footer

42px persistent footer, two-zone layout:

**Left zone — Operational stats:**
```
● Hunting · 2m ago  |  Today: 47 · 3G · 8H  |  Acc: 91% · 7d
```

**Right zone — API & Index status (hidden ≤640px):**
```
eBay [●] 1,847/5K  |  Scrydex [●] 2,340/50K  |  Index [●] 34,892 · 2h ago
```

Status dots: green (healthy), amber (degraded), red (stopped).

Data source: `GET /api/status` initial + SSE `event: status` every 30s.

---

## 6. Manual Lookup Tool

Header button opens centered overlay (580px, glass background):

1. **Input:** Auto-focused text field. Placeholder: "PASTE EBAY URL. NO BS."
2. **API call:** `POST /api/lookup` with `{ ebayUrl }` on Enter
3. **Processing:** "Fetching... Extracting... Matching..." in amber text
4. **Result:** Card info + condition/liquidity pills + profit hero (34px)
5. **Debug info (expandable):** Raw eBay data, all candidates with scores, signal extraction, conflict resolution
6. **Actions:** "Open on eBay", "Add to corpus (correct)", "Add to corpus (incorrect)", "View in Catalog"

---

## 7. Card Catalog

### 7.1 Overview

The card catalog is a **first-class product surface**, not an afterthought. Since the backend syncs the complete Scrydex card index (35,000+ cards across 350+ expansions with per-condition pricing, trends, graded prices, and images), we expose this as a fully browsable, searchable card database.

**Access:** Public — no authentication required. Available at `/catalog` route.

**Navigation:** The catalog has its own top-level navigation, accessible from the main header alongside the arbitrage dashboard.

### 7.2 Catalog Navigation

Header gains a nav switcher:

```
[🔴 PokéSnipe] [Dashboard] [Catalog] [═══ Search... ═══] [⚙] [● LIVE]
```

- **Dashboard** = arbitrage deal feed (authenticated)
- **Catalog** = public card browser (unauthenticated)
- Active tab has underline accent

### 7.3 Expansion Browser

**Route:** `/catalog` or `/catalog/expansions`

Grid of expansion cards, grouped by series (Scarlet & Violet, Sword & Shield, Sun & Moon, XY, Black & White, etc.).

Each expansion card shows:
- Expansion logo (from Scrydex CDN)
- Set name + code
- Card count
- Release date
- Series label

**Sorting:** Release date (default, newest first), name A-Z, card count
**Filtering:** By series (multi-select)

**Layout:** Responsive grid — 4 columns on desktop, 3 on tablet, 2 on mobile. Glass card surfaces with hover lift.

### 7.4 Expansion Detail

**Route:** `/catalog/expansions/:id`

**Header:**
- Expansion logo (large) + symbol
- Set name, code, series
- Card count, release date
- Set completion stats (cards with pricing data / total)

**Card Grid:**
- All cards in the expansion displayed as a visual grid
- Each card: image thumbnail (68x95px), name, number, NM market price
- Hover: card lifts, shows condition price range (NM→HP)
- Click: navigates to card detail page

**Sorting:** Number (default), name, price (high→low, low→high), trending (biggest movers)
**Filtering:** By rarity, supertype (Pokemon/Trainer/Energy), price range
**View toggle:** Grid (images) / List (table with more data columns)

### 7.5 Card Detail Page

**Route:** `/catalog/cards/:id`

**Layout:** Two-column on desktop (image left, data right), single column on mobile.

**Left Column — Card Image:**
- Large card image (from Scrydex CDN, `image_large`)
- Variant selector if multiple variants exist (tabs: Normal, Holofoil, Reverse Holo, etc.)
- Each variant can have its own image

**Right Column — Card Data:**

**Card Identity:**
```
Charizard ex
#006/197 · Obsidian Flames (sv3) · Scarlet & Violet
Rarity: Double Rare · Type: Pokémon · Stage 2, ex
Artist: PLANETA Mochizuki
```

**Pricing Table — Per Condition (Real Scrydex Data):**
```
RAW PRICES
         Low        Market
  NM     $45.00     $52.00
  LP     $30.00     $38.00
  MP     $18.00     $24.00
  HP     $8.00      $12.00
```

**Graded Prices (if available):**
```
GRADED PRICES
              Low        Market
  PSA 10      $200.00    $280.00
  PSA 9       $90.00     $120.00
  CGC 9.5     $100.00    $140.00
  BGS 9.5     $95.00     $130.00
```

**Price Trend Chart:**

Visual line chart or bar chart showing price movement across time windows for the selected condition:

```
PRICE TREND (NM Market)

  1d    +$0.50   (+1.2%)  →
  7d    +$2.00   (+4.8%)  ↑
  14d   -$1.50   (-3.5%)  ↓
  30d   +$5.00   (+12.1%) ↑
  90d   +$8.00   (+20.0%) ↑
  180d  +$12.00  (+30.5%) ↑
```

Bar visualization with green bars for positive, red for negative. Percentage labels.

**Expansion Info:**
- Logo + name + code + series
- Release date
- Total cards / printed total
- Link: "View all cards in this set →"

**Sales History (if authenticated and data cached):**
- Recent sold listings from Scrydex `/listings` endpoint
- Shows: title, price, sold date, variant, condition, graded info
- "Fetch latest sales → 3cr" button if not cached

**Related:**
- Other variants of this card (if any)
- Link back to expansion

### 7.6 Card Search

**Route:** `/catalog/search?q=charizard`

**Search bar:** Prominent, full-width on catalog pages. Same search bar in the header serves both catalog search and deal search contextually.

**Search capabilities:**
- Card name: "charizard", "pikachu vmax"
- Card number: "006/197", "#123"
- Set name: "obsidian flames", "base set"
- Artist: "Mitsuhiro Arita"

**Results:** Card grid or list view with image, name, number, set, NM market price, 7d trend.

**Powered by:** PostgreSQL `pg_trgm` GIN indexes — handles misspellings naturally ("charzard" finds "Charizard").

### 7.7 Trending Cards

**Route:** `/catalog/trending`

Surface cards with biggest price movements:

**Filters:**
- Period: 1d / 7d / 14d / 30d / 90d (default: 7d)
- Direction: Rising / Falling / Both (default: Both)
- Min price: $0 / $5 / $10 / $25 / $50 (default: $5 — filters out bulk)
- Condition: NM / LP / MP / HP (default: NM)

**Layout:** List view with columns: rank, card image, name, set, current price, price change ($), price change (%), mini trend sparkline.

Top movers get visual emphasis (larger font, green/red glow).

### 7.8 Catalog Design Language

The catalog shares the same glass morphism design system as the dashboard but with a slightly lighter visual tone for public consumption:

- Same `--bg0`, `--bg1` backgrounds
- Same glass surfaces and gradient accents
- Card images are the visual anchor (larger than in deal feed)
- Price data uses DM Mono for tabular alignment
- Trend indicators use the same green/red/grey color coding
- Responsive: cards reflow to fewer columns on smaller screens

---

## 8. Notifications

### 8.1 Telegram Integration

- GRAIL and HIT deals: instant push (configurable per tier)
- Configurable: minimum profit, minimum confidence, watched expansions
- Configuration in Settings → Notifications tab
- "Test Message" validates connection inline

### 8.2 In-App Notifications

- GRAIL deal toast: top-right, GradBorder wrapped, tier badge + name + profit, auto-dismiss 5s
- System warnings: persistent amber banner for sync failures, budget warnings
- System errors: persistent red banner for scanner stopped, API failures
- SSE reconnection: banner with pulsing dot, "Reconnecting..." → "Connection lost" + Retry

---

## 9. Settings

Gear icon in header → centered modal overlay (520px, glass background). Two tabs: **General** and **Notifications**.

**General tab:**
- Tier thresholds display (GRAIL: >40% · High confidence · High liquidity, etc.)
- Display: Currency (GBP), Fee breakdown visibility, Dark mode (ON)
- Sound: Deal alert toggle, GRAIL-only / all tiers
- Sign Out button (red text, calls `POST /auth/logout`)

**Notifications tab:**
- Telegram: Bot Token + Chat ID inputs (masked), Save + Test Message
- Alert rules: Per-tier push settings
- Thresholds: Min profit %, min confidence, watched expansions

Changes debounced (500ms), sent as partial `PUT /api/preferences`.

---

## 10. Authentication

### 10.1 Login Screen

- Background: radial gradient, centered card (360px)
- PokeBall icon (48px)
- Brand: "PokeSnipe" (28px/800), "Snipe" in `--red`
- Tagline: "No BS Arbitrage" (DM Mono 10px)
- Password input (glass, 48px height)
- Submit button (glass, 48px, 700 weight)
- Footer: "PRIVATE DASHBOARD · PASSWORD PROTECTED"

### 10.2 Session Flow

1. `GET /api/status` → 401 → show login
2. `POST /auth/login { password }` → session cookie (httpOnly, 7-day)
3. All subsequent requests include cookie automatically
4. SSE auth via same-origin cookie (no query token needed)
5. 401 on any request → redirect to login

### 10.3 Catalog Access

The card catalog (`/catalog/*`) does NOT require authentication. It is publicly accessible. The dashboard (`/`, `/deals/*`) requires authentication.

---

## 11. Layout & Responsive Behavior

### 11.1 Desktop Layout

```
┌───────────────────────────────────────────────────────────────────┐
│  HEADER (58px)                                        gradient    │
│  [🔴 PokéSnipe] [Dashboard][Catalog] [Search...] [Lookup][⚙][●] │
├───────────────────────────────────────────────────────────────────┤
│  FILTER BAR (44px) — dashboard only                               │
│  [Tier: G H F S] [Cond: NM LP MP HP] [Liq: HI MD LO] ...  SAVE │
├──────────────────────────────────┬────────────────────────────────┤
│  DEAL FEED (flex, scrollable)    │  DETAIL PANEL (440px)          │
│  or CATALOG CONTENT              │  (dashboard only)              │
│                                  │                                │
├──────────────────────────────────┴────────────────────────────────┤
│  FOOTER (42px)                                        gradient    │
│  ● Hunting 2m │ 47 3G 8H │ Acc 91%   eBay 1,847/5K │ Index 34K │
└───────────────────────────────────────────────────────────────────┘
```

### 11.2 Responsive Breakpoints

**≤920px:**
- Detail panel → fixed bottom sheet (75vh, rounded top corners)
- Deal row meta columns → single-line compact pills
- Catalog grid → 2 columns

**≤640px:**
- Card images in deal feed hide
- Expansion subtitle hides
- Several filter groups hide (Liq, Time, Conf, Graded)
- Footer API section hides
- Catalog grid → 1-2 columns
- Catalog card detail → single column

### 11.3 Dimensions

- Header: 58px fixed, three-zone grid
- Filter bar: ~44px, always visible on dashboard
- Deal feed: flex: 1, scrollable
- Detail panel: 440px fixed, independent scroll
- Footer: 42px fixed

---

## 12. Visual Design System

### 12.1 Theme

Professional, dense, information-rich. Bloomberg terminal meets modern fintech. Not playful despite Pokemon subject matter.

### 12.2 Glass Morphism

- Glass surfaces: `backdrop-filter: blur(16-20px)` with `rgba(255,255,255,0.035)`
- Gradient borders: `GradBorder` component (1px padding trick)
- Gradient accents: Header/footer rainbow line `#34d399 → #60a5fa → #c084fc → #ff6b6b`

### 12.3 Color Palette

| Element | Variable | Value |
|---------|----------|-------|
| Background (deepest) | `--bg0` | `#070a12` |
| Background (L1) | `--bg1` | `#0c1019` |
| Background (L2) | `--bg2` | `rgba(14,19,32,0.75)` |
| Glass surface | `--glass` | `rgba(255,255,255,0.035)` |
| Glass (hover) | `--glass2` | `rgba(255,255,255,0.055)` |
| Border (default) | `--brd` | `rgba(255,255,255,0.055)` |
| Text (maximum) | `--tMax` | `#f4f6f9` |
| Text (primary) | `--tPri` | `#dce1eb` |
| Text (secondary) | `--tSec` | `#8290a8` |
| Text (muted) | `--tMut` | `#4d5a72` |
| Green | `--green` | `#34d399` |
| Green (bright) | `--greenB` | `#6ee7b7` |
| Red | `--red` | `#f87171` |
| Amber | `--amber` | `#fbbf24` |
| Blue | `--blue` | `#60a5fa` |
| Purple | `--purple` | `#c084fc` |

### 12.4 Typography

- Display/body: `'Plus Jakarta Sans', system-ui, sans-serif` — weights 300-800
- Monospace: `'DM Mono', monospace` — weights 400, 500
- Card name: 14px/700
- Profit (feed): 22px/800 with glow
- Profit (detail): 42px/800 with glow
- Section headers: DM Mono 9px uppercase, letter-spacing 2.5
- All prices/numbers: monospace for tabular alignment

### 12.5 Visual Priority (heaviest first)

1. **Profit figures** — Green numbers with glow, largest elements
2. **Tier badge** — Gradient pill on card image
3. **Card image** — Instant visual recognition
4. **Card name** — 14px/700, secondary to profit
5. **Confidence bar** — Peripheral, 3px, absorb without reading
6. **Liquidity pill** — Same weight as confidence
7. **Everything else** — Condition, time, trend, expansion

### 12.6 Component Library

```
FilterGroup    — Glass capsule container with label + chips
Seg / TierSeg  — Selectable chip with color-coded active state
Stepper        — −/+ buttons flanking numeric input
GradBorder     — Gradient border wrapper (1px padding trick)
PokeBall       — Minimal wireframe icon
Bar / BarRow   — Horizontal fill bar for confidence/liquidity
TierBadge      — Gradient pill with tier letter
CondPill       — Condition-colored text pill
LiqPill        — Liquidity-colored text pill
TrendArrow     — ↑/↓/→ with percentage, colored
Toast          — Fixed top-right notification
SSEBanner      — Connection status banner
CardGrid       — Responsive card image grid (catalog)
PriceTable     — Tabular price display per condition
TrendChart     — Bar/sparkline for price trends
ExpansionCard  — Glass card with logo, name, card count
```

---

## 13. Data Flow & SSE Lifecycle

### 13.1 Dashboard Page Load

```
1. Test session: GET /api/status → 200 or 401
2. Parallel fetch:
   ├── GET /api/deals?limit=50
   ├── GET /api/status
   └── GET /api/preferences
3. Open SSE: GET /api/deals/stream
   ├── event: deal   → Append to feed, apply filters
   ├── event: status → Update footer
   └── event: ping   → Keepalive
4. Dashboard is live
```

### 13.2 Catalog Page Load

```
1. GET /api/catalog/expansions (no auth needed)
2. User navigates:
   ├── Click expansion → GET /api/catalog/expansions/:id
   ├── Click card      → GET /api/catalog/cards/:id
   ├── Search          → GET /api/catalog/cards/search?q=...
   └── Trending        → GET /api/catalog/trending?period=7d
```

### 13.3 SSE Lifecycle

```
Connected → disconnect (network/redeploy) → Reconnecting (auto-retry with Last-Event-Id) → Connected
```

- ≤30s disconnect: amber "Reconnecting..." banner
- >30s: red "Connection lost" + Retry button
- Header pill: pulsing green dot + "LIVE" when connected

### 13.4 User Action → API Mapping

| Action | API Call |
|--------|---------|
| Sign in | `POST /auth/login { password }` |
| Sign out | `POST /auth/logout` |
| Open dashboard | `GET /api/status` + `GET /api/deals` + `GET /api/preferences` |
| Stream deals | `GET /api/deals/stream` (SSE) |
| Click deal | `GET /api/deals/:id` |
| Mark correct | `POST /api/deals/:id/review { isCorrectMatch: true }` |
| Mark wrong | `POST /api/deals/:id/review { isCorrectMatch: false, reason: "..." }` |
| Fetch velocity | `GET /api/deals/:id/velocity` |
| Paste eBay URL | `POST /api/lookup { ebayUrl }` |
| Change filter | None — client-side |
| Save filter | `PUT /api/preferences { defaultFilters }` |
| Browse expansions | `GET /api/catalog/expansions` |
| View expansion | `GET /api/catalog/expansions/:id` |
| View card | `GET /api/catalog/cards/:id` |
| Search cards | `GET /api/catalog/cards/search?q=...` |
| View trending | `GET /api/catalog/trending?period=7d` |

---

## 14. Frontend Testing

### 14.1 Component Tests (Vitest + Testing Library)

Test critical UI components in isolation:

- **DealFeed:** Sorted by tier then profit, client-side filters, "FRESH HEAT" pill, GRAIL glow, SLEEP opacity
- **PriceBreakdown:** Total cost with fees included, condition-specific real pricing, profit calculation
- **LoginPage:** Password input, submit, error handling, redirect
- **LiquidityBreakdown:** Real signal bars, velocity fetch button, grade updates
- **TrendDisplay:** Real trend data arrows and percentages, color coding
- **CardDetail (catalog):** All condition prices, graded prices, trend charts, variant selector
- **ExpansionGrid (catalog):** Responsive grid, sorting, filtering

### 14.2 SSE Integration Tests

- Append new deals on SSE event
- Update status bar on SSE status event
- Show reconnecting banner after 30s disconnect
- Resume normally after reconnection

### 14.3 Catalog Tests

- **Search:** Query sends correct API params, results render with images and prices
- **Expansion browser:** Grid renders all expansions, series grouping works
- **Card detail:** All sections render with real pricing data, variant selector switches prices
- **Trending:** Period/direction filters update results

### 14.4 What NOT to Test

- API response shapes (backend tests cover this)
- CSS visual regression (manual review for v1)
- Full E2E browser tests (deferred to v2)

---

## 15. Deployment

### 15.1 Single Service

Frontend is a static SPA served by the same Railway Node.js service:

```
pokesnipe (Railway)
├── Backend: Express API on PORT
│   ├── /auth/*          → Login/logout
│   ├── /api/*           → REST + SSE (authenticated)
│   └── /api/catalog/*   → Public card catalog API
├── Frontend: Static files from /dist
│   ├── index.html       → SPA shell
│   ├── assets/          → JS bundles, CSS, fonts
│   └── Catch-all        → index.html (client-side routing)
└── SSR: Catalog card pages for SEO
    └── /catalog/*       → Pre-rendered HTML for crawlers
```

### 15.2 Routing

- `/` → Dashboard (SPA, requires auth)
- `/catalog/*` → Card catalog (SPA for logged-in users, SSR for crawlers)
- `/api/*` → Backend API

### 15.3 Build Pipeline

```
GitHub push to main → Railway auto-deploy
  → Multi-stage Docker: build frontend (Vite) + backend (TypeScript)
  → Production image serves static + API from same process
  → No CORS needed (same origin)
```

---

## What NOT to Include in v1

- Collection tracking / portfolio features
- Historical deal analytics / "deals I've bought" tracking
- Multi-user dashboards
- Mobile app (responsive web is sufficient)
- Card price alerts / watchlists (catalog provides the foundation for v2)
- Social features, sharing, community
- Onboarding / tutorial (interface should be self-evident)
